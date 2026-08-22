/* eslint-env node */
import admin from 'firebase-admin';
import { db } from './firebaseAdmin.js';

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Sadece GET veya POST kabul edilir' });
    }

    const data = { ...req.query, ...(req.body || {}) };
    const EXPECTED_TOKEN = process.env.TRACKER_TOKEN || "inaner123"; 
    
    if (data.token !== EXPECTED_TOKEN) {
        return res.status(401).json({ error: 'Yetkisiz islem. Gecersiz token.' });
    }

    try {
        let lat, lon, speed, altitude, timestampStr, deviceId;

        // 1. Traccar OsmAnd formatı (URL Query veya düz JSON)
        if (data.lat !== undefined && data.lon !== undefined) {
            lat = parseFloat(data.lat);
            lon = parseFloat(data.lon);
            speed = parseFloat(data.speed) || 0;
            altitude = parseFloat(data.altitude) || 0;
            timestampStr = data.timestamp;
            deviceId = data.id || data.device_id || 'Bilinmeyen_Cihaz';
        } 
        // 2. iOS Traccar (TSLocationManager) Varsayılan JSON formatı (root property: location)
        else if (data.location && data.location.coords) {
            lat = parseFloat(data.location.coords.latitude);
            lon = parseFloat(data.location.coords.longitude);
            const rawSpeed = parseFloat(data.location.coords.speed);
            speed = (!isNaN(rawSpeed) && rawSpeed > 0) ? rawSpeed * 1.943844 : 0;
            altitude = parseFloat(data.location.coords.altitude) || 0;
            timestampStr = data.location.timestamp;
            // params içindeki device_id'yi de alalım
            deviceId = data.device_id || data.location.device_id || data.id || 'Bilinmeyen_Cihaz';
        }
        // 3. iOS Traccar (TSLocationManager) Custom Template JSON formatı
        else if (data.coords) {
            lat = parseFloat(data.coords.latitude);
            lon = parseFloat(data.coords.longitude);
            const rawSpeed = parseFloat(data.coords.speed);
            speed = (!isNaN(rawSpeed) && rawSpeed > 0) ? rawSpeed * 1.943844 : 0;
            altitude = parseFloat(data.coords.altitude) || 0;
            timestampStr = data.timestamp;
            deviceId = data.device_id || data.id || 'Bilinmeyen_Cihaz';
        } else {
             console.error("Gelen veri formati anlasilamadi:", data);
             return res.status(400).json({ error: 'Gecersiz enlem (lat) veya boylam (lon) verisi. Format anlasilamadi.' });
        }

        if (isNaN(lat) || isNaN(lon)) {
             return res.status(400).json({ error: 'Enlem veya boylam sayisal bir deger degil' });
        }

        let formattedTimestamp = new Date().toISOString();
        if (timestampStr) {
            // Eğer OsmAnd gibi saniye cinsinden UNIX ise:
            if (!isNaN(timestampStr) && timestampStr.toString().length === 10) {
                formattedTimestamp = new Date(parseInt(timestampStr) * 1000).toISOString();
            } 
            // Eğer milisaniye ise:
            else if (!isNaN(timestampStr) && timestampStr.toString().length === 13) {
                formattedTimestamp = new Date(parseInt(timestampStr)).toISOString();
            }
            // Eğer ISO string (2026-05-09T...) ise:
            else {
                formattedTimestamp = new Date(timestampStr).toISOString();
            }
        }

        // Turkey Local Time Helper (UTC+3)
        const getTurkeyDateStr = (dateInput) => {
            try {
                const d = new Date(dateInput);
                if (isNaN(d.getTime())) return '1970-01-01';
                const formatter = new Intl.DateTimeFormat('tr-TR', {
                    timeZone: 'Europe/Istanbul',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
                const parts = formatter.formatToParts(d);
                const day = parts.find(p => p.type === 'day')?.value || '01';
                const month = parts.find(p => p.type === 'month')?.value || '01';
                const year = parts.find(p => p.type === 'year')?.value || '2026';
                return `${year}-${month}-${day}`;
            } catch {
                return new Date().toISOString().slice(0, 10);
            }
        };

        const cleanDeviceId = String(deviceId).trim();
        const dateStr = getTurkeyDateStr(formattedTimestamp);

        const plainLocationData = {
            driverId: cleanDeviceId,
            deviceId: cleanDeviceId,
            lat: lat,
            lon: lon,
            speed: speed,
            altitude: altitude,
            timestamp: formattedTimestamp,
            recordedAt: new Date().toISOString(),
            source: 'traccar_ios'
        };

        // 1. ESKİ SİSTEM YEDEK (Dual-Write: truck_routes'a yazmaya devam et)
        let docRefId = null;
        try {
            const docRef = await db.collection('truck_routes').add(plainLocationData);
            docRefId = docRef.id;
        } catch (trkErr) {
            console.error("truck_routes yedek yazma hatası:", trkErr);
        }

        // 2. YENİ SİSTEM (Canlı Takip: live_positions/{deviceId})
        let lastLiveDoc = null;
        try {
            const liveRef = db.collection('live_positions').doc(cleanDeviceId);
            lastLiveDoc = await liveRef.get();
            let recentTrail = [];
            if (lastLiveDoc.exists && Array.isArray(lastLiveDoc.data().recentTrail)) {
                recentTrail = lastLiveDoc.data().recentTrail;
            }
            recentTrail.push({
                lat: Number(lat.toFixed(5)),
                lon: Number(lon.toFixed(5)),
                speed: Number(speed.toFixed(1)),
                altitude: Number(altitude.toFixed(1)),
                timestamp: formattedTimestamp
            });
            if (recentTrail.length > 100) {
                recentTrail = recentTrail.slice(-100);
            }

            await liveRef.set({
                deviceId: cleanDeviceId,
                driverId: cleanDeviceId,
                lat: Number(lat.toFixed(5)),
                lon: Number(lon.toFixed(5)),
                speed: Number(speed.toFixed(1)),
                altitude: Number(altitude.toFixed(1)),
                timestamp: formattedTimestamp,
                recordedAt: new Date().toISOString(),
                recentTrail
            }, { merge: true });
        } catch (liveErr) {
            console.error("live_positions güncelleme hatası:", liveErr);
        }

        // 3. YENİ SİSTEM (Günlük Rota Geçmişi: daily_routes/{deviceId_YYYY-MM-DD})
        try {
            const isStopped = speed <= 2;
            const lastWasStopped = (lastLiveDoc?.data()?.speed || 0) <= 2;
            const lastTime = lastLiveDoc?.data()?.timestamp ? new Date(lastLiveDoc.data().timestamp).getTime() : 0;
            const currTime = new Date(formattedTimestamp).getTime();
            const timeDiffSec = (currTime - lastTime) / 1000;

            const shouldRecordToDaily = !isStopped || !lastWasStopped || timeDiffSec >= 60;

            if (shouldRecordToDaily) {
                const dailyDocId = `${cleanDeviceId}_${dateStr}`;
                const dailyRef = db.collection('daily_routes').doc(dailyDocId);
                await dailyRef.set({
                    deviceId: cleanDeviceId,
                    driverId: cleanDeviceId,
                    date: dateStr,
                    lastTimestamp: formattedTimestamp,
                    updatedAt: new Date().toISOString(),
                    points: admin.firestore.FieldValue.arrayUnion({
                        lat: Number(lat.toFixed(5)),
                        lon: Number(lon.toFixed(5)),
                        speed: Number(speed.toFixed(1)),
                        altitude: Number(altitude.toFixed(1)),
                        timestamp: formattedTimestamp
                    })
                }, { merge: true });
            }
        } catch (dailyErr) {
            console.error("daily_routes güncelleme hatası:", dailyErr);
        }

        return res.status(200).json({ 
            success: true, 
            message: 'Konum basariyla kaydedildi (Dual-Write Admin SDK)',
            id: docRefId
        });
    } catch (error) {
        console.error("Konum kaydedilirken hata:", error);
        return res.status(500).json({ error: 'Sunucu hatasi', details: error.message });
    }
}

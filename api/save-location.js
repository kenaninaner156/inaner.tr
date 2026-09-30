/* eslint-env node */
import admin from 'firebase-admin';
import { db } from '../lib/firebaseAdmin.js';

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Sadece GET veya POST kabul edilir' });
    }

    const data = { ...req.query, ...(req.body || {}) };
    const EXPECTED_TOKEN = process.env.TRACKER_TOKEN || "inaner123"; 
    
    if (data.token !== EXPECTED_TOKEN) {
        return res.status(401).json({ error: 'Yetkisiz islem. Gecersiz token.' });
    }

    // Canlı Filo Sorgusu (get_live)
    if (data.action === 'get_live' || data.action === 'get_vehicles') {
        try {
            const edgeRes = await fetch('https://inaner.tr/api/save-location?action=get_live&token=' + EXPECTED_TOKEN);
            const edgeData = await edgeRes.json();
            return res.status(200).json(edgeData);
        } catch (_) {
            return res.status(200).json({ success: true, count: 0, vehicles: [] });
        }
    }

    // Discord Webhook Bildirim Yardımcısı
    const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || "https://discord.com/api/webhooks/1517513169105453076/EINW0QQLQqMD-Nnl1LTNPIIC-d2oX1_qTns9JZXL4bX2qqLibE1NIG98E0--efZSrcyc";
    const notifyDiscord = async (msg) => {
        try {
            await fetch(DISCORD_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: msg })
            });
        } catch (_) {}
    };

    // Doğrudan Vercel'e gelen sinyalleri Cloudflare Edge Hub'a tam URL ve parametrelerle eksiksiz ilet
    if (!req.headers['cf-ray']) {
        try {
            const parsedUrl = new URL(req.url, 'http://localhost');
            const targetUrl = 'https://inaner.tr/api/save-location' + parsedUrl.search;
            await fetch(targetUrl, {
                method: req.method,
                headers: { 
                    'Content-Type': req.headers['content-type'] || 'application/json',
                    'X-Forwarded-From': 'Vercel-Function'
                },
                body: req.method === 'POST' ? JSON.stringify(data) : undefined
            });
        } catch (fErr) {
            console.error("Cloudflare Edge iletim hatasi:", fErr.message);
        }
    }

    try {
        // Cihaz silme işlemi
        if (data.action === 'delete_device' && data.deviceId) {
            const targetId = String(data.deviceId).trim();
            await db.collection('live_positions').doc(targetId).delete();
            
            // Eğer daily_routes dokümanı da belirtilmişse veya bugünün tarihiyle sil
            if (data.dailyDocId) {
                await db.collection('daily_routes').doc(data.dailyDocId).delete();
            }
            return res.status(200).json({ success: true, deleted: targetId });
        }

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

        // Discord'a ham veri sinyalini anında düşür (teşhis ve canlı kontrol için)
        notifyDiscord(`📡 [VERCEL GPS] Cihaz: **${cleanDeviceId}** | Lat: ${lat.toFixed(5)} | Lon: ${lon.toFixed(5)} | Hız: ${speed.toFixed(1)} km/s | Saat: ${formattedTimestamp}`);

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

        // Eski truck_routes çift yazma kaldırıldı (CPU ve I/O yükünü önlemek için)
        let docRefId = cleanDeviceId;

        // 2. YENİ SİSTEM (Canlı Takip & Günlük Rota Kaydı)
        try {
            const liveRef = db.collection('live_positions').doc(cleanDeviceId);
            const lastLiveDoc = await liveRef.get();
            const lastLiveData = lastLiveDoc.exists ? lastLiveDoc.data() : null;

            let recentTrail = [];
            if (lastLiveData && Array.isArray(lastLiveData.recentTrail)) {
                recentTrail = lastLiveData.recentTrail;
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

            // Günlük rotaya kayıt kontrolü (lastDailyTimestamp'e göre)
            const isStopped = speed <= 2;
            const lastWasStopped = (lastLiveData?.speed || 0) <= 2;
            const lastDailyTime = lastLiveData?.lastDailyTimestamp 
                ? new Date(lastLiveData.lastDailyTimestamp).getTime() 
                : 0;
            const currTime = new Date(formattedTimestamp).getTime();
            const timeDiffSec = (currTime - lastDailyTime) / 1000;

            const lastLat = lastLiveData?.lat || 0;
            const lastLon = lastLiveData?.lon || 0;
            const distDiff = Math.sqrt(Math.pow(lat - lastLat, 2) + Math.pow(lon - lastLon, 2));

            // Yüksek Çözünürlüklü Kesintisiz Telemetri Filtresi:
            // - Dur-kalk geçişleri (aracın durması veya harekete geçmesi): 0 gecikmeyle anında kaydet
            // - Araç dururken: En fazla 60 saniyede bir veya 40m kaymada kaydet
            // - Araç hareket halindeyken: En fazla 3 saniyede bir, ani hız farkında (>=5 km/s) veya ~30m sapmada kaydet
            const shouldRecordToDaily = !lastDailyTime || 
                (isStopped !== lastWasStopped) ||
                (isStopped 
                    ? (timeDiffSec >= 60 || distDiff >= 0.0004) 
                    : (timeDiffSec >= 3 || Math.abs(speed - (lastLiveData?.speed || 0)) >= 5 || distDiff >= 0.0003));

            // 1. live_positions güncelle
            await liveRef.set({
                deviceId: cleanDeviceId,
                driverId: cleanDeviceId,
                lat: Number(lat.toFixed(5)),
                lon: Number(lon.toFixed(5)),
                speed: Number(speed.toFixed(1)),
                altitude: Number(altitude.toFixed(1)),
                timestamp: formattedTimestamp,
                recordedAt: new Date().toISOString(),
                lastDailyTimestamp: shouldRecordToDaily ? formattedTimestamp : (lastLiveData?.lastDailyTimestamp || formattedTimestamp),
                recentTrail
            }, { merge: true });

            // 2. daily_routes güncelle
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
        } catch (syncErr) {
            console.error("live_positions / daily_routes güncelleme hatası:", syncErr);
        }

        return res.status(200).json({ 
            success: true, 
            message: 'Konum basariyla kaydedildi',
            id: docRefId
        });
    } catch (error) {
        console.error("Konum kaydedilirken hata:", error);
        return res.status(500).json({ error: 'Sunucu hatasi', details: error.message });
    }
}

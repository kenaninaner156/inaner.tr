/* eslint-env node */

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
            speed = parseFloat(data.location.coords.speed) || 0;
            altitude = parseFloat(data.location.coords.altitude) || 0;
            timestampStr = data.location.timestamp;
            // params içindeki device_id'yi de alalım
            deviceId = data.device_id || data.location.device_id || data.id || 'Bilinmeyen_Cihaz';
        }
        // 3. iOS Traccar (TSLocationManager) Custom Template JSON formatı
        else if (data.coords) {
            lat = parseFloat(data.coords.latitude);
            lon = parseFloat(data.coords.longitude);
            speed = parseFloat(data.coords.speed) || 0;
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

        const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || "v2-tir";
        
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

        const locationData = {
            fields: {
                driverId: { stringValue: String(deviceId).trim() },
                lat: { doubleValue: lat },
                lon: { doubleValue: lon },
                speed: { doubleValue: speed },
                altitude: { doubleValue: altitude },
                timestamp: { stringValue: formattedTimestamp },
                recordedAt: { stringValue: new Date().toISOString() },
                source: { stringValue: 'traccar_ios' }
            }
        };

        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/truck_routes`;

        const response = await fetch(firestoreUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(locationData)
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Firebase Error: ${response.status} - ${errBody}`);
        }

        const result = await response.json();

        return res.status(200).json({ 
            success: true, 
            message: 'Konum basariyla kaydedildi',
            id: result.name
        });

    } catch (error) {
        console.error("Konum kaydedilirken hata:", error);
        return res.status(500).json({ error: 'Sunucu hatasi', details: error.message });
    }
}

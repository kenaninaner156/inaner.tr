/* eslint-env node */
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    try {
        const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY;

        if (projectId && clientEmail && privateKey) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey: privateKey.replace(/\\n/g, '\n')
                })
            });
            console.log("Firebase Admin SDK initialized successfully in save-location handler.");
        } else {
            console.warn("Firebase Admin credentials missing, falling back to public Firestore REST API.");
        }
    } catch (err) {
        console.error("Firebase Admin SDK initialization failed:", err);
    }
}

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

        const plainLocationData = {
            driverId: String(deviceId).trim(),
            lat: lat,
            lon: lon,
            speed: speed,
            altitude: altitude,
            timestamp: formattedTimestamp,
            recordedAt: new Date().toISOString(),
            source: 'traccar_ios'
        };

        // Eğer Firebase Admin SDK aktifse, güvenli bir şekilde admin yetkileriyle yazıyoruz.
        if (admin.apps.length > 0) {
            const db = admin.firestore();
            const docRef = await db.collection('truck_routes').add(plainLocationData);
            return res.status(200).json({ 
                success: true, 
                message: 'Konum basariyla kaydedildi (Admin SDK)',
                id: docRef.id
            });
        } else {
            // Firebase Admin SDK yapılandırılmamışsa, eski REST API yöntemine geri dön (local geliştirme fallback)
            const locationData = {
                fields: {
                    driverId: { stringValue: plainLocationData.driverId },
                    lat: { doubleValue: plainLocationData.lat },
                    lon: { doubleValue: plainLocationData.lon },
                    speed: { doubleValue: plainLocationData.speed },
                    altitude: { doubleValue: plainLocationData.altitude },
                    timestamp: { stringValue: plainLocationData.timestamp },
                    recordedAt: { stringValue: plainLocationData.recordedAt },
                    source: { stringValue: plainLocationData.source }
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
                throw new Error(`Firebase REST Error: ${response.status} - ${errBody}`);
            }

            const result = await response.json();

            return res.status(200).json({ 
                success: true, 
                message: 'Konum basariyla kaydedildi (REST API Fallback)',
                id: result.name
            });
        }

    } catch (error) {
        console.error("Konum kaydedilirken hata:", error);
        return res.status(500).json({ error: 'Sunucu hatasi', details: error.message });
    }
}

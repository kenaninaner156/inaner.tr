/* eslint-env node */

export default async function handler(req, res) {
    // Sadece GET ve POST isteklerine izin ver
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Sadece GET veya POST kabul edilir' });
    }

    // Traccar OsmAnd protokolü bazen POST atsa bile verileri Query String'de gönderir.
    // Bu yüzden hem query'yi hem de body'yi birleştiriyoruz.
    const data = { ...req.query, ...(req.body || {}) };

    const EXPECTED_TOKEN = process.env.TRACKER_TOKEN || "inaner123"; 
    
    if (data.token !== EXPECTED_TOKEN) {
        return res.status(401).json({ error: 'Yetkisiz islem. Gecersiz token.' });
    }

    try {
        const lat = parseFloat(data.lat);
        const lon = parseFloat(data.lon);

        if (isNaN(lat) || isNaN(lon)) {
             return res.status(400).json({ error: 'Gecersiz enlem (lat) veya boylam (lon)' });
        }

        // Firebase REST API (Vercel'de donmaları engellemek için Client SDK yerine REST kullanıyoruz)
        const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || "v2-tir";
        
        // Veri yapısı (Firestore REST API formatı)
        const locationData = {
            fields: {
                driverId: { stringValue: data.id || 'Bilinmeyen_Cihaz' },
                lat: { doubleValue: lat },
                lon: { doubleValue: lon },
                speed: { doubleValue: parseFloat(data.speed) || 0 },
                altitude: { doubleValue: parseFloat(data.altitude) || 0 },
                timestamp: { stringValue: data.timestamp ? new Date(parseInt(data.timestamp) * 1000).toISOString() : new Date().toISOString() },
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

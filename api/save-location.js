/* eslint-env node */
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";

// Vercel Serverless Function ortamında process.env kullanılır.
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
};

let app;
let db;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (e) {
    console.log("Firebase init error", e);
}

export default async function handler(req, res) {
    // Sadece GET ve POST isteklerine izin ver
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Sadece GET veya POST kabul edilir' });
    }

    // Traccar verileri GET isteğinde URL parametresi olarak veya POST'ta body olarak gönderebilir.
    const data = req.method === 'POST' ? req.body : req.query;

    // --- GÜVENLİK ---
    // Başkalarının rastgele veri basmaması için URL sonuna ?token=inaner123 eklemen gerekecek
    const EXPECTED_TOKEN = process.env.TRACKER_TOKEN || "inaner123"; 
    
    if (data.token !== EXPECTED_TOKEN) {
        return res.status(401).json({ error: 'Yetkisiz islem. Gecersiz token.' });
    }

    try {
        // Enlem ve Boylam değerlerini kontrol et
        const lat = parseFloat(data.lat);
        const lon = parseFloat(data.lon);

        if (isNaN(lat) || isNaN(lon)) {
             return res.status(400).json({ error: 'Gecersiz enlem (lat) veya boylam (lon)' });
        }

        // Firebase'e kaydedilecek veri şablonu
        const locationData = {
            driverId: data.id || 'belirsiz_surucu', // Traccar ayarlarındaki Device Identifier
            lat: lat,
            lon: lon,
            speed: parseFloat(data.speed) || 0, // Traccar hızı knot cinsinden verebilir, sonradan çevrilebilir
            altitude: parseFloat(data.altitude) || 0,
            battery: parseFloat(data.batt) || null, // Traccar pil yüzdesini 'batt' olarak gönderebilir
            timestamp: data.timestamp ? new Date(parseInt(data.timestamp) * 1000).toISOString() : new Date().toISOString(),
            recordedAt: new Date().toISOString(),
            source: 'traccar_ios'
        };

        // Firebase "truck_routes" koleksiyonuna yaz
        const docRef = await addDoc(collection(db, "truck_routes"), locationData);

        return res.status(200).json({ 
            success: true, 
            message: 'Konum basariyla kaydedildi',
            id: docRef.id 
        });

    } catch (error) {
        console.error("Konum kaydedilirken hata:", error);
        return res.status(500).json({ error: 'Sunucu hatasi', details: error.message });
    }
}

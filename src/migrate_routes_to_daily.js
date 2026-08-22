/* eslint-env node */
import admin from 'firebase-admin';
import fs from 'fs';

// Initialize Firebase Admin SDK
const localJsonPath = "C:/Users/kenan/Desktop/tr/v2-tir-firebase-adminsdk-fbsvc-7c846d0b8b.json";
if (!admin.apps.length) {
    if (fs.existsSync(localJsonPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(localJsonPath, 'utf-8'));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("🔑 Firebase Admin SDK yerel servis hesabı ile başarıyla başlatıldı.");
    } else {
        admin.initializeApp({
            projectId: "v2-tir"
        });
        console.log("🔑 Firebase Admin SDK varsayılan ayarlar ile başlatıldı.");
    }
}

const db = admin.firestore();

// Turkey Local Time Helper (UTC+3)
function getTurkeyDateStr(dateInput) {
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
}

// Akıllı nokta temizleme: Araç hareket halindeyken (hız > 2) tüm noktaları korur.
// Araç dururken (park halindeyken) her 60 saniyede 1 nokta tutarak gereksiz mükerrer sıfır hız noktalarını temizler.
function cleanDailyPoints(points) {
    if (!points || points.length === 0) return [];
    points.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const result = [];
    let lastKept = null;

    for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (!lastKept) {
            result.push(pt);
            lastKept = pt;
            continue;
        }

        const isLastPoint = (i === points.length - 1);
        const isMoving = (pt.speed || 0) > 2;
        const lastMoving = (lastKept.speed || 0) > 2;

        // Eğer araç hareket halindeyse veya dur-kalk anıysa veya günün son noktasıysa KORU (100% rota hassasiyeti)
        if (isMoving || lastMoving || isLastPoint) {
            result.push(pt);
            lastKept = pt;
            continue;
        }

        // Araç duruyor: Sadece 60 saniyede bir veya konum 20 metreden fazla kaymışsa kaydet
        const timeDiffSec = (new Date(pt.timestamp).getTime() - new Date(lastKept.timestamp).getTime()) / 1000;
        const distDiff = Math.abs(pt.lat - lastKept.lat) + Math.abs(pt.lon - lastKept.lon);

        if (timeDiffSec >= 60 || distDiff > 0.0002) {
            result.push(pt);
            lastKept = pt;
        }
    }

    // Ek Güvenlik: 1 MB Firestore limitini aşmamak için maksimum 7,500 nokta tut (24 saatlik rotada her 11 saniyede bir nokta)
    if (result.length > 7500) {
        const step = Math.ceil(result.length / 7500);
        const downsampled = [];
        for (let i = 0; i < result.length; i++) {
            if (i === 0 || i === result.length - 1 || i % step === 0 || ((result[i].speed || 0) > 2) !== ((result[Math.max(0, i-1)].speed || 0) > 2)) {
                downsampled.push(result[i]);
            }
        }
        return downsampled;
    }

    return result;
}

async function runMigration() {
    console.log("📥 truck_routes koleksiyonu sayfalanarak taranıyor (Admin SDK)...");
    
    const dailyMap = new Map();
    const latestPerDevice = new Map();
    let totalPoints = 0;
    let lastDoc = null;
    const PAGE_SIZE = 5000;

    while (true) {
        let q = db.collection('truck_routes').orderBy('timestamp', 'asc');
        if (lastDoc) {
            q = q.startAfter(lastDoc);
        }
        q = q.limit(PAGE_SIZE);

        const snap = await q.get();
        if (snap.empty) break;

        snap.forEach(docSnap => {
            const d = docSnap.data();
            if (!d.lat || !d.lon || !d.timestamp) return;

            const deviceId = String(d.driverId || d.deviceId || 'Bilinmeyen').trim();
            const dateStr = getTurkeyDateStr(d.timestamp);
            const key = `${deviceId}_${dateStr}`;

            const pt = {
                lat: Number(Number(d.lat).toFixed(5)),
                lon: Number(Number(d.lon).toFixed(5)),
                speed: Number((d.speed || 0).toFixed(1)),
                altitude: Number((d.altitude || 0).toFixed(1)),
                timestamp: d.timestamp
            };

            if (!dailyMap.has(key)) {
                dailyMap.set(key, {
                    deviceId,
                    driverId: deviceId,
                    date: dateStr,
                    companyId: d.companyId || null,
                    points: []
                });
            }
            dailyMap.get(key).points.push(pt);

            const prevLatest = latestPerDevice.get(deviceId);
            if (!prevLatest || new Date(pt.timestamp) > new Date(prevLatest.timestamp)) {
                latestPerDevice.set(deviceId, { ...pt, companyId: d.companyId || null });
            }
        });

        totalPoints += snap.size;
        lastDoc = snap.docs[snap.docs.length - 1];
        console.log(`  📦 Toplam ${totalPoints} nokta okundu... (Son tarih: ${lastDoc.data()?.timestamp})`);

        if (snap.size < PAGE_SIZE) break;
    }

    console.log(`\n📊 Tarama Bitti: ${totalPoints} Toplam Nokta, ${dailyMap.size} Günlük Dosya, ${latestPerDevice.size} Aktif Cihaz.`);

    // Write daily_routes individually with smart deduplication
    console.log("\n💾 daily_routes dökümanları optimize edilerek kaydediliyor...");
    let writtenDailyCount = 0;
    const dailyEntries = Array.from(dailyMap.entries());
    
    for (const [key, group] of dailyEntries) {
        const cleanedPoints = cleanDailyPoints(group.points);
        const lastPt = cleanedPoints[cleanedPoints.length - 1];

        const ref = db.collection('daily_routes').doc(key);
        await ref.set({
            deviceId: group.deviceId,
            driverId: group.driverId,
            date: group.date,
            companyId: group.companyId,
            rawPointCount: group.points.length,
            pointCount: cleanedPoints.length,
            lastTimestamp: lastPt?.timestamp || null,
            updatedAt: new Date().toISOString(),
            points: cleanedPoints
        }, { merge: true });

        writtenDailyCount++;
        if (writtenDailyCount % 10 === 0 || writtenDailyCount === dailyEntries.length) {
            console.log(`  [${writtenDailyCount}/${dailyEntries.length}] Günlük rota kaydedildi (${group.points.length} -> ${cleanedPoints.length} nokta)... (${key})`);
        }
    }

    // Write live_positions
    console.log("\n📍 live_positions dökümanları başlatılıyor...");
    for (const [deviceId, latest] of latestPerDevice.entries()) {
        const todayStr = getTurkeyDateStr(latest.timestamp);
        const group = dailyMap.get(`${deviceId}_${todayStr}`);
        const recentTrail = group ? group.points.slice(-100) : [latest];

        const ref = db.collection('live_positions').doc(deviceId);
        await ref.set({
            deviceId,
            driverId: deviceId,
            lat: latest.lat,
            lon: latest.lon,
            speed: latest.speed,
            altitude: latest.altitude,
            timestamp: latest.timestamp,
            companyId: latest.companyId,
            recordedAt: new Date().toISOString(),
            recentTrail
        }, { merge: true });

        console.log(`  ✅ Araç [${deviceId}] -> En son konum: ${latest.lat}, ${latest.lon} (${latest.timestamp})`);
    }

    console.log("\n🎉 MİGRASYON BAŞARIYLA TAMAMLANDI!");
    console.log(`✔️ Toplam ${writtenDailyCount} günlük döküman oluşturuldu.`);
    console.log(`✔️ Toplam ${latestPerDevice.size} aracın canlı konumu 'live_positions' dökümanına yazıldı.`);
}

runMigration().catch(err => {
    console.error("❌ Migrasyon hatası:", err);
    process.exit(1);
});

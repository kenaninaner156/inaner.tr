/* eslint-env node */
import { db } from '../api/firebaseAdmin.js';
import admin from 'firebase-admin';

console.log("🚀 GPS Köprüsü (truck_routes -> live_positions & daily_routes) başlatıldı...");

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

const startTime = new Date(Date.now() - 300000).toISOString(); // Son 5 dakikadan itibaren dinle
console.log(`📡 truck_routes dinleniyor... Başlangıç: ${startTime}`);

const lastSavedPoints = new Map();

db.collection('truck_routes')
  .where('timestamp', '>=', startTime)
  .orderBy('timestamp', 'asc')
  .onSnapshot(async (snap) => {
    for (const change of snap.docChanges()) {
      if (change.type === 'added') {
        const d = change.doc.data();
        if (!d.lat || !d.lon || !d.timestamp) continue;

        const deviceId = String(d.driverId || d.deviceId || 'Bilinmeyen').trim();
        const dateStr = getTurkeyDateStr(d.timestamp);

        console.log(`📍 Canlı GPS Pingi: [${deviceId}] -> ${d.lat}, ${d.lon} | Hız: ${d.speed} | Zaman: ${d.timestamp}`);

        // 1. live_positions güncelle (Son 100 noktayı eksiksiz tut)
        try {
          const liveRef = db.collection('live_positions').doc(deviceId);
          const liveDoc = await liveRef.get();
          let recentTrail = [];
          if (liveDoc.exists && Array.isArray(liveDoc.data().recentTrail)) {
            recentTrail = liveDoc.data().recentTrail;
          }
          recentTrail.push({
            lat: Number(Number(d.lat).toFixed(5)),
            lon: Number(Number(d.lon).toFixed(5)),
            speed: Number((d.speed || 0).toFixed(1)),
            altitude: Number((d.altitude || 0).toFixed(1)),
            timestamp: d.timestamp
          });
          if (recentTrail.length > 100) {
            recentTrail = recentTrail.slice(-100);
          }

          await liveRef.set({
            deviceId,
            driverId: deviceId,
            lat: Number(Number(d.lat).toFixed(5)),
            lon: Number(Number(d.lon).toFixed(5)),
            speed: Number((d.speed || 0).toFixed(1)),
            altitude: Number((d.altitude || 0).toFixed(1)),
            timestamp: d.timestamp,
            recordedAt: new Date().toISOString(),
            recentTrail
          }, { merge: true });
        } catch (e) {
          console.error("live_positions sync hatası:", e);
        }

        // 2. daily_routes güncelle (Akıllı filtreleme: 1MB limitini korur)
        try {
          const lastPt = lastSavedPoints.get(deviceId);
          const currTime = new Date(d.timestamp).getTime();
          const lastTime = lastPt ? new Date(lastPt.timestamp).getTime() : 0;
          const timeDiffSec = (currTime - lastTime) / 1000;
          const isStopped = (d.speed || 0) <= 2;
          const lastWasStopped = (lastPt?.speed || 0) <= 2;

          const shouldSaveToDaily = !lastPt || (isStopped ? (timeDiffSec >= 60 || !lastWasStopped) : (timeDiffSec >= 3 || Math.abs((d.speed || 0) - (lastPt.speed || 0)) > 10));

          if (shouldSaveToDaily) {
            lastSavedPoints.set(deviceId, { lat: d.lat, lon: d.lon, speed: d.speed || 0, timestamp: d.timestamp });

            const dailyDocId = `${deviceId}_${dateStr}`;
            const dailyRef = db.collection('daily_routes').doc(dailyDocId);
            await dailyRef.set({
              deviceId,
              driverId: deviceId,
              date: dateStr,
              lastTimestamp: d.timestamp,
              updatedAt: new Date().toISOString(),
              points: admin.firestore.FieldValue.arrayUnion({
                lat: Number(Number(d.lat).toFixed(5)),
                lon: Number(Number(d.lon).toFixed(5)),
                speed: Number((d.speed || 0).toFixed(1)),
                altitude: Number((d.altitude || 0).toFixed(1)),
                timestamp: d.timestamp
              })
            }, { merge: true });
          }
        } catch (e) {
          console.error("daily_routes sync hatası:", e);
        }
      }
    }
  }, (err) => {
    console.error("truck_routes dinleme hatası:", err);
  });

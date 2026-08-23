// src/utils/mapUtils.js

/**
 * İki koordinat arasındaki mesafeyi kilometre cinsinden hesaplar (Haversine Formülü).
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Dünya yarıçapı (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * GPS sıçramalarını (1-2 saniye içinde imkansız hızda başka yere ışınlanıp geri dönen bozuk noktaları) temizler.
 */
export function cleanGpsSpikes(points, maxSpeedKmh = 160) {
  if (!points || points.length < 3) return points || [];
  const cleaned = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = cleaned[cleaned.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    if (!curr || isNaN(curr.lat) || isNaN(curr.lon)) continue;

    const timeDiffSec1 = Math.max(1, (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000);
    const distKm1 = haversineKm(prev.lat, prev.lon, curr.lat, curr.lon);
    const impliedSpeedKmh1 = (distKm1 / (timeDiffSec1 / 3600));

    const timeDiffSec2 = Math.max(1, (new Date(next.timestamp).getTime() - new Date(curr.timestamp).getTime()) / 1000);
    const distKm2 = haversineKm(curr.lat, curr.lon, next.lat, next.lon);
    const impliedSpeedKmh2 = (distKm2 / (timeDiffSec2 / 3600));

    const directDistKm = haversineKm(prev.lat, prev.lon, next.lat, next.lon);

    // Eğer nokta önceki ve sonraki noktalardan aşırı uzaksa (>160 km/h) ama önceki ve sonraki birbirine yakınsa
    if (impliedSpeedKmh1 > maxSpeedKmh && impliedSpeedKmh2 > maxSpeedKmh && directDistKm < distKm1 * 0.5) {
      continue; // Sıçrayan noktayı filtrele
    }

    cleaned.push(curr);
  }

  if (points.length > 1) {
    const last = points[points.length - 1];
    if (last && !isNaN(last.lat) && !isNaN(last.lon)) {
      cleaned.push(last);
    }
  }

  return cleaned;
}

/**
 * 30 dakikadan uzun hareketsizliklere veya özel bölgelerdeki bekleme sürelerine (örn: 5 dk)
 * göre konum noktalarını oturumlara (rotalara) böler.
 */
export function groupIntoSessions(rawPoints, maxGapMinutes = 30, geofences = [], manualSplits = [], manualMerges = []) {
  if (!rawPoints || !rawPoints.length) return [];
  const points = cleanGpsSpikes(rawPoints);
  if (!points || !points.length) return [];
  const sessions = [];
  let curSession = [points[0]];

  let activeGeofenceId = null;
  let geofenceEntryTime = null;
  let hasSplitForThisGeofenceVisit = false;
  
  // Hareketsiz kalma (stationary) takibi için değişken (Traccar knot -> km/h: 1 knot = 1.852 km/h)
  let stationaryStartTime = null;
  if ((points[0].speed || 0) * 1.852 < 5) {
    stationaryStartTime = new Date(points[0].timestamp).getTime();
  }

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    const prevTime = new Date(points[i - 1].timestamp).getTime();
    const curTime = new Date(pt.timestamp).getTime();
    
    let splitTriggered = false;

    const isStationary = (pt.speed || 0) * 1.852 < 5;
    if (isStationary) {
      if (!stationaryStartTime) {
        stationaryStartTime = curTime;
      }
    }

    // Kural 1: 30 dk zaman boşluğu
    if (curTime - prevTime > maxGapMinutes * 60 * 1000) {
      splitTriggered = true;
      stationaryStartTime = isStationary ? curTime : null;
    } 
    // Kural 1b: Hareketsiz kalma süresi (30 dk boyunca hızın < 5 km/h olması)
    else if (!isStationary && stationaryStartTime) {
      const stationaryDuration = curTime - stationaryStartTime;
      if (stationaryDuration >= maxGapMinutes * 60 * 1000) {
        splitTriggered = true;
      }
      stationaryStartTime = null;
    }
    // Kural 2: Özel Bölge (Geofence) Kontrolü
    else if (geofences && geofences.length > 0) {
      // Nokta herhangi bir bölgenin içinde mi? (Yarıçap genelde 0.5 km)
      const currentGeofence = geofences.find(g => haversineKm(pt.lat, pt.lon, g.lat, g.lon) <= (g.radiusKm || 0.5));
      
      if (currentGeofence) {
        if (activeGeofenceId !== currentGeofence.id) {
          // Bölgeye yeni girdi
          activeGeofenceId = currentGeofence.id;
          geofenceEntryTime = curTime;
          hasSplitForThisGeofenceVisit = false;
        } else {
          // Zaten bölgede
          if (!hasSplitForThisGeofenceVisit) {
            const timeInside = curTime - geofenceEntryTime;
            if (timeInside >= 5 * 60 * 1000) { // 5 dakika
              splitTriggered = true;
              hasSplitForThisGeofenceVisit = true; // Bu ziyaret için bir daha bölme
            }
          }
        }
      } else {
        // Bölgeden çıktı
        activeGeofenceId = null;
        geofenceEntryTime = null;
        hasSplitForThisGeofenceVisit = false;
      }
    }

    // Kural 3: Manuel Bölme Kontrolü (Kullanıcı arayüzden böldüyse)
    if (manualSplits && manualSplits.length > 0) {
      const crossedSplit = manualSplits.some(splitIso => {
        const splitTime = new Date(splitIso).getTime();
        return splitTime > prevTime && splitTime <= curTime;
      });
      if (crossedSplit) {
        splitTriggered = true;
      }
    }

    // Kural 4: Manuel Birleştirme Kontrolü (Kullanıcı arayüzden önceki seferle birleştirdiyse)
    if (splitTriggered && manualMerges && manualMerges.length > 0) {
      const crossedMerge = manualMerges.some(mergeIso => {
        const mergeTime = new Date(mergeIso).getTime();
        // Birleştirme noktası tam olarak curTime'a eşit veya aralığa düşüyorsa
        return mergeTime === curTime || (mergeTime > prevTime && mergeTime <= curTime);
      });
      if (crossedMerge) {
        splitTriggered = false; // Bölmeyi iptal et, birleştir!
      }
    }

    if (splitTriggered) {
      sessions.push(curSession);
      curSession = [pt];
    } else {
      curSession.push(pt);
    }
  }
  
  if (curSession.length > 0) {
    sessions.push(curSession);
  }
  
  return sessions;
}

/**
 * Sadece belirli bir mesafeden (örneğin 200m = 0.2km) fazla hareket edilmişse noktaları tutar.
 * Performansı artırır ve GPS sapmalarını engeller.
 */
export function filterSessionPoints(points, minDistanceKm = 0.2) {
  if (!points || points.length < 2) return points;

  const filtered = [points[0]]; // İlk noktayı her zaman al
  let lastPoint = points[0];

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    // Geçerli koordinat kontrolü
    if (isNaN(pt.lat) || isNaN(pt.lon)) continue;

    const dist = haversineKm(lastPoint.lat, lastPoint.lon, pt.lat, pt.lon);

    // Eğer son nokta ise her halükarda ekle (bitiş noktasını kaçırmamak için)
    // Veya mesafe minDistanceKm'den büyükse ekle
    if (dist >= minDistanceKm || i === points.length - 1) {
      filtered.push(pt);
      lastPoint = pt;
    }
  }

  return filtered;
}

/**
 * Bir rotanın toplam kilometre ve dakikasını hesaplar.
 */
export function calcStats(session) {
  if (!session || session.length < 2) return { km: 0, durationMin: 0, topSpeedKmh: 0, avgSpeedKmh: 0 };
  
  let km = 0;
  let topSpeed = 0;
  let totalSpeed = 0;

  for (let i = 1; i < session.length; i++) {
    km += haversineKm(session[i - 1].lat, session[i - 1].lon, session[i].lat, session[i].lon);
    
    // Hız hesaplaması (Traccar GPS hız verisi knot cinsindedir, km/h'ye çeviriyoruz: 1 knot = 1.852 km/h)
    const currentSpeed = (session[i].speed || 0) * 1.852;
    if (currentSpeed > topSpeed) topSpeed = currentSpeed;
    totalSpeed += currentSpeed;
  }

  const durationMin = Math.round(
    (new Date(session[session.length - 1].timestamp).getTime() - new Date(session[0].timestamp).getTime()) / 60000
  );

  const avgSpeedKmh = session.length > 0 ? Math.round(totalSpeed / session.length) : 0;

  return { 
    km: Math.round(km * 10) / 10, // 1 ondalıklı 
    durationMin,
    topSpeedKmh: Math.round(topSpeed),
    avgSpeedKmh
  };
}

/**
 * Life360 Tarzı Oynatma için İnterpolasyon (Araya değer bulma).
 * Belirli bir yüzdedeki (%0 - %100 arası) konumu hesaplar.
 */
export function getInterpolatedPoint(points, progressPercent) {
  if (!points || points.length === 0) return null;
  if (points.length === 1 || progressPercent <= 0) return { ...points[0], interpolated: false };
  if (progressPercent >= 100) return { ...points[points.length - 1], interpolated: false };

  // İlerleme yüzdesine göre rotanın toplamında ne kadar ilerlediğimizi zamansal veya indeks bazlı bulabiliriz.
  // Zaman bazlı hesaplamak en doğrusudur (Life360 gibi hız/zaman orantısı için).
  
  const startTime = new Date(points[0].timestamp).getTime();
  const endTime = new Date(points[points.length - 1].timestamp).getTime();
  const totalDuration = endTime - startTime;
  
  if (totalDuration === 0) return { ...points[0], interpolated: false };

  const targetTime = startTime + (totalDuration * (progressPercent / 100));

  // O anki zamana en yakın olan iki noktayı bul
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const t1 = new Date(p1.timestamp).getTime();
    const t2 = new Date(p2.timestamp).getTime();

    if (targetTime >= t1 && targetTime <= t2) {
      // Aradığımız zaman dilimindeyiz, şimdi p1 ve p2 arasında orantılı bir nokta bulalım.
      const segmentDuration = t2 - t1;
      // p1 ve p2 aynı zamandaysa direk p1 dön (çok düşük ihtimal ama crash önler)
      if (segmentDuration === 0) return { ...p1, interpolated: false };

      const ratio = (targetTime - t1) / segmentDuration;

      return {
        lat: p1.lat + (p2.lat - p1.lat) * ratio,
        lon: p1.lon + (p2.lon - p1.lon) * ratio,
        timestamp: new Date(targetTime).toISOString(),
        speed: p1.speed + ((p2.speed || 0) - (p1.speed || 0)) * ratio,
        interpolated: true,
        originalIndex: i // Hangi segmentin üstünde olduğumuzu bilmek arayüzde işe yarayabilir
      };
    }
  }

  return { ...points[points.length - 1], interpolated: false };
}

/**
 * Sabit Hızlı Oynatma için Index Bazlı İnterpolasyon.
 * Zaman damgalarını yok sayıp, tüm noktaları eşit aralıklarla gezer.
 * Böylece araç her koşulda sabit bir görsel hızda hareket eder.
 */
export function getInterpolatedPointLinear(points, progressPercent) {
  if (!points || points.length === 0) return null;
  if (progressPercent <= 0) return { ...points[0], interpolated: false };
  if (progressPercent >= 100) return { ...points[points.length - 1], interpolated: false };

  const totalSegments = points.length - 1;
  const target = (progressPercent / 100) * totalSegments;
  const segIndex = Math.floor(target);
  const ratio = target - segIndex;

  const p1 = points[Math.min(segIndex, points.length - 1)];
  const p2 = points[Math.min(segIndex + 1, points.length - 1)];

  return {
    lat: p1.lat + (p2.lat - p1.lat) * ratio,
    lon: p1.lon + (p2.lon - p1.lon) * ratio,
    timestamp: p1.timestamp,
    speed: (p1.speed || 0) + ((p2.speed || 0) - (p1.speed || 0)) * ratio,
    interpolated: true,
    originalIndex: segIndex,
  };
}

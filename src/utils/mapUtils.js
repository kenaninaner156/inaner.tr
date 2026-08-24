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
 * GPS noktalarının zaman damgasını (number, string, Firestore Timestamp) milisaniyeye çevirir.
 */
export function getPointTime(p) {
  if (!p) return 0;
  if (p.timestamp !== undefined && p.timestamp !== null) {
    if (typeof p.timestamp === 'number') return p.timestamp;
    if (p.timestamp.seconds !== undefined) return p.timestamp.seconds * 1000;
    const t = new Date(p.timestamp).getTime();
    if (!isNaN(t)) return t;
  }
  if (p.createdAt !== undefined && p.createdAt !== null) {
    if (typeof p.createdAt === 'number') return p.createdAt;
    if (p.createdAt.seconds !== undefined) return p.createdAt.seconds * 1000;
    const t = new Date(p.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (p.deviceTime) {
    const t = new Date(p.deviceTime).getTime();
    if (!isNaN(t)) return t;
  }
  if (p.fixTime) {
    const t = new Date(p.fixTime).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

/**
 * GPS sıçramalarını ve zaman sırası bozukluklarını (örümcek ağı / yelpaze çizgilerini) temizler.
 */
export function cleanGpsSpikes(points, maxSpeedKmh = 160) {
  if (!points || points.length < 2) return points || [];
  
  // 1. Geçersiz koordinatları ayıkla ve KESİN KRONOLOJİK SIRAYA DİZ
  const valid = points.filter(p => p && !isNaN(Number(p.lat)) && !isNaN(Number(p.lon)));
  if (valid.length < 2) return valid;

  const sorted = [...valid].sort((a, b) => getPointTime(a) - getPointTime(b));

  // 2. Mükerrer / aynı konumdaki titreşimleri ve ışınlanma sıçramalarını temizle
  const cleaned = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const curr = sorted[i];

    const t1 = getPointTime(prev);
    const t2 = getPointTime(curr);

    // Aynı konum ve zaman ise atla
    if (t2 <= t1 && Number(prev.lat) === Number(curr.lat) && Number(prev.lon) === Number(curr.lon)) {
      continue;
    }

    const timeDiffSec = Math.max(0.5, (t2 - t1) / 1000);
    const distKm = haversineKm(Number(prev.lat), Number(prev.lon), Number(curr.lat), Number(curr.lon));
    const impliedSpeedKmh = distKm / (timeDiffSec / 3600);

    // Eğer nokta imkansız bir hızla sıçrıyorsa (>160 km/h) ve sonraki nokta prev'e daha yakınsa
    if (impliedSpeedKmh > maxSpeedKmh && i < sorted.length - 1) {
      const next = sorted[i + 1];
      const distToNext = haversineKm(Number(prev.lat), Number(prev.lon), Number(next.lat), Number(next.lon));
      if (distToNext < distKm * 0.65) {
        continue; // Bozuk sıçrayan noktayı yut
      }
    }

    cleaned.push(curr);
  }

  return cleaned;
}

/**
 * Ray-Casting algoritmasıyla bir koordinatın çokgen (poligon) sınırları içinde olup olmadığını kontrol eder.
 * @param {{lat: number, lon: number}} point 
 * @param {Array<[number, number]>} polygon [[lat, lon], [lat, lon], ...]
 */
export function isPointInPolygon(point, polygon) {
  if (!point || !polygon || polygon.length < 3) return false;
  const x = Number(point.lat);
  const y = Number(point.lon);
  if (isNaN(x) || isNaN(y)) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const p1 = polygon[i];
    const p2 = polygon[j];
    const xi = Number(p1.lat !== undefined ? p1.lat : p1[0]);
    const yi = Number(p1.lon !== undefined ? p1.lon : p1[1]);
    const xj = Number(p2.lat !== undefined ? p2.lat : p2[0]);
    const yj = Number(p2.lon !== undefined ? p2.lon : p2[1]);
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Bir noktanın herhangi bir Geofence (Poligon veya Dairesel) içinde olup olmadığını kontrol eder.
 */
export function isPointInGeofence(pt, geofence) {
  if (!pt || !geofence) return false;
  // 1. Poligon Geofence Kontrolü (varsa)
  if (Array.isArray(geofence.polygon) && geofence.polygon.length >= 3) {
    return isPointInPolygon(pt, geofence.polygon);
  }
  // 2. Geriye dönük uyumluluk: Dairesel Geofence
  if (geofence.lat !== undefined && geofence.lon !== undefined) {
    return haversineKm(pt.lat, pt.lon, geofence.lat, geofence.lon) <= (geofence.radiusKm || 0.5);
  }
  return false;
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
  let geofenceSpentMeaningfulTime = false;
  
  // Hareketsiz kalma (stationary) takibi için değişken (Traccar knot -> km/h: 1 knot = 1.852 km/h)
  let stationaryStartTime = null;
  if ((points[0].speed || 0) * 1.852 < 5) {
    stationaryStartTime = getPointTime(points[0]);
  }

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    const prevTime = getPointTime(points[i - 1]);
    const curTime = getPointTime(pt);
    
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
    // Kural 2: Özel Bölge (Geofence) ÇIKIŞ Kontrolü (Poligon/Daireye girince değil, içeride yükleme/boşaltma yapıp çıkınca yeni sefer başlar)
    else if (geofences && geofences.length > 0) {
      // Nokta herhangi bir bölgenin (Poligon veya Daire) içinde mi? (Örn: Çayırhan, Baştaş Elmadağ vb.)
      const currentGeofence = geofences.find(g => isPointInGeofence(pt, g));
      
      if (currentGeofence) {
        if (activeGeofenceId !== currentGeofence.id) {
          // Bölgeye yeni girdi
          activeGeofenceId = currentGeofence.id;
          geofenceEntryTime = curTime;
          geofenceSpentMeaningfulTime = false;
        } else {
          // Bölgenin içinde vakit geçiriyor (kantar, yükleme, boşaltma)
          const timeInside = curTime - (geofenceEntryTime || curTime);
          if (timeInside >= 2 * 60 * 1000 || isStationary) {
            geofenceSpentMeaningfulTime = true;
          }
        }
      } else {
        // Tır bölgeden ÇIKTI
        if (activeGeofenceId && geofenceSpentMeaningfulTime) {
          // Tesis sahasında bekleyip kapıdan yola çıktığı an -> YENİ SEFERİ BAŞLAT
          splitTriggered = true;
        }
        activeGeofenceId = null;
        geofenceEntryTime = null;
        geofenceSpentMeaningfulTime = false;
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

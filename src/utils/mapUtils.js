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
 * 30 dakikadan uzun hareketsizliklere göre konum noktalarını oturumlara (rotalara) böler.
 */
export function groupIntoSessions(points, maxGapMinutes = 30) {
  if (!points || !points.length) return [];
  const sessions = [];
  let curSession = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prevTime = new Date(points[i - 1].timestamp).getTime();
    const curTime = new Date(points[i].timestamp).getTime();
    
    // Eğer iki nokta arasında 30 dakikadan fazla fark varsa, bu yeni bir rotadır.
    if (curTime - prevTime > maxGapMinutes * 60 * 1000) {
      sessions.push(curSession);
      curSession = [points[i]];
    } else {
      curSession.push(points[i]);
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
    
    // Hız hesaplaması (Eğer veride speed varsa m/s cinsinden, km/h'ye çeviriyoruz)
    const currentSpeed = (session[i].speed || 0) * 3.6;
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

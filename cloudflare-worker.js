/**
 * İnaner Logistics - Cloudflare Edge Telemetri Hub & D1 SQL Motoru
 * Rota: *inaner.tr/api/*
 *
 * MİMARİ İLKELERİ:
 * 1. Kota Koruması: Ham GPS pinglemesi (1 sn) D1 SQL diskine doğrudan yazılmaz.
 *    D1 live_positions sadece 15 saniyede bir / 25 metre hareket halinde veya durum değişiminde güncellenir.
 * 2. Akıllı Rota Kaydı (Dead-Reckoning): Düz hatta 250m veya 20 sn, virajlarda (açı sapması >= 15°)
 *    ve hız değişimlerinde (>= 15 km/s) route_points tablosuna kaydedilir.
 * 3. Navigasyon Akıcılığı: İstemciye heading (istikamet açısı) ve 10ms gecikmeli Edge önbelleği sunulur.
 * 4. Kesintisiz İz: Geofence (özel bölge kapısından çıkış) ve 30 dk mola kuralları seferi anında böler.
 */

// Bellek içi canlı filo ve arıza kayıtları
const liveFleet = new Map();
const lastD1LiveWrite = new Map();     // deviceId -> { time: ms, lat, lon, isMoving, geofenceId }
const lastRoutePointWrite = new Map(); // deviceId -> { time: ms, lat, lon, heading, speed }
const debugLogs = [];

function logEvent(type, data) {
  debugLogs.unshift({
    time: new Date().toISOString(),
    type,
    ...data
  });
  if (debugLogs.length > 50) debugLogs.pop();
}

const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1517513169105453076/EINW0QQLQqMD-Nnl1LTNPIIC-d2oX1_qTns9JZXL4bX2qqLibE1NIG98E0--efZSrcyc";

// Spam yapmamak için yalnızca kritik olaylarda (Geofence, Sefer Başlama/Bitiş) bildirim gönderir
async function notifyDiscord(content) {
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
  } catch (_) {}
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Forwarded-From',
  'Access-Control-Max-Age': '86400'
};

// Mesafe Hesaplayıcı (Haversine km)
function haversineKm(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return 0;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// İki koordinat arasındaki istikamet açısını (bearing 0-360°) hesaplar
function calculateBearing(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return 0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// İki açı arasındaki mutlak farkı hesaplar (0 - 180°)
function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Poligon Geofence Kontrolü (Ray-Casting)
function isPointInPolygon(point, polygon) {
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

function isPointInGeofence(pt, geofence) {
  if (!pt || !geofence) return false;
  if (Array.isArray(geofence.polygon) && geofence.polygon.length >= 3) {
    return isPointInPolygon(pt, geofence.polygon);
  }
  if (geofence.lat !== undefined && geofence.lon !== undefined) {
    return haversineKm(pt.lat, pt.lon, geofence.lat, geofence.lon) <= (geofence.radiusKm || 0.5);
  }
  return false;
}

// Türkiye Saati Tarih Formatlayıcı (UTC+3 -> YYYY-MM-DD)
function getTurkeyDateStr(timestamp) {
  try {
    const d = timestamp ? new Date(timestamp) : new Date();
    const trMs = d.getTime() + 3 * 3600 * 1000;
    return new Date(trMs).toISOString().slice(0, 10);
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Telemetri harici tüm istekleri orijine (Vercel) yönlendir
    const isSaveLocationPath = url.pathname.includes('save-location') || url.pathname.includes('location');
    const queryAction = url.searchParams.get('action');
    const isTelemetryAction = queryAction && ['test_d1', 'get_debug', 'sync_geofences', 'get_history', 'get_live', 'get_vehicles', 'delete_device'].includes(queryAction);

    if (!isSaveLocationPath && !isTelemetryAction) {
      return fetch(request);
    }

    try {
      const EXPECTED_TOKEN = "inaner123";

      // Parametreleri Çözümle
      let data = {};
      url.searchParams.forEach((value, key) => {
        data[key] = value;
      });

      let rawBodyText = '';
      if (request.method === 'POST') {
        try {
          rawBodyText = await request.text();
          if (rawBodyText) {
            try {
              const bodyJson = JSON.parse(rawBodyText);
              if (Array.isArray(bodyJson) && bodyJson.length > 0) {
                data = { ...data, ...bodyJson[0] };
              } else if (bodyJson && typeof bodyJson === 'object') {
                data = { ...data, ...bodyJson };
              }
            } catch (_) {
              const formParams = new URLSearchParams(rawBodyText);
              formParams.forEach((value, key) => {
                data[key] = value;
              });
            }
          }
        } catch (_) {}
      }

      const action = data.action || url.searchParams.get('action');

      // ── 1. D1 TEST & TEŞHİS UCU ──
      if (action === 'test_d1' || action === 'get_debug') {
        let d1Stats = { hasD1: !!env.DB };
        if (env.DB) {
          try {
            const liveCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM live_positions').first();
            const pointsCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM route_points').first();
            const geoCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM geofences').first();
            d1Stats.liveCount = liveCount?.cnt || 0;
            d1Stats.pointsCount = pointsCount?.cnt || 0;
            d1Stats.geoCount = geoCount?.cnt || 0;
          } catch (dErr) {
            d1Stats.error = dErr.message;
          }
        }
        return new Response(JSON.stringify({
          success: true,
          d1Stats,
          liveFleetCount: liveFleet.size,
          liveFleet: Array.from(liveFleet.values()),
          recentLogs: debugLogs
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }

      // ── 2. GEOFENCE SENKRONİZASYON UCU ──
      if (action === 'sync_geofences' && request.method === 'POST') {
        if (!env.DB) {
          return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: CORS_HEADERS });
        }
        const incomingGeos = Array.isArray(data.geofences) ? data.geofences : [];
        for (const g of incomingGeos) {
          if (!g.id || !g.name) continue;
          const polyStr = JSON.stringify(g.polygon || []);
          try {
            await env.DB.prepare(`
              INSERT INTO geofences (id, name, polygon_json, lat, lon, radius_km, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                polygon_json = excluded.polygon_json,
                lat = excluded.lat,
                lon = excluded.lon,
                radius_km = excluded.radius_km
            `).bind(g.id, g.name, polyStr, g.lat || null, g.lon || null, g.radiusKm || 1, new Date().toISOString()).run();
          } catch (gErr) {
            logEvent('geofence_sync_error', { message: gErr.message });
          }
        }
        return new Response(JSON.stringify({ success: true, count: incomingGeos.length }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      // ── 3. ROTA GEÇMİŞİ SORGUSU (D1 SQL) ──
      if (action === 'get_history') {
        const queryDate = data.date || url.searchParams.get('date') || getTurkeyDateStr();
        const driverId = data.driverId || data.deviceId || url.searchParams.get('driverId');

        if (env.DB) {
          try {
            // Türkiye saati (UTC+3) gün başlangıç ve bitiş milisaniyesi
            const [y, m, d] = queryDate.split('-').map(Number);
            const startOfDayMs = Date.UTC(y, m - 1, d, 0, 0, 0) - (3 * 3600 * 1000);
            const endOfDayMs = startOfDayMs + (24 * 3600 * 1000) - 1;

            let sql = 'SELECT device_id, lat, lon, speed, altitude, timestamp, point_time FROM route_points WHERE point_time >= ? AND point_time <= ?';
            const params = [startOfDayMs, endOfDayMs];
            if (driverId) {
              sql += ' AND device_id = ?';
              params.push(driverId);
            }
            sql += ' ORDER BY point_time ASC LIMIT 5000';

            const { results } = await env.DB.prepare(sql).bind(...params).all();
            return new Response(JSON.stringify({
              success: true,
              source: 'cloudflare_d1',
              date: queryDate,
              count: results?.length || 0,
              points: results || []
            }), {
              status: 200,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
            });
          } catch (hErr) {
            logEvent('get_history_error', { message: hErr.message });
          }
        }
      }

      // ── 4. CANLI FİLO VE AKTİF SEFER SORGUSU (get_live / get_vehicles) ──
      if (action === 'get_live' || action === 'get_vehicles') {
        let vehiclesMap = new Map();
        const nowMs = Date.now();

        // 4.1 Önce D1 Veritabanından temel durumları oku
        if (env.DB) {
          try {
            const { results: liveRows } = await env.DB.prepare('SELECT * FROM live_positions').all();
            if (liveRows && liveRows.length > 0) {
              for (const row of liveRows) {
                const dId = row.device_id;
                const tripStartTime = row.active_trip_start_time || (nowMs - 2 * 3600 * 1000);

                let recentTrail = [];
                try {
                  const { results: trailRows } = await env.DB.prepare(`
                    SELECT lat, lon, speed, altitude, timestamp, point_time
                    FROM route_points
                    WHERE device_id = ? AND point_time >= ?
                    ORDER BY point_time ASC
                    LIMIT 2000
                  `).bind(dId, tripStartTime).all();

                  if (trailRows && trailRows.length > 0) {
                    recentTrail = trailRows.map(p => ({
                      lat: p.lat,
                      lon: p.lon,
                      speed: p.speed,
                      altitude: p.altitude,
                      timestamp: p.timestamp
                    }));
                  }
                } catch (_) {}

                const isOnline = (nowMs - new Date(row.updated_at).getTime()) < 30 * 60 * 1000;

                vehiclesMap.set(dId, {
                  id: dId,
                  deviceId: dId,
                  driverId: dId,
                  companyId: null,
                  lat: row.lat,
                  lon: row.lon,
                  speed: row.speed,
                  altitude: row.altitude,
                  heading: row.heading || 0,
                  timestamp: row.timestamp,
                  updatedAt: row.updated_at,
                  dailyKm: Number((row.daily_km || 0).toFixed(1)),
                  isOnline: isOnline,
                  activeTripStartTime: row.active_trip_start_time,
                  recentTrail
                });
              }
            }
          } catch (d1Err) {
            logEvent('get_live_d1_read_error', { message: d1Err.message });
          }
        }

        // 4.2 Canlı bellek katmanı ile üzerine yaz (Saniyelik taze veriyi anında ver)
        for (const [memId, memVeh] of liveFleet.entries()) {
          const existing = vehiclesMap.get(memId);
          const isOnline = (nowMs - new Date(memVeh.updatedAt).getTime()) < 30 * 60 * 1000;

          if (existing) {
            // Son koordinat, hız, açı ve online durumunu en taze bellekten güncelle
            existing.lat = memVeh.lat;
            existing.lon = memVeh.lon;
            existing.speed = memVeh.speed;
            existing.altitude = memVeh.altitude;
            existing.heading = memVeh.heading;
            existing.timestamp = memVeh.timestamp;
            existing.updatedAt = memVeh.updatedAt;
            existing.isOnline = isOnline;
            if (memVeh.dailyKm !== undefined && memVeh.dailyKm > existing.dailyKm) {
              existing.dailyKm = memVeh.dailyKm;
            }
            // Eğer D1'den iz gelmediyse bellek izini kullan
            if (!existing.recentTrail || existing.recentTrail.length === 0) {
              existing.recentTrail = memVeh.recentTrail || [];
            } else if (memVeh.recentTrail && memVeh.recentTrail.length > 0) {
              // Son noktayı izin ucuna ekle
              const lastPt = existing.recentTrail[existing.recentTrail.length - 1];
              if (lastPt && (lastPt.lat !== memVeh.lat || lastPt.lon !== memVeh.lon)) {
                existing.recentTrail.push({
                  lat: memVeh.lat,
                  lon: memVeh.lon,
                  speed: memVeh.speed,
                  altitude: memVeh.altitude,
                  timestamp: memVeh.timestamp
                });
              }
            }
          } else {
            // D1'de henüz satırı yoksa doğrudan bellekten ekle
            vehiclesMap.set(memId, {
              ...memVeh,
              isOnline: isOnline
            });
          }
        }

        const finalVehicles = Array.from(vehiclesMap.values());

        return new Response(JSON.stringify({
          success: true,
          source: 'cloudflare_edge_hybrid',
          count: finalVehicles.length,
          vehicles: finalVehicles,
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0'
          }
        });
      }

      // Bu bir GPS isteği mi?
      const hasCoords = (data.lat !== undefined && data.lon !== undefined) ||
                        (data.location && data.location.coords) ||
                        (data.coords);
      const isSaveLocation = url.pathname.includes('save-location') || url.pathname.includes('location') || hasCoords;

      if (!isSaveLocation) {
        if (rawBodyText) {
          return fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: rawBodyText
          });
        }
        return fetch(request);
      }

      // Cihaz silme aksiyonu
      if (action === 'delete_device') {
        const delId = String(data.id || data.deviceId || '').trim();
        if (delId && env.DB) {
          try {
            await env.DB.prepare('DELETE FROM live_positions WHERE device_id = ?').bind(delId).run();
          } catch (_) {}
        }
        liveFleet.delete(delId);
        lastD1LiveWrite.delete(delId);
        lastRoutePointWrite.delete(delId);
        return new Response(JSON.stringify({ success: true, deleted: delId }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      // ── 5. GPS KOORDİNAT VE AÇI AYRIŞTIRMA (Traccar / OsmAnd / Custom) ──
      let deviceId = 'Bilinmeyen_Cihaz';
      let rawLat, rawLon, speed = 0, altitude = 0, rawHeading = 0;
      let pointTimestamp = new Date().toISOString();

      if (data.lat !== undefined && data.lon !== undefined) {
        rawLat = parseFloat(data.lat);
        rawLon = parseFloat(data.lon);
        speed = parseFloat(data.speed) || 0;
        altitude = parseFloat(data.altitude) || 0;
        rawHeading = parseFloat(data.heading || data.course || data.bearing || data.direction) || 0;
        pointTimestamp = data.timestamp || data.time || pointTimestamp;
        deviceId = String(data.id || data.device_id || data.deviceId || 'Bilinmeyen_Cihaz').trim();
      } else if (data.location && data.location.coords) {
        rawLat = parseFloat(data.location.coords.latitude);
        rawLon = parseFloat(data.location.coords.longitude);
        const s = parseFloat(data.location.coords.speed);
        speed = (!isNaN(s) && s > 0) ? s * 1.943844 : 0;
        altitude = parseFloat(data.location.coords.altitude) || 0;
        rawHeading = parseFloat(data.location.coords.heading || data.location.coords.course) || 0;
        pointTimestamp = data.location.timestamp || pointTimestamp;
        deviceId = String(data.device_id || data.location.device_id || data.id || 'Bilinmeyen_Cihaz').trim();
      } else if (data.coords) {
        rawLat = parseFloat(data.coords.latitude);
        rawLon = parseFloat(data.coords.longitude);
        const s = parseFloat(data.coords.speed);
        speed = (!isNaN(s) && s > 0) ? s * 1.943844 : 0;
        altitude = parseFloat(data.coords.altitude) || 0;
        rawHeading = parseFloat(data.coords.heading || data.coords.course) || 0;
        pointTimestamp = data.timestamp || pointTimestamp;
        deviceId = String(data.device_id || data.id || 'Bilinmeyen_Cihaz').trim();
      }

      // Goksel -> Göksel İsim Normalizasyonu
      if (deviceId === 'Goksel') deviceId = 'Göksel';

      if (isNaN(rawLat) || isNaN(rawLon) || rawLat < -90 || rawLat > 90 || rawLon < -180 || rawLon > 180) {
        return new Response(JSON.stringify({ error: 'Gecersiz koordinat' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      // Standart ISO Timestamp Formatlayıcı
      let formattedTimestamp = new Date().toISOString();
      if (pointTimestamp) {
        const strVal = String(pointTimestamp).trim();
        if (!isNaN(strVal) && /^\d+$/.test(strVal)) {
          if (strVal.length === 10) formattedTimestamp = new Date(parseInt(strVal, 10) * 1000).toISOString();
          else if (strVal.length === 13) formattedTimestamp = new Date(parseInt(strVal, 10)).toISOString();
        } else {
          const parsedD = new Date(pointTimestamp);
          if (!isNaN(parsedD.getTime())) formattedTimestamp = parsedD.toISOString();
        }
      }
      pointTimestamp = formattedTimestamp;
      const pointTime = new Date(pointTimestamp).getTime();
      const dateStr = getTurkeyDateStr(pointTimestamp);
      const isoNow = new Date().toISOString();

      // Önceki konuma göre istikamet açısı tamamlama (cihaz heading göndermiyorsa)
      const prevMem = liveFleet.get(deviceId);
      let calculatedHeading = rawHeading;
      if (!calculatedHeading && prevMem && prevMem.lat && prevMem.lon) {
        const dMove = haversineKm(prevMem.lat, prevMem.lon, rawLat, rawLon);
        if (dMove > 0.005) { // 5 metreden fazla hareket varsa açıyı hesapla
          calculatedHeading = calculateBearing(prevMem.lat, prevMem.lon, rawLat, rawLon);
        } else {
          calculatedHeading = prevMem.heading || 0;
        }
      }

      // ── 6. D1 SQL VE GEOFENCE KONTROLÜ (KOTA KORUMALI) ──
      let dailyKm = prevMem ? (prevMem.dailyKm || 0) : 0;
      let activeTripStartTime = prevMem?.activeTripStartTime || pointTime;
      let activeGeofenceId = prevMem?.activeGeofenceId || null;
      let geofenceEntryTime = prevMem?.geofenceEntryTime || null;

      if (env.DB) {
        try {
          // 6.1 D1'den mevcut durumu oku (Read kotası 5 Milyon/gün, serbesttir)
          const existing = await env.DB.prepare('SELECT * FROM live_positions WHERE device_id = ?').bind(deviceId).first();
          
          if (existing) {
            if (existing.daily_date !== dateStr) {
              dailyKm = 0; // Yeni gün
            } else {
              dailyKm = existing.daily_km || dailyKm;
            }
            activeTripStartTime = existing.active_trip_start_time || activeTripStartTime;
            activeGeofenceId = existing.active_geofence_id || activeGeofenceId;
            geofenceEntryTime = existing.geofence_entry_time || geofenceEntryTime;
          }

          // Günlük KM Hesabı
          const lastPointForKm = prevMem || existing;
          if (lastPointForKm && lastPointForKm.lat && lastPointForKm.lon) {
            const dist = haversineKm(lastPointForKm.lat, lastPointForKm.lon, rawLat, rawLon);
            if (dist > 0.003 && dist < 5) {
              dailyKm += dist;
            }
          }

          // 6.2 Geofence (Özel Bölge) Kontrolü
          const { results: allGeos } = await env.DB.prepare('SELECT * FROM geofences').all();
          let currentGeofence = null;
          if (allGeos && allGeos.length > 0) {
            const ptObj = { lat: rawLat, lon: rawLon };
            for (const g of allGeos) {
              let parsedPoly = [];
              try { parsedPoly = JSON.parse(g.polygon_json || '[]'); } catch (_) {}
              const geoObj = { ...g, polygon: parsedPoly };
              if (isPointInGeofence(ptObj, geoObj)) {
                currentGeofence = geoObj;
                break;
              }
            }
          }

          let geofenceEventTriggered = false;
          if (currentGeofence) {
            if (activeGeofenceId !== currentGeofence.id) {
              // Bölgeye yeni giriş yaptı
              activeGeofenceId = currentGeofence.id;
              geofenceEntryTime = pointTime;
              geofenceEventTriggered = true;
              notifyDiscord(`📍 [GEOFENCE GİRİŞ] **${deviceId}** '${currentGeofence.name}' bölgesine giriş yaptı.`);
            }
          } else {
            // Tır özel bölge DIŞINDA
            if (activeGeofenceId) {
              // Özel bölgede en az 2 dakika bekledikten sonra kapıdan çıkış yaptı mı?
              const timeInside = geofenceEntryTime ? (pointTime - geofenceEntryTime) : 0;
              if (timeInside >= 2 * 60 * 1000) {
                // Tesis kapısından yola çıktı -> YENİ SEFERİ BAŞLAT
                activeTripStartTime = pointTime;
                geofenceEventTriggered = true;
                notifyDiscord(`🚀 [YENİ SEFER] **${deviceId}** özel bölgeden çıkış yaptı. Yeni sefer başlatıldı.`);
                // Bellekteki eski rota izini temizle
                if (prevMem) prevMem.recentTrail = [];
              }
              activeGeofenceId = null;
              geofenceEntryTime = null;
            }
          }

          // 30 Dakika Mola Kuralı
          if (lastPointForKm && lastPointForKm.updated_at) {
            const timeSinceLastUpdateMin = (pointTime - new Date(lastPointForKm.updated_at).getTime()) / 60000;
            if (timeSinceLastUpdateMin >= 30 && speed > 5) {
              activeTripStartTime = pointTime;
              notifyDiscord(`🟢 [MOLA BİTTİ] **${deviceId}** 30 dakikalık duraklamanın ardından tekrar seyre başladı.`);
              if (prevMem) prevMem.recentTrail = [];
            }
          }

          // ── 6.3 live_positions KOTA KORUMALI YAZMA (THROTTLED) ──
          const lastLive = lastD1LiveWrite.get(deviceId) || { time: 0, lat: 0, lon: 0, isMoving: false };
          const isCurrentlyMoving = speed > 3;
          const movedDistKm = lastLive.lat ? haversineKm(lastLive.lat, lastLive.lon, rawLat, rawLon) : 999;
          const timeSinceLastLiveSec = (pointTime - lastLive.time) / 1000;

          let shouldWriteLiveD1 = false;
          if (geofenceEventTriggered) {
            shouldWriteLiveD1 = true;
          } else if (timeSinceLastLiveSec >= 60) {
            // En geç 60 saniyede bir heartbeat
            shouldWriteLiveD1 = true;
          } else if (isCurrentlyMoving !== lastLive.isMoving) {
            // Durma / harekete geçme geçişi
            shouldWriteLiveD1 = true;
          } else if (isCurrentlyMoving && timeSinceLastLiveSec >= 15 && movedDistKm >= 0.02) {
            // Hareket halindeyken: En az 15 sn ve 20 metre hareket şartı
            shouldWriteLiveD1 = true;
          }

          if (shouldWriteLiveD1) {
            await env.DB.prepare(`
              INSERT INTO live_positions (
                device_id, lat, lon, speed, altitude, heading, timestamp, updated_at,
                daily_km, daily_date, active_geofence_id, geofence_entry_time,
                active_trip_start_time, is_online
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
              ON CONFLICT(device_id) DO UPDATE SET
                lat = excluded.lat,
                lon = excluded.lon,
                speed = excluded.speed,
                altitude = excluded.altitude,
                heading = excluded.heading,
                timestamp = excluded.timestamp,
                updated_at = excluded.updated_at,
                daily_km = excluded.daily_km,
                daily_date = excluded.daily_date,
                active_geofence_id = excluded.active_geofence_id,
                geofence_entry_time = excluded.geofence_entry_time,
                active_trip_start_time = excluded.active_trip_start_time,
                is_online = 1
            `).bind(
              deviceId, rawLat, rawLon, speed, altitude, Math.round(calculatedHeading),
              pointTimestamp, isoNow, dailyKm, dateStr,
              activeGeofenceId, geofenceEntryTime, activeTripStartTime
            ).run();

            lastD1LiveWrite.set(deviceId, {
              time: pointTime,
              lat: rawLat,
              lon: rawLon,
              isMoving: isCurrentlyMoving,
              geofenceId: activeGeofenceId
            });
          }

          // ── 6.4 Akıllı Rota Kaydı (route_points DEAD-RECKONING) ──
          const lastPt = lastRoutePointWrite.get(deviceId) || {
            time: 0,
            lat: 0,
            lon: 0,
            heading: calculatedHeading,
            speed: speed
          };
          const ptTimeDiffSec = (pointTime - lastPt.time) / 1000;
          const ptDistKm = lastPt.lat ? haversineKm(lastPt.lat, lastPt.lon, rawLat, rawLon) : 999;
          const headingDelta = angleDiff(calculatedHeading, lastPt.heading);
          const speedDelta = Math.abs(speed - lastPt.speed);

          let shouldRecordPoint = false;
          if (!isCurrentlyMoving) {
            // Dururken (Hız < 3 km/s): Yalnızca 3 dakikada bir veya 50 metre oynarsa tek nokta kaydet
            shouldRecordPoint = ptTimeDiffSec >= 180 || ptDistKm >= 0.05;
          } else {
            // Seyir halindeyken:
            // 1. Viraj / Kavşak: Açı sapması >= 15° ve en az 2 saniye geçmişse
            if (headingDelta >= 15 && ptTimeDiffSec >= 2) {
              shouldRecordPoint = true;
            }
            // 2. Ani Hız Değişimi: Hız farkı >= 15 km/s ve en az 3 saniye geçmişse
            else if (speedDelta >= 15 && ptTimeDiffSec >= 3) {
              shouldRecordPoint = true;
            }
            // 3. Düz Yol: Mesafe >= 250m veya süre >= 20 saniye ise
            else if (ptDistKm >= 0.25 || ptTimeDiffSec >= 20) {
              shouldRecordPoint = true;
            }
            // 4. Geofence sınır geçişi
            else if (geofenceEventTriggered) {
              shouldRecordPoint = true;
            }
          }

          if (shouldRecordPoint) {
            await env.DB.prepare(`
              INSERT INTO route_points (device_id, lat, lon, speed, altitude, timestamp, point_time, date)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(deviceId, rawLat, rawLon, speed, altitude, pointTimestamp, pointTime, dateStr).run();

            lastRoutePointWrite.set(deviceId, {
              time: pointTime,
              lat: rawLat,
              lon: rawLon,
              heading: calculatedHeading,
              speed: speed
            });
          }

        } catch (d1SaveErr) {
          // Kota aşımı veya veritabanı kilitlense dahi hata sessizce günlüğe kaydedilir,
          // bellek içi canlı takip asla kesintiye uğramaz!
          logEvent('d1_write_error', { message: d1SaveErr.message, deviceId });
        }
      }

      // ── 7. Edge Bellek Katmanı Güncellemesi (Saniyelik Gerçek Zamanlı) ──
      let vehicle = liveFleet.get(deviceId);
      if (!vehicle) {
        vehicle = {
          id: deviceId,
          deviceId: deviceId,
          driverId: deviceId,
          lat: rawLat,
          lon: rawLon,
          speed,
          altitude,
          heading: Math.round(calculatedHeading),
          timestamp: pointTimestamp,
          updatedAt: isoNow,
          isOnline: true,
          dailyKm: Number(dailyKm.toFixed(1)),
          activeTripStartTime,
          activeGeofenceId,
          geofenceEntryTime,
          recentTrail: []
        };
      } else {
        vehicle.lat = rawLat;
        vehicle.lon = rawLon;
        vehicle.speed = speed;
        vehicle.altitude = altitude;
        vehicle.heading = Math.round(calculatedHeading);
        vehicle.timestamp = pointTimestamp;
        vehicle.updatedAt = isoNow;
        vehicle.isOnline = true;
        vehicle.dailyKm = Number(dailyKm.toFixed(1));
        vehicle.activeTripStartTime = activeTripStartTime;
        vehicle.activeGeofenceId = activeGeofenceId;
        vehicle.geofenceEntryTime = geofenceEntryTime;
      }

      if (!Array.isArray(vehicle.recentTrail)) vehicle.recentTrail = [];
      vehicle.recentTrail.push({
        lat: rawLat,
        lon: rawLon,
        speed,
        altitude,
        timestamp: pointTimestamp
      });
      if (vehicle.recentTrail.length > 500) {
        vehicle.recentTrail = vehicle.recentTrail.slice(-500);
      }
      liveFleet.set(deviceId, vehicle);

      return new Response(JSON.stringify({
        success: true,
        message: 'Konum Cloudflare Edge Hub üzerinde başarıyla işlendi',
        id: deviceId,
        heading: Math.round(calculatedHeading)
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      logEvent('fatal_error', { message: err.message });
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }
  }
};

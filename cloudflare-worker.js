/**
 * İnaner Logistics - Cloudflare Edge Telemetri Hub & D1 SQL Motoru
 * Rota: *inaner.tr/api/*
 */

const liveFleet = new Map();
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
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
            let sql = 'SELECT device_id, lat, lon, speed, altitude, timestamp, point_time FROM route_points WHERE date = ?';
            const params = [queryDate];
            if (driverId) {
              sql += ' AND device_id = ?';
              params.push(driverId);
            }
            sql += ' ORDER BY point_time ASC';

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
            console.error('D1 get_history hatasi:', hErr);
          }
        }
      }

      // ── 4. CANLI FİLO VE AKTİF SEFER SORGUSU (get_live / get_vehicles) ──
      if (action === 'get_live' || action === 'get_vehicles') {
        let vehicles = [];

        // D1 Veritabanından Oku
        if (env.DB) {
          try {
            const { results: liveRows } = await env.DB.prepare('SELECT * FROM live_positions').all();
            if (liveRows && liveRows.length > 0) {
              const nowMs = Date.now();

              for (const row of liveRows) {
                const dId = row.device_id;
                const isOnline = (nowMs - new Date(row.updated_at).getTime()) < 30 * 60 * 1000;
                
                // Aktif Sefer Güzergahını D1'den Çek (Özel bölge kapısından veya 30 dk moladan sonraki noktalar)
                const tripStartTime = row.active_trip_start_time || (nowMs - 2 * 3600 * 1000);
                
                const { results: trailRows } = await env.DB.prepare(`
                  SELECT lat, lon, speed, altitude, timestamp, point_time
                  FROM route_points
                  WHERE device_id = ? AND point_time >= ?
                  ORDER BY point_time ASC
                  LIMIT 2000
                `).bind(dId, tripStartTime).all();

                let recentTrail = (trailRows || []).map(p => ({
                  lat: p.lat,
                  lon: p.lon,
                  speed: p.speed,
                  altitude: p.altitude,
                  timestamp: p.timestamp
                }));

                // Eğer aktif seferde henüz 2 nokta yoksa son 50 noktayı al
                if (recentTrail.length < 2) {
                  const { results: fallbackRows } = await env.DB.prepare(`
                    SELECT lat, lon, speed, altitude, timestamp
                    FROM route_points
                    WHERE device_id = ?
                    ORDER BY point_time DESC
                    LIMIT 100
                  `).bind(dId).all();
                  if (fallbackRows && fallbackRows.length > 0) {
                    recentTrail = fallbackRows.reverse();
                  }
                }

                vehicles.push({
                  id: dId,
                  deviceId: dId,
                  driverId: dId,
                  companyId: null,
                  lat: row.lat,
                  lon: row.lon,
                  speed: row.speed,
                  altitude: row.altitude,
                  timestamp: row.timestamp,
                  updatedAt: row.updated_at,
                  dailyKm: Number((row.daily_km || 0).toFixed(1)),
                  isOnline: isOnline ? true : false,
                  activeTripStartTime: row.active_trip_start_time,
                  recentTrail
                });
              }
            }
          } catch (d1Err) {
            console.error('D1 get_live hatasi:', d1Err);
          }
        }

        // D1 henüz hazır değilse In-Memory Fallback
        if (vehicles.length === 0) {
          vehicles = Array.from(liveFleet.values());
        }

        return new Response(JSON.stringify({
          success: true,
          source: 'cloudflare_d1',
          count: vehicles.length,
          vehicles,
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
            'Pragma': 'no-cache'
          }
        });
      }

      // Bu bir GPS isteği mi?
      const hasCoords = (data.lat !== undefined && data.lon !== undefined) ||
                        (data.location && data.location.coords) ||
                        (data.coords);
      const isSaveLocation = url.pathname.includes('save-location') || url.pathname.includes('location') || hasCoords;

      if (!isSaveLocation) {
        return fetch(request);
      }

      // Cihaz silme aksiyonu
      if (action === 'delete_device') {
        const delId = String(data.id || data.deviceId || '').trim();
        if (delId && env.DB) {
          await env.DB.prepare('DELETE FROM live_positions WHERE device_id = ?').bind(delId).run();
        }
        liveFleet.delete(delId);
        return new Response(JSON.stringify({ success: true, deleted: delId }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      // ── 5. GPS KOORDİNAT AYRIŞTIRMA (Traccar / OsmAnd / Custom) ──
      let deviceId = 'Bilinmeyen_Cihaz';
      let rawLat, rawLon, speed = 0, altitude = 0;
      let pointTimestamp = new Date().toISOString();

      if (data.lat !== undefined && data.lon !== undefined) {
        rawLat = parseFloat(data.lat);
        rawLon = parseFloat(data.lon);
        speed = parseFloat(data.speed) || 0;
        altitude = parseFloat(data.altitude) || 0;
        pointTimestamp = data.timestamp || data.time || pointTimestamp;
        deviceId = String(data.id || data.device_id || data.deviceId || 'Bilinmeyen_Cihaz').trim();
      } else if (data.location && data.location.coords) {
        rawLat = parseFloat(data.location.coords.latitude);
        rawLon = parseFloat(data.location.coords.longitude);
        const s = parseFloat(data.location.coords.speed);
        speed = (!isNaN(s) && s > 0) ? s * 1.943844 : 0;
        altitude = parseFloat(data.location.coords.altitude) || 0;
        pointTimestamp = data.location.timestamp || pointTimestamp;
        deviceId = String(data.device_id || data.location.device_id || data.id || 'Bilinmeyen_Cihaz').trim();
      } else if (data.coords) {
        rawLat = parseFloat(data.coords.latitude);
        rawLon = parseFloat(data.coords.longitude);
        const s = parseFloat(data.coords.speed);
        speed = (!isNaN(s) && s > 0) ? s * 1.943844 : 0;
        altitude = parseFloat(data.coords.altitude) || 0;
        pointTimestamp = data.timestamp || pointTimestamp;
        deviceId = String(data.device_id || data.id || 'Bilinmeyen_Cihaz').trim();
      }

      // Goksel -> Göksel Normalizasyonu
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

      // Discord Bildirimi
      notifyDiscord(`🌐 [D1 GPS] Cihaz: **${deviceId}** | Lat: ${rawLat.toFixed(5)} | Lon: ${rawLon.toFixed(5)} | Hız: ${speed.toFixed(1)} km/s | Saat: ${pointTimestamp}`);

      // ── 6. D1 SQL ÜZERİNE YAZMA VE GEOFENCE KONTROLÜ ──
      if (env.DB) {
        try {
          // 6.1 Mevcut araç durumunu D1'den oku
          const existing = await env.DB.prepare('SELECT * FROM live_positions WHERE device_id = ?').bind(deviceId).first();
          
          // 6.2 1 Günlük KM Sayacı (Gece 00:00 - 23:59:59)
          let dailyKm = existing ? (existing.daily_km || 0) : 0;
          if (!existing || existing.daily_date !== dateStr) {
            dailyKm = 0; // Yeni gün başladı
          } else if (existing && existing.lat && existing.lon) {
            const dist = haversineKm(existing.lat, existing.lon, rawLat, rawLon);
            if (dist > 0.003 && dist < 5) {
              dailyKm += dist;
            }
          }

          // 6.3 Özel Bölge (Geofence) ve 30 Dakika Mola Kuralı
          let activeTripStartTime = existing?.active_trip_start_time || pointTime;
          let activeGeofenceId = existing?.active_geofence_id || null;
          let geofenceEntryTime = existing?.geofence_entry_time || null;

          // D1'deki Geofence'leri çek
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

          const isStationary = speed < 4;

          if (currentGeofence) {
            if (activeGeofenceId !== currentGeofence.id) {
              // Özel bölgeye yeni girdi
              activeGeofenceId = currentGeofence.id;
              geofenceEntryTime = pointTime;
            }
          } else {
            // Tır özel bölge DIŞINDA
            if (activeGeofenceId) {
              // Özel bölgede en az 2 dakika durup/bekleyip çıktı mı?
              const timeInside = geofenceEntryTime ? (pointTime - geofenceEntryTime) : 0;
              if (timeInside >= 2 * 60 * 1000) {
                // Tesis sahasında bekleyip kapıdan yola çıktığı an -> YENİ SEFERİ BAŞLAT!
                activeTripStartTime = pointTime;
              }
              activeGeofenceId = null;
              geofenceEntryTime = null;
            }
          }

          // 30 Dakika Hareketsizlik (Mola) Kuralı
          if (existing && existing.updated_at) {
            const timeSinceLastUpdateMin = (pointTime - new Date(existing.updated_at).getTime()) / 60000;
            if (timeSinceLastUpdateMin >= 30 && speed > 5) {
              // 30 dakikalık duraklamadan sonra ilk hareket -> YENİ SEFER BAŞLADI!
              activeTripStartTime = pointTime;
            }
          }

          // 6.4 live_positions UPSERT
          await env.DB.prepare(`
            INSERT INTO live_positions (
              device_id, lat, lon, speed, altitude, timestamp, updated_at,
              daily_km, daily_date, active_geofence_id, geofence_entry_time,
              active_trip_start_time, is_online
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(device_id) DO UPDATE SET
              lat = excluded.lat,
              lon = excluded.lon,
              speed = excluded.speed,
              altitude = excluded.altitude,
              timestamp = excluded.timestamp,
              updated_at = excluded.updated_at,
              daily_km = excluded.daily_km,
              daily_date = excluded.daily_date,
              active_geofence_id = excluded.active_geofence_id,
              geofence_entry_time = excluded.geofence_entry_time,
              active_trip_start_time = excluded.active_trip_start_time,
              is_online = 1
          `).bind(
            deviceId, rawLat, rawLon, speed, altitude, pointTimestamp, isoNow,
            dailyKm, dateStr, activeGeofenceId, geofenceEntryTime, activeTripStartTime
          ).run();

          // 6.5 Akıllı Viraj & Rota Kaydı (route_points INSERT)
          let shouldRecordPoint = true;
          if (existing && existing.lat && existing.lon) {
            const distFromLast = haversineKm(existing.lat, existing.lon, rawLat, rawLon);
            const speedDiff = Math.abs(speed - (existing.speed || 0));
            // Araç dururken: En fazla 60 sn'de bir kaydet
            if (speed < 3 && (existing.speed || 0) < 3) {
              const timeDiffSec = (pointTime - new Date(existing.timestamp).getTime()) / 1000;
              shouldRecordPoint = timeDiffSec >= 60 || distFromLast >= 0.03;
            } else {
              // Hareket halindeyken: Virajda (hız farkı veya mesafe > 20m) veya 3 sn'de bir
              shouldRecordPoint = distFromLast >= 0.02 || speedDiff >= 4;
            }
          }

          if (shouldRecordPoint) {
            await env.DB.prepare(`
              INSERT INTO route_points (device_id, lat, lon, speed, altitude, timestamp, point_time, date)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(deviceId, rawLat, rawLon, speed, altitude, pointTimestamp, pointTime, dateStr).run();
          }

        } catch (d1SaveErr) {
          console.error('D1 Save error:', d1SaveErr);
        }
      }

      // In-Memory Güncelleme
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
          timestamp: pointTimestamp,
          updatedAt: isoNow,
          isOnline: true,
          dailyKm: 0,
          recentTrail: []
        };
      } else {
        vehicle.lat = rawLat;
        vehicle.lon = rawLon;
        vehicle.speed = speed;
        vehicle.altitude = altitude;
        vehicle.timestamp = pointTimestamp;
        vehicle.updatedAt = isoNow;
        vehicle.isOnline = true;
      }
      if (!Array.isArray(vehicle.recentTrail)) vehicle.recentTrail = [];
      vehicle.recentTrail.push({ lat: rawLat, lon: rawLon, speed, altitude, timestamp: pointTimestamp });
      if (vehicle.recentTrail.length > 500) vehicle.recentTrail = vehicle.recentTrail.slice(-500);
      liveFleet.set(deviceId, vehicle);

      return new Response(JSON.stringify({
        success: true,
        message: 'Konum Cloudflare D1 ve Edge Hub üzerine kaydedildi',
        id: deviceId
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

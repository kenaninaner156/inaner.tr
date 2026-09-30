/**
 * İnaner Logistics - Cloudflare Edge Telemetri Hub (Geniş Kapsamlı GPS Radarı)
 * Rota: *inaner.tr/api/*
 */

const liveFleet = new Map();
const debugLogs = [];
let lastVercelFetchTime = 0;

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

const CACHE_URL = 'https://inaner.tr/api/save-location?action=internal_fleet_cache';

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

      // Canlı Debug / Teşhis Sorgusu
      if (action === 'get_debug' || action === 'get_logs') {
        return new Response(JSON.stringify({
          success: true,
          totalLoggedEvents: debugLogs.length,
          liveFleetCount: liveFleet.size,
          lastVercelFetchAgeMs: Date.now() - lastVercelFetchTime,
          liveFleet: Array.from(liveFleet.values()),
          recentLogs: debugLogs
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }

      // Harita Ekranı Canlı Filo Verisi (Anlık Senkronize)
      if (action === 'get_live' || action === 'get_vehicles') {
        const now = Date.now();
        let vehicles = Array.from(liveFleet.values());

        // 1. Önce yerel PoP Cache API'den taze veri kontrolü
        try {
          const cacheKey = new Request(CACHE_URL, { method: 'GET' });
          const cachedRes = await caches.default.match(cacheKey);
          if (cachedRes) {
            const cachedVehicles = await cachedRes.json();
            if (Array.isArray(cachedVehicles) && cachedVehicles.length > 0) {
              cachedVehicles.forEach(v => {
                if (v && v.id) {
                  const existing = liveFleet.get(v.id);
                  const vTime = new Date(v.updatedAt || v.timestamp || 0).getTime();
                  const existTime = existing ? new Date(existing.updatedAt || existing.timestamp || 0).getTime() : 0;
                  if (!existing || vTime >= existTime) {
                    liveFleet.set(v.id, v);
                  }
                }
              });
              vehicles = Array.from(liveFleet.values());
            }
          }
        } catch (_) {}

        // 2. Anlık Tazelik Denetimi:
        // Eğer bellekte hiç araç yoksa VEYA son Vercel sorgusundan bu yana 2 saniye geçmişse Vercel / Firestore'dan çek
        const lastFetchAge = now - lastVercelFetchTime;
        const needsOriginSync = vehicles.length === 0 || lastFetchAge >= 2000;

        if (needsOriginSync) {
          try {
            const fwdHeaders = new Headers(request.headers);
            fwdHeaders.set('X-Forwarded-From', 'Cloudflare-Edge');
            const originRes = await fetch(request.url, {
              method: 'GET',
              headers: fwdHeaders
            });
            if (originRes.ok) {
              const originData = await originRes.json();
              if (originData.success && Array.isArray(originData.vehicles) && originData.vehicles.length > 0) {
                lastVercelFetchTime = now;
                originData.vehicles.forEach(v => {
                  if (v && v.id) {
                    const existing = liveFleet.get(v.id);
                    const vTime = new Date(v.updatedAt || v.timestamp || 0).getTime();
                    const existTime = existing ? new Date(existing.updatedAt || existing.timestamp || 0).getTime() : 0;
                    if (!existing || vTime >= existTime) {
                      liveFleet.set(v.id, v);
                    }
                  }
                });
                vehicles = Array.from(liveFleet.values());

                // Cache API'ye sadece 2 saniyelik mikro önbellek kaydet
                const cacheKey = new Request(CACHE_URL, { method: 'GET' });
                const cacheRes = new Response(JSON.stringify(vehicles), {
                  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=2' }
                });
                ctx.waitUntil(caches.default.put(cacheKey, cacheRes).catch(() => {}));
              }
            }
          } catch (fErr) {
            console.error('Origin get_live fallback hatasi:', fErr?.message || fErr);
          }
        }

        return new Response(JSON.stringify({
          success: true,
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

      // Her gelen GPS veya location isteğini kaydet
      logEvent('incoming_gps_hit', {
        path: url.pathname,
        method: request.method,
        query: url.search,
        ip: request.headers.get('cf-connecting-ip'),
        ua: (request.headers.get('user-agent') || '').slice(0, 60),
        hasBody: !!rawBodyText,
        bodyPreview: rawBodyText ? rawBodyText.slice(0, 100) : ''
      });

      // Token doğrulaması
      const token = data.token || data.params?.token || data.location?.params?.token || url.searchParams.get('token');
      if (token && token !== EXPECTED_TOKEN) {
        logEvent('token_mismatch', { receivedToken: token, expected: EXPECTED_TOKEN });
      }

      // Cihaz silme aksiyonu
      if (action === 'delete_device') {
        const delId = String(data.id || data.deviceId || '').trim();
        if (delId) {
          liveFleet.delete(delId);
          // Vercel'e de ilet
          const fwdHeaders = new Headers(request.headers);
          fwdHeaders.set('X-Forwarded-From', 'Cloudflare-Edge');
          ctx.waitUntil(fetch(request.url, { method: request.method, headers: fwdHeaders, body: rawBodyText || undefined }).catch(() => {}));
        }
        return new Response(JSON.stringify({ success: true, deleted: delId }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      // Koordinat Ayrıştırma (OsmAnd / Traccar / Custom)
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

      if (isNaN(rawLat) || isNaN(rawLon) || rawLat < -90 || rawLat > 90 || rawLon < -180 || rawLon > 180) {
        logEvent('invalid_coordinates', { rawLat, rawLon, deviceId, data });
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
          if (strVal.length === 10) {
            formattedTimestamp = new Date(parseInt(strVal, 10) * 1000).toISOString();
          } else if (strVal.length === 13) {
            formattedTimestamp = new Date(parseInt(strVal, 10)).toISOString();
          }
        } else {
          const parsedD = new Date(pointTimestamp);
          if (!isNaN(parsedD.getTime())) {
            formattedTimestamp = parsedD.toISOString();
          }
        }
      }
      pointTimestamp = formattedTimestamp;

      const now = Date.now();
      const isoNow = new Date(now).toISOString();

      logEvent('valid_gps_parsed', {
        deviceId,
        lat: rawLat,
        lon: rawLon,
        speed,
        timestamp: pointTimestamp
      });

      // Discord'a anlık GPS telemetri bildirimini gönder
      notifyDiscord(`🌐 [EDGE GPS] Cihaz: **${deviceId}** | Lat: ${rawLat.toFixed(5)} | Lon: ${rawLon.toFixed(5)} | Hız: ${speed.toFixed(1)} km/s | Saat: ${pointTimestamp}`);

      // Edge In-Memory Filo Güncellemesi
      let vehicle = liveFleet.get(deviceId);
      if (!vehicle) {
        vehicle = {
          id: deviceId,
          deviceId: deviceId,
          driverId: deviceId,
          companyId: null,
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
        if (!Array.isArray(vehicle.recentTrail)) {
          vehicle.recentTrail = [];
        }
      }

      vehicle.recentTrail.push({
        lat: rawLat,
        lon: rawLon,
        speed,
        altitude,
        timestamp: pointTimestamp
      });
      if (vehicle.recentTrail.length > 2500) {
        vehicle.recentTrail = vehicle.recentTrail.slice(-2500);
      }

      liveFleet.set(deviceId, vehicle);

      // Cloudflare Data Center Cache API'ye hemen kaydet (Sıfır kota, sınırsız yazma)
      try {
        const cacheKey = new Request(CACHE_URL, { method: 'GET' });
        const cacheRes = new Response(JSON.stringify(Array.from(liveFleet.values())), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=2' }
        });
        ctx.waitUntil(caches.default.put(cacheKey, cacheRes).catch(() => {}));
      } catch (_) {}

      // Vercel Origin'e Arka Planda İlet (Firestore live_positions ve daily_routes için)
      try {
        const fwdHeaders = new Headers(request.headers);
        fwdHeaders.set('X-Forwarded-From', 'Cloudflare-Edge');
        fwdHeaders.delete('content-length');
        ctx.waitUntil(
          fetch(request.url, {
            method: request.method,
            headers: fwdHeaders,
            body: request.method === 'POST' ? rawBodyText : undefined
          }).catch(fErr => console.error('Vercel async fwd error:', fErr?.message || fErr))
        );
      } catch (_) {}

      // Yanıt
      return new Response(JSON.stringify({
        success: true,
        message: 'Konum Edge ve Veritabanina islendi',
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

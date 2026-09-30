/**
 * İnaner Logistics - Cloudflare Edge Telemetri Hub (Geniş Kapsamlı GPS Radarı)
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
  if (debugLogs.length > 100) debugLogs.pop();
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
              // URLSearchParams fallback
              const formParams = new URLSearchParams(rawBodyText);
              formParams.forEach((value, key) => {
                data[key] = value;
              });
            }
          }
        } catch (_) {}
      }

      // Canlı Debug / Teşhis Sorgusu
      const action = data.action || url.searchParams.get('action');
      if (action === 'get_debug' || action === 'get_logs') {
        return new Response(JSON.stringify({
          success: true,
          totalLoggedEvents: debugLogs.length,
          liveFleetCount: liveFleet.size,
          liveFleet: Array.from(liveFleet.values()),
          recentLogs: debugLogs
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }

      // Harita Ekranı Canlı Filo Verisi
      if (action === 'get_live' || action === 'get_vehicles') {
        let vehicles = Array.from(liveFleet.values());
        if (env.LIVE_FLEET_KV) {
          try {
            const kvState = await env.LIVE_FLEET_KV.get('live_fleet_state', 'json');
            if (Array.isArray(kvState) && kvState.length > 0) {
              vehicles = kvState.map(veh => {
                if (veh && Array.isArray(veh.recentTrail)) {
                  veh.recentTrail = veh.recentTrail.map(pt => {
                    let ts = pt.timestamp;
                    if (ts && /^\d{10}$/.test(String(ts).trim())) {
                      ts = new Date(parseInt(ts, 10) * 1000).toISOString();
                    }
                    return { ...pt, timestamp: ts };
                  });
                }
                return veh;
              });
              // in-memory senkronizasyonu
              vehicles.forEach(v => { if (v && v.id) liveFleet.set(v.id, v); });
            }
          } catch (_) {}
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
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
      }

      // Bu bir GPS isteği mi? (save-location VEYA lat/lon barındıran herhangi bir istek)
      const hasCoords = (data.lat !== undefined && data.lon !== undefined) ||
                        (data.location && data.location.coords) ||
                        (data.coords);
      const isSaveLocation = url.pathname.includes('save-location') || url.pathname.includes('location') || hasCoords;

      if (!isSaveLocation) {
        // GPS olmayan diğer API isteklerini (örn: drive, version, gib) doğrudan Vercel'e ilet
        return fetch(request);
      }

      // Her gelen GPS veya location isteğini radar gibi kaydet
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
          if (env.LIVE_FLEET_KV) {
            await env.LIVE_FLEET_KV.put('live_fleet_state', JSON.stringify(Array.from(liveFleet.values())));
          }
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

      // Standart ISO Timestamp Formatlayıcı (UNIX saniye / ms / ISO desteği)
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

      // Edge In-Memory Filo Güncellemesi (KV kalıcı bellekten yükle)
      let vehicle = liveFleet.get(deviceId);
      if (!vehicle && env.LIVE_FLEET_KV) {
        try {
          const kvState = await env.LIVE_FLEET_KV.get('live_fleet_state', 'json');
          if (Array.isArray(kvState)) {
            kvState.forEach(v => { if (v && v.id) liveFleet.set(v.id, v); });
            vehicle = liveFleet.get(deviceId);
          }
        } catch (_) {}
      }

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

      // Cloudflare KV Kalıcı Depolama Senkronizasyonu
      if (env.LIVE_FLEET_KV) {
        ctx.waitUntil(
          env.LIVE_FLEET_KV.put('live_fleet_state', JSON.stringify(Array.from(liveFleet.values())))
            .catch(e => console.error('KV Put Error:', e.message))
        );
      }

      // Yanıt
      return new Response(JSON.stringify({
        success: true,
        message: 'Konum Edge uzerine islendi (Sifir Firestore Kotasi)',
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

/**
 * İnaner Logistics - Cloudflare Edge Telemetri Hub (Sıfır Firestore Kotası)
 * Rota: *inaner.tr/api/save-location*
 * 
 * Bu Worker:
 * 1. Telefonlardan gelen 2-3 saniyelik ham GPS verilerini Edge hafızasında karşılar.
 * 2. Firestore'a sürekli yazma yapmaz; canlı takip verisini Edge üzerinde tutar.
 * 3. Harita paneline "GET /api/save-location?action=get_live" ile 20ms'de anlık canlı filo verisini sunar.
 * 4. Firestore kotasını canlı takip için SIFIRA (0) indirir.
 * 5. Detaylı canlı erişim ve cihaz loglarını tutar (?action=get_debug).
 */

// Edge In-Memory Canlı Filo Durumu
const liveFleet = new Map();

// Son 60 adet gelen istek logu (Adli analiz ve canlı teşhis)
const debugLogs = [];

function logEvent(type, data) {
  debugLogs.unshift({
    time: new Date().toISOString(),
    type,
    ...data
  });
  if (debugLogs.length > 60) debugLogs.pop();
}

// Cihaz bazlı arşivleme zamanlayıcısı (Sadece 10 dakikada bir veya duruşta Vercel'e iletim)
const deviceArchiveTracker = new Map();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // OPTIONS preflight sorgularını anında yanıtla (CORS)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Yalnızca /api/save-location isteklerini karşıla
    if (!url.pathname.includes('/api/save-location')) {
      return fetch(request);
    }

    try {
      const EXPECTED_TOKEN = "inaner123";

      // 1. Parametreleri Çözümle
      let data = {};
      url.searchParams.forEach((value, key) => {
        data[key] = value;
      });

      let rawBodyText = '';
      if (request.method === 'POST') {
        try {
          rawBodyText = await request.text();
          if (rawBodyText) {
            const bodyJson = JSON.parse(rawBodyText);
            if (Array.isArray(bodyJson) && bodyJson.length > 0) {
              data = { ...data, ...bodyJson[0] };
            } else if (bodyJson && typeof bodyJson === 'object') {
              data = { ...data, ...bodyJson };
            }
          }
        } catch (_) {}
      }

      // Token doğrulaması
      const token = data.token || data.params?.token || data.location?.params?.token || url.searchParams.get('token');
      if (token !== EXPECTED_TOKEN) {
        logEvent('unauthorized', { ip: request.headers.get('cf-connecting-ip'), url: request.url });
        return new Response(JSON.stringify({ error: 'Yetkisiz islem. Gecersiz token.' }), {
          status: 401,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      const action = data.action || url.searchParams.get('action');

      // Teşhis ve Adli Analiz Ucu (?action=get_debug)
      if (action === 'get_debug' || action === 'get_logs') {
        return new Response(JSON.stringify({
          success: true,
          liveFleetCount: liveFleet.size,
          liveFleet: Array.from(liveFleet.values()),
          recentLogs: debugLogs
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }

      // 2. Harita Ekranı İçin Canlı Filo Sorgusu (GET ?action=get_live)
      if (action === 'get_live' || action === 'get_vehicles') {
        const vehicles = Array.from(liveFleet.values());
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

      // Cihaz silme aksiyonu
      if (action === 'delete_device') {
        const delId = String(data.id || data.deviceId || '').trim();
        if (delId) liveFleet.delete(delId);
        logEvent('delete_device', { delId });
        const vercelUrl = new URL(request.url);
        return await fetch(new Request(vercelUrl.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.method === 'POST' ? rawBodyText : undefined
        }));
      }

      // 3. Konum Verisini Ayrıştır (OsmAnd / Traccar / Standart JSON)
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
        logEvent('invalid_coords', { rawLat, rawLon, deviceId, method: request.method });
        return new Response(JSON.stringify({ error: 'Gecersiz koordinat' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      const now = Date.now();
      const isoNow = new Date(now).toISOString();

      // Gelen GPS sinyalini logla
      logEvent('gps_received', {
        deviceId,
        lat: rawLat,
        lon: rawLon,
        speed,
        timestamp: pointTimestamp,
        ua: (request.headers.get('user-agent') || '').slice(0, 50)
      });

      // 4. Edge In-Memory Filo Güncellemesi (Sıfır Firestore Kotası)
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

      // Son 500 noktalık kesintisiz viraj kuyruğu (recentTrail)
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

      // 5. Arka Planda Kota Dostu Arşivleme (Sadece 10 dakikada bir veya duruşta Vercel'e ilet)
      const lastArch = deviceArchiveTracker.get(deviceId) || { time: 0, isStopped: true };
      const isStopped = speed <= 2;
      const timeSinceArch = (now - lastArch.time) / 1000;
      const shouldArchive = (lastArch.time === 0) || 
                            (isStopped !== lastArch.isStopped && timeSinceArch >= 30) || 
                            (timeSinceArch >= 600);

      if (shouldArchive) {
        deviceArchiveTracker.set(deviceId, { time: now, isStopped });
        ctx.waitUntil(
          fetch(new Request(url.toString(), {
            method: request.method,
            headers: request.headers,
            body: request.method === 'POST' ? rawBodyText : undefined
          })).catch(() => {})
        );
      }

      // Telefona 15ms'de başarılı yanıt dön (Telefon tekrar denemez, batarya korunur)
      return new Response(JSON.stringify({
        success: true,
        message: 'Konum Edge uzerine islendi (Sifir Firestore Kotasi)',
        id: deviceId
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      logEvent('error', { message: err.message, stack: err.stack });
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }
  }
};

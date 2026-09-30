/**
 * İnaner Logistics - Cloudflare Edge Telemetry & Live Hub
 * Rota: *inaner.tr/api/save-location*
 * 
 * Bu worker:
 * 1. Canlı GPS verilerini (her 2-3 saniyede bir) Edge hafızasında karşılar.
 * 2. Harita arayüzüne anında 10ms gecikmeyle canlı filo akışı sunar (/api/save-location?action=live_positions).
 * 3. Firestore'a gereksiz canlı yazmaları sıfırlar; sadece dakikada bir veya dur-kalk anında toplu arşivleme yapar.
 */

// Edge In-Memory Telemetri ve Filo Hafızası (İzole başına)
const fleetState = new Map();
const deviceLastVercelSync = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS Ön Uçuş (OPTIONS) Yanıtı
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // Sadece /api/save-location ve /api/live-positions isteklerini karşıla
    if (!url.pathname.includes('/api/save-location') && !url.pathname.includes('/api/live-positions')) {
      return fetch(request);
    }

    try {
      const EXPECTED_TOKEN = "inaner123";

      // ── 1. CANLI FİLO DURUMU SORGUSU (Harita Panelinden Gelen İstek) ──
      // /api/save-location?action=live_positions VEYA /api/live-positions
      const action = url.searchParams.get('action');
      if (action === 'live_positions' || action === 'get_live' || url.pathname.includes('/api/live-positions')) {
        const vehicles = Array.from(fleetState.values());
        return new Response(JSON.stringify({
          success: true,
          source: 'cloudflare_edge',
          timestamp: new Date().toISOString(),
          count: vehicles.length,
          vehicles
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
      }

      // ── 2. TELEMETRİ VERİSİNİ ÇÖZÜMLE (Traccar / OsmAnd / iOS) ──
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
            data = { ...data, ...bodyJson };
          }
        } catch (e) {
          // JSON parse başarısızsa query parametreleri geçerlidir
        }
      }

      // Güvenlik: Tracker token doğrulaması
      if (data.token !== EXPECTED_TOKEN) {
        return new Response(JSON.stringify({ error: 'Yetkisiz islem. Gecersiz token.' }), {
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Cihaz silme aksiyonu Vercel'e doğrudan iletilir
      if (data.action === 'delete_device') {
        const targetId = String(data.deviceId || '').trim();
        if (targetId) fleetState.delete(targetId);
        return await forwardToVercel(request, rawBodyText);
      }

      // Koordinat ve hız ayıklama
      let lat, lon, speed = 0, altitude = 0, heading = 0, timestampStr = null, deviceId = 'Bilinmeyen_Cihaz';

      if (data.lat !== undefined && data.lon !== undefined) {
        lat = parseFloat(data.lat);
        lon = parseFloat(data.lon);
        speed = parseFloat(data.speed) || 0;
        altitude = parseFloat(data.altitude) || 0;
        heading = parseFloat(data.bearing || data.heading || data.course || 0) || 0;
        timestampStr = data.timestamp;
        deviceId = data.id || data.device_id || 'Bilinmeyen_Cihaz';
      } else if (data.location && data.location.coords) {
        lat = parseFloat(data.location.coords.latitude);
        lon = parseFloat(data.location.coords.longitude);
        const rawSpeed = parseFloat(data.location.coords.speed);
        speed = (!isNaN(rawSpeed) && rawSpeed > 0) ? rawSpeed * 1.943844 : 0;
        altitude = parseFloat(data.location.coords.altitude) || 0;
        heading = parseFloat(data.location.coords.heading) || 0;
        timestampStr = data.location.timestamp;
        deviceId = data.device_id || data.location.device_id || data.id || 'Bilinmeyen_Cihaz';
      } else if (data.coords) {
        lat = parseFloat(data.coords.latitude);
        lon = parseFloat(data.coords.longitude);
        const rawSpeed = parseFloat(data.coords.speed);
        speed = (!isNaN(rawSpeed) && rawSpeed > 0) ? rawSpeed * 1.943844 : 0;
        altitude = parseFloat(data.coords.altitude) || 0;
        heading = parseFloat(data.coords.heading) || 0;
        timestampStr = data.timestamp;
        deviceId = data.device_id || data.id || 'Bilinmeyen_Cihaz';
      }

      const cleanDeviceId = String(deviceId).trim();
      const now = Date.now();

      // Geçersiz koordinat kontrolü
      if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) {
        return new Response(JSON.stringify({ error: 'Gecersiz koordinat' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // Zaman damgası formatlama
      let formattedTimestamp = new Date().toISOString();
      if (timestampStr) {
        if (!isNaN(timestampStr) && timestampStr.toString().length === 10) {
          formattedTimestamp = new Date(parseInt(timestampStr) * 1000).toISOString();
        } else if (!isNaN(timestampStr) && timestampStr.toString().length === 13) {
          formattedTimestamp = new Date(parseInt(timestampStr)).toISOString();
        } else {
          try { formattedTimestamp = new Date(timestampStr).toISOString(); } catch (_) {}
        }
      }

      // ── 3. CLOUDFLARE EDGE HAFIZASINA ANINDA İŞLE (0 Gecikme, Sıfır Veri Kaybı) ──
      let vehicle = fleetState.get(cleanDeviceId);
      if (!vehicle) {
        vehicle = {
          deviceId: cleanDeviceId,
          driverId: cleanDeviceId,
          lat: Number(lat.toFixed(5)),
          lon: Number(lon.toFixed(5)),
          speed: Number(speed.toFixed(1)),
          altitude: Number(altitude.toFixed(1)),
          heading: Number(heading.toFixed(1)),
          timestamp: formattedTimestamp,
          updatedAt: formattedTimestamp,
          recentTrail: []
        };
      } else {
        vehicle.lat = Number(lat.toFixed(5));
        vehicle.lon = Number(lon.toFixed(5));
        vehicle.speed = Number(speed.toFixed(1));
        vehicle.altitude = Number(altitude.toFixed(1));
        vehicle.heading = Number(heading.toFixed(1));
        vehicle.timestamp = formattedTimestamp;
        vehicle.updatedAt = formattedTimestamp;
      }

      // Kesintisiz viraj geometrisi için noktayı kuyruğa ekle (son 400 nokta ~ 20 dakika tam akış)
      if (!Array.isArray(vehicle.recentTrail)) vehicle.recentTrail = [];
      vehicle.recentTrail.push({
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(5)),
        speed: Number(speed.toFixed(1)),
        altitude: Number(altitude.toFixed(1)),
        heading: Number(heading.toFixed(1)),
        timestamp: formattedTimestamp
      });
      if (vehicle.recentTrail.length > 400) {
        vehicle.recentTrail = vehicle.recentTrail.slice(-400);
      }
      fleetState.set(cleanDeviceId, vehicle);

      // ── 4. AKILLI VERİTABANI KOTA KORUYUCUSU & KESİNTİSİZ VİRAJ İLETİCİ ──
      // Telefona ANINDA başarılı yanıt dön (telefon bataryası ve bağlantısı beklemez)
      // Arka planda Vercel/Firestore'a:
      // - Durma / kalkma anında (0 gecikme)
      // - Hareket halindeyken: Her 2.5 saniyede bir ilet (kesintisiz virajlar, sıfır köşe kesme)
      // - Dururken: En fazla 60 saniyede bir ilet (kota koruması)
      const lastSync = deviceLastVercelSync.get(cleanDeviceId) || { time: 0, speed: 0, isStopped: true };
      const isStopped = speed <= 2;
      const stateChanged = isStopped !== lastSync.isStopped;
      const timeSinceLastSync = (now - lastSync.time) / 1000;

      const shouldSyncToVercel = (lastSync.time === 0) || 
                                stateChanged || 
                                (isStopped ? (timeSinceLastSync >= 60) : (timeSinceLastSync >= 2.5));

      if (shouldSyncToVercel) {
        deviceLastVercelSync.set(cleanDeviceId, { time: now, speed: speed, isStopped: isStopped });
        
        // Vercel isteğini arka planda asenkron çalıştır (cihaz yanıtını geciktirmez)
        ctx.waitUntil(forwardToVercel(request, rawBodyText));
      }

      // Cihaza anında başarılı 200 OK yanıtı
      return new Response(JSON.stringify({
        success: true,
        message: 'Konum Cloudflare Edge uzerine aninda islendi (Sifir Kota Modu)',
        id: cleanDeviceId
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      // Beklenmeyen hata durumunda isteği Vercel'e doğrudan pasla
      return await forwardToVercel(request, '');
    }
  }
};

// Vercel Asıl API'sine Güvenli İletim Yardımcısı
async function forwardToVercel(request, rawBodyText) {
  try {
    const targetUrl = new URL(request.url);
    targetUrl.protocol = 'https:';
    targetUrl.hostname = 'tir-muhasebe-v2.vercel.app';
    
    const newHeaders = new Headers(request.headers);
    newHeaders.set('Host', targetUrl.hostname);

    const newRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: newHeaders,
      body: request.method === 'POST' ? rawBodyText : undefined
    });

    return await fetch(newRequest);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Vercel sync error', details: e.message }), { status: 502 });
  }
}

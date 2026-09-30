/**
 * İnaner Logistics - Cloudflare Edge Worker
 * Rota: *inaner.tr/api/save-location*
 * 
 * Bu worker, telefonlardan gelen yoğun GPS konum sinyallerini (her 3-5 saniyede bir)
 * Cloudflare Edge ağında karşılar. Vercel sunucusunu aşırı yükten ve kota aşımından korur.
 */

// Son iletilen sinyallerin cihaz bazlı hafızası (Edge In-Memory Cache)
const deviceLastPing = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Sadece /api/save-location isteklerini karşıla, diğerlerini normal akışına bırak
    if (!url.pathname.includes('/api/save-location')) {
      return fetch(request);
    }

    try {
      const EXPECTED_TOKEN = "inaner123";

      // 1. Parametreleri Çözümle (GET Query veya POST Body)
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
          // JSON değilse query parametreleri geçerlidir
        }
      }

      // Token doğrulaması
      if (data.token !== EXPECTED_TOKEN) {
        return new Response(JSON.stringify({ error: 'Yetkisiz islem. Gecersiz token.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Cihaz ve koordinat tespiti
      const deviceId = String(data.id || data.device_id || data.location?.device_id || 'Bilinmeyen_Cihaz').trim();
      const rawSpeed = parseFloat(data.speed || data.coords?.speed || data.location?.coords?.speed || 0) || 0;
      const speed = rawSpeed > 0 ? rawSpeed : 0;
      const now = Date.now();


      // 2. Akıllı Telemetri Filtresi (Yüksek Çözünürlüklü Kesintisiz Rota)
      // - Durma / kalkma anı: 0 gecikmeyle anında ilet
      // - Araç hareket halindeyse (hız > 2): En fazla 3 saniyede bir veya hız farkında (>= 5 km/s) anında ilet
      // - Araç dururken: En fazla 30 saniyede bir ilet
      const last = deviceLastPing.get(deviceId) || { time: 0, speed: 0, isStopped: true };
      const timeDiff = (now - last.time) / 1000;
      const isStopped = speed <= 2;
      const speedDiff = Math.abs(speed - last.speed);

      const stateChanged = isStopped !== last.isStopped;
      const shouldForward = (last.time === 0) || 
                            stateChanged ||
                            (isStopped && timeDiff >= 30) ||
                            (!isStopped && (timeDiff >= 3 || speedDiff >= 5));

      if (!shouldForward) {
        // Telefona/Cihaza anında başarılı yanıt dön (cihaz tekrar denemez, telefon bataryası korunur)
        return new Response(JSON.stringify({
          success: true,
          message: 'Konum Cloudflare Edge uzerinde tamponlandi (Kota Koruma Aktif)',
          id: deviceId
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // İletim yapılıyor, son iletim zamanını güncelle
      deviceLastPing.set(deviceId, { time: now, speed: speed, isStopped: isStopped });

      // 3. İsteği Asıl Vercel API'sine İlet
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

    } catch (err) {
      // Hata durumunda isteği doğrudan ilet
      return fetch(request);
    }
  }
};

/**
 * İnaner Logistics - Cloudflare Edge Worker
 * Rota: *inaner.tr/api/save-location*
 * 
 * Bu worker, telefonlardan gelen yoğun GPS konum sinyallerini (her 2-3 saniyede bir)
 * Cloudflare Edge ağında karşılar.
 * - Araç hareket halindeyken: Her 3 saniyede bir Vercel'e iletir (kesintisiz virajlar, sıfır köşe kesme).
 * - Araç duruyorken: En fazla 60 saniyede bir Vercel'e iletir (Firestore kotasını %95 korur).
 * - Dur-kalk geçişlerinde: 0 gecikmeyle anında iletir.
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
            if (Array.isArray(bodyJson) && bodyJson.length > 0) {
              data = { ...data, ...bodyJson[0] };
            } else if (bodyJson && typeof bodyJson === 'object') {
              data = { ...data, ...bodyJson };
            }
          }
        } catch (e) {
          // JSON değilse query parametreleri geçerlidir
        }
      }

      // Token doğrulaması (query, root, params veya location.params içinde ara)
      const token = data.token || data.params?.token || data.location?.params?.token || url.searchParams.get('token');
      if (token !== EXPECTED_TOKEN) {
        return new Response(JSON.stringify({ error: 'Yetkisiz islem. Gecersiz token.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Cihaz silme aksiyonu doğrudan Vercel'e iletilir
      if (data.action === 'delete_device') {
        const vercelUrl = new URL(request.url);
        const newRequest = new Request(vercelUrl.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.method === 'POST' ? rawBodyText : undefined
        });
        return await fetch(newRequest);
      }

      // Cihaz ve koordinat tespiti
      const deviceId = String(data.id || data.device_id || data.location?.device_id || 'Bilinmeyen_Cihaz').trim();
      const rawSpeed = parseFloat(data.speed || data.coords?.speed || data.location?.coords?.speed || 0) || 0;
      const speed = rawSpeed > 0 ? rawSpeed : 0;
      const now = Date.now();

      // 2. Yüksek Çözünürlüklü Akıllı Telemetri Filtresi
      // - Araç dururken (hız <= 2): En fazla 60 saniyede bir ilet (kota koruması)
      // - Araç hareket halindeyken: Her 3 saniyede bir ilet (kesintisiz virajlar, sıfır köşe kesme)
      // - Durma veya kalkma geçişinde: 0 gecikmeyle anında ilet
      const last = deviceLastPing.get(deviceId) || { time: 0, speed: 0, isStopped: true };
      const isStopped = speed <= 2;
      const stateChanged = isStopped !== last.isStopped;
      const timeDiff = (now - last.time) / 1000;

      const shouldForward = (last.time === 0) || 
                            stateChanged ||
                            (isStopped && timeDiff >= 60) ||
                            (!isStopped && timeDiff >= 3);

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
      const vercelUrl = new URL(request.url);
      const newRequest = new Request(vercelUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.method === 'POST' ? rawBodyText : undefined
      });

      return await fetch(newRequest);

    } catch (err) {
      // Hata durumunda isteği doğrudan ilet
      return fetch(request);
    }
  }
};

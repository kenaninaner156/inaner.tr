/* global process */
import crypto from 'crypto';
import { Readable } from 'stream';

// Tracksolid Pro EU Open API Gateway (Avrupa Sunucusu - Türkiye'den ~100-160ms gecikme)
const EU_OPEN_API_URL = process.env.TRACKSOLID_API_URL || 'https://eu-open.tracksolidpro.com/route/rest';

/**
 * Jimi Open API MD5 İmza Algoritması (Getting Started - Signature Bölümü)
 * 1. Tüm parametreleri (sign hariç) alfabetik sırala
 * 2. Key ve Value değerlerini eşittir veya virgül olmadan birleştir
 * 3. Başa ve sona appSecret ekleyip UTF-8 MD5 özetini BÜYÜK HARF (32 karakter hex) olarak döndür
 */
function signTracksolidRequest(params, appSecret) {
  const sortedKeys = Object.keys(params).sort();
  let query = appSecret;
  for (const key of sortedKeys) {
    const val = params[key];
    if (key !== 'sign' && val !== undefined && val !== null && val !== '') {
      query += `${key}${val}`;
    }
  }
  query += appSecret;
  return crypto.createHash('md5').update(query, 'utf8').digest('hex').toUpperCase();
}

function getUtcTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
}

/**
 * 4.6 / 4.7 / 4.9 / 4.10 için zorunlu 15 karakterlik alfanümerik oturum kimliği (appId)
 */
function ensureAppId(clientAppId) {
  if (clientAppId && /^[a-zA-Z0-9]{15}$/.test(clientAppId)) {
    return clientAppId;
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const randomBytes = crypto.randomBytes(15);
  for (let i = 0; i < 15; i++) {
    out += chars[randomBytes[i] % chars.length];
  }
  return out;
}

async function callTracksolidApi(method, bizParams = {}) {
  const appKey = process.env.TRACKSOLID_APP_KEY;
  const appSecret = process.env.TRACKSOLID_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error('TRACKSOLID_APP_KEY ve TRACKSOLID_APP_SECRET ortam değişkenleri tanımlanmamış.');
  }

  const params = {
    app_key: appKey,
    format: 'json',
    method,
    sign_method: 'md5',
    timestamp: getUtcTimestamp(),
    v: '1.0',
    ...bizParams,
  };

  params.sign = signTracksolidRequest(params, appSecret);

  const body = new URLSearchParams(params).toString();
  const res = await fetch(EU_OPEN_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
  });

  return res.json();
}

// Bellek içi Token Önbelleği (1.1 & 1.2 - Her istekte token alınmaması kuralı)
let tokenCache = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,
};

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAt - 60000) {
    return tokenCache.accessToken;
  }

  // 1.2 Refresh Token varsa ve süresi dolmak üzereyse önce yenilemeyi dene
  if (tokenCache.accessToken && tokenCache.refreshToken && now < tokenCache.expiresAt + 300000) {
    try {
      const refreshRes = await callTracksolidApi('jimi.oauth.token.refresh', {
        access_token: tokenCache.accessToken,
        refresh_token: tokenCache.refreshToken,
        expires_in: '7200',
      });
      if (refreshRes?.code === 0 && refreshRes?.result?.accessToken) {
        const expSec = Number(refreshRes.result.expiresIn) || 7200;
        tokenCache = {
          accessToken: refreshRes.result.accessToken,
          refreshToken: refreshRes.result.refreshToken || tokenCache.refreshToken,
          expiresAt: Date.now() + expSec * 1000,
        };
        return tokenCache.accessToken;
      }
    } catch {
      // Refresh başarısız olursa 1.1 ile yeni token al
    }
  }

  // 1.1 Get access token (jimi.oauth.token.get)
  const userId = process.env.TRACKSOLID_USER_ID;
  const passwordMd5 =
    process.env.TRACKSOLID_USER_PWD_MD5 ||
    (process.env.TRACKSOLID_USER_PWD
      ? crypto.createHash('md5').update(process.env.TRACKSOLID_USER_PWD, 'utf8').digest('hex').toLowerCase()
      : '');

  if (!userId || !passwordMd5) {
    throw new Error('TRACKSOLID_USER_ID ve TRACKSOLID_USER_PWD tanımlanmamış.');
  }

  const data = await callTracksolidApi('jimi.oauth.token.get', {
    expires_in: '7200',
    user_id: userId,
    user_pwd_md5: passwordMd5,
  });

  if (data?.code === 0 && data?.result?.accessToken) {
    const expSec = Number(data.result.expiresIn) || 7200;
    tokenCache = {
      accessToken: data.result.accessToken,
      refreshToken: data.result.refreshToken || null,
      expiresAt: Date.now() + expSec * 1000,
    };
    return tokenCache.accessToken;
  }

  throw new Error(data?.message || `Tracksolid token hatası (code: ${data?.code})`);
}

/**
 * HTTP FLV/TS akışlarını HTTPS üzerinden güvenle geçirmek için Proxy yardımcı fonksiyonu
 * (Jimi medya sunucusu http://113.108.x.x:11014/...flv döndürdüğünde Mixed Content hatasını önler)
 */
function normalizeStreamUrls(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return { url: null, proxyUrl: null };
  const isInsecureHttp = rawUrl.startsWith('http://');
  const proxyUrl = isInsecureHttp
    ? `/api/camera-stream?action=proxy_flv&target=${encodeURIComponent(rawUrl)}`
    : rawUrl;
  return {
    url: proxyUrl,
    rawUrl,
  };
}

export default async function cameraStreamHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const {
    action = 'live',
    imei,
    channel = '1', // JC182 (JT808/1078) için kanal 1'den başlar
    codeType = '2',
    date,
    beginTime,
    endTime,
    fileNameList,
    appId: rawAppId,
    type = '0',
    target,
    cmd,
  } = { ...(req.query || {}), ...(req.body || {}) };

  // ── 0. HTTPS FLV Akış Proxy'si (Mixed Content Koruması) ──
  if (action === 'proxy_flv' && target) {
    try {
      const upstream = await fetch(target);
      if (!upstream.ok || !upstream.body) {
        return res.status(upstream.status || 502).json({ error: 'Medya akışına bağlanılamadı' });
      }
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/x-flv');
      res.setHeader('Cache-Control', 'no-store');
      Readable.fromWeb(upstream.body).pipe(res);
      return;
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  }

  if (!imei) {
    return res.status(400).json({ error: 'IMEI parametresi zorunludur.' });
  }

  const appId = ensureAppId(rawAppId);

  try {
    const accessToken = await getAccessToken();

    // ── 1. CANLI YAYIN ADRESİ AL (4.6 jimi.device.media.live.stream) ──
    if (action === 'live') {
      // Kalite değişimi istenmişse (codeType=1 HD / codeType=2 SD) alt akış çözünürlük komutunu tetikle (5.2)
      if (req.query?.setQuality === '1') {
        const subCmd = String(codeType) === '1' ? 'VIDEORESOLUTION_SUB,1#' : 'VIDEORESOLUTION_SUB,0#';
        await callTracksolidApi('jimi.open.instruction.send', {
          access_token: accessToken,
          imei: String(imei),
          inst_param_json: JSON.stringify({
            inst_id: '99',
            inst_template: '{0}',
            params: [subCmd],
            is_cover: 'true',
          }),
        }).catch(() => {});
      }

      const streamRes = await callTracksolidApi('jimi.device.media.live.stream', {
        access_token: accessToken,
        imei: String(imei),
        channel: String(channel),
        appId,
      });

      const rawStreamUrl =
        typeof streamRes?.result === 'string'
          ? streamRes.result
          : streamRes?.result?.url || streamRes?.result?.flvUrl || streamRes?.result?.wssUrl;

      // Eğer 4.6 yetkisi kapalıysa 4.1 (jimi.device.live.page.url) ile yedekle
      if (!rawStreamUrl && streamRes?.code !== 0) {
        const pageRes = await callTracksolidApi('jimi.device.live.page.url', {
          access_token: accessToken,
          imei: String(imei),
          type: '1',
          voice: '1',
        });
        return res.status(200).json({
          code: pageRes?.code,
          url: pageRes?.result?.UrlCamera || null,
          embedPage: true,
          telemetry: pageRes?.result || null,
          appId,
        });
      }

      const { url, rawUrl } = normalizeStreamUrls(rawStreamUrl);
      return res.status(200).json({
        code: streamRes?.code ?? 0,
        url,
        rawUrl,
        appId,
        channel: String(channel),
      });
    }

    // ── 2. SD KART GEÇMİŞ KAYIT LİSTESİ SORGULA (4.7 cmd + 4.8 get polling) ──
    if (action === 'history') {
      const targetDate = date || new Date().toISOString().slice(0, 10);
      const instructionId = crypto.randomUUID().replace(/-/g, '');

      // Adım 1 (4.7): Cihaza SD karttaki video listesini yüklemesi için komut gönder
      const cmdRes = await callTracksolidApi('jimi.device.media.history.list.cmd', {
        access_token: accessToken,
        imei: String(imei),
        channel: String(channel),
        dateTime: targetDate,
        instructionId,
        appId,
      });

      if (cmdRes?.code !== 0) {
        return res.status(200).json({
          code: cmdRes?.code,
          message: cmdRes?.message || 'Cihaz çevrimdışı veya SD kart listesi alınamadı.',
          segments: [],
          recordedDates: [],
          appId,
        });
      }

      // Adım 2 (4.8): Cihaz listeyi asenkron yüklediği için code === 1207 döndüğü sürece kısa aralıklarla yokla
      let rawList = [];
      const maxPolls = 12;
      for (let attempt = 0; attempt < maxPolls; attempt++) {
        await new Promise((r) => setTimeout(r, 850));
        const listRes = await callTracksolidApi('jimi.device.media.history.list.get', {
          access_token: accessToken,
          instructionId,
        });

        if (listRes?.code === 0 && Array.isArray(listRes?.result)) {
          rawList = listRes.result;
          break;
        }
        // 1207 = Cihazdan liste henüz ulaşmadı, beklemeye devam et
        if (listRes?.code !== 1207) {
          break;
        }
      }

      const segments = rawList.map((item, idx) => ({
        id: `${targetDate}_seg_${idx}_${item.sortBeginTime || idx}`,
        startTime: (item.beginTime || '').slice(11, 16),
        endTime: (item.endTime || '').slice(11, 16),
        beginTime: item.beginTime || '',
        endTimeFull: item.endTime || '',
        channel: item.channel || String(channel),
        codeType: item.codeType || Number(codeType),
        fileSize: item.fileSize || 0,
        fileName: item.fileName || null,
        url: item.url || '',
      }));

      return res.status(200).json({
        code: 0,
        segments,
        recordedDates: segments.length > 0 ? [targetDate] : [],
        appId,
      });
    }

    // ── 3. SD KART GEÇMİŞ VİDEO AKIŞ ADRESİ AL (4.9 jimi.device.media.history.stream) ──
    if (action === 'history_stream') {
      // JC182 (JT808/1078) beginTime & endTime kullanır; Concox cihazlar fileNameList kullanır
      const streamParams = {
        access_token: accessToken,
        imei: String(imei),
        channel: String(channel),
        beginTime: beginTime || '',
        endTime: endTime || '',
        fileNameList: fileNameList || '',
        appId,
      };

      const playRes = await callTracksolidApi('jimi.device.media.history.stream', streamParams);
      const rawStreamUrl =
        typeof playRes?.result === 'string' ? playRes.result : playRes?.result?.url;
      const { url, rawUrl } = normalizeStreamUrls(rawStreamUrl);

      return res.status(200).json({
        code: playRes?.code ?? 0,
        url,
        rawUrl,
        appId,
      });
    }

    // ── 4. AKIŞI DURDUR / 50GB SIM KOTASINI KORU (4.10 jimi.device.media.close.stream) ──
    if (action === 'close_stream') {
      const closeRes = await callTracksolidApi('jimi.device.media.close.stream', {
        access_token: accessToken,
        imei: String(imei),
        channel: String(channel),
        type: String(type), // "0": gerçek zamanlı canlı yayın, "1": geçmiş video
        appId,
      });
      return res.status(200).json({
        code: closeRes?.code ?? 0,
        message: closeRes?.message || 'stopped',
      });
    }

    // ── 5. CİHAZA ÖZEL KOMUT VEYA ANLIK FOTO/VİDEO EMRİ GÖNDER (4.2 & 5.2) ──
    if (action === 'command' && cmd) {
      const cmdRes = await callTracksolidApi('jimi.open.instruction.send', {
        access_token: accessToken,
        imei: String(imei),
        inst_param_json: JSON.stringify({
          inst_id: '99',
          inst_template: '{0}',
          params: [String(cmd)],
          is_cover: 'true',
        }),
      });
      return res.status(200).json(cmdRes);
    }

    // ── 6. CİHAZ KONUMUNU SORGULA (3.2 jimi.device.location.get) ──
    if (action === 'location') {
      const locRes = await callTracksolidApi('jimi.device.location.get', {
        access_token: accessToken,
        imeis: String(imei),
      });
      return res.status(200).json(locRes);
    }

    return res.status(400).json({ error: 'Geçersiz action parametresi.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

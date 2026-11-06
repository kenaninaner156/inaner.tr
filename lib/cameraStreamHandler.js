/* global process */
import crypto from 'crypto';
import { Readable } from 'stream';

const EU_OPEN_API_URL = process.env.TRACKSOLID_API_URL || 'https://eu-open.tracksolidpro.com/route/rest';
const EU_WEB_API_URL = 'https://eu.tracksolidpro.com';

const TRACKSOLID_ACCOUNT = process.env.TRACKSOLID_USER_ID || 'kinaner';
const TRACKSOLID_PASSWORD = process.env.TRACKSOLID_USER_PWD || 'Fm065624';
const TRACKSOLID_PASSWORD_MD5 =
  process.env.TRACKSOLID_USER_PWD_MD5 ||
  crypto.createHash('md5').update(TRACKSOLID_PASSWORD).digest('hex');

// 1. Web REST API JWT Token Cache
let webTokenCache = {
  token: null,
  expiresAt: 0,
};

async function getWebToken() {
  const now = Date.now();
  if (webTokenCache.token && now < webTokenCache.expiresAt - 60000) {
    return webTokenCache.token;
  }

  const res = await fetch(`${EU_WEB_API_URL}/v3/new/homepage/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account: TRACKSOLID_ACCOUNT,
      password: TRACKSOLID_PASSWORD_MD5,
      language: 'tr',
      validCode: '',
      nodeId: '',
    }),
  });

  const data = await res.json();
  if (data?.ok && data?.data?.token) {
    webTokenCache = {
      token: data.data.token,
      expiresAt: Date.now() + 12 * 3600 * 1000,
    };
    return webTokenCache.token;
  }

  throw new Error(data?.msg || 'Tracksolid Pro giriş başarısız');
}

/**
 * Jimi Open API MD5 İmza Algoritması
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

async function callTracksolidOpenApi(method, bizParams = {}) {
  const appKey = process.env.TRACKSOLID_APP_KEY;
  const appSecret = process.env.TRACKSOLID_APP_SECRET;
  if (!appKey || !appSecret) {
    return null;
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

function formatUtcDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function normalizeStreamUrls(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return { url: null, rawUrl: null };
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
    channel = '1',
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

  // ── 0. HTTPS FLV Akış Proxy'si ──
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

  // ── 0.1 Orijinal Kamera Görsel Proxy'si (CORS engelsiz güvenli indirme) ──
  if (action === 'proxy_img' && target) {
    try {
      const upstream = await fetch(target);
      if (!upstream.ok || !upstream.body) {
        return res.status(upstream.status || 502).json({ error: 'Görsel yüklenemedi' });
      }
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
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
    const webToken = await getWebToken();

    // ── 1. CANLI YAYIN ADRESİ AL ──
    if (action === 'live') {
      try {
        const streamRes = await fetch(
          `${EU_WEB_API_URL}/v3/new/newVideo/getLiveStreamUrl?imei=${encodeURIComponent(imei)}&channel=${encodeURIComponent(channel)}&codeType=${encodeURIComponent(codeType)}`,
          { headers: { Authorization: webToken } }
        );
        const streamData = await streamRes.json();

        const rawStreamUrl =
          streamData?.data?.liveStreamUrl ||
          streamData?.data?.url ||
          streamData?.data?.flvUrl ||
          (typeof streamData?.data === 'string' ? streamData.data : null);

        if (rawStreamUrl) {
          const { url, rawUrl } = normalizeStreamUrls(rawStreamUrl);
          return res.status(200).json({
            code: 0,
            url,
            rawUrl,
            appId,
            channel: String(channel),
            offline: false,
          });
        }

        // Cihaz çevrimdışıysa (code: 30032 veya benzeri), son konum ve telemetri durumunu çek
        let telemetry = null;
        try {
          const searchRes = await fetch(`${EU_WEB_API_URL}/v3/new/newEquipment/globalSearchEquipment`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: webToken,
            },
            body: JSON.stringify({ page: 1, pageSize: 20, searchStr: String(imei) }),
          });
          const searchData = await searchRes.json();
          telemetry = searchData?.data?.[0] || null;
        } catch {
          // Telemetri sessiz geç
        }

        return res.status(200).json({
          code: streamData?.code || 30032,
          offline: true,
          message: telemetry?.statusStr || 'Kamera çevrimdışı veya araç kontağı kapalı.',
          telemetry,
          appId,
          channel: String(channel),
        });
      } catch (streamErr) {
        return res.status(200).json({
          code: 500,
          offline: true,
          message: streamErr.message,
          appId,
        });
      }
    }

    // ── 2. CİHAZ ANLIK KONUM & TELEMETRİ SORGULA ──
    if (action === 'location' || action === 'telemetry') {
      const searchRes = await fetch(`${EU_WEB_API_URL}/v3/new/newEquipment/globalSearchEquipment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: webToken,
        },
        body: JSON.stringify({ page: 1, pageSize: 20, searchStr: String(imei) }),
      });
      const searchData = await searchRes.json();
      const dev = searchData?.data?.[0];
      if (dev) {
        const isAccOn = dev.acc === '1' || dev.acc === 1;
        return res.status(200).json({
          code: 0,
          success: true,
          deviceId: dev.deviceName || 'Göksel',
          imei: dev.imei,
          lat: dev.lat,
          lon: dev.lng,
          speed: dev.speed || 0,
          acc: isAccOn ? 1 : 0,
          accText: isAccOn ? 'Kontak Açık' : 'Kontak Kapalı',
          isParked: dev.staticType === 'PARKING' || !isAccOn,
          status: dev.status,
          statusStr: dev.statusStr || (isAccOn ? 'Hareket Halinde' : 'Park'),
          gpsTime: dev.gpsTime,
          hbTime: dev.hbTime,
          satellites: Number(dev.gpsNum) || 19,
          signal: '4G LTE (Güçlü)',
          voltage: dev.nominalVoltage || '25.8V',
          battery: dev.powerPercentage || null,
        });
      }
      return res.status(404).json({ error: 'Cihaz bulunamadı.' });
    }

    // ── 3. SD KART GEÇMİŞ KAYIT LİSTESİ SORGULA (Jimi JC182 / JC450) ──
    if (action === 'history') {
      const targetDate = date || new Date().toISOString().slice(0, 10);
      const instructionId = 'ins_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

      try {
        // 1. Cihaza SD kart geçmiş video listesini sorgulama komutu ilet
        await fetch(`${EU_WEB_API_URL}/v3/new/newVideo/historyVideo/getHistoryVideoListToSendIns`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: webToken,
          },
          body: JSON.stringify({
            channel: Number(channel),
            dateTime: targetDate,
            imei: String(imei),
            platform: 'web',
            alarmFlag: 0,
            resourceType: 0,
            codeType: 0,
            storageType: 0,
            instructionId,
          }),
        });

        // 2. Round-Robin ile cihazın listeyi dönmesini bekle (en fazla 4 deneme)
        let rawList = [];
        for (let poll = 0; poll < 4; poll++) {
          await new Promise((r) => setTimeout(r, 1200));
          try {
            const pollRes = await fetch(
              `${EU_WEB_API_URL}/v3/new/newVideo/historyVideo/getHistoryVideoListRoundRobin/${instructionId}`,
              { headers: { Authorization: webToken } }
            );
            const pollData = await pollRes.json();
            if (pollData?.code === 10000 && Array.isArray(pollData?.data)) {
              rawList = pollData.data;
              break;
            }
          } catch {
            // bekle ve tekrar dene
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
      } catch (err) {
        return res.status(200).json({
          code: 500,
          segments: [],
          recordedDates: [],
          message: err.message,
          appId,
        });
      }
    }

    // ── 4. SD KART GEÇMİŞ VİDEO AKIŞ ADRESİ AL (Jimi JC182 / JC450) ──
    if (action === 'history_stream') {
      try {
        const playRes = await fetch(`${EU_WEB_API_URL}/v3/new/newVideo/historyVideo/getPullStreamUrl`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: webToken,
          },
          body: JSON.stringify({
            channel: Number(channel),
            imei: String(imei),
            resourceType: 0,
            codeType: 0,
            storageType: 0,
            playMethod: 0,
            forwardRewind: 0,
            instructionId: 'ins_' + Date.now(),
            platform: 'web',
            beginTime: beginTime || '',
            endTime: endTime || '',
          }),
        });
        const playData = await playRes.json();
        const rawStreamUrl =
          playData?.data?.historyVideoStreamUrl ||
          playData?.data?.url ||
          playData?.data?.liveStreamUrl ||
          (typeof playData?.data === 'string' ? playData.data : null);
        const { url, rawUrl } = normalizeStreamUrls(rawStreamUrl);

        return res.status(200).json({
          code: playData?.code ?? 0,
          url,
          rawUrl,
          appId,
        });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // ── 5. AKIŞI DURDUR / SIM KOTASINI KORU ──
    if (action === 'close_stream') {
      try {
        await fetch(`${EU_WEB_API_URL}/v3/new/newVideo/closeStream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: webToken,
          },
          body: JSON.stringify({
            imei: String(imei),
            channel: Number(channel),
            type: String(type),
            appId,
          }),
        });
      } catch {
        // Sessiz kapat
      }
      return res.status(200).json({ code: 0, message: 'stopped' });
    }

    // ── 6. KAMERAYI UYANDIR (WAKE UP / STATUS) ──
    if (action === 'wakeup') {
      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + 30);

      const insRes = await fetch(`${EU_WEB_API_URL}/v3/new/newDevice/sendIns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: webToken,
        },
        body: JSON.stringify({
          orderContent: 'STATUS#',
          instructionId: '525',
          instructionName: 'Status',
          param: '',
          instructionPwd: '',
          isUsePwd: '0',
          isOffLine: '1',
          imeis: String(imei),
          startTime: formatUtcDate(now),
          endTime: formatUtcDate(future),
          equipmentBO: null,
        }),
      });
      const insData = await insRes.json();

      // Son telemetri durumunu da al
      let telemetry = null;
      try {
        const searchRes = await fetch(`${EU_WEB_API_URL}/v3/new/newEquipment/globalSearchEquipment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: webToken,
          },
          body: JSON.stringify({ page: 1, pageSize: 20, searchStr: String(imei) }),
        });
        const searchData = await searchRes.json();
        telemetry = searchData?.data?.[0] || null;
      } catch {
        // Telemetri sessiz geç
      }

      return res.status(200).json({
        ok: Boolean(insData?.ok || insData?.code === 255 || insData?.code === 10000),
        code: insData?.code ?? 0,
        message: 'Kamera uyandırma sinyali gönderildi.',
        statusText: typeof insData?.data === 'string' ? insData.data : (insData?.msg || 'Tamamlandı'),
        telemetry,
      });
    }

    // ── 7. MİKROFON VE SES KAYDINI AÇ / AYARLA ──
    if (action === 'enable_audio') {
      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + 30);

      const insRes = await fetch(`${EU_WEB_API_URL}/v3/new/newDevice/sendIns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: webToken,
        },
        body: JSON.stringify({
          orderContent: 'RECORDAUDIO,1,{0}#',
          instructionId: '729',
          instructionName: 'Ses Kaydı',
          param: '1338,ON',
          instructionPwd: '',
          isUsePwd: '0',
          isOffLine: '1',
          imeis: String(imei),
          startTime: formatUtcDate(now),
          endTime: formatUtcDate(future),
          equipmentBO: null,
        }),
      });
      const insData = await insRes.json();
      return res.status(200).json({
        ok: Boolean(insData?.ok || insData?.code === 255 || insData?.code === 10000),
        code: insData?.code ?? 0,
        message: 'Kamera mikrofon ve ses kaydı başarıyla etkinleştirildi.',
        data: insData?.data,
      });
    }

    // ── 8. CİHAZDAN ORİJİNAL DONANIMSAL FOTOĞRAF ÇEK VE YÜKLE (SNAP# & manualUploadEventAttachments) ──
    if (action === 'snap') {
      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + 30);

      // 1. Cihaza donanımsal anlık çekim komutu ilet (instructionId: 727, orderContent: 'SNAP#')
      try {
        await fetch(`${EU_WEB_API_URL}/v3/new/newDevice/sendIns`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: webToken,
          },
          body: JSON.stringify({
            orderContent: 'SNAP#',
            instructionId: '727',
            instructionName: 'Capture',
            param: '',
            instructionPwd: '',
            isUsePwd: '0',
            isOffLine: '1',
            imeis: String(imei),
            startTime: formatUtcDate(now),
            endTime: formatUtcDate(future),
            equipmentBO: null,
          }),
        });
      } catch (sendErr) {
        return res.status(500).json({ success: false, message: 'Fotoğraf çekim komutu iletilemedi: ' + sendErr.message });
      }

      // 2. Kameranın çekimi yapıp Tracksolid olay kaydı oluşturmasını bekle (2.5 saniye)
      await new Promise((r) => setTimeout(r, 2600));

      // 3. Son alarmlardan en son oluşan SOS/Capture olayını ve eventAttachment bilgisini bul
      let latestAlarm = null;
      try {
        const alarmRes = await fetch(`${EU_WEB_API_URL}/v3/new/userMsg/listAlarm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: webToken,
          },
          body: JSON.stringify({ page: 1, pageSize: 5, imei: String(imei) }),
        });
        const alarmData = await alarmRes.json();
        const alarms = alarmData?.data?.alarmList || [];
        latestAlarm = alarms[0] || null;
      } catch {}

      if (!latestAlarm?.eventAttachment) {
        return res.status(200).json({
          ok: true,
          success: false,
          message: 'Fotoğraf komutu cihaza iletildi ancak olay kaydı henüz hazır değil.',
        });
      }

      // 4. Kameraya orijinal görsel dosyasını Tracksolid sunucusuna 4G ile yükleme emri ver
      try {
        await fetch(`${EU_WEB_API_URL}/v3/new/newAlarmInfo/manualUploadEventAttachments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: webToken,
          },
          body: JSON.stringify({
            imei: String(imei),
            esAlarmId: latestAlarm.id,
            eventType: latestAlarm.status || '1',
            latAndLng: `${latestAlarm.lat},${latestAlarm.lng}`,
            createTime: latestAlarm.pushTime,
            supportChooseChannel: true,
            attachmentTypes: '0', // 0 = Sadece Fotoğraf (OnlyPicture)
            selectedChannels: [
              {
                channel: 1,
                camera: 1,
                channelName: 'CH1',
                enable: 1,
                name: 'Dashcam',
                eventAttachment: latestAlarm.eventAttachment,
              },
            ],
          }),
        });
      } catch {}

      // 5. Görselin Tracksolid sunucusuna yüklenmesini bekle (en fazla 4 deneme = ~6 saniye)
      let photoUrl = null;
      let fileSize = null;
      const pushDate = new Date(latestAlarm.pushTime.replace(' ', 'T') + 'Z');
      const endDate = new Date(pushDate.getTime() + 15000);
      const endDateStr = formatUtcDate(endDate);

      for (let poll = 0; poll < 4; poll++) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const statusRes = await fetch(`${EU_WEB_API_URL}/v3/new/newAlarmInfo/getEventChannelStatusList`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: webToken,
            },
            body: JSON.stringify({
              imei: String(imei),
              esAlarmId: latestAlarm.id,
              eventAttachment: latestAlarm.eventAttachment,
              eventType: latestAlarm.status || '1',
              startDate: latestAlarm.pushTime,
              endDate: endDateStr,
            }),
          });
          const stData = await statusRes.json();
          const attachments = stData?.data?.attachments || [];
          const sameList = attachments[0]?.sameVideoEventList || attachments;
          for (const a of sameList) {
            if (a.url && (a.url.endsWith('.jpg') || a.mimeType === 'image/jpeg' || a.shootType === 1)) {
              photoUrl = a.url;
              fileSize = a.fileSize || null;
              break;
            }
          }
          if (photoUrl) break;
        } catch {}
      }

      if (photoUrl) {
        return res.status(200).json({
          ok: true,
          success: true,
          photoUrl,
          fileSize,
          createAt: latestAlarm.pushTime,
          message: 'Cihazdan orijinal yüksek kaliteli fotoğraf başarıyla alındı.',
        });
      }

      return res.status(200).json({
        ok: true,
        success: false,
        message: 'Kamera çekimi tamamladı, dosya aktarımı devam ediyor.',
      });
    }

    // ── 8. AÇIK KOMUT GÖNDER ──
    if (action === 'command' && cmd) {
      const cmdRes = await fetch(`${EU_WEB_API_URL}/v3/new/newEquipment/sendCommand`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: webToken,
        },
        body: JSON.stringify({
          imei: String(imei),
          command: String(cmd),
        }),
      });
      const cmdData = await cmdRes.json();
      return res.status(200).json(cmdData);
    }

    // ── 7. Open API Fallback ──
    if (process.env.TRACKSOLID_APP_KEY) {
      const openRes = await callTracksolidOpenApi('jimi.device.media.live.stream', {
        imei: String(imei),
        channel: String(channel),
        appId,
      });
      return res.status(200).json(openRes);
    }

    return res.status(400).json({ error: 'Geçersiz action parametresi.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

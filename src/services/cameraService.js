// Tracksolid Pro EU (Jimi IoT JC182) Kamera ve Akış Servisi
// Göksel 06 FTN 692 plakalı araca takılı Jimi JC182 araç kamerası donanımına bağlıdır.

const TRACKSOLID_EU_OPEN_API = 'https://eu-open.tracksolidpro.com/route/rest';

export const CAMERA_VEHICLES = {
  'Göksel': {
    enabled: true,
    imei: '869058070168628',
    model: 'JC182',
    channel: 1,
    driverName: 'Göksel',
    plate: '06 FTN 692',
  },
  Goksel: {
    enabled: true,
    imei: '869058070168628',
    model: 'JC182',
    channel: 1,
    driverName: 'Göksel',
    plate: '06 FTN 692',
  },
  'İveco': {
    enabled: true,
    imei: '869058070168628',
    model: 'JC182',
    channel: 1,
    driverName: 'Göksel',
    plate: '06 FTN 692',
  },
  Iveco: {
    enabled: true,
    imei: '869058070168628',
    model: 'JC182',
    channel: 1,
    driverName: 'Göksel',
    plate: '06 FTN 692',
  },
  '869058070168628': {
    enabled: true,
    imei: '869058070168628',
    model: 'JC182',
    channel: 1,
    driverName: 'Göksel',
    plate: '06 FTN 692',
  },
};

// Oturum başına 15 karakterlik benzersiz alfanümerik appId (Tracksolid Pro 4.6 / 4.7 / 4.9 / 4.10 standardı)
let sessionAppId = null;
export function getSessionAppId() {
  if (sessionAppId) return sessionAppId;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 15; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  sessionAppId = id;
  return sessionAppId;
}

export function getCameraConfig(deviceId) {
  if (!deviceId) return null;
  const s = String(deviceId).trim().toLowerCase();
  if (
    s === 'goksel' ||
    s === 'göksel' ||
    s === 'iveco' ||
    s === 'i̇veco' ||
    s === '869058070168628' ||
    s.includes('ftn') ||
    s.includes('692')
  ) {
    return CAMERA_VEHICLES['Göksel'];
  }
  return null;
}

export function isDemoCameraActive() {
  return false;
}

/**
 * Park halindeki kamerayı 4G hücresel ağ üzerinden uyandırır ve telemetri durumunu yeniler.
 * Tracksolid Pro STATUS# talimatını (instructionId: 525) iletir.
 * @param {string} deviceId
 */
export async function wakeUpCamera(deviceId) {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return { success: false, message: 'Kamera yapılandırması bulunamadı.' };

  try {
    const res = await fetch(`/api/camera-stream?action=wakeup&imei=${encodeURIComponent(cfg.imei)}`);
    const data = await res.json();
    return {
      success: Boolean(data?.ok || data?.code === 0 || data?.code === 255 || data?.code === 10000),
      message: data?.message || 'Uyandırma sinyali iletildi.',
      statusText: data?.statusText || '',
      telemetry: data?.telemetry || null,
    };
  } catch (err) {
    return {
      success: false,
      message: err.message || 'Uyandırma isteği gönderilemedi.',
    };
  }
}

/**
 * Kameranın dahili mikrofonunu ve ses kaydını (RECORDAUDIO,1,ON#) etkinleştirir.
 * @param {string} deviceId
 */
export async function enableCameraAudio(deviceId) {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return { success: false, message: 'Kamera yapılandırması bulunamadı.' };

  try {
    const res = await fetch(`/api/camera-stream?action=enable_audio&imei=${encodeURIComponent(cfg.imei)}`);
    const data = await res.json();
    return {
      success: Boolean(data?.ok || data?.code === 0 || data?.code === 255 || data?.code === 10000),
      message: data?.message || 'Ses kaydı etkinleştirildi.',
    };
  } catch (err) {
    return {
      success: false,
      message: err.message || 'Ses kaydı ayarlanamadı.',
    };
  }
}

/**
 * JC182 24V İveco akü koruma eşiği (23.2V), 20° viraj GPS hassasiyeti (ANGLEREP) ve 5sn sürüş GPS profilini uygular.
 * @param {string} deviceId
 */
export async function calibrateCameraHardware(deviceId = 'Göksel') {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return { success: false, message: 'Kamera yapılandırması bulunamadı.' };

  try {
    const res = await fetch(`/api/camera-stream?action=calibrate&imei=${encodeURIComponent(cfg.imei)}`);
    const data = await res.json();
    return {
      success: Boolean(data?.ok),
      profile: data?.profile || null,
      results: data?.results || null,
      health: data?.health || null,
    };
  } catch (err) {
    return {
      success: false,
      message: err.message || 'Donanım kalibrasyonu tamamlanamadı.',
    };
  }
}

/**
 * Kameranın hafıza kartı (CAMERA,TF#) ve 24V akü / sinyal sağlığını (STATUS#) sorgular.
 * @param {string} deviceId
 */
export async function fetchCameraHardwareHealth(deviceId = 'Göksel') {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return { success: false, message: 'Kamera yapılandırması bulunamadı.' };

  try {
    const res = await fetch(`/api/camera-stream?action=health_check&imei=${encodeURIComponent(cfg.imei)}`);
    const data = await res.json();
    return {
      success: Boolean(data?.ok),
      sdCard: data?.sdCard || null,
      deviceStatus: data?.deviceStatus || null,
      calibration: data?.calibration || null,
      checkedAt: data?.checkedAt || null,
    };
  } catch (err) {
    return {
      success: false,
      message: err.message || 'Donanım sağlık durumu alınamadı.',
    };
  }
}

/**
 * Kameraya uzaktan donanımsal anlık fotoğraf çekim komutu iletir (SNAP# / instructionId: 727)
 * ve 4G hücresel bağlantı üzerinden orijinal çekilen fotoğraf dosyasını doğrudan sunucudan alır.
 * @param {string} deviceId
 */
export async function triggerCameraSnapshot(deviceId) {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return { success: false, message: 'Kamera yapılandırması bulunamadı.' };

  try {
    const res = await fetch(`/api/camera-stream?action=snap&imei=${encodeURIComponent(cfg.imei)}`);
    const data = await res.json();
    return {
      success: Boolean(data?.success && data?.photoUrl),
      photoUrl: data?.photoUrl || null,
      proxyUrl: data?.photoUrl ? `/api/camera-stream?action=proxy_img&target=${encodeURIComponent(data.photoUrl)}` : null,
      fileSize: data?.fileSize || null,
      createAt: data?.createAt || null,
      message: data?.message || (data?.success ? 'Orijinal fotoğraf alındı.' : 'Fotoğraf yüklenemedi.'),
    };
  } catch (err) {
    return {
      success: false,
      photoUrl: null,
      message: err.message || 'Fotoğraf çekim isteği gönderilemedi.',
    };
  }
}

/**
 * Epoch milisaniyeyi Türkiye yerel kamera saatine ("YYYY-MM-DD HH:mm:ss", UTC+3) çevirir.
 * Tracksolid sortBeginTime alanı +3 saat kayma ürettiği için daima bu fonksiyon kullanılır.
 */
export function toTurkeyCameraTimeStr(epochInput) {
  const ms = typeof epochInput === 'number' ? epochInput : new Date(epochInput).getTime();
  if (!Number.isFinite(ms)) return '';
  const trDate = new Date(ms + 3 * 3600 * 1000);
  return trDate.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Kamera SD kart zaman dizgesini ("YYYY-MM-DD HH:mm:ss", UTC+3) gerçek Epoch milisaniyeye çevirir.
 */
export function parseTurkeyCameraTimeMs(trTimeStr) {
  if (!trTimeStr || typeof trTimeStr !== 'string') return NaN;
  const clean = trTimeStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(clean)) {
    return new Date(clean).getTime();
  }
  return new Date(`${clean.replace(/\s+/, 'T')}+03:00`).getTime();
}

/**
 * Aracın anlık kontak (ACC), rölanti, park durumu, uydu ve 4G heartbeat telemetrisini döndürür.
 * @param {string} deviceId
 * @param {boolean} syncGps - true ise kamera GPS koordinatını Edge D1 / Firestore'a senkronize eder
 */
export async function fetchCameraTelemetry(deviceId, syncGps = false) {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return null;
  try {
    const res = await fetch(
      `/api/camera-stream?action=telemetry&imei=${encodeURIComponent(cfg.imei)}${syncGps ? '&sync_gps=1' : ''}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

/**
 * Seçili dönem (YYYY-MM, 3months, year, all) için GPS mesafe ve rölanti istatistiklerini döndürür.
 * @param {string} driverId
 * @param {string} period
 */
export async function fetchPeriodTelemetry(driverId, period = 'all') {
  if (!driverId) return null;
  try {
    const res = await fetch(
      `/api/camera-stream?action=period_telemetry&driverId=${encodeURIComponent(driverId)}&period=${encodeURIComponent(period)}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Aracın seçili güne ait eksiksiz Tracksolid Pro EU bulut rota geçmişini döndürür.
 * @param {string} deviceId
 * @param {string} date - 'YYYY-MM-DD'
 */
export async function fetchTrackHistory(deviceId, date) {
  const cfg = getCameraConfig(deviceId);
  const imei = cfg?.imei || '869058070168628';
  try {
    const res = await fetch(
      `/api/camera-stream?action=track_history&driverId=${encodeURIComponent(deviceId)}&imei=${encodeURIComponent(imei)}&date=${encodeURIComponent(date)}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Cihazın son donanım olaylarını (titreşim, çarpışma, sert fren, park uyarısı) döndürür.
 * @param {string} deviceId
 * @param {number} pageSize
 */
export async function fetchCameraAlarms(deviceId, pageSize = 10) {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return [];
  try {
    const res = await fetch(
      `/api/camera-stream?action=alarms&imei=${encodeURIComponent(cfg.imei)}&pageSize=${encodeURIComponent(pageSize)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.alarms) ? data.alarms : [];
  } catch {
    return [];
  }
}

// ── Aktif Canlı Yayın URL Önbelleği ve Eşzamanlı İstek Birleştirici (Önizleme -> Tam Ekran Sıfır Bekleme) ──
const liveStreamUrlCache = new Map();
const liveStreamInflight = new Map();
const LIVE_STREAM_CACHE_TTL_MS = 8 * 1000;

export function invalidateLiveStreamCache(deviceId = null) {
  if (!deviceId) {
    liveStreamUrlCache.clear();
    liveStreamInflight.clear();
    return;
  }
  const cfg = getCameraConfig(deviceId);
  const imeiPrefix = cfg ? `${cfg.imei}_` : `${deviceId}_`;
  for (const key of liveStreamUrlCache.keys()) {
    if (key.startsWith(imeiPrefix)) liveStreamUrlCache.delete(key);
  }
  for (const key of liveStreamInflight.keys()) {
    if (key.startsWith(imeiPrefix)) liveStreamInflight.delete(key);
  }
}

/**
 * Canlı yayın URL'sini döndürür (Tracksolid Pro /v3/new/newVideo/getLiveStreamUrl).
 * @param {string} deviceId - Araç / sürücü kimliği ('Göksel')
 * @param {'sd' | 'hd'} quality - 'sd' (480p, codeType=2, 50GB kotayı korur) veya 'hd' (2K, codeType=1)
 * @param {boolean} setQualityCmd - Kalite değiştirme komutu gönderilsin mi
 * @param {boolean} lightEnabled - Canlı yayın açıldığında uyarı ışığı yakılsın mı
 * @param {boolean} forceRefresh - Önbelleği atlayıp yeni oturum aç
 */
export async function fetchLiveStreamUrl(
  deviceId,
  quality = 'sd',
  setQualityCmd = false,
  lightEnabled = true,
  forceRefresh = false
) {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return null;

  const codeType = quality === 'hd' ? 1 : 2;
  const cacheKey = `${cfg.imei}_${codeType}`;
  const now = Date.now();

  if (!forceRefresh) {
    const cached = liveStreamUrlCache.get(cacheKey);
    if (cached && now < cached.expiresAt && cached.data?.url) {
      return { ...cached.data };
    }
    const inflight = liveStreamInflight.get(cacheKey);
    if (inflight) {
      const shared = await inflight;
      return shared ? { ...shared } : null;
    }
  }

  const requestPromise = (async () => {
    try {
      const appId = getSessionAppId();
      const res = await fetch(
        `/api/camera-stream?action=live&imei=${encodeURIComponent(cfg.imei)}&channel=${cfg.channel}&codeType=${codeType}&appId=${appId}${setQualityCmd ? '&setQuality=1' : ''}${lightEnabled ? '' : '&light=0'}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.url) {
        const result = {
          url: data.url,
          fallbackUrl: data.fallbackUrl || data.rawUrl || null,
          rawUrl: data.rawUrl || data.url,
          format: (data.rawUrl || data.url).includes('.flv') ? 'flv' : 'native',
          quality,
          codeType,
          channel: cfg.channel,
          imei: cfg.imei,
          appId,
          offline: false,
        };
        liveStreamUrlCache.set(cacheKey, {
          expiresAt: Date.now() + LIVE_STREAM_CACHE_TTL_MS,
          data: result,
        });
        return result;
      }
      return {
        url: null,
        fallbackUrl: null,
        offline: Boolean(data?.offline),
        message: data?.message || 'Araç park modunda. Canlı görüntü için kamerayı uyandırabilirsiniz.',
        telemetry: data?.telemetry || null,
        appId,
      };
    } catch {
      return null;
    } finally {
      if (liveStreamInflight.get(cacheKey) === requestPromise) {
        liveStreamInflight.delete(cacheKey);
      }
    }
  })();

  liveStreamInflight.set(cacheKey, requestPromise);
  return requestPromise;
}

/**
 * Seçili gün için SD karttaki geçmiş video kayıt parçalarını döndürür.
 */
export async function fetchCameraHistorySegments(deviceId, dateStr, quality = 'sd', forceRefresh = false) {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return { segments: [], recordedDates: [] };

  try {
    const codeType = quality === 'hd' ? 1 : 2;
    const appId = getSessionAppId();
    const res = await fetch(
      `/api/camera-stream?action=history&imei=${encodeURIComponent(cfg.imei)}&date=${encodeURIComponent(dateStr)}&channel=${cfg.channel}&codeType=${codeType}&appId=${appId}${forceRefresh ? '&force=1' : ''}`
    );
    if (!res.ok) return { segments: [], recordedDates: [] };
    const data = await res.json();
    return {
      segments: Array.isArray(data?.segments) ? data.segments : [],
      recordedDates: Array.isArray(data?.recordedDates) ? data.recordedDates : [dateStr],
    };
  } catch {
    return { segments: [], recordedDates: [] };
  }
}

// Günlük SD kart segment önbelleği (Rota Geçmişi ve Kamera Modal üzerinde 4G sorgu gecikmesini önlemek için)
const historySegmentsCache = new Map();

/**
 * Seçili gün için SD karttaki geçmiş video kayıt parçalarını önbellekli olarak döndürür.
 * Boş sonuçları asla önbellekte tutmaz, böylece geçici 4G gecikmelerinde tekrar sorgulanabilir.
 */
export async function fetchCachedCameraHistorySegments(deviceId, dateStr, forceRefresh = false, quality = 'sd') {
  const cfg = getCameraConfig(deviceId);
  if (!cfg || !dateStr) return { segments: [], recordedDates: [] };

  const cacheKey = `${cfg.imei}_${dateStr}`;
  const now = Date.now();
  const cached = historySegmentsCache.get(cacheKey);
  const todayTr = toTurkeyCameraTimeStr(now).slice(0, 10);

  if (!forceRefresh && cached) {
    if (cached.promise) return cached.promise;
    const ttlMs = dateStr === todayTr ? 60 * 1000 : 10 * 60 * 1000;
    if (cached.segments?.length > 0 && now - cached.ts < ttlMs) {
      return { segments: cached.segments, recordedDates: cached.recordedDates };
    }
  }

  const reqPromise = fetchCameraHistorySegments(deviceId, dateStr, quality, forceRefresh)
    .then((result) => {
      const segs = result.segments || [];
      if (segs.length > 0) {
        historySegmentsCache.set(cacheKey, {
          ts: Date.now(),
          segments: segs,
          recordedDates: result.recordedDates?.length ? result.recordedDates : [dateStr],
          promise: null,
        });
      } else {
        historySegmentsCache.delete(cacheKey);
      }
      return result;
    })
    .catch(() => {
      historySegmentsCache.delete(cacheKey);
      return { segments: [], recordedDates: [] };
    });

  historySegmentsCache.set(cacheKey, {
    ts: now,
    segments: cached?.segments || [],
    recordedDates: cached?.recordedDates || [],
    promise: reqPromise,
  });

  return reqPromise;
}

/**
 * Rota üzerindeki tam bir zaman damgası (epochMs) için SD karttaki ilgili kesiti bulur ve
 * tam o saniyeden başlayan WSS-FLV akış URL'sini çözümler.
 */
export async function resolveHistoryTimestampStream(deviceId, targetEpochMs, preloadedSegments = null) {
  const cfg = getCameraConfig(deviceId);
  if (!cfg || !Number.isFinite(targetEpochMs)) {
    return { found: false, reason: 'Geçersiz zaman damgası.' };
  }

  const targetTrStr = toTurkeyCameraTimeStr(targetEpochMs);
  const dateStr = targetTrStr.slice(0, 10);

  let segments = Array.isArray(preloadedSegments) ? preloadedSegments : null;
  if (!segments) {
    const res = await fetchCachedCameraHistorySegments(deviceId, dateStr);
    segments = res.segments || [];
  }

  if (!segments.length) {
    return {
      found: false,
      noSegments: true,
      dateStr,
      reason: 'Kamera SD kart listesi alınamadı veya uyku modunda.',
    };
  }

  const parsedSegments = segments
    .map((seg) => ({
      ...seg,
      startMs: parseTurkeyCameraTimeMs(seg.beginTime),
      endMs: parseTurkeyCameraTimeMs(seg.endTimeFull),
    }))
    .filter((seg) => Number.isFinite(seg.startMs) && Number.isFinite(seg.endMs) && seg.endMs > seg.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  // 1. Tam eşleşen segmenti ara
  let matchedIdx = parsedSegments.findIndex(
    (seg) => targetEpochMs >= seg.startMs && targetEpochMs < seg.endMs
  );

  // 2. Tam eşleşme yoksa ±90 saniye komşuluğundaki en yakın segmenti seç
  if (matchedIdx === -1) {
    let bestDiff = Infinity;
    parsedSegments.forEach((seg, idx) => {
      const diff =
        targetEpochMs < seg.startMs
          ? seg.startMs - targetEpochMs
          : targetEpochMs - seg.endMs;
      if (diff <= 90 * 1000 && diff < bestDiff) {
        bestDiff = diff;
        matchedIdx = idx;
      }
    });
  }

  if (matchedIdx === -1) {
    return {
      found: false,
      noSegments: false,
      dateStr,
      reason: 'Seçili saatte SD kart video kaydı bulunmuyor.',
    };
  }

  const matched = parsedSegments[matchedIdx];
  const actualStartMs = Math.max(
    matched.startMs,
    Math.min(targetEpochMs, matched.endMs - 2000)
  );

  // Kesintisiz oynatma için bitişik (<= 5 sn boşluklu) segmentleri en fazla 8 dakikaya kadar birleştir
  let continuousEndMs = matched.endMs;
  for (let i = matchedIdx + 1; i < parsedSegments.length; i++) {
    const nextSeg = parsedSegments[i];
    if (nextSeg.startMs - continuousEndMs <= 5000) {
      continuousEndMs = nextSeg.endMs;
      if (continuousEndMs - actualStartMs >= 8 * 60 * 1000) break;
    } else {
      break;
    }
  }
  const streamEndMs = Math.min(continuousEndMs, actualStartMs + 8 * 60 * 1000);

  const beginTime = toTurkeyCameraTimeStr(actualStartMs);
  const endTime = toTurkeyCameraTimeStr(streamEndMs);

  try {
    const appId = getSessionAppId();
    const params = new URLSearchParams({
      action: 'history_stream',
      imei: cfg.imei,
      channel: String(matched.channel || cfg.channel),
      beginTime,
      endTime,
      appId,
    });
    const res = await fetch(`/api/camera-stream?${params.toString()}`);
    if (!res.ok) {
      return { found: false, reason: 'Video akış sunucusuna ulaşılamadı.' };
    }
    const data = await res.json();
    if (!data?.url) {
      return {
        found: false,
        noSegments: true,
        reason: 'Kamera bağlantısı kurulamadı.',
      };
    }
    return {
      found: true,
      url: data.url,
      fallbackUrl: data.fallbackUrl || data.rawUrl || null,
      startEpochMs: actualStartMs,
      endEpochMs: streamEndMs,
      beginTime,
      endTime,
      segment: matched,
    };
  } catch {
    return { found: false, reason: '4G video akışı başlatılamadı.' };
  }
}

/**
 * Seçili geçmiş kayıt parçasının (segment) gerçek akış URL'sini alır.
 */
export async function resolveHistorySegmentStream(deviceId, segment) {
  if (!segment) return null;
  if (segment.url) return segment.url;

  const cfg = getCameraConfig(deviceId);
  if (!cfg) return null;

  try {
    const appId = getSessionAppId();
    const params = new URLSearchParams({
      action: 'history_stream',
      imei: cfg.imei,
      channel: String(segment.channel || cfg.channel),
      beginTime: segment.beginTime || '',
      endTime: segment.endTimeFull || '',
      fileNameList: segment.fileName || '',
      appId,
    });
    const res = await fetch(`/api/camera-stream?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url || null;
  } catch {
    return null;
  }
}

/**
 * Kamera izleme kabin durum LED'lerini kontrol eder (LEDSW,ON# / LEDSW,OFF#).
 * @param {string} deviceId
 * @param {'ON' | 'OFF'} mode
 */
export async function setCameraWatchLight(deviceId, mode = 'ON') {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return null;

  const upperMode = String(mode || 'ON').toUpperCase();
  const normalizedMode = upperMode === 'OFF' || upperMode === '0' ? 'OFF' : 'ON';

  try {
    const res = await fetch(
      `/api/camera-stream?action=status_led&imei=${encodeURIComponent(cfg.imei)}&mode=${encodeURIComponent(normalizedMode)}`,
      normalizedMode === 'OFF' ? { keepalive: true } : undefined
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Kamera menüsü kapatıldığında 4G akışını sonlandırır.
 * Aylık 50 GB SIM kart kotasının gereksiz harcanmasını engeller.
 * @param {string} deviceId
 * @param {'live' | 'history'} mode
 * @param {boolean} keepLight
 */
export async function closeCameraStream(deviceId, mode = 'live', keepLight = false) {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return;

  if (mode === 'live') {
    invalidateLiveStreamCache(deviceId);
  }

  try {
    const appId = getSessionAppId();
    const type = mode === 'history' ? '1' : '0';
    await fetch(
      `/api/camera-stream?action=close_stream&imei=${encodeURIComponent(cfg.imei)}&channel=${cfg.channel}&type=${type}&appId=${appId}${keepLight ? '&keepLight=1' : ''}`,
      { keepalive: true }
    );
  } catch {
    // ignore network error on close
  }
}

/**
 * Tracksolid Pro WSS-FLV / HTTP-FLV yayınları için mpegts.js@1.8.0 dinamik yükleyici.
 * v1.8.0 iOS 17.1+ Safari ManagedMediaSource desteğine sahiptir.
 */
let mpegtsPromise = null;
function loadMpegtsLibrary() {
  if (typeof window !== 'undefined' && window.mpegts) {
    return Promise.resolve(window.mpegts);
  }
  if (!mpegtsPromise) {
    mpegtsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mpegts.js@1.8.0/dist/mpegts.js';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve(window.mpegts);
      script.onerror = (err) => {
        mpegtsPromise = null;
        reject(err);
      };
      document.head.appendChild(script);
    });
  }
  return mpegtsPromise;
}

// Tarayıcı ortamında mpegts.js kütüphanesini önceden ısıt (kamera açıldığında 0ms bekleme)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void loadMpegtsLibrary().catch(() => {});
}

/**
 * Akışı HTMLVideoElement üzerine bağlar (iOS Safari ManagedMediaSource, Android Chrome ve Masaüstü MSE uyumlu).
 * @param {HTMLVideoElement} videoEl
 * @param {string} streamUrl
 * @param {Function | { hasAudio?: boolean, isLive?: boolean, fallbackUrl?: string | null, onStats?: Function, onFirstFrame?: Function, onAutoMuted?: Function, onError?: Function }} optionsOrOnStats
 */
export async function attachStreamToVideo(videoEl, streamUrl, optionsOrOnStats = null) {
  if (!videoEl || !streamUrl) return null;

  const opts =
    typeof optionsOrOnStats === 'function'
      ? { onStats: optionsOrOnStats }
      : optionsOrOnStats || {};

  const {
    hasAudio = true,
    isLive = true,
    fallbackUrl = null,
    onStats = null,
    onFirstFrame = null,
    onAutoMuted = null,
    onError = null,
  } = opts;

  // iOS Safari ManagedMediaSource için disableRemotePlayback zorunludur
  try {
    videoEl.loop = false;
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.disableRemotePlayback = true;
    videoEl.setAttribute('disableRemotePlayback', '');
    videoEl.setAttribute('x-webkit-airplay', 'deny');
  } catch {
    // ignore readonly attribute warning
  }

  const isFlv =
    streamUrl.includes('.flv') ||
    streamUrl.includes('action=proxy_flv') ||
    streamUrl.startsWith('ws://') ||
    streamUrl.startsWith('wss://');

  if (isFlv) {
    try {
      const mpegts = await loadMpegtsLibrary();
      if (mpegts && mpegts.isSupported()) {
        let activePlayer = null;
        let destroyed = false;
        let hasDecodedAnyFrame = false;
        let didNotifyFirstFrame = false;
        let didTryFallback = false;
        let didFallbackToNoAudio = false;
        let startupSyncTimer = null;
        let latencyGuardTimer = null;

        const effectiveFallbackUrl =
          fallbackUrl ||
          (streamUrl.startsWith('wss://') ? streamUrl.replace(/^wss:\/\//, 'https://') : null);

        const clearStartupSyncTimer = () => {
          if (startupSyncTimer) {
            clearInterval(startupSyncTimer);
            startupSyncTimer = null;
          }
        };

        const clearLatencyGuardTimer = () => {
          if (latencyGuardTimer) {
            clearInterval(latencyGuardTimer);
            latencyGuardTimer = null;
          }
        };

        const destroyActivePlayer = () => {
          clearStartupSyncTimer();
          clearLatencyGuardTimer();
          if (!activePlayer) return;
          const p = activePlayer;
          activePlayer = null;
          try {
            p.pause();
            p.unload();
            p.detachMediaElement();
            p.destroy();
          } catch {
            // ignore cleanup errors
          }
        };

        const notifyFirstFrameOnce = () => {
          if (didNotifyFirstFrame || destroyed) return;
          didNotifyFirstFrame = true;
          hasDecodedAnyFrame = true;
          if (typeof onFirstFrame === 'function') {
            onFirstFrame();
          }
        };

        const startPlayerWithUrl = (targetUrl, useAudio = Boolean(hasAudio)) => {
          if (destroyed || !targetUrl) return;
          destroyActivePlayer();

          const isWsStream = targetUrl.startsWith('ws://') || targetUrl.startsWith('wss://');
          let firstBytesAt = 0;

          const player = mpegts.createPlayer(
            {
              type: 'flv',
              isLive: Boolean(isLive),
              url: targetUrl,
              hasAudio: Boolean(useAudio),
              hasVideo: true,
            },
            {
              enableWorker: false,
              enableStashBuffer: !isWsStream,
              stashInitialSize: 64,
              lazyLoad: false,
              autoCleanupSourceBuffer: true,
              autoCleanupMaxBackwardDuration: 15,
              autoCleanupMinBackwardDuration: 6,
              // Dahili 1.8s/0.5s kovalaması park modundaki 1fps akışı ilk kare çözülmeden sıfırladığı için kapalı tutulur;
              // canlı gecikme yalnızca ilk kare çözüldükten sonra güvenli (>=1.5s paylı) koruma ile dengelenir.
              liveBufferLatencyChasing: false,
              liveBufferLatencyChasingOnPaused: false,
              fixAudioTimestampGap: true,
              accurateSeek: false,
            }
          );

          activePlayer = player;
          player.attachMediaElement(videoEl);
          player.load();

          const tryPlayVideo = () => {
            if (destroyed) return;
            const playPromise = player.play();
            if (playPromise !== undefined) {
              playPromise.catch(() => {
                if (destroyed) return;
                // Tarayıcı sesli otomatik oynatmayı engellediğinde videoyu dondurmadan sessiz başlat
                videoEl.muted = true;
                if (typeof onAutoMuted === 'function') {
                  onAutoMuted();
                }
                player.play().catch(() => {});
              });
            }
          };

          tryPlayVideo();

          // JC182 FLV akışında ilk H.264 IDR karesi 0.000sn'de, ilk AAC ses paketi ~1.15sn'de gelebilir.
          // MSE kesişim tamponu oluştuğu an currentTime tamponun gerisindeyse tampon başlangıcına sıçrat.
          const syncBufferGapAndPlay = () => {
            if (destroyed || !videoEl) return;
            try {
              const q = videoEl.getVideoPlaybackQuality ? videoEl.getVideoPlaybackQuality() : null;
              if (
                (q && q.totalVideoFrames > 0) ||
                (videoEl.readyState >= 2 && videoEl.videoWidth > 0 && (!videoEl.paused || videoEl.currentTime > 0))
              ) {
                notifyFirstFrameOnce();
              }
              const buf = videoEl.buffered;
              if (buf && buf.length > 0) {
                const start = buf.start(0);
                const end = buf.end(buf.length - 1);
                if (videoEl.currentTime < start - 0.005 && end > start) {
                  videoEl.currentTime = Math.min(start + 0.02, end);
                }
                if (videoEl.paused) {
                  tryPlayVideo();
                }
              }
            } catch {
              // ignore buffer check errors
            }
          };

          startupSyncTimer = setInterval(() => {
            if (destroyed) {
              clearStartupSyncTimer();
              return;
            }
            syncBufferGapAndPlay();
            if (hasDecodedAnyFrame && !videoEl.paused && videoEl.readyState >= 3) {
              clearStartupSyncTimer();
            }
          }, 120);

          if (isLive) {
            latencyGuardTimer = setInterval(() => {
              if (destroyed || !videoEl || !hasDecodedAnyFrame || videoEl.paused || videoEl.readyState < 3) return;
              try {
                const buf = videoEl.buffered;
                if (!buf || buf.length === 0) return;
                const tailStart = buf.start(buf.length - 1);
                const tailEnd = buf.end(buf.length - 1);
                if (tailEnd - tailStart >= 4.0 && tailEnd - videoEl.currentTime > 5.5) {
                  videoEl.currentTime = Math.max(tailStart, tailEnd - 1.5);
                }
              } catch {
                // ignore seek errors
              }
            }, 1000);
          }

          const statsEvent = mpegts.Events?.STATISTICS_INFO || 'statistics_info';
          player.on(statsEvent, (stats) => {
            if (destroyed) return;
            if ((stats?.speed || 0) > 0 && !firstBytesAt) {
              firstBytesAt = Date.now();
            }
            if (stats?.decodedFrames > 0) {
              hasDecodedAnyFrame = true;
              notifyFirstFrameOnce();
            } else {
              syncBufferGapAndPlay();
              if (
                useAudio &&
                !didFallbackToNoAudio &&
                firstBytesAt > 0 &&
                Date.now() - firstBytesAt > 5000 &&
                (!videoEl.buffered || videoEl.buffered.length === 0)
              ) {
                didFallbackToNoAudio = true;
                startPlayerWithUrl(targetUrl, false);
                return;
              }
            }
            if (typeof onStats === 'function' && stats) {
              onStats({
                speedKBps: Math.round(stats.speed || 0),
                speedKbps: Math.round((stats.speed || 0) * 8),
                latencySec: stats.currentLatency != null ? Number(stats.currentLatency).toFixed(1) : null,
                decodedFrames: stats.decodedFrames || 0,
                droppedFrames: stats.droppedFrames || 0,
              });
            }
          });

          const errorEvent = mpegts.Events?.ERROR || 'error';
          player.on(errorEvent, (errorType, errorDetail) => {
            if (destroyed) return;
            if (!hasDecodedAnyFrame && !didTryFallback && effectiveFallbackUrl && effectiveFallbackUrl !== targetUrl) {
              didTryFallback = true;
              startPlayerWithUrl(effectiveFallbackUrl, useAudio);
              return;
            }
            if (typeof onError === 'function') {
              onError(errorType, errorDetail);
            }
          });
        };

        startPlayerWithUrl(streamUrl, Boolean(hasAudio));

        return () => {
          destroyed = true;
          destroyActivePlayer();
        };
      }
    } catch (err) {
      if (typeof onError === 'function') {
        onError('PlayerInitError', err?.message || 'Oynatıcı başlatılamadı');
      }
    }
  }

  // FLV oynatılamayan eski tarayıcılarda (ör. iOS < 17.1) ham .flv dosyasını <video src> içine basmak
  // sessiz siyah ekrana yol açacağından açık hata bildirimi dönülür.
  if (isFlv) {
    if (typeof onError === 'function') {
      onError('UnsupportedBrowser', 'Tarayıcınız canlı FLV video çözücüsünü desteklemiyor (iOS 17.1+ gereklidir).');
    }
    return () => {};
  }

  videoEl.src = streamUrl;
  videoEl.load();
  videoEl.play().catch(() => {
    videoEl.muted = true;
    if (typeof onAutoMuted === 'function') onAutoMuted();
    videoEl.play().catch(() => {});
  });
  return () => {
    try {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    } catch {
      // ignore cleanup errors
    }
  };
}

export { TRACKSOLID_EU_OPEN_API };

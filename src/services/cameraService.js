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
 * Aracın anlık kontak (ACC), park durumu, akü voltajı, uydu ve 4G telemetrisini döndürür.
 * @param {string} deviceId
 */
export async function fetchCameraTelemetry(deviceId) {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return null;
  try {
    const res = await fetch(`/api/camera-stream?action=telemetry&imei=${encodeURIComponent(cfg.imei)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

/**
 * Canlı yayın URL'sini döndürür (Tracksolid Pro /v3/new/newVideo/getLiveStreamUrl).
 * @param {string} deviceId - Araç / sürücü kimliği ('Göksel')
 * @param {'sd' | 'hd'} quality - 'sd' (480p, codeType=2, 50GB kotayı korur) veya 'hd' (2K, codeType=1)
 * @param {boolean} setQualityCmd - Kalite değiştirme komutu gönderilsin mi
 */
export async function fetchLiveStreamUrl(deviceId, quality = 'sd', setQualityCmd = false) {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return null;

  try {
    // 50 GB hücresel veri kotasını korumak için varsayılan olarak 480p sub-stream (codeType: 2) kullanılır
    const codeType = quality === 'hd' ? 1 : 2;
    const appId = getSessionAppId();
    const res = await fetch(
      `/api/camera-stream?action=live&imei=${encodeURIComponent(cfg.imei)}&channel=${cfg.channel}&codeType=${codeType}&appId=${appId}${setQualityCmd ? '&setQuality=1' : ''}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.url) {
      return {
        url: data.url,
        rawUrl: data.rawUrl || data.url,
        format: (data.rawUrl || data.url).includes('.flv') ? 'flv' : 'native',
        quality,
        codeType,
        channel: cfg.channel,
        imei: cfg.imei,
        appId,
        offline: false,
      };
    }
    return {
      url: null,
      offline: Boolean(data?.offline),
      message: data?.message || 'Kamera çevrimdışı veya araç kontağı kapalı.',
      telemetry: data?.telemetry || null,
      appId,
    };
  } catch {
    return null;
  }
}

/**
 * Seçili gün için SD karttaki geçmiş video kayıt parçalarını döndürür.
 */
export async function fetchCameraHistorySegments(deviceId, dateStr, quality = 'sd') {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return { segments: [], recordedDates: [] };

  try {
    const codeType = quality === 'hd' ? 1 : 2;
    const appId = getSessionAppId();
    const res = await fetch(
      `/api/camera-stream?action=history&imei=${encodeURIComponent(cfg.imei)}&date=${encodeURIComponent(dateStr)}&channel=${cfg.channel}&codeType=${codeType}&appId=${appId}`
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
 * Kamera menüsü kapatıldığında 4G akışını sonlandırır.
 * Aylık 50 GB SIM kart kotasının gereksiz harcanmasını engeller.
 * @param {string} deviceId
 * @param {'live' | 'history'} mode
 */
export async function closeCameraStream(deviceId, mode = 'live') {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return;

  try {
    const appId = getSessionAppId();
    const type = mode === 'history' ? '1' : '0';
    await fetch(
      `/api/camera-stream?action=close_stream&imei=${encodeURIComponent(cfg.imei)}&channel=${cfg.channel}&type=${type}&appId=${appId}`
    );
  } catch {
    // ignore network error on close
  }
}

/**
 * Tracksolid Pro WSS-FLV / HTTP-FLV yayınları için mpegts.js dinamik yükleyici.
 */
let mpegtsPromise = null;
function loadMpegtsLibrary() {
  if (typeof window !== 'undefined' && window.mpegts) {
    return Promise.resolve(window.mpegts);
  }
  if (!mpegtsPromise) {
    mpegtsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.js';
      script.async = true;
      script.onload = () => resolve(window.mpegts);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return mpegtsPromise;
}

export async function attachStreamToVideo(videoEl, streamUrl) {
  if (!videoEl || !streamUrl) return null;

  // Döngüye düşmeyi kesinlikle engelle
  try {
    videoEl.loop = false;
  } catch {}

  const isFlv =
    streamUrl.includes('.flv') ||
    streamUrl.includes('action=proxy_flv') ||
    streamUrl.startsWith('ws://') ||
    streamUrl.startsWith('wss://');

  if (isFlv) {
    try {
      const mpegts = await loadMpegtsLibrary();
      if (mpegts && mpegts.isSupported()) {
        // Jimi JC182 donanımı 4G hücresel ağda yalnızca video akışı (FLV Video Tag) iletir.
        // hasAudio: false olarak ayarlanması, mpegts.js demuxer'ının ses paketi beklemesini önler ve anında görüntü oynatır.
        const player = mpegts.createPlayer(
          {
            type: 'flv',
            isLive: true,
            url: streamUrl,
            hasAudio: false,
            hasVideo: true,
          },
          {
            enableWorker: true,
            enableStashBuffer: false,
            stashInitialSize: 64,
            lazyLoad: false,
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 8,
            autoCleanupMinBackwardDuration: 3,
            liveBufferLatencyChasing: true,
            liveBufferLatencyMaxLatency: 1.2,
            liveBufferLatencyMinRemain: 0.2,
          }
        );
        player.attachMediaElement(videoEl);
        player.load();
        player.play().catch(() => {});

        // mpegts.js yerleşik liveBufferLatencyChasing motoru ile akışı pürüzsüz ve kesintisiz senkronize tutar.
        return () => {
          try {
            player.pause();
            player.unload();
            player.detachMediaElement();
            player.destroy();
          } catch {
            // ignore cleanup errors
          }
        };
      }
    } catch {
      // Fallback to native src
    }
  }

  videoEl.src = streamUrl;
  videoEl.load();
  videoEl.play().catch(() => {});
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

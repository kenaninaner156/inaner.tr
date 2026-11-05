// Tracksolid Pro EU (Jimi IoT JC182) Kamera ve Akış Servisi
// Kamera teslim edildiğinde CAMERA_VEHICLES içindeki 'Göksel' kaydını aktif edip IMEI girmeniz yeterlidir.

const TRACKSOLID_EU_OPEN_API = 'https://eu-open.tracksolidpro.com/route/rest';

export const CAMERA_VEHICLES = {
  Demo: {
    enabled: true,
    isDemo: true,
    imei: '868120304685362',
    model: 'JC182',
    channel: 1, // JT808/1078 protokolü cihazlarda (JC182) kanal 1'den başlar
    driverName: 'Dash Cam Beta',
    plate: '34 JIMI 182',
  },
  'Göksel': {
    enabled: true,
    isDemo: false,
    imei: '869058070168628',
    model: 'JC182',
    channel: 1,
    driverName: 'Göksel',
    plate: '06 FTN 692',
  },
  Goksel: {
    enabled: true,
    isDemo: false,
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

// Demo modunda kullanılan gerçek yol kamerası akışları (480p SD alt akış vs 1080p/2K ana akış)
const DEMO_STREAMS = {
  live: {
    sd: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/8/81/C%C3%A4cilienbr%C3%BCcke_Oldenburg_%28Dashcam%29.webm/C%C3%A4cilienbr%C3%BCcke_Oldenburg_%28Dashcam%29.webm.480p.vp9.webm',
    hd: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/8/81/C%C3%A4cilienbr%C3%BCcke_Oldenburg_%28Dashcam%29.webm/C%C3%A4cilienbr%C3%BCcke_Oldenburg_%28Dashcam%29.webm.1080p.vp9.webm',
  },
  highway: {
    sd: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3c/Driving_on_Clopper_Road_from_Firstfield_Road_onto_I-270_southbound_towards_Shady_Grove_Road_%281_June_2026%29.webm/Driving_on_Clopper_Road_from_Firstfield_Road_onto_I-270_southbound_towards_Shady_Grove_Road_%281_June_2026%29.webm.480p.vp9.webm',
    hd: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/8/81/C%C3%A4cilienbr%C3%BCcke_Oldenburg_%28Dashcam%29.webm/C%C3%A4cilienbr%C3%BCcke_Oldenburg_%28Dashcam%29.webm.1080p.vp9.webm',
  },
};

export function getCameraConfig(deviceId) {
  if (!deviceId) return null;
  const normalized = deviceId === 'Goksel' ? 'Göksel' : deviceId;
  const cfg = CAMERA_VEHICLES[normalized];
  if (!cfg || !cfg.enabled) return null;
  return cfg;
}

export function isDemoCameraActive() {
  return Boolean(CAMERA_VEHICLES.Demo?.enabled);
}

/**
 * Canlı yayın URL'sini döndürür (4.6 jimi.device.media.live.stream).
 * @param {string} deviceId - Araç / sürücü kimliği ('Demo' veya 'Göksel')
 * @param {'sd' | 'hd'} quality - 'sd' (480p, codeType=2) veya 'hd' (2K, codeType=1)
 * @param {boolean} setQualityCmd - Kalite değiştirme komutu gönderilsin mi
 */
export async function fetchLiveStreamUrl(deviceId, quality = 'sd', setQualityCmd = false) {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return null;

  if (cfg.isDemo) {
    await new Promise(resolve => setTimeout(resolve, 420));
    return {
      url: quality === 'hd' ? DEMO_STREAMS.live.hd : DEMO_STREAMS.live.sd,
      format: 'webm',
      quality,
      codeType: quality === 'hd' ? 1 : 2,
      channel: cfg.channel,
      imei: cfg.imei,
      appId: getSessionAppId(),
    };
  }

  try {
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
      message: data?.message || 'Kamera çevrimdışı veya kapalı.',
      telemetry: data?.telemetry || null,
      appId,
    };
  } catch {
    return null;
  }
}

/**
 * Seçili gün için SD karttaki geçmiş video kayıt parçalarını döndürür (4.7 cmd + 4.8 get).
 */
export async function fetchCameraHistorySegments(deviceId, dateStr, quality = 'sd') {
  const cfg = getCameraConfig(deviceId);
  if (!cfg) return { segments: [], recordedDates: [] };

  const today = new Date();
  const recordedDates = [];
  for (let i = 0; i < 18; i++) {
    if (i === 3 || i === 8 || i === 14) continue;
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    recordedDates.push(d.toISOString().slice(0, 10));
  }

  if (cfg.isDemo) {
    await new Promise(resolve => setTimeout(resolve, 240));
    const hasData = recordedDates.includes(dateStr);
    if (!hasData) {
      return { segments: [], recordedDates };
    }

    const streamA = quality === 'hd' ? DEMO_STREAMS.live.hd : DEMO_STREAMS.live.sd;
    const streamB = quality === 'hd' ? DEMO_STREAMS.highway.hd : DEMO_STREAMS.highway.sd;

    return {
      recordedDates,
      segments: [
        {
          id: `${dateStr}_seg_1`,
          startTime: '08:14',
          endTime: '08:46',
          beginTime: `${dateStr} 08:14:00`,
          endTimeFull: `${dateStr} 08:46:00`,
          durationSec: 1920,
          url: streamA,
          fileName: `JC182_${dateStr.replace(/-/g, '')}_081400_CH1.mp4`,
        },
        {
          id: `${dateStr}_seg_2`,
          startTime: '11:20',
          endTime: '12:05',
          beginTime: `${dateStr} 11:20:00`,
          endTimeFull: `${dateStr} 12:05:00`,
          durationSec: 2700,
          url: streamB,
          fileName: `JC182_${dateStr.replace(/-/g, '')}_112000_CH1.mp4`,
        },
        {
          id: `${dateStr}_seg_3`,
          startTime: '14:50',
          endTime: '15:28',
          beginTime: `${dateStr} 14:50:00`,
          endTimeFull: `${dateStr} 15:28:00`,
          durationSec: 2280,
          url: streamA,
          fileName: `JC182_${dateStr.replace(/-/g, '')}_145000_CH1.mp4`,
        },
        {
          id: `${dateStr}_seg_4`,
          startTime: '17:10',
          endTime: '17:42',
          beginTime: `${dateStr} 17:10:00`,
          endTimeFull: `${dateStr} 17:42:00`,
          durationSec: 1920,
          url: streamB,
          fileName: `JC182_${dateStr.replace(/-/g, '')}_171000_CH1.mp4`,
        },
      ],
    };
  }

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
 * Seçili geçmiş kayıt parçasının (segment) gerçek akış URL'sini alır (4.9 jimi.device.media.history.stream).
 * JC182 (JT808/1078) için beginTime & endTime kullanır.
 */
export async function resolveHistorySegmentStream(deviceId, segment) {
  if (!segment) return null;
  if (segment.url) return segment.url;

  const cfg = getCameraConfig(deviceId);
  if (!cfg || cfg.isDemo) return segment.url || null;

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
 * Kamera menüsü kapatıldığında 4G akışını sonlandırır (4.10 jimi.device.media.close.stream).
 * Aylık 50 GB SIM kart kotasının gereksiz harcanmasını engeller.
 * @param {string} deviceId
 * @param {'live' | 'history'} mode
 */
export async function closeCameraStream(deviceId, mode = 'live') {
  const cfg = getCameraConfig(deviceId);
  if (!cfg || cfg.isDemo) return;

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

  const isFlv =
    streamUrl.includes('.flv') ||
    streamUrl.includes('action=proxy_flv') ||
    streamUrl.startsWith('ws://') ||
    streamUrl.startsWith('wss://');

  if (isFlv) {
    try {
      const mpegts = await loadMpegtsLibrary();
      if (mpegts && mpegts.isSupported()) {
        const player = mpegts.createPlayer(
          {
            type: 'flv',
            isLive: true,
            url: streamUrl,
          },
          {
            enableWorker: true,
            enableStashBuffer: false,
            stashInitialSize: 128,
          }
        );
        player.attachMediaElement(videoEl);
        player.load();
        player.play().catch(() => {});
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

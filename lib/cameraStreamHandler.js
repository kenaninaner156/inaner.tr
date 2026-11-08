/* global process */
import crypto from 'crypto';
import { Readable } from 'stream';
import { db } from './firebaseAdmin.js';

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

function parseTracksolidLocalTimeIso(trTimeStr) {
  if (!trTimeStr || typeof trTimeStr !== 'string') return null;
  const clean = trTimeStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(clean)) return null;
  const d = new Date(`${clean.replace(' ', 'T')}+03:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseStationaryMinutes(statusAbstract, statusStr) {
  const raw = `${statusAbstract || ''} ${statusStr || ''}`.toLowerCase();
  if (!raw.trim()) return null;

  let total = 0;
  let matched = false;

  const dayMatch = raw.match(/(\d+)\s*(?:d\b|g\b|gün|day)/);
  if (dayMatch) {
    total += parseInt(dayMatch[1], 10) * 1440;
    matched = true;
  }
  const hourMatch = raw.match(/(\d+)\s*(?:h\b|sa\b|saat|hr)/);
  if (hourMatch) {
    total += parseInt(hourMatch[1], 10) * 60;
    matched = true;
  }
  const minMatch = raw.match(/(\d+)\s*(?:min|dk|dakika|m\b)/);
  if (minMatch) {
    total += parseInt(minMatch[1], 10);
    matched = true;
  }
  if (!matched && /\b\d+\s*(?:s\b|sec|sn)/.test(raw)) {
    return 0;
  }
  return matched ? total : null;
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Sunucu tarafı kısa süreli telemetri ve geçmiş gün önbellekleri
const equipmentLookupCache = new Map(); // imei -> { expiresAt, dev }
const lastEdgeCameraPush = new Map();   // imei -> { time, lat, lon, acc, staticType }
const pastDayStatsCache = new Map();    // `${driverId}_${dateStr}` -> { km, idleMin, trips }
const historyListServerCache = new Map(); // `${imei}_${date}_${ch}` -> { expiresAt, segments }
const inflightHistoryRequests = new Map(); // `${imei}_${date}_${ch}` -> Promise<Array>
const hardwareStatusCache = new Map();  // imei -> { expiresAt, batteryVoltage, satellitesUsed, satellitesVisible, lteSignal, socConnected }
const hardwareHealthRuntime = new Map(); // imei -> { lastWeeklyCheckMs, lastAlarmWatchMs, inFlight, alertedFaults, alertedAlarmIds }

// 06 FTN 692 (İveco 24V) JC182 Donanım Kalibrasyon Profili
const JC182_CALIBRATION_PROFILE = {
  lowBatteryThresholdV: 23.2, // 232 (birim 0.1V) — 24V tır akü koruma eşiği
  recoveryVoltageV: 24.2,     // 242 (birim 0.1V) — toparlanma gerilimi
  lowBatteryDetectSec: 30,    // 30 sn — sabah marş basma anındaki anlık düşüşleri yoksayar
  angleDeg: 20,               // 20 derece viraj dönüş hassasiyeti
  angleTimerSec: 2,           // viraj içi 2 sn ek GPS noktası
  gpsTimerSec: 5,             // düz sürüş 5 sn GPS sıklığı
};

const WEEKLY_HEALTH_INTERVAL_MS = 7 * 24 * 3600 * 1000;
const ALARM_WATCH_INTERVAL_MS = 5 * 60 * 1000;
const FAULT_ALERT_COOLDOWN_MS = 24 * 3600 * 1000;
const DEFAULT_DISCORD_WEBHOOK =
  process.env.DISCORD_WEBHOOK_URL ||
  'https://discord.com/api/webhooks/1517513169105453076/EINW0QQLQqMD-Nnl1LTNPIIC-d2oX1_qTns9JZXL4bX2qqLibE1NIG98E0--efZSrcyc';

function parseCameraTfReply(raw) {
  const str = String(raw || '').trim();
  const match = str.match(/free\s*:\s*(\d+)\s*MB\s*\/\s*total\s*:\s*(\d+)\s*MB/i);
  const freeMb = match ? parseInt(match[1], 10) : null;
  const totalMb = match ? parseInt(match[2], 10) : null;
  const hasExplicitError = /(error|fail|no\s*tf|no\s*card|none|abnormal|unmount|format\s*err)/i.test(str);
  const healthy = Boolean(totalMb && totalMb >= 1024 && !hasExplicitError);
  return {
    raw: str,
    healthy,
    freeMb,
    totalMb,
    freeGb: freeMb !== null ? Number((freeMb / 1024).toFixed(1)) : null,
    totalGb: totalMb !== null ? Number((totalMb / 1024).toFixed(1)) : null,
    usedPercent:
      totalMb && totalMb > 0 && freeMb !== null
        ? Math.max(0, Math.min(100, Math.round(((totalMb - freeMb) / totalMb) * 100)))
        : null,
  };
}

function parseDeviceStatusReply(raw) {
  const str = String(raw || '').trim();
  const batMatch = str.match(/Battery\s*:\s*([\d.]+)\s*V/i);
  const capMatch = str.match(/CAPV\s*:\s*([\d.]+)\s*V/i);
  const socMatch = str.match(/SOC\s*:\s*([^;]+)/i);
  const lteMatch = str.match(/LTE Signal Level\s*:\s*([^;]+)/i);
  const svsMatch = str.match(/SVS Used in fix\s*:\s*(\d+)(?:\((\d+)\))?/i);
  const accMatch = str.match(/ACC\s*:\s*(ON|OFF)/i);
  const defMatch = str.match(/Defense\s*:\s*(ON|OFF)/i);

  const batteryVoltage = batMatch ? parseFloat(batMatch[1]) : null;
  const capVoltage = capMatch ? parseFloat(capMatch[1]) : null;
  const socText = socMatch ? socMatch[1].trim() : '';
  const socConnected = socText ? !/down|disconnect|err|fail/i.test(socText) : true;

  return {
    raw: str,
    batteryVoltage: Number.isFinite(batteryVoltage) ? batteryVoltage : null,
    capVoltage: Number.isFinite(capVoltage) ? capVoltage : null,
    socConnected,
    socStatus: socText || null,
    lteSignal: lteMatch ? lteMatch[1].trim() : null,
    satellitesUsed: svsMatch ? parseInt(svsMatch[1], 10) : null,
    satellitesVisible: svsMatch && svsMatch[2] ? parseInt(svsMatch[2], 10) : null,
    accOn: accMatch ? accMatch[1].toUpperCase() === 'ON' : null,
    defenseOn: defMatch ? defMatch[1].toUpperCase() === 'ON' : null,
  };
}

async function sendJc182Instruction(webToken, imei, spec, maxAttempts = 3) {
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 86400 * 1000);
  const body = {
    orderContent: spec.orderContent,
    instructionId: String(spec.instructionId),
    instructionName: spec.instructionName,
    param: spec.param || '',
    instructionPwd: '',
    isUsePwd: '0',
    isOffLine: '1',
    imeis: String(imei),
    startTime: formatUtcDate(now),
    endTime: formatUtcDate(future),
    equipmentBO: null,
  };

  let lastData = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${EU_WEB_API_URL}/v3/new/newDevice/sendIns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: webToken,
      },
      body: JSON.stringify(body),
    });
    lastData = await res.json();

    // 30039 = TS.Devices.Awakening (cihaz park uyku modundan 4G ile uyandırılıyor)
    if (lastData?.code === 30039 && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 4500));
      continue;
    }
    break;
  }

  const replyText = typeof lastData?.data === 'string' ? lastData.data.trim() : '';
  const ok = Boolean(lastData?.ok || lastData?.code === 255 || lastData?.code === 10000);
  return {
    ok,
    code: lastData?.code ?? 0,
    reply: replyText,
    msg: lastData?.msg || '',
  };
}

async function sendHardwareDiscordEmbed(title, description, fields = [], color = 0xdc2626) {
  if (!DEFAULT_DISCORD_WEBHOOK) return;
  try {
    await fetch(DEFAULT_DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title,
            description,
            color,
            fields,
            footer: { text: 'İnaner Lojistik Donanım Denetim Sistemi • 06 FTN 692 (JC182)' },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch {
    // Sessiz geç
  }
}

function getRuntimeHealthState(imei) {
  const key = String(imei);
  let st = hardwareHealthRuntime.get(key);
  if (!st) {
    st = {
      hydrated: false,
      lastWeeklyCheckMs: 0,
      lastAlarmWatchMs: 0,
      inFlight: false,
      alertedFaults: {},
      alertedAlarmIds: new Set(),
    };
    hardwareHealthRuntime.set(key, st);
  }
  return st;
}

async function hydrateHardwareHealthState(imei) {
  const st = getRuntimeHealthState(imei);
  if (st.hydrated) return st;
  st.hydrated = true;
  if (!db) {
    // Yerel geliştirme veya Firestore yetkisi olmayan ortamlarda her yeniden başlatmada otomatik SMS/4G komutu atılmasını önle
    st.lastWeeklyCheckMs = Date.now();
    return st;
  }
  try {
    const docSnap = await db.collection('system_health').doc(`jc182_${imei}`).get();
    if (docSnap.exists) {
      const d = docSnap.data() || {};
      if (typeof d.lastWeeklyCheckMs === 'number') st.lastWeeklyCheckMs = d.lastWeeklyCheckMs;
      if (d.alertedFaults && typeof d.alertedFaults === 'object') st.alertedFaults = { ...d.alertedFaults };
      if (Array.isArray(d.alertedAlarmIds)) {
        st.alertedAlarmIds = new Set(d.alertedAlarmIds.slice(-50));
      }
    }
  } catch {
    st.lastWeeklyCheckMs = Date.now();
  }
  return st;
}

async function persistHardwareHealthState(imei, extraData = {}) {
  const st = getRuntimeHealthState(imei);
  if (!db) return;
  try {
    await db
      .collection('system_health')
      .doc(`jc182_${imei}`)
      .set(
        {
          imei: String(imei),
          plate: '06 FTN 692',
          driverName: 'Göksel',
          model: 'JC182',
          lastWeeklyCheckMs: st.lastWeeklyCheckMs,
          alertedFaults: st.alertedFaults,
          alertedAlarmIds: Array.from(st.alertedAlarmIds).slice(-50),
          calibration: JC182_CALIBRATION_PROFILE,
          updatedAt: new Date().toISOString(),
          ...extraData,
        },
        { merge: true }
      );
  } catch {
    // Sessiz geç
  }
}

async function runHardwareHealthCheck(webToken, imei, { isScheduledWeekly = false } = {}) {
  const st = await hydrateHardwareHealthState(imei);
  const nowMs = Date.now();

  const tfCmd = await sendJc182Instruction(webToken, imei, {
    orderContent: 'CAMERA,TF#',
    instructionId: '524',
    instructionName: 'SD Kart',
    param: '',
  });
  const statusCmd = await sendJc182Instruction(webToken, imei, {
    orderContent: 'STATUS#',
    instructionId: '525',
    instructionName: 'Status',
    param: '',
  });

  const tfInfo = tfCmd.reply ? parseCameraTfReply(tfCmd.reply) : null;
  const statusInfo = statusCmd.reply ? parseDeviceStatusReply(statusCmd.reply) : null;

  if (statusInfo) {
    hardwareStatusCache.set(String(imei), {
      expiresAt: nowMs + 15 * 60 * 1000,
      ...statusInfo,
    });
  }

  // Cihaz yanıt verdiyse haftalık denetim zaman damgasını güncelle
  if (tfCmd.reply || statusCmd.reply) {
    st.lastWeeklyCheckMs = nowMs;
  }

  // 1. SD Kart / Kamera Birimi Arıza Kontrolü (Yalnızca gerçek hata varsa bildirim üretir)
  if (tfInfo && !tfInfo.healthy) {
    const lastSdAlert = st.alertedFaults.sd_fault || 0;
    if (nowMs - lastSdAlert > FAULT_ALERT_COOLDOWN_MS) {
      st.alertedFaults.sd_fault = nowMs;
      await sendHardwareDiscordEmbed(
        'SD KART KAYIT UYARISI — 06 FTN 692',
        'Araç kamerası hafıza kartı okunamıyor veya kapasite hatası bildiriyor. Olay ve geçmiş kayıtların aksamaması için kontrol edilmelidir.',
        [
          { name: 'Araç / Sürücü', value: '06 FTN 692 (Göksel)', inline: true },
          { name: 'Cihaz Yanıtı', value: tfInfo.raw || 'Yanıt alınamadı', inline: false },
        ],
        0xdc2626
      );
    }
  } else if (statusInfo && !statusInfo.socConnected) {
    const lastSocAlert = st.alertedFaults.soc_fault || 0;
    if (nowMs - lastSocAlert > FAULT_ALERT_COOLDOWN_MS) {
      st.alertedFaults.soc_fault = nowMs;
      await sendHardwareDiscordEmbed(
        'KAMERA BİRİMİ UYARISI — 06 FTN 692',
        'JC182 video işleme birimi (SOC) bağlantı kaybı bildirdi.',
        [
          { name: 'Araç / Sürücü', value: '06 FTN 692 (Göksel)', inline: true },
          { name: 'SOC Durumu', value: statusInfo.socStatus || 'Link Down', inline: true },
        ],
        0xdc2626
      );
    }
  }

  // 2. 24V İveco Düşük Akü Kontrolü (< 23.2V)
  if (
    statusInfo?.batteryVoltage &&
    statusInfo.batteryVoltage > 5 &&
    statusInfo.batteryVoltage < JC182_CALIBRATION_PROFILE.lowBatteryThresholdV
  ) {
    const lastBatAlert = st.alertedFaults.low_battery_24v || 0;
    if (nowMs - lastBatAlert > FAULT_ALERT_COOLDOWN_MS) {
      st.alertedFaults.low_battery_24v = nowMs;
      await sendHardwareDiscordEmbed(
        'DÜŞÜK AKÜ GERİLİMİ — 06 FTN 692',
        `24V araç akü gerilimi güvenlik eşiğinin (${JC182_CALIBRATION_PROFILE.lowBatteryThresholdV}V) altına düştü.`,
        [
          { name: 'Ölçülen Gerilim', value: `${statusInfo.batteryVoltage.toFixed(1)} V`, inline: true },
          { name: 'Güvenlik Eşiği', value: `${JC182_CALIBRATION_PROFILE.lowBatteryThresholdV} V`, inline: true },
          { name: 'Kontak Durumu', value: statusInfo.accOn ? 'Açık' : 'Kapalı (Park)', inline: true },
        ],
        0xd97706
      );
    }
  }

  const summary = {
    checkedAt: new Date(nowMs).toISOString(),
    trigger: isScheduledWeekly ? 'weekly_silent' : 'manual',
    sdCard: tfInfo,
    deviceStatus: statusInfo,
    calibration: JC182_CALIBRATION_PROFILE,
  };

  await persistHardwareHealthState(imei, {
    lastHealthSummary: summary,
  });

  return summary;
}

async function ensureWeeklyHardwareHealthCheck(webToken, imei) {
  if (!db) return;
  const st = await hydrateHardwareHealthState(imei);
  const nowMs = Date.now();
  if (st.inFlight || nowMs - st.lastWeeklyCheckMs < WEEKLY_HEALTH_INTERVAL_MS) {
    return;
  }
  st.inFlight = true;
  st.lastWeeklyCheckMs = nowMs;
  try {
    await db
      .collection('system_health')
      .doc(`jc182_${imei}`)
      .set({ lastWeeklyCheckMs: nowMs, updatedAt: new Date(nowMs).toISOString() }, { merge: true });
    await runHardwareHealthCheck(webToken, imei, { isScheduledWeekly: true });
  } catch {
    // Arka plan haftalık kontrol hatasını sessiz yut
  } finally {
    st.inFlight = false;
  }
}

async function checkCriticalHardwareAlarms(webToken, imei) {
  const st = await hydrateHardwareHealthState(imei);
  const nowMs = Date.now();
  if (nowMs - st.lastAlarmWatchMs < ALARM_WATCH_INTERVAL_MS) {
    return;
  }
  st.lastAlarmWatchMs = nowMs;

  try {
    const alarmRes = await fetch(`${EU_WEB_API_URL}/v3/new/userMsg/listAlarm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: webToken,
      },
      body: JSON.stringify({ page: 1, pageSize: 10, imei: String(imei) }),
    });
    const alarmData = await alarmRes.json();
    const alarms = alarmData?.data?.alarmList || [];
    let stateDirty = false;

    for (const a of alarms) {
      if (!a?.id || st.alertedAlarmIds.has(a.id)) continue;
      const pushIso = parseTracksolidLocalTimeIso(a.pushTime);
      const ageMs = pushIso ? nowMs - new Date(pushIso).getTime() : Infinity;
      if (ageMs > 12 * 3600 * 1000) continue;

      const statusCode = String(a.status || '');
      const statusName = String(a.statusName || a.alarmName || '');
      const isLowPowerAlarm =
        statusCode === '19' ||
        statusCode === '14' ||
        /düşük.*(güç|voltaj|gerilim|akü|pil)|harici.*güç|low.*(power|voltage|battery)|aeplv/i.test(statusName);
      const isSdFaultAlarm = /sd\s*kart|tf\s*card|hafıza\s*kart/i.test(statusName);

      if (isLowPowerAlarm || isSdFaultAlarm) {
        st.alertedAlarmIds.add(a.id);
        stateDirty = true;
        await sendHardwareDiscordEmbed(
          isLowPowerAlarm
            ? 'DÜŞÜK AKÜ ALARMI — 06 FTN 692'
            : 'HAFIZA KARTI ALARMI — 06 FTN 692',
          isLowPowerAlarm
            ? `JC182 donanımı 24V harici akü geriliminin ${JC182_CALIBRATION_PROFILE.lowBatteryThresholdV}V eşiğinin altına düştüğünü bildirdi.`
            : 'JC182 donanımı hafıza kartı uyarısı bildirdi.',
          [
            { name: 'Araç / Sürücü', value: '06 FTN 692 (Göksel)', inline: true },
            { name: 'Uyarı Türü', value: statusName || `Kod ${statusCode}`, inline: true },
            { name: 'Zaman', value: a.pushTime || '-', inline: true },
          ],
          isLowPowerAlarm ? 0xd97706 : 0xdc2626
        );
      }
    }

    if (stateDirty) {
      await persistHardwareHealthState(imei);
    }
  } catch {
    // Sessiz geç
  }
}

async function fetchEquipmentCached(webToken, imei) {
  const key = String(imei);
  const now = Date.now();
  const hit = equipmentLookupCache.get(key);
  if (hit && now < hit.expiresAt) {
    return hit.dev;
  }
  const searchRes = await fetch(`${EU_WEB_API_URL}/v3/new/newEquipment/globalSearchEquipment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: webToken,
    },
    body: JSON.stringify({ page: 1, pageSize: 20, searchStr: key }),
  });
  const searchData = await searchRes.json();
  const dev = searchData?.data?.[0] || null;
  if (dev) {
    equipmentLookupCache.set(key, { expiresAt: now + 2000, dev });
  }
  return dev;
}

function normalizeStreamUrls(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { url: null, fallbackUrl: null, rawUrl: null };
  }

  // Tracksolid medya sunucuları (4.6.5 / 4.9.5) aynı adreste hem WSS hem HTTPS destekler.
  // Mobil ve masaüstü tarayıcılarda HTTP chunked tamponlamasını önlemek için WSS birincil protokoldür.
  if (rawUrl.startsWith('https://')) {
    const wssUrl = rawUrl.replace(/^https:\/\//, 'wss://');
    return {
      url: wssUrl,
      fallbackUrl: rawUrl,
      rawUrl,
    };
  }

  if (rawUrl.startsWith('wss://')) {
    return {
      url: rawUrl,
      fallbackUrl: rawUrl.replace(/^wss:\/\//, 'https://'),
      rawUrl,
    };
  }

  if (rawUrl.includes('tracksolidpro.com')) {
    const wssUrl = rawUrl.replace(/^(http|ws):\/\//, 'wss://');
    const httpsUrl = rawUrl.replace(/^(http|ws):\/\//, 'https://');
    return {
      url: wssUrl,
      fallbackUrl: httpsUrl,
      rawUrl,
    };
  }

  // Ham IP tabanlı şifresiz (http:// veya ws://) akışlarda HTTPS Mixed-Content engeli için güvenli proxy
  const httpTarget = rawUrl.startsWith('ws://') ? rawUrl.replace(/^ws:\/\//, 'http://') : rawUrl;
  const proxyUrl = `/api/camera-stream?action=proxy_flv&target=${encodeURIComponent(httpTarget)}`;
  return {
    url: proxyUrl,
    fallbackUrl: proxyUrl,
    rawUrl,
  };
}

// ── Tracksolid Pro EU Bulut Rota Geçmişi Önbelleği ─────────────────────
const trackHistoryCache = new Map();

async function fetchTrackHistoryInternal(dateStr, imei) {
  const targetImei = String(imei || '869058070168628');
  const nowTurkey = new Date(Date.now() + 3 * 3600 * 1000);
  const todayStr = nowTurkey.toISOString().slice(0, 10);
  const isToday = dateStr === todayStr;
  const cacheKey = `${targetImei}_${dateStr}`;
  const nowMs = Date.now();

  const cached = trackHistoryCache.get(cacheKey);
  if (cached) {
    const ttl = isToday ? 30 * 1000 : 24 * 3600 * 1000;
    if (nowMs - cached.at < ttl) {
      return cached.data;
    }
  }

  const webToken = await getWebToken();
  const res = await fetch(`${EU_WEB_API_URL}/v3/new/newTrackInfo/getPointList`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: webToken,
    },
    body: JSON.stringify({
      mapType: 'GOOGLE',
      startTime: `${dateStr} 00:00:00`,
      endTime: `${dateStr} 23:59:59`,
      imei: targetImei,
    }),
  });

  const data = await res.json();
  const rawList = data?.data?.gpsPointStrList || [];
  if (!Array.isArray(rawList) || rawList.length === 0) {
    const emptyResult = {
      points: [],
      rawCount: 0,
      filteredCount: 0,
      totalKm: 0,
      idleMinutes: 0,
      tripsNum: 0,
      startAddress: '',
      endAddress: '',
    };
    trackHistoryCache.set(cacheKey, { at: nowMs, data: emptyResult });
    return emptyResult;
  }

  // 1. Ham pipe stringlerini ayrıştır
  const parsed = [];
  for (const str of rawList) {
    const parts = str.split('|');
    if (parts.length < 10) continue;
    const acc = parts[0] === '1' ? 1 : 0;
    const heading = parseFloat(parts[1]) || 0;
    const speedKmh = parseFloat(parts[6]) || 0;
    const gpsTime = parts[7];
    const lat = parseFloat(parts[8]);
    const lon = parseFloat(parts[9]);
    if (isNaN(lat) || isNaN(lon) || Math.abs(lat) < 0.01) continue;

    // Hız birimi zorunlu Knot cinsine çevrilir (1 knot = 1.852 km/h)
    const speedKnots = Number((speedKmh / 1.852).toFixed(2));
    const timestamp = new Date(`${gpsTime.replace(' ', 'T')}+03:00`).toISOString();

    parsed.push({
      driverId: 'Göksel',
      deviceId: 'Göksel',
      lat,
      lon,
      speed: speedKnots,
      speedKmh,
      altitude: 0,
      heading,
      direction: heading,
      acc,
      ignition: acc === 1,
      timestamp,
      createdAt: timestamp,
      point_time: new Date(timestamp).getTime(),
    });
  }

  if (parsed.length === 0) {
    const emptyResult = {
      points: [],
      rawCount: 0,
      filteredCount: 0,
      totalKm: 0,
      idleMinutes: 0,
      tripsNum: 0,
      startAddress: '',
      endAddress: '',
    };
    trackHistoryCache.set(cacheKey, { at: nowMs, data: emptyResult });
    return emptyResult;
  }

  // 2. Dead-Reckoning Filtresi (Virajları, hız değişimlerini ve kontak geçişlerini korur)
  const filtered = [parsed[0]];
  for (let i = 1; i < parsed.length; i++) {
    const prev = filtered[filtered.length - 1];
    const curr = parsed[i];
    const isLast = i === parsed.length - 1;

    const distKm = haversineDistanceKm(prev.lat, prev.lon, curr.lat, curr.lon);
    const headingDiff = Math.abs((curr.heading - prev.heading + 180) % 360 - 180);
    const speedDiffKmh = Math.abs(curr.speedKmh - prev.speedKmh);
    const accChanged = curr.acc !== prev.acc;
    const timeDiffSec = (curr.point_time - prev.point_time) / 1000;

    if (
      isLast ||
      accChanged ||
      (headingDiff >= 18 && distKm >= 0.03) ||
      speedDiffKmh >= 20 ||
      (prev.speedKmh < 3 && curr.speedKmh >= 3) ||
      (prev.speedKmh >= 3 && curr.speedKmh < 3) ||
      distKm >= 0.8 ||
      timeDiffSec >= 180
    ) {
      filtered.push(curr);
    }
  }

  // 3. Gerçek Kilometre & Kontak Açık Rölanti Hesabı
  let totalKm = parseFloat(data?.data?.totalMileage) || 0;
  if (!totalKm) {
    for (let i = 1; i < parsed.length; i++) {
      const d = haversineDistanceKm(parsed[i - 1].lat, parsed[i - 1].lon, parsed[i].lat, parsed[i].lon);
      if (d > 0.003 && d < 5) totalKm += d;
    }
    totalKm = Number(totalKm.toFixed(1));
  }

  let idleSec = 0;
  for (let i = 1; i < parsed.length; i++) {
    const p1 = parsed[i - 1];
    const p2 = parsed[i];
    const dtSec = Math.max(0, (p2.point_time - p1.point_time) / 1000);
    if (p1.acc === 1 && p1.speedKmh < 3 && dtSec > 0 && dtSec <= 1800) {
      idleSec += dtSec;
    }
  }
  const idleMinutes = Math.round(idleSec / 60);

  const result = {
    points: filtered,
    rawCount: parsed.length,
    filteredCount: filtered.length,
    totalKm,
    idleMinutes,
    tripsNum: data?.data?.tripsNum || 0,
    startAddress: data?.data?.startAddress || '',
    endAddress: data?.data?.endAddress || '',
  };

  trackHistoryCache.set(cacheKey, { at: nowMs, data: result });
  return result;
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
    driverId,
    period = 'all',
    sync_gps,
    channel = '1',
    codeType = '2',
    date,
    beginTime,
    endTime,
    appId: rawAppId,
    type = '0',
    target,
    cmd,
    pageSize = '10',
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

  // ── 0.1 TRACKSOLID PRO EU BULUT GEÇMİŞİ (Sıfır 4G SIM Kotası & Tam Rota) ──
  if (action === 'track_history') {
    try {
      const nowTr = new Date(Date.now() + 3 * 3600 * 1000);
      const todayStr = nowTr.toISOString().slice(0, 10);
      const targetDate = date || todayStr;
      const targetImei = String(imei || '869058070168628');
      const targetDriver = String(driverId || 'Göksel');

      const result = await fetchTrackHistoryInternal(targetDate, targetImei);
      return res.status(200).json({
        success: true,
        driverId: targetDriver,
        imei: targetImei,
        date: targetDate,
        totalKm: result.totalKm,
        idleMinutes: result.idleMinutes,
        rawCount: result.rawCount,
        filteredCount: result.filteredCount,
        tripsNum: result.tripsNum,
        startAddress: result.startAddress,
        endAddress: result.endAddress,
        points: result.points,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message,
        points: [],
      });
    }
  }

  // ── 0.2 DÖNEMSEL TELEMETRİ ÖZETİ (Mazot Kartları İçin GPS KM & Rölanti Süresi) ──
  if (action === 'period_telemetry') {
    const targetDriver = String(driverId || 'Göksel').trim();
    const targetPeriod = String(period || 'all').trim(); // 'all' veya 'YYYY-MM'
    const isCameraTruck = targetDriver === 'Göksel' || targetDriver === 'Goksel' || String(imei || '') === '869058070168628';
    // JC182 kontak (ACC) donanımının araca bağlandığı tarih (öncesindeki telefon GPS verilerinde kontak bilgisi yoktur)
    const JC182_ACTIVATION_DATE = '2026-11-04';

    try {
      const nowTr = new Date(Date.now() + 3 * 3600 * 1000);
      const todayStr = nowTr.toISOString().slice(0, 10);
      const datesToFetch = [];

      if (/^\d{4}-\d{2}$/.test(targetPeriod)) {
        const [yStr, mStr] = targetPeriod.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        const daysInMonth = new Date(y, m, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          const dStr = `${yStr}-${mStr}-${String(d).padStart(2, '0')}`;
          if (dStr <= todayStr) datesToFetch.push(dStr);
        }
      } else if (targetPeriod === 'year') {
        const curYear = todayStr.slice(0, 4);
        const startMs = new Date(`${curYear}-01-01T00:00:00Z`).getTime();
        const endMs = new Date(`${todayStr}T00:00:00Z`).getTime();
        for (let ms = startMs; ms <= endMs; ms += 86400 * 1000) {
          datesToFetch.push(new Date(ms).toISOString().slice(0, 10));
        }
      } else {
        // 'all' seçiliyse tüm aktif geçmişi (2026-09-01'den bugüne) önbellekli tara
        const startMs = new Date('2026-09-01T00:00:00Z').getTime();
        const endMs = new Date(`${todayStr}T00:00:00Z`).getTime();
        for (let ms = startMs; ms <= endMs; ms += 86400 * 1000) {
          datesToFetch.push(new Date(ms).toISOString().slice(0, 10));
        }
      }

      const periodHasAccData = isCameraTruck && datesToFetch.some((d) => d >= JC182_ACTIVATION_DATE);

      // 1. Önce Cloudflare Edge D1 yerel toplama ucunu dene (güncel şema v2 aktifse <30ms yanıt verir)
      try {
        const edgeUrl = `https://inaner.tr/api/save-location?action=get_period_stats&v=2&driverId=${encodeURIComponent(targetDriver)}&period=${encodeURIComponent(targetPeriod)}&token=inaner123`;
        const edgeRes = await fetch(edgeUrl);
        const edgeJson = await edgeRes.json();
        if (edgeJson?.source === 'cloudflare_d1_period_v2' && edgeJson?.success) {
          let liveIdleAdd = 0;
          if (periodHasAccData && datesToFetch.includes(todayStr)) {
            try {
              const wt = await getWebToken();
              const dev = await fetchEquipmentCached(wt, imei || '869058070168628');
              if (dev && dev.staticType === 'IDLING' && (dev.acc === '1' || dev.acc === 1)) {
                liveIdleAdd = parseStationaryMinutes(dev.statusAbstract, dev.statusStr) || 0;
              }
            } catch {
              // ignore live idle lookup failure
            }
          }
          return res.status(200).json({
            success: true,
            driverId: targetDriver,
            period: targetPeriod,
            gpsKm: Number((edgeJson.gpsKm || 0).toFixed(1)),
            idleMinutes: periodHasAccData ? (edgeJson.idleMinutes || 0) + liveIdleAdd : 0,
            tripCount: edgeJson.tripCount || 0,
            hasHardwareAcc: periodHasAccData,
          });
        }
      } catch {
        // Edge ucu henüz v2 şemasına geçmediyse aşağıdaki D1 günlük geçmiş toplama katmanını kullan
      }

      // 2. D1 get_history üzerinden gerçek GPS mesafe ve kontak (ACC) bazlı rölanti hesabı
      // Park halini (ACC=0 veya sefer sonu/uzun park duruşlarını) kesin olarak rölantiden ayırır.
      const computeDayMetrics = (pts, dStr) => {
        if (!Array.isArray(pts) || pts.length < 2) return { km: 0, idleMin: 0, trips: 0 };
        const canMeasureIdle = isCameraTruck && dStr >= JC182_ACTIVATION_DATE;
        let km = 0;
        let idleSec = 0;
        let stopStartMs = 0;
        let trips = 0;
        let inTrip = false;
        let lastMoveMs = 0;

        for (let i = 1; i < pts.length; i++) {
          const p1 = pts[i - 1];
          const p2 = pts[i];
          const t1 = Number(p1.point_time) || new Date(p1.timestamp).getTime();
          const t2 = Number(p2.point_time) || new Date(p2.timestamp).getTime();
          const dtSec = Math.max(0, (t2 - t1) / 1000);
          if (dtSec <= 0) continue;

          const dist = haversineDistanceKm(Number(p1.lat), Number(p1.lon), Number(p2.lat), Number(p2.lon));
          const s1Kmh = (Number(p1.speed) || 0) * 1.852;
          const s2Kmh = (Number(p2.speed) || 0) * 1.852;

          if (dist > 0.003 && dist < 5) {
            km += dist;
          }

          const hasExplicitAcc = p1.acc !== undefined && p1.acc !== null && p1.acc !== '';

          if (s2Kmh >= 5) {
            // Kontak verisi varsa ve önceki nokta kontak açık duruş (ACC=1, hız < 3) ise kalkışa kadar geçen süre gerçek rölantidir
            if (canMeasureIdle) {
              if (hasExplicitAcc) {
                if (Number(p1.acc) === 1 && s1Kmh < 3 && dtSec <= 1800) {
                  idleSec += dtSec;
                }
              } else if (inTrip && s1Kmh < 3) {
                const fullStopSec = (t2 - (stopStartMs || t1)) / 1000;
                if (fullStopSec > 0 && fullStopSec <= 600) {
                  idleSec += fullStopSec;
                }
              }
            }
            if (!inTrip || (lastMoveMs > 0 && (t2 - lastMoveMs) > 30 * 60 * 1000)) {
              trips += 1;
              inTrip = true;
            }
            stopStartMs = 0;
            lastMoveMs = t2;
          } else if (canMeasureIdle) {
            if (hasExplicitAcc) {
              // Donanım kontak (ACC) verisi mevcut: SADECE p1'de kontak açık (ACC=1) ve hız < 3 km/h iken rölanti say (ACC 1->0 kapanış anına kadar olan rölanti dahil; ACC=0 Park süresi 0 sn)
              stopStartMs = 0;
              if (Number(p1.acc) === 1 && s1Kmh < 3 && dtSec <= 1800) {
                idleSec += dtSec;
              }
              if (Number(p1.acc) === 0 || Number(p2.acc) === 0) {
                inTrip = false;
              }
            } else if (inTrip && s1Kmh < 3) {
              if (!stopStartMs) stopStartMs = t1;
              if ((t2 - stopStartMs) > 10 * 60 * 1000) {
                // 10 dakikayı aşan duruşlar Park kabul edilir
                inTrip = false;
              }
            }
          } else if (lastMoveMs > 0 && (t2 - lastMoveMs) > 30 * 60 * 1000) {
            inTrip = false;
          }
        }
        // Not: Gün veya sefer sonunda hareket etmeden kalan pendingIdleSec (Park süresi) kasıtlı olarak eklenmez.
        return { km, idleMin: canMeasureIdle ? Math.round(idleSec / 60) : 0, trips };
      };

      let totalKm = 0;
      let totalIdleMin = 0;
      let totalTrips = 0;

      // 15'erli gruplar halinde paralel ve önbellekli sorgula
      for (let i = 0; i < datesToFetch.length; i += 15) {
        const chunk = datesToFetch.slice(i, i + 15);
        const chunkResults = await Promise.all(
          chunk.map(async (dStr) => {
            const cacheKey = `v2_${targetDriver}_${dStr}`;
            if (dStr < todayStr && pastDayStatsCache.has(cacheKey)) {
              return pastDayStatsCache.get(cacheKey);
            }

            // Kameralı araç (Göksel) için buluttan eksiksiz gerçek mesafe ve rölantiyi çek
            if (isCameraTruck && dStr >= JC182_ACTIVATION_DATE) {
              try {
                const hist = await fetchTrackHistoryInternal(dStr, imei || '869058070168628');
                if (hist && (hist.totalKm > 0 || hist.points.length > 0)) {
                  const metrics = {
                    km: hist.totalKm,
                    idleMin: hist.idleMinutes,
                    trips: hist.tripsNum || (hist.totalKm > 5 ? 1 : 0),
                  };
                  if (dStr < todayStr) {
                    pastDayStatsCache.set(cacheKey, metrics);
                  }
                  return metrics;
                }
              } catch (_) {
                // Hata durumunda D1 fallback katmanına devam et
              }
            }

            try {
              const r = await fetch(
                `https://inaner.tr/api/save-location?action=get_history&driverId=${encodeURIComponent(targetDriver)}&date=${dStr}&token=inaner123`
              );
              const j = await r.json();
              const metrics = computeDayMetrics(j?.points || [], dStr);
              if (dStr < todayStr) {
                pastDayStatsCache.set(cacheKey, metrics);
              }
              return metrics;
            } catch {
              return { km: 0, idleMin: 0, trips: 0 };
            }
          })
        );
        for (const m of chunkResults) {
          totalKm += m.km;
          totalIdleMin += m.idleMin;
          totalTrips += m.trips;
        }
      }

      // Kameralı araç şu an canlı rölantideyse (ACC=1 & IDLING), aktif rölanti dakikasını ekle
      if (periodHasAccData && datesToFetch.includes(todayStr)) {
        try {
          const wt = await getWebToken();
          const dev = await fetchEquipmentCached(wt, imei || '869058070168628');
          if (dev && dev.staticType === 'IDLING' && (dev.acc === '1' || dev.acc === 1)) {
            const liveIdle = parseStationaryMinutes(dev.statusAbstract, dev.statusStr) || 0;
            totalIdleMin += liveIdle;
          }
        } catch {
          // ignore
        }
      }

      return res.status(200).json({
        success: true,
        driverId: targetDriver,
        period: targetPeriod,
        gpsKm: Number(totalKm.toFixed(1)),
        idleMinutes: periodHasAccData ? totalIdleMin : 0,
        tripCount: totalTrips,
        hasHardwareAcc: periodHasAccData,
      });
    } catch (err) {
      return res.status(200).json({
        success: false,
        driverId: targetDriver,
        period: targetPeriod,
        gpsKm: 0,
        idleMinutes: 0,
        tripCount: 0,
        hasHardwareAcc: isCameraTruck,
        error: err.message,
      });
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
          const { url, fallbackUrl, rawUrl } = normalizeStreamUrls(rawStreamUrl);
          return res.status(200).json({
            code: 0,
            url,
            fallbackUrl,
            rawUrl,
            appId,
            channel: String(channel),
            offline: false,
          });
        }

        // Akış URL'si alınamadıysa son konum ve telemetri durumunu çek
        let telemetry = null;
        try {
          telemetry = await fetchEquipmentCached(webToken, imei);
        } catch {
          // Telemetri sessiz geç
        }

        return res.status(200).json({
          code: streamData?.code || 30032,
          offline: true,
          message: telemetry?.statusStr || 'Araç park modunda. Canlı görüntü için kamerayı uyandırabilirsiniz.',
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

    // ── 2. CİHAZ ANLIK KONUM & GERÇEK TELEMETRİ SORGULA ──
    if (action === 'location' || action === 'telemetry') {
      const dev = await fetchEquipmentCached(webToken, imei);
      if (dev) {
        const isAccOn = dev.acc === '1' || dev.acc === 1;
        const speedKmh = Number(dev.speed) || 0;
        const heading = Number(dev.direction) || 0;
        const isMovingHw = dev.status === 'MOVE' || speedKmh >= 2;
        const isIdling = !isMovingHw && (dev.staticType === 'IDLING' || isAccOn);
        const isParked = !isMovingHw && (dev.staticType === 'PARKING' || !isAccOn);
        const stationaryMinutes = isMovingHw ? null : parseStationaryMinutes(dev.statusAbstract, dev.statusStr);
        const gpsTimeIso = parseTracksolidLocalTimeIso(dev.gpsTime);
        const hbTimeIso = parseTracksolidLocalTimeIso(dev.hbTime);
        const latestIso =
          gpsTimeIso && hbTimeIso
            ? (new Date(gpsTimeIso).getTime() >= new Date(hbTimeIso).getTime() ? gpsTimeIso : hbTimeIso)
            : (hbTimeIso || gpsTimeIso || new Date().toISOString());
        const parsedLat = Number(dev.lat);
        const parsedLon = Number(dev.lng);

        const cachedHw = hardwareStatusCache.get(String(dev.imei || imei));
        const activeHwCache = cachedHw && Date.now() < cachedHw.expiresAt ? cachedHw : null;

        const parsedSatellites =
          dev.gpsNum !== null && dev.gpsNum !== undefined && dev.gpsNum !== ''
            ? Number(dev.gpsNum)
            : activeHwCache?.satellitesUsed ?? null;
        const parsedGpsSignal =
          dev.GPSSignal !== null && dev.GPSSignal !== undefined && dev.GPSSignal !== ''
            ? Number(dev.GPSSignal)
            : null;
        const realVoltage =
          dev.voltage ||
          dev.externalPower ||
          dev.nominalVoltage ||
          (activeHwCache?.batteryVoltage ? `${activeHwCache.batteryVoltage.toFixed(1)}V` : null);

        // Haftalık sessiz SD kart sağlık denetimi (CAMERA,TF#) ve 5 dk'lık 24V düşük akü alarm takibi
        void ensureWeeklyHardwareHealthCheck(webToken, String(dev.imei || imei));
        void checkCriticalHardwareAlarms(webToken, String(dev.imei || imei));

        // Kamera GPS ve Kontak (ACC) otoritesini Cloudflare Edge D1'e senkronize et
        if (
          sync_gps === '1' &&
          Number.isFinite(parsedLat) &&
          Number.isFinite(parsedLon) &&
          (Math.abs(parsedLat) > 0.001 || Math.abs(parsedLon) > 0.001)
        ) {
          const imeiKey = String(dev.imei || imei);
          const prevPush = lastEdgeCameraPush.get(imeiKey);
          const nowMs = Date.now();
          const accNumeric = isAccOn ? 1 : 0;
          const currentGpsTime = String(dev.gpsTime || '');
          const gpsFixAdvanced = Boolean(currentGpsTime && (!prevPush || prevPush.gpsTime !== currentGpsTime));
          // Hareket halindeyken eski GPS koordinatını yeni zaman damgasıyla tekrar basıp simgeyi geri sıçratma;
          // yalnızca yeni uydu konumu (gpsTime) geldiğinde veya kontak/durum değiştiğinde ilet
          const shouldPush =
            !prevPush ||
            prevPush.acc !== accNumeric ||
            prevPush.status !== (dev.status || '') ||
            (isMovingHw ? gpsFixAdvanced : nowMs - prevPush.at >= 20000);

          if (shouldPush) {
            lastEdgeCameraPush.set(imeiKey, {
              at: nowMs,
              gpsTime: currentGpsTime,
              acc: accNumeric,
              status: dev.status || '',
              lat: parsedLat,
              lon: parsedLon,
            });
            const trackerToken = process.env.TRACKER_TOKEN || 'inaner123';
            const speedKnots = Number((speedKmh / 1.852).toFixed(2));
            const coordIso = gpsTimeIso || latestIso;
            fetch(`https://inaner.tr/api/save-location?token=${encodeURIComponent(trackerToken)}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-From': 'Cloudflare-Edge',
              },
              body: JSON.stringify({
                id: 'Göksel',
                driverId: 'Göksel',
                deviceId: 'Göksel',
                source: 'jc182_camera',
                lat: parsedLat,
                lon: parsedLon,
                speed: speedKnots,
                altitude: 0,
                heading,
                direction: heading,
                acc: accNumeric,
                isIdling: isIdling ? 1 : 0,
                staticType: dev.staticType || '',
                stationaryMinutes,
                timestamp: coordIso,
              }),
            }).catch(() => {});
          }
        }

        return res.status(200).json({
          code: 0,
          success: true,
          deviceId: 'Göksel',
          deviceName: dev.deviceName || 'Göksel',
          imei: dev.imei,
          model: dev.mcType || 'JC182',
          lat: Number.isFinite(parsedLat) ? parsedLat : null,
          lon: Number.isFinite(parsedLon) ? parsedLon : null,
          speed: speedKmh,
          heading,
          acc: isAccOn ? 1 : 0,
          accText: isAccOn ? 'Kontak Açık' : 'Kontak Kapalı',
          isMoving: isMovingHw,
          isIdling,
          isParked,
          staticType: dev.staticType || '',
          stationaryMinutes,
          status: dev.status,
          hwStatus: dev.status || (isMovingHw ? 'MOVE' : 'STATIC'),
          statusStr: dev.statusStr || (isMovingHw ? `${speedKmh} km/h` : (isAccOn ? 'Rölanti' : 'Park')),
          gpsTime: dev.gpsTime || null,
          hbTime: dev.hbTime || null,
          gpsTimeIso,
          hbTimeIso,
          timestampIso: latestIso,
          satellites: Number.isFinite(parsedSatellites) && parsedSatellites > 0 ? parsedSatellites : null,
          gpsSignal: Number.isFinite(parsedGpsSignal) ? parsedGpsSignal : null,
          voltage: realVoltage ? String(realVoltage) : null,
          battery: dev.powerPercentage || null,
          supportChannel: Number(dev.supportChannel) || 1,
        });
      }
      return res.status(404).json({ error: 'Cihaz bulunamadı.' });
    }

    // ── 2.1 CİHAZ OLAY VE ALARM BİLDİRİMLERİ (Titreşim, Çarpışma, ADAS, Park Olayları) ──
    if (action === 'alarms') {
      const alarmRes = await fetch(`${EU_WEB_API_URL}/v3/new/userMsg/listAlarm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: webToken,
        },
        body: JSON.stringify({
          page: 1,
          pageSize: Math.min(50, Math.max(1, Number(pageSize) || 10)),
          imei: String(imei),
        }),
      });
      const alarmData = await alarmRes.json();
      const rawAlarms = alarmData?.data?.alarmList || [];
      const alarms = rawAlarms.map((a) => ({
        id: a.id,
        imei: a.imei,
        typeCode: a.status || a.alarmType || '',
        title: a.statusName || a.alarmName || 'Olay Bildirimi',
        time: a.pushTime || a.createTime || '',
        lat: a.lat,
        lon: a.lng,
        speed: Number(a.speed) || 0,
        eventAttachment: a.eventAttachment || null,
        hasMedia: Boolean(a.eventAttachment),
      }));
      return res.status(200).json({ code: 0, success: true, alarms });
    }

    // ── 3. SD KART GEÇMİŞ KAYIT LİSTESİ SORGULA (Jimi JC182 / JC450) ──
    if (action === 'history') {
      const todayTr = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
      const targetDate = date || todayTr;
      const forceRefresh = req.query?.force === '1';
      const cacheKey = `${imei}_${targetDate}_${channel}`;
      const nowMs = Date.now();

      if (!forceRefresh) {
        const cachedHit = historyListServerCache.get(cacheKey);
        if (cachedHit && nowMs < cachedHit.expiresAt && cachedHit.segments.length > 0) {
          return res.status(200).json({
            code: 0,
            segments: cachedHit.segments,
            recordedDates: [targetDate],
            cached: true,
            appId,
          });
        }
      }

      try {
        let queryPromise = !forceRefresh ? inflightHistoryRequests.get(cacheKey) : null;

        if (!queryPromise) {
          queryPromise = (async () => {
            const runSingleHistoryAttempt = async (maxPolls) => {
              const instructionId = 'ins_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
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

              for (let poll = 0; poll < maxPolls; poll++) {
                await new Promise((r) => setTimeout(r, 950));
                try {
                  const pollRes = await fetch(
                    `${EU_WEB_API_URL}/v3/new/newVideo/historyVideo/getHistoryVideoListRoundRobin/${instructionId}`,
                    { headers: { Authorization: webToken } }
                  );
                  const pollData = await pollRes.json();
                  if (pollData?.code === 10000 && Array.isArray(pollData?.data)) {
                    return { answered: true, list: pollData.data };
                  }
                } catch {
                  // bekle ve tekrar dene
                }
              }
              return { answered: false, list: [] };
            };

            // 1. Deneme: 170+ segmentlik 4G Cat-1 listeleri 6-9 sn sürebildiği için 10 tura kadar bekle (geldiği an çıkar)
            let attempt = await runSingleHistoryAttempt(10);

            // Canlı yayın kapanışı sırasında ilk komut düşerse 1 kez taze instruction ile tekrarla
            if (!attempt.answered) {
              await new Promise((r) => setTimeout(r, 400));
              attempt = await runSingleHistoryAttempt(6);
            }

            return attempt.list;
          })();

          inflightHistoryRequests.set(cacheKey, queryPromise);
        }

        let rawList = [];
        try {
          rawList = await queryPromise;
        } finally {
          if (inflightHistoryRequests.get(cacheKey) === queryPromise) {
            inflightHistoryRequests.delete(cacheKey);
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

        if (segments.length > 0) {
          const ttlMs = targetDate === todayTr ? 45 * 1000 : 10 * 60 * 1000;
          historyListServerCache.set(cacheKey, {
            expiresAt: Date.now() + ttlMs,
            segments,
          });
        }

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
        const { url, fallbackUrl, rawUrl } = normalizeStreamUrls(rawStreamUrl);

        return res.status(200).json({
          code: playData?.code ?? 0,
          url,
          fallbackUrl,
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
      const statusCmd = await sendJc182Instruction(webToken, imei, {
        orderContent: 'STATUS#',
        instructionId: '525',
        instructionName: 'Status',
        param: '',
      });
      const parsedStatus = statusCmd.reply ? parseDeviceStatusReply(statusCmd.reply) : null;
      if (parsedStatus) {
        hardwareStatusCache.set(String(imei), {
          expiresAt: Date.now() + 15 * 60 * 1000,
          ...parsedStatus,
        });
      }

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
        ok: statusCmd.ok,
        code: statusCmd.code,
        message: 'Kamera uyandırma sinyali gönderildi.',
        statusText: statusCmd.reply || statusCmd.msg || 'Tamamlandı',
        parsedStatus,
        telemetry,
      });
    }

    // ── 6.1 JC182 DONANIM KALİBRASYONU (24V Akü Kalkanı + 20° Viraj GPS + SD Kart Denetimi) ──
    if (action === 'calibrate') {
      const batteryRawThreshold = Math.round(JC182_CALIBRATION_PROFILE.lowBatteryThresholdV * 10);
      const batteryRawRecovery = Math.round(JC182_CALIBRATION_PROFILE.recoveryVoltageV * 10);

      // 1. 24V İveco Düşük Akü Kalkanı: EVENTSET,AEPLV,232,242,30#
      const batteryShieldRes = await sendJc182Instruction(webToken, imei, {
        orderContent: 'EVENTSET,AEPLV,{0},{1},{2}#',
        instructionId: '735',
        instructionName: 'Araç Akü Düşük Gücü',
        param: `1346,${batteryRawThreshold};1347,${batteryRawRecovery};1348,${JC182_CALIBRATION_PROFILE.lowBatteryDetectSec}`,
      });

      // 2. 20° Viraj Dönüş Hassasiyeti: ANGLEREP,ON,20,2#
      const angleRepRes = await sendJc182Instruction(webToken, imei, {
        orderContent: 'ANGLEREP,ON,{0},{1}#',
        instructionId: '539',
        instructionName: 'Konum Tamamlayıcı',
        param: `1316,${JC182_CALIBRATION_PROFILE.angleDeg};1317,${JC182_CALIBRATION_PROFILE.angleTimerSec}`,
      });

      // 3. 5 Saniye Sürüş GPS Aralığı: TIMER,5#
      const timerRes = await sendJc182Instruction(webToken, imei, {
        orderContent: 'TIMER,{0}#',
        instructionId: '522',
        instructionName: 'Konum Noktasını Yükle',
        param: `939,${JC182_CALIBRATION_PROFILE.gpsTimerSec}`,
      });

      // 4. Başlangıç SD Kart (CAMERA,TF#) ve Donanım Durumu (STATUS#) kaydı
      const healthSummary = await runHardwareHealthCheck(webToken, imei, { isScheduledWeekly: false });

      return res.status(200).json({
        ok: Boolean(batteryShieldRes.ok && angleRepRes.ok && timerRes.ok),
        imei: String(imei),
        profile: JC182_CALIBRATION_PROFILE,
        results: {
          batteryShield24V: batteryShieldRes,
          corneringGps: angleRepRes,
          gpsTimer: timerRes,
        },
        health: healthSummary,
      });
    }

    // ── 6.2 SESSİZ SD KART & AKÜ SAĞLIK KONTROLÜ (CAMERA,TF# + STATUS#) ──
    if (action === 'health_check') {
      const summary = await runHardwareHealthCheck(webToken, imei, { isScheduledWeekly: false });
      return res.status(200).json({
        ok: true,
        imei: String(imei),
        ...summary,
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
      } catch {
        // ignore alarm fetch error
      }

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
      } catch {
        // ignore upload trigger error
      }

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
        } catch {
          // ignore poll error
        }
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

    // ── 9. AÇIK KOMUT GÖNDER ──
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

    // ── 10. Open API Fallback ──
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

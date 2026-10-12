/**
 * İnaner Logistics - Apple Standartlarında Gelişmiş Ziyaretçi ve Donanım Analiz Motoru
 * - Donanım Tabanlı Cihaz Parmak İzi (Canvas + WebGL + Audio + Sistem Donanımı)
 * - Oturum Yaşam Döngüsü ve Canlı Heartbeat
 * - VPN, Proxy, Veri Merkezi ve Gizli Sekme (Incognito) Tespiti
 */

// Hızlı ve kararlı 32-bit Hash Fonksiyonu
const createHash = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // 32bit integer
    }
    return Math.abs(hash).toString(36);
};

// Canvas Parmak İzi (GPU ve Font Çizim İmzası)
const getCanvasFingerprint = () => {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        if (!ctx) return 'no-canvas';
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('İnanerLogistics,123!', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('İnanerLogistics,123!', 4, 17);
        return createHash(canvas.toDataURL());
    } catch {
        return 'canvas-err';
    }
};

// WebGL GPU Renderer Bilgisi
const getWebGLInfo = () => {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { vendor: 'Bilinmiyor', renderer: 'Bilinmiyor' };
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) return { vendor: 'Standart WebGL', renderer: 'Standart GPU' };
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Bilinmiyor';
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Bilinmiyor';
        return { vendor, renderer };
    } catch {
        return { vendor: 'Hata', renderer: 'Hata' };
    }
};

// Ses Donanımı İmzası (AudioContext Osilatör)
const getAudioFingerprint = async () => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return 'no-audio';
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const analyser = context.createAnalyser();
        const gain = context.createGain();
        const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

        gain.gain.value = 0; // Sessiz
        oscillator.type = 'triangle';
        oscillator.connect(analyser);
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(gain);
        gain.connect(context.destination);

        return new Promise((resolve) => {
            let resolved = false;
            scriptProcessor.onaudioprocess = (event) => {
                if (resolved) return;
                resolved = true;
                const array = new Float32Array(analyser.frequencyBinCount);
                analyser.getFloatFrequencyData(array);
                context.close();
                resolve(createHash(array.slice(0, 10).join(',')));
            };
            oscillator.start(0);
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    try { context.close(); } catch {}
                    resolve('audio-timeout');
                }
            }, 500);
        });
    } catch {
        return 'audio-err';
    }
};

// IP ve Lokasyon Bilgisi Toplama
export const fetchNetworkDetails = async () => {
    let ip = 'Bilinmiyor';
    let location = 'Bilinmiyor';
    let ipTz = null;
    let ipOrg = '';
    let countryCode = 'TR';
    let city = 'Bilinmiyor';

    try {
        const ipRes = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
        const ipData = await ipRes.json();
        ip = ipData.ip || 'Bilinmiyor';
        if (ipData.timezone) ipTz = ipData.timezone;
        if (ipData.org) ipOrg = ipData.org;
        if (ipData.country_code) countryCode = ipData.country_code;
        if (ipData.city) {
            city = ipData.city;
            location = `${ipData.city}, ${ipData.country_name || 'Türkiye'}`;
        }
    } catch {
        try {
            const ipInfoRes = await fetch('https://ipinfo.io/json', { cache: 'no-store' });
            const ipInfoData = await ipInfoRes.json();
            ip = ipInfoData.ip || 'Bilinmiyor';
            if (ipInfoData.timezone) ipTz = ipInfoData.timezone;
            if (ipInfoData.org) ipOrg = ipInfoData.org;
            if (ipInfoData.country) countryCode = ipInfoData.country;
            if (ipInfoData.city) {
                city = ipInfoData.city;
                location = `${ipInfoData.city}, ${ipInfoData.country}`;
            }
        } catch { /* Ağ hatası durumunda sessizce geç */ }
    }

    return { ip, location, ipTz, ipOrg, countryCode, city };
};

// Cihaz ve İşletim Sistemi Ayrıştırma (iPhone, iPad, Android ve PC Model Tespiti)
export const parseDevice = () => {
    if (typeof window === 'undefined') {
        return { os: 'Bilinmiyor', browser: 'Bilinmiyor', deviceType: 'Masaüstü', model: 'Bilinmiyor', deviceName: 'Bilinmeyen Cihaz', summary: 'Bilinmiyor' };
    }

    const ua = navigator.userAgent;
    let os = 'Bilinmeyen İşletim Sistemi';
    let model = '';

    // Ekran çözünürlüğü ve piksel oranı (Apple cihaz modelini kesin tespit etmek için)
    const screenWidth = typeof window !== 'undefined' ? Math.min(window.screen.width, window.screen.height) : 0;
    const screenHeight = typeof window !== 'undefined' ? Math.max(window.screen.width, window.screen.height) : 0;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11';
    else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1';
    else if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('iPhone')) {
        os = 'iOS';
        // iPhone model tespiti (Çözünürlük ve piksel oranı haritası)
        if (screenWidth === 440 && screenHeight === 956) model = 'iPhone 16 Pro Max';
        else if (screenWidth === 402 && screenHeight === 874) model = 'iPhone 16 Pro';
        else if (screenWidth === 430 && screenHeight === 932) model = 'iPhone 15 Pro Max / 14 Pro Max';
        else if (screenWidth === 393 && screenHeight === 852) model = 'iPhone 15 Pro / 15 / 14 Pro';
        else if (screenWidth === 428 && screenHeight === 926) model = 'iPhone 14 Plus / 13 Pro Max / 12 Pro Max';
        else if (screenWidth === 390 && screenHeight === 844) model = 'iPhone 14 / 13 / 13 Pro / 12 / 12 Pro';
        else if (screenWidth === 375 && screenHeight === 812) model = 'iPhone 13 mini / 12 mini / 11 Pro / X';
        else if (screenWidth === 414 && screenHeight === 896 && dpr === 3) model = 'iPhone 11 Pro Max / XS Max';
        else if (screenWidth === 414 && screenHeight === 896 && dpr === 2) model = 'iPhone 11 / XR';
        else if (screenWidth === 375 && screenHeight === 667) model = 'iPhone SE / 8';
        else if (screenWidth === 414 && screenHeight === 736) model = 'iPhone 8 Plus / 7 Plus';
        else model = 'iPhone';
    }
    else if (ua.includes('iPad') || (ua.includes('Mac') && navigator.maxTouchPoints > 1)) {
        os = 'iPadOS';
        // iPad model tespiti
        if (screenWidth === 1024 && screenHeight === 1366) model = 'iPad Pro 12.9"';
        else if (screenWidth === 834 && screenHeight === 1194) model = 'iPad Pro 11"';
        else if (screenWidth === 820 && screenHeight === 1180) model = 'iPad Air 10.9"';
        else if (screenWidth === 810 && screenHeight === 1080) model = 'iPad 10.2"';
        else if (screenWidth === 744 && screenHeight === 1133) model = 'iPad mini';
        else model = 'iPad';
    }
    else if (ua.includes('Mac OS X')) {
        os = 'macOS';
        model = 'Mac / MacBook';
    }
    else if (ua.includes('Android')) {
        os = 'Android';
        // Android model çıkarma (User Agent regex)
        const androidMatch = ua.match(/Android[^;]+;\s*([^;)]+)\s*[;)]/);
        if (androidMatch && androidMatch[1]) {
            const rawModel = androidMatch[1].trim();
            if (rawModel.includes('SM-S928')) model = 'Samsung Galaxy S24 Ultra';
            else if (rawModel.includes('SM-S926')) model = 'Samsung Galaxy S24+';
            else if (rawModel.includes('SM-S921')) model = 'Samsung Galaxy S24';
            else if (rawModel.includes('SM-S918')) model = 'Samsung Galaxy S23 Ultra';
            else if (rawModel.includes('SM-S916')) model = 'Samsung Galaxy S23+';
            else if (rawModel.includes('SM-S911')) model = 'Samsung Galaxy S23';
            else if (rawModel.includes('SM-G998')) model = 'Samsung Galaxy S21 Ultra';
            else if (rawModel.includes('SM-G996')) model = 'Samsung Galaxy S21+';
            else if (rawModel.includes('SM-G991')) model = 'Samsung Galaxy S21';
            else if (rawModel.includes('SM-A')) model = `Samsung Galaxy A Serisi (${rawModel})`;
            else model = rawModel;
        } else {
            model = 'Android Cihaz';
        }
    }
    else if (ua.includes('Linux')) os = 'Linux';

    let browser = 'Tarayıcı';
    if (ua.includes('Edg/')) browser = 'Microsoft Edge';
    else if (ua.includes('Chrome/') && !ua.includes('Edg/') && !ua.includes('OPR/')) browser = 'Google Chrome';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Apple Safari';
    else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';
    else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';

    const isTablet = os === 'iPadOS' || /iPad|Tablet/i.test(ua) || (os === 'macOS' && navigator.maxTouchPoints > 1);
    const isMobile = !isTablet && /Mobi|Android|iPhone/i.test(ua);
    const deviceType = isTablet ? 'Tablet' : isMobile ? 'Mobil' : 'Masaüstü';

    const deviceName = model ? `${model} (${browser})` : `${os} (${browser})`;

    return {
        os,
        model: model || os,
        browser,
        deviceType,
        deviceName,
        summary: `${deviceName} · ${deviceType}`
    };
};

// Tam Donanım Parmak İzi ve Güvenlik Analizi
export const getDeviceFingerprint = async () => {
    const net = await fetchNetworkDetails();
    const dev = parseDevice();
    const canvasHash = getCanvasFingerprint();
    const gpu = getWebGLInfo();
    const audioHash = await getAudioFingerprint();

    const screenRes = typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : 'Bilinmiyor';
    const colorDepth = typeof window !== 'undefined' ? window.screen.colorDepth : 24;
    const cpuCores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 8;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul';
    const lang = navigator.language || 'tr-TR';
    const touchPoints = navigator.maxTouchPoints || 0;

    // Benzersiz Donanım Kimliği (Device ID)
    const rawFingerprint = `${dev.os}_${dev.browser}_${screenRes}_${colorDepth}_${cpuCores}_${gpu.renderer}_${canvasHash}_${audioHash}_${tz}_${lang}`;
    const fingerprintId = 'DEV-' + createHash(rawFingerprint).toUpperCase();

    // 1. VPN / Proxy Riski
    let vpnRisk = false;
    let vpnReason = '';
    if (net.ipTz && tz && net.ipTz !== tz) {
        vpnRisk = true;
        vpnReason = `IP Saat Dilimi (${net.ipTz}) ile Donanım (${tz}) uyuşmuyor`;
    }
    const orgLower = net.ipOrg.toLowerCase();
    const cloudKeywords = ['vpn', 'proxy', 'datacenter', 'hosting', 'digitalocean', 'amazon', 'aws', 'ovh', 'linode', 'hetzner', 'google cloud', 'azure', 'cloudflare'];
    if (cloudKeywords.some(k => orgLower.includes(k))) {
        vpnRisk = true;
        vpnReason = `Veri Merkezi / Sunucu IP (${net.ipOrg})`;
    }

    // 2. Gizli Sekme (Incognito) Tespiti
    let incognitoRisk = false;
    try {
        if (navigator.storage && navigator.storage.estimate) {
            const { quota } = await navigator.storage.estimate();
            if (quota && quota < 180000000) { // ~180MB altında bellek kotası gizli sekmeye işaret eder
                incognitoRisk = true;
            }
        }
    } catch {}

    // Önceden tanınan cihaz kontrolü
    let isKnownDevice = false;
    try {
        const storedFp = localStorage.getItem('tir_device_fp');
        if (storedFp === fingerprintId) {
            isKnownDevice = true;
        } else {
            localStorage.setItem('tir_device_fp', fingerprintId);
        }
    } catch {
        incognitoRisk = true;
    }

    return {
        fingerprintId,
        ip: net.ip,
        location: net.location,
        city: net.city,
        countryCode: net.countryCode,
        isp: net.ipOrg || 'Bilinmeyen Sağlayıcı',
        device: dev.summary,
        deviceType: dev.deviceType,
        os: dev.os,
        browser: dev.browser,
        screen: screenRes,
        cores: `${cpuCores} Çekirdek`,
        ram: `${memory} GB`,
        gpu: gpu.renderer,
        timezone: tz,
        language: lang,
        touchPoints,
        vpnRisk,
        vpnReason,
        incognitoRisk,
        isKnownDevice,
        rawUserAgent: navigator.userAgent
    };
};

import React, { useState, useContext, useEffect } from 'react';
import { DataContext } from '../context/DataContext';
import { User, Lock, Eye, EyeOff, AlertCircle, UserPlus, ChevronLeft } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';

const ADMIN_USER = { username: 'kenan', password: 'Mert0310.', role: 'super_admin', displayName: 'Kenan (Admin)' };

const getAdvancedMeta = async () => {
    let ip = 'Bilinmiyor';
    let location = 'Bilinmiyor';
    let ipTz = null;
    let ipOrg = '';

    try {
        const ipRes = await fetch('https://ipapi.co/json/');
        const ipData = await ipRes.json();
        ip = ipData.ip || 'Bilinmiyor';
        if (ipData.timezone) ipTz = ipData.timezone;
        if (ipData.org) ipOrg = ipData.org;
        if (ipData.city) location = `${ipData.city}, ${ipData.country_name} (${ipData.org})`;
    } catch {
        try {
            const ipInfoRes = await fetch('https://ipinfo.io/json');
            const ipInfoData = await ipInfoRes.json();
            ip = ipInfoData.ip || 'Bilinmiyor';
            if (ipInfoData.timezone) ipTz = ipInfoData.timezone;
            if (ipInfoData.org) ipOrg = ipInfoData.org;
            if (ipInfoData.city) location = `${ipInfoData.city}, ${ipInfoData.country} (${ipInfoData.org})`;
        } catch { }
    }

    const rawDevice = navigator.userAgent;
    let deviceStr = 'Bilinmeyen Cihaz';
    if (rawDevice.includes('Windows')) deviceStr = 'Windows';
    else if (rawDevice.includes('Mac')) deviceStr = 'MacOS';
    else if (rawDevice.includes('Android')) deviceStr = 'Android';
    else if (rawDevice.includes('iPhone') || rawDevice.includes('iPad')) deviceStr = 'iOS';
    else if (rawDevice.includes('Linux')) deviceStr = 'Linux';
    
    let browserStr = 'Tarayıcı';
    if (rawDevice.includes('Chrome') && !rawDevice.includes('Edg') && !rawDevice.includes('OPR')) browserStr = 'Chrome';
    else if (rawDevice.includes('Safari') && !rawDevice.includes('Chrome')) browserStr = 'Safari';
    else if (rawDevice.includes('Firefox')) browserStr = 'Firefox';
    else if (rawDevice.includes('Edg')) browserStr = 'Edge';
    else if (rawDevice.includes('OPR') || rawDevice.includes('Opera')) browserStr = 'Opera';

    const device = `${deviceStr} - ${browserStr}`;
    const screen = typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height} (${window.screen.colorDepth}-bit)` : 'Bilinmiyor';
    const cores = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} Çekirdek` : 'Bilinmiyor';
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Bilinmiyor';
    const lang = navigator.language || 'Bilinmiyor';
    const isKnownDevice = localStorage.getItem('tir_known_device') === 'true';

    // 1. VPN/Proxy Algılama
    let vpnRisk = false;
    if (ipTz && tz !== 'Bilinmiyor' && ipTz !== tz) {
        vpnRisk = true; // IP konumu ile cihaz saat dilimi uyuşmuyor!
    }
    const orgL = ipOrg.toLowerCase();
    if (orgL.includes('vpn') || orgL.includes('proxy') || orgL.includes('datacenter') || orgL.includes('digitalocean') || orgL.includes('amazon') || orgL.includes('aws') || orgL.includes('cloud') || orgL.includes('server')) {
        vpnRisk = true;
    }

    // 2. Gizli Sekme (Incognito) Algılama Heuristic
    let incognitoRisk = false;
    try {
        if (navigator.storage && navigator.storage.estimate) {
            const { quota } = await navigator.storage.estimate();
            // Gizli sekmeler belleği genellikle katı bir şekilde kısıtlar (Örn: ~100MB - 120MB arası). 
            if (quota < 200000000) { 
                incognitoRisk = true;
            }
        }
    } catch {}

    // Apple cihazlarında localStorage kullanımları zaten Safari Strict yapısından ötürü gizli sekme gibi davrandığından incognito'yu flagliyoruz
    if (!isKnownDevice && deviceStr === 'iOS' && browserStr === 'Safari') {
        incognitoRisk = true;
    }

    return { ip, location, device, rawDevice, screen, cores, tz, lang, isKnownDevice, vpnRisk, incognitoRisk };
};

const Login = () => {
    const { loginSession } = useContext(DataContext);
    const [mode, setMode] = useState('login'); // 'login' | 'register' | 'pending'
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [failCount, setFailCount] = useState(0);
    const [showVideo, setShowVideo] = useState(false);

    // Ana Sayfa Ziyaret Sayacı
    useEffect(() => {
        const logVisitor = async () => {
            if (sessionStorage.getItem('tir_visited')) return;
            sessionStorage.setItem('tir_visited', 'true');
            
            const advancedMeta = await getAdvancedMeta();
            
            try {
                await addDoc(collection(db, 'admin_logs'), {
                    timestamp: new Date().toISOString(),
                    action: 'ZIYARETCI_GIRIS',
                    detail: 'Siteye giriş yaptı (Ana Ekran)',
                    user: 'Misafir',
                    meta: advancedMeta,
                    companyId: 'inaner_logistics' // Log directly to super admin scope
                });
            } catch { } // Error logging visitor
        };
        logVisitor();
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        await new Promise(r => setTimeout(r, 500));

        const advancedMeta = await getAdvancedMeta();
        const { ip, location, device, rawDevice } = advancedMeta;
        const uname = username.toLowerCase().trim();

        try {
            const usersRef = collection(db, 'approved_users');
            const q = query(usersRef, where('username', '==', uname));
            const querySnapshot = await getDocs(q);

            let isAuthenticated = false;
            let userRole = 'user';
            let companyId = null;

            if (!querySnapshot.empty) {
                const userDoc = querySnapshot.docs[0].data();
                const hashedInputPassword = btoa(password);
                if (userDoc.password === hashedInputPassword || userDoc.password === password) {
                    isAuthenticated = true;
                    userRole = userDoc.role || 'user';
                    companyId = userDoc.companyId;
                }
            } else if (uname === ADMIN_USER.username && password === ADMIN_USER.password) {
                isAuthenticated = true;
                userRole = ADMIN_USER.role;
                companyId = null;
            }

            if (isAuthenticated) {
                localStorage.setItem('tir_known_device', 'true');
                localStorage.setItem('tir_auth_kenan_v1', btoa(`${uname}:${Date.now()}`));
                localStorage.setItem('tir_active_tab', 'dashboard');
                // Pass location & rawDevice for better logging and AWAIT it
                await loginSession({ username: uname, role: userRole, companyId: companyId, ip, device, location, rawDevice, ...advancedMeta });
                
                // --- TELEGRAM BİLDİRİMİ İÇİN (OPSİYONEL ALtyapı) ---
                // Eğer Telegram bildirimi isterseniz aşağıdaki // fetch satırlarını açıp BOT_TOKEN ve CHAT_ID girmeniz yeterli olacaktır:
                /*
                try {
                    const msg = `🚨 *YENİ GİRİŞ*\n👤 Kullanıcı: ${uname}\n📱 Cihaz: ${device}\n🌍 Konum: ${location}\n🌐 IP: ${ip}`;
                    await fetch(`https://api.telegram.org/bot<BURAYA_BOT_TOKEN_GELECEK>/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: '<BURAYA_CHAT_ID_GELECEK>', text: msg, parse_mode: 'Markdown' })
                    });
                } catch { } // hata olsa da girişi engelleme
                */

                window.location.href = '/';
                return;
            }

            // Bekleyen kullanıcı kontrolü
            const pendingRef = collection(db, 'pending_users');
            const pq = query(pendingRef, where('username', '==', uname));
            const pSnapshot = await getDocs(pq);
            if (!pSnapshot.empty) {
                setError('Hesabınız henüz admin tarafından onaylanmadı. Lütfen bekleyin.');
                setLoading(false);
                return;
            }

        } catch {
            
            setError('Sunucu bağlantı hatası. Lütfen daha sonra tekrar deneyin.');
            setLoading(false);
            return;
        }

        setError('Kullanıcı adı veya şifre hatalı.');

        try {
            await addDoc(collection(db, 'admin_logs'), {
                timestamp: new Date().toISOString(),
                action: 'HATALI_GIRIS',
                detail: `Hatalı giriş denemesi: ${uname || 'Bilinmiyor'}`,
                user: uname || 'Bilinmiyor',
                meta: advancedMeta,
                companyId: 'inaner_logistics'
            });
        } catch { /* log fail error */ }

        const newFailCount = failCount + 1;
        if (newFailCount >= 4) {
            setShowVideo(true);
            setFailCount(0);
            // 33 saniye sonra otomatik kapat (Video süresine göre ayarlandı)
            setTimeout(() => setShowVideo(false), 33000);
        } else {
            setFailCount(newFailCount);
        }
        setLoading(false);
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        if (password !== confirmPassword) { setError('Şifreler eşleşmiyor.'); return; }
        if (password.length < 4) { setError('Şifre en az 4 karakter olmalı.'); return; }

        const uname = username.toLowerCase().trim();
        if (uname === ADMIN_USER.username) { setError('Bu kullanıcı adı kullanılamaz.'); return; }

        setLoading(true);
        await new Promise(r => setTimeout(r, 400));

        try {
            // Check if username already exists in DB
            const usersRef = collection(db, 'approved_users');
            const q1 = query(usersRef, where('username', '==', uname));
            const snap1 = await getDocs(q1);

            const pendingRef = collection(db, 'pending_users');
            const q2 = query(pendingRef, where('username', '==', uname));
            const snap2 = await getDocs(q2);

            if (!snap1.empty || !snap2.empty) {
                setError('Bu kullanıcı adı zaten alınmış.');
                setLoading(false);
                return;
            }

            // Şifreyi açık metin (plaintext) olarak saklıyoruz (user isteği üzerine btoa kaldırıldı)
            await addDoc(collection(db, 'pending_users'), {
                username: uname,
                password: password,
                role: 'user',
                createdAt: new Date().toISOString()
            });

            setLoading(false);
            setMode('pending');

        } catch {
            
            setError('Kayıt oluşturulurken bir hata oluştu');
            setLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen w-full relative overflow-hidden bg-[var(--bg-base)] bg-cover bg-top"
            style={{
                backgroundImage: `linear-gradient(rgba(10, 18, 35, 0.55), rgba(2, 6, 23, 0.85)), url('/arkaplan123.jpg')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center center'
            }}
        >
            {/* Ortadaki/Üstteki Yazı */}
            <div className="absolute top-20 md:top-32 left-0 right-0 flex flex-col items-center justify-center pointer-events-none z-0 px-4">
                <h1 className="text-4xl sm:text-5xl md:text-7xl font-extralight tracking-[0.2em] text-[var(--text-primary)]/90 text-center uppercase"
                    style={{
                        textShadow: '0 2px 10px rgba(0,0,0,0.4)',
                    }}>
                    İNANER LOJİSTİK
                </h1>
            </div>

            {/* Sol Alttaki Login Kutusu */}
            <div className="absolute bottom-6 left-6 md:bottom-10 md:left-10 z-10 w-[280px]">
                <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(16px)' }}
                    className="rounded-xl p-5 shadow-2xl relative overflow-hidden">

                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

                    <div className="relative z-10">
                        {/* Onay Bekliyor */}
                        {mode === 'pending' && (
                            <div className="text-center py-2 space-y-3">
                                <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto">
                                    <UserPlus size={20} className="text-amber-400" />
                                </div>
                                <h2 className="text-base font-semibold text-[var(--text-primary)]">Başvurunuz Alındı</h2>
                                <p className="text-[var(--text-secondary)] text-xs">Admin onayından sonra giriş yapabilirsiniz.</p>
                                <button onClick={() => { setMode('login'); setUsername(''); setPassword(''); }}
                                    className="text-amber-400 text-xs hover:underline">Giriş ekranına dön</button>
                            </div>
                        )}

                        {/* Giriş */}
                        {mode === 'login' && (
                            <>
                                <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">Giriş Yap</h2>
                                <form onSubmit={handleLogin} className="space-y-3">
                                    <div>
                                        <label className="block text-xs text-[var(--text-secondary)] mb-1">Kullanıcı Adı</label>
                                        <div className="relative">
                                            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input type="text" autoComplete="username" placeholder="kullanici_adi" value={username}
                                                onChange={e => setUsername(e.target.value)} className="w-full glass-input text-sm pl-9 pr-3 py-2" required />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-[var(--text-secondary)] mb-1">Şifre</label>
                                        <div className="relative">
                                            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••"
                                                value={password} onChange={e => setPassword(e.target.value)}
                                                className="w-full glass-input text-sm pl-9 pr-9 py-2" required />
                                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[var(--text-primary)] transition-colors">
                                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </button>
                                        </div>
                                    </div>
                                    {error && (
                                        <div className="flex items-center gap-1.5 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-md px-2 py-1.5">
                                            <AlertCircle size={12} /> {error}
                                        </div>
                                    )}
                                    <button type="submit" disabled={loading}
                                        className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 disabled:cursor-not-allowed text-[var(--text-primary)] text-sm font-medium py-2 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2 mt-2">
                                        {loading ? <div className="w-4 h-4 border-2 border-[var(--border-color)] border-t-white rounded-full animate-spin" /> : 'Giriş Yap'}
                                    </button>
                                    <button type="button" onClick={() => { setMode('register'); setError(''); }}
                                        className="w-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs py-1 transition-colors flex items-center justify-center gap-1 mt-1">
                                        <UserPlus size={12} /> Yeni Hesap Oluştur
                                    </button>
                                </form>
                            </>
                        )}

                        {/* Kayıt */}
                        {mode === 'register' && (
                            <>
                                <div className="flex items-center gap-2 mb-4">
                                    <button onClick={() => { setMode('login'); setError(''); }}
                                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded transition">
                                        <ChevronLeft size={16} />
                                    </button>
                                    <h2 className="text-base font-semibold text-[var(--text-primary)]">Yeni Hesap</h2>
                                </div>
                                <p className="text-slate-500 text-[10px] mb-3 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1.5 text-amber-400">
                                    ⚠️ Hesabınız admin onayından sonra aktif olur.
                                </p>
                                <form onSubmit={handleRegister} className="space-y-3">
                                    <div>
                                        <label className="block text-xs text-[var(--text-secondary)] mb-1">Kullanıcı Adı</label>
                                        <div className="relative">
                                            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input type="text" placeholder="kullanici_adi" value={username}
                                                onChange={e => setUsername(e.target.value)} className="w-full glass-input text-sm pl-9 pr-3 py-2" required />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-[var(--text-secondary)] mb-1">Şifre</label>
                                        <div className="relative">
                                            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input type={showPassword ? 'text' : 'password'} placeholder="••••••"
                                                value={password} onChange={e => setPassword(e.target.value)}
                                                className="w-full glass-input text-sm pl-9 pr-9 py-2" required />
                                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[var(--text-primary)]">
                                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-[var(--text-secondary)] mb-1">Şifre Tekrar</label>
                                        <div className="relative">
                                            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input type="password" placeholder="••••••"
                                                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                                                className="w-full glass-input text-sm pl-9 pr-3 py-2" required />
                                        </div>
                                    </div>
                                    {error && (
                                        <div className="flex items-center gap-1.5 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-md px-2 py-1.5">
                                            <AlertCircle size={12} /> {error}
                                        </div>
                                    )}
                                    <button type="submit" disabled={loading}
                                        className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 text-[var(--text-primary)] text-sm font-medium py-2 rounded-lg transition-all flex items-center justify-center gap-2 mt-2">
                                        {loading ? <div className="w-4 h-4 border-2 border-[var(--border-color)] border-t-white rounded-full animate-spin" /> : 'Başvuru Gönder'}
                                    </button>
                                </form>
                            </>
                        )}
                    </div>
                </div>
                <p className="text-left text-[var(--text-primary)]/50 text-[10px] mt-2 ml-1">İnaner Lojistik © 2026</p>
            </div>

            {/* Yanlış Giriş YouTube Easter Egg */}
            {showVideo && (
                <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                    <div className="absolute top-6 right-6 z-[110]">
                        <button
                            onClick={() => setShowVideo(false)}
                            className="bg-white/10 hover:bg-white/20 text-[var(--text-primary)] px-4 py-2 rounded-lg backdrop-blur-md border border-[var(--border-color)] transition-all text-sm font-bold"
                        >
                            Kapat (X)
                        </button>
                    </div>
                    <div className="w-full h-full p-4 md:p-10">
                        <iframe
                            width="100%"
                            height="100%"
                            src="https://www.youtube.com/embed/TZdY5TV-CNM?autoplay=1&controls=0&rel=0"
                            title="İnaner Lojistik"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            className="rounded-2xl shadow-2xl border border-[var(--border-color)]"
                        ></iframe>
                    </div>
                    <div className="absolute bottom-10 text-[var(--text-primary)]/40 text-xs tracking-widest uppercase">
                        Çok fazla hatalı deneme yaptınız... biraz dinlenin.
                    </div>
                </div>
            )}
        </div>
    );
};

export default Login;

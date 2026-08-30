import React, { useState, useContext, useEffect } from 'react';
import { DataContext } from '../context/DataContext';
import { User, Lock, Eye, EyeOff, AlertCircle, UserPlus, ChevronLeft } from 'lucide-react';
import { db, auth, googleProvider } from '../services/firebaseConfig';
import { collection, query, where, getDocs, addDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { sendDiscordAlert } from '../services/discordWebhook';

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
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [failCount, setFailCount] = useState(0);
    const [googleLoading, setGoogleLoading] = useState(false);
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
                // G6: Ziyaretçi bildirimi
                sendDiscordAlert({
                    type: 'info',
                    title: '👁️ Yeni Ziyaretçi',
                    description: 'Birisi login sayfasını ziyaret etti.',
                    fields: [
                        { name: '📍 IP / Konum', value: advancedMeta.ip + ' — ' + advancedMeta.location, inline: false },
                        { name: '💻 Cihaz', value: advancedMeta.device, inline: true },
                        { name: '🕵️ VPN', value: advancedMeta.vpnRisk ? '⚠️ Şüpheli' : '✅ Temiz', inline: true },
                        { name: '🕶️ Gizli Sekme', value: advancedMeta.incognitoRisk ? '⚠️ Evet' : '✅ Hayır', inline: true },
                        { name: '📱 Bilinmeyen Cihaz', value: advancedMeta.isKnownDevice ? '✅ Tanıdık' : '⚠️ YENİ CİHAZ', inline: true },
                    ]
                });
            } catch { } // Error logging visitor
        };
        logVisitor();
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const advancedMeta = await getAdvancedMeta();
        const { ip, location, device, rawDevice } = advancedMeta;
        const uname = username.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const email = `${uname}@inaner.com`;

        try {
            // Firebase Auth Login
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const uid = userCredential.user.uid;

            // Fetch user role from approved_users directly by UID document ID
            const userDocRef = doc(db, 'approved_users', uid);
            const userDocSnap = await getDoc(userDocRef);

            let userRole = 'user';
            let companyId = null;

            if (userDocSnap.exists()) {
                const userDoc = userDocSnap.data();
                userRole = userDoc.role || 'user';
                companyId = userDoc.companyId;
            } else if (uname === 'kenan') {
                userRole = 'super_admin';
            } else {
                // Check if pending directly by UID
                const pendingDocRef = doc(db, 'pending_users', uid);
                const pendingSnap = await getDoc(pendingDocRef);
                
                await signOut(auth); // Sign out if not approved
                
                if (pendingSnap.exists()) {
                    setError('Hesabınız henüz admin tarafından onaylanmadı. Lütfen bekleyin.');
                } else {
                    setError('Kullanıcı hesabı bulunamadı. Lütfen yetkiliyle görüşün.');
                }
                setLoading(false);
                return;
            }

            localStorage.setItem('tir_known_device', 'true');
            localStorage.setItem('tir_active_tab', 'dashboard');

            // G1/G2/G3: Güvenlik uyarıları
            if (!advancedMeta.isKnownDevice || advancedMeta.vpnRisk || advancedMeta.incognitoRisk) {
                const flags = [];
                if (!advancedMeta.isKnownDevice) flags.push('⚠️ Bilinmeyen Cihaz');
                if (advancedMeta.vpnRisk) flags.push('🕵️ VPN/Proxy');
                if (advancedMeta.incognitoRisk) flags.push('🕶️ Gizli Sekme');
                sendDiscordAlert({
                    type: 'warning',
                    title: '🔐 Şüpheli Giriş Tespiti',
                    description: flags.join(' | '),
                    fields: [
                        { name: '👤 Kullanıcı', value: uname, inline: true },
                        { name: '📍 IP / Konum', value: advancedMeta.ip + ' — ' + advancedMeta.location, inline: false },
                        { name: '💻 Cihaz', value: advancedMeta.device, inline: true },
                    ]
                });
            }

            await loginSession({ uid, username: uname, role: userRole, companyId: companyId, ip, device, location, rawDevice, ...advancedMeta });
            window.location.href = '/';
            return;

        } catch (error) {
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

            // G4/G5: Hatalı giriş bildirimi
            const nextFail = failCount + 1;
            sendDiscordAlert({
                type: nextFail >= 4 ? 'danger' : 'warning',
                title: nextFail >= 4 ? '🚫 ÇOK FAZLA HATALI GİRİŞ!' : '🔴 Hatalı Giriş Denemesi',
                description: nextFail >= 4 ? '4+ ardışık hatalı giriş — brute force riski!' : `${nextFail}. hatalı deneme`,
                fields: [
                    { name: '👤 Kullanıcı', value: uname || 'Bilinmiyor', inline: true },
                    { name: '📍 IP', value: advancedMeta.ip, inline: true },
                    { name: '💻 Cihaz', value: advancedMeta.device, inline: true },
                ]
            });

            const newFailCount = failCount + 1;
            if (newFailCount >= 4) {
                setShowVideo(true);
                setFailCount(0);
                setTimeout(() => setShowVideo(false), 33000);
            } else {
                setFailCount(newFailCount);
            }
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setGoogleLoading(true);

        try {
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;
            const uid = user.uid;

            const advancedMeta = await getAdvancedMeta();

            // Kullanıcı approved_users'da var mı?
            const userDocRef = doc(db, 'approved_users', uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                const uname = userData.username || user.displayName || user.email.split('@')[0];

                localStorage.setItem('tir_known_device', 'true');
                localStorage.setItem('tir_active_tab', 'dashboard');

                await loginSession({
                    uid,
                    username: uname,
                    role: userData.role || 'user',
                    companyId: userData.companyId,
                    ...advancedMeta
                });
                window.location.href = '/';
                return;
            }

            // Pending'de var mı?
            const pendingDocRef = doc(db, 'pending_users', uid);
            const pendingSnap = await getDoc(pendingDocRef);

            if (pendingSnap.exists()) {
                await signOut(auth);
                setError('Hesabınız henüz admin tarafından onaylanmadı. Lütfen bekleyin.');
                setGoogleLoading(false);
                return;
            }

            // Yeni kullanıcı: otomatik olarak başvuru oluştur
            const googleUsername = (user.displayName || user.email.split('@')[0]).toLowerCase().replace(/[^a-z0-9]/g, '');
            await setDoc(doc(db, 'pending_users', uid), {
                username: googleUsername,
                googleEmail: user.email,
                googleDisplayName: user.displayName || '',
                googlePhotoURL: user.photoURL || '',
                role: 'user',
                createdAt: new Date().toISOString(),
                companyId: 'inaner_logistics'
            });

            try {
                await addDoc(collection(db, 'admin_logs'), {
                    timestamp: new Date().toISOString(),
                    action: 'GOOGLE_BASVURU',
                    detail: `Google ile yeni başvuru: ${user.email} (${googleUsername})`,
                    user: googleUsername,
                    meta: { ...advancedMeta, googleEmail: user.email },
                    companyId: 'inaner_logistics'
                });
            } catch { /* log fail */ }

            // G7: Google başvurusu bildirimi
            sendDiscordAlert({
                type: 'info',
                title: '📬 Google ile Yeni Başvuru',
                description: `**${googleUsername}** sisteme başvurdu. Onay bekliyor.`,
                fields: [
                    { name: '📧 Google E-posta', value: user.email, inline: true },
                    { name: '📍 IP', value: advancedMeta.ip, inline: true },
                ]
            });

            await signOut(auth);
            setGoogleLoading(false);
            setMode('pending');

        } catch (error) {
            console.error('Google giriş hatası:', error);
            if (error.code === 'auth/popup-closed-by-user') {
                setError('');
            } else {
                setError('Google ile giriş sırasında bir hata oluştu.');
            }
            setGoogleLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        if (password !== confirmPassword) { setError('Şifreler eşleşmiyor.'); return; }
        if (password.length < 6) { setError('Şifre en az 6 karakter olmalı (Firebase Güvenlik Kuralı).'); return; }

        const uname = username.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        if (uname === 'kenan') { setError('Bu kullanıcı adı kullanılamaz.'); return; }

        setLoading(true);

        try {
            const email = `${uname}@inaner.com`;
            let uid = null;
            
            // Create Firebase Auth user
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                uid = userCredential.user.uid;
            } catch (authError) {
                if (authError.code === 'auth/email-already-in-use') {
                    setError('Bu kullanıcı adı zaten alınmış.');
                } else {
                    setError('Hesap oluşturulurken bir hata oluştu: ' + authError.message);
                }
                setLoading(false);
                return;
            }

            // Şifreyi VERİTABANINA ASLA KAYDETMİYORUZ. UID'yi döküman kimliği yaparak pending_users'a yazıyoruz.
            try {
                await setDoc(doc(db, 'pending_users', uid), {
                    username: uname,
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    fullName: `${firstName.trim()} ${lastName.trim()}`,
                    role: 'user',
                    companyId: 'inaner_logistics',
                    createdAt: new Date().toISOString()
                });
                
                await signOut(auth); // Immediately sign out the pending user AFTER writing to Firestore
            } catch (firestoreError) {
                console.error("Firestore write error:", firestoreError);
                setError('Kayıt isteği kaydedilirken bir hata oluştu: ' + firestoreError.message);
                setLoading(false);
                return;
            }

            setLoading(false);
            setMode('pending');

        } catch {
            setError('Kayıt isteği gönderilirken bir hata oluştu.');
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
            <div 
                className="absolute bottom-4 left-4 right-4 sm:right-auto sm:bottom-10 sm:left-10 z-10 w-auto sm:w-[290px] max-w-sm"
                style={{
                    marginBottom: 'env(safe-area-inset-bottom, 0px)'
                }}
            >
                <div style={{ background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(16px)' }}
                    className="rounded-2xl p-5 shadow-2xl relative overflow-hidden">

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
                                    <div className="flex items-center gap-3 mt-3">
                                        <div className="flex-1 h-px bg-[var(--border-color)]"></div>
                                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">veya</span>
                                        <div className="flex-1 h-px bg-[var(--border-color)]"></div>
                                    </div>
                                    <button type="button" onClick={handleGoogleLogin} disabled={googleLoading}
                                        className="w-full bg-white/10 hover:bg-white/15 disabled:bg-white/5 disabled:cursor-not-allowed text-[var(--text-primary)] text-sm font-medium py-2 rounded-lg transition-all border border-[var(--border-color)] flex items-center justify-center gap-2 mt-2">
                                        {googleLoading ? (
                                            <div className="w-4 h-4 border-2 border-[var(--border-color)] border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                            </svg>
                                        )}
                                        Google ile Giriş Yap
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
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs text-[var(--text-secondary)] mb-1">Ad</label>
                                            <div className="relative">
                                                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                                <input type="text" placeholder="Adınız" value={firstName}
                                                    onChange={e => setFirstName(e.target.value)} className="w-full glass-input text-sm pl-9 pr-3 py-2" required />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-[var(--text-secondary)] mb-1">Soyad</label>
                                            <div className="relative">
                                                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                                <input type="text" placeholder="Soyadınız" value={lastName}
                                                    onChange={e => setLastName(e.target.value)} className="w-full glass-input text-sm pl-9 pr-3 py-2" required />
                                            </div>
                                        </div>
                                    </div>
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

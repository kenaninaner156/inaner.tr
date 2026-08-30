import React, { useState, useEffect, useRef, useContext } from 'react';
import { Settings as SettingsIcon, Database, Save, Server, ShieldCheck, Camera, UploadCloud, Truck, Loader2, Globe, Key, AlertCircle, Link2, Unlink, CheckCircle2, Menu } from 'lucide-react';
import WipeData from './WipeData';
import { DataContext } from '../context/DataContext';
import { useTruck } from '../context/TruckContext';
import { auth, googleProvider } from '../services/firebaseConfig';
import { linkWithPopup, unlink } from 'firebase/auth';

const Settings = ({ onOpenMenu, isMobile } = {}) => {
    const { updateTruckImage, currentSession, approvedUsers, editUser, addLog } = useContext(DataContext);
    const { activeTruckId, activeTruckData } = useTruck();
    const [profilePic, setProfilePic] = useState(activeTruckData?.imageUrl || null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const fileInputRef = useRef(null);
    const IMGBB_KEY = 'b9783b951fef452d9dee0c3c0fc206cc';

    // Google Link State
    const [googleLinkStatus, setGoogleLinkStatus] = useState({ type: '', message: '' });
    const [googleLinkLoading, setGoogleLinkLoading] = useState(false);
    const [linkedGoogle, setLinkedGoogle] = useState(null);

    useEffect(() => {
        const user = auth.currentUser;
        if (user) {
            const googleInfo = user.providerData.find(p => p.providerId === 'google.com');
            setLinkedGoogle(googleInfo || null);
        }
    }, []);

    // Password Change State
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [passwordStatus, setPasswordStatus] = useState({ type: '', message: '' });

    // 3D Lastik Kalibrasyon Modu State
    const [calibrationMode, setCalibrationMode] = useState(() => {
        return localStorage.getItem('tire-3d-calibration-mode') === 'true';
    });

    const handleCalibrationToggle = (val) => {
        setCalibrationMode(val);
        localStorage.setItem('tire-3d-calibration-mode', val ? 'true' : 'false');
    };

    useEffect(() => {
        setProfilePic(activeTruckData?.imageUrl || null);
    }, [activeTruckData?.imageUrl]);

    // URL hook kaldırıldı

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsUploading(true);
        setUploadError('');
        try {
            const formData = new FormData();
            formData.append('image', file);
            const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (data.success) {
                const url = data.data.url;
                setProfilePic(url);
                await updateTruckImage(activeTruckId, url);
            } else {
                setUploadError('Yükleme başarısız. Tekrar deneyin.');
            }
        } catch {
            
            setUploadError('Bağlantı hatası. İnternet bağlantınızı kontrol edin.');
        } finally {
            setIsUploading(false);
        }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        setPasswordStatus({ type: '', message: '' });

        if (newPassword.length < 6) {
            setPasswordStatus({ type: 'error', message: 'Şifreniz en az 6 karakter uzunluğunda olmalıdır.' });
            return;
        }

        if (newPassword !== confirmNewPassword) {
            setPasswordStatus({ type: 'error', message: 'Şifreler birbiriyle eşleşmiyor. Lütfen tekrar kontrol edin.' });
            return;
        }

        try {
            const currentUid = auth.currentUser?.uid;
            
            if (currentUid) {
                await editUser(currentUid, { password: newPassword });
                addLog('SIFRE_DEGISTIR', `${currentSession.username} kendi şifresini güncelledi`);
                setPasswordStatus({ type: 'success', message: 'Şifreniz başarıyla değiştirildi!' });
                setNewPassword('');
                setConfirmNewPassword('');
            } else {
                setPasswordStatus({ type: 'error', message: 'Oturum bilgilerinize ulaşılamadı. Lütfen tekrar giriş yapın.' });
            }
        } catch {
            setPasswordStatus({ type: 'error', message: 'Şifre güncellenirken bir hata oluştu.' });
        }
    };

    const handleLinkGoogle = async () => {
        setGoogleLinkStatus({ type: '', message: '' });
        setGoogleLinkLoading(true);
        try {
            const result = await linkWithPopup(auth.currentUser, googleProvider);
            const googleInfo = result.user.providerData.find(p => p.providerId === 'google.com');
            setLinkedGoogle(googleInfo || null);
            setGoogleLinkStatus({ type: 'success', message: `Google hesabınız (${googleInfo?.email}) başarıyla bağlandı! Artık Google ile de giriş yapabilirsiniz.` });
            addLog('GOOGLE_BAGLAMA', `${currentSession.username} Google hesabını bağladı: ${googleInfo?.email}`);
        } catch (error) {
            console.error('Google bağlama hatası:', error);
            if (error.code === 'auth/popup-closed-by-user') {
                setGoogleLinkStatus({ type: '', message: '' });
            } else if (error.code === 'auth/credential-already-in-use') {
                setGoogleLinkStatus({ type: 'error', message: 'Bu Google hesabı zaten başka bir kullanıcıya bağlı.' });
            } else {
                setGoogleLinkStatus({ type: 'error', message: 'Google hesabı bağlanırken bir hata oluştu.' });
            }
        } finally {
            setGoogleLinkLoading(false);
        }
    };

    const handleUnlinkGoogle = async () => {
        if (!window.confirm('Google hesabınızın bağlantısını kaldırmak istediğinize emin misiniz?')) return;
        setGoogleLinkLoading(true);
        try {
            await unlink(auth.currentUser, 'google.com');
            setLinkedGoogle(null);
            setGoogleLinkStatus({ type: 'success', message: 'Google hesabı bağlantısı kaldırıldı.' });
            addLog('GOOGLE_KALDIR', `${currentSession.username} Google hesap bağlantısını kaldırdı`);
        } catch (error) {
            console.error('Google bağlantı kaldırma hatası:', error);
            setGoogleLinkStatus({ type: 'error', message: 'Google bağlantısı kaldırılırken hata oluştu.' });
        } finally {
            setGoogleLinkLoading(false);
        }
    };

    return (
        <div 
            className="space-y-4 sm:space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto pb-ios-nav"
            style={{
                paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))'
            }}
        >
            <div className="glass-panel p-4 sm:p-6 border-l-4 border-l-zinc-500">
                <div className="flex items-center gap-3">
                    {isMobile && onOpenMenu && (
                        <button 
                            onClick={onOpenMenu} 
                            className="p-1.5 -ml-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors md:hidden cursor-pointer shrink-0"
                            title="Menüyü Aç"
                        >
                            <Menu size={20} />
                        </button>
                    )}
                    <div>
                        <h3 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] mb-1 flex items-center">
                            <SettingsIcon className="mr-2 text-zinc-400 shrink-0" size={22} />
                            Sistem Ayarları
                        </h3>
                        <p className="text-[var(--text-secondary)] text-xs sm:text-sm">
                            Bu ekrandan profil resmini değiştirebilir ve uygulamanın veritabanı bağlantısını yönetebilirsiniz.
                        </p>
                    </div>
                </div>
            </div>

            {/* Profil Resmi Ayarı */}
            <div className="glass-panel border-[var(--border-color)] overflow-hidden">
                <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between">
                    <h4 className="font-bold text-lg text-[var(--text-primary)] flex items-center">
                        <Camera className="mr-2 text-zinc-400" size={20} />
                        Araç Profil Resmi
                    </h4>
                </div>
                <div className="p-6 flex flex-col sm:flex-row items-center gap-6">
                    <div className="relative w-32 h-32 rounded-2xl overflow-hidden bg-[var(--bg-panel-hover)] border-4 border-[var(--border-color)] flex-shrink-0 shadow-xl group">
                        {profilePic ? (
                            <img
                                src={profilePic}
                                alt="Truck Profile"
                                className="w-full h-full object-cover bg-white"
                                onError={() => setProfilePic(null)}
                            />
                        ) : (
                            <div className="w-full h-full bg-zinc-500 flex items-center justify-center">
                                <Truck size={48} className="text-[var(--text-primary)] opacity-90" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer"
                            onClick={() => !isUploading && fileInputRef.current.click()}>
                            {isUploading ? <Loader2 className="text-[var(--text-primary)] mb-1 animate-spin" size={24} /> : <UploadCloud className="text-[var(--text-primary)] mb-1" size={24} />}
                            <span className="text-xs text-[var(--text-primary)] font-medium">{isUploading ? 'Yükleniyor...' : 'Değiştir'}</span>
                        </div>
                    </div>
                    <div className="flex-1 space-y-3 text-center sm:text-left">
                        <p className="text-[var(--text-secondary)] text-sm">
                            Menüde aracınızın adının yanında görünecek fotoğrafı buradan yükleyebilirsiniz.
                        </p>
                        {profilePic && profilePic.startsWith('http') && (
                            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                                <Globe size={13} />
                                Tüm cihazlarda görünür (bulut senkronu aktif)
                            </div>
                        )}
                        {uploadError && (
                            <p className="text-red-400 text-xs">{uploadError}</p>
                        )}
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleImageUpload}
                        />
                        <button
                            onClick={() => fileInputRef.current.click()}
                            disabled={isUploading}
                            className={`bg-white/10 hover:bg-white/20 text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm transition-colors border border-[var(--border-color)] inline-flex items-center ${isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                            {isUploading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Camera size={16} className="mr-2" />}
                            {isUploading ? 'Yükleniyor...' : 'Fotoğraf Seç'}
                        </button>
                        {profilePic && (
                            <button
                                onClick={async () => {
                                    setProfilePic(null);
                                    await updateTruckImage(activeTruckId, null);
                                }}
                                className="ml-3 text-red-400 hover:text-red-300 px-4 py-2 text-sm transition-colors"
                            >
                                Resmi Kaldır
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Şifre Değiştirme */}
            <div className="glass-panel border-amber-500/20 overflow-hidden">
                <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between">
                    <h4 className="font-bold text-lg text-[var(--text-primary)] flex items-center">
                        <Key className="mr-2 text-amber-500" size={20} />
                        Kullanıcı Güvenliği (Şifre Değiştir)
                    </h4>
                </div>
                <div className="p-6">
                    <p className="text-[var(--text-secondary)] text-sm mb-4 border-b border-[var(--border-color)] pb-4">
                        Sisteme giriş yaptığınız hesabınızın ({currentSession?.username}) şifresini buradan güvenle değiştirebilirsiniz.
                    </p>
                    
                    <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Yeni Şifre</label>
                            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} 
                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 text-sm focus:border-amber-500 outline-none" placeholder="Yeni şifrenizi girin" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Yeni Şifre (Tekrar)</label>
                            <input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} 
                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 text-sm focus:border-amber-500 outline-none" placeholder="Şifrenizi doğrulayın" />
                        </div>

                        {passwordStatus.message && (
                            <div className={`flex items-center gap-2 text-sm p-3 rounded-md border ${
                                passwordStatus.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            }`}>
                                {passwordStatus.type === 'error' ? <AlertCircle size={16}/> : <ShieldCheck size={16}/>}
                                {passwordStatus.message}
                            </div>
                        )}

                        <button type="submit" className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 border border-amber-500/30 py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2">
                            <Save size={16} /> Şifreyi Kaydet
                        </button>
                    </form>
                </div>
            </div>

            {/* Google Hesap Bağlama */}
            <div className="glass-panel border-blue-500/20 overflow-hidden">
                <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between">
                    <h4 className="font-bold text-lg text-[var(--text-primary)] flex items-center">
                        <Link2 className="mr-2 text-blue-400" size={20} />
                        Google Hesap Bağlama
                    </h4>
                    {linkedGoogle && (
                        <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-1 rounded-md font-medium flex items-center">
                            <CheckCircle2 size={14} className="mr-1" /> Bağlı
                        </span>
                    )}
                </div>
                <div className="p-6">
                    {linkedGoogle ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 bg-white/5 border border-blue-500/20 rounded-xl p-4">
                                {linkedGoogle.photoURL && (
                                    <img src={linkedGoogle.photoURL} alt="" className="w-10 h-10 rounded-full border-2 border-blue-400/30" />
                                )}
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-[var(--text-primary)]">{linkedGoogle.displayName || 'Google Kullanıcısı'}</p>
                                    <p className="text-xs text-[var(--text-secondary)]">{linkedGoogle.email}</p>
                                </div>
                                <button
                                    onClick={handleUnlinkGoogle}
                                    disabled={googleLinkLoading}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 border border-red-500/20"
                                >
                                    <Unlink size={14} /> Bağlantıyı Kaldır
                                </button>
                            </div>
                            <p className="text-[var(--text-secondary)] text-xs">
                                Google hesabınız bağlı. Giriş ekranından hem kullanıcı adı/şifre hem de Google ile giriş yapabilirsiniz.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-[var(--text-secondary)] text-sm">
                                Google hesabınızı bağlayarak, giriş ekranından <strong className="text-[var(--text-primary)]">"Google ile Giriş Yap"</strong> butonuyla da sisteme erişebilirsiniz. 
                                Mevcut kullanıcı adınız ve şifreniz de çalışmaya devam eder.
                            </p>
                            <button
                                onClick={handleLinkGoogle}
                                disabled={googleLinkLoading}
                                className="bg-white/10 hover:bg-white/15 disabled:bg-white/5 disabled:cursor-not-allowed text-[var(--text-primary)] text-sm font-medium py-2.5 px-5 rounded-lg transition-all border border-[var(--border-color)] flex items-center gap-2"
                            >
                                {googleLinkLoading ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                    </svg>
                                )}
                                Google Hesabımı Bağla
                            </button>
                        </div>
                    )}

                    {googleLinkStatus.message && (
                        <div className={`flex items-center gap-2 text-sm p-3 rounded-md border mt-4 ${
                            googleLinkStatus.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        }`}>
                            {googleLinkStatus.type === 'error' ? <AlertCircle size={16}/> : <CheckCircle2 size={16}/>}
                            {googleLinkStatus.message}
                        </div>
                    )}
                </div>
            </div>

            {/* API Ayarı */}
            <div className="glass-panel border-[var(--border-color)] overflow-hidden">
                <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between">
                    <h4 className="font-bold text-lg text-[var(--text-primary)] flex items-center">
                        <Database className="mr-2 text-zinc-400" size={20} />
                        Sunucu Entegrasyon Durumu
                    </h4>
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-1 rounded-md font-medium flex items-center">
                        <ShieldCheck size={14} className="mr-1" /> Firebase Aktif
                    </span>
                </div>

                <div className="p-6 space-y-6">
                    <div className="bg-white/5 border border-emerald-500/20 rounded-xl p-5">
                        <div className="flex items-start mb-4">
                            <Server className="text-emerald-400 mt-1 mr-3 flex-shrink-0" size={20} />
                            <div>
                                <label className="block font-medium text-[var(--text-primary)] mb-1">
                                    Bağlantı Sağlıklı
                                </label>
                                <p className="text-sm text-[var(--text-secondary)] mb-3">
                                    Uygulama artık Google Sheets yerine daha hızlı, modern ve anlık çalışan Firebase Cloud Firestore kullanmaktadır. Herhangi bir URL girmeden platform artık bulut özelliklerini doğrudan kullanabilir.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Lastik Kalibrasyon Ayarı */}
            <div className="glass-panel border-[var(--border-color)] overflow-hidden">
                <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between">
                    <h4 className="font-bold text-lg text-[var(--text-primary)] flex items-center">
                        <SettingsIcon className="mr-2 text-zinc-400" size={20} />
                        3D Lastik Kalibrasyon Ayarı
                    </h4>
                </div>
                <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="block font-medium text-[var(--text-primary)] text-sm mb-1">
                                3D Lastik İnce Ayar (Kalibrasyon) Panelini Göster
                            </label>
                            <p className="text-xs text-[var(--text-secondary)]">
                                Aktif edildiğinde, lastik yönetimi ekranında 3D tekerlek koordinat kaydırma panelini açan buton görünür olacaktır.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => handleCalibrationToggle(!calibrationMode)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none cursor-pointer ${
                                calibrationMode ? 'bg-amber-500' : 'bg-zinc-800'
                            }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    calibrationMode ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>
                </div>
            </div>

            <WipeData />
        </div>
    );
};

export default Settings;

import React, { useState, useEffect, useRef, useContext } from 'react';
import { Settings as SettingsIcon, Database, Save, Server, ShieldCheck, Camera, UploadCloud, Truck, Loader2, Globe, Key, AlertCircle } from 'lucide-react';
import WipeData from './WipeData';
import { DataContext } from '../context/DataContext';
import { useTruck } from '../context/TruckContext';

const Settings = () => {
    const { updateTruckImage, currentSession, approvedUsers, editUser, addLog } = useContext(DataContext);
    const { activeTruckId, activeTruckData } = useTruck();
    const [profilePic, setProfilePic] = useState(activeTruckData?.imageUrl || null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const fileInputRef = useRef(null);
    const IMGBB_KEY = 'b9783b951fef452d9dee0c3c0fc206cc';

    // Password Change State
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [passwordStatus, setPasswordStatus] = useState({ type: '', message: '' });

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

        if (newPassword.length < 4) {
            setPasswordStatus({ type: 'error', message: 'Şifreniz en az 4 karakter uzunluğunda olmalıdır.' });
            return;
        }

        if (newPassword !== confirmNewPassword) {
            setPasswordStatus({ type: 'error', message: 'Şifreler birbiriyle eşleşmiyor. Lütfen tekrar kontrol edin.' });
            return;
        }

        try {
            // "approved_users" içinden currentSession username ile ID bul
            const currentUserDoc = approvedUsers.find(u => u.username === currentSession?.username);
            
            if (currentUserDoc && currentUserDoc.id) {
                await editUser(currentUserDoc.id, { password: newPassword });
                addLog('SIFRE_DEGISTIR', `${currentSession.username} kendi şifresini güncelledi`);
                setPasswordStatus({ type: 'success', message: 'Şifreniz başarıyla değiştirildi!' });
                setNewPassword('');
                setConfirmNewPassword('');
            } else if (currentSession?.username === 'kenan') {
                // Eğer kenan db'de yok ama hardcoded login ise:
                setPasswordStatus({ type: 'error', message: 'Süper admin için veritabanında "kenan" hesabını göremedik. Önce CompanyAdmin kaydı açmalısınız.' });
            } else {
                setPasswordStatus({ type: 'error', message: 'Hesap bilgilerinize ulaşılamadı.' });
            }
        } catch {
            setPasswordStatus({ type: 'error', message: 'Şifre güncellenirken bir hata oluştu.' });
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
            <div className="glass-panel p-6 border-l-4 border-l-brand-500">
                <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2 flex items-center">
                    <SettingsIcon className="mr-2" size={24} />
                    Sistem Ayarları
                </h3>
                <p className="text-[var(--text-secondary)] text-sm">
                    Bu ekrandan profil resmini değiştirebilir ve uygulamanın veritabanı bağlantısını yönetebilirsiniz.
                </p>
            </div>

            {/* Profil Resmi Ayarı */}
            <div className="glass-panel border-[var(--border-color)] overflow-hidden">
                <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between">
                    <h4 className="font-bold text-lg text-[var(--text-primary)] flex items-center">
                        <Camera className="mr-2 text-brand-400" size={20} />
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
                            <div className="w-full h-full bg-brand-500 flex items-center justify-center">
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

            {/* API Ayarı */}
            <div className="glass-panel border-[var(--border-color)] overflow-hidden">
                <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between">
                    <h4 className="font-bold text-lg text-[var(--text-primary)] flex items-center">
                        <Database className="mr-2 text-brand-400" size={20} />
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

            <WipeData />
        </div>
    );
};

export default Settings;

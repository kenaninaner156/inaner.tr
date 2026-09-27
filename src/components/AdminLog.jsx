import React, { useContext, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DataContext } from '../context/DataContext';
import { sendDiscordAlert } from '../services/discordWebhook';
import { 
    Shield, Trash2, CheckCircle2, AlertTriangle, Users, X, RotateCcw, 
    Search, Calendar, MapPin, MonitorSmartphone, Download, ChevronDown, 
    ChevronUp, Copy, Check, Activity, Wallet, Globe, Layers
} from 'lucide-react';

const ACTION_LABELS = {
    // Finans & Yakıt
    MAZOT_ISKONTO_GUNCELLEME: { label: 'Mazot İskontosu Güncellendi', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
    MAZOT_EKLE: { label: 'Mazot Fişi Eklendi', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
    MAZOT_DUZENLE: { label: 'Mazot Fişi Güncellendi', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
    MAZOT_SİL: { label: 'Mazot Fişi Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    ODEME_EKLE: { label: 'Ödeme Eklendi', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    ODEME_GUNCELLE: { label: 'Ödeme Güncellendi', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    ODEME_SIL: { label: 'Ödeme Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    FATURA_OLUSTUR: { label: 'Fatura Oluşturuldu', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    FATURA_GUNCELLE: { label: 'Fatura Güncellendi', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    FATURA_SIL: { label: 'Fatura Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    CEZA_EKLE: { label: 'Trafik Cezası Eklendi', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    CEZA_SİL: { label: 'Ceza Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    CEZA_DURUM: { label: 'Ceza Durumu Değişti', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },

    // Sefer & Operasyon
    SEFER_EKLE: { label: 'Sefer Eklendi', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    SEFER_DUZENLE: { label: 'Sefer Güncellendi', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20' },
    SEFER_SİL: { label: 'Sefer Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    ROTA_EKLE: { label: 'Rota Tanımlandı', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    ROTA_GUNCELLE: { label: 'Rota Güncellendi', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    ROTA_SIL: { label: 'Rota Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    ROTA_KAYDET: { label: 'Canlı Takip Rotası Kaydedildi', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    KAYITLI_ROTA_GUNCELLE: { label: 'Kayıtlı Rota Güncellendi', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    KAYITLI_ROTA_SIL: { label: 'Kayıtlı Rota Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },

    // Bakım & Atölye
    BAKIM_EKLE: { label: 'Bakım Kaydı Eklendi', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    BAKIM_GUNCELLE: { label: 'Bakım Güncellendi', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    BAKIM_SİL: { label: 'Bakım Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    TAMIRCI_EKLE: { label: 'Tamirci Eklendi', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
    TAMIRCI_GUNCELLE: { label: 'Tamirci Güncellendi', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
    TAMIRCI_SIL: { label: 'Tamirci Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    STOK_EKLE: { label: 'Yedek Parça Eklendi', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    STOK_GUNCELLE: { label: 'Stok Güncellendi', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    STOK_SIL: { label: 'Stok Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    KLASOR_EKLE: { label: 'Evrak Klasörü Oluşturuldu', color: 'text-slate-300', bg: 'bg-slate-500/10 border-slate-500/20' },
    KLASOR_SİL: { label: 'Evrak Klasörü Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },

    // Sistem & Güvenlik
    KULLANICI_GIRIS: { label: 'Oturum Açıldı', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
    KULLANICI_CIKIS: { label: 'Çıkış Yapıldı', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' },
    HATALI_GIRIS: { label: 'Hatalı Giriş', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    ZIYARETCI_GIRIS: { label: 'Ziyaretçi Girişi', color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10 border-fuchsia-500/20' },
    KULLANICI_ONAYLA: { label: 'Kullanıcı Onaylandı', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    KULLANICI_RED: { label: 'Kullanıcı Reddedildi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    KULLANICI_EKLE: { label: 'Kullanıcı Eklendi', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    KULLANICI_DUZENLE: { label: 'Kullanıcı Düzenlendi', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    KULLANICI_SIL: { label: 'Kullanıcı Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    ARAC_GUNCELLE: { label: 'Araç Bilgisi Güncellendi', color: 'text-slate-300', bg: 'bg-slate-500/10 border-slate-500/20' },
    NOT_GUNCELLE: { label: 'Operasyon Notu Güncellendi', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
    BELGE_GUNCELLE: { label: 'Belgeler Güncellendi', color: 'text-slate-300', bg: 'bg-slate-500/10 border-slate-500/20' },
    BELGE_SIL: { label: 'Belge Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' }
};

const CATEGORIES = [
    { key: 'TUMU', label: 'Tümü' },
    { key: 'FINANS', label: 'Finans & Yakıt' },
    { key: 'OPERASYON', label: 'Sefer & Lojistik' },
    { key: 'BAKIM', label: 'Bakım & Atölye' },
    { key: 'GUVENLIK', label: 'Güvenlik & Giriş' },
    { key: 'SILINMIS', label: 'Geri Alınabilirler' }
];

const AdminLog = () => {
    const { adminLog, onlineUsers, restoreData, clearLog } = useContext(DataContext);

    const [filter, setFilter] = useState('TUMU');
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [userFilter, setUserFilter] = useState('ALL');

    // Açılır satır (Accordion) durumu
    const [expandedId, setExpandedId] = useState(null);
    const [copiedMetaId, setCopiedMetaId] = useState(null);

    // Temizleme Modalı
    const [isClearModalOpen, setIsClearModalOpen] = useState(false);
    const [clearPassword, setClearPassword] = useState('');
    const [clearError, setClearError] = useState(false);

    // Online Kullanıcı Modalı
    const [selectedOnlineUser, setSelectedOnlineUser] = useState(null);

    // Benzersiz kullanıcı listesini çıkar
    const uniqueUsers = useMemo(() => {
        const set = new Set();
        adminLog.forEach(l => { if (l.user) set.add(l.user); });
        return Array.from(set).sort();
    }, [adminLog]);

    // Filtreleme mantığı
    const filteredLog = useMemo(() => {
        return adminLog.filter(entry => {
            const action = entry.action || '';

            // Kategori filtreleri
            if (filter === 'FINANS') {
                const isFinans = action.includes('MAZOT') || action.includes('ODEME') || action.includes('FATURA') || action.includes('CEZA') || action.includes('ISKONTO');
                if (!isFinans) return false;
            } else if (filter === 'OPERASYON') {
                const isOperasyon = action.includes('SEFER') || action.includes('ROTA');
                if (!isOperasyon) return false;
            } else if (filter === 'BAKIM') {
                const isBakim = action.includes('BAKIM') || action.includes('TAMIRCI') || action.includes('STOK') || action.includes('KLASOR');
                if (!isBakim) return false;
            } else if (filter === 'GUVENLIK') {
                const isGuvenlik = action.includes('GIRIS') || action.includes('CIKIS') || action.includes('KULLANICI') || action.includes('HATALI') || action.includes('ZIYARETCI');
                if (!isGuvenlik) return false;
            } else if (filter === 'SILINMIS') {
                const isSilinmis = action.includes('SİL') || action.includes('SIL');
                if (!isSilinmis) return false;
            }

            // Kullanıcı filtresi
            if (userFilter !== 'ALL' && entry.user !== userFilter) {
                return false;
            }

            // Metin arama
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const metaString = entry.meta ? JSON.stringify(entry.meta).toLowerCase() : '';
                const fullText = `${entry.user || ''} ${entry.detail || ''} ${entry.action || ''} ${metaString}`.toLowerCase();
                if (!fullText.includes(term)) return false;
            }

            // Tarih filtresi
            if (dateFilter) {
                try {
                    const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
                    if (entryDate !== dateFilter) return false;
                } catch {
                    return false;
                }
            }

            return true;
        });
    }, [adminLog, filter, userFilter, searchTerm, dateFilter]);

    // Üst Özet Kartları (KPI İstatistikleri)
    const stats = useMemo(() => {
        let finansCount = 0;
        let guvenlikCount = 0;
        let silinmisCount = 0;

        filteredLog.forEach(entry => {
            const action = entry.action || '';
            if (action.includes('MAZOT') || action.includes('ODEME') || action.includes('FATURA') || action.includes('CEZA') || action.includes('ISKONTO')) {
                finansCount++;
            }
            if (action.includes('GIRIS') || action.includes('CIKIS') || action.includes('KULLANICI') || action.includes('HATALI')) {
                guvenlikCount++;
            }
            if ((action.includes('SİL') || action.includes('SIL')) && entry.meta?.table && entry.meta?.id) {
                silinmisCount++;
            }
        });

        return {
            total: filteredLog.length,
            finans: finansCount,
            guvenlik: guvenlikCount,
            silinmis: silinmisCount
        };
    }, [filteredLog]);

    // JSON veya Meta Bilgisini Kopyalama
    const handleCopyMeta = (id, metaData) => {
        try {
            navigator.clipboard.writeText(JSON.stringify(metaData, null, 2));
            setCopiedMetaId(id);
            setTimeout(() => setCopiedMetaId(null), 2000);
        } catch {
            /* empty */
        }
    };

    // CSV Olarak Dışa Aktarma (UTF-8 BOM ile Excel uyumlu)
    const handleExportCSV = () => {
        if (filteredLog.length === 0) return;

        const headers = ['Zaman', 'Eylem Kodu', 'Eylem Tanimi', 'Kullanici', 'Detay', 'Tablo', 'Kayit ID', 'Meta Detayi'];
        const csvRows = [headers.join(';')];

        filteredLog.forEach(row => {
            const dateStr = new Date(row.timestamp).toLocaleString('tr-TR');
            const metaDef = ACTION_LABELS[row.action] || { label: row.action };
            const metaObj = row.meta ? JSON.stringify(row.meta).replace(/"/g, '""') : '';
            const values = [
                `"${dateStr}"`,
                `"${row.action || ''}"`,
                `"${metaDef.label || ''}"`,
                `"${row.user || ''}"`,
                `"${(row.detail || '').replace(/"/g, '""')}"`,
                `"${row.meta?.table || ''}"`,
                `"${row.meta?.id || ''}"`,
                `"${metaObj}"`
            ];
            csvRows.push(values.join(';'));
        });

        const csvContent = '\uFEFF' + csvRows.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `denetim_loglari_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSecureClear = async (e) => {
        e.preventDefault();
        if (clearPassword === 'Newrules1.') {
            await clearLog();
            sendDiscordAlert({
                type: 'danger',
                title: 'Denetim Logları Temizlendi',
                description: 'Yönetici tarafından log geçmişi silindi.'
            });
            setIsClearModalOpen(false);
            setClearPassword('');
            setClearError(false);
        } else {
            setClearError(true);
            setTimeout(() => setClearError(false), 2000);
        }
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Canlı Aktif Kullanıcılar Şeridi */}
            {onlineUsers.length > 0 && (
                <div className="bg-[#07090e] border border-white/[0.06] p-3 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Canlı Aktif Kullanıcılar ({onlineUsers.length})
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">Detay için kullanıcıya tıklayın</span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
                        {onlineUsers.map(u => {
                            const isPC = u.device?.toLowerCase().includes('windows') || u.device?.toLowerCase().includes('macintosh');
                            return (
                                <div 
                                    key={u.id} 
                                    onClick={() => setSelectedOnlineUser(u)} 
                                    className="flex-shrink-0 flex items-center gap-2 bg-[#0c1017] hover:bg-slate-800/80 border border-emerald-500/20 hover:border-emerald-500/40 rounded-xl px-3 py-1.5 cursor-pointer transition-all shadow-sm"
                                >
                                    <div className="relative">
                                        <div className="w-7 h-7 rounded-lg bg-slate-800/90 flex items-center justify-center border border-white/10 text-slate-300">
                                            <Users size={13} />
                                        </div>
                                        <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-[#0c1017]" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1">
                                            <p className="text-xs font-bold text-white capitalize">{u.username}</p>
                                            <span className="text-[9px] text-slate-400 font-medium">({isPC ? 'PC' : 'Mobil'})</span>
                                        </div>
                                        <p className="text-[9px] text-emerald-400 font-mono">{u.ip || '0.0.0.0'}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ÜST ÖZET KARTLARI (KPI METRİKLERİ) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                <div className="bg-[#0c1017] border border-white/[0.06] rounded-xl p-3 sm:p-3.5 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Toplam İşlem</p>
                        <p className="text-lg sm:text-xl font-black text-white font-mono mt-0.5">{stats.total}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-slate-800/80 border border-white/[0.08] flex items-center justify-center text-slate-300">
                        <Activity size={16} />
                    </div>
                </div>

                <div className="bg-[#0c1017] border border-white/[0.06] rounded-xl p-3 sm:p-3.5 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Finans & Yakıt</p>
                        <p className="text-lg sm:text-xl font-black text-cyan-400 font-mono mt-0.5">{stats.finans}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                        <Wallet size={16} />
                    </div>
                </div>

                <div className="bg-[#0c1017] border border-white/[0.06] rounded-xl p-3 sm:p-3.5 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Güvenlik & Giriş</p>
                        <p className="text-lg sm:text-xl font-black text-sky-400 font-mono mt-0.5">{stats.guvenlik}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                        <Shield size={16} />
                    </div>
                </div>

                <div className="bg-[#0c1017] border border-white/[0.06] rounded-xl p-3 sm:p-3.5 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Kurtarılabilir Silmeler</p>
                        <p className="text-lg sm:text-xl font-black text-amber-400 font-mono mt-0.5">{stats.silinmis}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                        <RotateCcw size={16} />
                    </div>
                </div>
            </div>

            {/* FİLTRE VE ARAMA ARAÇ ÇUBUĞU */}
            <div className="bg-[#0c1017] border border-white/[0.06] p-3 rounded-2xl space-y-3">
                {/* Kategori Sekmeleri */}
                <div className="flex flex-wrap gap-1 bg-[#07090e] border border-white/[0.06] p-1 rounded-xl">
                    {CATEGORIES.map(cat => (
                        <button 
                            key={cat.key} 
                            onClick={() => setFilter(cat.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                filter === cat.key 
                                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700' 
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>

                {/* Filtre Kontrolleri */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                        {/* Arama Input */}
                        <div className="relative flex-1 sm:max-w-xs min-w-[160px]">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input 
                                type="text" 
                                placeholder="Log veya meta veri ara..." 
                                value={searchTerm} 
                                onChange={(e) => setSearchTerm(e.target.value)} 
                                className="w-full h-8 bg-[#07090e] border border-white/[0.08] text-white text-xs rounded-xl pl-8 pr-2 outline-none focus:border-slate-500 transition-colors" 
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer">
                                    <X size={12}/>
                                </button>
                            )}
                        </div>

                        {/* Tarih Filtresi */}
                        <div className="relative">
                            <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            <input 
                                type="date" 
                                value={dateFilter} 
                                onChange={(e) => setDateFilter(e.target.value)} 
                                className="h-8 bg-[#07090e] border border-white/[0.08] text-slate-300 text-xs rounded-xl pl-8 pr-2 outline-none focus:border-slate-500 transition-colors cursor-pointer" 
                                style={{ colorScheme: 'dark' }}
                            />
                            {dateFilter && (
                                <button onClick={() => setDateFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-400 cursor-pointer">
                                    <X size={12}/>
                                </button>
                            )}
                        </div>

                        {/* Kullanıcı Dropdown */}
                        <div className="relative">
                            <select
                                value={userFilter}
                                onChange={(e) => setUserFilter(e.target.value)}
                                className="h-8 bg-[#07090e] border border-white/[0.08] text-slate-300 text-xs rounded-xl px-2.5 outline-none focus:border-slate-500 transition-colors cursor-pointer"
                            >
                                <option value="ALL">Tüm Kullanıcılar</option>
                                {uniqueUsers.map(u => (
                                    <option key={u} value={u}>@{u}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Dışa Aktarma ve Temizleme Butonları */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportCSV}
                            title="Filtrelenen kayıtları CSV olarak indir"
                            className="h-8 px-3 rounded-xl bg-slate-800/90 text-slate-200 hover:bg-slate-700 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                        >
                            <Download size={13} />
                            <span className="hidden sm:inline">Dışa Aktar (CSV)</span>
                            <span className="sm:hidden">CSV</span>
                        </button>

                        <button
                            onClick={() => setIsClearModalOpen(true)}
                            className="h-8 px-3 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                        >
                            <Trash2 size={13} />
                            <span className="hidden sm:inline">Tümünü Sil</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* LOG KAYITLARI LİSTESİ */}
            <div className="bg-[#07090e] border border-white/[0.06] rounded-2xl overflow-hidden shadow-xl">
                {filteredLog.length === 0 ? (
                    <div className="p-12 text-center">
                        <CheckCircle2 size={32} className="mx-auto mb-2 text-slate-600" />
                        <p className="text-slate-400 text-xs font-medium">Seçili filtrelere uygun denetim kaydı bulunamadı</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/[0.04]">
                        {filteredLog.map(entry => {
                            const meta = ACTION_LABELS[entry.action] || { label: entry.action, color: 'text-slate-300', bg: 'bg-white/5 border-white/10' };
                            const date = new Date(entry.timestamp);
                            const hasMeta = !!entry.meta && Object.keys(entry.meta).length > 0;
                            const isExpanded = expandedId === entry.id;

                            let rowBgClass = 'hover:bg-white/[0.02]';
                            if (entry.action === 'HATALI_GIRIS') {
                                rowBgClass = 'bg-rose-500/[0.06] hover:bg-rose-500/[0.09]';
                            } else if (entry.action === 'ZIYARETCI_GIRIS') {
                                rowBgClass = entry.meta?.isKnownDevice ? 'bg-sky-500/[0.03]' : 'bg-fuchsia-500/[0.04]';
                            }

                            return (
                                <div key={entry.id} className="transition-colors">
                                    {/* Ana Satır */}
                                    <div 
                                        onClick={() => hasMeta && setExpandedId(isExpanded ? null : entry.id)}
                                        className={`flex items-start justify-between gap-3 p-3 sm:p-3.5 ${rowBgClass} ${hasMeta ? 'cursor-pointer' : ''}`}
                                    >
                                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border whitespace-nowrap mt-0.5 flex-shrink-0 ${meta.bg} ${meta.color}`}>
                                                {meta.label}
                                            </span>

                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs sm:text-sm font-medium text-white break-words leading-snug">
                                                    {entry.detail}
                                                </p>

                                                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                    <span className="text-[11px] font-bold text-slate-400">@{entry.user}</span>

                                                    {/* Hızlı Cihaz/Konum Etiketleri */}
                                                    {entry.meta?.ip && (
                                                        <span className="bg-[#0c1017] border border-white/[0.08] px-1.5 py-0.5 rounded text-[10px] text-sky-400 font-mono flex items-center gap-1">
                                                            <Globe size={10} /> {entry.meta.ip}
                                                        </span>
                                                    )}

                                                    {entry.meta?.location && (
                                                        <span className="bg-[#0c1017] border border-white/[0.08] px-1.5 py-0.5 rounded text-[10px] text-amber-400 flex items-center gap-1">
                                                            <MapPin size={10} /> {entry.meta.location}
                                                        </span>
                                                    )}

                                                    {(entry.action === 'HATALI_GIRIS' || entry.action === 'ZIYARETCI_GIRIS') && (
                                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 ${
                                                            entry.meta?.isKnownDevice 
                                                                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' 
                                                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                                        }`}>
                                                            {entry.meta?.isKnownDevice ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                                                            {entry.meta?.isKnownDevice ? 'Tanınan Cihaz' : 'Bilinmeyen Cihaz'}
                                                        </span>
                                                    )}

                                                    {/* Meta Detay Göstergesi */}
                                                    {hasMeta && (
                                                        <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-0.5 hover:text-slate-300">
                                                            <span>Detay</span>
                                                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Sağ Taraf: Zaman ve Geri Yükle */}
                                        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1.5">
                                            <span className="text-[10px] font-mono text-slate-400">
                                                {date.toLocaleDateString('tr-TR')} {date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>

                                            {(entry.action.includes('SİL') || entry.action.includes('SIL')) && entry.meta?.table && entry.meta?.id && (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        restoreData(entry.meta.table, entry.meta.id);
                                                    }}
                                                    className="flex items-center gap-1 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2 py-0.5 rounded-lg transition-colors cursor-pointer shadow-sm"
                                                >
                                                    <RotateCcw size={10} /> Geri Yükle
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* AÇILIR OBSIDIAN DETAY ÇEKMECESİ (ACCORDION) */}
                                    {isExpanded && hasMeta && (
                                        <div className="border-t border-white/[0.04] bg-[#05070a]/95 p-3.5 sm:p-4 space-y-3">
                                            <div className="flex items-center justify-between text-xs text-slate-400">
                                                <span className="font-bold flex items-center gap-1.5 text-white">
                                                    <Layers size={13} className="text-cyan-400" />
                                                    İşlem Meta Verileri ve Denetim Ayrıntısı
                                                </span>
                                                <button
                                                    onClick={() => handleCopyMeta(entry.id, entry.meta)}
                                                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-white bg-slate-800/60 border border-white/[0.06] px-2 py-0.5 rounded-md transition cursor-pointer"
                                                >
                                                    {copiedMetaId === entry.id ? (
                                                        <>
                                                            <Check size={11} className="text-emerald-400" />
                                                            <span className="text-emerald-400">Kopyalandı</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy size={11} />
                                                            <span>JSON Kopyala</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>

                                            {/* Zengin Finansal / Operasyonel Kartlar */}
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
                                                {entry.meta.invoiceNo && (
                                                    <div className="bg-[#0c1017] border border-white/[0.06] p-2 rounded-lg">
                                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Fatura No</span>
                                                        <span className="text-white font-mono font-bold">{entry.meta.invoiceNo}</span>
                                                    </div>
                                                )}

                                                {entry.meta.period && (
                                                    <div className="bg-[#0c1017] border border-white/[0.06] p-2 rounded-lg">
                                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Dönem</span>
                                                        <span className="text-slate-200 font-semibold">{entry.meta.period}</span>
                                                    </div>
                                                )}

                                                {entry.meta.totalOldPrice !== undefined && (
                                                    <div className="bg-[#0c1017] border border-white/[0.06] p-2 rounded-lg">
                                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Eski Tutar</span>
                                                        <span className="text-slate-300 font-mono font-bold">{Number(entry.meta.totalOldPrice).toLocaleString('tr-TR')} ₺</span>
                                                    </div>
                                                )}

                                                {entry.meta.totalNewPrice !== undefined && (
                                                    <div className="bg-[#0c1017] border border-white/[0.06] p-2 rounded-lg">
                                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Yeni Tutar</span>
                                                        <span className="text-emerald-400 font-mono font-bold">{Number(entry.meta.totalNewPrice).toLocaleString('tr-TR')} ₺</span>
                                                    </div>
                                                )}

                                                {entry.meta.totalDiscount !== undefined && (
                                                    <div className="bg-[#0c1017] border border-cyan-500/20 bg-cyan-500/[0.03] p-2 rounded-lg">
                                                        <span className="text-[10px] text-cyan-400 uppercase block font-semibold">Sağlanan İskonto</span>
                                                        <span className="text-cyan-300 font-mono font-bold">-{Number(entry.meta.totalDiscount).toLocaleString('tr-TR')} ₺</span>
                                                    </div>
                                                )}

                                                {entry.meta.recordCount !== undefined && (
                                                    <div className="bg-[#0c1017] border border-white/[0.06] p-2 rounded-lg">
                                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Etkilenen Fiş</span>
                                                        <span className="text-white font-mono font-bold">{entry.meta.recordCount} Adet</span>
                                                    </div>
                                                )}

                                                {entry.meta.table && (
                                                    <div className="bg-[#0c1017] border border-white/[0.06] p-2 rounded-lg">
                                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Koleksiyon</span>
                                                        <span className="text-sky-400 font-mono">{entry.meta.table}</span>
                                                    </div>
                                                )}

                                                {entry.meta.id && (
                                                    <div className="bg-[#0c1017] border border-white/[0.06] p-2 rounded-lg">
                                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Belge Kimliği (ID)</span>
                                                        <span className="text-slate-300 font-mono text-[11px] truncate block" title={entry.meta.id}>
                                                            {entry.meta.id}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Diff Görünümü (Before & After Karşılaştırması) */}
                                            {entry.meta.before && entry.meta.after && (
                                                <div className="bg-[#0c1017] border border-white/[0.06] rounded-xl p-3 space-y-2">
                                                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                                                        Değişim Farkı (Önceki ➔ Sonraki)
                                                    </span>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                                        <div className="bg-[#07090e] border border-white/[0.06] p-2.5 rounded-lg">
                                                            <span className="text-[10px] text-rose-400 font-bold uppercase block mb-1">Önceki Değerler</span>
                                                            <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                                                                {JSON.stringify(entry.meta.before, null, 2)}
                                                            </pre>
                                                        </div>
                                                        <div className="bg-[#07090e] border border-white/[0.06] p-2.5 rounded-lg">
                                                            <span className="text-[10px] text-emerald-400 font-bold uppercase block mb-1">Güncel Değerler</span>
                                                            <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                                                                {JSON.stringify(entry.meta.after, null, 2)}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* LOG TEMİZLEME GÜVENLİK MODALI */}
            {isClearModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-[#07090e] border border-white/10 rounded-2xl w-full max-w-sm p-5 sm:p-6 relative shadow-2xl animate-in zoom-in-95 duration-200">
                        <button 
                            onClick={() => { setIsClearModalOpen(false); setClearPassword(''); setClearError(false); }} 
                            className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                        <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                            <AlertTriangle className="text-rose-400" size={18} /> Log Geçmişini Temizle
                        </h3>
                        <p className="text-xs text-slate-400 mb-4">Tüm aktivite geçmişi geri alınamaz şekilde silinecektir.</p>

                        <form onSubmit={handleSecureClear} className="space-y-3">
                            <div>
                                <label className="block text-[11px] font-medium text-slate-400 mb-1">Güvenlik Şifresi</label>
                                <input
                                    type="password"
                                    autoFocus
                                    required
                                    value={clearPassword}
                                    onChange={e => setClearPassword(e.target.value)}
                                    className={`w-full h-9 bg-[#0c1017] border border-white/10 text-white rounded-xl px-3 text-xs outline-none focus:border-slate-500 ${clearError ? 'border-rose-500 bg-rose-500/5' : ''}`}
                                    placeholder="••••••••"
                                />
                                {clearError && <p className="text-[10px] text-rose-400 mt-1 font-semibold">Hatalı güvenlik şifresi!</p>}
                            </div>
                            <button 
                                type="submit"
                                className="w-full h-9 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-600/20 cursor-pointer"
                            >
                                Onayla ve Tümünü Sil
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* AKTİF KULLANICI DETAY MODALI */}
            {selectedOnlineUser && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-[#07090e] border border-white/10 rounded-2xl w-full max-w-md p-5 sm:p-6 relative shadow-2xl animate-in zoom-in-95 duration-200">
                        <button 
                            onClick={() => setSelectedOnlineUser(null)} 
                            className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                        
                        <div className="flex items-center gap-3 mb-4">
                            <div className="relative">
                                <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center border border-emerald-500/40 text-emerald-400">
                                    <Users size={20} />
                                </div>
                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#07090e]" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white capitalize">{selectedOnlineUser.username}</h3>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-2 py-0.5 rounded-full font-bold">AKTIF</span>
                                    <span className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">{selectedOnlineUser.role || 'Şoför'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 bg-[#0c1017] p-3.5 rounded-xl border border-white/[0.06] text-xs">
                            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                                <span className="text-slate-400 flex items-center gap-1.5"><MonitorSmartphone size={13}/> Cihaz Tipi</span>
                                <span className="font-semibold text-white">{selectedOnlineUser.device || 'Bilinmiyor'}</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                                <span className="text-slate-400 flex items-center gap-1.5"><MapPin size={13} className="text-amber-400"/> Konum</span>
                                <span className="font-semibold text-amber-400">{selectedOnlineUser.location || 'Bilinmiyor'}</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                                <span className="text-slate-400 flex items-center gap-1.5"><Globe size={13} className="text-sky-400"/> IP Adresi</span>
                                <span className="font-mono font-bold text-sky-400">{selectedOnlineUser.ip || '0.0.0.0'}</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                                <span className="text-slate-400">Son Sinyal (Heartbeat)</span>
                                <span className="font-mono text-slate-300">
                                    {selectedOnlineUser.lastActive ? new Date(selectedOnlineUser.lastActive).toLocaleTimeString('tr-TR') : 'Bilinmiyor'}
                                </span>
                            </div>
                        </div>

                        <button 
                            onClick={() => setSelectedOnlineUser(null)} 
                            className="mt-4 w-full h-9 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition border border-slate-700 cursor-pointer"
                        >
                            Kapat
                        </button>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};

export default AdminLog;

import React, { useContext, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DataContext } from '../context/DataContext';
import { CompanyContext } from '../context/CompanyContext';
import { db } from '../services/firebaseConfig';
import { sendDiscordAlert } from '../services/discordWebhook';
import { Shield, Trash2, Filter, AlertTriangle, CheckCircle, PlusCircle, Wrench, Fuel, CreditCard, Truck, Users, Check, X, Edit2, Save, RotateCcw, Search, Calendar, MapPin, MonitorSmartphone } from 'lucide-react';

const ACTION_LABELS = {
    SEFER_EKLE: { label: 'Sefer Eklendi', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    SEFER_SİL: { label: 'Sefer Silindi', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    MAZOT_EKLE: { label: 'Mazot Eklendi', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    MAZOT_SİL: { label: 'Mazot Silindi', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    BAKIM_EKLE: { label: 'Bakım Eklendi', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    BAKIM_SİL: { label: 'Bakım Silindi', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    ODEME_EKLE: { label: 'Ödeme Eklendi', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    ODEME_SİL: { label: 'Ödeme Silindi', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    TAMİRCİ_EKLE: { label: 'Tamirci Eklendi', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
    TAMİRCİ_SİL: { label: 'Tamirci Silindi', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    ARAC_GUNCELLE: { label: 'Araç Güncellendi', color: 'text-[var(--text-primary)]', bg: 'bg-slate-500/10 border-slate-500/20' },
    NOT_EKLE: { label: 'Not Eklendi', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
    KULLANICI_ONAYLA: { label: 'Kullanıcı Onaylandı', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    KULLANICI_RED: { label: 'Kullanıcı Reddedildi', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    KULLANICI_GIRIS: { label: 'Oturum Açıldı', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
    KULLANICI_EKLE: { label: 'Manüel Ekleme', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    KULLANICI_DUZENLE: { label: 'Düzenleme', color: 'text-[var(--text-secondary)]', bg: 'bg-white/5 border-[var(--border-color)]' },
    KULLANICI_CIKIS: { label: 'Çıkış Yapıldı', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' },
    ZIYARETCI_GIRIS: { label: 'Yeni Ziyaretçi', color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10 border-fuchsia-500/20' },
    HATALI_GIRIS: { label: 'Hatalı Giriş', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
};

const AdminLog = () => {
    const { adminLog, pendingUsers, approvedUsers, onlineUsers, approveUser, rejectUser, editUser, refreshUsers, restoreData, addApprovedUser, clearLog, deleteUser } = useContext(DataContext);
    const { companies, activeCompanyId } = useContext(CompanyContext);
    const [filter, setFilter] = useState('TUMU');
    const [tab, setTab] = useState('log'); // 'log' | 'users'

    // Yeni: Gelişmiş Filtreleme
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('');

    // Yeni: Manüel Kullanıcı Modal
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [newUserForm, setNewUserForm] = useState({ username: '', password: '', role: 'şoför', companyId: '' });

    // Yeni: Kullanıcı Yönetimi State'leri
    const [approvalRoles, setApprovalRoles] = useState({});
    const [approvalCompanies, setApprovalCompanies] = useState({});
    const [editingUserId, setEditingUserId] = useState(null);
    const [editForm, setEditForm] = useState({ username: '', password: '', role: 'şoför', companyId: '' });

    // Yeni: Log Temizleme Şifre Modalı
    const [isClearModalOpen, setIsClearModalOpen] = useState(false);
    const [clearPassword, setClearPassword] = useState('');
    const [clearError, setClearError] = useState(false);

    // Yeni: Kullanıcı Silme Onay Modalı
    const [userToDelete, setUserToDelete] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Yeni: Aktif Kullanıcı Detay Modalı
    const [selectedOnlineUser, setSelectedOnlineUser] = useState(null);


    const handleEditStart = (u) => {
        setEditingUserId(u.id);
        setEditForm({ username: u.username, password: '', role: u.role || 'şoför', companyId: u.companyId || activeCompanyId || '' });
    };

    const handleEditSave = async (userId) => {
        if (editForm.password && editForm.password.length < 6) {
            alert("Şifre en az 6 karakter olmalı!");
            return;
        }
        await editUser(userId, editForm);
        setEditingUserId(null);
        if (refreshUsers) refreshUsers();
    };

    const handleAddManualUser = async (e) => {
        e.preventDefault();
        if (newUserForm.password.length < 6) {
            alert("Şifre en az 6 karakter olmalı!");
            return;
        }
        const finalCompanyId = newUserForm.companyId || activeCompanyId;
        await addApprovedUser({ ...newUserForm, companyId: finalCompanyId });
        setIsAddUserModalOpen(false);
        setNewUserForm({ username: '', password: '', role: 'şoför', companyId: '' });
        if (refreshUsers) refreshUsers();
    };

    const handleApprove = (userId) => {
        const role = approvalRoles[userId] || 'şoför';
        const companyId = approvalCompanies[userId] || activeCompanyId;
        approveUser(userId, role, companyId);
        // A4: Kullanıcı onayı bildirimi
        sendDiscordAlert({
          type: 'success',
          title: '✅ Kullanıcı Onaylandı',
          description: `**${userId}** sisteme kabul edildi.`,
          fields: [
            { name: '🎭 Rol', value: String(role || '—'), inline: true },
          ]
        });
        // Clear temp state
        setApprovalRoles(prev => { const n = { ...prev }; delete n[userId]; return n; });
        setApprovalCompanies(prev => { const n = { ...prev }; delete n[userId]; return n; });
    };

    // Sekme değiştiğinde veya bileşen yüklendiğinde kullanıcı listesini localStorage'dan tazele
    useEffect(() => {
        if (tab === 'users' && refreshUsers) {
            refreshUsers();
        }
    }, [tab, refreshUsers]);

    const categories = [
        { key: 'TUMU', label: 'Tümü' },
        { key: 'EKLE', label: 'Eklemeler' },
        { key: 'SİL', label: 'Silmeler' },
        { key: 'KULLANICI', label: 'Kullanıcılar' },
        { key: 'ZİYARETÇİ', label: 'Ziyaretçiler' },
    ];

    const filteredLog = adminLog.filter(entry => {
        // Kategori filtresi
        if (filter === 'EKLE' && (!entry.action || !entry.action.includes('EKLE'))) return false;
        if (filter === 'SİL' && (!entry.action || !entry.action.includes('SİL'))) return false;
        if (filter === 'KULLANICI' && (!entry.action || !entry.action.includes('KULLANICI'))) return false;
        if (filter === 'ZİYARETÇİ' && (!entry.action || !entry.action.includes('ZIYARETCI'))) return false;

        // Kelime Arama
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const textToSearch = `${entry.user} ${entry.detail} ${entry.action} ${entry.meta?.ip || ''} ${entry.meta?.location || ''}`.toLowerCase();
            if (!textToSearch.includes(term)) return false;
        }

        // Tarih Filtresi
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

    const handleSecureClear = async (e) => {
        e.preventDefault();
        if (clearPassword === 'Newrules1.') {
            await clearLog();
            // A7: Log temizleme bildirimi
            sendDiscordAlert({
              type: 'danger',
              title: '⚠️ Tüm Loglar Temizlendi',
              description: 'Admin logları silindi!',
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
            {/* Online Kullanıcılar Şeridi */}
            {onlineUsers.length > 0 && (
                <div className="bg-[#07090e] border border-white/[0.08] p-3 rounded-2xl space-y-2">
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
                                    className="flex-shrink-0 flex items-center gap-2 bg-[#0d1117] hover:bg-slate-800 border border-emerald-500/20 hover:border-emerald-500/40 rounded-xl px-3 py-1.5 cursor-pointer transition-all shadow-sm"
                                >
                                    <div className="relative">
                                        <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center border border-white/10 overflow-hidden text-slate-300">
                                            <Users size={13} />
                                        </div>
                                        <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-[#0d1117]" />
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

            {/* Aktivite Logu & Filtre Çubuğu */}
            <div className="space-y-3">
                {/* Filtre ve Arama Araç Çubuğu */}
                <div className="bg-[#0d1117] border border-white/[0.08] p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2.5">
                    {/* Kategori Butonları */}
                    <div className="flex flex-wrap gap-1 bg-[#07090e] border border-white/10 p-0.5 rounded-xl">
                        {categories.map(cat => (
                            <button 
                                key={cat.key} 
                                onClick={() => setFilter(cat.key)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    filter === cat.key 
                                        ? 'bg-slate-800 text-white shadow-sm border border-slate-700' 
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Arama, Tarih & Temizle */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input 
                                type="text" 
                                placeholder="Loglarda ara..." 
                                value={searchTerm} 
                                onChange={(e) => setSearchTerm(e.target.value)} 
                                className="w-36 sm:w-44 h-8 bg-[#07090e] border border-white/10 text-white text-xs rounded-xl pl-8 pr-2 outline-none focus:border-slate-500 transition-colors" 
                            />
                        </div>
                        <div className="relative">
                            <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input 
                                type="date" 
                                value={dateFilter} 
                                onChange={(e) => setDateFilter(e.target.value)} 
                                className="h-8 bg-[#07090e] border border-white/10 text-slate-300 text-xs rounded-xl pl-8 pr-2 outline-none focus:border-slate-500 transition-colors" 
                                style={{ colorScheme: 'dark' }}
                            />
                            {dateFilter && (
                                <button onClick={() => setDateFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-400">
                                    <X size={12}/>
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => setIsClearModalOpen(true)}
                            className="h-8 px-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                        >
                            <Trash2 size={13} />
                            <span>Tümünü Sil</span>
                        </button>
                    </div>
                </div>

                {/* Log Listesi */}
                <div className="bg-[#07090e] border border-white/[0.08] rounded-2xl overflow-hidden">
                    {filteredLog.length === 0 ? (
                        <div className="p-12 text-center">
                            <CheckCircle size={32} className="mx-auto mb-2 text-slate-600" />
                            <p className="text-slate-400 text-xs font-medium">Kayıtlı log bulunamadı</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/[0.04]">
                            {filteredLog.map(entry => {
                                const meta = ACTION_LABELS[entry.action] || { label: entry.action, color: 'text-slate-300', bg: 'bg-white/5 border-white/10' };
                                const date = new Date(entry.timestamp);

                                let rowBgClass = 'hover:bg-white/[0.02]';
                                if (entry.action === 'HATALI_GIRIS' || entry.action === 'ZIYARETCI_GIRIS') {
                                    rowBgClass = entry.meta?.isKnownDevice ? 'bg-sky-500/[0.04]' : 'bg-rose-500/[0.06]';
                                }

                                return (
                                    <div key={entry.id} className={`flex items-start justify-between gap-3 p-3 sm:p-3.5 transition-colors ${rowBgClass}`}>
                                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border whitespace-nowrap mt-0.5 flex-shrink-0 ${meta.bg} ${meta.color}`}>
                                                {meta.label}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs sm:text-sm font-medium text-white break-words">{entry.detail}</p>
                                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                                    <span className="text-[11px] font-bold text-slate-400">@{entry.user}</span>
                                                    {['KULLANICI_GIRIS', 'ZIYARETCI_GIRIS', 'HATALI_GIRIS'].includes(entry.action) && entry.meta && (
                                                        <div className="flex flex-wrap gap-1.5 items-center">
                                                            {entry.meta.ip && <span className="bg-[#0d1117] border border-white/10 px-1.5 py-0.5 rounded text-[10px] text-sky-400 font-mono">IP: {entry.meta.ip}</span>}
                                                            {entry.meta.location && <span className="bg-[#0d1117] border border-white/10 px-1.5 py-0.5 rounded text-[10px] text-amber-400 flex items-center gap-1"><MapPin size={10}/> {entry.meta.location}</span>}
                                                            {entry.meta.device && <span className="bg-[#0d1117] border border-white/10 px-1.5 py-0.5 rounded text-[10px] text-emerald-400 flex items-center gap-1"><MonitorSmartphone size={10}/> {entry.meta.device}</span>}
                                                            {(entry.action === 'HATALI_GIRIS' || entry.action === 'ZIYARETCI_GIRIS') && (
                                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${entry.meta?.isKnownDevice ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                                                                    {entry.meta?.isKnownDevice ? '✓ Tanınan Cihaz' : '⚠ BİLİNMEYEN CİHAZ'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                                            <span className="text-[10px] font-mono text-slate-400">
                                                {date.toLocaleDateString('tr-TR')} {date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {entry.action.includes('SİL') && entry.meta && (
                                                <button 
                                                    onClick={() => restoreData(entry.meta.table, entry.meta.id)}
                                                    className="flex items-center gap-1 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                                                >
                                                    <RotateCcw size={10} /> Geri Yükle
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Log Temizleme Şifre Modalı */}
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
                            <AlertTriangle className="text-red-400" size={18} /> Logları Temizle
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
                                    className={`w-full h-9 bg-[#0d1117] border border-white/10 text-white rounded-xl px-3 text-xs outline-none focus:border-slate-500 ${clearError ? 'border-red-500 bg-red-500/5' : ''}`}
                                    placeholder="••••••••"
                                />
                                {clearError && <p className="text-[10px] text-red-400 mt-1">Hatalı şifre!</p>}
                            </div>
                            <button 
                                type="submit"
                                className="w-full h-9 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-red-600/20 cursor-pointer"
                            >
                                Onayla ve Tümünü Sil
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Online Kullanıcı Detay Modalı */}
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
                                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-2 py-0.2 rounded-full font-bold">ONLINE</span>
                                    <span className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] px-2 py-0.2 rounded-full font-bold uppercase">{selectedOnlineUser.role || 'Şoför'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 bg-[#0d1117] p-3.5 rounded-xl border border-white/[0.06] text-xs">
                            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                                <span className="text-slate-400 flex items-center gap-1.5"><MonitorSmartphone size={13}/> Cihaz Tipi</span>
                                <span className="font-semibold text-white">{selectedOnlineUser.device || 'Bilinmiyor'}</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                                <span className="text-slate-400 flex items-center gap-1.5"><MapPin size={13} className="text-amber-400"/> Konum</span>
                                <span className="font-semibold text-amber-400">{selectedOnlineUser.location || 'Bilinmiyor'}</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                                <span className="text-slate-400">🌐 IP Adresi</span>
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

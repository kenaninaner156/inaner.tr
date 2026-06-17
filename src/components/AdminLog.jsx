import React, { useContext, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DataContext } from '../context/DataContext';
import { CompanyContext } from '../context/CompanyContext';
import { db } from '../services/firebaseConfig';
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
            setIsClearModalOpen(false);
            setClearPassword('');
            setClearError(false);
        } else {
            setClearError(true);
            setTimeout(() => setClearError(false), 2000);
        }
    };

    return (
        <div className="space-y-5 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-500/10 rounded-xl border border-slate-500/20">
                    <Shield size={20} className="text-slate-400" />
                </div>
                <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">Admin Paneli</h3>
                    <p className="text-xs text-slate-500">{adminLog.length} log · {pendingUsers.length} bekleyen · {onlineUsers.length} online</p>
                </div>
            </div>

            {/* Online Kullanıcılar Şeridi */}
            {onlineUsers.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar">
                    {onlineUsers.map(u => {
                        const isPC = u.device?.toLowerCase().includes('windows') || u.device?.toLowerCase().includes('macintosh');
                        const isKenan = u.username === 'kenan';
                        return (
                            <div key={u.id} onClick={() => setSelectedOnlineUser(u)} className="flex-shrink-0 flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 rounded-lg px-3 py-2 cursor-pointer transition-all animate-in zoom-in-95 duration-300 shadow-sm hover:shadow-emerald-500/10">
                                <div className="relative">
                                    <div className="w-8 h-8 rounded-full bg-[var(--bg-panel-hover)] flex items-center justify-center border border-[var(--border-color)] overflow-hidden">
                                        <Users size={14} className={isKenan ? "text-slate-400" : "text-emerald-400"} />
                                    </div>
                                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#0f172a] animate-pulse" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs font-bold text-[var(--text-primary)] leading-none capitalize">{u.username}</p>
                                        <span className="text-[10px] text-slate-500 font-medium">({isPC ? 'PC' : 'Mobil'})</span>
                                    </div>
                                    <p className="text-[9px] text-slate-600 mt-1 font-mono">{u.ip || '0.0.0.0'}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Tab Switcher */}
            <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
                <button onClick={() => setTab('log')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'log' ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                    Aktivite Logu
                </button>
                <button onClick={() => setTab('users')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${tab === 'users' ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                    <Users size={14} /> Kullanıcılar
                    {pendingUsers.length > 0 && (
                        <span className="bg-red-500 text-[var(--text-primary)] text-xs w-4 h-4 rounded-full flex items-center justify-center">{pendingUsers.length}</span>
                    )}
                </button>
            </div>

            {/* Aktivite Logu */}
            {tab === 'log' && (
                <>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 flex-wrap bg-white/5 p-3 rounded-xl border border-[var(--border-color)]">
                        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                            {categories.map(cat => (
                                <button key={cat.key} onClick={() => setFilter(cat.key)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-1 sm:flex-none ${filter === cat.key ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30 shadow-inner' : 'bg-[var(--bg-panel-hover)] text-[var(--text-secondary)] hover:bg-white/10 border border-[var(--border-color)]'}`}>
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                            <div className="relative flex-1 sm:flex-none">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input type="text" placeholder="Arama..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
                                    className="w-full sm:w-36 bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs rounded-lg pl-8 pr-2 py-1.5 outline-none focus:border-slate-500 transition-colors" />
                            </div>
                            <div className="relative flex-1 sm:flex-none">
                                <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} 
                                    className="w-full sm:w-[130px] bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs rounded-lg pl-8 pr-2 py-1.5 outline-none focus:border-slate-500 transition-colors" />
                                {dateFilter && (
                                    <button onClick={() => setDateFilter('')} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-400"><X size={12}/></button>
                                )}
                            </div>
                            <button
                                onClick={() => setIsClearModalOpen(true)}
                                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all flex-1 sm:flex-none"
                            >
                                <Trash2 size={13} /> Tümünü Sil
                            </button>
                        </div>
                    </div>

                    <div className="glass-panel overflow-hidden">
                        {filteredLog.length === 0 ? (
                            <div className="p-10 text-center">
                                <CheckCircle size={28} className="mx-auto mb-3 text-slate-600" />
                                <p className="text-slate-500 text-sm">Kayıt yok</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {filteredLog.map(entry => {
                                    const meta = ACTION_LABELS[entry.action] || { label: entry.action, color: 'text-[var(--text-secondary)]', bg: 'bg-white/5 border-[var(--border-color)]' };
                                    const date = new Date(entry.timestamp);

                                    let rowBgClass = 'hover:bg-white/5';
                                    if (entry.action === 'HATALI_GIRIS' || entry.action === 'ZIYARETCI_GIRIS') {
                                        rowBgClass = entry.meta?.isKnownDevice ? 'bg-sky-500/10 border border-sky-500/20' : 'bg-rose-500/10 border border-rose-500/20';
                                    }

                                    return (
                                        <div key={entry.id} className={`flex items-start gap-3 p-3 transition-colors ${rowBgClass}`}>
                                            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap mt-0.5 flex-shrink-0 ${meta.bg} ${meta.color}`}>
                                                {meta.label}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[var(--text-primary)] text-sm">{entry.detail}</p>
                                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                                    <span className="text-xs font-semibold text-slate-400">{entry.user}</span>
                                                    {['KULLANICI_GIRIS', 'ZIYARETCI_GIRIS', 'HATALI_GIRIS'].includes(entry.action) && entry.meta && (
                                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                                            {entry.meta.ip && <span className="bg-[var(--bg-panel)] border border-[var(--border-color)] px-1.5 py-[1px] rounded text-[10px] text-sky-400 font-mono">IP: {entry.meta.ip}</span>}
                                                            {entry.meta.location && <span className="bg-[var(--bg-panel)] border border-[var(--border-color)] px-1.5 py-[1px] rounded text-[10px] text-amber-500 flex items-center gap-1"><MapPin size={10}/> {entry.meta.location}</span>}
                                                            {entry.meta.device && <span className="bg-[var(--bg-panel)] border border-[var(--border-color)] px-1.5 py-[1px] rounded text-[10px] text-emerald-400 flex items-center gap-1"><MonitorSmartphone size={10}/> {entry.meta.device}</span>}
                                                            {entry.meta.screen && <span className="bg-[var(--bg-panel)] border border-[var(--border-color)] px-1.5 py-[1px] rounded text-[10px] text-slate-400 flex items-center gap-1">{entry.meta.screen}</span>}
                                                            {entry.meta.cores && <span className="bg-[var(--bg-panel)] border border-[var(--border-color)] px-1.5 py-[1px] rounded text-[10px] text-slate-400 flex items-center gap-1">{entry.meta.cores}</span>}
                                                            {entry.meta.lang && <span className="bg-slate-800 text-slate-300 font-bold px-1.5 py-[1px] rounded text-[10px] border border-slate-600">{entry.meta.lang.toUpperCase()}</span>}
                                                            {(entry.action === 'HATALI_GIRIS' || entry.action === 'ZIYARETCI_GIRIS') && (
                                                                <span className={`px-1.5 py-[1px] rounded text-[10px] font-bold ${entry.meta?.isKnownDevice ? 'bg-sky-500 text-slate-900' : 'bg-rose-500 text-white'}`}>
                                                                    {entry.meta?.isKnownDevice ? '✓ Tanınan Cihaz' : '⚠ BİLİNMEYEN CİHAZ'}
                                                                </span>
                                                            )}
                                                            {entry.meta.incognitoRisk && (
                                                                <span className="bg-fuchsia-500 text-white font-bold px-1.5 py-[1px] rounded text-[10px] flex items-center gap-1" title="Gizli Sekme veya Private Mode Algılandı">
                                                                    🕵️ GİZLİ SEKME
                                                                </span>
                                                            )}
                                                            {entry.meta.vpnRisk && (
                                                                <span className="bg-red-500 text-white font-bold px-1.5 py-[1px] rounded text-[10px] flex items-center gap-1" title="VPN, Proxy veya Veri Merkezi IP'si Algılandı">
                                                                    🌐 VPN / PROXY
                                                                </span>
                                                            )}
                                                            {/* Geliştirici Tarafından Tam Browser Bilgisi İçin hover (title) attribute kullanıyoruz */}
                                                            {entry.meta.rawDevice && <span className="text-[10px] bg-white/5 border border-white/10 px-1 py-[1px] rounded text-slate-500 truncate max-w-[200px]" title={entry.meta.rawDevice}>Tümü: {entry.meta.rawDevice}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                                                <div className="flex flex-col items-end">
                                                    <p className="text-xs text-slate-500">{date.toLocaleDateString('tr-TR')}</p>
                                                    <p className="text-xs text-slate-600">{date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p>
                                                </div>
                                                {entry.action.includes('SİL') && entry.meta && (
                                                    <button onClick={() => restoreData(entry.meta.table, entry.meta.id)}
                                                        className="flex items-center gap-1 text-[10px] bg-slate-500/20 text-slate-400 px-2 py-1 rounded hover:bg-slate-500/30 transition-colors mt-1">
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
                </>
            )}

            {/* Kullanıcı Yönetimi */}
            {tab === 'users' && (
                <div className="space-y-4">
                    {/* Bekleyen Talepler */}
                    <div>
                        <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                            ⏳ Onay Bekleyen
                            {pendingUsers.length > 0 && (
                                <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs px-2 py-0.5 rounded-full">{pendingUsers.length}</span>
                            )}
                        </h4>
                        {pendingUsers.length === 0 ? (
                            <div className="glass-panel p-6 text-center text-slate-500 text-sm">Bekleyen talep yok</div>
                        ) : (
                            <div className="space-y-2">
                                {pendingUsers.map(u => (
                                    <div key={u.id} className="glass-panel p-3 flex items-center gap-3">
                                        <div className="bg-amber-500/20 p-2 rounded-lg flex-shrink-0">
                                            <Users size={16} className="text-amber-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[var(--text-primary)] font-medium text-sm">{u.username}</p>
                                            <p className="text-slate-500 text-xs">{new Date(u.requestedAt).toLocaleString('tr-TR')}</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                                            <select
                                                value={approvalRoles[u.id] || 'şoför'}
                                                onChange={(e) => setApprovalRoles({ ...approvalRoles, [u.id]: e.target.value })}
                                                className="bg-white/5 border border-[var(--border-color)] text-[var(--text-primary)] text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-slate-500"
                                            >
                                                <option value="şoför" className="bg-[var(--bg-panel-hover)]">Şoför</option>
                                                <option value="company_admin" className="bg-[var(--bg-panel-hover)]">Şirket Yöneticisi</option>
                                            </select>

                                            <select
                                                value={approvalCompanies[u.id] || activeCompanyId || ''}
                                                onChange={(e) => setApprovalCompanies({ ...approvalCompanies, [u.id]: e.target.value })}
                                                className="bg-white/5 border border-[var(--border-color)] text-slate-300 font-bold text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-slate-500"
                                            >
                                                {(companies || []).map(c => (
                                                    <option key={c.id} value={c.id} className="bg-[var(--bg-panel-hover)]">{c.name}</option>
                                                ))}
                                            </select>

                                            <button onClick={() => handleApprove(u.id)}
                                                className="flex items-center justify-center gap-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition">
                                                <Check size={12} /> Onayla
                                            </button>
                                            <button onClick={() => rejectUser(u.id)}
                                                className="flex items-center justify-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs font-medium transition">
                                                <X size={12} /> Reddet
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Onaylı Kullanıcılar */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold text-[var(--text-primary)]">✅ Onaylı Kullanıcılar</h4>
                            <button onClick={() => setIsAddUserModalOpen(true)}
                                className="flex items-center gap-1.5 text-xs bg-slate-500/20 hover:bg-slate-500/30 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-500/30 transition">
                                <PlusCircle size={13} /> Manuel Ekle
                            </button>
                        </div>
                        <div className="glass-panel overflow-hidden">
                            <div className="p-3 flex items-center gap-3 border-b border-[var(--border-color)]">
                                <div className="bg-slate-500/20 p-2 rounded-lg"><Shield size={14} className="text-slate-400" /></div>
                                <div className="flex-1">
                                    <p className="text-[var(--text-primary)] font-medium text-sm">kenan</p>
                                    <p className="text-slate-500 text-xs">Admin · Sistem yöneticisi</p>
                                </div>
                                <span className="text-xs bg-slate-500/10 text-slate-300 border border-slate-500/20 px-2 py-0.5 rounded-full">Admin</span>
                            </div>
                            {approvedUsers.length === 0 && (
                                <p className="p-4 text-center text-slate-600 text-sm">Başka onaylı kullanıcı yok</p>
                            )}
                            {approvedUsers.map(u => (
                                <div key={u.id} className="p-3 flex items-start sm:items-center gap-3 border-b border-[var(--border-color)] last:border-0 flex-col sm:flex-row">
                                    <div className="bg-slate-500/20 p-2 rounded-lg flex-shrink-0"><Users size={14} className="text-[var(--text-secondary)]" /></div>

                                    {editingUserId === u.id ? (
                                        <div className="flex-1 flex flex-col sm:flex-row gap-2 w-full">
                                            <input type="text" value={editForm.username} onChange={e => setEditForm({ ...editForm, username: e.target.value })} className="bg-white/5 border border-[var(--border-color)] text-[var(--text-primary)] text-xs px-2 py-1.5 rounded-lg flex-1" placeholder="Kullanıcı Adı" />
                                            <input type="text" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} className="bg-white/5 border border-[var(--border-color)] text-[var(--text-primary)] text-xs px-2 py-1.5 rounded-lg flex-1" placeholder="Şifre" />
                                            <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })} className="bg-white/5 border border-[var(--border-color)] text-[var(--text-primary)] text-xs px-2 py-1.5 rounded-lg flex-1">
                                                <option value="şoför" className="bg-[var(--bg-panel-hover)]">Şoför</option>
                                                <option value="company_admin" className="bg-[var(--bg-panel-hover)]">Şirket Yöneticisi</option>
                                            </select>
                                            <select value={editForm.companyId} onChange={e => setEditForm({ ...editForm, companyId: e.target.value })} className="bg-white/5 border border-[var(--border-color)] text-slate-300 font-bold text-xs px-2 py-1.5 rounded-lg flex-1">
                                                {(companies || []).map(c => (
                                                    <option key={c.id} value={c.id} className="bg-[var(--bg-panel-hover)]">{c.name}</option>
                                                ))}
                                            </select>
                                            <button onClick={() => handleEditSave(u.id)} className="bg-slate-500/20 text-slate-400 border border-slate-500/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-500/30 w-full sm:w-auto flex justify-center items-center gap-1">
                                                <Save size={12} /> Kaydet
                                            </button>
                                            <button onClick={() => setEditingUserId(null)} className="bg-slate-500/20 text-[var(--text-secondary)] border border-slate-500/30 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-500/30 w-full sm:w-auto flex justify-center items-center gap-1">
                                                İptal
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex-1 w-full flex justify-between sm:justify-start items-center gap-2">
                                                <div>
                                                    <p className="text-[var(--text-primary)] font-medium text-sm flex flex-wrap items-center gap-2">
                                                        {u.username}
                                                        <span className="text-[10px] bg-slate-500/10 text-[var(--text-secondary)] border border-slate-500/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider">{u.role || 'Şoför'}</span>
                                                        <span className="text-[10px] bg-slate-500/10 text-slate-300 border border-slate-500/20 px-1.5 py-0.5 rounded-md font-bold tracking-wider">{(companies || []).find(c => c.id === u.companyId)?.name || 'Şirketsiz'}</span>
                                                    </p>
                                                    <p className="text-[var(--text-primary)] text-xs mt-0.5 bg-white/5 inline-block px-1.5 py-0.5 rounded border border-[var(--border-color)] mt-1.5 font-mono">Şifre: *******</p>
                                                    <p className="text-slate-500 text-[10px] mt-1">Onay: {new Date(u.approvedAt).toLocaleDateString('tr-TR')}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-2 sm:mt-0 w-full sm:w-auto justify-center">
                                                <button onClick={() => handleEditStart(u)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 transition-colors bg-white/5 hover:bg-white/10 rounded-md">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => {
                                                    setUserToDelete(u);
                                                    setIsDeleteModalOpen(true);
                                                }} className="text-slate-500 hover:text-red-400 p-1.5 transition-colors bg-white/5 hover:bg-red-500/10 rounded-md mt-2 sm:mt-0">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Manuel Kullanıcı Ekleme Modalı */}
            {isAddUserModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[var(--bg-base)] backdrop-blur-md">
                    <div className="glass-panel w-full max-w-sm p-6 relative animate-in zoom-in-95 duration-200">
                        <button onClick={() => setIsAddUserModalOpen(false)} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
                            <PlusCircle className="text-slate-500" /> Yeni Kullanıcı
                        </h3>
                        <form onSubmit={handleAddManualUser} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Kullanıcı Adı</label>
                                <input type="text" required value={newUserForm.username}
                                    onChange={e => setNewUserForm({ ...newUserForm, username: e.target.value.toLowerCase().trim() })}
                                    className="w-full glass-input px-4 py-2.5 text-sm transition-colors focus:border-slate-500" placeholder="" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Şifre</label>
                                <input type="text" required value={newUserForm.password}
                                    onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                    className="w-full glass-input px-4 py-2.5 text-sm transition-colors focus:border-slate-500" placeholder="" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Yetki Rolü</label>
                                <select value={newUserForm.role}
                                    onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value })}
                                    className="w-full glass-input px-4 py-2.5 text-sm bg-[var(--bg-panel)] focus:border-slate-500">
                                    <option value="şoför">Sadece Ekleme/Görüntüleme (Şoför)</option>
                                    <option value="company_admin">Şirket Yöneticisi</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Atanacak Şirket</label>
                                <select value={newUserForm.companyId || activeCompanyId || ''}
                                    onChange={e => setNewUserForm({ ...newUserForm, companyId: e.target.value })}
                                    className="w-full glass-input px-4 py-2.5 text-sm bg-[var(--bg-panel)] focus:border-slate-500 font-bold text-slate-300">
                                    {(companies || []).map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <button type="submit"
                                className="w-full bg-slate-600 hover:bg-slate-500 text-[var(--text-primary)] py-3 rounded-lg font-semibold transition shadow-lg shadow-slate-500/20 mt-2">
                                Kullanıcıyı Oluştur
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Log Temizleme Şifre Modalı */}
            {isClearModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[var(--bg-base)] backdrop-blur-md">
                    <div className="glass-panel w-full max-w-sm p-6 relative animate-in zoom-in-95 duration-200">
                        <button onClick={() => { setIsClearModalOpen(false); setClearPassword(''); setClearError(false); }} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                            <AlertTriangle className="text-red-500" /> Logları Temizle
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] mb-6 italic">Tüm aktivite geçmişi geri alınamaz şekilde silinecektir.</p>

                        <form onSubmit={handleSecureClear} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Güvenlik Şifresi</label>
                                <input
                                    type="password"
                                    autoFocus
                                    required
                                    value={clearPassword}
                                    onChange={e => setClearPassword(e.target.value)}
                                    className={`w-full glass-input px-4 py-2.5 text-sm transition-all focus:border-slate-500 ${clearError ? 'border-red-500 bg-red-500/5 shake' : ''}`}
                                    placeholder="••••••••"
                                />
                                {clearError && <p className="text-[10px] text-red-500 mt-1 animate-pulse">Hatalı şifre usta!</p>}
                            </div>
                            <button type="submit"
                                className="w-full bg-red-600 hover:bg-red-500 text-[var(--text-primary)] py-3 rounded-lg font-semibold transition shadow-lg shadow-red-500/20 mt-2">
                                Onayla ve Tümünü Sil
                            </button>
                        </form>
                    </div>
                </div>
            )}
            {/* Kullanıcı Silme Onay Modalı */}
            {isDeleteModalOpen && userToDelete && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[var(--bg-base)] backdrop-blur-md">
                    <div className="glass-panel w-full max-w-sm p-6 relative animate-in zoom-in-95 duration-200">
                        <button onClick={() => { setIsDeleteModalOpen(false); setUserToDelete(null); }} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                            <AlertTriangle className="text-red-500" /> Kullanıcıyı Sil
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] mb-6">
                            <strong className="text-[var(--text-primary)] uppercase">{userToDelete.username}</strong> kullanıcısını sistemden tamamen silmek istediğinize emin misiniz?
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <button onClick={() => { setIsDeleteModalOpen(false); setUserToDelete(null); }} className="w-full sm:flex-1 bg-[var(--bg-panel-hover)] hover:bg-slate-700 text-[var(--text-primary)] py-2.5 rounded-lg text-sm font-semibold transition border border-[var(--border-color)]">
                                İptal Et
                            </button>
                            <button onClick={async () => {
                                try {
                                    await deleteUser(userToDelete.id);
                                    setIsDeleteModalOpen(false);
                                    setUserToDelete(null);
                                    if (refreshUsers) refreshUsers();
                                } catch {
                                    
                                    alert("Kullanıcı silinirken bir donanımsal hata oluştu.");
                                }
                            }} className="w-full sm:flex-1 bg-red-600 hover:bg-red-500 text-[var(--text-primary)] py-2.5 rounded-lg text-sm font-semibold transition shadow-lg shadow-red-500/20">
                                Evet, Tamamen Sil
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Online Kullanıcı Detay Modalı */}
            {selectedOnlineUser && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#030712]/90 backdrop-blur-md">
                    <div className="glass-panel w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200 border-emerald-500/30 shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)]">
                        <button onClick={() => setSelectedOnlineUser(null)} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        
                        <div className="flex items-center gap-4 mb-6">
                            <div className="relative">
                                <div className="w-14 h-14 rounded-full bg-[var(--bg-panel-hover)] flex items-center justify-center border-2 border-emerald-500/50 overflow-hidden shadow-lg shadow-emerald-500/20">
                                    <Users size={24} className="text-emerald-400" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-[3px] border-[#0f172a] animate-pulse" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-[var(--text-primary)] capitalize">{selectedOnlineUser.username}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold shadow-[0_0_10px_rgba(16,185,129,0.2)]">Aktif / Online</span>
                                    <span className="bg-slate-500/20 text-[var(--text-secondary)] border border-slate-500/30 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">{selectedOnlineUser.role || 'Şoför'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 bg-black/20 p-4 rounded-xl border border-white/5">
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><MonitorSmartphone size={14} className="text-slate-400"/> Cihaz Tipi</span>
                                <span className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                                    {selectedOnlineUser.device || 'Bilinmiyor'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><MapPin size={14} className="text-amber-400"/> Konum (Tahmini)</span>
                                <span className="text-sm font-semibold text-amber-500">{selectedOnlineUser.location || 'Bilinmiyor'}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">🌐 IP Adresi</span>
                                <span className="text-sm font-mono font-bold text-sky-400">{selectedOnlineUser.ip || '0.0.0.0'}</span>
                            </div>

                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><MonitorSmartphone size={14} className="text-slate-400"/> Çözünürlük & Ekran</span>
                                <span className="text-sm font-semibold text-[var(--text-primary)]">
                                    {selectedOnlineUser.screen || 'Bilinmiyor'}
                                </span>
                            </div>
                            
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><MonitorSmartphone size={14} className="text-slate-400"/> İşlemci / Dil / Bölge</span>
                                <span className="text-sm text-[var(--text-primary)] text-right">
                                    <span className="font-mono text-xs bg-white/5 px-1 py-0.5 rounded mr-1" title="İşlemci">{selectedOnlineUser.cores || '?'}</span>
                                    <span className="font-mono text-[10px] bg-slate-800 border border-slate-600 px-1 py-0.5 rounded mr-1 uppercase" title="Dil">{selectedOnlineUser.lang || '?'}</span>
                                    <span className="font-mono text-[10px] bg-white/5 px-1 py-0.5 rounded text-slate-400" title="Zaman Dilimi">{selectedOnlineUser.tz || '?'}</span>
                                </span>
                            </div>

                            <div className="flex flex-wrap gap-2 py-2 border-b border-white/5">
                                {selectedOnlineUser.isKnownDevice ? 
                                    <span className="bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-1 rounded text-xs font-bold">✓ Tanınan Cihaz</span> : 
                                    <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-1 rounded text-xs font-bold">⚠ Yeni/Bilinmeyen Cihaz</span>
                                }
                                {selectedOnlineUser.incognitoRisk && (
                                    <span className="bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 shadow-[0_0_10px_rgba(217,70,239,0.2)] px-2 py-1 rounded text-xs font-bold flex items-center gap-1" title="Gizli Sekme Bellek Kısıtlaması">🕵️ Gizli Sekme Riski</span>
                                )}
                                {selectedOnlineUser.vpnRisk && (
                                    <span className="bg-red-500/20 text-red-300 border border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.2)] px-2 py-1 rounded text-xs font-bold flex items-center gap-1" title="Zaman dilimi tutarsızlığı veya Datacenter/VPN IP'si">🌐 VPN / PROXY Riski</span>
                                )}
                            </div>

                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><Calendar size={14} className="text-fuchsia-400" /> Son Sinyal (Heartbeat)</span>
                                <span className="text-sm text-[var(--text-primary)]">
                                    {selectedOnlineUser.lastActive ? new Date(selectedOnlineUser.lastActive).toLocaleTimeString('tr-TR', { hour: '2-digit', minute:'2-digit', second:'2-digit' }) : 'Bilinmiyor'}
                                </span>
                            </div>
                            
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><Calendar size={14} className="text-emerald-400" /> Aktiflik Süresi</span>
                                <span className="text-sm font-bold text-emerald-400">
                                    {selectedOnlineUser.sessionStart ? 
                                        `${Math.floor((Date.now() - new Date(selectedOnlineUser.sessionStart).getTime()) / 60000)} dk` 
                                        : 'Hesaplanıyor...'}
                                </span>
                            </div>

                            <div className="flex flex-col py-2">
                                <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 mb-1"><Wrench size={14} className="text-slate-500" /> Teknik Cihaz Verisi (Raw String)</span>
                                <div className="text-[10px] text-slate-400 bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-color)] break-words font-mono shadow-inner h-20 overflow-y-auto scrollbar-thin">
                                    {selectedOnlineUser.rawDevice || 'Mevcut değil (Çıkış yapıp tekrar girmek gerekebilir)'}
                                </div>
                            </div>
                        </div>

                        <button onClick={() => setSelectedOnlineUser(null)} className="mt-6 w-full bg-[var(--bg-panel-hover)] hover:bg-white/10 text-[var(--text-primary)] py-2.5 rounded-lg text-sm font-semibold transition border border-white/10 hover:border-emerald-500/30 hover:text-emerald-400 hover:shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                            Pencereyi Kapat
                        </button>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};

export default AdminLog;

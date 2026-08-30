import React, { useState, useEffect, useContext } from 'react';
import { ShieldAlert, Building2, Plus, Server, Activity, Trash2, Key, Edit2, PauseCircle, PlayCircle, Users, Truck, Check, X, AlertOctagon, LogIn, Download, Database, Shield, Menu } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, writeBatch, where, getDocs } from 'firebase/firestore';
import { useCompany } from '../context/CompanyContext';
import { DataContext } from '../context/DataContext';
import { sendDiscordAlert } from '../services/discordWebhook';
import AdminLog from './AdminLog';

const SuperAdmin = ({ onOpenMenu, isMobile } = {}) => {
    const { activeCompanyId, setActiveCompanyId } = useCompany();
    const { editUser, deleteUser, addApprovedUser } = useContext(DataContext);
    const [companies, setCompanies] = useState([]);;
    const [showForm, setShowForm] = useState(false);
    const [compName, setCompName] = useState('');
    const [compAdmin, setCompAdmin] = useState('');
    const [compPassword, setCompPassword] = useState('');

    const [activeTab, setActiveTab] = useState('companies'); // 'companies', 'users' or 'logs'
    const [allUsers, setAllUsers] = useState([]);
    const [editingUserId, setEditingUserId] = useState(null);
    const [editUserForm, setEditUserForm] = useState({ password: '' });

    const [isExporting, setIsExporting] = useState(false);

    const [stats, setStats] = useState({});
    const [editingCompanyId, setEditingCompanyId] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', adminId: '' });

    useEffect(() => {
        const q = query(collection(db, 'companies'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snapshot) => {
            setCompanies(snapshot.docs.map(doc => ({ ...doc.data(), docRefId: doc.id })));
        });

        // Global istatistikleri dinle (Tırlar, Kullanıcılar, Şoförler)
        const unsubTrucks = onSnapshot(collection(db, 'trucks'), (snapshot) => {
            const counts = {};
            snapshot.docs.forEach(d => {
                const cId = d.data().companyId;
                if (cId) counts[cId] = (counts[cId] || 0) + 1;
            });
            setStats(prev => ({ ...prev, trucks: counts }));
        });

        const unsubUsers = onSnapshot(collection(db, 'approved_users'), (snapshot) => {
            const counts = {};
            const driverCounts = {};
            const usersList = [];
            snapshot.docs.forEach(d => {
                const data = d.data();
                usersList.push({ ...data, id: d.id });
                const cId = data.companyId;
                if (cId) {
                    counts[cId] = (counts[cId] || 0) + 1;
                    if (data.role === 'şoför' || data.role === 'user') {
                        driverCounts[cId] = (driverCounts[cId] || 0) + 1;
                    }
                }
            });
            setAllUsers(usersList);
            setStats(prev => ({ ...prev, users: counts, drivers: driverCounts }));
        });

        return () => { unsub(); unsubTrucks(); unsubUsers(); };
    }, []);

    const handleAddCompany = async (e) => {
        e.preventDefault();
        try {
            const newCompanyId = 'comp_' + Date.now().toString(36);
            await addDoc(collection(db, 'companies'), {
                id: newCompanyId,
                name: compName,
                adminId: compAdmin,
                status: 'active',
                personnelEnabled: false,
                mapEnabled: false,
                earsivEnabled: false,
                createdAt: new Date().toISOString()
            });

            // Şirket oluşturulunca, hemen o şirketin sahibini güvenli bir şekilde ekliyoruz (Auth hesabı ile beraber)
            await addApprovedUser({
                username: compAdmin.toLowerCase().trim(),
                password: compPassword,
                role: 'company_admin',
                companyId: newCompanyId
            });

            // A1: Yeni şirket bildirimi
            sendDiscordAlert({
              type: 'success',
              title: '🏢 Yeni Şirket Oluşturuldu',
              description: `**${compName || '—'}** sisteme eklendi.`,
            });

            setCompName('');
            setCompAdmin('');
            setCompPassword('');
            setShowForm(false);
        } catch {
            
            alert("Şirket oluşturulurken bir hata oluştu.");
        }
    };

    const handleEditSave = async (docRefId) => {
        try {
            await updateDoc(doc(db, 'companies', docRefId), {
                name: editForm.name,
                adminId: editForm.adminId
            });
            setEditingCompanyId(null);
        } catch { /* empty */ }
    };

    const handleToggleStatus = async (docRefId, currentStatus) => {
        if (window.confirm(`Şirketi ${currentStatus === 'active' ? 'ASKIYA ALMAK' : 'AKTİF ETMEK'} istediğinize emin misiniz?`)) {
            try {
                const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
                const company = companies.find(c => c.docRefId === docRefId);
                await updateDoc(doc(db, 'companies', docRefId), {
                    status: newStatus
                });
                if (newStatus === 'suspended') {
                    // A2: Şirket askıya alma bildirimi
                    sendDiscordAlert({
                        type: 'danger',
                        title: '🚫 Şirket Askıya Alındı',
                        description: `Bir şirket erişimi engellendi.`,
                        fields: [
                            { name: '🏢 Şirket', value: String(company?.name || docRefId || '—'), inline: true },
                        ]
                    });
                }
            } catch { /* empty */ }
        }
    };

    const handleTogglePersonnel = async (docRefId, currentStatus) => {
        try {
            await updateDoc(doc(db, 'companies', docRefId), {
                personnelEnabled: !currentStatus
            });
        } catch { /* empty */ }
    };

    const handleToggleMap = async (docRefId, currentStatus) => {
        try {
            await updateDoc(doc(db, 'companies', docRefId), {
                mapEnabled: !currentStatus
            });
        } catch { /* empty */ }
    };

    const handleToggleEArsiv = async (docRefId, currentStatus) => {
        try {
            await updateDoc(doc(db, 'companies', docRefId), {
                earsivEnabled: !currentStatus
            });
        } catch { /* empty */ }
    };

    const handleDeleteCompany = async (company) => {
        const confirmMsg = `DİKKAT! ${company.name} şirketini siliyorsunuz!\n\nBu işlem şirketi ve o şirkete ait TÜM kullanıcıları, araçları ve kayıtları DERİNLEMESİNE silecektir. Bu işlem GERİ ALINAMAZ!\n\nEmin misiniz?`;
        if (window.confirm(confirmMsg)) {
            if (window.confirm("Son kararınız mı? (Veriler tamamen yok edilecek)")) {
                try {
                    // Deep Clean Delete: Önce Şirketi silelim. Opsiyonel: Diğer tabloları da silebilirsiniz.
                    const batch = writeBatch(db);

                    // Şirketin kullanıcılarını sil
                    const uQ = query(collection(db, 'approved_users'), where('companyId', '==', company.id));
                    const uSnap = await getDocs(uQ);
                    uSnap.forEach(d => batch.delete(d.ref));

                    // Şirketin araçlarını sil
                    const tQ = query(collection(db, 'trucks'), where('companyId', '==', company.id));
                    const tSnap = await getDocs(tQ);
                    tSnap.forEach(d => batch.delete(d.ref));

                    // Kendisini sil
                    batch.delete(doc(db, 'companies', company.docRefId));

                    await batch.commit();

                    // A3: Şirket silme bildirimi
                    sendDiscordAlert({
                        type: 'danger',
                        title: '💣 ŞİRKET SİLİNDİ — TÜM VERİLER GİTTİ!',
                        description: `Bir şirket ve tüm verisi sistemden kaldırıldı. Bu işlem geri alınamaz!`,
                        fields: [
                            { name: '🏢 Şirket', value: String(company?.name || company?.id || '—'), inline: true },
                        ]
                    });
                } catch { /* empty */ }
            }
        }
    };

    const handleEditUserPassword = async (userId) => {
        if(editUserForm.password.length < 6) { alert("Şifre en az 6 karakter olmalı."); return; }
        try {
            await editUser(userId, { password: editUserForm.password });
            setEditingUserId(null);
        } catch { alert("Hata oluştu."); }
    };

    const handleDeleteUser = async (userId, username) => {
        if(window.confirm(`DİKKAT! ${username} kullanıcısını siliyorsunuz. Emin misiniz?`)) {
            try {
                await deleteUser(userId);
            } catch { alert("Hata."); }
        }
    };

    // --- JSON Export (Yerel Yedekleme) ---
    const handleExportBackup = async () => {
        if (!window.confirm("Tüm veri tabanı bilgilerini bir JSON dosyası olarak indirmek üzeresiniz. Bu işlem veritabanı büyüklüğüne göre biraz zaman alabilir.\n\nOnaylıyor musunuz?")) return;
        
        setIsExporting(true);
        try {
            const collectionsToBackup = ['companies', 'approved_users', 'trucks', 'trips', 'fuelRecords', 'maintenanceRecords'];
            const backupData = {
                exportDate: new Date().toISOString(),
                version: "1.0",
                data: {}
            };

            // Her koleksiyonu çekiyoruz
            for (const colName of collectionsToBackup) {
                const snap = await getDocs(collection(db, colName));
                backupData.data[colName] = snap.docs.map(doc => ({ ...doc.data(), docRefId: doc.id }));
            }

            // Dosya oluşturma ve indirme
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `tir_muhasebe_backup_${new Date().toISOString().split('T')[0]}.json`);
            document.body.appendChild(downloadAnchorNode); // Firefox trigger required
            downloadAnchorNode.click();
            downloadAnchorNode.remove();

            // A8: Veritabanı yedeği bildirimi
            sendDiscordAlert({
                type: 'admin',
                title: '💾 Veritabanı Yedeği Alındı',
                description: 'Tüm sistem verisi JSON olarak indirildi.',
            });

        } catch (error) {
            console.error("Yedekleme hatası:", error);
            alert("Yedekleme sırasında bir hata oluştu.");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div 
            className="flex-1 flex flex-col h-full w-full p-2.5 sm:p-4 lg:p-6 overflow-hidden gap-3 max-w-[1920px] mx-auto pb-1 sm:pb-2"
        >
            {/* 1. Şık Tek Satır Başlık & Menü Çubuğu */}
            <div 
                className="flex items-center justify-between gap-3 pb-2.5 border-b border-white/[0.06] shrink-0"
                style={{
                    paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))'
                }}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    {isMobile && onOpenMenu && (
                        <button 
                            onClick={onOpenMenu} 
                            className="p-1.5 -ml-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="Menüyü Aç"
                        >
                            <Menu size={22} />
                        </button>
                    )}
                    <div className="flex items-center gap-2 min-w-0">
                        <h2 className="text-lg font-bold tracking-tight text-white whitespace-nowrap flex items-center gap-2">
                            <ShieldAlert size={20} className="text-slate-300" />
                            <span>Super Admin (SaaS Yönetimi)</span>
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800/80 border border-slate-700/80 rounded-full text-slate-300 text-xs font-semibold">
                        <Server size={13} className="text-slate-400" />
                        <span>Toplam: <strong className="text-white font-mono">{companies.length}</strong> Şirket</span>
                    </div>
                </div>
            </div>

            {/* 2. Modern Kapsül Sekme Çubuğu */}
            <div className="flex items-center gap-1.5 p-1 bg-[#0d1117] border border-white/[0.08] rounded-2xl overflow-x-auto custom-scrollbar shrink-0">
                <button
                    onClick={() => setActiveTab('companies')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === 'companies'
                            ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Building2 size={14} />
                    <span>Şirketler</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${activeTab === 'companies' ? 'bg-slate-700 text-slate-200' : 'bg-white/10 text-slate-400'}`}>
                        {companies.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === 'users'
                            ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Users size={14} />
                    <span>Sistem Kullanıcıları</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${activeTab === 'users' ? 'bg-slate-700 text-slate-200' : 'bg-white/10 text-slate-400'}`}>
                        {allUsers.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('logs')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === 'logs'
                            ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Shield size={14} />
                    <span>Admin Logu</span>
                </button>
            </div>

            {/* 3. Ana İçerik Alanı (Kaydırılabilir) */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-4 pr-0.5">

                {/* ─── ŞİRKETLER SEKMESİ ─── */}
                {activeTab === 'companies' && (
                    <div className="space-y-3.5">
                        {/* Üst Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#0d1117] border border-white/[0.08] p-3 rounded-2xl">
                            <div className="text-xs text-slate-300">
                                Sistemde kayıtlı <span className="font-bold text-white font-mono">{companies.length}</span> müşteri şirketi bulunuyor.
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button 
                                    onClick={handleExportBackup} 
                                    disabled={isExporting}
                                    className="h-8 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                                    title="Tüm Veritabanını Bilgisayara İndir (JSON)"
                                >
                                    <Database size={13} className="text-sky-400" />
                                    <span>{isExporting ? 'Yedekleniyor...' : 'Veritabanı Yedeği Al'}</span>
                                </button>
                                <button 
                                    onClick={() => setShowForm(!showForm)} 
                                    className="h-8 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                                >
                                    <Plus size={14} />
                                    <span>Yeni Şirket Ekle</span>
                                </button>
                            </div>
                        </div>

                        {/* Yeni Şirket Ekleme Formu */}
                        {showForm && (
                            <form onSubmit={handleAddCompany} className="bg-[#07090e] p-4 sm:p-5 rounded-2xl border border-white/10 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                        <Building2 size={14} className="text-slate-300" /> Yeni Müşteri Şirketi Oluştur
                                    </h4>
                                    <button 
                                        type="button" 
                                        onClick={() => setShowForm(false)}
                                        className="text-slate-400 hover:text-white p-1 cursor-pointer"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Şirket Adı (Müşteri Ünvanı) *</label>
                                        <input 
                                            type="text" 
                                            required 
                                            value={compName} 
                                            onChange={e => setCompName(e.target.value)} 
                                            className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-semibold focus:border-slate-500 outline-none" 
                                            placeholder="Örn: X Lojistik A.Ş." 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Ana Yönetici (Kullanıcı Adı) *</label>
                                        <input 
                                            type="text" 
                                            required 
                                            value={compAdmin} 
                                            onChange={e => setCompAdmin(e.target.value)} 
                                            className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-semibold focus:border-slate-500 outline-none" 
                                            placeholder="Örn: xlojistik_admin" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Yönetici Şifresi (Geçici) *</label>
                                        <div className="relative">
                                            <Key size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input 
                                                type="text" 
                                                required 
                                                value={compPassword} 
                                                onChange={e => setCompPassword(e.target.value)} 
                                                className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl pl-8 pr-3 text-xs font-mono focus:border-slate-500 outline-none" 
                                                placeholder="Örn: xLojistik123" 
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                    <button 
                                        type="button" 
                                        onClick={() => setShowForm(false)} 
                                        className="h-8 px-3 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
                                    >
                                        Vazgeç
                                    </button>
                                    <button 
                                        type="submit" 
                                        className="h-8 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Check size={14} /> Şirketi Sisteme Kaydet
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Şirket Kartları Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            {companies.map(comp => {
                                const tCount = Math.max(stats.trucks?.[comp.id] || 0, stats.trucks?.[comp.docRefId] || 0);
                                const dCount = Math.max(stats.drivers?.[comp.id] || 0, stats.drivers?.[comp.docRefId] || 0);
                                const isEditing = editingCompanyId === comp.docRefId;
                                const isSuspended = comp.status === 'suspended';

                                return (
                                    <div 
                                        key={comp.id} 
                                        className={`bg-[#07090e] rounded-2xl p-4 sm:p-5 border transition flex flex-col justify-between ${
                                            isSuspended 
                                                ? 'border-red-500/30 opacity-75' 
                                                : activeCompanyId === comp.id
                                                ? 'border-sky-500/60 shadow-md shadow-sky-500/10'
                                                : 'border-white/[0.08] hover:border-slate-600'
                                        }`}
                                    >
                                        {/* Üst Kısım: İkon + Şirket Adı & Durum */}
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
                                                    isSuspended 
                                                        ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                                                        : 'bg-slate-800 border-slate-700 text-slate-300'
                                                }`}>
                                                    <Building2 size={20} />
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="text-sm sm:text-base font-bold text-white truncate" title={comp.name}>
                                                        {comp.name}
                                                    </h4>
                                                    <p className="text-[11px] text-slate-400 font-medium truncate">
                                                        Yönetici: <span className="text-slate-200 font-mono font-semibold">{comp.adminId}</span>
                                                    </p>
                                                </div>
                                            </div>

                                            <button 
                                                onClick={() => handleToggleStatus(comp.docRefId, comp.status)} 
                                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors shrink-0 cursor-pointer border ${
                                                    comp.status === 'active' 
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                                                        : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                                                }`} 
                                                title={comp.status === 'active' ? 'Şirketi Askıya Al' : 'Ticari Faaliyeti Sürdür'}
                                            >
                                                <span className={`w-1.5 h-1.5 rounded-full ${comp.status === 'active' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                                {comp.status === 'active' ? 'AKTİF' : 'ASKIDA'}
                                            </button>
                                        </div>

                                        {/* Düzenleme Formu veya Sayaç Kutuları */}
                                        {isEditing ? (
                                            <div className="space-y-2 my-2 p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                                                <input 
                                                    type="text" 
                                                    value={editForm.name} 
                                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })} 
                                                    className="w-full bg-[#0d1117] border border-white/[0.08] text-white rounded-lg px-2.5 py-1 text-xs outline-none focus:border-slate-500" 
                                                    placeholder="Şirket Adı" 
                                                />
                                                <input 
                                                    type="text" 
                                                    value={editForm.adminId} 
                                                    onChange={e => setEditForm({ ...editForm, adminId: e.target.value })} 
                                                    className="w-full bg-[#0d1117] border border-white/[0.08] text-white rounded-lg px-2.5 py-1 text-xs outline-none focus:border-slate-500" 
                                                    placeholder="Yönetici Kullanıcı Adı" 
                                                />
                                                <div className="flex gap-2 pt-1">
                                                    <button 
                                                        onClick={() => handleEditSave(comp.docRefId)} 
                                                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-1 rounded-lg text-xs font-semibold transition border border-slate-700 cursor-pointer"
                                                    >
                                                        Kaydet
                                                    </button>
                                                    <button 
                                                        onClick={() => setEditingCompanyId(null)} 
                                                        className="flex-1 bg-white/10 hover:bg-white/15 text-slate-300 py-1 rounded-lg text-xs font-semibold transition cursor-pointer"
                                                    >
                                                        İptal
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-2 my-2.5">
                                                <div className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-2 flex items-center justify-between">
                                                    <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                                                        <Truck size={13} className="text-slate-400" /> Araç
                                                    </span>
                                                    <span className="text-xs font-bold text-white font-mono">{tCount}</span>
                                                </div>
                                                <div className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-2 flex items-center justify-between">
                                                    <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                                                        <Users size={13} className="text-slate-400" /> Şoför
                                                    </span>
                                                    <span className="text-xs font-bold text-white font-mono">{dCount}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Modül Açma / Kapama Anahtarları */}
                                        <div className="space-y-1.5 py-2.5 border-t border-white/[0.06]">
                                            {/* Personel & Prim */}
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-[11px] text-slate-400 font-medium">Personel & Prim Takibi</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleTogglePersonnel(comp.docRefId, comp.personnelEnabled)}
                                                    className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 outline-none flex items-center cursor-pointer ${
                                                        comp.personnelEnabled ? 'bg-sky-500' : 'bg-slate-800 border border-slate-700'
                                                    }`}
                                                >
                                                    <div
                                                        className={`w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200 ${
                                                            comp.personnelEnabled ? 'translate-x-3.5' : 'translate-x-0'
                                                        }`}
                                                    />
                                                </button>
                                            </div>

                                            {/* Harita Modülü */}
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-[11px] text-slate-400 font-medium">Harita Modülü</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleMap(comp.docRefId, comp.mapEnabled)}
                                                    className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 outline-none flex items-center cursor-pointer ${
                                                        comp.mapEnabled ? 'bg-sky-500' : 'bg-slate-800 border border-slate-700'
                                                    }`}
                                                >
                                                    <div
                                                        className={`w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200 ${
                                                            comp.mapEnabled ? 'translate-x-3.5' : 'translate-x-0'
                                                        }`}
                                                    />
                                                </button>
                                            </div>

                                            {/* E-Arşiv Modülü */}
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-[11px] text-slate-400 font-medium">E-Arşiv Modülü</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleEArsiv(comp.docRefId, comp.earsivEnabled)}
                                                    className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 outline-none flex items-center cursor-pointer ${
                                                        comp.earsivEnabled ? 'bg-sky-500' : 'bg-slate-800 border border-slate-700'
                                                    }`}
                                                >
                                                    <div
                                                        className={`w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200 ${
                                                            comp.earsivEnabled ? 'translate-x-3.5' : 'translate-x-0'
                                                        }`}
                                                    />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Alt Bar: ID ve Aksiyonlar */}
                                        <div className="pt-2.5 border-t border-white/[0.06] flex justify-between items-center mt-auto">
                                            <span className="text-[10px] text-slate-500 font-mono font-bold truncate max-w-[110px]" title={comp.id}>
                                                {comp.id}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => {
                                                        setActiveCompanyId(comp.id);
                                                        localStorage.setItem('tir_current_company', comp.id);
                                                    }}
                                                    className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                                                        activeCompanyId === comp.id
                                                            ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                                                    }`}
                                                    title="Bu Şirketi Yönet"
                                                >
                                                    <LogIn size={11} />
                                                    {activeCompanyId === comp.id ? 'AKTİF' : 'Yönet'}
                                                </button>
                                                {comp.id !== 'inaner_logistics' && (
                                                    <>
                                                        <button 
                                                            onClick={() => { setEditingCompanyId(comp.docRefId); setEditForm({ name: comp.name, adminId: comp.adminId }); }} 
                                                            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer" 
                                                            title="Şirketi Düzenle"
                                                        >
                                                            <Edit2 size={12} />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteCompany(comp)} 
                                                            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer" 
                                                            title="Şirketi Sil"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ─── SİSTEM KULLANICILARI SEKMESİ ─── */}
                {activeTab === 'users' && (
                    <div className="bg-[#07090e] border border-white/[0.08] p-4 sm:p-5 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <Users size={14} className="text-slate-300" /> Tüm Sistem Kullanıcıları ve Şifreleri ({allUsers.length})
                            </h4>
                        </div>

                        {/* Mobil Kart Görünümü */}
                        <div className="grid grid-cols-1 md:hidden gap-2.5">
                            {allUsers.map(user => (
                                <div key={user.id} className="bg-white/[0.03] border border-white/[0.06] p-3.5 rounded-xl space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                                                <Users size={14} />
                                            </div>
                                            <div>
                                                <p className="font-bold text-white text-xs sm:text-sm">{user.username}</p>
                                                <p className="text-[10px] text-slate-400 font-mono">Şirket: {user.companyId || '-'}</p>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                                            user.role === 'super_admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                            : user.role === 'company_admin' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' 
                                            : user.role === 'şoför' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : 'bg-slate-500/10 text-slate-300 border-slate-500/20'
                                        }`}>
                                            {user.role}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                                        <div>
                                            {editingUserId === user.id ? (
                                                <div className="flex items-center gap-1">
                                                    <input 
                                                        type="password" 
                                                        value={editUserForm.password} 
                                                        onChange={e => setEditUserForm({password: e.target.value})} 
                                                        className="w-28 bg-[#0d1117] border border-white/10 text-white text-xs rounded-lg px-2 py-1 outline-none focus:border-slate-500" 
                                                        placeholder="Yeni Şifre" 
                                                    />
                                                    <button onClick={() => handleEditUserPassword(user.id)} className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 p-1.5 rounded-lg cursor-pointer"><Check size={12}/></button>
                                                    <button onClick={() => setEditingUserId(null)} className="bg-white/10 text-slate-300 p-1.5 rounded-lg cursor-pointer"><X size={12}/></button>
                                                </div>
                                            ) : (
                                                <span className="font-mono text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                                    *******
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={() => { setEditingUserId(user.id); setEditUserForm({password: ''}); }} 
                                                className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer" 
                                                title="Şifreyi Düzenle"
                                            >
                                                <Edit2 size={12} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteUser(user.id, user.username)} 
                                                className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer" 
                                                title="Kullanıcıyı Sil"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Masaüstü Tablo Görünümü */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-white/[0.06] text-xs text-slate-400">
                                        <th className="pb-3 pl-3 font-semibold">Kullanıcı Adı</th>
                                        <th className="pb-3 font-semibold">Rol</th>
                                        <th className="pb-3 font-semibold">Şirket ID</th>
                                        <th className="pb-3 font-semibold">Şifre</th>
                                        <th className="pb-3 text-right pr-3 font-semibold">İşlem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allUsers.map(user => (
                                        <tr key={user.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                                            <td className="py-3 pl-3 text-xs font-bold text-white">{user.username}</td>
                                            <td className="py-3 text-xs">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border inline-block ${
                                                    user.role === 'super_admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                                    : user.role === 'company_admin' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' 
                                                    : user.role === 'şoför' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                    : 'bg-slate-500/10 text-slate-300 border-slate-500/20'
                                                }`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="py-3 text-xs text-slate-400 font-mono">{user.companyId || '-'}</td>
                                            <td className="py-3">
                                                {editingUserId === user.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <input 
                                                            type="password" 
                                                            value={editUserForm.password} 
                                                            onChange={e => setEditUserForm({password: e.target.value})} 
                                                            className="w-28 bg-[#0d1117] border border-white/10 text-white text-xs rounded-lg px-2 py-1 outline-none focus:border-slate-500" 
                                                            placeholder="Yeni Şifre" 
                                                        />
                                                        <button onClick={() => handleEditUserPassword(user.id)} className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 p-1.5 rounded-lg cursor-pointer"><Check size={12}/></button>
                                                        <button onClick={() => setEditingUserId(null)} className="bg-white/10 text-slate-300 p-1.5 rounded-lg cursor-pointer"><X size={12}/></button>
                                                    </div>
                                                ) : (
                                                    <span className="font-mono text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                                        *******
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3 text-right pr-3">
                                                <div className="flex justify-end gap-1">
                                                    <button 
                                                        onClick={() => { setEditingUserId(user.id); setEditUserForm({password: ''}); }} 
                                                        className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer" 
                                                        title="Şifreyi Düzenle"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteUser(user.id, user.username)} 
                                                        className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer" 
                                                        title="Kullanıcıyı Sil"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ─── ADMIN LOGU SEKMESİ ─── */}
                {activeTab === 'logs' && (
                    <div className="animate-in fade-in duration-300">
                        <AdminLog />
                    </div>
                )}

            </div>
        </div>
    );
};

export default SuperAdmin;

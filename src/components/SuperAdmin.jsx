import React, { useState, useEffect } from 'react';
import { ShieldAlert, Building2, Plus, Server, Activity, Trash2, Key, Edit2, PauseCircle, PlayCircle, Users, Truck, Check, X, AlertOctagon, LogIn, Download, Database } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, writeBatch, where, getDocs } from 'firebase/firestore';
import { useCompany } from '../context/CompanyContext';

const SuperAdmin = () => {
    const { activeCompanyId, setActiveCompanyId } = useCompany();
    const [companies, setCompanies] = useState([]);;
    const [showForm, setShowForm] = useState(false);
    const [compName, setCompName] = useState('');
    const [compAdmin, setCompAdmin] = useState('');
    const [compPassword, setCompPassword] = useState('');

    const [activeTab, setActiveTab] = useState('companies'); // 'companies' or 'users'
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
                createdAt: new Date().toISOString()
            });

            // Şirket oluşturulunca, hemen o şirketin sahibini "approved_users" içine ekliyoruz
            await addDoc(collection(db, 'approved_users'), {
                username: compAdmin.toLowerCase().trim(),
                password: compPassword,
                role: 'company_admin',
                companyId: newCompanyId,
                createdAt: new Date().toISOString()
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
                await updateDoc(doc(db, 'companies', docRefId), {
                    status: currentStatus === 'active' ? 'suspended' : 'active'
                });
            } catch { /* empty */ }
        }
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
                } catch { /* empty */ }
            }
        }
    };

    const handleEditUserPassword = async (userId) => {
        if(editUserForm.password.length < 4) { alert("Şifre en az 4 karakter olmalı."); return; }
        try {
            await updateDoc(doc(db, 'approved_users', userId), { password: editUserForm.password });
            setEditingUserId(null);
        } catch { alert("Hata oluştu."); }
    };

    const handleDeleteUser = async (userId, username) => {
        if(window.confirm(`DİKKAT! ${username} kullanıcısını siliyorsunuz. Emin misiniz?`)) {
            try {
                await deleteDoc(doc(db, 'approved_users', userId));
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

        } catch (error) {
            console.error("Yedekleme hatası:", error);
            alert("Yedekleme sırasında bir hata oluştu.");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
            <div className="glass-panel p-6 border-l-4 border-l-indigo-500 mb-6 flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-bold flex items-center mb-1 text-[var(--text-primary)]">
                        <ShieldAlert className="mr-3 text-indigo-400" size={24} />
                        Super Admin Paneli (SaaS Yönetimi)
                    </h3>
                    <p className="text-[var(--text-secondary)] text-sm">
                        Sistemdeki tüm şirketleri görebilir ve yeni sistem müşterileri oluşturabilirsiniz.
                    </p>
                </div>
                <div className="flex bg-[var(--bg-panel-hover)] rounded-xl border border-[var(--border-color)] p-3 items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Server size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-[var(--text-secondary)] font-medium tracking-wide">TOPLAM MÜŞTERİ</p>
                        <p className="text-lg font-bold text-[var(--text-primary)] leading-none mt-1">{companies.length}</p>
                    </div>
                </div>
            </div>

            <div className="flex space-x-2 border-b border-[var(--border-color)] mb-6 pb-px">
                <button
                    onClick={() => setActiveTab('companies')}
                    className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${activeTab === 'companies' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                    <div className="flex items-center"><Building2 size={16} className="mr-2" /> Şirketler ({companies.length})</div>
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${activeTab === 'users' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                    <div className="flex items-center"><Users size={16} className="mr-2" /> Sistem Kullanıcıları ({allUsers.length})</div>
                </button>
            </div>

            {activeTab === 'companies' && (
                <>
                    <div className="flex justify-between items-center bg-[var(--bg-panel-hover)] p-4 rounded-xl border border-[var(--border-color)] mb-4">
                <div className="text-sm font-medium text-[var(--text-primary)] flex items-center">
                    <Activity size={16} className="text-fuchsia-400 mr-2" />
                    Aktif Müşteri Şirketleri Listesi
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleExportBackup} 
                        disabled={isExporting}
                        className={`bg-slate-700/50 hover:bg-slate-700 hover:text-white text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors border border-slate-600/50 tooltip-parent`}
                        title="Tüm Veritabanını Bilgisayara İndir (JSON)"
                    >
                        {isExporting ? (
                            <Activity size={16} className="mr-1.5 animate-pulse text-amber-400" /> 
                        ) : (
                            <Database size={16} className="mr-1.5 text-sky-400" />
                        )}
                        {isExporting ? 'Yedekleniyor...' : 'Veritabanı Yedeği Al'}
                    </button>

                    <button onClick={() => setShowForm(!showForm)} className="bg-indigo-500 hover:bg-indigo-600 text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors shadow-lg shadow-indigo-500/20">
                        <Plus size={16} className="mr-1.5" /> Yeni Müşteri (Şirket) Ekle
                    </button>
                </div>
            </div>

            {showForm && (
                <form onSubmit={handleAddCompany} className="glass-panel p-6 mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 border border-indigo-500/30">
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Şirket Adı (Müşteri Ünvanı)</label>
                        <input type="text" required value={compName} onChange={e => setCompName(e.target.value)} className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 text-sm focus:border-indigo-500 outline-none transition-colors" placeholder="Örn: X Lojistik A.Ş." />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Ana Yönetici (Şirket Sahibinin Kullanıcı Adı)</label>
                        <input type="text" required value={compAdmin} onChange={e => setCompAdmin(e.target.value)} className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 text-sm focus:border-indigo-500 outline-none transition-colors" placeholder="Örn: xlojistik_admin" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Yönetici Şifresi (Geçici Şifre)</label>
                        <div className="relative">
                            <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input type="text" required value={compPassword} onChange={e => setCompPassword(e.target.value)} className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg pl-9 pr-4 py-2.5 text-sm focus:border-indigo-500 outline-none transition-colors" placeholder="Örn: xLojistik123" />
                        </div>
                    </div>
                    <div className="flex items-end">
                        <button type="submit" className="w-full bg-indigo-500 text-[var(--text-primary)] hover:bg-indigo-600 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-lg">
                            Şirketi Sisteme Kaydet
                        </button>
                    </div>
                </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {companies.map(comp => {
                    const tCount = Math.max(stats.trucks?.[comp.id] || 0, stats.trucks?.[comp.docRefId] || 0);
                    const dCount = Math.max(stats.drivers?.[comp.id] || 0, stats.drivers?.[comp.docRefId] || 0);
                    const isEditing = editingCompanyId === comp.docRefId;

                    return (
                        <div key={comp.id} className={`glass-panel p-6 transition-all group flex flex-col ${comp.status === 'suspended' ? 'border-red-500/30 opacity-80' : 'border-[var(--border-color)] hover:border-indigo-500/50'}`}>
                            <div className="flex justify-between items-start mb-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-colors ${comp.status === 'suspended' ? 'bg-red-500/10 border-red-500/20' : 'bg-[var(--bg-panel-hover)] border-[var(--border-color)] group-hover:border-indigo-500/30'}`}>
                                    <Building2 size={24} className={comp.status === 'suspended' ? 'text-red-400' : 'text-indigo-400'} />
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <button onClick={() => handleToggleStatus(comp.docRefId, comp.status)} className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors ${comp.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`} title={comp.status === 'active' ? 'Şirketi Askıya Al' : 'Ticari Faaliyeti Sürdür'}>
                                        {comp.status === 'active' ? <><Check size={12} /> AKTİF</> : <><AlertOctagon size={12} /> ASKIYA ALINDI</>}
                                    </button>
                                </div>
                            </div>

                            {isEditing ? (
                                <div className="space-y-3 mb-4 flex-1">
                                    <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-md px-3 py-1.5 text-sm outline-none focus:border-indigo-500" placeholder="Şirket Adı" />
                                    <input type="text" value={editForm.adminId} onChange={e => setEditForm({ ...editForm, adminId: e.target.value })} className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-md px-3 py-1.5 text-sm outline-none focus:border-indigo-500" placeholder="Yönetici Kullanıcı Adı" />
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEditSave(comp.docRefId)} className="flex-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 py-1.5 rounded-md text-xs font-semibold transition border border-indigo-500/30">Kaydet</button>
                                        <button onClick={() => setEditingCompanyId(null)} className="flex-1 bg-slate-700/50 hover:bg-slate-700/80 text-[var(--text-primary)] py-1.5 rounded-md text-xs font-semibold transition border border-slate-600/50">İptal</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="mb-4 flex-1">
                                    <h4 className="text-xl font-bold tracking-tight text-[var(--text-primary)] mb-1.5 truncate" title={comp.name}>{comp.name}</h4>
                                    <p className="text-xs text-[var(--text-secondary)] font-medium flex items-center">
                                        Yönetici: <span className="ml-1 text-[var(--text-primary)] bg-[var(--bg-panel-hover)] px-2 py-0.5 rounded-md">{comp.adminId}</span>
                                    </p>
                                </div>
                            )}

                            {/* Stats */}
                            <div className="flex gap-2 mb-4">
                                <div className="flex-1 bg-[var(--bg-panel-hover)] border border-[var(--border-color)] rounded-lg py-2 flex flex-col items-center justify-center" title="Araç sayısı">
                                    <Truck size={14} className="text-slate-500 mb-1" />
                                    <span className="text-sm font-bold text-[var(--text-primary)] leading-none">{tCount}</span>
                                </div>
                                <div className="flex-1 bg-[var(--bg-panel-hover)] border border-[var(--border-color)] rounded-lg py-2 flex flex-col items-center justify-center" title="Şoför sayısı">
                                    <Users size={14} className="text-slate-500 mb-1" />
                                    <span className="text-sm font-bold text-[var(--text-primary)] leading-none">{dCount}</span>
                                </div>
                            </div>

                            <div className="pt-3 border-t border-[var(--border-color)] flex justify-between items-center mt-auto">
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                                    ID: {comp.id}
                                </div>
                                <div className="flex gap-1.5 items-center">
                                    <button
                                        onClick={() => {
                                            setActiveCompanyId(comp.id);
                                            localStorage.setItem('tir_current_company', comp.id);
                                        }}
                                        className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all ${activeCompanyId === comp.id
                                            ? 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30'
                                            : 'bg-[var(--bg-panel-hover)] text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 border border-[var(--border-color)]'
                                            }`}
                                        title="Bu Şirketi Yönet"
                                    >
                                        <LogIn size={10} />
                                        {activeCompanyId === comp.id ? 'AKTİF' : 'Yönet'}
                                    </button>
                                    {(comp.id !== 'inaner_logistics') && (
                                        <>
                                            <button onClick={() => { setEditingCompanyId(comp.docRefId); setEditForm({ name: comp.name, adminId: comp.adminId }); }} className="text-slate-500 hover:text-indigo-400 p-1.5 bg-[var(--bg-panel-hover)] hover:bg-indigo-500/10 rounded-md transition-colors" title="Şirketi Düzenle">
                                                <Edit2 size={13} />
                                            </button>
                                            <button onClick={() => handleDeleteCompany(comp)} className="text-slate-500 hover:text-red-400 p-1.5 bg-[var(--bg-panel-hover)] hover:bg-red-500/10 rounded-md transition-colors" title="Derinlemesine Sil (Cascade Delete)">
                                                <Trash2 size={13} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            </>)}

            {activeTab === 'users' && (
                <div className="glass-panel p-6">
                    <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Tüm Sistem Kullanıcıları ve Şifreleri</h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
                                    <th className="pb-3 pl-2">Kullanıcı Adı</th>
                                    <th className="pb-3">Rol</th>
                                    <th className="pb-3">Şirket ID</th>
                                    <th className="pb-3">Şifre (Açık Metin)</th>
                                    <th className="pb-3 text-right pr-2">İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allUsers.map(user => (
                                    <tr key={user.id} className="border-b border-[var(--border-color)]/50 hover:bg-[var(--bg-panel-hover)] transition-colors">
                                        <td className="py-3 pl-2 text-sm font-semibold text-[var(--text-primary)]">{user.username}</td>
                                        <td className="py-3 text-xs">
                                            <span className={`px-2 py-1 rounded-md bg-opacity-20 flex items-center w-max ${
                                                user.role === 'company_admin' ? 'bg-indigo-500 text-indigo-400' 
                                                : user.role === 'şoför' ? 'bg-emerald-500 text-emerald-400'
                                                : 'bg-slate-500 text-slate-400'
                                            }`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="py-3 text-xs text-slate-400 font-mono">{user.companyId || '-'}</td>
                                        <td className="py-3">
                                            {editingUserId === user.id ? (
                                                <div className="flex items-center gap-1">
                                                    <input type="text" value={editUserForm.password} onChange={e => setEditUserForm({password: e.target.value})} className="w-24 bg-[var(--bg-base)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs rounded-md px-2 py-1 outline-none" />
                                                    <button onClick={() => handleEditUserPassword(user.id)} className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 p-1 rounded-md"><Check size={14}/></button>
                                                    <button onClick={() => setEditingUserId(null)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 p-1 rounded-md"><X size={14}/></button>
                                                </div>
                                            ) : (
                                                <span className="font-mono text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20">
                                                    {user.password || 'BİLİNMİYOR'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 text-right pr-2">
                                            <div className="flex justify-end gap-1">
                                                <button onClick={() => { setEditingUserId(user.id); setEditUserForm({password: user.password}); }} className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/20 rounded-md transition" title="Şifreyi Düzenle"><Edit2 size={14}/></button>
                                                <button onClick={() => handleDeleteUser(user.id, user.username)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded-md transition" title="Kullanıcıyı Sil"><Trash2 size={14}/></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

        </div>
    );
};

export default SuperAdmin;

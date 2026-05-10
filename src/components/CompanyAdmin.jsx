import React, { useState, useContext } from 'react';
import { useCompany } from '../context/CompanyContext';
import { useTruck } from '../context/TruckContext';
import { DataContext } from '../context/DataContext';
import { Building2, Truck, Users, Plus, Edit2, Trash2, Check, X, AlertTriangle, Key, BarChart3 } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import VehicleAnalysis from './map/VehicleAnalysis';

const CompanyAdmin = () => {
    const { activeCompanyId, companyData } = useCompany();
    const { trucks, activeTruckId, setActiveTruckId } = useTruck();
    const { approvedUsers, pendingUsers, approveUser, rejectUser } = useContext(DataContext);

    const [activeTab, setActiveTab] = useState('trucks');

    // Yeni: Kullanıcı Silme Onay Modalı
    const [userToDelete, setUserToDelete] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Yeni: Şifre Düzenleme
    const [editingUserId, setEditingUserId] = useState(null);
    const [newUserPassword, setNewUserPassword] = useState('');
    const { editUser } = useContext(DataContext);


    // Truck Form
    const [showTruckForm, setShowTruckForm] = useState(false);
    const [truckPlate, setTruckPlate] = useState('');
    const [truckBrand, setTruckBrand] = useState('');

    const [editingTruckId, setEditingTruckId] = useState(null);
    const [editTruckForm, setEditTruckForm] = useState({ plate: '', brand: '', status: 'active' });

    const handleAddTruck = async (e) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, 'trucks'), {
                companyId: activeCompanyId,
                plate: truckPlate,
                brand: truckBrand,
                status: 'active',
                createdAt: new Date().toISOString()
            });
            setTruckPlate('');
            setTruckBrand('');
            setShowTruckForm(false);
        } catch { /* empty */ }
    };

    const handleEditSaveTruck = async (truckId) => {
        try {
            await updateDoc(doc(db, 'trucks', truckId), {
                plate: editTruckForm.plate.toUpperCase(),
                brand: editTruckForm.brand,
                status: editTruckForm.status
            });
            setEditingTruckId(null);
        } catch { /* empty */ }
    };

    const handleDeleteTruck = async (truckId, plate) => {
        if (window.confirm(`${plate} plakalı aracı tamamen silmek istediğinize emin misiniz? (Geçmiş veriler askıda kalabilir)`)) {
            try {
                await deleteDoc(doc(db, 'trucks', truckId));
            } catch { /* empty */ }
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="glass-panel p-6 border-l-4 border-l-indigo-500 flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-bold flex items-center mb-1 text-[var(--text-primary)]">
                        <Building2 className="mr-3 text-indigo-400" size={24} />
                        Şirket Yönetimi: {companyData?.name || 'Yükleniyor...'}
                    </h3>
                    <p className="text-[var(--text-secondary)] text-sm">
                        Şirketinize ait araçları ve şoförleri buradan yönetebilirsiniz.
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-2 border-b border-[var(--border-color)] pb-px">
                <button
                    onClick={() => setActiveTab('trucks')}
                    className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${activeTab === 'trucks' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                    <div className="flex items-center"><Truck size={16} className="mr-2" /> Araçlar ({trucks.length})</div>
                </button>
                <button
                    onClick={() => setActiveTab('drivers')}
                    className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${activeTab === 'drivers' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                    <div className="flex items-center"><Users size={16} className="mr-2" /> Şoförler</div>
                </button>
                <button
                    onClick={() => setActiveTab('analysis')}
                    className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${activeTab === 'analysis' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                    <div className="flex items-center"><BarChart3 size={16} className="mr-2" /> Araç Analiz</div>
                </button>
            </div>

            {/* Trucks Tab */}
            {activeTab === 'trucks' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-[var(--bg-panel-hover)] p-4 rounded-xl border border-[var(--border-color)]">
                        <div className="text-sm text-[var(--text-primary)]">Sisteme kayıtlı toplam <strong>{trucks.length}</strong> araç bulunuyor.</div>
                        <button onClick={() => setShowTruckForm(!showTruckForm)} className="bg-indigo-500 hover:bg-indigo-600 text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors">
                            <Plus size={16} className="mr-1.5" /> Yeni Araç Ekle
                        </button>
                    </div>

                    {showTruckForm && (
                        <form onSubmit={handleAddTruck} className="glass-panel p-5 grid grid-cols-1 md:grid-cols-3 gap-4 border border-indigo-500/20">
                            <div>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Plaka</label>
                                <input type="text" required value={truckPlate} onChange={e => setTruckPlate(e.target.value.toUpperCase())} className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none" placeholder="Örn: 34 ABC 123" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Marka & Model</label>
                                <input type="text" required value={truckBrand} onChange={e => setTruckBrand(e.target.value)} className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none" placeholder="Örn: Mercedes Actros" />
                            </div>
                            <div className="flex items-end">
                                <button type="submit" className="w-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                                    Kaydet
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {trucks.map(truck => (
                            <div key={truck.id} className={`glass-panel p-5 relative group transition-all ${activeTruckId === truck.id ? 'border-indigo-500 bg-indigo-500/5' : 'border-[var(--border-color)] hover:border-slate-600'}`}>
                                <div className="flex justify-between items-start mb-3">
                                    <div className="w-10 h-10 rounded-lg bg-[var(--bg-panel-hover)] flex items-center justify-center border border-[var(--border-color)]">
                                        <Truck size={20} className={activeTruckId === truck.id ? 'text-indigo-400' : 'text-[var(--text-secondary)]'} />
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        activeTruckId === truck.id
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : truck.status === 'inactive'
                                                ? 'bg-red-500/10 text-red-400'
                                                : truck.status === 'maintenance'
                                                    ? 'bg-amber-500/10 text-amber-400'
                                                    : 'bg-emerald-500/10 text-emerald-400'
                                    }`}>
                                        {activeTruckId === truck.id
                                            ? 'AKTİF'
                                            : truck.status === 'inactive'
                                                ? 'PASİF'
                                                : truck.status === 'maintenance'
                                                    ? 'BAKIMDA'
                                                    : 'AKTİF'
                                        }
                                    </span>
                                </div>

                                {editingTruckId === truck.id ? (
                                    <div className="space-y-3 mb-4">
                                        <input type="text" value={editTruckForm.plate} onChange={e => setEditTruckForm({ ...editTruckForm, plate: e.target.value })} className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-md px-3 py-1.5 text-sm outline-none focus:border-indigo-500" placeholder="Plaka" />
                                        <input type="text" value={editTruckForm.brand} onChange={e => setEditTruckForm({ ...editTruckForm, brand: e.target.value })} className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-md px-3 py-1.5 text-sm outline-none focus:border-indigo-500" placeholder="Marka" />
                                        <select value={editTruckForm.status} onChange={e => setEditTruckForm({ ...editTruckForm, status: e.target.value })} className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-md px-3 py-1.5 text-sm outline-none focus:border-indigo-500">
                                            <option value="active">Aktif (Çalışıyor)</option>
                                            <option value="inactive">Pasif (Yatıyor)</option>
                                            <option value="maintenance">Bakımda</option>
                                        </select>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleEditSaveTruck(truck.id)} className="flex-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 py-1.5 rounded-md text-xs font-semibold transition border border-indigo-500/30 flex justify-center items-center gap-1">
                                                <Check size={12} /> Kaydet
                                            </button>
                                            <button onClick={() => setEditingTruckId(null)} className="flex-1 bg-slate-700/50 hover:bg-slate-700/80 text-[var(--text-primary)] py-1.5 rounded-md text-xs font-semibold transition border border-slate-600/50 flex justify-center items-center gap-1">
                                                <X size={12} /> İptal
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mb-4">
                                        <h4 className="text-xl font-bold tracking-tight text-[var(--text-primary)] mb-1">{truck.plate}</h4>
                                        <p className="text-xs text-[var(--text-secondary)] font-medium">{truck.brand}</p>
                                    </div>
                                )}

                                <div className="mt-auto pt-4 border-t border-[var(--border-color)] flex justify-between items-center">
                                    <button
                                        onClick={() => setActiveTruckId(truck.id)}
                                        className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTruckId === truck.id ? 'bg-indigo-500 text-[var(--text-primary)]' : 'bg-[var(--bg-panel-hover)] text-[var(--text-primary)] hover:bg-slate-700'}`}
                                    >
                                        {activeTruckId === truck.id ? 'Şu An Seçili' : 'Bu Araca Geç'}
                                    </button>
                                    <div className="flex gap-1.5 ml-3">
                                        <button onClick={() => { setEditingTruckId(truck.id); setEditTruckForm({ plate: truck.plate, brand: truck.brand, status: truck.status || 'active' }); }} className="text-slate-500 hover:text-indigo-400 p-1.5 bg-[var(--bg-panel-hover)] hover:bg-indigo-500/10 rounded-md transition-colors" title="Düzenle">
                                            <Edit2 size={13} />
                                        </button>
                                        <button onClick={() => handleDeleteTruck(truck.id, truck.plate)} className="text-slate-500 hover:text-red-400 p-1.5 bg-[var(--bg-panel-hover)] hover:bg-red-500/10 rounded-md transition-colors" title="Aracı Sil">
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Drivers Tab */}
            {activeTab === 'drivers' && (
                <div className="space-y-6">
                    {/* Bekleyen Başvurular */}
                    {pendingUsers.length > 0 && (
                        <div className="glass-panel p-5 border-l-4 border-l-amber-500">
                            <h4 className="text-sm font-bold text-amber-400 mb-3">Onay Bekleyen Şoför Başvuruları ({pendingUsers.length})</h4>
                            <div className="space-y-3">
                                {pendingUsers.map(user => (
                                    <div key={user.id} className="flex items-center justify-between bg-[var(--bg-panel-hover)] p-3 rounded-lg border border-[var(--border-color)]">
                                        <div>
                                            <p className="font-medium text-[var(--text-primary)]">{user.username}</p>
                                            <p className="text-xs text-slate-500">Kayıt: {new Date(user.requestedAt).toLocaleDateString('tr-TR')}</p>
                                        </div>
                                        <div className="flex space-x-2">
                                            <button onClick={() => approveUser(user.id, 'şoför')} className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 p-2 rounded-md transition-colors" title="Şoför Olarak Onayla">
                                                <Check size={16} />
                                            </button>
                                            <button onClick={() => rejectUser(user.id)} className="bg-red-500/10 text-red-400 hover:bg-red-500/20 p-2 rounded-md transition-colors" title="Reddet">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Aktif Şoförler */}
                    <div className="glass-panel p-5">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-sm font-bold text-[var(--text-primary)]">Aktif Şoförler</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {approvedUsers.filter(u => u.role === 'şoför' || u.role === 'user').map(driver => (
                                <div key={driver.id} className="bg-[var(--bg-panel-hover)] p-4 rounded-xl border border-[var(--border-color)] flex items-center space-x-4">
                                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-[var(--text-primary)] flex-shrink-0">
                                        <Users size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-[var(--text-primary)] truncate">{driver.username}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full inline-block">
                                                ŞOFÖR
                                            </span>
                                            {editingUserId !== driver.id && (
                                                <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full flex items-center font-mono cursor-pointer hover:bg-slate-600 transition"
                                                      onClick={() => { setEditingUserId(driver.id); setNewUserPassword(driver.password); }}
                                                      title="Şifreyi Değiştirmek için Tıkla">
                                                    <Key size={10} className="mr-1" /> {driver.password}
                                                </span>
                                            )}
                                        </div>
                                        {editingUserId === driver.id && (
                                            <div className="mt-2 flex gap-1">
                                                <input type="text" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)}
                                                    className="w-full bg-[var(--bg-base)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs rounded-md px-2 py-1 outline-none" placeholder="Yeni Şifre" />
                                                <button onClick={() => { if(newUserPassword.length>3){ editUser(driver.id, {password: newUserPassword}); setEditingUserId(null); }else{ alert('Şifre en az 4 karakter olmalı!'); } }} className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 p-1 rounded-md"><Check size={14}/></button>
                                                <button onClick={() => setEditingUserId(null)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 p-1 rounded-md"><X size={14}/></button>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setUserToDelete(driver);
                                            setIsDeleteModalOpen(true);
                                        }}
                                        className="text-slate-500 hover:text-red-400 p-2 transition-colors"
                                        title="Şoförü Sil"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                            {approvedUsers.filter(u => u.role === 'şoför' || u.role === 'user').length === 0 && (
                                <div className="col-span-full text-center py-6 text-slate-500 text-sm">
                                    Henüz kayıtlı şoför bulunmuyor.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Analysis Tab */}
            {activeTab === 'analysis' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <VehicleAnalysis activeTruckId={activeTruckId} />
                </div>
            )}

            {/* Kullanıcı Silme Onay Modalı */}
            {isDeleteModalOpen && userToDelete && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[var(--bg-base)] backdrop-blur-md">
                    <div className="glass-panel w-full max-w-sm p-6 relative animate-in zoom-in-95 duration-200">
                        <button onClick={() => { setIsDeleteModalOpen(false); setUserToDelete(null); }} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                            <AlertTriangle className="text-red-500" /> Şoförü Sil
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] mb-6">
                            <strong className="text-[var(--text-primary)] uppercase">{userToDelete.username}</strong> isimli şoförü şirketinizden tamamen silmek istediğinize emin misiniz?
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <button onClick={() => { setIsDeleteModalOpen(false); setUserToDelete(null); }} className="w-full sm:flex-1 bg-[var(--bg-panel-hover)] hover:bg-slate-700 text-[var(--text-primary)] py-2.5 rounded-lg text-sm font-semibold transition border border-[var(--border-color)]">
                                İptal Et
                            </button>
                            <button onClick={async () => {
                                try {
                                    await deleteDoc(doc(db, 'approved_users', userToDelete.id));
                                    setIsDeleteModalOpen(false);
                                    setUserToDelete(null);
                                } catch {
                                    
                                    alert("Kullanıcı silinirken bir hata oluştu.");
                                }
                            }} className="w-full sm:flex-1 bg-red-600 hover:bg-red-500 text-[var(--text-primary)] py-2.5 rounded-lg text-sm font-semibold transition shadow-lg shadow-red-500/20">
                                Evet, Tamamen Sil
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CompanyAdmin;

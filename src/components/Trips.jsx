import React, { useState, useContext, useEffect, useRef } from 'react';
import { Plus, Search, MapPin, X, ChevronDown, Check, Trash2, Paperclip, FileText, Pencil, StickyNote, Truck } from 'lucide-react';
import { DataContext } from '../context/DataContext';
import FileUpload from './FileUpload';

const Trips = () => {
    const { trips, addTrip, deleteTrip, editTrip, routes, addRoute, updateRoute, deleteRoute } = useContext(DataContext);
    const [editingTrip, setEditingTrip] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [viewFiles, setViewFiles] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isRouteManagerOpen, setIsRouteManagerOpen] = useState(false);
    const [editingRoute, setEditingRoute] = useState(null);

    // Rota Seçim State'leri
    const [useSavedRoute, setUseSavedRoute] = useState(true);
    const [selectedRouteId, setSelectedRouteId] = useState('');
    const [saveNewRoute, setSaveNewRoute] = useState(false);

    // Düzenleme Modalı için Rota Seçim State'leri
    const [editUseSavedRoute, setEditUseSavedRoute] = useState(true);
    const [editSelectedRouteId, setEditSelectedRouteId] = useState('');
    const [editSaveNewRoute, setEditSaveNewRoute] = useState(false);

    // Başarılı Rota Kaydetme State'leri
    const [saveRouteSuccess, setSaveRouteSuccess] = useState(false);
    const [editSaveRouteSuccess, setEditSaveRouteSuccess] = useState(false);

    // Ortak Rota Seçici Modal State'leri
    const [isRouteSelectorOpen, setIsRouteSelectorOpen] = useState(false);
    const [routeSelectorMode, setRouteSelectorMode] = useState('add'); // 'add' veya 'edit'
    const [routeSearchTerm, setRouteSearchTerm] = useState('');

    const [showExtra, setShowExtra] = useState(false);
    const [editShowExtra, setEditShowExtra] = useState(false);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        from: '',
        to: '',
        km: '',
        tonnage: '',
        notes: '',
        files: []
    });

    // Kayıtlı rota seçildiğinde formu doldur (Yeni Ekle)
    useEffect(() => {
        if (useSavedRoute && selectedRouteId) {
            const route = routes.find(r => r.id === parseInt(selectedRouteId));
            if (route) {
                // eslint-disable-next-line
                setFormData(prev => ({
                    ...prev,
                    from: route.from,
                    to: route.to,
                    km: route.km || ''
                }));
            }
        }
    }, [selectedRouteId, useSavedRoute, routes]);

    // Kayıtlı rota seçildiğinde formu doldur (Düzenle)
    useEffect(() => {
        if (editUseSavedRoute && editSelectedRouteId) {
            const route = routes.find(r => r.id === parseInt(editSelectedRouteId));
            if (route) {
                setEditForm(prev => ({
                    ...prev,
                    from: route.from,
                    to: route.to,
                    km: route.km || ''
                }));
            }
        }
    }, [editSelectedRouteId, editUseSavedRoute, routes]);

    // Formlardaki veri değiştiğinde başarılı kayıt (Kaydedildi) buton durumlarını sıfırla
    useEffect(() => {
        setSaveRouteSuccess(false);
    }, [formData.from, formData.to, formData.km]);

    useEffect(() => {
        setEditSaveRouteSuccess(false);
    }, [editForm.from, editForm.to, editForm.km]);

    // Modallar açıkken arkaplan scroll'unu engelle
    useEffect(() => {
        if (isRouteSelectorOpen || isModalOpen || editingTrip || isRouteManagerOpen || viewFiles) {
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        }
        return () => { 
            document.body.style.overflow = ''; 
            document.documentElement.style.overflow = '';
        };
    }, [isRouteSelectorOpen, isModalOpen, editingTrip, isRouteManagerOpen, viewFiles]);

    // (Önceki Dropdown click-outside temizlendi, modal mantığına geçildi)

    // Akıllı Sıralama: En çok kullanılan rotaları belirle
    const sortedRoutes = React.useMemo(() => {
        if (!routes || !trips) return [];

        // Her rotanın kullanım sayısını hesapla
        const frequencyMap = {};
        trips.forEach(trip => {
            if (trip.deleted) return;
            const key = `${trip.from.trim().toLowerCase()}-${trip.to.trim().toLowerCase()}`;
            frequencyMap[key] = (frequencyMap[key] || 0) + 1;
        });

        // Rotaları frekansa göre sırala
        return [...routes].sort((a, b) => {
            const freqA = frequencyMap[`${a.from.trim().toLowerCase()}-${a.to.trim().toLowerCase()}`] || 0;
            const freqB = frequencyMap[`${b.from.trim().toLowerCase()}-${b.to.trim().toLowerCase()}`] || 0;
            
            // Önce kullanım sayısına göre (büyükten küçüğe)
            if (freqB !== freqA) return freqB - freqA;
            
            // Kullanım sayıları eşitse, isme göre (A-Z)
            return a.from.localeCompare(b.from);
        });
    }, [routes, trips]);

    const openEditModal = (trip) => {
        setEditingTrip(trip);
        setEditForm({
            date: trip.date,
            from: trip.from,
            to: trip.to,
            km: trip.km || '',
            tonnage: trip.tonnage,
            status: trip.status || 'Fatura Bekliyor',
            notes: trip.notes || '',
            files: trip.files || []
        });

        // Rota seçimini sıfırla/başlat
        setEditUseSavedRoute(true);
        setEditSelectedRouteId('');
        setEditSaveNewRoute(false);
    };



    const handleManualAdd = (e) => {
        e.preventDefault();

        const kmValue = parseInt(formData.km) || 0;

        // Yeni rotayı kaydetme isteği varsa
        if (!useSavedRoute && saveNewRoute && formData.from && formData.to) {
            addRoute({
                from: formData.from,
                to: formData.to,
                km: kmValue
            });
        }

        addTrip({
            date: formData.date,
            from: formData.from,
            to: formData.to,
            km: kmValue,
            tonnage: parseFloat(formData.tonnage),
            price: 0,
            status: 'Fatura Bekliyor',
            notes: formData.notes,
            files: formData.files
        });

        setIsModalOpen(false);
        resetForm();
    };

    const handleSaveRouteOnly = async () => {
        if (!formData.from || !formData.to) {
            alert("Lütfen en azından Nereden ve Nereye bilgilerini giriniz.");
            return;
        }
        await addRoute({
            from: formData.from,
            to: formData.to,
            km: parseInt(formData.km) || 0
        });
        setSaveNewRoute(false);
        setSaveRouteSuccess(true);
    };

    const handleEditSaveRouteOnly = async () => {
        if (!editForm.from || !editForm.to) {
            alert("Lütfen en azından Nereden ve Nereye bilgilerini giriniz.");
            return;
        }
        await addRoute({
            from: editForm.from,
            to: editForm.to,
            km: parseInt(editForm.km) || 0
        });
        setEditSaveNewRoute(false);
        setEditSaveRouteSuccess(true);
    };

    const handleEdit = async () => {
        const kmValue = parseInt(editForm.km) || 0;

        // Yeni rotayı kaydetme isteği varsa
        if (!editUseSavedRoute && editSaveNewRoute && editForm.from && editForm.to) {
            await addRoute({
                from: editForm.from,
                to: editForm.to,
                km: kmValue
            });
        }

        await editTrip(editingTrip.id, {
            date: editForm.date,
            from: editForm.from,
            to: editForm.to,
            km: kmValue,
            tonnage: parseFloat(editForm.tonnage),
            status: editForm.status,
            notes: editForm.notes,
            files: editForm.files
        });
        setEditingTrip(null);
    };

    const handleDelete = (id) => {
        deleteTrip(id);
    };

    const resetForm = () => {
        setFormData({
            date: new Date().toISOString().split('T')[0],
            from: '',
            to: '',
            km: '',
            tonnage: '',
            notes: '',
            files: []
        });
        setSelectedRouteId('');
        setUseSavedRoute(true);
        setSaveNewRoute(false);
    };

    const filteredTrips = trips.filter(trip =>
        !trip.deleted && (
            trip.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
            trip.to.toLowerCase().includes(searchTerm.toLowerCase()) ||
            trip.date.includes(searchTerm)
        )
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500 relative pb-ios-nav">

            {/* Üst Kısım / Filtreleme */}
            <div className="glass-panel p-4 flex flex-col md:flex-row justify-between items-center gap-4 mb-2 isolate overflow-hidden" style={{ contain: 'paint', willChange: 'transform', transform: 'translateZ(0)' }}>
                <div className="relative w-full md:w-96 flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" size={16} />
                    <input
                        type="text"
                        placeholder="Sefer ara (Tarih, Güzergah)..."
                        className="w-full glass-input pr-4 py-2"
                        style={{ paddingLeft: '2.5rem' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex flex-col md:flex-row w-full md:w-auto gap-3">
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-full md:w-auto bg-brand-600 hover:bg-brand-500 text-[var(--text-primary)] px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center whitespace-nowrap"
                    >
                        <Plus size={18} className="mr-2" />
                        Sefer Ekle
                    </button>
                </div>
            </div>

            {/* Seferler Tablosu - Masaüstü */}
            <div className="glass-panel overflow-hidden" style={{ background: 'var(--bg-base)' }}>
                <div className="overflow-x-auto -mx-0 md:mx-0">
                    <table className="w-full text-left border-collapse hidden md:table" style={{ minWidth: '500px' }}>
                        <thead>
                            <tr className="bg-white/5 border-b border-[var(--border-color)] text-[var(--text-secondary)] text-xs uppercase tracking-wide">
                                <th className="p-3 pl-4 font-semibold whitespace-nowrap">Tarih</th>
                                <th className="p-3 font-semibold whitespace-nowrap">Güzergah</th>
                                <th className="p-3 font-semibold text-center whitespace-nowrap">Tonaj</th>
                                <th className="p-3 font-semibold text-center whitespace-nowrap">Durum</th>
                                <th className="p-3 font-semibold text-center whitespace-nowrap w-16"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredTrips.length > 0 ? (
                                filteredTrips.map((trip) => (
                                    <tr key={trip.id} className="hover:bg-white/5 group">
                                        <td className="p-3 pl-4 whitespace-nowrap">
                                            <div className="text-[var(--text-primary)] text-sm font-medium">{new Date(trip.date).toLocaleDateString('tr-TR')}</div>
                                        </td>
                                        <td className="p-3">
                                            <div className="text-sm font-semibold text-[var(--text-primary)] whitespace-nowrap">
                                                {trip.from} <span className="text-brand-400 mx-1">→</span> {trip.to}
                                            </div>
                                            {trip.km > 0 && (
                                                <div className="text-xs text-slate-500 mt-0.5 whitespace-nowrap">{trip.km} km</div>
                                            )}
                                            {trip.notes && (
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <StickyNote size={9} className="text-slate-500" />
                                                    <span className="text-xs text-slate-500 truncate max-w-[200px]">{trip.notes}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3 text-center whitespace-nowrap">
                                            <span className="text-[var(--text-primary)] font-medium text-sm">{trip.tonnage} t</span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${trip.status === 'Faturalandı' || trip.status === 'Fatura Kesildi'
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                }`}>
                                                {trip.status}
                                            </span>
                                        </td>
                                        <td className="p-2 text-center">
                                            <div className="flex items-center justify-center gap-0.5">
                                                {trip.files && trip.files.length > 0 && (
                                                    <button onClick={() => setViewFiles({ title: `${trip.from} → ${trip.to}`, files: trip.files })}
                                                        title={`${trip.files.length} ek`}
                                                        className="p-1.5 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-brand-500/10">
                                                        <Paperclip size={14} />
                                                    </button>
                                                )}
                                                <button onClick={() => openEditModal(trip)}
                                                    className="p-1.5 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-brand-500/10">
                                                    <Pencil size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="p-8 text-center text-slate-500">
                                        <MapPin size={32} className="mx-auto mb-3 opacity-30" />
                                        <p className="text-lg font-medium text-[var(--text-secondary)]">Henüz Kayıtlı Sefer Yok</p>
                                        <p className="text-sm mt-1">Sisteme yeni bir sefer eklediğinizde burada listelenecektir.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {/* Mobil Kart Görünümü */}
                    <div className="md:hidden flex flex-col gap-3 p-2">
                        {filteredTrips.length > 0 ? (
                            filteredTrips.map((trip) => (
                                <div key={trip.id} className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl p-4 shadow-sm relative overflow-hidden">
                                    {/* Satır 1: Tarih | Durum Etiketi | Ekler/Duzenle */}
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="text-[10px] text-slate-500 font-medium">{new Date(trip.date).toLocaleDateString('tr-TR')}</div>
                                        <div className="flex items-center gap-1.5">
                                            <div className={`px-1 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase whitespace-nowrap
                                                ${trip.status === 'Faturalandı' || trip.status === 'Fatura Kesildi'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                                                {trip.status}
                                            </div>
                                            {trip.files && trip.files.length > 0 && (
                                                <button onClick={() => setViewFiles({ title: `${trip.from} → ${trip.to}`, files: trip.files })}
                                                    className="p-1 bg-brand-500/10 hover:bg-brand-500/20 rounded-md text-brand-400 transition-colors flex items-center">
                                                    <Paperclip size={12} />
                                                </button>
                                            )}
                                            <button onClick={() => openEditModal(trip)}
                                                className="p-1 bg-white/5 hover:bg-white/10 rounded-md text-[var(--text-secondary)] hover:text-brand-400 transition-colors">
                                                <Pencil size={13} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Satır 2: Tam genislikte Guzergah */}
                                    <div className="font-bold text-[var(--text-primary)] text-[13px] leading-snug mb-1 break-words">
                                        {trip.from} <span className="text-brand-400">→</span> {trip.to}
                                    </div>

                                    {/* Not gösterimi */}
                                    {trip.notes && (
                                        <div className="flex items-center gap-1 mb-2">
                                            <StickyNote size={9} className="text-slate-500" />
                                            <span className="text-[10px] text-slate-500 truncate">{trip.notes}</span>
                                        </div>
                                    )}

                                    {/* Satır 3: Tonaj */}
                                    <div className="flex bg-white/5 rounded-xl p-2.5 items-center mt-1">
                                        <div className="flex flex-col">
                                            <div className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">TONAJ</div>
                                            <div className="text-[var(--text-primary)] font-medium text-xs">{trip.tonnage} t</div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center text-slate-500">
                                <Truck size={32} className="mx-auto mb-3 opacity-30" />
                                <p className="text-lg font-medium text-[var(--text-secondary)]">Henüz Kayıtlı Sefer Yok</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>


            {/* ─── DÜZENLE MODAL ─── */}
            {editingTrip && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-panel w-full max-w-lg p-6 relative animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
                        <button onClick={() => setEditingTrip(null)} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-5 flex items-center gap-2">
                            <Pencil size={16} className="text-brand-400" /> Seferi Düzenle
                        </h3>
                        <div className="space-y-4">
                            {/* Tarih */}
                            <div>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Tarih</label>
                                <input type="date" className="w-full glass-input px-3 py-2 text-sm"
                                    value={editForm.date}
                                    onChange={e => setEditForm({ ...editForm, date: e.target.value })} />
                            </div>
                            {/* Güzergah Belirleme */}
                            <div className="p-4 bg-brand-500/5 border border-brand-500/20 rounded-2xl space-y-4 shadow-lg shadow-brand-500/5 transition-all duration-300 border-dashed md:border-solid">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-brand-400 uppercase tracking-widest flex items-center gap-2">
                                        <MapPin size={14} /> Güzergah Belirleme
                                    </label>
                                    <div className="flex items-center space-x-2 bg-[var(--bg-panel-hover)] p-1 rounded-lg">
                                        <button
                                            type="button"
                                            className={`px-3 py-1 text-xs font-medium rounded ${editUseSavedRoute ? 'bg-brand-500 text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
                                            onClick={() => setEditUseSavedRoute(true)}
                                        >
                                            Kayıtlı Rota
                                        </button>
                                        <button
                                            type="button"
                                            className={`px-3 py-1 text-xs font-medium rounded ${!editUseSavedRoute ? 'bg-brand-500 text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
                                            onClick={() => {
                                                setEditUseSavedRoute(false);
                                                setEditSelectedRouteId('');
                                                setEditForm(f => ({ ...f, from: '', to: '', km: '', price: '' }));
                                            }}
                                        >
                                            Yeni Rota
                                        </button>
                                        <div className="w-[1px] h-3 bg-white/10 mx-1"></div>
                                        <button
                                            type="button"
                                            className="px-2 py-1 text-[10px] font-bold text-brand-400 hover:text-brand-300 uppercase tracking-tighter"
                                            onClick={() => setIsRouteManagerOpen(true)}
                                        >
                                            Yönet
                                        </button>
                                    </div>
                                </div>

                                {editUseSavedRoute ? (
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRouteSelectorMode('edit');
                                                setIsRouteSelectorOpen(true);
                                            }}
                                            className="w-full glass-input px-4 py-3 flex items-center justify-between text-sm group hover:border-brand-500/40 hover:bg-brand-500/5 transition-all"
                                        >
                                            <span className={editSelectedRouteId ? "text-[var(--text-primary)] font-medium" : "text-slate-500"}>
                                                {editSelectedRouteId
                                                    ? `${routes.find(r => r.id === parseInt(editSelectedRouteId))?.from} ➔ ${routes.find(r => r.id === parseInt(editSelectedRouteId))?.to}`
                                                    : "Kayıtlı Rotalarımdan Seçin..."}
                                            </span>
                                            <div className="flex items-center">
                                                <span className="text-[10px] uppercase font-bold text-brand-500 bg-brand-500/10 px-2 py-1 rounded">SEÇ</span>
                                            </div>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-[var(--text-secondary)] mb-1">Yükleme (Nereden)</label>
                                                <input
                                                    type="text"
                                                    required={!editUseSavedRoute}
                                                    placeholder="Örn: Ankara"
                                                    className="w-full glass-input px-3 py-2 text-sm"
                                                    value={editForm.from}
                                                    onChange={(e) => setEditForm({ ...editForm, from: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-[var(--text-secondary)] mb-1">Boşaltma (Nereye)</label>
                                                <input
                                                    type="text"
                                                    required={!editUseSavedRoute}
                                                    placeholder="Örn: İstanbul"
                                                    className="w-full glass-input px-3 py-2 text-sm"
                                                    value={editForm.to}
                                                    onChange={(e) => setEditForm({ ...editForm, to: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-[var(--text-secondary)] mb-1">Mesafe (KM)</label>
                                            <input
                                                type="number"
                                                required={!editUseSavedRoute}
                                                placeholder="Örn: 215"
                                                className="w-full glass-input px-3 py-2 text-sm"
                                                value={editForm.km}
                                                onChange={(e) => setEditForm({ ...editForm, km: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between border-t border-white/5 pt-3">
                                            <div className="flex items-center gap-2">
                                                <label className="flex items-center space-x-2 text-sm text-[var(--text-primary)] cursor-pointer whitespace-nowrap">
                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${editSaveNewRoute ? 'bg-brand-500 border-brand-500' : 'border-slate-500'}`}>
                                                        {editSaveNewRoute && <Check size={14} className="text-[var(--text-primary)]" />}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={editSaveNewRoute}
                                                        onChange={(e) => setEditSaveNewRoute(e.target.checked)}
                                                    />
                                                    <span className="text-xs">Hafızaya Al</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={handleEditSaveRouteOnly}
                                                    disabled={!editForm.from || !editForm.to || editSaveRouteSuccess}
                                                    className={`px-2 py-1 flex items-center gap-1 text-[10px] font-bold rounded border transition-all uppercase ${editSaveRouteSuccess ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : (!editForm.from || !editForm.to) ? 'bg-white/5 text-slate-600 border-white/5 cursor-not-allowed' : 'bg-brand-500/20 text-brand-400 border-brand-500/30 hover:bg-brand-500/30'}`}
                                                >
                                                    {editSaveRouteSuccess ? (
                                                        <><Check size={12} /> Kaydedildi</>
                                                    ) : (
                                                        "Rotayı Kaydet"
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4 items-end">
                                {/* Tonaj */}
                                <div>
                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Tonaj</label>
                                    <input type="number" step="0.01" className="w-full glass-input px-3 py-2 text-sm"
                                        value={editForm.tonnage}
                                        onChange={e => setEditForm({ ...editForm, tonnage: e.target.value })} />
                                </div>

                                {/* Ek Bilgiler Toggle */}
                                <button
                                    type="button"
                                    onClick={() => setEditShowExtra(!editShowExtra)}
                                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all duration-300 ${editShowExtra ? 'bg-brand-500/10 border-brand-500/30 text-brand-400' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                                >
                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                                        <StickyNote size={12} /> Ek Bilgiler
                                    </div>
                                    <div className={`transition-transform duration-300 ${editShowExtra ? 'rotate-180' : ''}`}>
                                        <ChevronDown size={14} />
                                    </div>
                                </button>
                            </div>

                            {/* Durum */}
                            <div>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Durum</label>
                                <select className="w-full glass-input px-3 py-2 text-sm bg-[var(--bg-panel)]"
                                    value={editForm.status}
                                    onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                                    <option value="Fatura Bekliyor">Fatura Bekliyor</option>
                                    <option value="Fatura Kesildi">Fatura Kesildi</option>
                                    <option value="Faturalandı">Faturalandı</option>
                                </select>
                            </div>


                            {editShowExtra && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 p-3 bg-white/5 rounded-xl border border-white/5 mt-2">
                                    {/* Not */}
                                    <div>
                                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wider">📝 Not (İsteğe Bağlı)</label>
                                        <textarea
                                            rows={2}
                                            className="w-full glass-input px-3 py-2 text-sm resize-none"
                                            placeholder="Bu sefer hakkında not ekleyin..."
                                            value={editForm.notes}
                                            onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                        />
                                    </div>
                                    {/* Fotoğraf */}
                                    <div>
                                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-wider">📎 İrsaliye / Belge Ekle</label>
                                        <FileUpload files={editForm.files} onChange={files => setEditForm({ ...editForm, files })} />
                                    </div>
                                </div>
                            )}
                            {/* Kaydet */}
                            <button onClick={handleEdit}
                                className="w-full bg-brand-600 hover:bg-brand-500 text-[var(--text-primary)] py-2.5 rounded-lg font-medium transition-all mt-1">
                                Kaydet
                            </button>
                            {/* Sil */}
                            <button onClick={() => { handleDelete(editingTrip.id); setEditingTrip(null); }}
                                className="w-full flex items-center justify-center gap-2 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/5 py-2.5 rounded-lg text-sm font-medium transition-all">
                                <Trash2 size={14} /> Bu Seferi Sil
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MANUEL EKLE MODAL ─── */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-panel w-full max-w-lg p-6 relative animate-in zoom-in-95 duration-200 border-brand-500/30 max-h-[92vh] overflow-y-visible flex flex-col">
                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)] z-[80]"
                        >
                            <X size={20} />
                        </button>

                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center flex-shrink-0">
                            <MapPin className="mr-2 text-brand-500" /> Yeni Sefer / Rota
                        </h3>

                        <form onSubmit={handleManualAdd} className="space-y-5 overflow-y-auto custom-scrollbar pr-2 flex-1 pb-4">
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Tarih</label>
                                <input
                                    type="date"
                                    required
                                    className="w-full glass-input px-4 py-2"
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                />
                            </div>

                            {/* Rota Seçim Alanı */}
                            <div className="p-4 bg-brand-500/5 border border-brand-500/20 rounded-2xl space-y-4 shadow-lg shadow-brand-500/5 transition-all duration-300 border-dashed md:border-solid">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-brand-400 uppercase tracking-widest flex items-center gap-2">
                                        <MapPin size={14} /> Güzergah Belirleme
                                    </label>
                                    <div className="flex items-center space-x-2 bg-[var(--bg-panel-hover)] p-1 rounded-lg">
                                        <button
                                            type="button"
                                            className={`px-3 py-1 text-xs font-medium rounded ${useSavedRoute ? 'bg-brand-500 text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
                                            onClick={() => setUseSavedRoute(true)}
                                        >
                                            Kayıtlı Rota
                                        </button>
                                        <button
                                            type="button"
                                            className={`px-3 py-1 text-xs font-medium rounded ${!useSavedRoute ? 'bg-brand-500 text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
                                            onClick={() => {
                                                setUseSavedRoute(false);
                                                setSelectedRouteId('');
                                                setFormData(f => ({ ...f, from: '', to: '', km: '' }));
                                            }}
                                        >
                                            Yeni Rota
                                        </button>
                                        <div className="w-[1px] h-3 bg-white/10 mx-1"></div>
                                        <button
                                            type="button"
                                            className="px-2 py-1 text-[10px] font-bold text-brand-400 hover:text-brand-300 uppercase tracking-tighter"
                                            onClick={() => setIsRouteManagerOpen(true)}
                                        >
                                            Yönet
                                        </button>
                                    </div>
                                </div>

                                {useSavedRoute ? (
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRouteSelectorMode('add');
                                                setIsRouteSelectorOpen(true);
                                            }}
                                            className="w-full glass-input px-4 py-3 flex items-center justify-between text-sm group hover:border-brand-500/40 hover:bg-brand-500/5 transition-all"
                                        >
                                            <span className={selectedRouteId ? "text-[var(--text-primary)] font-medium" : "text-slate-500"}>
                                                {selectedRouteId 
                                                    ? `${routes.find(r => r.id === parseInt(selectedRouteId))?.from} ➔ ${routes.find(r => r.id === parseInt(selectedRouteId))?.to}`
                                                    : "Kayıtlı Rotalarımdan Seçin..."}
                                            </span>
                                                <div className="flex items-center">
                                                    <span className="text-[10px] uppercase font-bold text-brand-500 bg-brand-500/10 px-2 py-1 rounded">SEÇ</span>
                                                </div>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-[var(--text-secondary)] mb-1">Yükleme (Nereden)</label>
                                                <input
                                                    type="text"
                                                    required={!useSavedRoute}
                                                    placeholder="Örn: Ankara"
                                                    className="w-full glass-input px-3 py-2 text-sm"
                                                    value={formData.from}
                                                    onChange={(e) => setFormData({ ...formData, from: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-[var(--text-secondary)] mb-1">Boşaltma (Nereye)</label>
                                                <input
                                                    type="text"
                                                    required={!useSavedRoute}
                                                    placeholder="Örn: İstanbul"
                                                    className="w-full glass-input px-3 py-2 text-sm"
                                                    value={formData.to}
                                                    onChange={(e) => setFormData({ ...formData, to: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-[var(--text-secondary)] mb-1">Mesafe (KM)</label>
                                                <input
                                                    type="number"
                                                    required={!useSavedRoute}
                                                    placeholder="Örn: 450"
                                                    className="w-full glass-input px-3 py-2 text-sm"
                                                    value={formData.km}
                                                    onChange={(e) => setFormData({ ...formData, km: e.target.value })}
                                                />
                                        </div>
                                        </div>
                                        <div className="flex items-center justify-between border-t border-white/5 pt-3">
                                            <div className="flex items-center gap-2">
                                                <label className="flex items-center space-x-2 text-sm text-[var(--text-primary)] cursor-pointer whitespace-nowrap">
                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${saveNewRoute ? 'bg-brand-500 border-brand-500' : 'border-slate-500'}`}>
                                                        {saveNewRoute && <Check size={14} className="text-[var(--text-primary)]" />}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={saveNewRoute}
                                                        onChange={(e) => setSaveNewRoute(e.target.checked)}
                                                    />
                                                    <span>Hafızaya Al</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={handleSaveRouteOnly}
                                                    disabled={!formData.from || !formData.to || saveRouteSuccess}
                                                    className={`px-2 py-1 flex items-center gap-1 text-[10px] font-bold rounded border transition-all uppercase ${saveRouteSuccess ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : (!formData.from || !formData.to) ? 'bg-white/5 text-slate-600 border-white/5 cursor-not-allowed' : 'bg-brand-500/20 text-brand-400 border-brand-500/30 hover:bg-brand-500/30'}`}
                                                >
                                                    {saveRouteSuccess ? (
                                                        <><Check size={12} /> Kaydedildi</>
                                                    ) : (
                                                        "Rotayı Kaydet"
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 items-end">
                                <div>
                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Tonaj</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        placeholder="Örn: 24.5"
                                        className="w-full glass-input px-4 py-2 text-sm"
                                        value={formData.tonnage}
                                        onChange={(e) => setFormData({ ...formData, tonnage: e.target.value })}
                                    />
                                </div>

                                {/* Ek Bilgiler Toggle */}
                                <button
                                    type="button"
                                    onClick={() => setShowExtra(!showExtra)}
                                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all duration-300 ${showExtra ? 'bg-brand-500/10 border-brand-500/30 text-brand-400' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                                >
                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                                        <StickyNote size={12} /> Ek Bilgiler
                                    </div>
                                    <div className={`transition-transform duration-300 ${showExtra ? 'rotate-180' : ''}`}>
                                        <ChevronDown size={14} />
                                    </div>
                                </button>
                            </div>

                            {/* Toplam Önizleme */}
                            {formData.tonnage && formData.price && (
                                <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
                                    <span className="text-xs text-slate-400">Hesaplanan Toplam</span>
                                    <span className="text-emerald-400 font-bold text-sm">
                                        ₺{(parseFloat(formData.tonnage || 0) * parseFloat(formData.price || 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )}

                            {showExtra && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 p-3 bg-white/5 rounded-xl border border-white/5">
                                    {/* Not */}
                                    <div>
                                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wider">📝 Not (İsteğe Bağlı)</label>
                                        <textarea
                                            rows={2}
                                            className="w-full glass-input px-4 py-2 resize-none"
                                            placeholder="Sefer hakkında not ekleyin..."
                                            value={formData.notes}
                                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wider">📎 İrsaliye / Belge Ekle</label>
                                        <FileUpload files={formData.files} onChange={files => setFormData({ ...formData, files })} />
                                    </div>
                                </div>
                            )}

                            <button
                                type="submit"
                                className="w-full bg-brand-600 hover:bg-brand-500 text-[var(--text-primary)] px-4 py-3 rounded-lg font-medium transition-all shadow-lg mt-2"
                            >
                                Seferi Kaydet
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── ROTA YÖNETİMİ MODAL ─── */}
            {isRouteManagerOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                    <div className="glass-panel w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200 border-brand-500/30">
                        <button onClick={() => setIsRouteManagerOpen(false)} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center"><MapPin className="mr-2 text-brand-500" /> Rota Yönetimi</h3>

                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                            {routes.map(route => (
                                <div key={route.id} className="p-3 bg-white/5 border border-[var(--border-color)] rounded-xl">
                                    {editingRoute === route.id ? (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-2">
                                                <input className="glass-input px-2 py-1 text-xs" value={route.from} onChange={e => updateRoute(route.id, { from: e.target.value })} />
                                                <input className="glass-input px-2 py-1 text-xs" value={route.to} onChange={e => updateRoute(route.id, { to: e.target.value })} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[10px] text-slate-500">KM:</span>
                                                    <input type="number" className="glass-input px-2 py-1 text-xs w-full" value={route.km} onChange={e => updateRoute(route.id, { km: parseInt(e.target.value) || 0 })} />
                                                </div>
                                            </div>
                                            <div className="flex">
                                                <button onClick={() => setEditingRoute(null)} className="ml-auto bg-brand-600 text-[var(--text-primary)] px-3 py-1 rounded text-xs">Tamam</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-bold text-[var(--text-primary)]">{route.from} ➔ {route.to}</p>
                                                <p className="text-xs text-slate-500">{route.km} km</p>
                                            </div>
                                            <div className="flex gap-1">
                                                <button onClick={() => setEditingRoute(route.id)} className="p-1.5 text-[var(--text-secondary)] hover:text-brand-400"><Pencil size={14} /></button>
                                                <button onClick={() => deleteRoute(route.id)} className="p-1.5 text-[var(--text-secondary)] hover:text-red-400"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {routes.length === 0 && <p className="text-center text-slate-500 text-sm py-4">Kayıtlı rota bulunamadı.</p>}
                        </div>

                        <button
                            onClick={() => setIsRouteManagerOpen(false)}
                            className="w-full bg-[var(--bg-panel-hover)] hover:bg-slate-700 text-[var(--text-primary)] py-3 rounded-lg font-medium transition-all mt-6 border border-[var(--border-color)]"
                        >
                            Kapat
                        </button>
                    </div>
                </div>
            )}

            {/* ─── DOSYA GÖRÜNTÜLEYICI ─── */}
            {viewFiles && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setViewFiles(null)}>
                    <div className="glass-panel w-full max-w-lg p-5 relative animate-in zoom-in-95 duration-200 max-h-[80vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => setViewFiles(null)} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        <h3 className="font-bold text-[var(--text-primary)] mb-1 pr-8">📎 Ekler</h3>
                        <p className="text-xs text-slate-500 mb-4">{viewFiles.title}</p>
                        <div className="space-y-3">
                            {viewFiles.files.map((f, i) => (
                                <div key={i} className="bg-white/5 rounded-xl p-3 border border-[var(--border-color)]">
                                    {f.type && f.type.startsWith('image/') ? (
                                        <a href={f.data} target="_blank" rel="noreferrer">
                                            <img src={f.data} alt={f.name} className="w-full rounded-lg max-h-64 object-contain bg-[var(--bg-panel)] cursor-zoom-in hover:opacity-90 transition" />
                                        </a>
                                    ) : (
                                        <a href={f.data} download={f.name}
                                            className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                                            <FileText size={24} className="text-brand-400 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium text-[var(--text-primary)]">{f.name}</p>
                                                <p className="text-xs text-slate-500">İndirmek için tıklayın</p>
                                            </div>
                                        </a>
                                    )}
                                    <p className="text-xs text-slate-600 mt-1.5">{f.name}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── ROTA SEÇİCİ MODAL (YENİ PENCERE) ─── */}
            {isRouteSelectorOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="glass-panel w-full max-w-lg p-0 relative animate-in zoom-in-95 duration-200 border-brand-500/30 overflow-hidden flex flex-col h-[80vh] md:h-auto md:max-h-[85vh]">
                        {/* Modal Header */}
                        <div className="p-4 flex items-center justify-between border-b border-white/5 bg-white/5 shrink-0">
                            <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center">
                                <Search className="mr-2 text-brand-500" size={18} /> Rota Seç
                            </h3>
                            <button
                                onClick={() => {
                                    setIsRouteSelectorOpen(false);
                                    setRouteSearchTerm('');
                                }}
                                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Search Bar */}
                        <div className="p-4 border-b border-white/5 bg-black/20 shrink-0">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="text"
                                    autoFocus
                                    placeholder="Rota ara (Nereden veya Nereye)..."
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-brand-500/50 focus:bg-white/10 transition-all placeholder:text-slate-500"
                                    value={routeSearchTerm}
                                    onChange={(e) => setRouteSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Route List */}
                        <div className="overflow-y-auto custom-scrollbar flex-1 p-2">
                            {sortedRoutes.filter(r => 
                                r.from.toLowerCase().includes(routeSearchTerm.toLowerCase()) || 
                                r.to.toLowerCase().includes(routeSearchTerm.toLowerCase())
                            ).length > 0 ? (
                                <div className="space-y-1.5">
                                    {sortedRoutes.filter(r => 
                                        r.from.toLowerCase().includes(routeSearchTerm.toLowerCase()) || 
                                        r.to.toLowerCase().includes(routeSearchTerm.toLowerCase())
                                    ).map(r => (
                                        <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => {
                                                if (routeSelectorMode === 'add') {
                                                    setSelectedRouteId(String(r.id));
                                                } else {
                                                    setEditSelectedRouteId(String(r.id));
                                                }
                                                setIsRouteSelectorOpen(false);
                                                setRouteSearchTerm('');
                                            }}
                                            className="w-full flex items-center justify-between p-4 rounded-xl transition-all text-left bg-white/5 hover:bg-brand-500/10 border border-transparent hover:border-brand-500/30 group"
                                        >
                                            <div className="flex flex-col gap-1.5 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <MapPin size={14} className="text-slate-500 group-hover:text-brand-400 transition-colors" />
                                                    <span className="text-sm font-bold text-[var(--text-primary)] tracking-wide">{r.from} <span className="text-brand-500 mx-1">➔</span> {r.to}</span>
                                                </div>
                                                <div className="flex items-center gap-4 pl-6 opacity-70">
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                                        <span className="font-semibold">{r.km}</span> km
                                                    </div>
                                                    {r.lastPrice && (
                                                        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                                                            <span>₺</span><span className="font-bold">{r.lastPrice}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="w-8 h-8 rounded-full bg-white/5 group-hover:bg-brand-500 flex items-center justify-center transition-colors shrink-0">
                                                <ChevronDown size={14} className="text-slate-400 group-hover:text-[var(--text-primary)] -rotate-90" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center p-10 text-center text-slate-500">
                                    <MapPin size={32} className="mb-3 opacity-20" />
                                    <p className="text-sm font-medium">Bu aramayla eşleşen rota bulunamadı.</p>
                                    <p className="text-xs mt-1 opacity-70">Kelimeyi değiştirerek tekrar arayın.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Trips;

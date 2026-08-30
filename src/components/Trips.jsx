import React, { useState, useContext, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, MapPin, X, ChevronDown, Check, Trash2, Paperclip, FileText, Pencil, StickyNote, Truck, Menu, Calendar, Scale, Activity, Wallet, ArrowRight } from 'lucide-react';
import { DataContext } from '../context/DataContext';
import FileUpload from './FileUpload';
import CustomSelect from './CustomSelect';
import CustomDatePicker from './CustomDatePicker';
import { useCompany } from '../context/CompanyContext';
import { parseTonnageInTons } from '../utils/tonnageUtils';

const Trips = ({ onOpenMenu, isMobile }) => {
    const { trips, addTrip, deleteTrip, editTrip, routes, addRoute, updateRoute, deleteRoute, premiums, allDrivers } = useContext(DataContext);
    const { companyData } = useCompany();
    const [editingTrip, setEditingTrip] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [viewFiles, setViewFiles] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isRouteManagerOpen, setIsRouteManagerOpen] = useState(false);
    const [editingRoute, setEditingRoute] = useState(null);

    // Ay / Dönem Filtresi State'leri
    const [timeFilter, setTimeFilter] = useState('all');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Dışarı tıklandığında ay dropdown'ını kapat
    useEffect(() => {
        if (!isDropdownOpen) return;
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isDropdownOpen]);

    // Ay seçeneklerini otomatik oluştur (Ters kronolojik)
    const monthOptions = useMemo(() => {
        const options = [];
        const currentYear = new Date().getFullYear();
        
        const uniqueMonths = [...new Set((trips || []).filter(t => !t.deleted && t.date).map(t => {
            const d = new Date(t.date);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }))].sort().reverse();
        
        uniqueMonths.forEach(ym => {
            const [y, m] = ym.split('-');
            const year = parseInt(y);
            const monthIndex = parseInt(m) - 1;
            const date = new Date(year, monthIndex, 1);
            const monthName = date.toLocaleString('tr-TR', { month: 'long' });
            
            const label = year === currentYear ? monthName : `${monthName} ${year}`;
            options.push({ value: ym, label });
        });
        
        return options;
    }, [trips]);

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
        files: [],
        driverName: '',
        premiumId: '',
        premiumAmount: 0
    });

    // Kayıtlı rota seçildiğinde formu doldur (Yeni Ekle)
    useEffect(() => {
        if (useSavedRoute && selectedRouteId) {
            const route = routes.find(r => r.id === parseInt(selectedRouteId));
            if (route) {
                const sortedTrips = [...trips].sort((a,b) => new Date(b.date) - new Date(a.date));
                const matchedTrip = sortedTrips.find(t => !t.deleted && t.from.trim().toLowerCase() === route.from.trim().toLowerCase() && t.to.trim().toLowerCase() === route.to.trim().toLowerCase());
                // eslint-disable-next-line
                setFormData(prev => {
                    const newFrom = route.from;
                    const newTo = route.to;
                    const newKm = route.km || '';
                    let newDriver = prev.driverName;
                    let newPremId = prev.premiumId;
                    let newPremAmt = prev.premiumAmount;
                    
                    if (matchedTrip && companyData?.personnelEnabled) {
                        newDriver = matchedTrip.driverName || prev.driverName;
                        newPremId = matchedTrip.premiumId || '';
                        newPremAmt = matchedTrip.premiumAmount || 0;
                    }
                    
                    if (prev.from !== newFrom || prev.to !== newTo || prev.km !== newKm || prev.driverName !== newDriver || prev.premiumId !== newPremId || prev.premiumAmount !== newPremAmt) {
                        return { ...prev, from: newFrom, to: newTo, km: newKm, driverName: newDriver, premiumId: newPremId, premiumAmount: newPremAmt };
                    }
                    return prev;
                });
            }
        }
    }, [selectedRouteId, useSavedRoute, routes, trips, companyData?.personnelEnabled]);

    // Kayıtlı rota seçildiğinde formu doldur (Düzenle)
    useEffect(() => {
        if (editUseSavedRoute && editSelectedRouteId) {
            const route = routes.find(r => r.id === parseInt(editSelectedRouteId));
            if (route) {
                const sortedTrips = [...trips].sort((a,b) => new Date(b.date) - new Date(a.date));
                const matchedTrip = sortedTrips.find(t => !t.deleted && t.from.trim().toLowerCase() === route.from.trim().toLowerCase() && t.to.trim().toLowerCase() === route.to.trim().toLowerCase());
                setEditForm(prev => {
                    const newFrom = route.from;
                    const newTo = route.to;
                    const newKm = route.km || '';
                    let newDriver = prev.driverName;
                    let newPremId = prev.premiumId;
                    let newPremAmt = prev.premiumAmount;

                    if (matchedTrip && companyData?.personnelEnabled) {
                        newDriver = matchedTrip.driverName || prev.driverName;
                        newPremId = matchedTrip.premiumId || '';
                        newPremAmt = matchedTrip.premiumAmount || 0;
                    }

                    if (prev.from !== newFrom || prev.to !== newTo || prev.km !== newKm || prev.driverName !== newDriver || prev.premiumId !== newPremId || prev.premiumAmount !== newPremAmt) {
                        return { ...prev, from: newFrom, to: newTo, km: newKm, driverName: newDriver, premiumId: newPremId, premiumAmount: newPremAmt };
                    }
                    return prev;
                });
            }
        }
    }, [editSelectedRouteId, editUseSavedRoute, routes, trips, companyData?.personnelEnabled]);

    // Manuel rota yazıldığında son girilen şoför ve primi bul
    useEffect(() => {
        if (!useSavedRoute && formData.from && formData.to && companyData?.personnelEnabled) {
            const sortedTrips = [...trips].sort((a,b) => new Date(b.date) - new Date(a.date));
            const matchedTrip = sortedTrips.find(t => !t.deleted && t.from.trim().toLowerCase() === formData.from.trim().toLowerCase() && t.to.trim().toLowerCase() === formData.to.trim().toLowerCase());
            if (matchedTrip) {
                setFormData(prev => {
                    const newDriver = matchedTrip.driverName || prev.driverName;
                    const newPremId = matchedTrip.premiumId || '';
                    const newPremAmt = matchedTrip.premiumAmount || 0;
                    if (prev.driverName !== newDriver || prev.premiumId !== newPremId || prev.premiumAmount !== newPremAmt) {
                        return { ...prev, driverName: newDriver, premiumId: newPremId, premiumAmount: newPremAmt };
                    }
                    return prev;
                });
            }
        }
    }, [formData.from, formData.to, useSavedRoute, companyData?.personnelEnabled, trips]);

    // Manuel rota yazıldığında son girilen şoför ve primi bul (Düzenleme)
    useEffect(() => {
        if (!editUseSavedRoute && editForm.from && editForm.to && companyData?.personnelEnabled) {
            const sortedTrips = [...trips].sort((a,b) => new Date(b.date) - new Date(a.date));
            const matchedTrip = sortedTrips.find(t => !t.deleted && t.from.trim().toLowerCase() === editForm.from.trim().toLowerCase() && t.to.trim().toLowerCase() === editForm.to.trim().toLowerCase());
            if (matchedTrip) {
                setEditForm(prev => {
                    const newDriver = matchedTrip.driverName || prev.driverName;
                    const newPremId = matchedTrip.premiumId || '';
                    const newPremAmt = matchedTrip.premiumAmount || 0;
                    if (prev.driverName !== newDriver || prev.premiumId !== newPremId || prev.premiumAmount !== newPremAmt) {
                        return { ...prev, driverName: newDriver, premiumId: newPremId, premiumAmount: newPremAmt };
                    }
                    return prev;
                });
            }
        }
    }, [editForm.from, editForm.to, editUseSavedRoute, companyData?.personnelEnabled, trips]);

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

    const calculatePremAmount = (premId, tonnageVal) => {
        const prem = premiums.find(p => p.id === premId);
        if (!prem) return 0;
        if (prem.type === 'fixed') {
            return Number(prem.amount) || 0;
        } else if (prem.type === 'perTonnage') {
            return (parseFloat(tonnageVal) || 0) * (Number(prem.amount) || 0);
        }
        return 0;
    };

    const handlePremiumChange = (premId, mode) => {
        if (mode === 'add') {
            if (premId === 'custom') {
                setFormData(prev => ({ ...prev, premiumId: 'custom', premiumAmount: 0 }));
            } else if (!premId) {
                setFormData(prev => ({ ...prev, premiumId: '', premiumAmount: 0 }));
            } else {
                const amt = calculatePremAmount(premId, formData.tonnage);
                setFormData(prev => ({ ...prev, premiumId: premId, premiumAmount: amt }));
            }
        } else {
            if (premId === 'custom') {
                setEditForm(prev => ({ ...prev, premiumId: 'custom', premiumAmount: 0 }));
            } else if (!premId) {
                setEditForm(prev => ({ ...prev, premiumId: '', premiumAmount: 0 }));
            } else {
                const amt = calculatePremAmount(premId, editForm.tonnage);
                setEditForm(prev => ({ ...prev, premiumId: premId, premiumAmount: amt }));
            }
        }
    };

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
            files: trip.files || [],
            driverName: trip.driverName || '',
            premiumId: trip.premiumId || '',
            premiumAmount: trip.premiumAmount || 0
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
            files: formData.files,
            ...(companyData?.personnelEnabled ? {
                driverName: formData.driverName,
                premiumId: formData.premiumId,
                premiumName: formData.premiumId === 'custom' ? 'Özel Prim' : (premiums.find(p => p.id === formData.premiumId)?.name || 'Prim Yok'),
                premiumAmount: Number(formData.premiumAmount) || 0,
                premiumStatus: 'unpaid'
            } : {})
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
            files: editForm.files,
            ...(companyData?.personnelEnabled ? {
                driverName: editForm.driverName,
                premiumId: editForm.premiumId,
                premiumName: editForm.premiumId === 'custom' ? 'Özel Prim' : (premiums.find(p => p.id === editForm.premiumId)?.name || 'Prim Yok'),
                premiumAmount: Number(editForm.premiumAmount) || 0,
                premiumStatus: editingTrip.premiumStatus || 'unpaid'
            } : {})
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
            files: [],
            driverName: '',
            premiumId: '',
            premiumAmount: 0
        });
        setSelectedRouteId('');
        setUseSavedRoute(true);
        setSaveNewRoute(false);
    };

    const filteredTrips = useMemo(() => {
        return (trips || []).filter(trip => {
            if (trip.deleted) return false;
            
            // Ay / Dönem Filtresi
            if (timeFilter !== 'all') {
                const d = new Date(trip.date);
                const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                if (ym !== timeFilter) return false;
            }

            // Arama Terimi Filtresi
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const fromMatch = (trip.from || '').toLowerCase().includes(term);
                const toMatch = (trip.to || '').toLowerCase().includes(term);
                const dateMatch = (trip.date || '').includes(term);
                const driverMatch = (trip.driverName || '').toLowerCase().includes(term);
                const notesMatch = (trip.notes || '').toLowerCase().includes(term);
                if (!fromMatch && !toMatch && !dateMatch && !driverMatch && !notesMatch) {
                    return false;
                }
            }
            return true;
        });
    }, [trips, timeFilter, searchTerm]);

    // Tonaj hesaplama (tonnageUtils.js'den imported parseTonnageInTons kullanır)

    const summaryStats = useMemo(() => {
        let totalTrips = filteredTrips.length;
        let totalTonnage = 0;

        filteredTrips.forEach(trip => {
            totalTonnage += parseTonnageInTons(trip.tonnage);
        });

        const avgTonnagePerTrip = totalTrips > 0 ? (totalTonnage / totalTrips) : 0;

        return {
            totalTrips,
            totalTonnage,
            avgTonnagePerTrip
        };
    }, [filteredTrips]);

    return (
        <div className="space-y-4 animate-in fade-in duration-500 relative pb-ios-nav">

            {/* ─── ENTEGRE TEK SATIR HEADER & INLINE STAT BAR ─── */}
            <div 
                className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/[0.06] relative"
                style={{
                    paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))'
                }}
            >
                {/* Sol Grup: Hamburger (Mobil) + Başlık + Ay Seçici + INLINE STAT KAPSÜLLERİ */}
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
                    {isMobile && onOpenMenu && (
                        <button 
                            onClick={onOpenMenu} 
                            className="p-1.5 -ml-1 text-slate-400 hover:text-slate-100 transition-colors flex items-center justify-center cursor-pointer rounded-lg hover:bg-white/5"
                            title="Menüyü Aç"
                        >
                            <Menu size={22} />
                        </button>
                    )}
                    
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap">
                        Seferler
                    </h2>

                    {/* Ay / Zaman Filtresi Dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            type="button"
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="h-[36px] w-[155px] px-3 bg-[#0b0e14]/90 border border-white/10 hover:border-sky-500/35 rounded-xl flex items-center justify-between gap-2 text-xs sm:text-sm font-semibold text-slate-200 hover:text-white transition-all shadow-lg cursor-pointer"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <Calendar size={13} className="text-sky-400 shrink-0" />
                                <span className="truncate">
                                    {timeFilter === 'all' 
                                        ? 'Tüm Zamanlar' 
                                        : (monthOptions.find(o => o.value === timeFilter)?.label || timeFilter)}
                                </span>
                            </div>
                            <ChevronDown size={13} className={`text-slate-400 shrink-0 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-sky-400' : ''}`} />
                        </button>

                        {isDropdownOpen && (
                            <div className="absolute left-0 top-full mt-1.5 w-44 bg-[#0c1017]/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                                <button
                                    type="button"
                                    onClick={() => { setTimeFilter('all'); setIsDropdownOpen(false); }}
                                    className={`w-full text-left px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                                        timeFilter === 'all' ? 'bg-sky-500/15 text-sky-300 font-bold' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    <span>Tüm Zamanlar</span>
                                </button>
                                <div className="my-1 border-t border-white/5" />
                                <div className="max-h-56 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                    {monthOptions.map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => { setTimeFilter(opt.value); setIsDropdownOpen(false); }}
                                            className={`w-full text-left px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                                                timeFilter === opt.value ? 'bg-sky-500/15 text-sky-300 font-bold' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                            }`}
                                        >
                                            <span className="truncate">{opt.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ─── INLINE METRIC KAPSÜLLERİ (SİMETRİK & SABİT GENİŞLİKLİ) ─── */}
                    <div className="flex items-center gap-2">
                        {/* Toplam Sefer Kapsülü */}
                        <div className="h-[36px] px-3 bg-[#0b0e14]/90 border border-white/10 hover:border-sky-500/30 rounded-xl flex items-center gap-2 text-xs shadow-sm transition-all">
                            <span className="p-1 rounded-md bg-sky-500/10 text-sky-400 shrink-0 flex items-center justify-center">
                                <Truck size={12} />
                            </span>
                            <div className="flex items-baseline gap-1 whitespace-nowrap">
                                <span className="text-[11px] text-slate-400 font-medium">Toplam:</span>
                                <span className="font-bold text-white text-xs sm:text-sm">{summaryStats.totalTrips}</span>
                                <span className="text-[11px] text-slate-400">Sefer</span>
                            </div>
                        </div>

                        {/* Ortalama Tonaj Kapsülü */}
                        <div className="h-[36px] px-3 bg-[#0b0e14]/90 border border-white/10 hover:border-sky-500/30 rounded-xl flex items-center gap-2 text-xs shadow-sm transition-all">
                            <span className="p-1 rounded-md bg-sky-500/10 text-sky-400 shrink-0 flex items-center justify-center">
                                <Scale size={12} />
                            </span>
                            <div className="flex items-baseline gap-1 whitespace-nowrap">
                                <span className="text-[11px] text-slate-400 font-medium">Ortalama:</span>
                                <span className="font-bold text-sky-400 text-xs sm:text-sm">{summaryStats.avgTonnagePerTrip.toFixed(1)}</span>
                                <span className="text-[11px] text-slate-400">Ton</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sağ Grup: Arama Çubuğu + Yeni Sefer Butonu */}
                <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-60">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                        <input
                            type="text"
                            placeholder="Sefer ara (Güzergah, şoför...)"
                            className="w-full h-[36px] bg-[#0b0e14]/90 border border-white/10 hover:border-white/20 focus:border-sky-500/50 rounded-xl pl-8 pr-3 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="bg-gradient-to-r from-sky-600 to-blue-500 hover:from-sky-500 hover:to-blue-400 border border-sky-400/40 text-white px-3.5 h-[36px] sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-[0_0_20px_rgba(14,165,233,0.35)] hover:shadow-[0_0_25px_rgba(14,165,233,0.5)] hover:-translate-y-0.5 flex items-center justify-center shrink-0 cursor-pointer"
                    >
                        <Plus size={15} className="mr-1 sm:mr-1.5" /> 
                        <span className="whitespace-nowrap">Yeni Sefer</span>
                    </button>
                </div>
            </div>

            {/* ─── SEFERLER LİSTESİ / TABLOSU ─── */}
            <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    {/* Masaüstü Tablosu */}
                    <table className="w-full text-left border-collapse hidden md:table table-fixed">
                        <thead>
                            <tr className="bg-white/[0.03] border-b border-white/[0.06] text-slate-400 text-[11px] uppercase font-bold tracking-wider">
                                <th className="p-3 pl-4 whitespace-nowrap w-36">Tarih</th>
                                <th className="p-3 whitespace-nowrap">Güzergah</th>
                                <th className="p-3 text-center whitespace-nowrap w-28">Tonaj</th>
                                <th className="p-3 text-center whitespace-nowrap w-36">Durum</th>
                                <th className="p-3 text-center whitespace-nowrap w-24">İşlemler</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {filteredTrips.length > 0 ? (
                                filteredTrips.map((trip) => (
                                    <tr key={trip.id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="p-3 pl-4 whitespace-nowrap">
                                            <div className="text-white text-sm font-semibold">{new Date(trip.date).toLocaleDateString('tr-TR')}</div>
                                        </td>
                                        <td className="p-3">
                                            <div className="text-sm font-bold text-white whitespace-nowrap flex items-center gap-1.5">
                                                <span>{trip.from}</span>
                                                <ArrowRight size={13} className="text-sky-400 shrink-0" />
                                                <span>{trip.to}</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                {trip.km > 0 && (
                                                    <span className="text-[10px] text-slate-500 font-medium font-mono">{trip.km} km</span>
                                                )}
                                                {trip.notes && (
                                                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                                        <StickyNote size={10} className="text-slate-500" />
                                                        <span className="truncate max-w-[220px]">{trip.notes}</span>
                                                    </div>
                                                )}
                                                {companyData?.personnelEnabled && trip.driverName && (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20 font-medium whitespace-nowrap">
                                                            👤 {trip.driverName}
                                                        </span>
                                                        {trip.premiumAmount > 0 && (
                                                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold whitespace-nowrap">
                                                                ₺{trip.premiumAmount} Prim
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-3 text-center whitespace-nowrap">
                                            <span className="text-white font-bold text-sm bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                                                {parseTonnageInTons(trip.tonnage) > 0 ? `${parseTonnageInTons(trip.tonnage)} t` : '—'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                                                trip.status === 'Faturalandı' || trip.status === 'Fatura Kesildi'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                            }`}>
                                                {trip.status}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                {trip.files && trip.files.length > 0 && (
                                                    <button 
                                                        onClick={() => setViewFiles({ title: `${trip.from} → ${trip.to}`, files: trip.files })}
                                                        title={`${trip.files.length} Ek Dosya`}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 transition-colors cursor-pointer"
                                                    >
                                                        <Paperclip size={14} />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => openEditModal(trip)}
                                                    title="Seferi Düzenle"
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 transition-colors cursor-pointer"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="p-12 text-center text-slate-500">
                                        <Truck size={36} className="mx-auto mb-3 opacity-20 text-sky-400" />
                                        <p className="text-base font-semibold text-slate-300">Kayıtlı Sefer Bulunamadı</p>
                                        <p className="text-xs text-slate-500 mt-1">Seçili dönemde veya arama kriterinde sefer kaydı yok.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {/* Mobil Kart Görünümü */}
                    <div className="md:hidden flex flex-col gap-2.5 p-3">
                        {filteredTrips.length > 0 ? (
                            filteredTrips.map((trip) => (
                                <div key={trip.id} className="bg-[#0b0e14]/90 border border-white/[0.08] hover:border-sky-500/30 rounded-xl p-3.5 shadow-md relative transition-all">
                                    {/* Üst Satır: Tarih | Durum | Ekler & Düzenle */}
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-xs font-bold text-slate-400">
                                            {new Date(trip.date).toLocaleDateString('tr-TR')}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                                trip.status === 'Faturalandı' || trip.status === 'Fatura Kesildi'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                            }`}>
                                                {trip.status}
                                            </span>
                                            {trip.files && trip.files.length > 0 && (
                                                <button 
                                                    onClick={() => setViewFiles({ title: `${trip.from} → ${trip.to}`, files: trip.files })}
                                                    className="p-1 bg-sky-500/10 hover:bg-sky-500/20 rounded-lg text-sky-400 transition-colors flex items-center cursor-pointer"
                                                >
                                                    <Paperclip size={12} />
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => openEditModal(trip)}
                                                className="p-1 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-sky-400 transition-colors cursor-pointer"
                                            >
                                                <Pencil size={13} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Güzergah */}
                                    <div className="font-bold text-white text-sm leading-snug mb-1.5 flex items-center gap-1.5 flex-wrap">
                                        <span>{trip.from}</span>
                                        <ArrowRight size={13} className="text-sky-400 shrink-0" />
                                        <span>{trip.to}</span>
                                    </div>

                                    {/* Şoför & Prim Rozetleri */}
                                    {companyData?.personnelEnabled && trip.driverName && (
                                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                            <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20 font-medium">
                                                👤 {trip.driverName}
                                            </span>
                                            {trip.premiumAmount > 0 && (
                                                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold">
                                                    ₺{trip.premiumAmount} Prim
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Not */}
                                    {trip.notes && (
                                        <div className="flex items-center gap-1.5 mb-2 text-xs text-slate-400 bg-white/[0.02] p-1.5 rounded-lg border border-white/5">
                                            <StickyNote size={11} className="text-slate-500 shrink-0" />
                                            <span className="truncate">{trip.notes}</span>
                                        </div>
                                    )}

                                    {/* Alt Bar: Tonaj ve KM */}
                                    <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                                        <div className="flex items-center gap-1">
                                            <span className="text-slate-500 uppercase text-[10px] font-bold">Tonaj:</span>
                                            <span className="text-white font-bold">{parseTonnageInTons(trip.tonnage) > 0 ? `${parseTonnageInTons(trip.tonnage)} t` : '—'}</span>
                                        </div>
                                        {trip.km > 0 && (
                                            <div className="text-slate-500 text-[10px] font-mono">
                                                {trip.km} km
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center text-slate-500">
                                <Truck size={32} className="mx-auto mb-2 opacity-20 text-sky-400" />
                                <p className="text-sm font-semibold text-slate-300">Kayıtlı Sefer Bulunamadı</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── DÜZENLE MODAL ─── */}
            {editingTrip && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-panel w-full max-w-lg p-6 relative animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto border-sky-500/30">
                        <button onClick={() => setEditingTrip(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"><X size={20} /></button>
                        <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
                            <Pencil size={16} className="text-sky-400" /> Seferi Düzenle
                        </h3>
                        <div className="space-y-4">
                            {/* Tarih */}
                            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Tarih</label>
                                <CustomDatePicker 
                                    value={editForm.date}
                                    onChange={(val) => setEditForm({ ...editForm, date: val })}
                                    className="glass-input text-left px-3 py-2 text-sm"
                                />
                            </div>
                            {/* Güzergah Belirleme */}
                            <div className="p-4 bg-sky-500/5 border border-sky-500/20 rounded-2xl space-y-4 shadow-lg shadow-sky-500/5 transition-all duration-300 border-dashed md:border-solid">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-sky-400 uppercase tracking-widest flex items-center gap-2">
                                        <MapPin size={14} /> Güzergah Belirleme
                                    </label>
                                    <div className="flex items-center space-x-2 bg-black/40 p-1 rounded-lg border border-white/5">
                                        <button
                                            type="button"
                                            className={`px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all ${editUseSavedRoute ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30 font-bold' : 'text-slate-400 hover:text-white'}`}
                                            onClick={() => setEditUseSavedRoute(true)}
                                        >
                                            Kayıtlı Rota
                                        </button>
                                        <button
                                            type="button"
                                            className={`px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all ${!editUseSavedRoute ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30 font-bold' : 'text-slate-400 hover:text-white'}`}
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
                                            className="px-2 py-1 text-[10px] font-bold text-sky-400 hover:text-sky-300 uppercase tracking-tighter cursor-pointer"
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
                                            className="w-full glass-input px-4 py-3 flex items-center justify-between text-sm group hover:border-sky-500/40 hover:bg-sky-500/5 transition-all cursor-pointer"
                                        >
                                            <span className={editSelectedRouteId ? "text-white font-medium" : "text-slate-500"}>
                                                {editSelectedRouteId
                                                    ? `${routes.find(r => r.id === parseInt(editSelectedRouteId))?.from} ➔ ${routes.find(r => r.id === parseInt(editSelectedRouteId))?.to}`
                                                    : "Kayıtlı Rotalarımdan Seçin..."}
                                            </span>
                                            <div className="flex items-center">
                                                <span className="text-[10px] uppercase font-bold text-sky-400 bg-sky-500/10 px-2 py-1 rounded border border-sky-500/20">SEÇ</span>
                                            </div>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-slate-400 mb-1">Yükleme (Nereden)</label>
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
                                                <label className="block text-xs text-slate-400 mb-1">Boşaltma (Nereye)</label>
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
                                            <label className="block text-xs text-slate-400 mb-1">Mesafe (KM)</label>
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
                                                <label className="flex items-center space-x-2 text-sm text-white cursor-pointer whitespace-nowrap">
                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${editSaveNewRoute ? 'bg-sky-500 border-sky-500' : 'border-slate-500'}`}>
                                                        {editSaveNewRoute && <Check size={14} className="text-white" />}
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
                                                    className={`px-2 py-1 flex items-center gap-1 text-[10px] font-bold rounded border transition-all uppercase ${editSaveRouteSuccess ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : (!editForm.from || !editForm.to) ? 'bg-white/5 text-slate-600 border-white/5 cursor-not-allowed' : 'bg-sky-500/20 text-sky-400 border-sky-500/30 hover:bg-sky-500/30 cursor-pointer'}`}
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
                                    <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Tonaj</label>
                                    <input type="number" step="0.01" className="w-full glass-input px-3 py-2 text-sm"
                                        value={editForm.tonnage}
                                        onChange={(e) => {
                                            const ton = e.target.value;
                                            setEditForm(prev => {
                                                const next = { ...prev, tonnage: ton };
                                                if (prev.premiumId && prev.premiumId !== 'custom') {
                                                    next.premiumAmount = calculatePremAmount(prev.premiumId, ton);
                                                }
                                                return next;
                                            });
                                        }} />
                                </div>

                                {/* Ek Bilgiler Toggle */}
                                <button
                                    type="button"
                                    onClick={() => setEditShowExtra(!editShowExtra)}
                                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all duration-300 cursor-pointer ${editShowExtra ? 'bg-sky-500/10 border-sky-500/30 text-sky-400' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                                >
                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                                        <StickyNote size={12} /> Ek Bilgiler
                                    </div>
                                    <div className={`transition-transform duration-300 ${editShowExtra ? 'rotate-180' : ''}`}>
                                        <ChevronDown size={14} />
                                    </div>
                                </button>
                            </div>

                            {/* Personnel & Premium inputs (Edit) */}
                            {companyData?.personnelEnabled && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Şoför</label>
                                        <CustomSelect
                                            value={editForm.driverName}
                                            onChange={val => setEditForm({ ...editForm, driverName: val })}
                                            placeholder="Şoför Seçin..."
                                            options={[
                                                { label: 'Şoför Seçin...', value: '' },
                                                ...allDrivers.map(d => ({ label: d.name, value: d.name }))
                                            ]}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Prim Şablonu</label>
                                        <CustomSelect
                                            value={editForm.premiumId}
                                            onChange={val => handlePremiumChange(val, 'edit')}
                                            placeholder="Prim Yok"
                                            options={[
                                                { label: 'Prim Yok', value: '' },
                                                ...premiums.map(p => ({ label: p.name, value: p.id })),
                                                { label: 'Özel Tutar...', value: 'custom' }
                                            ]}
                                        />
                                    </div>
                                </div>
                            )}

                            {companyData?.personnelEnabled && editForm.premiumId === 'custom' && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Özel Prim Tutarı (₺)</label>
                                    <input
                                        type="number"
                                        required
                                        placeholder="Örn: 750"
                                        className="w-full glass-input px-3 py-2 text-sm"
                                        value={editForm.premiumAmount || ''}
                                        onChange={e => setEditForm({ ...editForm, premiumAmount: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                            )}

                            {companyData?.personnelEnabled && editForm.premiumId && editForm.premiumId !== 'custom' && (
                                <div className="flex items-center justify-between bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 animate-in fade-in duration-200">
                                    <span className="text-xs text-slate-400">Hesaplanan Hak Ediş Primi</span>
                                    <span className="text-amber-400 font-bold text-sm">
                                        ₺{calculatePremAmount(editForm.premiumId, editForm.tonnage).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )}

                            {editShowExtra && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 p-3 bg-white/5 rounded-xl border border-white/5 mt-2">
                                    {/* Not */}
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">📝 Not (İsteğe Bağlı)</label>
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
                                        <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">📎 İrsaliye / Belge Ekle</label>
                                        <FileUpload files={editForm.files} onChange={files => setEditForm({ ...editForm, files })} />
                                    </div>
                                </div>
                            )}
                            {/* Kaydet */}
                            <button onClick={handleEdit}
                                className="w-full bg-gradient-to-r from-sky-600 to-blue-500 hover:from-sky-500 hover:to-blue-400 border border-sky-400/40 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-sky-500/20 cursor-pointer mt-1">
                                Kaydet
                            </button>
                            {/* Sil */}
                            <button onClick={() => { handleDelete(editingTrip.id); setEditingTrip(null); }}
                                className="w-full flex items-center justify-center gap-2 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer">
                                <Trash2 size={14} /> Bu Seferi Sil
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ─── MANUEL EKLE MODAL ─── */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-panel w-full max-w-lg p-6 relative animate-in zoom-in-95 duration-200 border-sky-500/30 max-h-[92vh] overflow-y-visible flex flex-col">
                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-white z-[80] cursor-pointer"
                        >
                            <X size={20} />
                        </button>

                        <h3 className="text-xl font-bold text-white mb-6 flex items-center flex-shrink-0">
                            <MapPin className="mr-2 text-sky-400" /> Yeni Sefer / Rota
                        </h3>

                        <form onSubmit={handleManualAdd} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar pb-20">
                            {/* Tarih */}
                            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Tarih</label>
                                <CustomDatePicker 
                                    value={formData.date}
                                    onChange={(val) => setFormData({ ...formData, date: val })}
                                    className="glass-input text-left px-4 py-2 text-sm"
                                />
                            </div>

                            {/* Rota Seçim Alanı */}
                            <div className="p-4 bg-sky-500/5 border border-sky-500/20 rounded-2xl space-y-4 shadow-lg shadow-sky-500/5 transition-all duration-300 border-dashed md:border-solid">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-sky-400 uppercase tracking-widest flex items-center gap-2">
                                        <MapPin size={14} /> Güzergah Belirleme
                                    </label>
                                    <div className="flex items-center space-x-2 bg-black/40 p-1 rounded-lg border border-white/5">
                                        <button
                                            type="button"
                                            className={`px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all ${useSavedRoute ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30 font-bold' : 'text-slate-400 hover:text-white'}`}
                                            onClick={() => setUseSavedRoute(true)}
                                        >
                                            Kayıtlı Rota
                                        </button>
                                        <button
                                            type="button"
                                            className={`px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all ${!useSavedRoute ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30 font-bold' : 'text-slate-400 hover:text-white'}`}
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
                                            className="px-2 py-1 text-[10px] font-bold text-sky-400 hover:text-sky-300 uppercase tracking-tighter cursor-pointer"
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
                                            className="w-full glass-input px-4 py-3 flex items-center justify-between text-sm group hover:border-sky-500/40 hover:bg-sky-500/5 transition-all cursor-pointer"
                                        >
                                            <span className={selectedRouteId ? "text-white font-medium" : "text-slate-500"}>
                                                {selectedRouteId 
                                                    ? `${routes.find(r => r.id === parseInt(selectedRouteId))?.from} ➔ ${routes.find(r => r.id === parseInt(selectedRouteId))?.to}`
                                                    : "Kayıtlı Rotalarımdan Seçin..."}
                                            </span>
                                            <div className="flex items-center">
                                                <span className="text-[10px] uppercase font-bold text-sky-400 bg-sky-500/10 px-2 py-1 rounded border border-sky-500/20">SEÇ</span>
                                            </div>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-slate-400 mb-1">Yükleme (Nereden)</label>
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
                                                <label className="block text-xs text-slate-400 mb-1">Boşaltma (Nereye)</label>
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
                                                <label className="block text-xs text-slate-400 mb-1">Mesafe (KM)</label>
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
                                                <label className="flex items-center space-x-2 text-sm text-white cursor-pointer whitespace-nowrap">
                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${saveNewRoute ? 'bg-sky-500 border-sky-500' : 'border-slate-500'}`}>
                                                        {saveNewRoute && <Check size={14} className="text-white" />}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={saveNewRoute}
                                                        onChange={(e) => setSaveNewRoute(e.target.checked)}
                                                    />
                                                    <span className="text-xs">Hafızaya Al</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={handleSaveRouteOnly}
                                                    disabled={!formData.from || !formData.to || saveRouteSuccess}
                                                    className={`px-2 py-1 flex items-center gap-1 text-[10px] font-bold rounded border transition-all uppercase ${saveRouteSuccess ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : (!formData.from || !formData.to) ? 'bg-white/5 text-slate-600 border-white/5 cursor-not-allowed' : 'bg-sky-500/20 text-sky-400 border-sky-500/30 hover:bg-sky-500/30 cursor-pointer'}`}
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
                                    <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Tonaj</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        placeholder="Örn: 24.5"
                                        className="w-full glass-input px-4 py-2 text-sm"
                                        value={formData.tonnage}
                                        onChange={(e) => {
                                            const ton = e.target.value;
                                            setFormData(prev => {
                                                const next = { ...prev, tonnage: ton };
                                                if (prev.premiumId && prev.premiumId !== 'custom') {
                                                    next.premiumAmount = calculatePremAmount(prev.premiumId, ton);
                                                }
                                                return next;
                                            });
                                        }}
                                    />
                                </div>

                                {/* Ek Bilgiler Toggle */}
                                <button
                                    type="button"
                                    onClick={() => setShowExtra(!showExtra)}
                                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all duration-300 cursor-pointer ${showExtra ? 'bg-sky-500/10 border-sky-500/30 text-sky-400' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                                >
                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                                        <StickyNote size={12} /> Ek Bilgiler
                                    </div>
                                    <div className={`transition-transform duration-300 ${showExtra ? 'rotate-180' : ''}`}>
                                        <ChevronDown size={14} />
                                    </div>
                                </button>
                            </div>

                            {/* Personnel & Premium inputs (Add) */}
                            {companyData?.personnelEnabled && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Şoför</label>
                                        <CustomSelect
                                            value={formData.driverName}
                                            onChange={val => setFormData({ ...formData, driverName: val })}
                                            placeholder="Şoför Seçin..."
                                            options={[
                                                { label: 'Şoför Seçin...', value: '' },
                                                ...allDrivers.map(d => ({ label: d.name, value: d.name }))
                                            ]}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Prim Şablonu</label>
                                        <CustomSelect
                                            value={formData.premiumId}
                                            onChange={val => handlePremiumChange(val, 'add')}
                                            placeholder="Prim Yok"
                                            dropup={true}
                                            options={[
                                                { label: 'Prim Yok', value: '' },
                                                ...premiums.map(p => ({ label: p.name, value: p.id })),
                                                { label: 'Özel Tutar...', value: 'custom' }
                                            ]}
                                        />
                                    </div>
                                </div>
                            )}

                            {companyData?.personnelEnabled && formData.premiumId === 'custom' && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Özel Prim Tutarı (₺)</label>
                                    <input
                                        type="number"
                                        required
                                        placeholder="Örn: 750"
                                        className="w-full glass-input px-3 py-2 text-sm"
                                        value={formData.premiumAmount || ''}
                                        onChange={e => setFormData({ ...formData, premiumAmount: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                            )}

                            {companyData?.personnelEnabled && formData.premiumId && formData.premiumId !== 'custom' && (
                                <div className="flex items-center justify-between bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 animate-in fade-in duration-200">
                                    <span className="text-xs text-slate-400">Hesaplanan Hak Ediş Primi</span>
                                    <span className="text-amber-400 font-bold text-sm">
                                        ₺{calculatePremAmount(formData.premiumId, formData.tonnage).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )}

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
                                        <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">📝 Not (İsteğe Bağlı)</label>
                                        <textarea
                                            rows={2}
                                            className="w-full glass-input px-4 py-2 resize-none"
                                            placeholder="Sefer hakkında not ekleyin..."
                                            value={formData.notes}
                                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">📎 İrsaliye / Belge Ekle</label>
                                        <FileUpload files={formData.files} onChange={files => setFormData({ ...formData, files })} />
                                    </div>
                                </div>
                            )}

                            <button
                                type="submit"
                                className="w-full bg-gradient-to-r from-sky-600 to-blue-500 hover:from-sky-500 hover:to-blue-400 border border-sky-400/40 text-white px-4 py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-sky-500/20 hover:shadow-sky-500/40 hover:-translate-y-0.5 mt-2 uppercase tracking-wider cursor-pointer"
                            >
                                Seferi Kaydet
                            </button>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* ─── ROTA YÖNETİMİ MODAL ─── */}
            {isRouteManagerOpen && createPortal(
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                    <div className="glass-panel w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200 border-sky-500/30">
                        <button onClick={() => setIsRouteManagerOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"><X size={20} /></button>
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center"><MapPin className="mr-2 text-sky-400" /> Rota Yönetimi</h3>

                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                            {routes.map(route => (
                                <div key={route.id} className="p-3 bg-white/5 border border-white/5 rounded-xl">
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
                                                <button onClick={() => setEditingRoute(null)} className="ml-auto bg-sky-600 hover:bg-sky-500 text-white px-3 py-1 rounded text-xs cursor-pointer">Tamam</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-bold text-white">{route.from} ➔ {route.to}</p>
                                                <p className="text-xs text-slate-500">{route.km} km</p>
                                            </div>
                                            <div className="flex gap-1">
                                                <button onClick={() => setEditingRoute(route.id)} className="p-1.5 text-slate-400 hover:text-sky-400 cursor-pointer"><Pencil size={14} /></button>
                                                <button onClick={() => deleteRoute(route.id)} className="p-1.5 text-slate-400 hover:text-red-400 cursor-pointer"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {routes.length === 0 && <p className="text-center text-slate-500 text-sm py-4">Kayıtlı rota bulunamadı.</p>}
                        </div>

                        <button
                            onClick={() => setIsRouteManagerOpen(false)}
                            className="w-full bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-medium transition-all mt-6 border border-white/10 cursor-pointer"
                        >
                            Kapat
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {/* ─── DOSYA GÖRÜNTÜLEYICI ─── */}
            {viewFiles && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setViewFiles(null)}>
                    <div className="glass-panel w-full max-w-lg p-5 relative animate-in zoom-in-95 duration-200 max-h-[80vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => setViewFiles(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"><X size={20} /></button>
                        <h3 className="font-bold text-white mb-1 pr-8">📎 Ekler</h3>
                        <p className="text-xs text-slate-500 mb-4">{viewFiles.title}</p>
                        <div className="space-y-3">
                            {viewFiles.files.map((f, i) => (
                                <div key={i} className="bg-white/5 rounded-xl p-3 border border-white/5">
                                    {f.type && f.type.startsWith('image/') ? (
                                        <a href={f.data} target="_blank" rel="noreferrer">
                                            <img src={f.data} alt={f.name} className="w-full rounded-lg max-h-64 object-contain bg-black/40 cursor-zoom-in hover:opacity-90 transition" />
                                        </a>
                                    ) : (
                                        <a href={f.data} download={f.name}
                                            className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                                            <FileText size={24} className="text-sky-400 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium text-white">{f.name}</p>
                                                <p className="text-xs text-slate-500">İndirmek için tıklayın</p>
                                            </div>
                                        </a>
                                    )}
                                    <p className="text-xs text-slate-600 mt-1.5">{f.name}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ─── ROTA SEÇİCİ MODAL (YENİ PENCERE) ─── */}
            {isRouteSelectorOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="glass-panel w-full max-w-lg p-0 relative animate-in zoom-in-95 duration-200 border-sky-500/30 overflow-hidden flex flex-col h-[80vh] md:h-auto md:max-h-[85vh]">
                        {/* Modal Header */}
                        <div className="p-4 flex items-center justify-between border-b border-white/5 bg-white/5 shrink-0">
                            <h3 className="text-lg font-bold text-white flex items-center">
                                <Search className="mr-2 text-sky-400" size={18} /> Rota Seç
                            </h3>
                            <button
                                onClick={() => {
                                    setIsRouteSelectorOpen(false);
                                    setRouteSearchTerm('');
                                }}
                                className="text-slate-400 hover:text-white transition-colors p-1 cursor-pointer"
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
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500/50 focus:bg-white/10 transition-all placeholder:text-slate-500"
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
                                            className="w-full flex items-center justify-between p-4 rounded-xl transition-all text-left bg-white/5 hover:bg-sky-500/10 border border-transparent hover:border-sky-500/30 group cursor-pointer"
                                        >
                                            <div className="flex flex-col gap-1.5 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <MapPin size={14} className="text-slate-500 group-hover:text-sky-400 transition-colors" />
                                                    <span className="text-sm font-bold text-white tracking-wide">{r.from} <span className="text-sky-400 mx-1">➔</span> {r.to}</span>
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
                                            <div className="w-8 h-8 rounded-full bg-white/5 group-hover:bg-sky-500 flex items-center justify-center transition-colors shrink-0">
                                                <ChevronDown size={14} className="text-slate-400 group-hover:text-white -rotate-90" />
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
                </div>,
                document.body
            )}

        </div>
    );
};
export default Trips;

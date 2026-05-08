import React, { useState, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Wrench, Plus, Calendar, X, MapPin, Truck, Trash2, Pencil, Check, User, Users, FileText, StickyNote, AlertCircle, ChevronDown, Download, Eye, Paperclip, FolderOpen, FolderPlus, Map, Phone, Package, ShoppingCart, Link, GripVertical, ExternalLink, Settings as SettingsIcon, AlertTriangle, CheckCircle } from 'lucide-react';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import { DataContext } from '../context/DataContext';
import { useTruck } from '../context/TruckContext';
import { db } from '../services/firebaseConfig';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import FileUpload from './FileUpload';

const MAINTENANCE_TYPES = ['Periyodik Bakım', 'Lastik', 'Motor', 'Fren', 'Şanzıman', 'Elektrik', 'Kaporta', 'Diğer'];

const Maintenance = () => {
    const {
        maintenanceRecords, addMaintenance, deleteMaintenance, updateMaintenance,
        mechanics, addMechanic, deleteMechanic, updateMechanic,
        maintenanceFolders, addMaintenanceFolder, updateMaintenanceFolder, deleteMaintenanceFolder,
        drivers, allDrivers, updateDrivers,
        spareParts, addSparePart, updateSparePart, deleteSparePart,
        sparePartCategories, addSparePartCategory,
        shoppingItems, addShoppingItem, updateShoppingItem, deleteShoppingItem, updateShoppingItemsOrder,
        addLog, docs, fuelRecords, periodicMaintenanceItems, updatePeriodicMaintenanceItems
    } = useContext(DataContext);

    const { activeTruckId, activeTruckData } = useTruck();

    const [activeTab, setActiveTab] = useState('info'); // 'info', 'records', 'mechanics', 'photos'
    const [viewFiles, setViewFiles] = useState(null);

    // --- Periyodik Bakım Şablonları & KM Takibi ---
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [templateForm, setTemplateForm] = useState([]);
    
    // Güncel KM: Yakıt ve Bakım kayıtları birleştirilip en son tarihli (en yeni) olanın KM'si alınıyor
    const activeFuel = (fuelRecords || []).filter(r => !r.deleted && r.odometer);
    const activeMaintenance = (maintenanceRecords || []).filter(r => !r.deleted && r.km);
    const allKmRecords = [...activeFuel, ...activeMaintenance].sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        
        const createdA = new Date(a.createdAt || 0).getTime();
        const createdB = new Date(b.createdAt || 0).getTime();
        return createdB - createdA;
    });
    
    const currentKm = allKmRecords.length > 0 ? (parseInt(allKmRecords[0].km || allKmRecords[0].odometer) || 0) : 0;

    // ─── Araç Bilgileri Edit State ───────────────────────────────────────────
    const [editingField, setEditingField] = useState(null);
    const [editValue, setEditValue] = useState('');


    // ─── Tamir Notları ────────────────────────────────────────────────────────
    const handleDeleteDriverEntry = async (driver) => {
        if (driver.isSystem) {
            if (window.confirm(`${driver.name} adlı sistem kullanıcısını (şoför) tamamen silmek istediğinize emin misiniz?`)) {
                try {
                    await deleteDoc(doc(db, 'approved_users', driver.id));
                    addLog('KULLANICI_SİL', `${driver.name} (Sistem Kullanıcısı) silindi`);
                } catch (error) {
                    
                    alert("Hata: " + error.message);
                }
            }
        } else {
            if (window.confirm(`${driver.name} adlı şoför kaydını listeden silmek istiyor musunuz?`)) {
                try {
                    const newDrivers = (drivers || []).filter(d => d.name !== driver.name);
                    await updateDrivers(newDrivers);
                    addLog('SOFOR_KAYDI_SIL', `${driver.name} (Manuel Kayıt) silindi`);
                } catch (error) {
                    
                    alert("Hata: " + error.message);
                }
            }
        }
    };

    // ─── Bakım Ekleme ──────────────────────────────────────────────────────────
    const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
    const [editingMaintenanceId, setEditingMaintenanceId] = useState(null);
    const [maintenanceForm, setMaintenanceForm] = useState({
        date: new Date().toISOString().split('T')[0],
        type: 'Periyodik Bakım', description: '', mechanicId: '', km: '', cost: '', files: [], doneItems: []
    });

    // ─── Tamirci Ekleme ────────────────────────────────────────────────────────
    const [isMechanicModalOpen, setIsMechanicModalOpen] = useState(false);
    const [editingMechanicId, setEditingMechanicId] = useState(null);
    const [mechanicForm, setMechanicForm] = useState({ name: '', masterName: '', phone: '', location: '', mapLink: '', notes: '', type: 'Genel Bakım' });

    // ─── Albüm (Klasör) Ekleme ──────────────────────────────────────────────────
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [folderForm, setFolderForm] = useState({ name: '', description: '', files: [] });
    const [editingFolderId, setEditingFolderId] = useState(null);
    const [openedFolder, setOpenedFolder] = useState(null);

    const handleSaveFolder = (e) => {
        e.preventDefault();
        if (editingFolderId) {
            updateMaintenanceFolder(editingFolderId, folderForm);
        } else {
            addMaintenanceFolder(folderForm);
        }
        setIsFolderModalOpen(false);
        setEditingFolderId(null);
        setFolderForm({ name: '', description: '', files: [] });
    };

    const handleDeleteFolder = (id, e) => {
        e.stopPropagation();
        const f = maintenanceFolders.find(f => f.id === id);
        deleteMaintenanceFolder(id, f ? f.name : '');
        if (openedFolder?.id === id) setOpenedFolder(null);
    };

    const handleAddMaintenance = (e) => {
        e.preventDefault();
        const mechanic = mechanics.find(m => m.id === maintenanceForm.mechanicId); // Note: mechanicId could be string, checking later. 
        const payload = {
            date: maintenanceForm.date,
            type: maintenanceForm.type,
            description: maintenanceForm.description,
            mechanicName: mechanic ? mechanic.name : 'Belirtilmedi',
            km: parseInt(maintenanceForm.km) || 0,
            cost: parseFloat(maintenanceForm.cost),
            files: maintenanceForm.files,
            doneItems: maintenanceForm.type === 'Periyodik Bakım' ? (maintenanceForm.doneItems || []) : []
        };

        if (editingMaintenanceId) {
            updateMaintenance(editingMaintenanceId, payload);
        } else {
            addMaintenance(payload);
        }

        setIsMaintenanceModalOpen(false);
        setEditingMaintenanceId(null);
        setMaintenanceForm({ date: new Date().toISOString().split('T')[0], type: 'Periyodik Bakım', description: '', mechanicId: '', km: '', cost: '', files: [], doneItems: [] });
    };

    const handleDeleteMaintenance = (id) => {
        deleteMaintenance(id);
    };

    const handleAddMechanic = (e) => {
        e.preventDefault();
        if (editingMechanicId) {
            if (updateMechanic) updateMechanic(editingMechanicId, mechanicForm);
        } else {
            addMechanic(mechanicForm);
        }
        setIsMechanicModalOpen(false);
        setEditingMechanicId(null);
        setMechanicForm({ name: '', masterName: '', phone: '', location: '', mapLink: '', notes: '', type: 'Genel Bakım' });
    };

    // Field edit helpers
    const startEdit = (field, val) => { setEditingField(field); setEditValue(val || ''); };
    const saveEdit = async (field) => {
        if (!activeTruckId) return;
        try {
            await updateDoc(doc(db, 'trucks', activeTruckId), {
                [field]: editValue
            });
            setEditingField(null);
        } catch { /* empty */ }
    };

    const activeMaintenanceRecords = maintenanceRecords.filter(r => !r.deleted);
    const totalCost = activeMaintenanceRecords.reduce((acc, r) => acc + r.cost, 0);

    const tabs = [
        { id: 'info', label: 'Araç Bilgileri', icon: <Truck size={16} />, theme: 'from-blue-500 to-blue-600 shadow-[0_2px_12px_rgba(59,130,246,0.3)] border-blue-400/30', hoverText: 'group-hover:text-blue-400' },
        { id: 'records', label: 'Bakım Kayıtları', icon: <Wrench size={16} />, theme: 'from-amber-500 to-amber-600 shadow-[0_2px_12px_rgba(245,158,11,0.3)] border-amber-400/30', hoverText: 'group-hover:text-amber-400' },
        { id: 'shopping', label: 'İhtiyaç Listesi', icon: <ShoppingCart size={16} />, theme: 'from-emerald-500 to-emerald-600 shadow-[0_2px_12px_rgba(16,185,129,0.3)] border-emerald-400/30', hoverText: 'group-hover:text-emerald-400' },
        { id: 'stock', label: 'Stok / Parça', icon: <Package size={16} />, theme: 'from-violet-500 to-violet-600 shadow-[0_2px_12px_rgba(139,92,246,0.3)] border-violet-400/30', hoverText: 'group-hover:text-violet-400' },
        { id: 'mechanics', label: 'Servis Rehberi', icon: <MapPin size={16} />, theme: 'from-rose-500 to-rose-600 shadow-[0_2px_12px_rgba(244,63,94,0.3)] border-rose-400/30', hoverText: 'group-hover:text-rose-400' },
        { id: 'photos', label: 'Fotoğraflar', icon: <FolderOpen size={16} />, theme: 'from-sky-500 to-sky-600 shadow-[0_2px_12px_rgba(14,165,233,0.3)] border-sky-400/30', hoverText: 'group-hover:text-sky-400' },
    ];


    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [editingStockId, setEditingStockId] = useState(null);
    const [stockForm, setStockForm] = useState({ name: '', category: 'Genel', count: '', price: '', notes: '', files: [] });
    const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    // ─── İhtiyaç Listesi ──────────────────────────────────────────────────
    const [isShoppingModalOpen, setIsShoppingModalOpen] = useState(false);
    const [editingShoppingId, setEditingShoppingId] = useState(null);
    const [shoppingForm, setShoppingForm] = useState({ name: '', description: '', price: '', link: '' });
    const [localShoppingItems, setLocalShoppingItems] = useState([]);

    useEffect(() => {
        setLocalShoppingItems(shoppingItems || []);
    }, [shoppingItems]);

    const handleAddShoppingItem = (e) => {
        e.preventDefault();
        const payload = {
            name: shoppingForm.name,
            description: shoppingForm.description,
            price: parseFloat(shoppingForm.price) || 0,
            link: shoppingForm.link,
            status: 'pending'
        };

        if (editingShoppingId) {
            updateShoppingItem(editingShoppingId, payload);
        } else {
            addShoppingItem(payload);
        }

        setIsShoppingModalOpen(false);
        setEditingShoppingId(null);
        setShoppingForm({ name: '', description: '', price: '', link: '' });
    };

    const handleReorder = (newOrder) => {
        setLocalShoppingItems(newOrder);
        updateShoppingItemsOrder(newOrder);
    };

    const handleAddStock = (e) => {
        e.preventDefault();
        let selectedCategory = stockForm.category;

        if (showNewCategoryInput && newCategoryName) {
            addSparePartCategory(newCategoryName);
            selectedCategory = newCategoryName;
        }

        const payload = {
            name: stockForm.name,
            category: selectedCategory,
            count: parseInt(stockForm.count) || 1,
            price: parseFloat(stockForm.price) || 0,
            notes: stockForm.notes,
            files: stockForm.files || []
        };

        if (editingStockId) {
            updateSparePart(editingStockId, payload);
        } else {
            addSparePart(payload);
        }

        setIsStockModalOpen(false);
        setEditingStockId(null);
        setStockForm({ name: '', category: sparePartCategories ? sparePartCategories[0] : 'Genel', count: '', price: '', notes: '', files: [] });
        setShowNewCategoryInput(false);
        setNewCategoryName('');
    };

    const getDynamicActionButton = () => {
        if (activeTab === 'records') {
            return { id: 'records', label: 'Bakım Ekle', icon: <Plus size={16} />, className: 'bg-gradient-to-b from-amber-500 to-amber-600 text-white shadow-[0_2px_12px_rgba(245,158,11,0.3)] border border-amber-400/30', onClick: () => { setEditingMaintenanceId(null); setMaintenanceForm({ date: new Date().toISOString().split('T')[0], type: 'Periyodik Bakım', description: '', mechanicId: '', km: '', cost: '', files: [], doneItems: [] }); setIsMaintenanceModalOpen(true); } };
        }
        if (activeTab === 'shopping') {
            return { id: 'shopping', label: 'İhtiyaç Ekle', icon: <Plus size={16} />, className: 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-[0_2px_12px_rgba(16,185,129,0.3)] border border-emerald-400/30', onClick: () => { setEditingShoppingId(null); setShoppingForm({ name: '', description: '', price: '', link: '' }); setIsShoppingModalOpen(true); } };
        }
        if (activeTab === 'stock') {
            return { id: 'stock', label: 'Stok Ekle', icon: <Plus size={16} />, className: 'bg-gradient-to-b from-violet-500 to-violet-600 text-white shadow-[0_2px_12px_rgba(139,92,246,0.3)] border border-violet-400/30', onClick: () => { setEditingStockId(null); setStockForm({ name: '', category: (sparePartCategories && sparePartCategories.length > 0) ? sparePartCategories[0] : 'Genel', count: '', price: '', notes: '', files: [] }); setShowNewCategoryInput(false); setIsStockModalOpen(true); } };
        }
        if (activeTab === 'mechanics') {
            return { id: 'mechanics', label: 'Tamirci Ekle', icon: <Plus size={16} />, className: 'bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_2px_12px_rgba(244,63,94,0.3)] border border-rose-400/30', onClick: () => { setEditingMechanicId(null); setMechanicForm({ name: '', masterName: '', phone: '', location: '', mapLink: '', type: 'Genel Bakım', notes: '' }); setIsMechanicModalOpen(true); } };
        }
        if (activeTab === 'photos') {
            if (openedFolder) {
                return { id: 'photos-file', label: 'Dosya Ekle', icon: <Plus size={16} />, className: 'bg-white/10 hover:bg-white/20 text-sky-300 border border-white/10', onClick: () => { setEditingFolderId(openedFolder.id); setFolderForm({ name: openedFolder.name, description: openedFolder.description, files: openedFolder.files || [] }); setIsFolderModalOpen(true); } };
            }
            return { id: 'photos-album', label: 'Yeni Albüm', icon: <FolderPlus size={16} />, className: 'bg-gradient-to-b from-sky-500 to-sky-600 text-white shadow-[0_2px_12px_rgba(14,165,233,0.3)] border border-sky-400/30', onClick: () => { setEditingFolderId(null); setFolderForm({ name: '', description: '', files: [] }); setIsFolderModalOpen(true); } };
        }
        return null;
    };
    const dynamicActionBtn = getDynamicActionButton();

    return (
        <div className="space-y-5 animate-in fade-in duration-500 relative pb-ios-nav">

            {/* Tab Bar Container (Integrated Apple Style) */}
            <div className="flex items-center w-full z-20 relative">
                {/* Segmented Control Bar */}
                <div className="flex bg-[#111113]/80 backdrop-blur-xl p-1.5 rounded-2xl shadow-inner ring-1 ring-black/20 w-full border border-white/5 items-center flex-wrap">
                    
                    {/* Tabs */}
                    {tabs.map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all duration-300 flex-1 justify-center whitespace-nowrap outline-none group ${
                                    isActive ? 'text-white font-medium' : 'text-slate-400 font-medium hover:text-slate-200'
                                }`}>
                                
                                {/* Hover Arka Planı */}
                                {!isActive && (
                                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 rounded-xl transition-colors duration-300 -z-10" />
                                )}

                                {/* Aktif Tab Göstergesi (Pill) */}
                                {isActive && (
                                    <motion.div
                                        layoutId="maintenance-active-tab-apple"
                                        className={`absolute inset-0 bg-gradient-to-b rounded-xl border ${tab.theme}`}
                                        style={{ zIndex: 0 }}
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 400, damping: 32, mass: 0.8 }}
                                    />
                                )}
                                <span className="relative z-10 flex items-center gap-2 drop-shadow-md">
                                    <span className={`${isActive ? 'text-white/90' : `text-slate-500 ${tab.hoverText}`} transition-colors duration-300`}>
                                        {tab.icon}
                                    </span>
                                    {tab.label}
                                </span>
                            </button>
                        );
                    })}

                    {/* Integrated Dynamic Action Button */}
                    <AnimatePresence>
                        {dynamicActionBtn && (
                            <motion.div
                                key="dynamic-action-wrapper"
                                initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                                animate={{ width: 'auto', opacity: 1, marginLeft: 8 }}
                                exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                                className="overflow-hidden flex-shrink-0 flex items-stretch"
                            >
                                <AnimatePresence mode="popLayout">
                                    <motion.button
                                        key={dynamicActionBtn.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2, ease: "easeInOut" }}
                                        onClick={dynamicActionBtn.onClick}
                                        className={`px-4 py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 whitespace-nowrap outline-none border-none transition-colors ${dynamicActionBtn.className}`}
                                    >
                                        {dynamicActionBtn.icon}
                                        <span className="text-sm">{dynamicActionBtn.label}</span>
                                    </motion.button>
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* ─── TAB İÇERİKLERİ ─── */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
                    className="w-full"
                >
                    {/* ─── ARAÇ BİLGİLERİ ─── */}
                    {activeTab === 'info' && (
                <div className="space-y-4">
                    <div className="glass-panel p-5">
                        <h3 className="font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2"><Truck size={18} className="text-amber-400" /> Araç Bilgileri</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                                { key: 'plate', label: 'Çekici Plakası', src: 'truck' },
                                { key: 'trailerPlate', label: 'Dorse Plakası', src: 'truck' },
                                { key: 'brand', label: 'Model & Marka', src: 'truck' },
                                { key: 'inspection', label: 'Çekici Muayene Tarihi', src: 'docs' },
                                { key: 'trailerInspection', label: 'Dorse Muayene Tarihi', src: 'docs' },
                                { key: 'odp', label: 'Sigorta Bitiş Tarihi', src: 'docs' },
                            ].map(field => {
                                const isDoc = field.src === 'docs';
                                const rawValue = isDoc ? (docs?.[field.key]?.date || '') : (activeTruckData?.[field.key] || '');
                                const displayValue = (isDoc && rawValue) ? rawValue.split('-').reverse().join('.') : rawValue;

                                return (
                                    <div key={field.key} className="flex items-center justify-between gap-2 bg-white/5 rounded-xl p-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-slate-500 mb-0.5">{field.label}</p>
                                            {(!isDoc && editingField === field.key) ? (
                                                <div className="flex items-center gap-2 mt-1">
                                                    <input type={field.type || 'text'} value={editValue}
                                                        onChange={e => setEditValue(e.target.value)}
                                                        className="glass-input px-2 py-1 text-sm flex-1" autoFocus />
                                                    <button onClick={() => saveEdit(field.key)} className="text-emerald-400 hover:text-emerald-300 p-1">
                                                        <Check size={16} />
                                                    </button>
                                                    <button onClick={() => setEditingField(null)} className="text-slate-500 hover:text-[var(--text-primary)] p-1">
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <p className="text-[var(--text-primary)] font-semibold text-sm truncate">{displayValue || '—'}</p>
                                            )}
                                        </div>
                                        {!isDoc && editingField !== field.key && (
                                            <button onClick={() => startEdit(field.key, rawValue)}
                                                className="text-slate-600 hover:text-amber-400 p-1 rounded transition flex-shrink-0">
                                                <Pencil size={14} />
                                            </button>
                                        )}
                                        {isDoc && (
                                            <div className="text-slate-600 p-1 flex-shrink-0" title="Ceza ve Belgeler sekmesinden düzenleyin">
                                                <FileText size={14} className="opacity-50 hover:opacity-100 transition-opacity" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Şoförler */}
                    <div className="glass-panel p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2"><Users size={18} className="text-amber-400" /> Şoförler</h3>
                            <span className="text-[10px] text-slate-500 italic">Admin Paneli &gt; Kullanıcılar &gt; Yeni Kullanıcı &gt; Rol: Şoför</span>
                        </div>

                        <div className="space-y-2">
                            {(allDrivers && allDrivers.length > 0) ? allDrivers.map((d, i) => (
                                <div key={d.id || i} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2 border border-transparent hover:border-white/10 transition-colors">
                                    <div className="bg-amber-500/20 p-1.5 rounded-lg">
                                        <User size={14} className="text-amber-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[var(--text-primary)] text-sm font-medium truncate">{d.name}</p>
                                        {d.phone && <p className="text-slate-500 text-xs">{d.phone}</p>}
                                    </div>
                                    <button
                                        onClick={() => handleDeleteDriverEntry(d)}
                                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all flex-shrink-0"
                                        title="Şoförü Sil"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                    <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
                                        Şoför
                                    </span>
                                </div>
                            )) : (
                                <div className="text-slate-500 text-sm text-center py-6 bg-white/5 rounded-xl border border-dashed border-[var(--border-color)]">
                                    <User size={20} className="mx-auto mb-2 text-slate-600" />
                                    <p>Bu şirkete atanmış şoför yok.</p>
                                    <p className="text-xs mt-1 text-slate-600">Admin Paneli &gt; Kullanıcılar &gt; Yeni Kullanıcı &gt; Rol: Şoför</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── BAKIM KAYITLARI ─── */}
            {activeTab === 'records' && (
                <div className="space-y-4">
                    {/* YAKLAŞAN BAKIMLAR PANELİ */}
                    <div className="glass-panel p-5 border border-amber-500/10">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <AlertTriangle size={18} className="text-amber-400" /> Yaklaşan Bakımlar
                            </h3>
                            <div className="flex items-center gap-3">
                                <div className="text-sm bg-white/5 px-3 py-1.5 rounded-lg border border-[var(--border-color)]">
                                    <span className="text-slate-500">Güncel KM: </span>
                                    <span className="font-bold text-[var(--text-primary)]">{currentKm > 0 ? currentKm.toLocaleString() : '—'}</span>
                                </div>
                                <button onClick={() => {
                                    setTemplateForm([...(periodicMaintenanceItems || [])]);
                                    setIsTemplateModalOpen(true);
                                }} className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-500/20 transition-colors flex items-center gap-1">
                                    <SettingsIcon size={14} /> Şablonlar
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {(periodicMaintenanceItems || []).map(item => {
                                const lastMaintenance = maintenanceRecords
                                    .filter(m => m.type === 'Periyodik Bakım' && m.doneItems && m.doneItems.includes(item.id))
                                    .sort((a, b) => b.km - a.km)[0];
                                
                                const lastKm = lastMaintenance ? (lastMaintenance.km || 0) : 0;
                                const intervalKm = parseInt(item.intervalKm) || 40000;
                                const nextDueKm = lastKm === 0 ? intervalKm : lastKm + intervalKm;
                                const remainingKm = nextDueKm - currentKm;
                                
                                const progress = Math.min(100, Math.max(0, ((intervalKm - remainingKm) / intervalKm) * 100));
                                
                                const warningThreshold = parseInt(item.warningKm) || 2000;
                                
                                let statusColor = "bg-emerald-500";
                                let textColor = "text-emerald-400";
                                let bgColor = "bg-emerald-500/10 border-emerald-500/20";
                                
                                if (remainingKm <= 0) {
                                    statusColor = "bg-red-500";
                                    textColor = "text-red-400";
                                    bgColor = "bg-red-500/10 border-red-500/20";
                                } else if (remainingKm <= warningThreshold) {
                                    statusColor = "bg-amber-500";
                                    textColor = "text-amber-400";
                                    bgColor = "bg-amber-500/10 border-amber-500/20";
                                }

                                return (
                                    <div key={item.id} className={`p-3 rounded-xl border ${bgColor} flex flex-col gap-2 relative overflow-hidden group`}>
                                        <div className="flex justify-between items-center z-10">
                                            <span className={`font-semibold ${textColor} text-sm`}>{item.name}</span>
                                            <span className={`text-xs font-bold ${textColor}`}>
                                                {remainingKm <= 0 ? 'GEÇTİ!' : `Kalan: ${remainingKm.toLocaleString()}`}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-[var(--text-secondary)] z-10">
                                            Son: {lastKm > 0 ? lastKm.toLocaleString() : 'Yok'} | Değişim: {nextDueKm.toLocaleString()}
                                        </div>
                                        <div className="w-full bg-black/20 h-1.5 rounded-full mt-1 z-10 overflow-hidden">
                                            <div className={`h-full ${statusColor} transition-all duration-1000`} style={{ width: `${progress}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                            {(!periodicMaintenanceItems || periodicMaintenanceItems.length === 0) && (
                                <div className="col-span-full text-center text-sm text-slate-500 py-4 border border-dashed border-[var(--border-color)] rounded-xl">
                                    Henüz periyodik bakım şablonu tanımlanmamış. Şablonlar butonundan ekleyebilirsiniz.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="glass-panel overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse" style={{ minWidth: '480px' }}>
                                <thead>
                                    <tr className="bg-white/5 border-b border-[var(--border-color)] text-[var(--text-secondary)] text-xs uppercase tracking-wide">
                                        <th className="p-3 pl-4 text-left">Tarih</th>
                                        <th className="p-3 text-left">Tür</th>
                                        <th className="p-3 text-left">Açıklama</th>
                                        <th className="p-3 text-center">KM</th>
                                        <th className="p-3 text-right">Tutar</th>
                                        <th className="p-3 text-center">Ekler</th>
                                        <th className="p-3 text-center w-24">İşlemler</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {activeMaintenanceRecords.length > 0 ? activeMaintenanceRecords.map(rec => (
                                        <tr key={rec.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="p-3 pl-4 text-[var(--text-primary)] text-sm whitespace-nowrap">{new Date(rec.date).toLocaleDateString('tr-TR')}</td>
                                            <td className="p-3">
                                                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">{rec.type}</span>
                                            </td>
                                            <td className="p-3 text-[var(--text-primary)] text-sm">
                                                <div>{rec.description}</div>
                                                {rec.mechanicName && rec.mechanicName !== 'Belirtilmedi' && (
                                                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                                        <MapPin size={10} /> {rec.mechanicName}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-3 text-center text-[var(--text-secondary)] text-sm">{rec.km > 0 ? `${rec.km.toLocaleString()} km` : '—'}</td>
                                            <td className="p-3 text-right text-amber-400 font-bold text-sm">₺{rec.cost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                            <td className="p-3 text-center">
                                                {rec.files && rec.files.length > 0 ? (
                                                    <button onClick={() => setViewFiles({ title: rec.description || 'Bakım Kaydı', files: rec.files })}
                                                        className="text-xs text-amber-400 hover:text-amber-300 flex items-center justify-center gap-1 transition-colors whitespace-nowrap mx-auto">
                                                        <Paperclip size={11} /> {rec.files.length} Ek
                                                    </button>
                                                ) : <span className="text-slate-700">—</span>}
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex justify-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => {
                                                        const matchedMechanic = mechanics.find(m => m.name === rec.mechanicName);
                                                        setEditingMaintenanceId(rec.id);
                                                        setMaintenanceForm({
                                                            date: rec.date || new Date().toISOString().split('T')[0],
                                                            type: rec.type || 'Periyodik Bakım',
                                                            description: rec.description || '',
                                                            mechanicId: matchedMechanic ? matchedMechanic.id : '',
                                                            km: rec.km || '',
                                                            cost: rec.cost || '',
                                                            files: rec.files || [],
                                                            doneItems: rec.doneItems || []
                                                        });
                                                        setIsMaintenanceModalOpen(true);
                                                    }}
                                                        className="p-1.5 rounded-lg transition-all text-slate-600 hover:text-amber-400 hover:bg-amber-500/10">
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button onClick={() => handleDeleteMaintenance(rec.id)}
                                                        className="p-1.5 rounded-lg transition-all text-slate-600 hover:text-red-400 hover:bg-red-500/10">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan="6" className="p-8 text-center text-slate-500">
                                            <Wrench size={32} className="mx-auto mb-3 opacity-30" />
                                            <p className="text-[var(--text-secondary)] font-medium">Henüz Bakım Kaydı Yok</p>
                                        </td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── İHTİYAÇ LİSTESİ ─── */}
            {activeTab === 'shopping' && (
                <div className="space-y-4">


                    <div className="space-y-2">
                        <Reorder.Group axis="y" values={localShoppingItems} onReorder={handleReorder} className="space-y-2">
                            {localShoppingItems.map((item) => (
                                <Reorder.Item key={item.id} value={item} className="relative group">
                                    <div className="glass-panel p-4 flex items-center gap-4 group-hover:bg-white/5 transition-all border border-white/5">
                                        <div className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 p-1">
                                            <GripVertical size={20} />
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-[var(--text-primary)] truncate">{item.name}</h4>
                                            <p className="text-sm text-[var(--text-secondary)] mt-0.5 line-clamp-1">{item.description || 'Açıklama yok'}</p>
                                        </div>

                                        <div className="flex items-center gap-4 shrink-0">
                                            {item.price > 0 && (
                                                <div className="text-right hidden sm:block">
                                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Tahmini Fiyat</p>
                                                    <p className="font-bold text-emerald-400">₺{item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                                                </div>
                                            )}
                                            
                                            <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                {item.link && (
                                                    <a href={item.link} target="_blank" rel="noopener noreferrer" 
                                                       className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                                                       title="Ürün Linki">
                                                        <ExternalLink size={18} />
                                                    </a>
                                                )}
                                                <button onClick={() => {
                                                    setEditingShoppingId(item.id);
                                                    setShoppingForm({
                                                        name: item.name,
                                                        description: item.description || '',
                                                        price: item.price || '',
                                                        link: item.link || ''
                                                    });
                                                    setIsShoppingModalOpen(true);
                                                }}
                                                    className="p-2 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all"
                                                    title="Düzenle">
                                                    <Pencil size={18} />
                                                </button>
                                                <button onClick={() => deleteShoppingItem(item.id, item.name)}
                                                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                                    title="Sil">
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </Reorder.Item>
                            ))}
                        </Reorder.Group>

                        {localShoppingItems.length === 0 && (
                            <div className="glass-panel p-10 text-center text-slate-500">
                                <ShoppingCart size={40} className="mx-auto mb-4 opacity-30 text-amber-400" />
                                <h4 className="text-[var(--text-primary)] font-medium mb-1">Liste Boş</h4>
                                <p className="text-sm">Henüz bir ihtiyaç eklemediniz. "İhtiyaç Ekle" butonu ile başlayın.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {activeTab === 'stock' && (
                <div className="space-y-4">


                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(spareParts || []).filter(p => !p.deleted).map(item => (
                            <div key={item.id} className="glass-panel p-5 flex flex-col gap-3 relative group">
                                <div className="absolute top-4 right-4 flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition">
                                    <button onClick={() => {
                                        setEditingStockId(item.id);
                                        setStockForm(item);
                                        setIsStockModalOpen(true);
                                    }} className="text-slate-600 hover:text-amber-400 p-1 rounded">
                                        <Pencil size={16} />
                                    </button>
                                    <button onClick={() => deleteSparePart(item.id, item.name)} className="text-slate-600 hover:text-red-400 p-1 rounded">
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="flex items-start gap-3 w-5/6">
                                    {item.files && item.files.length > 0 && item.files[0].type?.startsWith('image/') ? (
                                        <img src={item.files[0].data} className="w-12 h-12 rounded-lg object-cover bg-black/50 border border-[var(--border-color)]" alt="" />
                                    ) : (
                                        <div className="bg-amber-500/20 w-12 h-12 flex items-center justify-center rounded-lg text-amber-400 border border-amber-500/20 flex-shrink-0"><Package size={24} /></div>
                                    )}
                                    <div className="flex-1 min-w-0 pr-2 pt-0.5">
                                        <h4 className="font-bold text-[var(--text-primary)] text-base truncate">{item.name}</h4>
                                        <span className="text-[10px] bg-white/5 border border-[var(--border-color)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full mt-1 inline-block uppercase tracking-wider">{item.category}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3 mt-1">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-slate-500">Miktar</span>
                                        <span className="font-semibold text-[var(--text-primary)]">{item.count} Adet <span className="text-slate-500 font-normal text-xs ml-1">(Stokta)</span></span>
                                    </div>
                                    {item.price > 0 && (
                                        <div className="flex flex-col text-right">
                                            <span className="text-xs text-slate-500">Birim Fiyat</span>
                                            <span className="font-bold text-amber-400">₺{item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    )}
                                </div>

                                {item.notes && (
                                    <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2 italic">{item.notes}</p>
                                )}
                            </div>
                        ))}

                        {(spareParts || []).filter(p => !p.deleted).length === 0 && (
                            <div className="col-span-full glass-panel p-10 text-center text-slate-500 mt-2">
                                <Package size={40} className="mx-auto mb-4 opacity-30 text-amber-400" />
                                <h4 className="text-[var(--text-primary)] font-medium mb-1">Stokta Ürün Yok</h4>
                                <p className="text-sm">Elinizdeki yedek parçaları, yağ ve filtre gibi bakım malzemelerini buraya ekleyebilirsiniz.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ─── SERVİS REHBERİ ─── */}
            {activeTab === 'mechanics' && (
                <div className="space-y-4">

                    <div className="flex flex-col gap-4">
                        {mechanics.map(m => (
                            <div key={m.id} className="glass-panel p-5 flex flex-col gap-3 relative group">
                                <div className="absolute top-4 right-4 flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition">
                                    <button onClick={() => {
                                        setEditingMechanicId(m.id);
                                        setMechanicForm({
                                            name: m.name, masterName: m.masterName || '', phone: m.phone || '',
                                            location: m.location || '', mapLink: m.mapLink || '', notes: m.notes || '', type: m.type || 'Genel Bakım'
                                        });
                                        setIsMechanicModalOpen(true);
                                    }} className="text-slate-600 hover:text-amber-400 p-1 rounded">
                                        <Pencil size={16} />
                                    </button>
                                    <button onClick={() => deleteMechanic(m.id)} className="text-slate-600 hover:text-red-400 p-1 rounded">
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="bg-amber-500/20 p-2.5 rounded-xl text-amber-400"><Wrench size={20} /></div>
                                    <div className="flex-1 min-w-0 pr-6">
                                        <h4 className="font-bold text-[var(--text-primary)] text-base">{m.name}</h4>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] bg-white/5 border border-[var(--border-color)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full inline-block uppercase tracking-wider">{m.type}</span>
                                            {m.location && (
                                                <a 
                                                    href={m.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.location)}`} 
                                                    target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-1 px-2 py-0.5 bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full transition-colors border border-[var(--border-color)] text-[10px] uppercase tracking-wider font-medium"
                                                >
                                                    <Map size={10} />
                                                    Haritada Aç
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 mt-1">
                                    {m.masterName && (
                                        <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                                            <User size={14} className="text-slate-500 flex-shrink-0" />
                                            <span>İlgili Kişi / Usta: <strong>{m.masterName}</strong></span>
                                        </div>
                                    )}
                                    {m.phone && (
                                        <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                                            <Phone size={14} className="text-slate-500 flex-shrink-0" />
                                            <a href={`tel:${m.phone}`} className="hover:text-amber-400 transition">{m.phone}</a>
                                        </div>
                                    )}
                                    {m.location && (
                                        <div className="flex items-start gap-2 text-sm text-[var(--text-primary)] mt-1">
                                            <MapPin size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
                                            <span className="flex-1" title={m.location}>{m.location}</span>
                                        </div>
                                    )}
                                </div>

                                {m.notes && (
                                    <div className="mt-2 pt-3 border-t border-[var(--border-color)] p-3 rounded-lg text-xs leading-relaxed text-[var(--text-secondary)] italic">
                                        <span className="font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-1"><StickyNote size={12} /> Özel Notlar:</span>
                                        {m.notes}
                                    </div>
                                )}
                            </div>
                        ))}
                        {mechanics.length === 0 && (
                            <div className="glass-panel p-10 text-center text-slate-500">
                                <Wrench size={40} className="mx-auto mb-4 opacity-30 text-amber-400" />
                                <h4 className="text-[var(--text-primary)] font-medium mb-1">Kayıtlı Servis Yok</h4>
                                <p className="text-sm">Araçlarınızın bakımını yapan sürekli çalıştığınız ustaları ve servisleri buraya ekleyebilirsiniz.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ─── FOTOĞRAFLAR VE İLGİLİ BELGELER ─── */}
            {activeTab === 'photos' && (
                <div className="space-y-4">
                    {!openedFolder ? (
                        <>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {maintenanceFolders.map(folder => (
                                    <div key={folder.id} onClick={() => setOpenedFolder(folder)}
                                        className="glass-panel p-4 flex flex-col items-center text-center cursor-pointer hover:bg-white/5 hover:-translate-y-1 hover:shadow-xl transition-all group relative">
                                        <button onClick={(e) => handleDeleteFolder(folder.id, e)} className="absolute top-2 right-2 text-slate-600 hover:text-red-400 p-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition rounded z-10">
                                            <Trash2 size={16} />
                                        </button>
                                        <button onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingFolderId(folder.id);
                                            setFolderForm({ name: folder.name, description: folder.description, files: folder.files || [] });
                                            setIsFolderModalOpen(true);
                                        }} className="absolute top-2 left-2 text-slate-600 hover:text-amber-400 p-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition rounded z-10">
                                            <Pencil size={14} />
                                        </button>
                                        <FolderOpen size={48} className="text-amber-400 mb-3 group-hover:scale-110 transition-transform duration-300" strokeWidth={1.5} />
                                        <h4 className="font-bold text-[var(--text-primary)] text-sm w-full truncate px-2">{folder.name}</h4>
                                        <p className="text-xs text-[var(--text-secondary)] mt-1">{(folder.files || []).length} Dosya</p>
                                    </div>
                                ))}
                                {maintenanceFolders.length === 0 && (
                                    <div className="col-span-2 lg:col-span-4 glass-panel p-10 text-center text-slate-500 mt-4">
                                        <FolderOpen size={40} className="mx-auto mb-4 opacity-30 text-emerald-400" />
                                        <h4 className="text-[var(--text-primary)] font-medium mb-1">Albüm Bulunamadı</h4>
                                        <p className="text-sm mb-4">Parça faturaları, kaza fotoğrafları veya özel belgeleri kategorize etmek için albüm oluşturun.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className="glass-panel p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setOpenedFolder(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-white/5 p-2 rounded-lg transition-colors">
                                        <ChevronDown size={20} className="rotate-90" />
                                    </button>
                                    <div>
                                        <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2"><FolderOpen size={18} className="text-amber-400" /> {openedFolder.name}</h3>
                                        {openedFolder.description && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{openedFolder.description}</p>}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {(openedFolder.files || []).map((file, idx) => (
                                    <div key={idx} className="glass-panel overflow-hidden border border-[var(--border-color)] group relative rounded-xl">
                                        {file.type && file.type.startsWith('image/') ? (
                                            <div className="aspect-square bg-black/50 relative overflow-hidden">
                                                <img src={file.data} alt="Belge/Fotoğraf" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm">
                                                    <button onClick={() => setViewFiles({ title: openedFolder.name, files: [file] })} className="bg-white/20 hover:bg-white/40 p-2 rounded-full text-[var(--text-primary)] transition">
                                                        <Eye size={18} />
                                                    </button>
                                                    <a href={file.data} download={file.name || 'foto'} className="bg-amber-500/50 hover:bg-amber-500 p-2 rounded-full text-[var(--text-primary)] transition">
                                                        <Download size={18} />
                                                    </a>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="aspect-square flex flex-col items-center justify-center bg-[var(--bg-panel-hover)] p-4 relative">
                                                <FileText size={40} className="text-[var(--text-secondary)] mb-3" />
                                                <p className="text-xs text-[var(--text-primary)] font-medium text-center truncate w-full">{file.name || 'Belge'}</p>
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm">
                                                    <a href={file.data} download={file.name || 'belge'} className="bg-amber-500/50 hover:bg-amber-500 p-2 rounded-full text-[var(--text-primary)] transition flex items-center gap-1 text-sm font-medium px-4">
                                                        <Download size={16} />
                                                    </a>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {(openedFolder.files || []).length === 0 && (
                                    <div className="col-span-2 lg:col-span-4 p-8 text-center text-slate-500 border border-dashed border-[var(--border-color)] rounded-xl">
                                        <p>Bu albümde henüz fotoğraf veya belge yok.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
                </motion.div>
            </AnimatePresence>

            {/* İhtiyaç Ekleme Modalı */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isShoppingModalOpen && (
                    <motion.div key="shopping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="fixed inset-0 bg-[var(--bg-panel)] backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 15 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 15 }} transition={{ duration: 0.25, ease: "easeOut" }} className="glass-panel w-full max-w-md p-6 border border-[var(--border-color)] rounded-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold flex items-center text-[var(--text-primary)]">
                                <ShoppingCart className="mr-2 text-amber-400" />
                                {editingShoppingId ? 'İhtiyacı Düzenle' : 'Yeni İhtiyaç Ekle'}
                            </h2>
                            <button onClick={() => {
                                setIsShoppingModalOpen(false);
                                setEditingShoppingId(null);
                            }} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleAddShoppingItem} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Ürün / İhtiyaç Adı</label>
                                <input type="text" required placeholder="Örn: 10W-40 Motor Yağı" className="w-full glass-input px-3 py-2" value={shoppingForm.name}
                                    onChange={e => setShoppingForm({ ...shoppingForm, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Açıklama</label>
                                <textarea rows={2} className="w-full glass-input px-3 py-2 text-sm resize-none"
                                    placeholder="Ürün detayı, marka tercihi vb..." value={shoppingForm.description}
                                    onChange={e => setShoppingForm({ ...shoppingForm, description: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Tahmini Fiyat (₺)</label>
                                <input type="number" step="0.01" placeholder="0.00" className="w-full glass-input px-3 py-2" value={shoppingForm.price}
                                    onChange={e => setShoppingForm({ ...shoppingForm, price: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1 flex items-center gap-1"><Link size={14} /> Ürün Linki (Opsiyonel)</label>
                                <input type="url" placeholder="https://..." className="w-full glass-input px-3 py-2 text-sm" value={shoppingForm.link}
                                    onChange={e => setShoppingForm({ ...shoppingForm, link: e.target.value })} />
                            </div>
                            <button type="submit" className="w-full bg-amber-600 hover:bg-amber-500 text-[var(--text-primary)] py-3 rounded-lg font-medium transition mt-2">
                                {editingShoppingId ? 'Güncelle' : 'Listeye Ekle'}
                            </button>
                        </form>
                    </motion.div>
                    </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Şablon Modalı */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isTemplateModalOpen && (
                    <motion.div key="template" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="fixed inset-0 bg-[var(--bg-panel)] backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 15 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 15 }} transition={{ duration: 0.25, ease: "easeOut" }} className="glass-panel w-full max-w-lg p-6 border border-[var(--border-color)] rounded-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold flex items-center text-[var(--text-primary)]">
                                <SettingsIcon className="mr-2 text-amber-400" />
                                Periyodik Bakım Şablonları
                            </h2>
                            <button onClick={() => setIsTemplateModalOpen(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-sm text-amber-400">
                                Aracınızın düzenli bakım periyotlarını buradan belirleyin. Kayıt eklerken bunları işaretleyebilirsiniz.
                            </div>
                            
                            <div className="space-y-4">
                                {templateForm.map((item, index) => (
                                    <div key={item.id} className="bg-white/5 border border-[var(--border-color)] rounded-xl p-4 relative group">
                                        <button onClick={() => {
                                            const newForm = templateForm.filter(t => t.id !== item.id);
                                            setTemplateForm(newForm);
                                        }} className="absolute top-2 right-2 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                                            <Trash2 size={16} />
                                        </button>
                                        
                                        <div className="space-y-3 pr-6">
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Parça / Bakım Adı</label>
                                                <input type="text" placeholder="Örn: Motor Yağı" className="w-full glass-input px-3 py-2 text-sm" value={item.name}
                                                    onChange={e => {
                                                        const newForm = [...templateForm];
                                                        newForm[index].name = e.target.value;
                                                        setTemplateForm(newForm);
                                                    }} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Periyot (Kaç KM'de Bir?)</label>
                                                    <input type="number" placeholder="Örn: 40000" className="w-full glass-input px-3 py-2 text-sm" value={item.intervalKm}
                                                        onChange={e => {
                                                            const newForm = [...templateForm];
                                                            newForm[index].intervalKm = e.target.value;
                                                            setTemplateForm(newForm);
                                                        }} />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Uyarı (Kaç KM Kala?)</label>
                                                    <input type="number" placeholder="Örn: 2000" className="w-full glass-input px-3 py-2 text-sm" value={item.warningKm || ''}
                                                        onChange={e => {
                                                            const newForm = [...templateForm];
                                                            newForm[index].warningKm = e.target.value;
                                                            setTemplateForm(newForm);
                                                        }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            <button onClick={() => {
                                setTemplateForm([...templateForm, { id: Date.now().toString(), name: '', intervalKm: '', warningKm: '' }]);
                            }} className="w-full py-3 border border-dashed border-amber-500/50 text-amber-400 hover:bg-amber-500/10 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 mt-2">
                                <Plus size={18} /> Yeni Bakım Şablonu Ekle
                            </button>
                        </div>
                        <div className="mt-6 pt-4 border-t border-[var(--border-color)]">
                            <button onClick={() => {
                                const validItems = templateForm.filter(t => t.name.trim() !== '');
                                updatePeriodicMaintenanceItems(validItems);
                                setIsTemplateModalOpen(false);
                            }} className="w-full bg-amber-600 hover:bg-amber-500 text-[var(--text-primary)] py-3 rounded-lg font-medium transition">Şablonları Kaydet</button>
                        </div>
                        </motion.div>
                    </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Bakım Ekleme Modalı */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isMaintenanceModalOpen && (
                    <motion.div key="maintenance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="fixed inset-0 bg-[var(--bg-panel)] backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 15 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 15 }} transition={{ duration: 0.25, ease: "easeOut" }} className="glass-panel w-full max-w-md p-6 border border-[var(--border-color)] rounded-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold flex items-center text-[var(--text-primary)]">
                                <Wrench className="mr-2 text-amber-400" />
                                {editingMaintenanceId ? 'Bakım Kaydını Düzenle' : 'Yeni Bakım Ekle'}
                            </h2>
                            <button onClick={() => {
                                setIsMaintenanceModalOpen(false);
                                setEditingMaintenanceId(null);
                            }} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                            <form onSubmit={handleAddMaintenance} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Tarih</label>
                                        <input type="date" required className="w-full glass-input px-3 py-2" value={maintenanceForm.date}
                                            onChange={e => setMaintenanceForm({ ...maintenanceForm, date: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Araç KM</label>
                                        <input type="number" placeholder="Örn: 450000" className="w-full glass-input px-3 py-2" value={maintenanceForm.km}
                                            onChange={e => setMaintenanceForm({ ...maintenanceForm, km: e.target.value })} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Bakım Türü</label>
                                    <div className="relative">
                                        <select className="w-full glass-input px-3 py-2 bg-[var(--bg-panel-hover)] appearance-none" value={maintenanceForm.type}
                                            onChange={e => setMaintenanceForm({ ...maintenanceForm, type: e.target.value })}>
                                            {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Açıklama</label>
                                    <textarea rows={2} required className="w-full glass-input px-3 py-2 text-sm resize-none"
                                        placeholder="Yapılan işlemi açıklayın..." value={maintenanceForm.description}
                                        onChange={e => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} />
                                </div>
                                {maintenanceForm.type === 'Periyodik Bakım' && periodicMaintenanceItems && periodicMaintenanceItems.length > 0 && (
                                    <div className="bg-white/5 border border-[var(--border-color)] rounded-xl p-4">
                                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">🛠 Yapılan İşlemler (Şablondan Seçin)</label>
                                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                            {periodicMaintenanceItems.map(item => {
                                                const isChecked = maintenanceForm.doneItems && maintenanceForm.doneItems.includes(item.id);
                                                return (
                                                    <label key={item.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer border border-transparent hover:border-white/10 transition-colors">
                                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${isChecked ? 'bg-amber-500 border-amber-500 text-[var(--text-primary)]' : 'border-slate-500 text-transparent'}`}>
                                                            <Check size={12} strokeWidth={3} />
                                                        </div>
                                                        <input 
                                                            type="checkbox" 
                                                            className="hidden" 
                                                            checked={isChecked} 
                                                            onChange={() => {
                                                                const currentDone = maintenanceForm.doneItems || [];
                                                                const nextDone = isChecked 
                                                                    ? currentDone.filter(id => id !== item.id)
                                                                    : [...currentDone, item.id];
                                                                setMaintenanceForm({ ...maintenanceForm, doneItems: nextDone });
                                                            }} 
                                                        />
                                                        <span className={`text-sm truncate ${isChecked ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}>{item.name}</span>
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Tamirci</label>
                                        <div className="relative">
                                            <select className="w-full glass-input px-3 py-2 bg-[var(--bg-panel-hover)] appearance-none" value={maintenanceForm.mechanicId}
                                                onChange={e => setMaintenanceForm({ ...maintenanceForm, mechanicId: e.target.value })}>
                                                <option value="">Belirtilmedi</option>
                                                {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                            </select>
                                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Toplam Tutar (TL)</label>
                                        <input type="number" step="0.01" required placeholder="Örn: 5000" className="w-full glass-input px-3 py-2" value={maintenanceForm.cost}
                                            onChange={e => setMaintenanceForm({ ...maintenanceForm, cost: e.target.value })} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">📎 Tamir Belgesi / Fotoğraf</label>
                                    <FileUpload files={maintenanceForm.files} onChange={files => setMaintenanceForm({ ...maintenanceForm, files })} />
                                </div>
                                <button type="submit" className="w-full bg-amber-600 hover:bg-amber-500 text-[var(--text-primary)] py-3 rounded-lg font-medium transition mt-2">{editingMaintenanceId ? 'Bakımı Güncelle' : 'Bakımı Kaydet'}</button>
                            </form>
                        </div>
                    </motion.div>
                    </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ─── TAMİRCİ EKLEME MODALİ ─── */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isMechanicModalOpen && (
                    <motion.div key="mechanic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[var(--bg-panel)] backdrop-blur-sm">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 15 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 15 }} transition={{ duration: 0.25, ease: "easeOut" }} className="glass-panel w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
                        <button onClick={() => {
                            setIsMechanicModalOpen(false);
                            setEditingMechanicId(null);
                        }} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-5 flex items-center gap-2">
                            <MapPin className="text-amber-500" /> {editingMechanicId ? 'Tamirciyi Düzenle' : 'Tamirci / Servis Ekle'}
                        </h3>
                        <form onSubmit={handleAddMechanic} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Servis / Dükkan Adı</label>
                                    <input type="text" required placeholder="Örn: Ankara İveco Servisi" className="w-full glass-input px-4 py-2" value={mechanicForm.name}
                                        onChange={e => setMechanicForm({ ...mechanicForm, name: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">İlgili Usta / Kişi</label>
                                    <input type="text" placeholder="Örn: Ahmet Usta" className="w-full glass-input px-4 py-2" value={mechanicForm.masterName}
                                        onChange={e => setMechanicForm({ ...mechanicForm, masterName: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Telefon</label>
                                    <input type="text" placeholder="0555 555 55 55" className="w-full glass-input px-4 py-2" value={mechanicForm.phone}
                                        onChange={e => setMechanicForm({ ...mechanicForm, phone: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Uzmanlık Alanı</label>
                                    <div className="relative">
                                        <select className="w-full glass-input px-3 py-2 bg-[var(--bg-panel-hover)] appearance-none" value={mechanicForm.type}
                                            onChange={e => setMechanicForm({ ...mechanicForm, type: e.target.value })}>
                                            {['Genel Bakım', 'Yetkili Servis', 'Lastik', 'Motor', 'Fren', 'Elektrik', 'Kaporta', 'Dorse', 'Diğer'].map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Açık Adres / Konum</label>
                                <input type="text" required placeholder="Örn: Şaşmaz Oto Sanayi, Ankara" className="w-full glass-input px-4 py-2" value={mechanicForm.location}
                                    onChange={e => setMechanicForm({ ...mechanicForm, location: e.target.value })} />
                            </div>
                            <div className="bg-white/5 p-3 rounded-lg border border-[var(--border-color)]">
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2 flex justify-between">
                                    <span>Konum Linki (Apple / Google Haritalar)</span>
                                    {mechanicForm.location && (
                                        <button type="button" onClick={() => {
                                            if (mechanicForm.location) {
                                                setMechanicForm({ ...mechanicForm, mapLink: `https://maps.apple.com/?q=${encodeURIComponent(mechanicForm.location)}` });
                                            }
                                        }} className="text-xs text-amber-400 flex items-center gap-1 hover:text-amber-300"><Map size={12} /> Apple'da Bul</button>
                                    )}
                                </label>
                                <input type="url" placeholder="https://maps.app.goo.gl/..." className="w-full glass-input px-3 py-2 text-sm" value={mechanicForm.mapLink}
                                    onChange={e => setMechanicForm({ ...mechanicForm, mapLink: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Notlar (Servis Hakkında Bilgiler, Fiyat vs.)</label>
                                <textarea rows={2} placeholder="Sadece fren işleri yapıyor, parça dışarıdan..." className="w-full glass-input px-3 py-2 text-sm resize-none" value={mechanicForm.notes}
                                    onChange={e => setMechanicForm({ ...mechanicForm, notes: e.target.value })} />
                            </div>
                            <button type="submit" className="w-full bg-amber-600 hover:bg-amber-500 text-[var(--text-primary)] py-3 rounded-lg font-medium transition">Servisi Kaydet</button>
                        </form>
                    </motion.div>
                    </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ─── ALBÜM / KLASÖR EKLEME MODALİ ─── */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isFolderModalOpen && (
                    <motion.div key="folder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[var(--bg-panel)] backdrop-blur-sm">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 15 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 15 }} transition={{ duration: 0.25, ease: "easeOut" }} className="glass-panel w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
                        <button onClick={() => setIsFolderModalOpen(false)} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-5 flex items-center gap-2"><FolderOpen className="text-emerald-500" /> {editingFolderId ? 'Albümü Düzenle' : 'Yeni Albüm Ekle'}</h3>
                        <form onSubmit={handleSaveFolder} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Albüm / Klasör Adı</label>
                                <input type="text" required placeholder="Örn: 2026 Kaza Raporları" className="w-full glass-input px-4 py-2" value={folderForm.name}
                                    onChange={e => setFolderForm({ ...folderForm, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Açıklama (Opsiyonel)</label>
                                <textarea rows={2} placeholder="İzmir seferindeki kazaya ait tutanaklar..." className="w-full glass-input px-4 py-2 text-sm resize-none" value={folderForm.description}
                                    onChange={e => setFolderForm({ ...folderForm, description: e.target.value })} />
                            </div>
                            <div className="pt-2">
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">📸 Dosyaları Seçin</label>
                                <FileUpload files={folderForm.files} onChange={files => setFolderForm({ ...folderForm, files })} />
                            </div>
                            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-[var(--text-primary)] py-3 rounded-lg font-medium transition mt-2">{editingFolderId ? 'Albümü Güncelle' : 'Albümü Oluştur'}</button>
                        </form>
                    </motion.div>
                    </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ─── STOK EKLEME MODALİ ─── */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isStockModalOpen && (
                    <motion.div key="stock" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[var(--bg-panel)] backdrop-blur-sm">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 15 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 15 }} transition={{ duration: 0.25, ease: "easeOut" }} className="glass-panel w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
                        <button onClick={() => {
                            setIsStockModalOpen(false);
                            setEditingStockId(null);
                        }} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-5 flex items-center gap-2">
                            <Package className="text-amber-500" /> {editingStockId ? 'Ekli Ürünü Düzenle' : 'Yeni Stok / Parça Ekle'}
                        </h3>
                        <form onSubmit={handleAddStock} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Parça / Ürün Adı</label>
                                <input type="text" required placeholder="Örn: 20W-50 Motor Yağı" className="w-full glass-input px-4 py-2" value={stockForm.name}
                                    onChange={e => setStockForm({ ...stockForm, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Miktar (Adet / Litre)</label>
                                    <input type="number" required placeholder="Örn: 2" className="w-full glass-input px-4 py-2" value={stockForm.count}
                                        onChange={e => setStockForm({ ...stockForm, count: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Birim Fiyatı (TL) <span className="text-slate-500 text-xs italic">Opsiyonel</span></label>
                                    <input type="number" step="0.01" className="w-full glass-input px-4 py-2" value={stockForm.price}
                                        onChange={e => setStockForm({ ...stockForm, price: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Kategori</label>
                                {showNewCategoryInput ? (
                                    <div className="flex gap-2">
                                        <input type="text" required placeholder="Yeni kategori adı (Örn: Motor Parçaları)" className="flex-1 glass-input px-4 py-2" value={newCategoryName}
                                            onChange={e => setNewCategoryName(e.target.value)} autoFocus />
                                        <button type="button" onClick={() => setShowNewCategoryInput(false)} className="bg-white/5 border border-[var(--border-color)] px-3 py-2 rounded-lg text-[var(--text-primary)] hover:text-[var(--text-primary)] transition">İptal</button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <select className="w-full glass-input px-3 py-2 bg-[var(--bg-panel-hover)] appearance-none" value={stockForm.category}
                                            onChange={e => {
                                                if (e.target.value === 'YENI_EKLE') {
                                                    setShowNewCategoryInput(true);
                                                } else {
                                                    setStockForm({ ...stockForm, category: e.target.value });
                                                }
                                            }}>
                                            {(sparePartCategories || []).map(c => <option key={c} value={c}>{c}</option>)}
                                            <option value="YENI_EKLE" className="text-amber-400 font-bold">+ Yeni Kategori Ekle</option>
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Özel Notlar (Opsiyonel)</label>
                                <textarea rows={2} placeholder="Sadece kışın kullanılıyor..." className="w-full glass-input px-3 py-2 text-sm resize-none" value={stockForm.notes}
                                    onChange={e => setStockForm({ ...stockForm, notes: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">📸 Ürün / Parça Fotoğrafı (Opsiyonel)</label>
                                <FileUpload files={stockForm.files} onChange={files => setStockForm({ ...stockForm, files })} />
                            </div>
                            <button type="submit" className="w-full bg-amber-600 hover:bg-amber-500 text-[var(--text-primary)] py-3 rounded-lg font-medium transition">{editingStockId ? 'Stok Güncelle' : 'Stoğa Ekle'}</button>
                        </form>
                    </motion.div>
                    </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Dosya Görüntüleyici Modal */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {viewFiles && (
                    <motion.div key="viewFiles" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[var(--bg-panel)] backdrop-blur-sm">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 15 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 15 }} transition={{ duration: 0.25, ease: "easeOut" }} className="glass-panel w-full max-w-2xl p-6 relative">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <FileText className="text-amber-400" />
                                {viewFiles.title} İçin Ekler
                            </h3>
                            <button onClick={() => setViewFiles(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                            {viewFiles.files.map((file, idx) => (
                                <div key={idx} className="bg-white/5 border border-[var(--border-color)] rounded-xl overflow-hidden">
                                    {/* Preview if image */}
                                    {file.type && file.type.startsWith('image/') ? (
                                        <div className="bg-black/30 w-full flex justify-center p-4">
                                            <img src={file.data} alt="Belge/Makbuz" className="max-w-full max-h-[400px] object-contain rounded" />
                                        </div>
                                    ) : (
                                        <div className="p-8 flex flex-col items-center justify-center bg-white/5">
                                            <FileText size={48} className="text-[var(--text-secondary)] mb-3" />
                                            <p className="text-[var(--text-primary)] font-medium">{file.name || 'Belge dosyası'}</p>
                                        </div>
                                    )}

                                    {/* Footer with download */}
                                    <div className="p-4 bg-white/5 border-t border-[var(--border-color)] flex justify-between items-center">
                                        <span className="text-sm text-[var(--text-secondary)] truncate max-w-[70%]">{file.name || 'Ek_Belge'}</span>
                                        <a href={file.data} download={file.name || 'Belge'}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-400 hover:text-[var(--text-primary)] bg-amber-500/10 hover:bg-amber-500/30 border border-amber-500/20 rounded-lg transition-colors">
                                            <Download size={14} /> İndir
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                    </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

export default Maintenance;

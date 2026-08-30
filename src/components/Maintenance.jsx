import React, { useState, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Wrench, Plus, Calendar, X, MapPin, Truck, Trash2, Pencil, Check, User, Users, FileText, StickyNote, AlertCircle, ChevronDown, Download, Eye, Paperclip, FolderOpen, FolderPlus, Map, Phone, Package, ShoppingCart, Link, GripVertical, ExternalLink, Settings as SettingsIcon, AlertTriangle, CheckCircle, Disc, Menu } from 'lucide-react';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import { DataContext } from '../context/DataContext';
import { useTruck } from '../context/TruckContext';
import { db } from '../services/firebaseConfig';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import FileUpload from './FileUpload';
import CustomDatePicker from './CustomDatePicker';
import { sendDiscordAlert } from '../services/discordWebhook';
import Tire3DViewer from './Tire3DViewer';

const Maintenance = ({ onOpenMenu, isMobile } = {}) => {
    const {
        maintenanceRecords, addMaintenance, deleteMaintenance, updateMaintenance,
        mechanics, addMechanic, deleteMechanic, updateMechanic,
        maintenanceFolders, addMaintenanceFolder, updateMaintenanceFolder, deleteMaintenanceFolder,
        drivers, allDrivers, updateDrivers,
        spareParts, addSparePart, updateSparePart, deleteSparePart,
        sparePartCategories, addSparePartCategory,
        shoppingItems, addShoppingItem, updateShoppingItem, deleteShoppingItem, updateShoppingItemsOrder,
        addLog, docs, fuelRecords, periodicMaintenanceItems, updatePeriodicMaintenanceItems,
        maintenanceTypes, updateMaintenanceTypes
    } = useContext(DataContext);

    const { activeTruckId, activeTruckData } = useTruck();

    const [activeTab, setActiveTab] = useState('records'); // 'records', 'info', 'shopping', 'stock', 'mechanics', 'photos'
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
        const mechanic = mechanics.find(m => m.id === maintenanceForm.mechanicId);
        const payload = {
            date: maintenanceForm.date,
            type: maintenanceForm.type,
            description: maintenanceForm.description,
            mechanicName: mechanic ? mechanic.name : 'Belirtilmedi',
            km: parseInt(maintenanceForm.km) || 0,
            cost: parseFloat(String(maintenanceForm.cost).replace(',', '.')) || 0,
            files: maintenanceForm.files,
            doneItems: maintenanceForm.type === 'Periyodik Bakım' ? (maintenanceForm.doneItems || []) : []
        };

        if (editingMaintenanceId) {
            updateMaintenance(editingMaintenanceId, payload);
        } else {
            addMaintenance(payload);
            sendDiscordAlert({
                type: 'info',
                title: '🔧 Yeni Bakım Kaydı Eklendi',
                description: 'Araç bakım kaydı oluşturuldu.',
                fields: [
                    { name: '🚛 Araç', value: String(activeTruckData?.plate || '—'), inline: true },
                    { name: '📝 Tür', value: String(payload?.type || '—'), inline: true },
                    { name: '💰 Maliyet', value: String(payload?.cost || '—') + ' ₺', inline: true },
                ]
            });
        }

        setIsMaintenanceModalOpen(false);
        setEditingMaintenanceId(null);
        setMaintenanceForm({ date: new Date().toISOString().split('T')[0], type: 'Periyodik Bakım', description: '', mechanicId: '', km: '', cost: '', files: [], doneItems: [] });
    };

    const handleDeleteMaintenance = (id) => {
        deleteMaintenance(id);
        sendDiscordAlert({
            type: 'warning',
            title: '🗑️ Bakım Kaydı Silindi',
            description: 'Bir bakım kaydı sistemden kaldırıldı.',
        });
    };

    const handleAddMechanic = (e) => {
        e.preventDefault();
        if (editingMechanicId) {
            if (updateMechanic) updateMechanic(editingMechanicId, mechanicForm);
        } else {
            addMechanic(mechanicForm);
            sendDiscordAlert({
                type: 'info',
                title: '🔩 Yeni Tamirci Eklendi',
                description: `**${mechanicForm?.name || '—'}** tamirci listesine eklendi.`,
                fields: [
                    { name: '📞 Telefon', value: String(mechanicForm?.phone || '—'), inline: true },
                ]
            });
        }
        setIsMechanicModalOpen(false);
        setEditingMechanicId(null);
        setMechanicForm({ name: '', masterName: '', phone: '', location: '', mapLink: '', notes: '', type: 'Genel Bakım' });
    };

    const handleDeleteMechanic = (id) => {
        deleteMechanic(id);
        sendDiscordAlert({
            type: 'warning',
            title: '🗑️ Tamirci Silindi',
            description: 'Bir tamirci sistemden kaldırıldı.',
        });
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
    const totalCost = activeMaintenanceRecords.reduce((acc, r) => acc + (parseFloat(r.cost) || 0), 0);

    const tabs = [
        { 
            id: 'records', 
            label: 'Bakım Kayıtları', 
            icon: <Wrench size={15} />, 
            theme: 'from-amber-600 to-orange-500 border-amber-400/40 shadow-[0_0_15px_rgba(245,158,11,0.35)] text-white',
            hoverText: 'group-hover:text-amber-400' 
        },
        { 
            id: 'shopping', 
            label: 'İhtiyaç Listesi', 
            icon: <ShoppingCart size={15} />, 
            theme: 'from-emerald-600 to-teal-500 border-emerald-400/40 shadow-[0_0_15px_rgba(16,185,129,0.35)] text-white',
            hoverText: 'group-hover:text-emerald-400' 
        },
        { 
            id: 'stock', 
            label: 'Stok / Parça', 
            icon: <Package size={15} />, 
            theme: 'from-violet-600 to-purple-500 border-violet-400/40 shadow-[0_0_15px_rgba(139,92,246,0.35)] text-white',
            hoverText: 'group-hover:text-violet-400' 
        },
        { 
            id: 'mechanics', 
            label: 'Servis Rehberi', 
            icon: <MapPin size={15} />, 
            theme: 'from-rose-600 to-pink-500 border-rose-400/40 shadow-[0_0_15px_rgba(244,63,94,0.35)] text-white',
            hoverText: 'group-hover:text-rose-400' 
        },
        { 
            id: 'photos', 
            label: 'Fotoğraflar', 
            icon: <FolderOpen size={15} />, 
            theme: 'from-sky-600 to-cyan-500 border-sky-400/40 shadow-[0_0_15px_rgba(14,165,233,0.35)] text-white',
            hoverText: 'group-hover:text-cyan-400' 
        },
        { 
            id: 'info', 
            label: 'Araç Bilgileri', 
            icon: <Truck size={15} />, 
            theme: 'from-blue-600 to-sky-500 border-blue-400/40 shadow-[0_0_15px_rgba(59,130,246,0.35)] text-white',
            hoverText: 'group-hover:text-sky-400' 
        },
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
    const [isTireModalOpen, setIsTireModalOpen] = useState(false);

    useEffect(() => {
        setLocalShoppingItems(shoppingItems || []);
    }, [shoppingItems]);

    // B1/B2: Periyodik bakım uyarısı — günde 1 kez
    useEffect(() => {
        if (!periodicMaintenanceItems || periodicMaintenanceItems.length === 0) return;
        const todayKey = 'tir_discord_maint_' + new Date().toISOString().slice(0, 10);
        if (localStorage.getItem(todayKey)) return;

        const periodicItems = (periodicMaintenanceItems || []).map(item => {
            const lastMaintenance = (maintenanceRecords || [])
                .filter(m => m.type === 'Periyodik Bakım' && m.doneItems && m.doneItems.includes(item.id))
                .sort((a, b) => b.km - a.km)[0];
            const lastKm = lastMaintenance ? (lastMaintenance.km || 0) : 0;
            const intervalKm = parseInt(item.intervalKm) || 40000;
            const nextDueKm = lastKm === 0 ? intervalKm : lastKm + intervalKm;
            const remainingKm = nextDueKm - currentKm;
            return { ...item, remainingKm };
        });

        const expired = periodicItems.filter(i => i.remainingKm <= 0);
        const nearDue = periodicItems.filter(i => i.remainingKm > 0 && i.remainingKm <= (parseInt(i.warningKm) || 2000));

        if (expired.length > 0) {
            sendDiscordAlert({
                type: 'danger',
                title: '🔴 BAKIM GECİKTİ!',
                description: expired.map(i => `🚫 **${i.name}** — ${Math.abs(i.remainingKm)} km aşıldı`).join('\n'),
                fields: [{ name: '🚛 Araç', value: activeTruckData?.plate || '—', inline: true }]
            });
        }
        if (nearDue.length > 0) {
            sendDiscordAlert({
                type: 'warning',
                title: '🟡 Yakın Bakım Uyarısı',
                description: nearDue.map(i => `⚠️ **${i.name}** — ${i.remainingKm} km kaldı`).join('\n'),
                fields: [{ name: '🚛 Araç', value: activeTruckData?.plate || '—', inline: true }]
            });
        }
        if (expired.length > 0 || nearDue.length > 0) {
            localStorage.setItem(todayKey, '1');
        }
    }, [periodicMaintenanceItems, maintenanceRecords, currentKm, activeTruckData]);

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
            return { 
                id: 'records', 
                label: 'Bakım Ekle', 
                icon: <Plus size={15} />, 
                className: 'bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 border border-amber-400/40 text-white shadow-[0_0_15px_rgba(245,158,11,0.35)]', 
                onClick: () => { setEditingMaintenanceId(null); setMaintenanceForm({ date: new Date().toISOString().split('T')[0], type: 'Periyodik Bakım', description: '', mechanicId: '', km: '', cost: '', files: [], doneItems: [] }); setIsMaintenanceModalOpen(true); } 
            };
        }
        if (activeTab === 'shopping') {
            return { 
                id: 'shopping', 
                label: 'İhtiyaç Ekle', 
                icon: <Plus size={15} />, 
                className: 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 border border-emerald-400/40 text-white shadow-[0_0_15px_rgba(16,185,129,0.35)]', 
                onClick: () => { setEditingShoppingId(null); setShoppingForm({ name: '', description: '', price: '', link: '' }); setIsShoppingModalOpen(true); } 
            };
        }
        if (activeTab === 'stock') {
            return { 
                id: 'stock', 
                label: 'Stok Ekle', 
                icon: <Plus size={15} />, 
                className: 'bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 border border-violet-400/40 text-white shadow-[0_0_15px_rgba(139,92,246,0.35)]', 
                onClick: () => { setEditingStockId(null); setStockForm({ name: '', category: (sparePartCategories && sparePartCategories.length > 0) ? sparePartCategories[0] : 'Genel', count: '', price: '', notes: '', files: [] }); setShowNewCategoryInput(false); setIsStockModalOpen(true); } 
            };
        }
        if (activeTab === 'mechanics') {
            return { 
                id: 'mechanics', 
                label: 'Tamirci Ekle', 
                icon: <Plus size={15} />, 
                className: 'bg-gradient-to-r from-rose-600 to-pink-500 hover:from-rose-500 hover:to-pink-400 border border-rose-400/40 text-white shadow-[0_0_15px_rgba(244,63,94,0.35)]', 
                onClick: () => { setEditingMechanicId(null); setMechanicForm({ name: '', masterName: '', phone: '', location: '', mapLink: '', type: 'Genel Bakım', notes: '' }); setIsMechanicModalOpen(true); } 
            };
        }
        if (activeTab === 'photos') {
            if (openedFolder) {
                return { 
                    id: 'photos-file', 
                    label: 'Dosya Ekle', 
                    icon: <Plus size={15} />, 
                    className: 'bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-500 hover:to-cyan-400 border border-sky-400/40 text-white shadow-[0_0_15px_rgba(14,165,233,0.35)]', 
                    onClick: () => { setEditingFolderId(openedFolder.id); setFolderForm({ name: openedFolder.name, description: openedFolder.description, files: openedFolder.files || [] }); setIsFolderModalOpen(true); } 
                };
            }
            return { 
                id: 'photos-album', 
                label: 'Yeni Albüm', 
                icon: <FolderPlus size={15} />, 
                className: 'bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-500 hover:to-cyan-400 border border-sky-400/40 text-white shadow-[0_0_15px_rgba(14,165,233,0.35)]', 
                onClick: () => { setEditingFolderId(null); setFolderForm({ name: '', description: '', files: [] }); setIsFolderModalOpen(true); } 
            };
        }
        return null;
    };
    const dynamicActionBtn = getDynamicActionButton();

    return (
        <div className="space-y-5 animate-in fade-in duration-500 relative pb-ios-nav">

            {/* ─── ENTEGRE TEK SATIR HEADER BAR ─── */}
            <div 
                className="flex items-center justify-between gap-3 pb-2 border-b border-white/[0.06]"
                style={{
                    paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))'
                }}
            >
                {/* Sol Grup: Hamburger (Mobil) + Başlık */}
                <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
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
                        Araç Bakım
                    </h2>
                </div>

                {/* Sağ Grup: Dinamik Aksiyon Butonu (Başlığın Hizası - Mobilde Sıfır Çakışma) */}
                <AnimatePresence mode="wait">
                    {dynamicActionBtn && (
                        <motion.button
                            key={dynamicActionBtn.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            onClick={dynamicActionBtn.onClick}
                            className={`h-[36px] px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-lg flex items-center justify-center shrink-0 cursor-pointer ${dynamicActionBtn.className}`}
                        >
                            <span className="mr-1 sm:mr-1.5">{dynamicActionBtn.icon}</span>
                            <span className="whitespace-nowrap">{dynamicActionBtn.label}</span>
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {/* ─── ZARİF OBSİDYEN TAB BAR (Saf Kayar & Sıfır Çakışma) ─── */}
            <div className="w-full z-20 overflow-x-auto no-scrollbar scroll-smooth py-1">
                <div className="inline-flex bg-[#0c1017]/90 backdrop-blur-xl p-1.5 rounded-2xl shadow-xl border border-white/[0.08] min-w-full sm:min-w-0 items-center gap-1.5">
                    {tabs.map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button 
                                key={tab.id} 
                                onClick={() => setActiveTab(tab.id)}
                                className={`relative flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm transition-all duration-200 justify-center whitespace-nowrap outline-none cursor-pointer group shrink-0 ${
                                    isActive ? 'text-white font-bold' : 'text-slate-400 font-medium hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {/* Aktif Sekme Renkli Gradyan Pill */}
                                {isActive && (
                                    <motion.div
                                        layoutId="maintenance-active-tab-glow"
                                        className={`absolute inset-0 bg-gradient-to-r ${tab.theme} rounded-xl`}
                                        style={{ zIndex: 0 }}
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 450, damping: 32, mass: 0.8 }}
                                    />
                                )}
                                <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
                                    <span className={isActive ? 'text-white' : `text-slate-400 ${tab.hoverText} transition-colors duration-200`}>
                                        {tab.icon}
                                    </span>
                                    <span>{tab.label}</span>
                                </span>
                            </button>
                        );
                    })}
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
                            <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-5 shadow-xl">
                                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                                    <Truck size={18} className="text-blue-400" /> Araç Bilgileri
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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
                                            <div key={field.key} className="flex items-center justify-between gap-3 bg-white/[0.02] border border-white/[0.06] hover:border-blue-500/30 rounded-xl p-3.5 transition-all duration-200">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{field.label}</p>
                                                    {(!isDoc && editingField === field.key) ? (
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <input type={field.type || 'text'} value={editValue}
                                                                onChange={e => setEditValue(e.target.value)}
                                                                className="glass-input px-2.5 py-1 text-sm flex-1 text-white font-bold" autoFocus />
                                                            <button onClick={() => saveEdit(field.key)} className="text-emerald-400 hover:text-emerald-300 p-1 cursor-pointer">
                                                                <Check size={16} />
                                                            </button>
                                                            <button onClick={() => setEditingField(null)} className="text-slate-500 hover:text-white p-1 cursor-pointer">
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <p className="text-white font-bold text-sm sm:text-base truncate tracking-tight">{displayValue || '—'}</p>
                                                    )}
                                                </div>
                                                {!isDoc && editingField !== field.key && (
                                                    <button onClick={() => startEdit(field.key, rawValue)}
                                                        className="text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 p-1.5 rounded-lg transition-colors flex-shrink-0 cursor-pointer">
                                                        <Pencil size={14} />
                                                    </button>
                                                )}
                                                {isDoc && (
                                                    <div className="text-slate-600 p-1.5 flex-shrink-0" title="Ceza ve Belgeler sekmesinden düzenleyin">
                                                        <FileText size={14} className="opacity-50 hover:opacity-100 transition-opacity" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Şoförler */}
                            <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-5 shadow-xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-white flex items-center gap-2">
                                        <Users size={18} className="text-blue-400" /> Şoförler
                                    </h3>
                                    <span className="text-[11px] text-slate-500 italic">Admin Paneli &gt; Kullanıcılar &gt; Yeni Kullanıcı &gt; Rol: Şoför</span>
                                </div>

                                <div className="space-y-2">
                                    {(allDrivers && allDrivers.length > 0) ? allDrivers.map((d, i) => (
                                        <div key={d.id || i} className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.06] hover:border-white/10 rounded-xl px-3.5 py-2.5 transition-colors">
                                            <div className="bg-blue-500/10 p-2 rounded-lg text-blue-400 border border-blue-500/20">
                                                <User size={15} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-sm font-bold truncate">{d.name}</p>
                                                {d.phone && <p className="text-slate-400 text-xs font-mono mt-0.5">{d.phone}</p>}
                                            </div>
                                            <button
                                                onClick={() => handleDeleteDriverEntry(d)}
                                                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all flex-shrink-0 cursor-pointer"
                                                title="Şoförü Sil"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                            <span className="text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-md flex-shrink-0">
                                                Şoför
                                            </span>
                                        </div>
                                    )) : (
                                        <div className="text-slate-500 text-sm text-center py-8 bg-white/[0.02] rounded-xl border border-dashed border-white/10">
                                            <User size={24} className="mx-auto mb-2 text-slate-600 opacity-50" />
                                            <p className="text-slate-300 font-semibold">Bu şirkete atanmış şoför yok.</p>
                                            <p className="text-xs mt-1 text-slate-500">Admin Paneli &gt; Kullanıcılar &gt; Yeni Kullanıcı &gt; Rol: Şoför</p>
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
                            <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-5 shadow-xl">
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                    <h3 className="font-bold text-white flex items-center gap-2">
                                        <AlertTriangle size={18} className="text-amber-400" /> Yaklaşan Bakımlar
                                    </h3>
                                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                        <div className="text-xs sm:text-sm bg-white/[0.04] border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                                            <span className="text-slate-400 font-medium">Güncel KM:</span>
                                            <span className="font-bold text-white font-mono">{currentKm > 0 ? currentKm.toLocaleString('tr-TR') : '—'}</span>
                                        </div>
                                        <button onClick={() => {
                                            setIsTireModalOpen(true);
                                        }} className="bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold border border-white/10 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer">
                                            <Disc size={14} className="text-slate-300" /> Lastik Yönetimi
                                        </button>
                                        <button onClick={() => {
                                            setTemplateForm([...(periodicMaintenanceItems || [])]);
                                            setIsTemplateModalOpen(true);
                                        }} className="bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold border border-white/10 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer">
                                            <SettingsIcon size={14} className="text-slate-300" /> Şablonlar
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
                                        
                                        let statusColor = "bg-white/40 shadow-[0_0_8px_rgba(255,255,255,0.2)]";
                                        let textColor = "text-slate-200";
                                        let bgColor = "bg-white/[0.02] border-white/[0.07] hover:border-white/15";
                                        
                                        if (remainingKm <= 0) {
                                            statusColor = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]";
                                            textColor = "text-red-400";
                                            bgColor = "bg-red-500/5 border-red-500/20";
                                        } else if (remainingKm <= warningThreshold) {
                                            statusColor = "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]";
                                            textColor = "text-amber-400";
                                            bgColor = "bg-amber-500/5 border-amber-500/20";
                                        }

                                        return (
                                            <div key={item.id} className={`p-3.5 rounded-xl border ${bgColor} flex flex-col gap-2 relative overflow-hidden group shadow-sm transition-colors`}>
                                                <div className="flex justify-between items-center z-10">
                                                    <span className="font-bold text-white text-sm">{item.name}</span>
                                                    <span className={`text-xs font-bold ${textColor} font-mono`}>
                                                        {remainingKm <= 0 ? 'GEÇTİ!' : `Kalan: ${remainingKm.toLocaleString('tr-TR')} km`}
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-slate-400 font-mono z-10">
                                                    Son: {lastKm > 0 ? lastKm.toLocaleString('tr-TR') : 'Yok'} | Değişim: {nextDueKm.toLocaleString('tr-TR')}
                                                </div>
                                                <div className="w-full bg-black/40 h-1.5 rounded-full mt-1 z-10 overflow-hidden border border-white/5">
                                                    <div className={`h-full ${statusColor} transition-all duration-1000`} style={{ width: `${progress}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {(!periodicMaintenanceItems || periodicMaintenanceItems.length === 0) && (
                                        <div className="col-span-full text-center text-sm text-slate-500 py-6 border border-dashed border-white/10 rounded-xl">
                                            Henüz periyodik bakım şablonu tanımlanmamış. Şablonlar butonundan ekleyebilirsiniz.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* BAKIM KAYITLARI TABLOSU (Masaüstü & Mobil Görünüm) */}
                            <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl overflow-hidden shadow-xl">
                                {/* Masaüstü Tablo Görünümü */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full border-collapse" style={{ minWidth: '480px' }}>
                                        <thead>
                                            <tr className="bg-white/[0.03] border-b border-white/[0.06] text-slate-400 text-[11px] uppercase font-bold tracking-wider">
                                                <th className="p-3 pl-4 text-left whitespace-nowrap">Tarih</th>
                                                <th className="p-3 text-left whitespace-nowrap">Tür</th>
                                                <th className="p-3 text-left">Açıklama</th>
                                                <th className="p-3 text-center whitespace-nowrap">KM</th>
                                                <th className="p-3 text-right whitespace-nowrap">Tutar</th>
                                                <th className="p-3 text-center whitespace-nowrap">Ekler</th>
                                                <th className="p-3 text-center whitespace-nowrap w-24">İşlemler</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.04]">
                                            {activeMaintenanceRecords.length > 0 ? activeMaintenanceRecords.map(rec => {
                                                const recDate = rec.date ? new Date(rec.date) : new Date();
                                                const formattedDate = !isNaN(recDate.getTime()) ? recDate.toLocaleDateString('tr-TR') : '—';
                                                const recCost = parseFloat(rec.cost) || 0;
                                                const recKm = parseInt(rec.km) || 0;

                                                return (
                                                <tr key={rec.id} className="hover:bg-white/[0.02] transition-colors group">
                                                    <td className="p-3 pl-4 text-white text-sm font-semibold whitespace-nowrap">{formattedDate}</td>
                                                    <td className="p-3 whitespace-nowrap">
                                                        <span className="bg-white/[0.05] text-slate-200 border border-white/10 text-xs font-bold px-2 py-0.5 rounded-md">{rec.type}</span>
                                                    </td>
                                                    <td className="p-3 text-white text-sm">
                                                        <div className="font-medium">{rec.description}</div>
                                                        {rec.mechanicName && rec.mechanicName !== 'Belirtilmedi' && (
                                                            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                                                <MapPin size={11} className="text-amber-400/80" /> {rec.mechanicName}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-center text-slate-300 font-mono text-xs font-semibold whitespace-nowrap">{recKm > 0 ? `${recKm.toLocaleString('tr-TR')} km` : '—'}</td>
                                                    <td className="p-3 text-right text-amber-400 font-bold font-mono text-sm whitespace-nowrap">₺{recCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                                    <td className="p-3 text-center whitespace-nowrap">
                                                        {rec.files && rec.files.length > 0 ? (
                                                            <button onClick={() => setViewFiles({ title: rec.description || 'Bakım Kaydı', files: rec.files })}
                                                                className="text-xs font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-2 py-1 rounded-lg flex items-center justify-center gap-1 transition-colors mx-auto cursor-pointer">
                                                                <Paperclip size={11} /> {rec.files.length} Ek
                                                            </button>
                                                        ) : null}
                                                    </td>
                                                    <td className="p-3 text-center whitespace-nowrap">
                                                        <div className="flex justify-center gap-1">
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
                                                                className="p-1.5 rounded-lg transition-colors text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                                                                title="Düzenle">
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button onClick={() => handleDeleteMaintenance(rec.id)}
                                                                className="p-1.5 rounded-lg transition-colors text-slate-400 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                                                                title="Sil">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                );
                                            }) : (
                                                <tr><td colSpan="7" className="p-12 text-center text-slate-500">
                                                    <Wrench size={36} className="mx-auto mb-3 opacity-20 text-amber-400" />
                                                    <p className="text-slate-300 font-semibold">Henüz Bakım Kaydı Yok</p>
                                                    <p className="text-xs text-slate-500 mt-1">Yapılan bakımları "Bakım Ekle" butonundan ekleyebilirsiniz.</p>
                                                </td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobil Kart Görünümü */}
                                <div className="md:hidden flex flex-col gap-2.5 p-3">
                                    {activeMaintenanceRecords.length > 0 ? (
                                        activeMaintenanceRecords.map(rec => {
                                            const recDate = rec.date ? new Date(rec.date) : new Date();
                                            const formattedDate = !isNaN(recDate.getTime()) ? recDate.toLocaleDateString('tr-TR') : '—';
                                            const recCost = parseFloat(rec.cost) || 0;
                                            const recKm = parseInt(rec.km) || 0;

                                            return (
                                            <div key={rec.id} className="bg-[#0b0e14]/90 border border-white/[0.08] hover:border-amber-500/30 rounded-xl p-3.5 shadow-md relative transition-all">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md whitespace-nowrap">
                                                            {rec.type}
                                                        </span>
                                                        <span className="text-xs font-bold text-slate-400 whitespace-nowrap">
                                                            {formattedDate}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        {rec.files && rec.files.length > 0 && (
                                                            <button 
                                                                onClick={() => setViewFiles({ title: rec.description || 'Bakım Kaydı', files: rec.files })}
                                                                className="p-1 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg text-amber-400 transition-colors flex items-center cursor-pointer"
                                                                title={`${rec.files.length} Ek`}
                                                            >
                                                                <Paperclip size={12} />
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => {
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
                                                            className="p-1 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                                                        >
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteMaintenance(rec.id)}
                                                            className="p-1 bg-white/5 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="text-sm font-bold text-white leading-snug mb-1">
                                                    {rec.description}
                                                </div>

                                                {rec.mechanicName && rec.mechanicName !== 'Belirtilmedi' && (
                                                    <div className="text-xs text-slate-400 mb-2 flex items-center gap-1.5">
                                                        <MapPin size={12} className="text-amber-400/80 shrink-0" />
                                                        <span className="truncate">{rec.mechanicName}</span>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-2 bg-white/[0.02] border border-white/5 rounded-xl p-2.5 items-center mt-2.5">
                                                    <div className="flex flex-col">
                                                        <div className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">ARAÇ KM</div>
                                                        <div className="text-white font-mono font-bold text-xs">{recKm > 0 ? `${recKm.toLocaleString('tr-TR')} km` : '—'}</div>
                                                    </div>
                                                    <div className="flex flex-col items-end border-l border-white/10 pl-2">
                                                        <div className="text-[9px] text-slate-500 uppercase font-bold mb-0.5 w-full text-right">TOPLAM TUTAR</div>
                                                        <div className="text-amber-400 font-bold text-sm w-full text-right font-mono">₺{recCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            );
                                        })
                                    ) : (
                                        <div className="p-8 text-center text-slate-500">
                                            <Wrench size={32} className="mx-auto mb-3 opacity-20 text-amber-400" />
                                            <p className="text-sm font-semibold text-slate-300">Henüz Bakım Kaydı Yok</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── İHTİYAÇ LİSTESİ ─── */}
                    {activeTab === 'shopping' && (
                        <div className="space-y-4">
                            <div className="space-y-2.5">
                                <Reorder.Group axis="y" values={localShoppingItems} onReorder={handleReorder} className="space-y-2.5">
                                    {localShoppingItems.map((item) => (
                                        <Reorder.Item key={item.id} value={item} className="relative group">
                                            <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] hover:border-emerald-500/30 rounded-2xl p-4 flex items-center gap-4 transition-all shadow-md">
                                                <div className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-300 p-1">
                                                    <GripVertical size={20} />
                                                </div>
                                                
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-white text-sm sm:text-base truncate">{item.name}</h4>
                                                    <p className="text-xs sm:text-sm text-slate-400 mt-0.5 line-clamp-1">{item.description || 'Açıklama yok'}</p>
                                                </div>

                                                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                                                    {item.price > 0 && (
                                                        <div className="text-right">
                                                            <p className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-bold tracking-wider hidden sm:block">Tahmini Fiyat</p>
                                                            <p className="font-bold text-emerald-400 font-mono text-xs sm:text-base">₺{Number(item.price || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                                                        </div>
                                                    )}
                                                    
                                                    <div className="flex items-center gap-1">
                                                        {item.link && (
                                                            <a href={item.link} target="_blank" rel="noopener noreferrer" 
                                                               className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors cursor-pointer"
                                                               title="Ürün Linki">
                                                                <ExternalLink size={16} />
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
                                                            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                                                            title="Düzenle">
                                                            <Pencil size={16} />
                                                        </button>
                                                        <button onClick={() => deleteShoppingItem(item.id, item.name)}
                                                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                                            title="Sil">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </Reorder.Item>
                                    ))}
                                </Reorder.Group>

                                {localShoppingItems.length === 0 && (
                                    <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-12 text-center text-slate-500">
                                        <ShoppingCart size={40} className="mx-auto mb-3 opacity-20 text-emerald-400" />
                                        <h4 className="text-white font-semibold text-base mb-1">İhtiyaç Listesi Boş</h4>
                                        <p className="text-xs text-slate-500">Alınacak yedek parça ve malzemeleri "İhtiyaç Ekle" butonu ile ekleyebilirsiniz.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ─── STOK / PARÇA ─── */}
                    {activeTab === 'stock' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                {(spareParts || []).filter(p => !p.deleted).map(item => (
                                    <div key={item.id} className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] hover:border-violet-500/30 rounded-2xl p-4 flex flex-col gap-3 relative group transition-all shadow-md">
                                        <div className="absolute top-3.5 right-3.5 flex gap-1">
                                            <button onClick={() => {
                                                setEditingStockId(item.id);
                                                setStockForm(item);
                                                setIsStockModalOpen(true);
                                            }} className="p-1.5 text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-colors cursor-pointer">
                                                <Pencil size={15} />
                                            </button>
                                            <button onClick={() => deleteSparePart(item.id, item.name)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer">
                                                <Trash2 size={15} />
                                            </button>
                                        </div>

                                        <div className="flex items-start gap-3 w-5/6">
                                            {item.files && item.files.length > 0 && item.files[0].type?.startsWith('image/') ? (
                                                <img src={item.files[0].data} className="w-12 h-12 rounded-xl object-cover bg-black/50 border border-white/10" alt="" />
                                            ) : (
                                                <div className="bg-violet-500/10 w-12 h-12 flex items-center justify-center rounded-xl text-violet-400 border border-violet-500/20 flex-shrink-0">
                                                    <Package size={22} />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0 pr-2 pt-0.5">
                                                <h4 className="font-bold text-white text-base truncate">{item.name}</h4>
                                                <span className="text-[10px] font-bold bg-white/5 border border-white/10 text-slate-400 px-2 py-0.5 rounded-md mt-1 inline-block uppercase tracking-wider">{item.category}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 mt-1">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-bold text-slate-500 uppercase">Miktar</span>
                                                <span className="font-bold text-white text-sm">{item.count} Adet <span className="text-slate-400 font-normal text-xs ml-1">(Stokta)</span></span>
                                            </div>
                                            {item.price > 0 && (
                                                <div className="flex flex-col text-right">
                                                    <span className="text-[11px] font-bold text-slate-500 uppercase">Birim Fiyat</span>
                                                    <span className="font-bold text-violet-400 font-mono text-sm">₺{item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                            )}
                                        </div>

                                        {item.notes && (
                                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2 italic">{item.notes}</p>
                                        )}
                                    </div>
                                ))}

                                {(spareParts || []).filter(p => !p.deleted).length === 0 && (
                                    <div className="col-span-full bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-12 text-center text-slate-500">
                                        <Package size={40} className="mx-auto mb-3 opacity-20 text-violet-400" />
                                        <h4 className="text-white font-semibold text-base mb-1">Stokta Ürün Yok</h4>
                                        <p className="text-xs text-slate-500">Elinizdeki yedek parçaları, yağ ve filtre gibi malzemeleri buraya ekleyebilirsiniz.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ─── SERVİS REHBERİ ─── */}
                    {activeTab === 'mechanics' && (
                        <div className="space-y-4">
                            <div className="flex flex-col gap-3.5">
                                {mechanics.map(m => (
                                    <div key={m.id} className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] hover:border-rose-500/30 rounded-2xl p-5 flex flex-col gap-3 relative group transition-all shadow-md">
                                        <div className="absolute top-4 right-4 flex gap-1">
                                            <button onClick={() => {
                                                setEditingMechanicId(m.id);
                                                setMechanicForm({
                                                    name: m.name, masterName: m.masterName || '', phone: m.phone || '',
                                                    location: m.location || '', mapLink: m.mapLink || '', notes: m.notes || '', type: m.type || 'Genel Bakım'
                                                });
                                                setIsMechanicModalOpen(true);
                                            }} className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer">
                                                <Pencil size={15} />
                                            </button>
                                            <button onClick={() => handleDeleteMechanic(m.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer">
                                                <Trash2 size={15} />
                                            </button>
                                        </div>

                                        <div className="flex items-start gap-3">
                                            <div className="bg-rose-500/10 p-2.5 rounded-xl text-rose-400 border border-rose-500/20">
                                                <Wrench size={20} />
                                            </div>
                                            <div className="flex-1 min-w-0 pr-6">
                                                <h4 className="font-bold text-white text-base">{m.name}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] font-bold bg-white/5 border border-white/10 text-slate-400 px-2 py-0.5 rounded-md uppercase tracking-wider">{m.type}</span>
                                                    {m.location && (
                                                        <a 
                                                            href={m.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.location)}`} 
                                                            target="_blank" rel="noopener noreferrer"
                                                            className="flex items-center gap-1 px-2.5 py-0.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-md transition-colors border border-white/10 text-[10px] uppercase tracking-wider font-bold"
                                                        >
                                                            <Map size={10} className="text-rose-400" />
                                                            Haritada Aç
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5 mt-1">
                                            {m.masterName && (
                                                <div className="flex items-center gap-2 text-sm text-slate-300">
                                                    <User size={14} className="text-slate-500 flex-shrink-0" />
                                                    <span>İlgili Kişi / Usta: <strong className="text-white">{m.masterName}</strong></span>
                                                </div>
                                            )}
                                            {m.phone && (
                                                <div className="flex items-center gap-2 text-sm text-slate-300">
                                                    <Phone size={14} className="text-slate-500 flex-shrink-0" />
                                                    <a href={`tel:${m.phone}`} className="text-rose-400 hover:text-rose-300 font-mono font-bold transition-colors">{m.phone}</a>
                                                </div>
                                            )}
                                            {m.location && (
                                                <div className="flex items-start gap-2 text-sm text-slate-400 mt-1">
                                                    <MapPin size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
                                                    <span className="flex-1 text-xs sm:text-sm" title={m.location}>{m.location}</span>
                                                </div>
                                            )}
                                        </div>

                                        {m.notes && (
                                            <div className="mt-1 pt-2.5 border-t border-white/[0.06] text-xs text-slate-400 italic">
                                                <span className="font-bold text-slate-300 not-italic mr-1.5 inline-flex items-center gap-1"><StickyNote size={11} className="text-rose-400" /> Özel Not:</span>
                                                {m.notes}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {mechanics.length === 0 && (
                                    <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-12 text-center text-slate-500">
                                        <Wrench size={40} className="mx-auto mb-3 opacity-20 text-rose-400" />
                                        <h4 className="text-white font-semibold text-base mb-1">Kayıtlı Servis Yok</h4>
                                        <p className="text-xs text-slate-500">Sürekli çalıştığınız servis ve ustaları "Tamirci Ekle" butonu ile kaydedebilirsiniz.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ─── FOTOĞRAFLAR VE İLGİLİ BELGELER ─── */}
                    {activeTab === 'photos' && (
                        <div className="space-y-4">
                            {!openedFolder ? (
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                                    {maintenanceFolders.map(folder => (
                                        <div key={folder.id} onClick={() => setOpenedFolder(folder)}
                                            className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] hover:border-sky-500/35 hover:-translate-y-1 hover:shadow-2xl rounded-2xl p-5 flex flex-col items-center text-center cursor-pointer transition-all group relative">
                                            <button onClick={(e) => handleDeleteFolder(folder.id, e)} className="absolute top-2.5 right-2.5 text-slate-500 hover:text-red-400 p-1.5 transition rounded-lg hover:bg-red-500/10 z-10 cursor-pointer">
                                                <Trash2 size={15} />
                                            </button>
                                            <button onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingFolderId(folder.id);
                                                setFolderForm({ name: folder.name, description: folder.description, files: folder.files || [] });
                                                setIsFolderModalOpen(true);
                                            }} className="absolute top-2.5 left-2.5 text-slate-500 hover:text-sky-400 p-1.5 transition rounded-lg hover:bg-sky-500/10 z-10 cursor-pointer">
                                                <Pencil size={14} />
                                            </button>
                                            <FolderOpen size={48} className="text-sky-400 mb-3 group-hover:scale-110 transition-transform duration-300" strokeWidth={1.5} />
                                            <h4 className="font-bold text-white text-sm w-full truncate px-2">{folder.name}</h4>
                                            <p className="text-xs font-semibold text-slate-400 mt-1">{(folder.files || []).length} Dosya</p>
                                        </div>
                                    ))}
                                    {maintenanceFolders.length === 0 && (
                                        <div className="col-span-2 lg:col-span-4 bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-12 text-center text-slate-500">
                                            <FolderOpen size={40} className="mx-auto mb-3 opacity-20 text-sky-400" />
                                            <h4 className="text-white font-semibold text-base mb-1">Albüm Bulunamadı</h4>
                                            <p className="text-xs text-slate-500">Fotoğraf ve belgelerinizi düzenlemek için "Yeni Albüm" oluşturun.</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-4 flex items-center justify-between shadow-xl">
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => setOpenedFolder(null)} className="text-slate-400 hover:text-white bg-white/5 p-2 rounded-xl transition-colors cursor-pointer">
                                                <ChevronDown size={20} className="rotate-90" />
                                            </button>
                                            <div>
                                                <h3 className="font-bold text-white flex items-center gap-2">
                                                    <FolderOpen size={18} className="text-sky-400" /> {openedFolder.name}
                                                </h3>
                                                {openedFolder.description && <p className="text-xs text-slate-400 mt-0.5">{openedFolder.description}</p>}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                                        {(openedFolder.files || []).map((file, idx) => (
                                            <div key={idx} className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] overflow-hidden group relative rounded-2xl shadow-md">
                                                {file.type && file.type.startsWith('image/') ? (
                                                    <div className="aspect-square bg-black/50 relative overflow-hidden">
                                                        <img src={file.data} alt="Belge/Fotoğraf" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm">
                                                            <button onClick={() => setViewFiles({ title: openedFolder.name, files: [file] })} className="bg-white/20 hover:bg-white/40 p-2.5 rounded-full text-white transition cursor-pointer">
                                                                <Eye size={18} />
                                                            </button>
                                                            <a href={file.data} download={file.name || 'foto'} className="bg-sky-500/80 hover:bg-sky-500 p-2.5 rounded-full text-white transition cursor-pointer">
                                                                <Download size={18} />
                                                            </a>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="aspect-square flex flex-col items-center justify-center bg-white/[0.02] p-4 relative">
                                                        <FileText size={40} className="text-slate-400 mb-3" />
                                                        <p className="text-xs text-white font-medium text-center truncate w-full">{file.name || 'Belge'}</p>
                                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm">
                                                            <a href={file.data} download={file.name || 'belge'} className="bg-sky-500/80 hover:bg-sky-500 p-2 rounded-xl text-white transition flex items-center gap-1 text-xs font-bold px-3 py-1.5 cursor-pointer">
                                                                <Download size={14} /> İndir
                                                            </a>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {(openedFolder.files || []).length === 0 && (
                                            <div className="col-span-2 lg:col-span-4 p-8 text-center text-slate-500 border border-dashed border-white/10 rounded-2xl">
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

            {/* ─── İHTİYAÇ EKLEME MODALI ─── */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isShoppingModalOpen && (
                    <motion.div key="shopping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-[9999]">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 10 }} transition={{ duration: 0.2, ease: "easeOut" }} className="bg-[#0c1017] border border-emerald-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                            <div className="flex justify-between items-center mb-5">
                                <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2 text-white">
                                    <ShoppingCart size={20} className="text-emerald-400" />
                                    {editingShoppingId ? 'İhtiyacı Düzenle' : 'Yeni İhtiyaç Ekle'}
                                </h2>
                                <button onClick={() => {
                                    setIsShoppingModalOpen(false);
                                    setEditingShoppingId(null);
                                }} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handleAddShoppingItem} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">Ürün / İhtiyaç Adı</label>
                                    <input type="text" required placeholder="Örn: 10W-40 Motor Yağı" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-emerald-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all placeholder:text-slate-600" value={shoppingForm.name}
                                        onChange={e => setShoppingForm({ ...shoppingForm, name: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">Açıklama</label>
                                    <textarea rows={2} className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-emerald-500/50 rounded-xl px-3.5 py-2 text-sm text-white outline-none resize-none transition-all placeholder:text-slate-600"
                                        placeholder="Ürün detayı, marka tercihi vb..." value={shoppingForm.description}
                                        onChange={e => setShoppingForm({ ...shoppingForm, description: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">Tahmini Fiyat (₺)</label>
                                    <input type="number" step="0.01" placeholder="0.00" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-emerald-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm font-mono outline-none transition-all placeholder:text-slate-600" value={shoppingForm.price}
                                        onChange={e => setShoppingForm({ ...shoppingForm, price: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                        <Link size={13} className="text-emerald-400" /> Ürün Linki (Opsiyonel)
                                    </label>
                                    <input type="url" placeholder="https://..." className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-emerald-500/50 rounded-xl px-3.5 py-2 text-sm text-white outline-none transition-all placeholder:text-slate-600" value={shoppingForm.link}
                                        onChange={e => setShoppingForm({ ...shoppingForm, link: e.target.value })} />
                                </div>
                                <button type="submit" className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 border border-emerald-400/40 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5 mt-2 cursor-pointer uppercase tracking-wider text-xs sm:text-sm">
                                    {editingShoppingId ? 'Güncelle' : 'Listeye Ekle'}
                                </button>
                            </form>
                        </motion.div>
                    </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ─── ŞABLON MODALI ─── */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isTemplateModalOpen && (
                    <motion.div key="template" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-[9999]">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 10 }} transition={{ duration: 0.2, ease: "easeOut" }} className="bg-[#0c1017] border border-amber-500/30 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2 text-white">
                                    <SettingsIcon size={20} className="text-amber-400" />
                                    Periyodik Bakım Şablonları
                                </h2>
                                <button onClick={() => setIsTemplateModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-xs text-amber-300">
                                    Aracınızın düzenli bakım periyotlarını buradan belirleyin. Kayıt eklerken bunları işaretleyebilirsiniz.
                                </div>
                                
                                <div className="space-y-3">
                                    {templateForm.map((item, index) => (
                                        <div key={item.id} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 relative group">
                                            <button onClick={() => {
                                                const newForm = templateForm.filter(t => t.id !== item.id);
                                                setTemplateForm(newForm);
                                            }} className="absolute top-2.5 right-2.5 p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer">
                                                <Trash2 size={15} />
                                            </button>
                                            
                                            <div className="space-y-2.5 pr-6">
                                                <div>
                                                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Parça / Bakım Adı</label>
                                                    <input type="text" placeholder="Örn: Motor Yağı" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-amber-500/50 rounded-xl px-3 py-2 text-sm text-white outline-none transition-all placeholder:text-slate-600" value={item.name}
                                                        onChange={e => {
                                                            const newForm = [...templateForm];
                                                            newForm[index].name = e.target.value;
                                                            setTemplateForm(newForm);
                                                        }} />
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Periyot (KM)</label>
                                                        <input type="number" placeholder="Örn: 40000" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-amber-500/50 rounded-xl px-3 py-2 text-sm text-white font-mono outline-none transition-all placeholder:text-slate-600" value={item.intervalKm}
                                                        onChange={e => {
                                                            const newForm = [...templateForm];
                                                            newForm[index].intervalKm = e.target.value;
                                                            setTemplateForm(newForm);
                                                        }} />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Uyarı (KM Kala)</label>
                                                        <input type="number" placeholder="Örn: 2000" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-amber-500/50 rounded-xl px-3 py-2 text-sm text-white font-mono outline-none transition-all placeholder:text-slate-600" value={item.warningKm || ''}
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
                                }} className="w-full py-2.5 border border-dashed border-amber-500/40 text-amber-400 hover:bg-amber-500/10 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 mt-2 cursor-pointer uppercase tracking-wider">
                                    <Plus size={15} /> Yeni Bakım Şablonu Ekle
                                </button>
                            </div>
                            <div className="mt-5 pt-3.5 border-t border-white/[0.06]">
                                <button onClick={() => {
                                    const validItems = templateForm.filter(t => t.name.trim() !== '');
                                    updatePeriodicMaintenanceItems(validItems);
                                    setIsTemplateModalOpen(false);
                                }} className="w-full bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 border border-amber-400/40 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 uppercase tracking-wider text-xs sm:text-sm cursor-pointer">
                                    Şablonları Kaydet
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ─── BAKIM EKLEME MODALI ─── */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isMaintenanceModalOpen && (
                    <motion.div key="maintenance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-[9999]">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 10 }} transition={{ duration: 0.2, ease: "easeOut" }} className="bg-[#0c1017] border border-amber-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2 text-white">
                                    <Wrench size={20} className="text-amber-400" />
                                    {editingMaintenanceId ? 'Bakım Kaydını Düzenle' : 'Yeni Bakım Ekle'}
                                </h2>
                                <button onClick={() => {
                                    setIsMaintenanceModalOpen(false);
                                    setEditingMaintenanceId(null);
                                }} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
                                <form onSubmit={handleAddMaintenance} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3 items-end">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Tarih</label>
                                            <CustomDatePicker 
                                                value={maintenanceForm.date}
                                                onChange={val => setMaintenanceForm({ ...maintenanceForm, date: val })}
                                                className="bg-[#0b0e14]/90 border border-white/10 focus:border-amber-500/50 rounded-xl px-3 py-2 text-sm text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Araç KM</label>
                                            <input type="number" placeholder="Örn: 450000" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-amber-500/50 rounded-xl px-3 py-2 text-sm text-white font-mono outline-none transition-all placeholder:text-slate-600" value={maintenanceForm.km}
                                                onChange={e => setMaintenanceForm({ ...maintenanceForm, km: e.target.value })} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Bakım Türü</label>
                                        <div className="relative">
                                            <select className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-amber-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all appearance-none cursor-pointer" value={maintenanceForm.type}
                                                onChange={e => setMaintenanceForm({ ...maintenanceForm, type: e.target.value })}>
                                                {maintenanceTypes.map(t => <option key={t} value={t} className="bg-[#0c1017] text-white">{t}</option>)}
                                            </select>
                                            <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Açıklama</label>
                                        <textarea rows={2} required className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-amber-500/50 rounded-xl px-3.5 py-2 text-sm text-white outline-none resize-none transition-all placeholder:text-slate-600"
                                            placeholder="Yapılan işlemi açıklayın..." value={maintenanceForm.description}
                                            onChange={e => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} />
                                    </div>
                                    {maintenanceForm.type === 'Periyodik Bakım' && periodicMaintenanceItems && periodicMaintenanceItems.length > 0 && (
                                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5">
                                            <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-2.5">🛠 Yapılan İşlemler (Şablondan Seçin)</label>
                                            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                                {periodicMaintenanceItems.map(item => {
                                                    const isChecked = maintenanceForm.doneItems && maintenanceForm.doneItems.includes(item.id);
                                                    return (
                                                        <label key={item.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer border border-transparent hover:border-white/10 transition-colors">
                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${isChecked ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-500 text-transparent'}`}>
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
                                                            <span className={`text-xs truncate ${isChecked ? 'text-white font-bold' : 'text-slate-400'}`}>{item.name}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Tamirci</label>
                                            <div className="relative">
                                                <select className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-amber-500/50 rounded-xl px-3 py-2 text-sm text-white outline-none transition-all appearance-none cursor-pointer" value={maintenanceForm.mechanicId}
                                                    onChange={e => setMaintenanceForm({ ...maintenanceForm, mechanicId: e.target.value })}>
                                                    <option value="" className="bg-[#0c1017] text-white">Belirtilmedi</option>
                                                    {mechanics.map(m => <option key={m.id} value={m.id} className="bg-[#0c1017] text-white">{m.name}</option>)}
                                                </select>
                                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Toplam Tutar (TL)</label>
                                            <input type="number" step="0.01" required placeholder="Örn: 5000" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-amber-500/50 rounded-xl px-3 py-2 text-sm text-white font-mono outline-none transition-all placeholder:text-slate-600" value={maintenanceForm.cost}
                                                onChange={e => setMaintenanceForm({ ...maintenanceForm, cost: e.target.value })} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">📎 Tamir Belgesi / Fotoğraf</label>
                                        <FileUpload files={maintenanceForm.files} onChange={files => setMaintenanceForm({ ...maintenanceForm, files })} />
                                    </div>
                                    <button type="submit" className="w-full bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 border border-amber-400/40 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 uppercase tracking-wider text-xs sm:text-sm cursor-pointer mt-2">
                                        {editingMaintenanceId ? 'Bakımı Güncelle' : 'Bakımı Kaydet'}
                                    </button>
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
                    <motion.div key="mechanic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 10 }} transition={{ duration: 0.2, ease: "easeOut" }} className="bg-[#0c1017] border border-rose-500/30 rounded-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
                            <button onClick={() => {
                                setIsMechanicModalOpen(false);
                                setEditingMechanicId(null);
                            }} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                                <X size={20} />
                            </button>
                            <h3 className="text-lg sm:text-xl font-bold text-white mb-5 flex items-center gap-2">
                                <MapPin size={20} className="text-rose-400" /> {editingMechanicId ? 'Tamirciyi Düzenle' : 'Tamirci / Servis Ekle'}
                            </h3>
                            <form onSubmit={handleAddMechanic} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Servis / Dükkan Adı</label>
                                        <input type="text" required placeholder="Örn: Ankara İveco Servisi" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-rose-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all placeholder:text-slate-600" value={mechanicForm.name}
                                            onChange={e => setMechanicForm({ ...mechanicForm, name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">İlgili Usta / Kişi</label>
                                        <input type="text" placeholder="Örn: Ahmet Usta" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-rose-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all placeholder:text-slate-600" value={mechanicForm.masterName}
                                            onChange={e => setMechanicForm({ ...mechanicForm, masterName: e.target.value })} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Telefon</label>
                                        <input type="text" placeholder="0555 555 55 55" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-rose-500/50 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm outline-none transition-all placeholder:text-slate-600" value={mechanicForm.phone}
                                            onChange={e => setMechanicForm({ ...mechanicForm, phone: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Uzmanlık Alanı</label>
                                        <div className="relative">
                                            <select className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-rose-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all appearance-none cursor-pointer" value={mechanicForm.type}
                                                onChange={e => setMechanicForm({ ...mechanicForm, type: e.target.value })}>
                                                {['Genel Bakım', 'Yetkili Servis', 'Lastik', 'Motor', 'Fren', 'Elektrik', 'Kaporta', 'Dorse', 'Diğer'].map(t => <option key={t} value={t} className="bg-[#0c1017] text-white">{t}</option>)}
                                            </select>
                                            <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Açık Adres / Konum</label>
                                    <input type="text" required placeholder="Örn: Şaşmaz Oto Sanayi, Ankara" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-rose-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all placeholder:text-slate-600" value={mechanicForm.location}
                                        onChange={e => setMechanicForm({ ...mechanicForm, location: e.target.value })} />
                                </div>
                                <div className="bg-white/[0.02] p-3.5 rounded-xl border border-white/[0.06]">
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex justify-between">
                                        <span>Konum Linki (Apple / Google Haritalar)</span>
                                        {mechanicForm.location && (
                                            <button type="button" onClick={() => {
                                                if (mechanicForm.location) {
                                                    setMechanicForm({ ...mechanicForm, mapLink: `https://maps.apple.com/?q=${encodeURIComponent(mechanicForm.location)}` });
                                                }
                                            }} className="text-xs font-bold text-rose-400 flex items-center gap-1 hover:text-rose-300 cursor-pointer"><Map size={12} /> Apple Haritalar'da Bul</button>
                                        )}
                                    </label>
                                    <input type="url" placeholder="https://maps.app.goo.gl/..." className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-rose-500/50 rounded-xl px-3.5 py-2 text-sm text-white outline-none transition-all placeholder:text-slate-600" value={mechanicForm.mapLink}
                                        onChange={e => setMechanicForm({ ...mechanicForm, mapLink: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Notlar (Servis Bilgisi vb.)</label>
                                    <textarea rows={2} placeholder="Sadece fren işleri yapıyor, parça dışarıdan..." className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-rose-500/50 rounded-xl px-3.5 py-2 text-sm text-white outline-none resize-none transition-all placeholder:text-slate-600" value={mechanicForm.notes}
                                        onChange={e => setMechanicForm({ ...mechanicForm, notes: e.target.value })} />
                                </div>
                                <button type="submit" className="w-full bg-gradient-to-r from-rose-600 to-pink-500 hover:from-rose-500 hover:to-pink-400 border border-rose-400/40 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-rose-500/20 hover:shadow-rose-500/40 uppercase tracking-wider text-xs sm:text-sm cursor-pointer">
                                    Servisi Kaydet
                                </button>
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
                    <motion.div key="folder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 10 }} transition={{ duration: 0.2, ease: "easeOut" }} className="bg-[#0c1017] border border-sky-500/30 rounded-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
                            <button onClick={() => setIsFolderModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                                <X size={20} />
                            </button>
                            <h3 className="text-lg sm:text-xl font-bold text-white mb-5 flex items-center gap-2">
                                <FolderOpen size={20} className="text-sky-400" /> {editingFolderId ? 'Albümü Düzenle' : 'Yeni Albüm Ekle'}
                            </h3>
                            <form onSubmit={handleSaveFolder} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Albüm / Klasör Adı</label>
                                    <input type="text" required placeholder="Örn: 2026 Kaza Raporları" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-sky-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all placeholder:text-slate-600" value={folderForm.name}
                                        onChange={e => setFolderForm({ ...folderForm, name: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Açıklama (Opsiyonel)</label>
                                    <textarea rows={2} placeholder="İzmir seferindeki kazaya ait tutanaklar..." className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-sky-500/50 rounded-xl px-3.5 py-2 text-sm text-white outline-none resize-none transition-all placeholder:text-slate-600" value={folderForm.description}
                                        onChange={e => setFolderForm({ ...folderForm, description: e.target.value })} />
                                </div>
                                <div className="pt-2">
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">📸 Dosyaları Seçin</label>
                                    <FileUpload files={folderForm.files} onChange={files => setFolderForm({ ...folderForm, files })} />
                                </div>
                                <button type="submit" className="w-full bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-500 hover:to-cyan-400 border border-sky-400/40 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-sky-500/20 hover:shadow-sky-500/40 uppercase tracking-wider text-xs sm:text-sm cursor-pointer mt-2">
                                    {editingFolderId ? 'Albümü Güncelle' : 'Albümü Oluştur'}
                                </button>
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
                    <motion.div key="stock" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 10 }} transition={{ duration: 0.2, ease: "easeOut" }} className="bg-[#0c1017] border border-violet-500/30 rounded-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
                            <button onClick={() => {
                                setIsStockModalOpen(false);
                                setEditingStockId(null);
                            }} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                                <X size={20} />
                            </button>
                            <h3 className="text-lg sm:text-xl font-bold text-white mb-5 flex items-center gap-2">
                                <Package size={20} className="text-violet-400" /> {editingStockId ? 'Ekli Ürünü Düzenle' : 'Yeni Stok / Parça Ekle'}
                            </h3>
                            <form onSubmit={handleAddStock} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Parça / Ürün Adı</label>
                                    <input type="text" required placeholder="Örn: 20W-50 Motor Yağı" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-violet-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all placeholder:text-slate-600" value={stockForm.name}
                                        onChange={e => setStockForm({ ...stockForm, name: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Miktar (Adet / Litre)</label>
                                        <input type="number" required placeholder="Örn: 2" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-violet-500/50 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm outline-none transition-all placeholder:text-slate-600" value={stockForm.count}
                                            onChange={e => setStockForm({ ...stockForm, count: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Birim Fiyatı (TL) <span className="text-slate-500 text-[10px] lowercase italic">(opsiyonel)</span></label>
                                        <input type="number" step="0.01" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-violet-500/50 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm outline-none transition-all placeholder:text-slate-600" value={stockForm.price}
                                            onChange={e => setStockForm({ ...stockForm, price: e.target.value })} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Kategori</label>
                                    {showNewCategoryInput ? (
                                        <div className="flex gap-2">
                                            <input type="text" required placeholder="Yeni kategori adı (Örn: Motor Parçaları)" className="flex-1 bg-[#0b0e14]/90 border border-white/10 focus:border-violet-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none" value={newCategoryName}
                                                onChange={e => setNewCategoryName(e.target.value)} autoFocus />
                                            <button type="button" onClick={() => setShowNewCategoryInput(false)} className="bg-white/5 border border-white/10 px-3 py-2 rounded-xl text-slate-300 hover:text-white transition cursor-pointer text-xs font-bold">İptal</button>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <select className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-violet-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all appearance-none cursor-pointer" value={stockForm.category}
                                                onChange={e => {
                                                    if (e.target.value === 'YENI_EKLE') {
                                                        setShowNewCategoryInput(true);
                                                    } else {
                                                        setStockForm({ ...stockForm, category: e.target.value });
                                                    }
                                                }}>
                                                {(sparePartCategories || []).map(c => <option key={c} value={c} className="bg-[#0c1017] text-white">{c}</option>)}
                                                <option value="YENI_EKLE" className="bg-[#0c1017] text-violet-400 font-bold">+ Yeni Kategori Ekle</option>
                                            </select>
                                            <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Özel Notlar (Opsiyonel)</label>
                                    <textarea rows={2} placeholder="Sadece kışın kullanılıyor..." className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-violet-500/50 rounded-xl px-3.5 py-2 text-sm text-white outline-none resize-none transition-all placeholder:text-slate-600" value={stockForm.notes}
                                        onChange={e => setStockForm({ ...stockForm, notes: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">📸 Ürün / Parça Fotoğrafı (Opsiyonel)</label>
                                    <FileUpload files={stockForm.files} onChange={files => setStockForm({ ...stockForm, files })} />
                                </div>
                                <button type="submit" className="w-full bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 border border-violet-400/40 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 uppercase tracking-wider text-xs sm:text-sm cursor-pointer">
                                    {editingStockId ? 'Stok Güncelle' : 'Stoğa Ekle'}
                                </button>
                            </form>
                        </motion.div>
                    </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ─── DOSYA GÖRÜNTÜLEYİCİ MODAL ─── */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {viewFiles && (
                    <motion.div key="viewFiles" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
                        <motion.div initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 10 }} transition={{ duration: 0.2, ease: "easeOut" }} className="bg-[#0c1017] border border-amber-500/30 rounded-2xl w-full max-w-2xl p-6 relative shadow-2xl">
                            <div className="flex justify-between items-center mb-5">
                                <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                                    <FileText size={20} className="text-amber-400" />
                                    {viewFiles.title} İçin Ekler
                                </h3>
                                <button onClick={() => setViewFiles(null)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
                                {viewFiles.files.map((file, idx) => (
                                    <div key={idx} className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
                                        {file.type && file.type.startsWith('image/') ? (
                                            <div className="bg-black/40 w-full flex justify-center p-4">
                                                <img src={file.data} alt="Belge/Makbuz" className="max-w-full max-h-[400px] object-contain rounded-lg" />
                                            </div>
                                        ) : (
                                            <div className="p-8 flex flex-col items-center justify-center bg-white/[0.02]">
                                                <FileText size={48} className="text-slate-500 mb-3" />
                                                <p className="text-white font-medium">{file.name || 'Belge dosyası'}</p>
                                            </div>
                                        )}

                                        <div className="p-3.5 bg-white/[0.02] border-t border-white/[0.06] flex justify-between items-center">
                                            <span className="text-xs text-slate-400 font-medium truncate max-w-[70%]">{file.name || 'Ek_Belge'}</span>
                                            <a href={file.data} download={file.name || 'Belge'}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-300 hover:text-white bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors cursor-pointer">
                                                <Download size={13} /> İndir
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

            {/* ─── 3D LASTİK YÖNETİMİ MODALI ─── */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isTireModalOpen && (
                        <motion.div 
                            key="tires-modal" 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }} 
                            transition={{ duration: 0.2 }} 
                            className="fixed inset-0 bg-[#070709] z-[9999]"
                        >
                            <Tire3DViewer currentKm={currentKm} onClose={() => setIsTireModalOpen(false)} />
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

export default Maintenance;

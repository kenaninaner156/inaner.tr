import React, { useState, useContext } from 'react';
import { useCompany } from '../context/CompanyContext';
import { useTruck } from '../context/TruckContext';
import { DataContext } from '../context/DataContext';
import { Building2, Truck, Users, Plus, Edit2, Trash2, Check, X, AlertTriangle, Key, BarChart3, Award, User, Bell, Send, Image, FileText, Navigation, MapPin, Activity, CheckCircle, XCircle, Clock, Sparkles, Radio, Volume2, VolumeX, Smartphone, Fuel, Wrench, Receipt, CreditCard, Shield, ExternalLink, RefreshCw, Eye, UploadCloud, Menu } from 'lucide-react';
import { db, auth } from '../services/firebaseConfig';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { requestAndSaveNotificationToken } from '../services/notificationService';
import { uploadToCloudinary } from '../services/cloudinaryService';
import VehicleAnalysis from './map/VehicleAnalysis';

const NOTIF_DESTINATIONS = [
    { id: 'detaylar', label: 'Bildirimler & Görevler', icon: Bell, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
    { id: 'map', label: 'Canlı Harita', icon: MapPin, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
    { id: 'trips', label: 'Seferler', icon: Truck, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
    { id: 'fuel', label: 'Mazot Fişleri', icon: Fuel, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    { id: 'maintenance', label: 'Araç Bakım', icon: Wrench, color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
    { id: 'invoices', label: 'Fatura Durumu', icon: FileText, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
    { id: 'earsiv', label: 'E-Arşiv Fatura', icon: Receipt, color: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
    { id: 'payments', label: 'Ödeme Takibi', icon: CreditCard, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    { id: 'dashboard', label: 'Özet Panel', icon: BarChart3, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
];

const AVAILABLE_ICONS = [
    { id: 'thumbs_up', label: '👍 Onay' },
    { id: 'check', label: '✅ Tik' },
    { id: 'x', label: '❌ İptal' },
    { id: 'alert', label: '⚠️ Sorun' },
    { id: 'map_pin', label: '📍 Harita' },
    { id: 'truck', label: '🚚 Tır' },
    { id: 'fuel', label: '⛽ Mazot' },
    { id: 'file', label: '📄 Evrak' },
    { id: 'wrench', label: '🔧 Bakım' },
    { id: 'message', label: '💬 Sohbet' },
    { id: 'credit_card', label: '💳 Ödeme' },
    { id: 'sos', label: '🚨 Acil' }
];

const BUTTON_PRESETS = [
    {
        label: '🤝 Standart Onay (2 Buton)',
        buttons: [
            { id: '1', label: 'Onayladım', icon: 'thumbs_up', actionType: 'ack_approved', style: 'emerald' },
            { id: '2', label: 'Sorun Var', icon: 'x', actionType: 'ack_rejected', style: 'red' }
        ]
    },
    {
        label: '📍 Canlı Harita + Onay (2 Buton)',
        buttons: [
            { id: '1', label: 'Canlı Harita', icon: 'map_pin', actionType: 'navigate', targetTab: 'map', style: 'indigo' },
            { id: '2', label: 'Anladım', icon: 'check', actionType: 'ack_approved', style: 'emerald' }
        ]
    },
    {
        label: '⛽ Mazot Fişi + Onay (2 Buton)',
        buttons: [
            { id: '1', label: 'Mazot Fişi Yükle', icon: 'fuel', actionType: 'navigate', targetTab: 'fuel', style: 'indigo' },
            { id: '2', label: 'Tamamdır', icon: 'check', actionType: 'ack_approved', style: 'emerald' }
        ]
    },
    {
        label: '📋 Sefer Detayları + Onay (2 Buton)',
        buttons: [
            { id: '1', label: 'Sefer Detayları', icon: 'truck', actionType: 'navigate', targetTab: 'trips', style: 'indigo' },
            { id: '2', label: 'Yola Çıktım', icon: 'check', actionType: 'ack_approved', style: 'emerald' }
        ]
    },
    {
        label: '💬 Butonsuz (Sade Bilgilendirme)',
        buttons: []
    }
];

const QUICK_TEMPLATES = [
    {
        title: 'İnaner Lojistik - Görev',
        body: 'Araç fabrikaya ulaştı, yükleme/boşaltma sırasına giriniz.',
        tab: 'trips',
        buttons: [
            { id: '1', label: 'Fabrika Konumu', icon: 'map_pin', actionType: 'navigate', targetTab: 'map', style: 'indigo' },
            { id: '2', label: 'Yola Çıktım', icon: 'thumbs_up', actionType: 'ack_approved', style: 'emerald' },
            { id: '3', label: 'Sorun Var', icon: 'x', actionType: 'ack_rejected', style: 'red' }
        ],
        label: '🏭 Fabrikaya Ulaşıldı'
    },
    {
        title: 'İnaner Lojistik - Mazot',
        body: 'Lütfen aldığınız son yakıt fişinin fotoğrafını sisteme yükleyiniz.',
        tab: 'fuel',
        buttons: [
            { id: '1', label: 'Mazot Fişi Yükle', icon: 'fuel', actionType: 'navigate', targetTab: 'fuel', style: 'indigo' },
            { id: '2', label: 'Yükledim', icon: 'check', actionType: 'ack_approved', style: 'emerald' }
        ],
        label: '⛽ Mazot Fişi Girişi'
    },
    {
        title: 'İnaner Lojistik - Evrak',
        body: 'Sefer irsaliyesini ve kantar fişini sisteme yükleyiniz.',
        tab: 'detaylar',
        buttons: [
            { id: '1', label: 'Evrakları Aç', icon: 'file', actionType: 'navigate', targetTab: 'detaylar', style: 'amber' },
            { id: '2', label: 'Tamamdır', icon: 'check', actionType: 'ack_approved', style: 'emerald' }
        ],
        label: '📄 Evrak & İrsaliye'
    },
    {
        title: 'İnaner Lojistik - Bakım',
        body: 'Aracınızın periyodik bakım veya muayene zamanı yaklaşmıştır.',
        tab: 'maintenance',
        buttons: [
            { id: '1', label: 'Bakım Detayı', icon: 'wrench', actionType: 'navigate', targetTab: 'maintenance', style: 'indigo' },
            { id: '2', label: 'Onayladım', icon: 'check', actionType: 'ack_approved', style: 'emerald' }
        ],
        label: '🛑 Bakım Zamanı'
    },
    {
        title: 'İnaner Lojistik - Konum',
        body: 'Lütfen canlı takip uygulamanızın açık olduğunu teyit ediniz.',
        tab: 'map',
        buttons: [
            { id: '1', label: 'Canlı Harita', icon: 'map_pin', actionType: 'navigate', targetTab: 'map', style: 'indigo' },
            { id: '2', label: 'Açık / Aktif', icon: 'check', actionType: 'ack_approved', style: 'emerald' }
        ],
        label: '📍 Konum Kontrolü'
    }
];

const CompanyAdmin = ({ onOpenMenu, isMobile } = {}) => {
    const { activeCompanyId, companyData = {} } = useCompany() || {};
    const { trucks = [], activeTruckId, setActiveTruckId } = useTruck() || {};
    const { 
        approvedUsers = [], 
        pendingUsers = [], 
        approveUser = () => {}, 
        rejectUser = () => {}, 
        premiums = [], 
        updatePremiums = () => {}, 
        editUser = () => {}, 
        deleteUser = () => {}, 
        drivers = [], 
        updateDrivers = () => {}, 
        callAdminApi = () => ({ success: false }), 
        companyNotifications = [] 
    } = useContext(DataContext) || {};

    const [activeTab, setActiveTab] = useState('trucks');

    // Bildirim sekmesi durumları
    const [notifTitle, setNotifTitle] = useState('İnaner Lojistik Duyuru');
    const [notifBody, setNotifBody] = useState('');
    const [notifRecipient, setNotifRecipient] = useState('all'); // 'all' veya kullanıcı id'si
    const [notifTargetTab, setNotifTargetTab] = useState('detaylar');
    const [notifButtons, setNotifButtons] = useState([
        { id: '1', label: 'Onayladım', icon: 'thumbs_up', actionType: 'ack_approved', style: 'emerald' },
        { id: '2', label: 'Sorun Var', icon: 'x', actionType: 'ack_rejected', style: 'red' }
    ]);
    const [isSendingNotif, setIsSendingNotif] = useState(false);
    const [notifSending, setNotifSending] = useState(false);
    const [notifSuccess, setNotifSuccess] = useState(false);
    const [notifError, setNotifError] = useState(null);
    const [notifResult, setNotifResult] = useState(null);
    const [registeringDevice, setRegisteringDevice] = useState(false);

    // Özel İkon Seçici Modalı
    const [iconPickerIndex, setIconPickerIndex] = useState(null); // hangi butonun ikonu seçiliyor (0, 1 vs.)

    // Resim Yükleme Durumu
    const [notifImage, setNotifImage] = useState(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    // Gelişmiş Bildirim Ayarları
    const [notifPriority, setNotifPriority] = useState('high'); // 'normal' | 'high'
    const [notifSound, setNotifSound] = useState(true);
    const [notifAutoDismiss, setNotifAutoDismiss] = useState(false);
    const [notifAutoDismissSec, setNotifAutoDismissSec] = useState(15);
    const [notifVibration, setNotifVibration] = useState(true);

    // Önceden Tanımlı Şablonlar
    const handleApplyPreset = (preset) => {
        setNotifTitle(preset.title);
        setNotifBody(preset.body);
        setNotifTargetTab(preset.tab);
        setNotifButtons(preset.buttons.map(b => ({ ...b })));
    };

    // Buton Şablonları Hızlı Seçim
    const handleApplyButtonPreset = (btnPreset) => {
        setNotifButtons(btnPreset.buttons.map(b => ({ ...b })));
    };

    // Trucks state
    const [showTruckForm, setShowTruckForm] = useState(false);
    const [truckPlate, setTruckPlate] = useState('');
    const [truckBrand, setTruckBrand] = useState('');
    const [editingTruckId, setEditingTruckId] = useState(null);
    const [editTruckForm, setEditTruckForm] = useState({ plate: '', brand: '', status: 'active' });

    // Premiums state
    const [showPremiumForm, setShowPremiumForm] = useState(false);
    const [premName, setPremName] = useState('');
    const [premType, setPremType] = useState('fixed');
    const [premAmount, setPremAmount] = useState('');
    const [editingPremiumId, setEditingPremiumId] = useState(null);

    // Offline Driver Form State
    const [showOfflineDriverForm, setShowOfflineDriverForm] = useState(false);
    const [editingOfflineDriverId, setEditingOfflineDriverId] = useState(null);
    const [newOfflineDriverName, setNewOfflineDriverName] = useState('');
    const [newOfflineDriverPhone, setNewOfflineDriverPhone] = useState('');

    // User Password & Delete Modal States
    const [editingUserId, setEditingUserId] = useState(null);
    const [newUserPassword, setNewUserPassword] = useState('');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null);

    // Drivers state
    const [showDriverModal, setShowDriverModal] = useState(false);
    const [selectedUserForDriver, setSelectedUserForDriver] = useState(null);
    const [driverTcNo, setDriverTcNo] = useState('');
    const [driverPhone, setDriverPhone] = useState('');
    const [driverAddress, setDriverAddress] = useState('');
    const [driverEmergencyContact, setDriverEmergencyContact] = useState('');
    const [driverBloodType, setDriverBloodType] = useState('');
    const [driverLicenseDate, setDriverLicenseDate] = useState('');
    const [driverSrcDate, setDriverSrcDate] = useState('');
    const [driverPsychotechnicDate, setDriverPsychotechnicDate] = useState('');
    const [driverSalaryType, setDriverSalaryType] = useState('monthly');
    const [driverBaseSalary, setDriverBaseSalary] = useState('');
    const [driverDefaultPremiumId, setDriverDefaultPremiumId] = useState('');
    const [driverFiles, setDriverFiles] = useState([]);
    const [driverNotes, setDriverNotes] = useState('');
    const [driverPlate, setDriverPlate] = useState('');
    const [driverIban, setDriverIban] = useState('');

    // Offline / Harici Şoför Ekleme
    const [isOfflineDriverMode, setIsOfflineDriverMode] = useState(false);
    const [offlineDriverName, setOfflineDriverName] = useState('');

    // Şoför Arama ve Filtreleme
    const [driverSearch, setDriverSearch] = useState('');

    const handleSaveOfflineDriver = async (e) => {
        e.preventDefault();
        if (!newOfflineDriverName.trim()) return;

        try {
            let updatedDrivers;
            if (editingOfflineDriverId) {
                updatedDrivers = (drivers || []).map(d =>
                    d.id === editingOfflineDriverId
                        ? { ...d, name: newOfflineDriverName.trim(), phone: newOfflineDriverPhone.trim() }
                        : d
                );
            } else {
                const newDriver = {
                    id: 'driver_' + Date.now().toString(36),
                    name: newOfflineDriverName.trim(),
                    phone: newOfflineDriverPhone.trim(),
                    createdAt: new Date().toISOString()
                };
                updatedDrivers = [...(drivers || []), newDriver];
            }
            await updateDrivers(updatedDrivers);
            setShowOfflineDriverForm(false);
            setEditingOfflineDriverId(null);
            setNewOfflineDriverName('');
            setNewOfflineDriverPhone('');
        } catch {
            alert("Şoför kaydedilirken bir hata oluştu.");
        }
    };

    const handleEditOfflineDriver = (driver) => {
        setEditingOfflineDriverId(driver.id);
        setNewOfflineDriverName(driver.name || '');
        setNewOfflineDriverPhone(driver.phone || '');
        setShowOfflineDriverForm(true);
    };

    const resetPremiumForm = () => {
        setPremName('');
        setPremType('fixed');
        setPremAmount('');
    };

    const handleSavePremium = async (e) => {
        e.preventDefault();
        const amountVal = parseFloat(premAmount) || 0;
        let newPremiums;
        
        if (editingPremiumId) {
            newPremiums = premiums.map(p => p.id === editingPremiumId ? { ...p, name: premName, type: premType, amount: amountVal } : p);
        } else {
            const newPremium = {
                id: 'prim_' + Date.now().toString(36),
                name: premName,
                type: premType,
                amount: amountVal
            };
            newPremiums = [...premiums, newPremium];
        }

        try {
            await updatePremiums(newPremiums);
            resetPremiumForm();
            setShowPremiumForm(false);
            setEditingPremiumId(null);
        } catch {
            alert("Prim kaydedilirken hata oluştu.");
        }
    };

    const handleEditPremium = (prem) => {
        setEditingPremiumId(prem.id);
        setPremName(prem.name);
        setPremType(prem.type);
        setPremAmount(prem.amount);
        setShowPremiumForm(true);
    };

    const handleDeletePremium = async (id, name) => {
        if (window.confirm(`"${name}" prim şablonunu silmek istediğinize emin misiniz?`)) {
            try {
                const newPremiums = premiums.filter(p => p.id !== id);
                await updatePremiums(newPremiums);
            } catch {
                alert("Prim silinirken hata oluştu.");
            }
        }
    };

    const handleOpenDriverModal = (user) => {
        setSelectedUserForDriver(user);
        setIsOfflineDriverMode(false);
        setOfflineDriverName('');
        const existingDriver = (drivers || []).find(d => d.userId === user.id);
        if (existingDriver) {
            setDriverTcNo(existingDriver.tcNo || '');
            setDriverPhone(existingDriver.phone || user.phone || '');
            setDriverAddress(existingDriver.address || '');
            setDriverEmergencyContact(existingDriver.emergencyContact || '');
            setDriverBloodType(existingDriver.bloodType || '');
            setDriverLicenseDate(existingDriver.licenseDate || '');
            setDriverSrcDate(existingDriver.srcDate || '');
            setDriverPsychotechnicDate(existingDriver.psychotechnicDate || '');
            setDriverSalaryType(existingDriver.salaryType || 'monthly');
            setDriverBaseSalary(existingDriver.baseSalary || '');
            setDriverDefaultPremiumId(existingDriver.defaultPremiumId || '');
            setDriverFiles(existingDriver.files || []);
            setDriverNotes(existingDriver.notes || '');
            setDriverPlate(existingDriver.assignedPlate || '');
            setDriverIban(existingDriver.iban || '');
        } else {
            setDriverTcNo('');
            setDriverPhone(user.phone || '');
            setDriverAddress('');
            setDriverEmergencyContact('');
            setDriverBloodType('');
            setDriverLicenseDate('');
            setDriverSrcDate('');
            setDriverPsychotechnicDate('');
            setDriverSalaryType('monthly');
            setDriverBaseSalary('');
            setDriverDefaultPremiumId('');
            setDriverFiles([]);
            setDriverNotes('');
            setDriverPlate('');
            setDriverIban('');
        }
        setShowDriverModal(true);
    };

    const handleOpenOfflineDriverModal = () => {
        setSelectedUserForDriver(null);
        setIsOfflineDriverMode(true);
        setOfflineDriverName('');
        setDriverTcNo('');
        setDriverPhone('');
        setDriverAddress('');
        setDriverEmergencyContact('');
        setDriverBloodType('');
        setDriverLicenseDate('');
        setDriverSrcDate('');
        setDriverPsychotechnicDate('');
        setDriverSalaryType('monthly');
        setDriverBaseSalary('');
        setDriverDefaultPremiumId('');
        setDriverFiles([]);
        setDriverNotes('');
        setDriverPlate('');
        setDriverIban('');
        setShowDriverModal(true);
    };

    const handleEditOfflineDriverModal = (driver) => {
        setSelectedUserForDriver(null);
        setIsOfflineDriverMode(true);
        setOfflineDriverName(driver.name || '');
        setDriverTcNo(driver.tcNo || '');
        setDriverPhone(driver.phone || '');
        setDriverAddress(driver.address || '');
        setDriverEmergencyContact(driver.emergencyContact || '');
        setDriverBloodType(driver.bloodType || '');
        setDriverLicenseDate(driver.licenseDate || '');
        setDriverSrcDate(driver.srcDate || '');
        setDriverPsychotechnicDate(driver.psychotechnicDate || '');
        setDriverSalaryType(driver.salaryType || 'monthly');
        setDriverBaseSalary(driver.baseSalary || '');
        setDriverDefaultPremiumId(driver.defaultPremiumId || '');
        setDriverFiles(driver.files || []);
        setDriverNotes(driver.notes || '');
        setDriverPlate(driver.assignedPlate || '');
        setDriverIban(driver.iban || '');
        setShowDriverModal(true);
    };

    const handleDeleteOfflineDriver = async (driverId, driverName) => {
        if (window.confirm(`"${driverName}" adlı çevrimdışı şoförü silmek istediğinize emin misiniz?`)) {
            try {
                const updatedDrivers = (drivers || []).filter(d => d.id !== driverId);
                await updateDrivers(updatedDrivers);
            } catch {
                alert("Şoför silinirken hata oluştu.");
            }
        }
    };

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
                            <Building2 size={20} className="text-indigo-400" />
                            <span>Şirket Yönetimi</span>
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/25 rounded-full text-indigo-300 text-xs font-semibold">
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                        <span className="truncate max-w-[140px] sm:max-w-[200px]">{companyData?.name || 'Şirket'}</span>
                    </div>
                </div>
            </div>

            {/* 2. Modern Kapsül Sekme Çubuğu */}
            <div className="flex items-center gap-1.5 p-1 bg-[#0d1117] border border-white/[0.08] rounded-2xl overflow-x-auto custom-scrollbar shrink-0">
                <button
                    onClick={() => setActiveTab('trucks')}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === 'trucks'
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Truck size={14} />
                    <span>Araçlar</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${activeTab === 'trucks' ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-400'}`}>
                        {trucks.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('drivers')}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === 'drivers'
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Users size={14} />
                    <span>Şoförler</span>
                    {pendingUsers.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-md text-[10px] bg-amber-500 text-black font-bold animate-pulse">
                            {pendingUsers.length}
                        </span>
                    )}
                </button>
                {companyData?.mapEnabled && (
                    <button
                        onClick={() => setActiveTab('analysis')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                            activeTab === 'analysis'
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <BarChart3 size={14} />
                        <span>Araç Analiz</span>
                    </button>
                )}
                {companyData?.personnelEnabled && (
                    <button
                        onClick={() => setActiveTab('premiums')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                            activeTab === 'premiums'
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <Award size={14} />
                        <span>Prim Ayarları</span>
                    </button>
                )}
                <button
                    onClick={() => setActiveTab('notifications')}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === 'notifications'
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Bell size={14} />
                    <span>Bildirim Gönder</span>
                </button>
            </div>

            {/* 3. Ana İçerik Alanı (Kaydırılabilir) */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-4 pr-0.5">

                {/* ─── ARAÇLAR SEKMESİ ─── */}
                {activeTab === 'trucks' && (
                    <div className="space-y-3.5">
                        {/* Üst Bar */}
                        <div className="flex items-center justify-between gap-3 bg-[#0d1117] border border-white/[0.08] p-3 rounded-2xl">
                            <div className="text-xs text-slate-300">
                                Sisteme kayıtlı <span className="font-bold text-indigo-400 font-mono">{trucks.length}</span> araç bulunuyor.
                            </div>
                            <button 
                                onClick={() => setShowTruckForm(!showTruckForm)} 
                                className="h-8 px-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md shadow-indigo-600/25 active:scale-95 cursor-pointer shrink-0"
                            >
                                <Plus size={14} />
                                <span>Yeni Araç Ekle</span>
                            </button>
                        </div>

                        {/* Yeni Araç Ekleme Formu */}
                        {showTruckForm && (
                            <form onSubmit={handleAddTruck} className="bg-[#07090e] p-4 sm:p-5 rounded-2xl border border-indigo-500/30 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                        <Truck size={14} className="text-indigo-400" /> Yeni Filo Aracı Ekle
                                    </h4>
                                    <button 
                                        type="button" 
                                        onClick={() => setShowTruckForm(false)}
                                        className="text-slate-400 hover:text-white p-1 cursor-pointer"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Araç Plakası *</label>
                                        <input 
                                            type="text" 
                                            required 
                                            value={truckPlate} 
                                            onChange={e => setTruckPlate(e.target.value.toUpperCase())} 
                                            className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-mono font-bold uppercase focus:border-indigo-500 outline-none" 
                                            placeholder="Örn: 06 FTN 692" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Marka & Model *</label>
                                        <input 
                                            type="text" 
                                            required 
                                            value={truckBrand} 
                                            onChange={e => setTruckBrand(e.target.value)} 
                                            className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-semibold focus:border-indigo-500 outline-none" 
                                            placeholder="Örn: Iveco Stralis 460" 
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                    <button 
                                        type="button" 
                                        onClick={() => setShowTruckForm(false)} 
                                        className="h-8 px-3 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
                                    >
                                        Vazgeç
                                    </button>
                                    <button 
                                        type="submit" 
                                        className="h-8 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Check size={14} /> Aracı Kaydet
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Araç Kartları Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            {trucks.map(truck => {
                                const isSelected = activeTruckId === truck.id;
                                return (
                                    <div 
                                        key={truck.id} 
                                        className={`bg-[#07090e] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border transition-all relative overflow-hidden flex flex-col justify-between ${
                                            isSelected 
                                                ? 'border-indigo-500/60 bg-gradient-to-b from-indigo-950/20 to-[#07090e] shadow-xl shadow-indigo-950/40' 
                                                : 'border-white/[0.08] hover:border-white/20'
                                        }`}
                                    >
                                        {/* Üst Kısım: TR Plaka Rozeti & Durum */}
                                        <div className="flex items-center justify-between gap-2 mb-3">
                                            {/* TR Plaka Badge */}
                                            <div className="inline-flex items-center bg-[#0d1117] border border-white/20 rounded-xl px-2.5 py-1 gap-2 shadow-inner">
                                                <span className="text-[10px] font-black text-sky-400 bg-sky-500/20 px-1 py-0.2 rounded font-mono">TR</span>
                                                <span className="text-sm sm:text-base font-black tracking-wider font-mono text-white">
                                                    {truck.plate}
                                                </span>
                                            </div>

                                            {/* Durum Rozeti */}
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                                isSelected
                                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                    : truck.status === 'inactive'
                                                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                                    : truck.status === 'maintenance'
                                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${
                                                    isSelected ? 'bg-emerald-400 animate-ping' : 'bg-current'
                                                }`} />
                                                {isSelected ? 'SEÇİLİ ARAÇ' : truck.status === 'inactive' ? 'PASİF' : truck.status === 'maintenance' ? 'BAKIMDA' : 'AKTİF'}
                                            </span>
                                        </div>

                                        {/* Marka & Model / Düzenleme Formu */}
                                        {editingTruckId === truck.id ? (
                                            <div className="space-y-2.5 my-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
                                                <input 
                                                    type="text" 
                                                    value={editTruckForm.plate} 
                                                    onChange={e => setEditTruckForm({ ...editTruckForm, plate: e.target.value.toUpperCase() })} 
                                                    className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-mono font-bold outline-none focus:border-indigo-500" 
                                                    placeholder="Plaka" 
                                                />
                                                <input 
                                                    type="text" 
                                                    value={editTruckForm.brand} 
                                                    onChange={e => setEditTruckForm({ ...editTruckForm, brand: e.target.value })} 
                                                    className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-semibold outline-none focus:border-indigo-500" 
                                                    placeholder="Marka / Model" 
                                                />
                                                <select 
                                                    value={editTruckForm.status} 
                                                    onChange={e => setEditTruckForm({ ...editTruckForm, status: e.target.value })} 
                                                    className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs outline-none focus:border-indigo-500"
                                                >
                                                    <option value="active">Aktif (Çalışıyor)</option>
                                                    <option value="inactive">Pasif (Yatıyor)</option>
                                                    <option value="maintenance">Bakımda</option>
                                                </select>
                                                <div className="flex gap-2 pt-1">
                                                    <button 
                                                        onClick={() => handleEditSaveTruck(truck.id)} 
                                                        className="flex-1 h-7 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 cursor-pointer"
                                                    >
                                                        <Check size={12} /> Kaydet
                                                    </button>
                                                    <button 
                                                        onClick={() => setEditingTruckId(null)} 
                                                        className="flex-1 h-7 bg-white/10 hover:bg-white/15 text-slate-300 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 cursor-pointer"
                                                    >
                                                        <X size={12} /> İptal
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mb-4">
                                                <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                                                    <Truck size={13} className="text-indigo-400" />
                                                    <span>{truck.brand || 'Model Belirtilmedi'}</span>
                                                </p>
                                            </div>
                                        )}

                                        {/* Alt Kısım: Seç Butonu ve İkonlar */}
                                        <div className="mt-auto pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                                            <button
                                                onClick={() => setActiveTruckId(truck.id)}
                                                className={`flex-1 h-8 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                                        : 'bg-white/[0.05] hover:bg-white/10 text-slate-300 hover:text-white border border-white/[0.08]'
                                                }`}
                                            >
                                                {isSelected ? <CheckCircle size={14} /> : <Truck size={14} />}
                                                <span>{isSelected ? 'Seçili Araç' : 'Bu Aracı Seç'}</span>
                                            </button>

                                            <div className="flex items-center gap-1">
                                                <button 
                                                    onClick={() => { 
                                                        setEditingTruckId(truck.id); 
                                                        setEditTruckForm({ plate: truck.plate, brand: truck.brand, status: truck.status || 'active' }); 
                                                    }} 
                                                    className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-indigo-400 flex items-center justify-center transition cursor-pointer" 
                                                    title="Düzenle"
                                                >
                                                    <Edit2 size={13} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteTruck(truck.id, truck.plate)} 
                                                    className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer" 
                                                    title="Aracı Sil"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ─── ŞOFÖRLER SEKMESİ ─── */}
                {activeTab === 'drivers' && (
                    <div className="space-y-4">
                        {/* Onay Bekleyen Başvurular */}
                        {pendingUsers.length > 0 && (
                            <div className="bg-[#07090e] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-amber-500/30 shadow-lg space-y-3">
                                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                                    <Clock size={14} /> Onay Bekleyen Şoför Başvuruları ({pendingUsers.length})
                                </h4>
                                <div className="space-y-2.5">
                                    {pendingUsers.map(user => (
                                        <div key={user.id} className="flex items-center justify-between bg-white/[0.03] p-3 rounded-2xl border border-white/[0.06]">
                                            <div>
                                                <p className="font-bold text-white text-xs sm:text-sm">{user.fullName || (user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.username)}</p>
                                                <p className="text-[11px] text-slate-400">@{user.username}</p>
                                                <p className="text-[10px] text-slate-500 font-mono">Kayıt: {new Date(user.requestedAt || user.createdAt).toLocaleDateString('tr-TR')}</p>
                                            </div>
                                            <div className="flex space-x-2">
                                                <button onClick={() => approveUser(user.id, 'şoför')} className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 p-2 rounded-xl border border-emerald-500/30 transition-colors cursor-pointer" title="Şoför Olarak Onayla">
                                                    <Check size={16} />
                                                </button>
                                                <button onClick={() => rejectUser(user.id)} className="bg-red-500/15 text-red-400 hover:bg-red-500/25 p-2 rounded-xl border border-red-500/30 transition-colors cursor-pointer" title="Reddet">
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Şoför Yönetim Üst Barı */}
                        <div className="flex items-center justify-between gap-3 bg-[#0d1117] border border-white/[0.08] p-3 rounded-2xl">
                            <div className="text-xs text-slate-300">
                                Sistemde toplam <span className="font-bold text-indigo-400 font-mono">{approvedUsers.filter(u => u.role === 'şoför' || u.role === 'user').length}</span> aktif şoför bulunuyor.
                            </div>
                            <button 
                                onClick={() => { setShowOfflineDriverForm(!showOfflineDriverForm); setEditingOfflineDriverId(null); setNewOfflineDriverName(''); setNewOfflineDriverPhone(''); }} 
                                className="h-8 px-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md shadow-indigo-600/25 active:scale-95 cursor-pointer shrink-0"
                            >
                                <Plus size={14} />
                                <span>Çevrimdışı Şoför Ekle</span>
                            </button>
                        </div>

                        {/* Çevrimdışı Şoför Ekleme Formu */}
                        {showOfflineDriverForm && (
                            <form onSubmit={handleSaveOfflineDriver} className="bg-[#07090e] p-4 sm:p-5 rounded-2xl border border-indigo-500/30 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                        <User size={14} className="text-indigo-400" /> {editingOfflineDriverId ? 'Çevrimdışı Şoförü Düzenle' : 'Yeni Çevrimdışı Şoför Ekle'}
                                    </h4>
                                    <button 
                                        type="button" 
                                        onClick={() => { setShowOfflineDriverForm(false); setEditingOfflineDriverId(null); }}
                                        className="text-slate-400 hover:text-white p-1 cursor-pointer"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Şoför Adı Soyadı *</label>
                                        <input type="text" required value={newOfflineDriverName} onChange={e => setNewOfflineDriverName(e.target.value)} className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-semibold focus:border-indigo-500 outline-none" placeholder="Örn: Ahmet Yılmaz" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Telefon Numarası (İsteğe Bağlı)</label>
                                        <input type="text" value={newOfflineDriverPhone} onChange={e => setNewOfflineDriverPhone(e.target.value)} className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-mono focus:border-indigo-500 outline-none" placeholder="Örn: 0555..." />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                    <button type="button" onClick={() => { setShowOfflineDriverForm(false); setEditingOfflineDriverId(null); }} className="h-8 px-3 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition cursor-pointer">
                                        İptal
                                    </button>
                                    <button type="submit" className="h-8 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer">
                                        <Check size={14} /> {editingOfflineDriverId ? 'Güncelle' : 'Kaydet'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Aktif Şoförler (Sistem Kullanıcıları) */}
                        <div className="bg-[#07090e] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/[0.08]">
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3.5 flex items-center gap-2">
                                <Users size={14} className="text-indigo-400" /> Aktif Şoförler (Sistem Kullanıcıları)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {approvedUsers.filter(u => u.role === 'şoför' || u.role === 'user').map(driver => (
                                    <div key={driver.id} className="bg-white/[0.03] hover:bg-white/[0.05] p-3.5 rounded-2xl border border-white/[0.07] flex items-center justify-between gap-3 transition">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                                            <Users size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-white text-xs sm:text-sm truncate">{driver.fullName || (driver.firstName ? `${driver.firstName} ${driver.lastName || ''}`.trim() : driver.username)}</p>
                                            <p className="text-[11px] text-slate-400 truncate">@{driver.username}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[9px] uppercase tracking-wider font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/25 px-2 py-0.5 rounded-full inline-block">
                                                    ŞOFÖR
                                                </span>
                                                {editingUserId !== driver.id && (
                                                    <span 
                                                        className="text-[10px] bg-white/[0.06] hover:bg-white/10 text-slate-300 px-2 py-0.5 rounded-lg flex items-center font-mono cursor-pointer transition"
                                                        onClick={() => { setEditingUserId(driver.id); setNewUserPassword(''); }}
                                                        title="Şifreyi Değiştirmek için Tıkla"
                                                    >
                                                        <Key size={10} className="mr-1" /> Şifre
                                                    </span>
                                                )}
                                            </div>
                                            {editingUserId === driver.id && (
                                                <div className="mt-2 flex gap-1 animate-in fade-in duration-200">
                                                    <input 
                                                        type="password" 
                                                        value={newUserPassword} 
                                                        onChange={(e) => setNewUserPassword(e.target.value)}
                                                        className="w-full bg-[#0d1117] border border-white/[0.1] text-white text-xs rounded-lg px-2 py-1 outline-none focus:border-indigo-500" 
                                                        placeholder="Yeni Şifre (En az 6 karakter)" 
                                                    />
                                                    <button onClick={() => { if(newUserPassword.length>=6){ editUser(driver.id, {password: newUserPassword}); setEditingUserId(null); }else{ alert('Şifre en az 6 karakter olmalı!'); } }} className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 p-1.5 rounded-lg cursor-pointer"><Check size={13}/></button>
                                                    <button onClick={() => setEditingUserId(null)} className="bg-white/10 hover:bg-white/20 text-slate-300 p-1.5 rounded-lg cursor-pointer"><X size={13}/></button>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => {
                                                setUserToDelete(driver);
                                                setIsDeleteModalOpen(true);
                                            }}
                                            className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer shrink-0"
                                            title="Şoförü Sil"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                                {approvedUsers.filter(u => u.role === 'şoför' || u.role === 'user').length === 0 && (
                                    <div className="col-span-full text-center py-6 text-slate-500 text-xs">
                                        Henüz kayıtlı sistem şoförü bulunmuyor.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Çevrimdışı Şoförler (Sadece Listede Görünenler) */}
                        <div className="bg-[#07090e] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/[0.08]">
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3.5 flex items-center gap-2">
                                <User size={14} className="text-slate-400" /> Çevrimdışı Şoförler (Sadece Listede Görünenler)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {(drivers || []).map(driver => (
                                    <div key={driver.id} className="bg-white/[0.03] hover:bg-white/[0.05] p-3.5 rounded-2xl border border-white/[0.07] flex items-center justify-between gap-3 transition">
                                        <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-slate-400 shrink-0">
                                            <User size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-white text-xs sm:text-sm truncate">{driver.name}</p>
                                            <p className="text-[11px] text-slate-500 font-mono truncate">{driver.phone || 'Telefon belirtilmedi'}</p>
                                            <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400 bg-white/[0.05] px-2 py-0.5 rounded-full inline-block mt-1">
                                                ÇEVRİMDIŞI
                                            </span>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            <button onClick={() => handleEditOfflineDriver(driver)} className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-indigo-400 flex items-center justify-center transition cursor-pointer" title="Düzenle">
                                                <Edit2 size={13} />
                                            </button>
                                            <button onClick={() => handleDeleteOfflineDriver(driver.id, driver.name)} className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer" title="Sil">
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {(drivers || []).length === 0 && (
                                    <div className="col-span-full text-center py-6 text-slate-500 text-xs">
                                        Henüz kayıtlı çevrimdışı şoför bulunmuyor.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── ARAÇ ANALİZ SEKMESİ ─── */}
                {activeTab === 'analysis' && companyData?.mapEnabled && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <VehicleAnalysis activeTruckId={activeTruckId} />
                    </div>
                )}

                {/* ─── PRİM AYARLARI SEKMESİ ─── */}
                {activeTab === 'premiums' && companyData?.personnelEnabled && (
                    <div className="space-y-3.5">
                        {/* Üst Bar */}
                        <div className="flex items-center justify-between gap-3 bg-[#0d1117] border border-white/[0.08] p-3 rounded-2xl">
                            <div className="text-xs text-slate-300">
                                Sistemde tanımlı toplam <span className="font-bold text-indigo-400 font-mono">{premiums.length}</span> prim şablonu bulunuyor.
                            </div>
                            <button 
                                onClick={() => { setShowPremiumForm(!showPremiumForm); setEditingPremiumId(null); resetPremiumForm(); }} 
                                className="h-8 px-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md shadow-indigo-600/25 active:scale-95 cursor-pointer shrink-0"
                            >
                                <Plus size={14} />
                                <span>Yeni Prim Ekle</span>
                            </button>
                        </div>

                        {/* Prim Ekleme / Düzenleme Formu */}
                        {showPremiumForm && (
                            <form onSubmit={handleSavePremium} className="bg-[#07090e] p-4 sm:p-5 rounded-2xl border border-indigo-500/30 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                        <Award size={14} className="text-indigo-400" /> {editingPremiumId ? 'Prim Şablonunu Düzenle' : 'Yeni Prim Şablonu Ekle'}
                                    </h4>
                                    <button 
                                        type="button" 
                                        onClick={() => setShowPremiumForm(false)}
                                        className="text-slate-400 hover:text-white p-1 cursor-pointer"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Prim Adı *</label>
                                        <input type="text" required value={premName} onChange={e => setPremName(e.target.value)} className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-semibold focus:border-indigo-500 outline-none" placeholder="Örn: Kısa Yol Primi" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Prim Tipi *</label>
                                        <select value={premType} onChange={e => setPremType(e.target.value)} className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-semibold focus:border-indigo-500 outline-none">
                                            <option value="fixed">Sabit Tutar</option>
                                            <option value="perTonnage">Ton Başı Tutar</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1">{premType === 'fixed' ? 'Sabit Tutar (₺) *' : 'Ton Başı Tutar (₺) *'}</label>
                                        <input type="number" step="any" required value={premAmount} onChange={e => setPremAmount(e.target.value)} className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-mono font-bold focus:border-indigo-500 outline-none" placeholder="Örn: 500" />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                    <button type="button" onClick={() => setShowPremiumForm(false)} className="h-8 px-3 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition cursor-pointer">
                                        İptal
                                    </button>
                                    <button type="submit" className="h-8 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer">
                                        <Check size={14} /> {editingPremiumId ? 'Güncelle' : 'Kaydet'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Prim Kartları Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            {premiums.map(prem => (
                                <div key={prem.id} className="bg-[#07090e] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-white/[0.08] hover:border-white/20 transition flex flex-col justify-between">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                                            <Award size={18} />
                                        </div>
                                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">
                                            {prem.type === 'fixed' ? 'SABİT TUTAR' : 'TON BAŞI'}
                                        </span>
                                    </div>

                                    <div className="mb-4 flex-1">
                                        <h4 className="text-sm font-bold text-white mb-1 truncate" title={prem.name}>{prem.name}</h4>
                                        <p className="text-2xl font-black text-emerald-400 font-mono mt-1">
                                            ₺{Number(prem.amount).toLocaleString('tr-TR')}
                                            {prem.type === 'perTonnage' && <span className="text-xs text-slate-400 font-normal font-sans"> / ton</span>}
                                        </p>
                                    </div>

                                    <div className="pt-3 border-t border-white/[0.06] flex justify-end gap-1.5 mt-auto">
                                        <button onClick={() => handleEditPremium(prem)} className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-indigo-400 flex items-center justify-center transition cursor-pointer" title="Düzenle">
                                            <Edit2 size={13} />
                                        </button>
                                        <button onClick={() => handleDeletePremium(prem.id, prem.name)} className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer" title="Sil">
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {premiums.length === 0 && (
                                <div className="col-span-full text-center py-10 text-slate-500 text-xs">
                                    Henüz tanımlı prim şablonu bulunmuyor.
                                </div>
                            )}
                        </div>
                    </div>
                )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                    {/* Üst Kart / Panel */}
                    <div className="bg-[#07090e] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/[0.08] space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-4">
                            <div className="flex items-center space-x-3">
                                <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                                    <Bell size={22} className="animate-pulse" />
                                </div>
                                <div>
                                    <h4 className="text-lg font-bold text-[var(--text-primary)]">Zengin Anlık Bildirim Stüdyosu</h4>
                                    <p className="text-xs text-[var(--text-secondary)]">Personel ve şoförlerin telefonlarına zengin aksiyonlu push bildirimleri gönderin</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={registeringDevice}
                                onClick={async () => {
                                    setRegisteringDevice(true);
                                    setNotifResult(null);
                                    try {
                                        const currentUid = auth.currentUser?.uid;
                                        if (!currentUid) {
                                            setNotifResult({ error: 'Oturum açık değil. Lütfen tekrar giriş yapın.' });
                                            return;
                                        }
                                        const res = await requestAndSaveNotificationToken(currentUid);
                                        if (res.success) {
                                            setNotifResult({
                                                success: true,
                                                message: '✅ Bu cihaz başarıyla bildirim sistemine kaydedildi! Artık bu telefondan/tarayıcıdan anlık bildirim alabilirsiniz.'
                                            });
                                        } else {
                                            setNotifResult({
                                                error: res.error || 'Cihaz kaydedilemedi.'
                                            });
                                        }
                                    } catch (err) {
                                        setNotifResult({ error: err.message || 'Cihaz kaydedilirken bir hata oluştu.' });
                                    } finally {
                                        setRegisteringDevice(false);
                                    }
                                }}
                                className="text-xs bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 px-3.5 py-2 rounded-xl font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                            >
                                {registeringDevice ? (
                                    <>
                                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-indigo-300 border-t-transparent" />
                                        Cihaz Kaydediliyor...
                                    </>
                                ) : (
                                    <>
                                        <Smartphone size={14} />
                                        Bu Cihazı Bildirime Kaydet
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Canlı İstatistik Sayaçları */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                                <div>
                                    <div className="text-xs text-[var(--text-secondary)] font-medium">Kayıtlı Aktif Cihazlar</div>
                                    <div className="text-xl font-bold text-white mt-0.5">
                                        {approvedUsers.filter(u => u.companyId === activeCompanyId).reduce((sum, u) => sum + (u.fcmTokens?.length || 0), 0)} Cihaz
                                    </div>
                                </div>
                                <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
                                    <Users size={20} />
                                </div>
                            </div>
                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                                <div>
                                    <div className="text-xs text-[var(--text-secondary)] font-medium">Bildirim Alabilecek Personel</div>
                                    <div className="text-xl font-bold text-emerald-400 mt-0.5">
                                        {approvedUsers.filter(u => u.companyId === activeCompanyId && u.fcmTokens && u.fcmTokens.length > 0).length} / {approvedUsers.filter(u => u.companyId === activeCompanyId).length} Kişi
                                    </div>
                                </div>
                                <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
                                    <Bell size={20} />
                                </div>
                            </div>
                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                                <div>
                                    <div className="text-xs text-[var(--text-secondary)] font-medium">Gönderilen Bildirim Arşivi</div>
                                    <div className="text-xl font-bold text-amber-400 mt-0.5">
                                        {(companyNotifications || []).length} Adet
                                    </div>
                                </div>
                                <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400">
                                    <Activity size={20} />
                                </div>
                            </div>
                        </div>

                        {/* Hızlı Şablonlar */}
                        <div>
                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                                <Sparkles size={14} className="text-amber-400" />
                                1 Tıkla Hazır Şablonlar
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {QUICK_TEMPLATES.map((tmpl, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => {
                                            setNotifTitle(tmpl.title);
                                            setNotifBody(tmpl.body);
                                            setNotifTargetTab(tmpl.tab);
                                            setNotifButtons(tmpl.buttons || []);
                                        }}
                                        className="text-xs bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 border border-white/10 hover:border-indigo-500/40 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                                    >
                                        {tmpl.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Bildirim Formu */}
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (!notifBody.trim()) return;
                            setNotifSending(true);
                            setNotifResult(null);

                            try {
                                const isAll = notifRecipient === 'all';
                                const res = await callAdminApi('sendPushNotification', {
                                    allCompany: isAll,
                                    targetUid: isAll ? null : notifRecipient,
                                    title: notifTitle.trim(),
                                    body: notifBody.trim(),
                                    targetTab: notifTargetTab,
                                    buttons: notifButtons,
                                    companyId: activeCompanyId
                                });

                                if (res.success && res.sentCount > 0) {
                                    setNotifResult({
                                        success: true,
                                        message: `🚀 Bildirim başarıyla gönderildi! Toplam ${res.sentCount} cihaza iletildi ve arşive kaydedildi.`
                                    });
                                    setNotifBody('');
                                } else if (res.success && res.sentCount === 0) {
                                    setNotifResult({
                                        success: true,
                                        message: '✅ Bildirim arşive ve sisteme kaydedildi. (Şu anda bildirim izni açık cihaz bulunamadı).'
                                    });
                                } else {
                                    setNotifResult({
                                        error: res.message || 'Bildirim gönderilemedi.'
                                    });
                                }
                            } catch (err) {
                                setNotifResult({ error: err.message || 'Bildirim gönderilirken sunucu hatası oluştu.' });
                            } finally {
                                setNotifSending(false);
                            }
                        }} className="space-y-5">
                            {notifResult && (
                                <div className={`p-4 rounded-xl border text-sm flex items-start gap-2.5 ${notifResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'}`}>
                                    {notifResult.success ? <CheckCircle size={18} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />}
                                    <div>{notifResult.success ? notifResult.message : notifResult.error}</div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Alıcı Seçimi</label>
                                    <select
                                        value={notifRecipient}
                                        onChange={(e) => setNotifRecipient(e.target.value)}
                                        className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-xl px-3.5 py-2.5 text-sm focus:border-indigo-500 outline-none"
                                    >
                                        <option value="all">
                                            👥 Tüm Şirket Çalışanları & Şoförler ({approvedUsers.filter(u => u.companyId === activeCompanyId).reduce((sum, u) => sum + (u.fcmTokens?.length || 0), 0)} Cihaz)
                                        </option>
                                        {approvedUsers
                                            .filter(u => u.companyId === activeCompanyId)
                                            .map(u => (
                                                <option key={u.id} value={u.id}>
                                                    👤 {u.username} ({u.role}) {u.fcmTokens?.length ? `— ${u.fcmTokens.length} Cihaz Aktif` : '— Cihaz Kaydı Yok'}
                                                </option>
                                            ))
                                        }
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Bildirim Başlığı</label>
                                    <input
                                        type="text"
                                        required
                                        value={notifTitle}
                                        onChange={(e) => setNotifTitle(e.target.value)}
                                        className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-xl px-3.5 py-2.5 text-sm focus:border-indigo-500 outline-none"
                                        placeholder="Örn: İnaner Lojistik Görev"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Bildirim Mesajı</label>
                                <textarea
                                    required
                                    rows={3}
                                    value={notifBody}
                                    onChange={(e) => setNotifBody(e.target.value)}
                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-xl px-3.5 py-2.5 text-sm focus:border-indigo-500 outline-none resize-none"
                                    placeholder="İletmek istediğiniz mesajı buraya yazın..."
                                />
                            </div>

                            {/* Tıklanınca Açılacak Sayfa (Bildirimler en başta) */}
                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                                    <Navigation size={14} className="text-indigo-400" />
                                    Tıklanınca Açılacak Sayfa (Kilit Ekranı & Bildirim Başlığı)
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                                    {NOTIF_DESTINATIONS.map((dest) => {
                                        const IconComponent = dest.icon;
                                        const isSelected = notifTargetTab === dest.id;
                                        return (
                                            <button
                                                key={dest.id}
                                                type="button"
                                                onClick={() => setNotifTargetTab(dest.id)}
                                                className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all text-left cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-md shadow-indigo-600/20'
                                                        : 'bg-white/[0.02] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                                                }`}
                                            >
                                                <div className={`p-1.5 rounded-lg ${dest.color}`}>
                                                    <IconComponent size={14} />
                                                </div>
                                                <span className="truncate">{dest.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Özel Buton Tasarımcısı */}
                            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <label className="text-sm font-bold text-white flex items-center gap-1.5">
                                            <Sparkles size={16} className="text-indigo-400" />
                                            Özel Buton Tasarımcısı
                                        </label>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            Bildirim kartında yer alacak aksiyon butonlarını kolayca oluşturun ve düzenleyin (En fazla 6 buton).
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={notifButtons.length >= 6}
                                        onClick={() => {
                                            const newId = Date.now().toString();
                                            setNotifButtons(prev => [
                                                ...prev,
                                                { id: newId, label: 'Yeni Buton', icon: 'thumbs_up', actionType: 'ack_approved', style: 'emerald' }
                                            ]);
                                        }}
                                        className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                                    >
                                        <Plus size={13} />
                                        <span>+ Yeni Buton Ekle</span>
                                    </button>
                                </div>

                                {/* Hızlı Buton Seti Şablonları */}
                                <div>
                                    <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">Hızlı Buton Seti Şablonu:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {BUTTON_PRESETS.map((preset, pIdx) => (
                                            <button
                                                key={pIdx}
                                                type="button"
                                                onClick={() => setNotifButtons(preset.buttons)}
                                                className="text-[11px] bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 border border-white/10 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Dinamik Buton Listesi & Düzenleyici */}
                                <div className="space-y-2.5 pt-1">
                                    {notifButtons.map((btn, idx) => (
                                        <div
                                            key={btn.id || idx}
                                            className="p-3 rounded-xl bg-black/40 border border-white/10 flex flex-wrap items-center gap-2.5"
                                        >
                                            <span className="text-xs font-bold text-slate-500 w-4">#{idx + 1}</span>

                                            {/* İkon Seçici */}
                                            <select
                                                value={btn.icon}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setNotifButtons(prev => prev.map(b => b.id === btn.id ? { ...b, icon: val } : b));
                                                }}
                                                className="bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-white text-xs rounded-lg px-2 py-1.5 outline-none"
                                            >
                                                {AVAILABLE_ICONS.map(ic => (
                                                    <option key={ic.id} value={ic.id}>{ic.label}</option>
                                                ))}
                                            </select>

                                            {/* Buton Metni */}
                                            <div className="flex-1 min-w-[130px]">
                                                <input
                                                    type="text"
                                                    value={btn.label}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setNotifButtons(prev => prev.map(b => b.id === btn.id ? { ...b, label: val } : b));
                                                    }}
                                                    placeholder="Buton Yazısı..."
                                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-white text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 font-semibold"
                                                />
                                            </div>

                                            {/* Aksiyon Türü */}
                                            <div className="min-w-[125px]">
                                                <select
                                                    value={btn.actionType}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setNotifButtons(prev => prev.map(b => b.id === btn.id ? {
                                                            ...b,
                                                            actionType: val,
                                                            targetTab: val === 'navigate' ? (b.targetTab || 'detaylar') : undefined,
                                                            style: val === 'ack_approved' ? 'emerald' : val === 'ack_rejected' ? 'red' : 'indigo'
                                                        } : b));
                                                    }}
                                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-white text-xs rounded-lg px-2 py-1.5 outline-none"
                                                >
                                                    <option value="ack_approved">🤝 Şoför Onayı</option>
                                                    <option value="ack_rejected">❌ Sorun Bildirimi</option>
                                                    <option value="navigate">🚀 Sayfaya Yönlendir</option>
                                                </select>
                                            </div>

                                            {/* Hedef Sayfa (Eğer Sayfaya Git ise) */}
                                            {btn.actionType === 'navigate' && (
                                                <div className="min-w-[130px]">
                                                    <select
                                                        value={btn.targetTab || 'detaylar'}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setNotifButtons(prev => prev.map(b => b.id === btn.id ? { ...b, targetTab: val } : b));
                                                        }}
                                                        className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-indigo-300 text-xs rounded-lg px-2 py-1.5 outline-none font-semibold"
                                                    >
                                                        {NOTIF_DESTINATIONS.map(d => (
                                                            <option key={d.id} value={d.id}>{d.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            {/* Renk Teması */}
                                            <div className="min-w-[95px]">
                                                <select
                                                    value={btn.style || 'indigo'}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setNotifButtons(prev => prev.map(b => b.id === btn.id ? { ...b, style: val } : b));
                                                    }}
                                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-xs rounded-lg px-2 py-1.5 outline-none"
                                                >
                                                    <option value="emerald">🟢 Yeşil</option>
                                                    <option value="red">🔴 Kırmızı</option>
                                                    <option value="indigo">🔵 İndigo</option>
                                                    <option value="amber">🟡 Sarı</option>
                                                    <option value="glass">⚪ Cam</option>
                                                </select>
                                            </div>

                                            {/* Sil */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNotifButtons(prev => prev.filter(b => b.id !== btn.id));
                                                }}
                                                className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/25 transition-colors cursor-pointer"
                                                title="Butonu Sil"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}

                                    {notifButtons.length === 0 && (
                                        <div className="text-center py-3 text-xs text-slate-500 bg-white/[0.01] rounded-xl border border-dashed border-white/10">
                                            Tanımlı buton yok. Bildirim yalnızca bilgilendirme metni olarak iletilecektir.
                                        </div>
                                    )}
                                </div>

                                {/* Canlı Önizleme Kartı (Live Preview Card) */}
                                <div className="mt-3 p-4 rounded-xl bg-black/60 border border-white/10">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <Eye size={13} className="text-indigo-400" />
                                        Cihazda Görünecek Canlı Kart Önizlemesi
                                    </div>
                                    <div className="p-4 rounded-2xl bg-[#090d16]/95 border border-white/10 shadow-2xl backdrop-blur-xl max-w-md">
                                        <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                                                <Bell size={16} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="text-xs font-bold text-white truncate">{notifTitle || 'Bildirim Başlığı'}</h4>
                                                <p className="text-[11px] text-slate-300 mt-1 leading-snug break-words">
                                                    {notifBody || 'Bildirim metni burada görünecektir...'}
                                                </p>
                                            </div>
                                        </div>

                                        {notifButtons.length > 0 && (
                                            <div className="mt-3 pt-2.5 border-t border-white/5 flex flex-wrap gap-1.5">
                                                {notifButtons.map((btn, bIdx) => (
                                                    <div
                                                        key={bIdx}
                                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 ${
                                                            btn.style === 'emerald' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                                                            btn.style === 'red' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                                                            btn.style === 'amber' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                                            btn.style === 'glass' ? 'bg-white/10 text-slate-200 border-white/20' :
                                                            'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                                        }`}
                                                    >
                                                        {AVAILABLE_ICONS.find(i => i.id === btn.icon)?.label.split(' ')[0] || '🔘'}
                                                        <span>{btn.label}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={notifSending || !notifBody.trim()}
                                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-sm font-bold flex items-center transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
                                >
                                    {notifSending ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                                            Gönderiliyor...
                                        </>
                                    ) : (
                                        <>
                                            <Send size={16} className="mr-2" />
                                            Zengin Bildirimi Gönder
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Son Gönderilen Bildirimler & Canlı Onay Takip Paneli */}
                    <div className="bg-[#07090e] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/[0.08] space-y-4">
                        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                            <div className="flex items-center space-x-2.5">
                                <Clock size={18} className="text-amber-400" />
                                <h4 className="text-base font-bold text-[var(--text-primary)]">Gönderilen Bildirimler & Canlı Onay Takibi</h4>
                            </div>
                            <span className="text-xs text-[var(--text-secondary)]">{(companyNotifications || []).length} Kayıt</span>
                        </div>

                        {(!companyNotifications || companyNotifications.length === 0) ? (
                            <div className="py-8 text-center text-slate-500 text-xs">
                                Henüz gönderilmiş bir bildirim bulunmuyor.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {companyNotifications.slice(0, 10).map((notif) => {
                                    const acks = notif.acknowledgements || {};
                                    const approvedList = Object.values(acks).filter(a => a.status === 'approved');
                                    const rejectedList = Object.values(acks).filter(a => a.status === 'rejected');
                                    const readCount = (notif.readBy || []).length;

                                    return (
                                        <div key={notif.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 transition-all space-y-3">
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <div className="flex items-start gap-3 min-w-0">
                                                    {notif.imageUrl && (
                                                        <img src={notif.imageUrl} alt="Ek" className="w-12 h-12 object-cover rounded-lg border border-white/10 flex-shrink-0" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-xs font-bold text-white">{notif.title}</span>
                                                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                                                                Hedef: {notif.targetType === 'all' ? 'Tüm Şirket' : 'Özel Alıcı'}
                                                            </span>
                                                            {notif.targetTab && (
                                                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-slate-300 border border-white/10">
                                                                    Sayfa: {NOTIF_DESTINATIONS.find(d => d.id === notif.targetTab)?.label || notif.targetTab}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap leading-relaxed">{notif.body}</p>
                                                    </div>
                                                </div>
                                                <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                                                    {notif.createdAt ? new Date(notif.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                                                </span>
                                            </div>

                                            {/* Şoför Yanıt ve Onay Durumu */}
                                            {notif.requireAck && (
                                                <div className="pt-2 border-t border-white/5 flex flex-wrap items-center gap-3 text-xs">
                                                    <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 font-semibold">
                                                        <CheckCircle size={13} />
                                                        <span>{approvedList.length} Onay</span>
                                                        {approvedList.length > 0 && (
                                                            <span className="text-[10px] text-emerald-300 font-normal">
                                                                ({approvedList.map(a => a.driverName).join(', ')})
                                                            </span>
                                                        )}
                                                    </div>

                                                    {rejectedList.length > 0 && (
                                                        <div className="flex items-center gap-1.5 text-red-400 bg-red-500/10 px-2.5 py-1 rounded-lg border border-red-500/20 font-semibold">
                                                            <XCircle size={13} />
                                                            <span>{rejectedList.length} Sorun Bildirimi</span>
                                                            <span className="text-[10px] text-red-300 font-normal">
                                                                ({rejectedList.map(a => `${a.driverName}${a.note ? `: ${a.note}` : ''}`).join(', ')})
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-1 text-slate-400 text-[11px] ml-auto">
                                                        <Eye size={12} />
                                                        <span>{readCount} Kişi Gördü</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
            </div>

            {/* Kullanıcı Silme Onay Modalı */}
            {isDeleteModalOpen && userToDelete && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-[#07090e] border border-red-500/30 rounded-3xl w-full max-w-sm p-6 relative shadow-2xl animate-in zoom-in-95 duration-200">
                        <button 
                            onClick={() => { setIsDeleteModalOpen(false); setUserToDelete(null); }} 
                            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                        <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 mb-4">
                            <AlertTriangle size={24} />
                        </div>
                        <h3 className="text-base font-bold text-white mb-2">
                            Şoförü Sil
                        </h3>
                        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                            <strong className="text-white uppercase font-mono">@{userToDelete.username}</strong> ({userToDelete.fullName || 'Şoför'}) isimli kullanıcıyı şirketinizden tamamen silmek istediğinize emin misiniz?
                        </p>
                        <div className="flex gap-2.5">
                            <button 
                                onClick={() => { setIsDeleteModalOpen(false); setUserToDelete(null); }} 
                                className="flex-1 h-9 bg-white/[0.05] hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                            >
                                İptal Et
                            </button>
                            <button 
                                onClick={async () => {
                                    try {
                                        await deleteUser(userToDelete.id);
                                        setIsDeleteModalOpen(false);
                                        setUserToDelete(null);
                                    } catch {
                                        alert("Kullanıcı silinirken bir hata oluştu.");
                                    }
                                }} 
                                className="flex-1 h-9 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-red-600/30 cursor-pointer"
                            >
                                Evet, Sil
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CompanyAdmin;

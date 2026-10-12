import React, { useState, useContext, useMemo, useEffect } from 'react';
import { useCompany } from '../context/CompanyContext';
import { useTruck } from '../context/TruckContext';
import { DataContext } from '../context/DataContext';
import { Building2, Truck, Users, Plus, Edit2, Trash2, Check, X, AlertTriangle, Key, BarChart3, Award, User, Bell, Send, Smartphone, Tablet, Monitor, Image, FileText, Navigation, MapPin, Activity, CheckCircle, XCircle, Clock, Sparkles, Radio, Volume2, VolumeX, Fuel, Wrench, Receipt, CreditCard, Shield, ExternalLink, RefreshCw, Eye, UploadCloud, Menu, Scale } from 'lucide-react';
import { db, auth } from '../services/firebaseConfig';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { requestAndSaveNotificationToken, updateDeviceCustomName } from '../services/notificationService';
import { uploadToCloudinary } from '../services/cloudinaryService';

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

    // Sadeleştirilmiş Cihaz Tabanlı Bildirim Durumları
    const [notifTitle, setNotifTitle] = useState('İnaner Lojistik Duyuru');
    const [notifBody, setNotifBody] = useState('');
    const [selectedDeviceTokens, setSelectedDeviceTokens] = useState([]);
    const [notifSending, setNotifSending] = useState(false);
    const [notifResult, setNotifResult] = useState(null);
    const [registeringDevice, setRegisteringDevice] = useState(false);

    // Cihaz İsimlendirme Durumları
    const [editingToken, setEditingToken] = useState(null);
    const [editingNameValue, setEditingNameValue] = useState('');
    const [savingName, setSavingName] = useState(false);

    // Bu cihazın tokenı (localStorage)
    const currentLocalToken = typeof window !== 'undefined' ? localStorage.getItem('fcm_device_token') : null;

    // Şirkete ait tüm kayıtlı cihazların listesi (YALNIZCA SON 10 GÜNDE AKTİF OLANLAR)
    const registeredDevices = useMemo(() => {
        const list = [];
        const seenTokens = new Set();
        const companyUsers = approvedUsers.filter(u => u.companyId === activeCompanyId);
        const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        companyUsers.forEach(u => {
            const userNicknames = u.deviceNicknames || {};

            // 1. Varsa detaylı fcmDevices nesneleri
            if (Array.isArray(u.fcmDevices)) {
                u.fcmDevices.forEach(d => {
                    const token = typeof d === 'string' ? d : d?.token;
                    if (token && !seenTokens.has(token)) {
                        seenTokens.add(token);
                        const customName = d.customName || userNicknames[token] || (typeof window !== 'undefined' ? localStorage.getItem(`device_nickname_${token}`) : '') || '';
                        const lastActive = d.lastActive || u.lastActive || null;

                        list.push({
                            token,
                            customName,
                            deviceName: d.deviceName || `${d.os || 'Cihaz'} (${d.browser || 'Tarayıcı'})`,
                            model: d.model || d.os || 'Cihaz',
                            deviceType: d.deviceType || 'Mobil',
                            os: d.os || 'Bilinmiyor',
                            browser: d.browser || '',
                            lastActive,
                            registeredAt: d.registeredAt || null,
                            userId: u.id,
                            userDisplayName: u.fullName || u.username
                        });
                    }
                });
            }

            // 2. Detaylı listede henüz yer almayan fcmTokens tokenları
            if (Array.isArray(u.fcmTokens)) {
                u.fcmTokens.forEach((tok) => {
                    if (tok && !seenTokens.has(tok)) {
                        seenTokens.add(tok);
                        const customName = userNicknames[tok] || (typeof window !== 'undefined' ? localStorage.getItem(`device_nickname_${tok}`) : '') || '';
                        const lastActive = u.lastActive || null;

                        list.push({
                            token: tok,
                            customName,
                            deviceName: customName || `Kayıtlı Cihaz #${list.length + 1}`,
                            model: 'Kayıtlı Cihaz',
                            deviceType: 'Mobil',
                            os: 'Kayıtlı Cihaz',
                            browser: '',
                            lastActive,
                            registeredAt: null,
                            userId: u.id,
                            userDisplayName: u.fullName || u.username
                        });
                    }
                });
            }
        });

        // 3. Yalnızca son 10 gün içinde aktif olan cihazları filtrele
        const filtered = list.filter(d => {
            if (currentLocalToken && d.token === currentLocalToken) return true;
            const activeDateStr = d.lastActive || d.registeredAt;
            if (!activeDateStr) return true;
            const activeTime = new Date(activeDateStr).getTime();
            if (isNaN(activeTime)) return true;
            return (now - activeTime) <= TEN_DAYS_MS;
        });

        return filtered;
    }, [approvedUsers, activeCompanyId, currentLocalToken]);

    // Kayıtlı cihazlar yüklendiğinde otomatik olarak tümünü seç
    useEffect(() => {
        if (registeredDevices.length > 0 && selectedDeviceTokens.length === 0) {
            setSelectedDeviceTokens(registeredDevices.map(d => d.token));
        }
    }, [registeredDevices]);

    // Mevcut cihazın modelini (iPhone 14 Pro, Samsung vb.) bildirim izni açıksa otomatik senkronize et
    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && auth.currentUser?.uid) {
            requestAndSaveNotificationToken(auth.currentUser.uid).catch(() => {});
        }
    }, []);

    // Cihaza Özel İsim Kaydetme
    const handleSaveDeviceName = async (dev, newName) => {
        if (!newName || !newName.trim()) return;
        setSavingName(true);
        try {
            const res = await updateDeviceCustomName(dev.userId, dev.token, newName.trim());
            if (res.success) {
                setEditingToken(null);
                setEditingNameValue('');
            } else {
                alert(res.error || 'Cihaz ismi kaydedilemedi.');
            }
        } catch (err) {
            alert(err.message || 'Cihaz ismi kaydedilirken bir hata oluştu.');
        } finally {
            setSavingName(false);
        }
    };

    // Bildirim Gönderme
    const handleSendPush = async (e) => {
        e.preventDefault();
        if (!notifTitle.trim() || !notifBody.trim()) {
            setNotifResult({ error: 'Lütfen bildirim başlığı ve mesaj metnini doldurun.' });
            return;
        }
        if (selectedDeviceTokens.length === 0) {
            setNotifResult({ error: 'Lütfen bildirim gönderilecek en az bir cihaz seçin.' });
            return;
        }

        setNotifSending(true);
        setNotifResult(null);

        try {
            const res = await callAdminApi('sendPushNotification', {
                targetTokens: selectedDeviceTokens,
                title: notifTitle.trim(),
                body: notifBody.trim(),
                companyId: activeCompanyId
            });

            if (res.success && res.sentCount > 0) {
                setNotifResult({
                    success: true,
                    message: `Bildirim başarıyla ${res.sentCount} cihaza iletildi.`
                });
                setNotifBody('');
            } else if (res.success && res.sentCount === 0) {
                setNotifResult({
                    success: true,
                    message: 'Bildirim sisteme kaydedildi ancak seçilen cihazlara ulaşılamadı.'
                });
            } else {
                setNotifResult({
                    error: res.message || res.error || 'Bildirim gönderilemedi.'
                });
            }
        } catch (err) {
            setNotifResult({
                error: err.message || 'Bildirim gönderilirken bir hata oluştu.'
            });
        } finally {
            setNotifSending(false);
        }
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
                            <Building2 size={20} className="text-slate-300" />
                            <span>Şirket Yönetimi</span>
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800/80 border border-slate-700/80 rounded-full text-slate-300 text-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="truncate max-w-[140px] sm:max-w-[200px]">{companyData?.name || 'Şirket'}</span>
                    </div>
                </div>
            </div>

            {/* 2. Sistemle Uyumlu Kapsül Sekme Çubuğu */}
            <div className="flex items-center gap-1.5 p-1 bg-[#0d1117] border border-white/[0.08] rounded-2xl overflow-x-auto custom-scrollbar shrink-0">
                <button
                    onClick={() => setActiveTab('trucks')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === 'trucks'
                            ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Truck size={14} />
                    <span>Araçlar</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${activeTab === 'trucks' ? 'bg-slate-700 text-slate-200' : 'bg-white/10 text-slate-400'}`}>
                        {trucks.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('drivers')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === 'drivers'
                            ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
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
                {companyData?.personnelEnabled && (
                    <button
                        onClick={() => setActiveTab('premiums')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                            activeTab === 'premiums'
                                ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <Award size={14} />
                        <span>Prim Ayarları</span>
                    </button>
                )}
                <button
                    onClick={() => setActiveTab('notifications')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === 'notifications'
                            ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
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
                    <div className="space-y-3 sm:space-y-4">
                        {/* Üst Bar */}
                        <div className="flex items-center justify-between gap-3 bg-[#0d1117] border border-white/[0.08] p-3 rounded-2xl">
                            <div className="text-xs text-slate-300">
                                Sisteme kayıtlı <span className="font-bold text-white font-mono">{trucks.length}</span> araç bulunuyor.
                            </div>
                            <button 
                                onClick={() => setShowTruckForm(!showTruckForm)} 
                                className="h-8 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0"
                            >
                                <Plus size={14} />
                                <span>Yeni Araç Ekle</span>
                            </button>
                        </div>

                        {/* Yeni Araç Ekleme Formu */}
                        {showTruckForm && (
                            <form onSubmit={handleAddTruck} className="bg-[#07090e] p-4 sm:p-5 rounded-2xl border border-white/10 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                        <Truck size={14} className="text-slate-300" /> Yeni Filo Aracı Ekle
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
                                            className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-mono font-bold uppercase focus:border-slate-500 outline-none" 
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
                                            className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-semibold focus:border-slate-500 outline-none" 
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
                                        className="h-8 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Check size={14} /> Aracı Kaydet
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Araç Kartları Grid (Seçili araç text/butonu kaldırıldı, sadece renkli çerçeve) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
                            {trucks.map(truck => {
                                const isSelected = activeTruckId === truck.id;
                                return (
                                    <div 
                                        key={truck.id} 
                                        onClick={() => setActiveTruckId(truck.id)}
                                        className={`bg-[#07090e] rounded-2xl p-4 transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                                            isSelected 
                                                ? 'border-2 border-sky-500 bg-[#07090e] shadow-lg shadow-sky-500/10' 
                                                : 'border border-white/[0.08] hover:border-slate-600'
                                        }`}
                                    >
                                        {/* Üst Kısım: TR Plaka & Düzenle/Sil */}
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            {/* TR Plaka Badge */}
                                            <div className="inline-flex items-center bg-[#0d1117] border border-white/20 rounded-xl px-2.5 py-1 gap-2 shadow-inner">
                                                <span className="text-[10px] font-black text-sky-400 bg-sky-500/20 px-1 py-0.2 rounded font-mono">TR</span>
                                                <span className="text-sm sm:text-base font-black tracking-wider font-mono text-white">
                                                    {truck.plate}
                                                </span>
                                            </div>

                                            {/* Aksiyon İkonları */}
                                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                <button 
                                                    onClick={() => { 
                                                        setEditingTruckId(truck.id); 
                                                        setEditTruckForm({ plate: truck.plate, brand: truck.brand, status: truck.status || 'active' }); 
                                                    }} 
                                                    className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer" 
                                                    title="Düzenle"
                                                >
                                                    <Edit2 size={12} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteTruck(truck.id, truck.plate)} 
                                                    className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer" 
                                                    title="Aracı Sil"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Marka & Model / Düzenleme Formu */}
                                        {editingTruckId === truck.id ? (
                                            <div className="space-y-2 my-2 p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-xl" onClick={e => e.stopPropagation()}>
                                                <input 
                                                    type="text" 
                                                    value={editTruckForm.plate} 
                                                    onChange={e => setEditTruckForm({ ...editTruckForm, plate: e.target.value.toUpperCase() })} 
                                                    className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-lg px-2.5 text-xs font-mono font-bold outline-none focus:border-slate-500" 
                                                    placeholder="Plaka" 
                                                />
                                                <input 
                                                    type="text" 
                                                    value={editTruckForm.brand} 
                                                    onChange={e => setEditTruckForm({ ...editTruckForm, brand: e.target.value })} 
                                                    className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-lg px-2.5 text-xs font-semibold outline-none focus:border-slate-500" 
                                                    placeholder="Marka / Model" 
                                                />
                                                <select 
                                                    value={editTruckForm.status} 
                                                    onChange={e => setEditTruckForm({ ...editTruckForm, status: e.target.value })} 
                                                    className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-lg px-2 text-xs outline-none focus:border-slate-500"
                                                >
                                                    <option value="active">Aktif (Çalışıyor)</option>
                                                    <option value="inactive">Pasif (Yatıyor)</option>
                                                    <option value="maintenance">Bakımda</option>
                                                </select>
                                                <div className="flex gap-2 pt-1">
                                                    <button 
                                                        onClick={() => handleEditSaveTruck(truck.id)} 
                                                        className="flex-1 h-7 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 border border-slate-700 cursor-pointer"
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
                                            <div className="flex items-center justify-between mt-1">
                                                <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                                                    <Truck size={13} className="text-slate-400" />
                                                    <span>{truck.brand || 'Model Belirtilmedi'}</span>
                                                </p>
                                                {truck.status && truck.status !== 'active' && (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                        {truck.status === 'inactive' ? 'PASİF' : 'BAKIMDA'}
                                                    </span>
                                                )}
                                            </div>
                                        )}
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
                                Sistemde toplam <span className="font-bold text-white font-mono">{approvedUsers.filter(u => u.role === 'şoför' || u.role === 'user' || u.isDriver || u.username === 'mert' || (u.fullName && u.fullName.toLowerCase().includes('mert'))).length}</span> aktif şoför bulunuyor.
                            </div>
                            <button 
                                onClick={() => { setShowOfflineDriverForm(!showOfflineDriverForm); setEditingOfflineDriverId(null); setNewOfflineDriverName(''); setNewOfflineDriverPhone(''); }} 
                                className="h-8 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0"
                            >
                                <Plus size={14} />
                                <span>Çevrimdışı Şoför Ekle</span>
                            </button>
                        </div>

                        {/* Çevrimdışı Şoför Ekleme Formu */}
                        {showOfflineDriverForm && (
                            <form onSubmit={handleSaveOfflineDriver} className="bg-[#07090e] p-4 sm:p-5 rounded-2xl border border-white/10 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                        <User size={14} className="text-slate-300" /> {editingOfflineDriverId ? 'Çevrimdışı Şoförü Düzenle' : 'Yeni Çevrimdışı Şoför Ekle'}
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
                                        <input type="text" required value={newOfflineDriverName} onChange={e => setNewOfflineDriverName(e.target.value)} className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-semibold focus:border-slate-500 outline-none" placeholder="Örn: Ahmet Yılmaz" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Telefon Numarası (İsteğe Bağlı)</label>
                                        <input type="text" value={newOfflineDriverPhone} onChange={e => setNewOfflineDriverPhone(e.target.value)} className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-mono focus:border-slate-500 outline-none" placeholder="Örn: 0555..." />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                    <button type="button" onClick={() => { setShowOfflineDriverForm(false); setEditingOfflineDriverId(null); }} className="h-8 px-3 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition cursor-pointer">
                                        İptal
                                    </button>
                                    <button type="submit" className="h-8 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition border border-slate-700 flex items-center gap-1.5 cursor-pointer">
                                        <Check size={14} /> {editingOfflineDriverId ? 'Güncelle' : 'Kaydet'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Aktif Şoförler (Sistem Kullanıcıları) */}
                        <div className="bg-[#07090e] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/[0.08]">
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3.5 flex items-center gap-2">
                                <Users size={14} className="text-slate-300" /> Aktif Şoförler (Sistem Kullanıcıları)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {approvedUsers.filter(u => u.role === 'şoför' || u.role === 'user' || u.isDriver || u.username === 'mert' || (u.fullName && u.fullName.toLowerCase().includes('mert'))).map(driver => (
                                    <div key={driver.id} className="bg-white/[0.03] hover:bg-white/[0.05] p-3.5 rounded-2xl border border-white/[0.07] flex items-center justify-between gap-3 transition">
                                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                                            <Users size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-white text-xs sm:text-sm truncate">{driver.fullName || (driver.firstName ? `${driver.firstName} ${driver.lastName || ''}`.trim() : driver.username)}</p>
                                            <p className="text-[11px] text-slate-400 truncate">@{driver.username}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full inline-block">
                                                    {driver.role === 'admin' ? 'ŞOFÖR / YÖNETİCİ' : 'ŞOFÖR'}
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
                                                        className="w-full bg-[#0d1117] border border-white/[0.1] text-white text-xs rounded-lg px-2 py-1 outline-none focus:border-slate-500" 
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
                                {approvedUsers.filter(u => u.role === 'şoför' || u.role === 'user' || u.isDriver || u.username === 'mert' || (u.fullName && u.fullName.toLowerCase().includes('mert'))).length === 0 && (
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
                                            <button onClick={() => handleEditOfflineDriver(driver)} className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer" title="Düzenle">
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

                {/* ─── PRİM AYARLARI SEKMESİ ─── */}
                {activeTab === 'premiums' && companyData?.personnelEnabled && (
                    <div className="space-y-3.5">
                        {/* Üst Bar */}
                        <div className="flex items-center justify-between gap-3 bg-[#0d1117] border border-white/[0.08] p-3 rounded-2xl">
                            <div className="text-xs text-slate-300">
                                Sistemde tanımlı toplam <span className="font-bold text-white font-mono">{premiums.length}</span> prim şablonu bulunuyor.
                            </div>
                            <button 
                                onClick={() => { setShowPremiumForm(!showPremiumForm); setEditingPremiumId(null); resetPremiumForm(); }} 
                                className="h-8 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0"
                            >
                                <Plus size={14} />
                                <span>Yeni Prim Ekle</span>
                            </button>
                        </div>

                        {/* Prim Ekleme / Düzenleme Formu */}
                        {showPremiumForm && (
                            <form onSubmit={handleSavePremium} className="bg-[#07090e] p-4 sm:p-5 rounded-2xl border border-white/10 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                        <Award size={14} className="text-slate-300" /> {editingPremiumId ? 'Prim Şablonunu Düzenle' : 'Yeni Prim Şablonu Ekle'}
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
                                        <input type="text" required value={premName} onChange={e => setPremName(e.target.value)} className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-semibold focus:border-slate-500 outline-none" placeholder="Örn: Kısa Yol Primi" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Prim Tipi *</label>
                                        <select value={premType} onChange={e => setPremType(e.target.value)} className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-semibold focus:border-slate-500 outline-none">
                                            <option value="fixed">Sabit Tutar</option>
                                            <option value="perTonnage">Ton Başı Tutar</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-slate-400 mb-1">{premType === 'fixed' ? 'Sabit Tutar (₺) *' : 'Ton Başı Tutar (₺) *'}</label>
                                        <input type="number" step="any" required value={premAmount} onChange={e => setPremAmount(e.target.value)} className="w-full h-9 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-mono font-bold focus:border-slate-500 outline-none" placeholder="Örn: 500" />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                    <button type="button" onClick={() => setShowPremiumForm(false)} className="h-8 px-3 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition cursor-pointer">
                                        İptal
                                    </button>
                                    <button type="submit" className="h-8 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition border border-slate-700 flex items-center gap-1.5 cursor-pointer">
                                        <Check size={14} /> {editingPremiumId ? 'Güncelle' : 'Kaydet'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Prim Kartları Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            {premiums.map(prem => (
                                <div key={prem.id} className="bg-[#07090e] rounded-2xl p-4 border border-white/[0.08] hover:border-slate-600 transition flex flex-col justify-between">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                                            <Award size={16} />
                                        </div>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                            {prem.type === 'fixed' ? 'SABİT TUTAR' : 'TON BAŞI'}
                                        </span>
                                    </div>

                                    <div className="mb-3 flex-1">
                                        <h4 className="text-xs font-bold text-white mb-1 truncate" title={prem.name}>{prem.name}</h4>
                                        <p className="text-xl font-black text-emerald-400 font-mono mt-1">
                                            ₺{Number(prem.amount).toLocaleString('tr-TR')}
                                            {prem.type === 'perTonnage' && <span className="text-xs text-slate-400 font-normal font-sans"> / ton</span>}
                                        </p>
                                    </div>

                                    <div className="pt-2.5 border-t border-white/[0.06] flex justify-end gap-1 mt-auto">
                                        <button onClick={() => handleEditPremium(prem)} className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer" title="Düzenle">
                                            <Edit2 size={12} />
                                        </button>
                                        <button onClick={() => handleDeletePremium(prem.id, prem.name)} className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer" title="Sil">
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {premiums.length === 0 && (
                                <div className="col-span-full text-center py-8 text-slate-500 text-xs">
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
                        {/* Başlık ve Cihaz Kayıt Butonu */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
                            <div className="flex items-center space-x-3">
                                <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                                    <Bell size={22} />
                                </div>
                                <div>
                                    <h4 className="text-base sm:text-lg font-bold text-white">Anlık Bildirim Gönderimi</h4>
                                    <p className="text-xs text-slate-400">Şirket cihazlarına anında bildirim ve duyuru iletin</p>
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
                                                message: 'Bu cihaz başarıyla bildirim sistemine kaydedildi.'
                                            });
                                            if (res.token) {
                                                setSelectedDeviceTokens(prev => Array.from(new Set([...prev, res.token])));
                                            }
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

                        {/* Sonuç Mesajı (Bildirim Durumu) */}
                        {notifResult && (
                            <div className={`p-4 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5 ${notifResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'}`}>
                                {notifResult.success ? <CheckCircle size={18} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />}
                                <div>{notifResult.success ? notifResult.message : notifResult.error}</div>
                            </div>
                        )}

                        {/* Bildirim Formu */}
                        <form onSubmit={handleSendPush} className="space-y-5">
                            {/* 1. Hangi Cihazlara Gönderileceği (Cihaz Seçimi) */}
                            <div className="space-y-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                                            <Smartphone size={14} className="text-indigo-400" />
                                            Bildirim Gönderilecek Cihazlar
                                            <span className="text-[11px] text-slate-400 font-normal">
                                                ({selectedDeviceTokens.length} / {registeredDevices.length} Cihaz Seçili)
                                            </span>
                                        </label>
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                            Yalnızca son 10 gün içinde aktif olan şirket cihazları listelenir.
                                        </p>
                                    </div>

                                    {registeredDevices.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (selectedDeviceTokens.length === registeredDevices.length) {
                                                        setSelectedDeviceTokens([]);
                                                    } else {
                                                        setSelectedDeviceTokens(registeredDevices.map(d => d.token));
                                                    }
                                                }}
                                                className="text-[11px] text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-500/20 transition cursor-pointer"
                                            >
                                                {selectedDeviceTokens.length === registeredDevices.length ? 'Seçimi Temizle' : 'Tüm Cihazları Seç'}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {registeredDevices.length === 0 ? (
                                    <div className="p-5 rounded-xl bg-white/[0.02] border border-dashed border-white/10 text-center space-y-1">
                                        <p className="text-xs text-slate-400">Son 10 gün içinde aktif olan kayıtlı cihaz bulunmuyor.</p>
                                        <p className="text-[11px] text-slate-500">
                                            Bildirim almak istediğiniz telefon veya bilgisayardan giriş yapıp yukarıdaki "Bu Cihazı Bildirime Kaydet" butonuna tıklayabilirsiniz.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                        {registeredDevices.map((dev) => {
                                            const isSelected = selectedDeviceTokens.includes(dev.token);
                                            const isCurrentDevice = currentLocalToken === dev.token;
                                            const isTablet = dev.deviceType === 'Tablet' || dev.os.includes('iPad');
                                            const isMobile = dev.deviceType === 'Mobil' || dev.os.includes('iPhone') || dev.os.includes('Android');
                                            const DeviceIcon = isTablet ? Tablet : isMobile ? Smartphone : Monitor;
                                            const isEditingThis = editingToken === dev.token;

                                            return (
                                                <div
                                                    key={dev.token}
                                                    onClick={() => {
                                                        if (isEditingThis) return;
                                                        setSelectedDeviceTokens(prev => 
                                                            isSelected ? prev.filter(t => t !== dev.token) : [...prev, dev.token]
                                                        );
                                                    }}
                                                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                                                        isSelected
                                                            ? 'bg-indigo-600/15 border-indigo-500/50 shadow-sm shadow-indigo-600/10'
                                                            : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] opacity-75 hover:opacity-100'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                                            <div className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${
                                                                isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/[0.04] text-slate-400'
                                                            }`}>
                                                                <DeviceIcon size={18} />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                {isEditingThis ? (
                                                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                                        <input
                                                                            type="text"
                                                                            autoFocus
                                                                            value={editingNameValue}
                                                                            onChange={(e) => setEditingNameValue(e.target.value)}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter') handleSaveDeviceName(dev, editingNameValue);
                                                                                if (e.key === 'Escape') setEditingToken(null);
                                                                            }}
                                                                            placeholder="Örn: Kenan iPhone 14 Pro"
                                                                            className="bg-[#05070a] border border-indigo-500/60 rounded-lg px-2 py-1 text-xs text-white outline-none w-full"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            disabled={savingName || !editingNameValue.trim()}
                                                                            onClick={() => handleSaveDeviceName(dev, editingNameValue)}
                                                                            className="p-1 rounded-md bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition cursor-pointer flex-shrink-0"
                                                                            title="Kaydet"
                                                                        >
                                                                            <Check size={13} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setEditingToken(null)}
                                                                            className="p-1 rounded-md bg-white/[0.05] text-slate-400 hover:text-white transition cursor-pointer flex-shrink-0"
                                                                            title="İptal"
                                                                        >
                                                                            <X size={13} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span className="text-xs font-bold text-white truncate max-w-[170px]" title={dev.customName || dev.deviceName}>
                                                                            {dev.customName || dev.deviceName}
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setEditingToken(dev.token);
                                                                                setEditingNameValue(dev.customName || dev.deviceName || '');
                                                                            }}
                                                                            className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-indigo-300 transition cursor-pointer"
                                                                            title="Cihaza İsim Ver / Değiştir"
                                                                        >
                                                                            <Edit2 size={11} />
                                                                        </button>
                                                                        {isCurrentDevice && (
                                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                                                Bu Cihaz
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Cihaz Donanım Detayı & Kullanıcı Bilgisi */}
                                                                <div className="text-[11px] text-slate-400 truncate mt-1">
                                                                    {dev.customName ? `${dev.deviceName} · ` : ''}{dev.deviceType} · @{dev.userDisplayName || 'kenan'}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 mt-1 ${
                                                            isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-white/20 bg-white/[0.02]'
                                                        }`}>
                                                            {isSelected && <Check size={11} strokeWidth={3} />}
                                                        </div>
                                                    </div>

                                                    {/* Alt Çizgi: Son Giriş Tarihi */}
                                                    <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[10px] text-slate-500">
                                                        <span>Son Aktiflik:</span>
                                                        <span className="font-medium text-slate-400">
                                                            {dev.lastActive ? new Date(dev.lastActive).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Bugün'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* 2. Bildirim Başlığı */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1">
                                    Bildirim Başlığı
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={notifTitle}
                                    onChange={(e) => setNotifTitle(e.target.value)}
                                    className="w-full bg-[#0a0d14] border border-white/[0.08] text-white rounded-xl px-3.5 py-2.5 text-sm focus:border-indigo-500 outline-none transition"
                                    placeholder="Örn: İnaner Lojistik Duyuru"
                                />
                            </div>

                            {/* 3. Bildirim Mesajı */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1">
                                    Bildirim Mesajı
                                </label>
                                <textarea
                                    required
                                    rows={3}
                                    value={notifBody}
                                    onChange={(e) => setNotifBody(e.target.value)}
                                    className="w-full bg-[#0a0d14] border border-white/[0.08] text-white rounded-xl px-3.5 py-2.5 text-sm focus:border-indigo-500 outline-none resize-none transition"
                                    placeholder="İletmek istediğiniz bildirim metnini buraya yazın..."
                                />
                            </div>

                            {/* Gönder Butonu */}
                            <div className="pt-1">
                                <button
                                    type="submit"
                                    disabled={notifSending || !notifTitle.trim() || !notifBody.trim() || selectedDeviceTokens.length === 0}
                                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/30 disabled:text-slate-400 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
                                >
                                    {notifSending ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                                            Gönderiliyor...
                                        </>
                                    ) : (
                                        <>
                                            <Send size={15} className="mr-2" />
                                            Bildirimi Gönder ({selectedDeviceTokens.length} Cihaz)
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Son Gönderilen Bildirimler Listesi */}
                    <div className="bg-[#07090e] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/[0.08] space-y-4">
                        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                            <div className="flex items-center space-x-2.5">
                                <Clock size={16} className="text-slate-400" />
                                <h4 className="text-sm sm:text-base font-bold text-white">Son Gönderilen Bildirimler</h4>
                            </div>
                            <span className="text-xs text-slate-500">{(companyNotifications || []).length} Kayıt</span>
                        </div>

                        {(!companyNotifications || companyNotifications.length === 0) ? (
                            <div className="py-6 text-center text-slate-500 text-xs">
                                Henüz gönderilmiş bir bildirim bulunmuyor.
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {companyNotifications.slice(0, 10).map((notif) => (
                                    <div key={notif.id} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs font-bold text-white">{notif.title}</span>
                                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-400 border border-white/[0.06]">
                                                    {notif.targetType === 'all' ? 'Tüm Şirket' : notif.deviceCount ? `${notif.deviceCount} Cihaz` : 'Seçili Cihazlar'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{notif.body}</p>
                                        </div>
                                        <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                                            {notif.createdAt ? new Date(notif.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                                        </span>
                                    </div>
                                ))}
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

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { DataContext } from '../context/DataContext';
import { useCompany } from '../context/CompanyContext';
import { useTruck } from '../context/TruckContext';
import { auth } from '../services/firebaseConfig';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { FileText, Save, Key, RefreshCw, CheckCircle, AlertTriangle, ExternalLink, HelpCircle, X, Send, BookOpen, Settings, Smartphone, Download, Paperclip, Clock, Menu, Globe, Coins, TrendingUp, ArrowUpRight, ArrowRight, Sparkles, LogOut, Building2, MapPin, Receipt, Truck, ShieldCheck, ChevronRight, Calculator, Calendar, BookmarkPlus } from 'lucide-react';
import {
    ResponsiveContainer,
    ComposedChart,
    Area,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid
} from 'recharts';

import CustomDatePicker from './CustomDatePicker';
import CustomSelect from './CustomSelect';
import FileUpload from './FileUpload';
import { parseTonnageInTons } from '../utils/tonnageUtils';

const TEVKIFAT_CODES = [
    { code: '624', rate: 20, label: '624 - Yük Taşımacılığı Hizmeti (2/10 - %20)' },
    { code: '620', rate: 50, label: '620 - Servis Taşımacılığı Hizmeti (5/10 - %50)' },
    { code: '612', rate: 90, label: '612 - Temizlik, Bahçe Bakım Hizmetleri (9/10 - %90)' }
];

const EXEMPTION_CODES = [
    { code: '350', label: '350 - KDV Kanunu Geçici Maddeler / Diğerleri' },
    { code: '311', label: '311 - Uluslararası Taşımacılık (KDV Md. 14)' },
    { code: '302', label: '302 - Hizmet İhracatı (KDV Md. 11/1-a)' },
    { code: '301', label: '301 - Mal İhracatı (KDV Md. 11/1-a)' }
];

const TURKISH_MONTHS = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

const formatInvoicePeriod = (startDateStr, endDateStr) => {
    if (!startDateStr || !endDateStr) {
        return { primary: `${startDateStr || ''} – ${endDateStr || ''}`.trim() || '—', sub: '' };
    }

    try {
        const [sy, sm, sd] = startDateStr.split('-').map(Number);
        const [ey, em, ed] = endDateStr.split('-').map(Number);

        if (!sy || !sm || !sd || !ey || !em || !ed) {
            return { primary: `${startDateStr} – ${endDateStr}`, sub: '' };
        }

        const sDay = String(sd).padStart(2, '0');
        const eDay = String(ed).padStart(2, '0');
        const sMonth = TURKISH_MONTHS[sm - 1] || '';
        const eMonth = TURKISH_MONTHS[em - 1] || '';

        // Aynı gün ise
        if (sy === ey && sm === em && sd === ed) {
            return {
                primary: `${sDay} ${sMonth}`,
                sub: `${sy} Dönemi`
            };
        }

        // Aynı ay ve aynı yıl (Örn: 01 – 08 Ağustos | 2026 Dönemi)
        if (sy === ey && sm === em) {
            return {
                primary: `${sDay} – ${eDay} ${sMonth}`,
                sub: `${sy} Dönemi`
            };
        }

        // Farklı aylar ama aynı yıl (Örn: 25 Temmuz – 05 Ağustos | 2026 Dönemi)
        if (sy === ey) {
            return {
                primary: `${sDay} ${sMonth} – ${eDay} ${eMonth}`,
                sub: `${sy} Dönemi`
            };
        }

        // Farklı yıllar (Örn: 28 Aralık 2026 – 04 Ocak 2027 | 2026 – 2027 Dönemi)
        return {
            primary: `${sDay} ${sMonth} ${sy} – ${eDay} ${eMonth} ${ey}`,
            sub: `${sy} – ${ey} Dönemi`
        };
    } catch {
        return { primary: `${startDateStr} – ${endDateStr}`, sub: '' };
    }
};

const EArsiv = ({ onOpenMenu, isMobile }) => {
    const { invoices, addLog, routeHistory, saveRouteHistory, fuelRecords } = useContext(DataContext);
    const { activeCompanyId } = useCompany();
    const { trucks, activeTruckData } = useTruck();

    // Tab state: 'list' | 'settings'
    const [activeSubTab, setActiveSubTab] = useState('list');

    // Settings state
    const [gibUsername, setGibUsername] = useState('');
    const [gibPassword, setGibPassword] = useState('');
    const [gibTestMode, setGibTestMode] = useState(true);
    const [gibClients, setGibClients] = useState({});
    
    // Default preferences state
    const [defaultInvoiceType, setDefaultInvoiceType] = useState('SATIS');
    const [defaultVatRate, setDefaultVatRate] = useState(20);
    const [defaultTevkifatKodu, setDefaultTevkifatKodu] = useState('624');
    const [defaultKdvMuafiyetKodu, setDefaultKdvMuafiyetKodu] = useState('350');
    const [defaultKdvMuafiyetNedeni, setDefaultKdvMuafiyetNedeni] = useState('');
    const [defaultBuyerVkn, setDefaultBuyerVkn] = useState('');
    const [defaultBuyerTitle, setDefaultBuyerTitle] = useState('');
    const [defaultBuyerTaxOffice, setDefaultBuyerTaxOffice] = useState('');
    const [defaultBuyerAddress, setDefaultBuyerAddress] = useState('');
    const [defaultBuyerCity, setDefaultBuyerCity] = useState('');
    const [defaultBuyerDistrict, setDefaultBuyerDistrict] = useState('');
    const [defaultIban, setDefaultIban] = useState('');
    const [defaultIbanName, setDefaultIbanName] = useState('');

    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [settingsStatus, setSettingsStatus] = useState({ type: '', message: '' });
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);

    // Modal state for sending invoice
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [modalStep, setModalStep] = useState(1); // 1: Bilgi Kontrol, 2: Güzergah/Fiyat Girişi
    const [routeLines, setRouteLines] = useState([]); // Çoklu ürün satırları
    
    // Modal Form fields
    const [invoiceType, setInvoiceType] = useState('SATIS');
    const [buyerVkn, setBuyerVkn] = useState('');
    const [buyerTitle, setBuyerTitle] = useState('');
    const [buyerTaxOffice, setBuyerTaxOffice] = useState('');
    const [buyerAddress, setBuyerAddress] = useState('');
    const [buyerCity, setBuyerCity] = useState('');
    const [buyerDistrict, setBuyerDistrict] = useState('');
    const [vatRate, setVatRate] = useState(20);
    const [tevkifatKodu, setTevkifatKodu] = useState('624');
    const [kdvMuafiyetKodu, setKdvMuafiyetKodu] = useState('350');
    const [kdvMuafiyetNedeni, setKdvMuafiyetNedeni] = useState('');
    const [invoiceNote, setInvoiceNote] = useState('');
    const [invoiceDate, setInvoiceDate] = useState('');

    // Syncing state
    const [sendingInvoiceId, setSendingInvoiceId] = useState(null);
    const [syncError, setSyncError] = useState('');
    const [isForceLoggingOut, setIsForceLoggingOut] = useState(false);
    const [forceLogoutStatus, setForceLogoutStatus] = useState(null); // { type: 'success'|'error', message: '' }

    // --- Custom Toast & Confirm Dialog ---
    const [toast, setToast] = useState(null); // { type: 'success'|'error'|'warning'|'info', message }
    const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }

    // SMS Onay ve PDF İndirme State'leri
    const [smsModalOpen, setSmsModalOpen] = useState(false);
    const [smsCode, setSmsCode] = useState('');
    const [smsOid, setSmsOid] = useState('');
    const [smsPhone, setSmsPhone] = useState('');
    const [smsTargetInvoice, setSmsTargetInvoice] = useState(null);
    const [isApprovingSms, setIsApprovingSms] = useState(false);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(null); // invoiceId tutar

    // Belge / Manuel PDF Yükleme State'leri
    const [pdfModalInvoice, setPdfModalInvoice] = useState(null);
    const [modalFiles, setModalFiles] = useState([]);
    const [modalNote, setModalNote] = useState('');
    const [isSavingPdf, setIsSavingPdf] = useState(false);

    // GİB Ayarları Modal Açılır Pencere State'i
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    const showToast = (type, message, duration = 5000) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), duration);
    };

    const showConfirm = (message) => new Promise((resolve) => {
        setConfirmDialog({ message, onConfirm: resolve });
    });

    // Lock body scroll when any overlay is open
    useEffect(() => {
        const isAnyOverlayOpen = isModalOpen || !!confirmDialog || isSettingsModalOpen || smsModalOpen;
        if (isAnyOverlayOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isModalOpen, confirmDialog, isSettingsModalOpen, smsModalOpen]);

    const docId = activeCompanyId === 'inaner_logistics' ? 'info' : `${activeCompanyId}_info`;

    // Listen GİB settings and saved clients from Firestore
    useEffect(() => {
        if (!activeCompanyId) return;
        setIsLoadingSettings(true);
        const docRef = doc(db, 'company_data', docId);
        
        const unsub = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setGibUsername(data.gibUsername || '');
                setGibPassword(data.gibPassword || '');
                setGibTestMode(data.gibTestMode ?? true);
                setGibClients(data.gibClients || {});
                
                // Load default preferences
                setDefaultIban(data.defaultIban || '');
                setDefaultIbanName(data.defaultIbanName || '');
                setDefaultInvoiceType(data.defaultInvoiceType || 'SATIS');
                setDefaultVatRate(data.defaultVatRate ?? 20);
                setDefaultTevkifatKodu(data.defaultTevkifatKodu || '624');
                setDefaultKdvMuafiyetKodu(data.defaultKdvMuafiyetKodu || '350');
                setDefaultKdvMuafiyetNedeni(data.defaultKdvMuafiyetNedeni || '');
                
                // Load default buyer details
                setDefaultBuyerVkn(data.defaultBuyerVkn || '');
                setDefaultBuyerTitle(data.defaultBuyerTitle || '');
                setDefaultBuyerTaxOffice(data.defaultBuyerTaxOffice || '');
                setDefaultBuyerAddress(data.defaultBuyerAddress || '');
                setDefaultBuyerCity(data.defaultBuyerCity || '');
                setDefaultBuyerDistrict(data.defaultBuyerDistrict || '');
            }
            setIsLoadingSettings(false);
        }, (err) => {
            console.error("GİB verileri yüklenemedi:", err);
            setIsLoadingSettings(false);
        });

        return () => unsub();
    }, [activeCompanyId, docId]);

    const [isSavingClient, setIsSavingClient] = useState(false);

    const handleSaveClientToPool = async (customClient = null) => {
        const vkn = (customClient?.vkn || buyerVkn || '').trim().replace(/\s/g, '');
        const title = (customClient?.title || buyerTitle || '').trim();
        const taxOffice = (customClient?.taxOffice || buyerTaxOffice || '').trim();
        const address = (customClient?.address || buyerAddress || '').trim();
        const city = (customClient?.city || buyerCity || '').trim();
        const district = (customClient?.district || buyerDistrict || '').trim();

        if (!vkn || vkn.length < 10) {
            showToast('error', 'Lütfen geçerli bir TCKN (11 hane) veya VKN (10 hane) giriniz.');
            return;
        }
        if (!title) {
            showToast('error', 'Lütfen şirket unvanı veya ad soyad giriniz.');
            return;
        }

        setIsSavingClient(true);
        try {
            const updatedClients = {
                ...(gibClients || {}),
                [vkn]: {
                    vkn,
                    title,
                    taxOffice,
                    address,
                    city,
                    district
                }
            };

            const docRef = doc(db, 'company_data', docId);
            await setDoc(docRef, { gibClients: updatedClients }, { merge: true });
            setGibClients(updatedClients);
            showToast('success', `✅ "${title}" müşteri havuzuna kaydedildi.`);
            if (addLog) addLog(`Müşteri havuzuna kaydedildi: ${title} (${vkn})`, 'success');
        } catch (err) {
            console.error("Müşteri kaydedilirken hata:", err);
            showToast('error', 'Müşteri kaydedilemedi: ' + err.message);
        } finally {
            setIsSavingClient(false);
        }
    };

    const handleDeleteClientFromPool = async (vknToDelete) => {
        if (!vknToDelete) return;
        try {
            const updated = { ...(gibClients || {}) };
            const title = updated[vknToDelete]?.title || vknToDelete;
            delete updated[vknToDelete];

            const docRef = doc(db, 'company_data', docId);
            await setDoc(docRef, { gibClients: updated }, { merge: true });
            setGibClients(updated);
            showToast('success', `"${title}" havuzdan silindi.`);
        } catch (err) {
            console.error("Müşteri silinirken hata:", err);
            showToast('error', 'Müşteri silinemedi: ' + err.message);
        }
    };

    const handleSaveSettings = async (e) => {
        e.preventDefault();
        setSettingsStatus({ type: '', message: '' });
        setIsSavingSettings(true);

        try {
            // Also merge default buyer into gibClients pool if entered
            const updatedClients = { ...(gibClients || {}) };
            if (defaultBuyerVkn.trim() && defaultBuyerTitle.trim()) {
                updatedClients[defaultBuyerVkn.trim()] = {
                    vkn: defaultBuyerVkn.trim(),
                    title: defaultBuyerTitle.trim(),
                    taxOffice: defaultBuyerTaxOffice.trim(),
                    address: defaultBuyerAddress.trim(),
                    city: defaultBuyerCity.trim(),
                    district: defaultBuyerDistrict.trim()
                };
                setGibClients(updatedClients);
            }

            const docRef = doc(db, 'company_data', docId);
            await setDoc(docRef, {
                gibUsername: gibUsername.trim(),
                gibPassword: gibPassword.trim(),
                gibTestMode: gibTestMode,
                gibClients: updatedClients,
                // Save default preferences
                defaultIban: defaultIban.trim(),
                defaultIbanName: defaultIbanName.trim(),
                defaultInvoiceType,
                defaultVatRate: Number(defaultVatRate),
                defaultTevkifatKodu,
                defaultKdvMuafiyetKodu,
                defaultKdvMuafiyetNedeni: defaultKdvMuafiyetNedeni.trim(),
                // Save default buyer details
                defaultBuyerVkn: defaultBuyerVkn.trim(),
                defaultBuyerTitle: defaultBuyerTitle.trim(),
                defaultBuyerTaxOffice: defaultBuyerTaxOffice.trim(),
                defaultBuyerAddress: defaultBuyerAddress.trim(),
                defaultBuyerCity: defaultBuyerCity.trim(),
                defaultBuyerDistrict: defaultBuyerDistrict.trim()
            }, { merge: true });

            addLog('GIB_AYARLARINI_GUNCELLE', `GİB e-Arşiv entegrasyon ayarları ve tercihleri güncellendi.`);
            setSettingsStatus({ type: 'success', message: 'GİB e-Arşiv ayarları ve tercihleri başarıyla kaydedildi.' });
        } catch (err) {
            console.error("GİB ayarları kaydedilemedi:", err);
            setSettingsStatus({ type: 'error', message: 'Ayarlar kaydedilirken bir hata oluştu.' });
        } finally {
            setIsSavingSettings(false);
        }
    };

    // Auto-fill client details when VKN matches history
    const handleVknChange = (value) => {
        const cleaned = value.replace(/\s/g, '');
        setBuyerVkn(cleaned);
        
        if (gibClients && gibClients[cleaned]) {
            const c = gibClients[cleaned];
            setBuyerTitle(c.title || '');
            setBuyerTaxOffice(c.taxOffice || '');
            setBuyerAddress(c.address || '');
            setBuyerCity(c.city || '');
            setBuyerDistrict(c.district || '');
        }
    };

    const handleNextStep = () => {
        if (!buyerVkn || !buyerTitle || !buyerAddress) {
            showToast('error', 'Lütfen Alıcı VKN/TCKN, Unvan ve Adres bilgilerini doldurunuz.');
            return;
        }

        // Group invoice trips by route
        const trips = selectedInvoice?.trips || [];
        const routeSummary = Object.values(
            trips.reduce((acc, trip) => {
                const key = `${trip.from.trim()}|||${trip.to.trim()}`;
                if (!acc[key]) {
                    acc[key] = {
                        from: trip.from,
                        to: trip.to,
                        tonnage: 0
                    };
                }
                acc[key].tonnage += parseTonnageInTons(trip.tonnage);
                return acc;
            }, {})
        ).sort((a, b) => b.tonnage - a.tonnage);

        // Load route history for remembrance (from DataContext, fallback to localStorage)
        let history = routeHistory && Object.keys(routeHistory).length > 0 ? routeHistory : {};
        if (Object.keys(history).length === 0) {
            try {
                const stored = localStorage.getItem(`route_history_${activeCompanyId || 'default'}`);
                if (stored) history = JSON.parse(stored);
            } catch (e) {
                console.error("Güzergah hafızası yüklenirken hata:", e);
            }
        }

        // Map routeSummary to routeLines (Standart KDV Hariç)
        const initialLines = routeSummary.map(r => {
            const key = `${r.from.trim()}|||${r.to.trim()}`;
            const existingLine = routeLines.find(l => l.from === r.from && l.to === r.to);
            const cached = history[key] || {};

            const defaultOldName = `${r.from} ${r.to} NAKLİYESİ`.toUpperCase();
            const defaultNewName = `${r.from} ${r.to} UÇUCU KÜL NAKLİYESİ`.toUpperCase();
            
            let name;
            if (existingLine?.name) {
                name = existingLine.name;
            } else if (cached.name && cached.name.trim() !== defaultOldName.trim()) {
                name = cached.name;
            } else {
                name = defaultNewName;
            }

            const unitPrice = existingLine !== undefined ? existingLine.unitPrice : (cached.unitPrice || 0);
            
            const quantity = Number(r.tonnage.toFixed(2));
            const lineRate = invoiceType === 'ISTISNA' ? 0 : Number(vatRate);
            const activeTevkifat = TEVKIFAT_CODES.find(t => t.code === tevkifatKodu);
            const tRate = activeTevkifat ? activeTevkifat.rate : 20;

            const price = Number((quantity * unitPrice).toFixed(2));
            const vatAmount = Number((price * (lineRate / 100)).toFixed(2));
            const vatAmountOfTax = invoiceType === 'TEVKIFAT' ? Number((vatAmount * (tRate / 100)).toFixed(2)) : 0;
            const totalAmount = Number((price + vatAmount).toFixed(2));

            return {
                from: r.from,
                to: r.to,
                name,
                quantity,
                unitType: 'TNE', // TON
                unitPrice,
                price,
                vatRate: lineRate,
                vatAmount,
                vatAmountOfTax,
                totalAmount
            };
        });

        setRouteLines(initialLines);
        setModalStep(2);
    };

    const handleLineChange = (index, field, value) => {
        const updated = [...routeLines];
        const line = { ...updated[index] };

        if (field === 'name') {
            line.name = value;
        } else {
            if (field === 'unitPrice') {
                line.unitPrice = Number(value) || 0;
            } else if (field === 'quantity') {
                line.quantity = Number(value) || 0;
            }
            
            const quantity = line.quantity;
            const uPrice = line.unitPrice;

            const lineRate = invoiceType === 'ISTISNA' ? 0 : Number(vatRate);
            const activeTevkifat = TEVKIFAT_CODES.find(t => t.code === tevkifatKodu);
            const tRate = activeTevkifat ? activeTevkifat.rate : 20;

            const price = Number((quantity * uPrice).toFixed(2));
            const vatAmount = Number((price * (lineRate / 100)).toFixed(2));
            const vatAmountOfTax = invoiceType === 'TEVKIFAT' ? Number((vatAmount * (tRate / 100)).toFixed(2)) : 0;
            const totalAmount = Number((price + vatAmount).toFixed(2));

            line.price = price;
            line.vatAmount = vatAmount;
            line.vatAmountOfTax = vatAmountOfTax;
            line.totalAmount = totalAmount;
        }

        updated[index] = line;
        setRouteLines(updated);

        // Save route line to central remembrance history immediately (Firebase + localStorage)
        try {
            const key = `${line.from.trim()}|||${line.to.trim()}`;
            const updatedHistory = {
                ...(routeHistory || {}),
                [key]: {
                    name: line.name.toUpperCase(),
                    unitPrice: line.unitPrice
                }
            };
            if (saveRouteHistory) saveRouteHistory(updatedHistory);
        } catch (e) {
            console.error("Güzergah hafızası anlık kaydedilirken hata:", e);
        }
    };

    const handleResetGibStatus = async (inv) => {
        const confirmed = await showConfirm("Bu faturanın GİB taslak durumunu sıfırlamak istediğinize emin misiniz?\n\nTaslağı GİB'den sildiyseniz veya faturayı baştan göndermek istiyorsanız bunu kullanabilirsiniz.");
        if (!confirmed) {
            return;
        }
        try {
            const invoiceRef = doc(db, 'invoices', inv.id);
            await updateDoc(invoiceRef, {
                gibStatus: deleteField(),
                gibUuid: deleteField(),
                gibStatusDate: deleteField(),
                gibTestMode: deleteField()
            });
            showToast('success', 'GİB taslak durumu başarıyla sıfırlandı.');
            if (addLog) addLog("GİB taslak durumu sıfırlandı: " + (inv.docId || inv.id), "info");
        } catch (err) {
            console.error("Fatura durumu sıfırlanırken hata:", err);
            showToast('error', 'Durum sıfırlanırken hata oluştu: ' + err.message);
        }
    };

    const handleMarkAsSigned = async (inv) => {
        const confirmed = await showConfirm(`Bu faturayı (${inv.docId || inv.id}) sistemde "GİB'de İmzalandı" olarak işaretlemek istediğinize emin misiniz?`);
        if (!confirmed) {
            return;
        }
        try {
            const invoiceRef = doc(db, 'invoices', inv.id);
            await updateDoc(invoiceRef, {
                gibStatus: 'Signed',
                gibStatusDate: new Date().toISOString()
            });
            showToast('success', 'Fatura durumu "GİB\'de İmzalandı" olarak güncellendi.');
            if (addLog) addLog("Fatura manuel olarak GİB'de İmzalandı işaretlendi: " + (inv.docId || inv.id), "success");
        } catch (err) {
            console.error("Fatura imzalandı işaretlenirken hata:", err);
            showToast('error', 'Durum güncellenirken hata oluştu: ' + err.message);
        }
    };


    const handleForceGibLogout = async () => {
        if (!gibUsername || !gibPassword) {
            setForceLogoutStatus({ type: 'error', message: 'Lütfen önce yukarıdan GİB Kullanıcı Kodu ve Şifrenizi kaydedin.' });
            return;
        }

        setIsForceLoggingOut(true);
        setForceLogoutStatus(null);
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("Kullanıcı oturumu bulunamadı.");
            const token = await user.getIdToken();

            const res = await fetch('/api/gib-logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "GİB oturumu sonlandırılamadı.");
            }

            setForceLogoutStatus({ type: 'success', message: 'GİB sunucularındaki oturumunuz başarıyla kapatıldı! Artık sisteme giriş yapabilirsiniz.' });
            if (addLog) addLog("GİB Aktif oturumu zorla sonlandırıldı.", "success");
        } catch (err) {
            console.error("GİB Oturum kapatma hatası:", err);
            setForceLogoutStatus({ type: 'error', message: err.message });
            if (addLog) addLog("GİB Oturumu kapatılamadı: " + err.message, "error");
        } finally {
            setIsForceLoggingOut(false);
        }
    };

    // --- GİB SMS ONAY VE PDF İNDİRME İŞLEMLERİ ---
    const handleApproveSmsInit = async (invoice) => {
        setIsApprovingSms(invoice.id);
        setSmsTargetInvoice(invoice);
        
        try {
            const token = await auth.currentUser.getIdToken();
            const res = await fetch('/api/send-gib-sms', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || 'SMS gönderilemedi.');
            }
            
            if (data.success && data.smsResult) {
                setSmsOid(data.smsResult.oid || '');
                setSmsPhone(data.smsResult.phone || data.smsResult.phoneNumber || ''); 
                setSmsCode('');
                setSmsModalOpen(true);
            }
        } catch (err) {
            showToast('error', err.message);
        } finally {
            setIsApprovingSms(false);
        }
    };

    const handleApproveSmsSubmit = async (e) => {
        e.preventDefault();
        if (!smsCode || smsCode.length < 6) {
            showToast('error', 'Lütfen 6 haneli kodu eksiksiz girin.');
            return;
        }

        setIsApprovingSms('submitting');
        
        try {
            const token = await auth.currentUser.getIdToken();
            const res = await fetch('/api/sign-gib-invoice', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    invoiceId: smsTargetInvoice.id,
                    code: smsCode,
                    oid: smsOid
                })
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || 'Fatura imzalanamadı.');
            }
            
            showToast('success', 'Fatura başarıyla imzalandı!');
            setSmsModalOpen(false);
            setSmsCode('');
        } catch (err) {
            showToast('error', err.message);
        } finally {
            setIsApprovingSms(false);
        }
    };

    const handleDownloadPdf = async (invoice) => {
        setIsDownloadingPdf(invoice.id);
        
        try {
            const token = await auth.currentUser.getIdToken();
            const res = await fetch(`/api/download-gib-pdf?invoiceId=${invoice.id}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!res.ok) {
                let errorMsg = 'Fatura indirilemedi. Sunucu hatası oluştu.';
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const data = await res.json();
                    if (data.error) errorMsg = data.error;
                }
                throw new Error(errorMsg);
            }
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
            setTimeout(() => window.URL.revokeObjectURL(url), 10000);
            
            showToast('success', 'Fatura yeni sekmede açıldı. (Yazdırma ekranı otomatik gelecektir)');
        } catch (err) {
            showToast('error', err.message);
        } finally {
            setIsDownloadingPdf(null);
        }
    };

    const handleViewManualPdf = (file) => {
        try {
            if (file.url) {
                window.open(file.url, '_blank');
                return;
            }
            if (file.data) {
                const base64Parts = file.data.split(',');
                const mimeMatch = base64Parts[0].match(/:(.*?);/);
                const mimeType = mimeMatch ? mimeMatch[1] : 'application/pdf';
                const byteString = atob(base64Parts[1]);
                const arrayBuffer = new ArrayBuffer(byteString.length);
                const uint8Array = new Uint8Array(arrayBuffer);
                for (let i = 0; i < byteString.length; i++) {
                    uint8Array[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([arrayBuffer], { type: mimeType });
                const url = window.URL.createObjectURL(blob);
                window.open(url, '_blank');
                setTimeout(() => window.URL.revokeObjectURL(url), 10000);
            } else {
                showToast('error', 'Dosya verisi bulunamadı.');
            }
        } catch (err) {
            console.error("PDF açılırken hata:", err);
            showToast('error', 'Dosya açılırken bir hata oluştu.');
        }
    };

    const handleSaveManualFiles = async () => {
        if (!pdfModalInvoice) return;
        setIsSavingPdf(true);
        try {
            const invoiceRef = doc(db, 'invoices', pdfModalInvoice.id);
            await updateDoc(invoiceRef, {
                files: modalFiles,
                note: modalNote
            });
            showToast('success', 'Fatura belgeleri başarıyla güncellendi.');
            if (addLog) addLog(`E-Arşiv belgesi güncellendi: ${pdfModalInvoice.docId || pdfModalInvoice.id}`, 'info');
            setPdfModalInvoice(null);
        } catch (err) {
            console.error('Belge kaydedilirken hata:', err);
            showToast('error', 'Belgeler kaydedilirken bir hata oluştu: ' + err.message);
        } finally {
            setIsSavingPdf(false);
        }
    };

    const handleOpenSendModal = (invoice) => {
        if (!gibUsername || !gibPassword) {
            showToast('warning', "Lütfen önce 'Bağlantı Ayarları' sekmesinden GİB Kullanıcı Kodu ve Şifrenizi kaydedin.");
            setActiveSubTab('settings');
            return;
        }

        // Pre-fill using saved default preferences
        setInvoiceType(defaultInvoiceType);
        setBuyerVkn(defaultBuyerVkn || '');
        setBuyerTitle(defaultBuyerTitle || '');
        setBuyerTaxOffice(defaultBuyerTaxOffice || '');
        setBuyerAddress(defaultBuyerAddress || '');
        setBuyerCity(defaultBuyerCity || '');
        setBuyerDistrict(defaultBuyerDistrict || '');
        setVatRate(defaultVatRate);
        setTevkifatKodu(defaultTevkifatKodu);
        setKdvMuafiyetKodu(defaultKdvMuafiyetKodu);
        setKdvMuafiyetNedeni(defaultKdvMuafiyetNedeni);
        
        setSelectedInvoice(invoice);
        
        const invTruck = trucksMap.get(invoice.truckId);
        const plateText = invTruck?.plate || '';
        let initialNote = `${plateText ? plateText + ' plakali arac ile ' : ''}${invoice.startDate} - ${invoice.endDate} tarihleri arasinda sunulan nakliye hizmet bedelidir.`;
        
        if (defaultIban || defaultIbanName) {
            let ibanText = '';
            if (defaultIban) ibanText += `İBAN :${defaultIban}`;
            if (defaultIbanName) ibanText += ` ${defaultIbanName}`;
            initialNote += `\n${ibanText.trim()}`;
        }
        
        setInvoiceNote(initialNote);
        
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setInvoiceDate(`${yyyy}-${mm}-${dd}`);
        setSyncError('');
        setModalStep(1);
        setRouteLines([]);
        setIsModalOpen(true);
    };
    const handleSendInvoiceSubmit = async (e) => {
        e.preventDefault();
        if (!selectedInvoice) return;

        setSendingInvoiceId(selectedInvoice.id);
        setIsModalOpen(false);
        setSyncError('');

        const buyerPayload = {
            taxOrIdentityNumber: buyerVkn.trim(),
            buyerTitle: buyerTitle.trim(),
            taxOffice: buyerTaxOffice.trim(),
            fullAddress: buyerAddress.trim(),
            city: buyerCity.trim(),
            district: buyerDistrict.trim()
        };

        const activeTevkifat = TEVKIFAT_CODES.find(t => t.code === tevkifatKodu);
        const tevkifatRate = activeTevkifat ? activeTevkifat.rate : 20;

        try {
            const user = auth.currentUser;
            if (!user) throw new Error("Oturum bulunamadı. Lütfen sayfayı yenileyip tekrar giriş yapın.");
            
            const idToken = await user.getIdToken();

            const response = await fetch('/api/create-gib-draft', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    invoiceId: selectedInvoice.id,
                    invoiceType,
                    buyer: buyerPayload,
                    vatRate: Number(vatRate),
                    isVatIncluded: false,
                    tevkifatKodu: invoiceType === 'TEVKIFAT' ? tevkifatKodu : null,
                    tevkifatRate: invoiceType === 'TEVKIFAT' ? tevkifatRate : 0,
                    kdvMuafiyetKodu: invoiceType === 'ISTISNA' ? kdvMuafiyetKodu : null,
                    kdvMuafiyetNedeni: invoiceType === 'ISTISNA' ? kdvMuafiyetNedeni : null,
                    note: invoiceNote, // User edited note from modal
                    date: invoiceDate, // Added date field
                    products: routeLines.map(r => ({ ...r, name: r.name.toUpperCase() })) // Send our multi-line products!
                })
            });

            // Read as text first to handle empty/error responses defensively
            const textResponse = await response.text();
            let result = null;
            try {
                result = JSON.parse(textResponse);
            } catch (jsonErr) {
                throw new Error(`Sunucu hatası (${response.status}): ${textResponse || 'Geriye boş yanıt döndü.'}`);
            }

            if (!response.ok || !result.success) {
                const errMsg = result.details 
                    ? `${result.error} (Detay: ${result.details})` 
                    : (result.error || "GİB portalına gönderim sırasında bir hata oluştu.");
                throw new Error(errMsg);
            }

            // Save client details to history (Autocomplete pool)
            const updatedClients = {
                ...(gibClients || {}),
                [buyerVkn.trim()]: {
                    vkn: buyerVkn.trim(),
                    title: buyerTitle.trim(),
                    taxOffice: buyerTaxOffice.trim(),
                    address: buyerAddress.trim(),
                    city: buyerCity.trim(),
                    district: buyerDistrict.trim()
                }
            };
            const docRef = doc(db, 'company_data', docId);
            await setDoc(docRef, { gibClients: updatedClients }, { merge: true });

            // Save route lines to remembrance history (Firebase + localStorage)
            try {
                const updatedHistory = { ...(routeHistory || {}) };
                routeLines.forEach(line => {
                    const key = `${line.from.trim()}|||${line.to.trim()}`;
                    updatedHistory[key] = {
                        name: line.name,
                        unitPrice: line.unitPrice
                    };
                });
                if (saveRouteHistory) saveRouteHistory(updatedHistory);
            } catch (e) {
                console.error("Güzergah hafızası kaydedilirken hata:", e);
            }

            addLog('GIB_FATURA_GONDERILDI', `${selectedInvoice.docId || selectedInvoice.id} faturası GİB portalına taslak olarak başarıyla aktarıldı.`);
            showToast('success', '✅ Fatura başarıyla GİB e-Arşiv portalında Taslak olarak oluşturuldu! Portalda imzalamayı unutmayın.');
        } catch (err) {
            console.error("GİB gönderim hatası:", err);
            setSyncError(err.message || "Fatura gönderilirken bir hata oluştu.");
        } finally {
            setSendingInvoiceId(null);
        }
    };
    // Memoized trucks map for O(1) plate lookup
    const trucksMap = useMemo(() => {
        const map = new Map();
        (trucks || []).forEach(t => {
            map.set(t.id, t);
        });
        return map;
    }, [trucks]);

    // Filter local active invoices
    const activeInvoices = useMemo(() => {
        return (invoices || []).filter(inv => !inv.deleted && inv.status === 'Sent');
    }, [invoices]);

    const gibPortalUrl = gibTestMode 
        ? "https://earsivportaltest.efatura.gov.tr/" 
        : "https://earsivportal.efatura.gov.tr/";

    // Calculate Step 2 totals dynamically
    const totals = useMemo(() => {
        const base = routeLines.reduce((sum, line) => sum + (line.price || 0), 0);
        const vat = routeLines.reduce((sum, line) => sum + (line.vatAmount || 0), 0);
        const vatOfTax = routeLines.reduce((sum, line) => sum + (line.vatAmountOfTax || 0), 0);
        const withTaxes = base + vat;
        const payment = withTaxes - vatOfTax;
        return { base, vat, vatOfTax, withTaxes, payment };
    }, [routeLines]);

    // Helper: Fatura resmi tutarı veya güzergah hafızasından tahmini hakediş tutarı
    const getInvoiceEstimate = (inv) => {
        if (inv.grandTotal && Number(inv.grandTotal) > 0) {
            return { isActual: true, amount: Number(inv.grandTotal) };
        }
        const trips = inv.trips || [];
        if (trips.length === 0) return null;
        
        const history = routeHistory || {};
        let totalNet = 0;
        let hasAnyPrice = false;

        const groups = {};
        trips.forEach(t => {
            const fromStr = (t.from || '').trim();
            const toStr = (t.to || '').trim();
            const key = `${fromStr}|||${toStr}`;
            if (!groups[key]) {
                groups[key] = { tonnage: 0, from: fromStr, to: toStr };
            }
            groups[key].tonnage += parseTonnageInTons(t.tonnage);
        });

        Object.entries(groups).forEach(([key, grp]) => {
            const historyItem = history[key] || {};
            const unitPrice = historyItem.unitPrice || 0;
            if (unitPrice > 0) {
                hasAnyPrice = true;
                totalNet += (grp.tonnage * unitPrice);
            }
        });

        if (!hasAnyPrice || totalNet <= 0) return null;

        // Taşımacılık 2/10 Tevkifatlı Net KDV (%16): Matrah * 1.16
        const totalPayable = totalNet * 1.16;
        return { isActual: false, amount: totalPayable };
    };

    // GİB Health State & Real Login Handshake Probe
    const [gibHealth, setGibHealth] = useState({ status: 'checking', latencyMs: 0, lastChecked: null });
    const [isCheckingHealth, setIsCheckingHealth] = useState(false);

    const checkGibHealth = async () => {
        setIsCheckingHealth(true);
        setGibHealth(prev => ({ ...prev, status: 'checking' }));
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const res = await fetch('/api/check-gib-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gibUsername,
                    gibPassword,
                    gibTestMode
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await res.json();
            if (data && data.status) {
                setGibHealth(data);
            } else {
                setGibHealth({ status: 'down', latencyMs: 0, lastChecked: new Date().toISOString() });
            }
        } catch {
            setGibHealth({ status: 'down', latencyMs: 0, lastChecked: new Date().toISOString() });
        } finally {
            setIsCheckingHealth(false);
        }
    };

    useEffect(() => {
        if (!isLoadingSettings) {
            checkGibHealth();
        }
    }, [isLoadingSettings, gibTestMode]);

    // Yıllık Finansal Özet Hesaplamaları (2026)
    const currentYear = 2026;
    const currentYearInvoices = useMemo(() => {
        return activeInvoices.filter(inv => {
            const d = inv.startDate || inv.periodStart || inv.date || '';
            return d.startsWith(String(currentYear));
        });
    }, [activeInvoices, currentYear]);

    const totalYearRevenue = useMemo(() => {
        return currentYearInvoices.reduce((sum, inv) => {
            const est = getInvoiceEstimate(inv);
            return sum + (est?.amount || 0);
        }, 0);
    }, [currentYearInvoices, routeHistory]);

    const totalYearFuel = useMemo(() => {
        return (fuelRecords || [])
            .filter(f => {
                if (f.deleted) return false;
                if (activeTruckData?.id && f.truckId && f.truckId !== activeTruckData.id) return false;
                if (!f.date) return false;
                const d = new Date(f.date);
                return d.getFullYear() === currentYear;
            })
            .reduce((sum, f) => sum + (Number(f.price) || Number(f.totalAmount) || 0), 0);
    }, [fuelRecords, activeTruckData, currentYear]);

    const yearlyProfitMargin = useMemo(() => {
        if (totalYearRevenue <= 0) return 0;
        const net = totalYearRevenue - totalYearFuel;
        return Math.max(0, Math.min(100, (net / totalYearRevenue) * 100));
    }, [totalYearRevenue, totalYearFuel]);

    // Haftalık Finansal Performans Grafiği Verisi (Eskiden yeniye kronolojik sıralı)
    // 2026 Yılı Aylık Konsolide Finansal Performans Grafiği (Ocak - Aralık)
    const chartData = useMemo(() => {
        const monthsShort = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
        const monthsFull = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

        return monthsShort.map((mShort, mIndex) => {
            // 1. Bu aya ait faturaları bul
            const monthInvoices = (activeInvoices || []).filter(inv => {
                const dStr = inv.startDate || inv.periodStart || inv.date || '';
                if (!dStr) return false;
                const d = new Date(dStr);
                return d.getFullYear() === currentYear && d.getMonth() === mIndex;
            });

            // Aylık Toplam Hakediş
            const monthIncome = monthInvoices.reduce((sum, inv) => {
                const est = getInvoiceEstimate(inv);
                return sum + (est?.amount || 0);
            }, 0);

            // Aylık Toplam Sefer & Tonaj
            const monthTripsCount = monthInvoices.reduce((sum, inv) => sum + (inv.trips?.length || 0), 0);
            const monthTotalTons = monthInvoices.reduce((sum, inv) => {
                const t = (inv.trips && inv.trips.length > 0) ? inv.trips.reduce((acc, trip) => acc + parseTonnageInTons(trip.tonnage), 0) : (inv.totalTonnage || 0);
                return sum + t;
            }, 0);

            // 2. Bu aya ait akaryakıt fişlerini bul
            const monthFuel = (fuelRecords || [])
                .filter(f => {
                    if (f.deleted) return false;
                    if (activeTruckData?.id && f.truckId && f.truckId !== activeTruckData.id) return false;
                    if (!f.date) return false;
                    const d = new Date(f.date);
                    return d.getFullYear() === currentYear && d.getMonth() === mIndex;
                })
                .reduce((sum, f) => sum + (Number(f.price) || Number(f.totalAmount) || 0), 0);

            return {
                name: mShort,
                fullName: monthsFull[mIndex],
                income: Math.round(monthIncome),
                fuel: Math.round(monthFuel),
                net: Math.round(monthIncome - monthFuel),
                invoiceCount: monthInvoices.length,
                tripsCount: monthTripsCount,
                totalTons: monthTotalTons.toFixed(1)
            };
        }).filter(m => m.income > 0 || m.fuel > 0);
    }, [activeInvoices, currentYear, routeHistory, fuelRecords, activeTruckData]);

    // FINANCIA / Tasks Overview tarzı lüks siyah cam tooltip (Sadece Turuncu, Siyah, Gri, Beyaz - Ultra Kompakt)
    const CustomChartTooltip = ({ active, payload }) => {
        if (!active || !payload || !payload.length) return null;
        const data = payload[0]?.payload;
        const income = data?.income || 0;
        const fuel = data?.fuel || 0;
        const net = income - fuel;
        const profitMargin = income > 0 ? ((net / income) * 100).toFixed(1) : '0';

        return (
            <div className="bg-[#0a0d16]/95 backdrop-blur-2xl border border-white/[0.12] px-3.5 py-2.5 rounded-xl shadow-[0_15px_35px_rgba(0,0,0,0.9)] text-left pointer-events-none min-w-[148px] animate-in zoom-in-95 duration-150">
                {/* Gelir & Mazot Değerleri */}
                <div className="space-y-1 text-[11px]">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-orange-400 font-semibold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shadow-[0_0_6px_rgba(249,115,22,0.8)]" />
                            Gelir:
                        </span>
                        <span className="font-mono font-bold text-white">
                            {income.toLocaleString('tr-TR')} ₺
                        </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-300 font-medium flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shadow-[0_0_6px_rgba(226,232,240,0.6)]" />
                            Mazot:
                        </span>
                        <span className="font-mono font-semibold text-slate-200">
                            {fuel.toLocaleString('tr-TR')} ₺
                        </span>
                    </div>
                </div>

                {/* Net Kalan & Kâr Payı */}
                {income > 0 && (
                    <div className="pt-1.5 mt-1.5 border-t border-white/[0.08] space-y-0.5 text-[10.5px]">
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400 font-medium">Net Kalan:</span>
                            <span className="font-mono font-bold text-white">
                                {net.toLocaleString('tr-TR')} ₺
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400 font-medium">Kâr Payı:</span>
                            <span className="font-mono font-bold text-orange-400">
                                %{profitMargin}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Pre-compute portals - rendered at document.body level to escape parent CSS transforms
    const toastEl = toast ? (
        <div
            className={`fixed top-6 right-6 z-[99999] flex items-start gap-3 px-5 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl max-w-sm animate-in slide-in-from-top-3 fade-in duration-300 ${
                toast.type === 'success' ? 'bg-emerald-950/95 border-emerald-500/30 text-emerald-300' :
                toast.type === 'error'   ? 'bg-red-950/95 border-red-500/30 text-red-300' :
                toast.type === 'warning' ? 'bg-orange-950/95 border-orange-500/30 text-orange-300' :
                                           'bg-slate-900/95 border-slate-600/30 text-slate-300'
            }`}
            style={{boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)'}}
        >
            <span className="shrink-0 mt-0.5">
                {toast.type === 'success' && <CheckCircle size={18} className="text-emerald-400" />}
                {toast.type === 'error'   && <AlertTriangle size={18} className="text-red-400" />}
                {toast.type === 'warning' && <AlertTriangle size={18} className="text-orange-400" />}
                {toast.type === 'info'    && <HelpCircle size={18} className="text-blue-400" />}
            </span>
            <p className="text-sm font-medium leading-snug flex-1">{toast.message}</p>
            <button onClick={() => setToast(null)} className="shrink-0 ml-1 opacity-50 hover:opacity-100 transition mt-0.5">
                <X size={14} />
            </button>
        </div>
    ) : null;
    const toastPortal = toastEl ? createPortal(toastEl, document.body) : null;

    const confirmEl = confirmDialog ? (
        <div className="fixed inset-0 z-[99998] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="glass-panel w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200 border border-orange-500/20">
                <div className="flex items-start gap-4 mb-6">
                    <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 shrink-0">
                        <AlertTriangle className="text-orange-400" size={20} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">Onay Gerekiyor</p>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">{confirmDialog.message}</p>
                    </div>
                </div>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={() => { confirmDialog.onConfirm(false); setConfirmDialog(null); }}
                        className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                    >İptal</button>
                    <button
                        onClick={() => { confirmDialog.onConfirm(true); setConfirmDialog(null); }}
                        className="px-5 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white transition shadow-lg shadow-orange-500/25"
                    >Onayla</button>
                </div>
            </div>
        </div>
    ) : null;
    const confirmPortal = confirmEl ? createPortal(confirmEl, document.body) : null;

    return (
        <>
            {confirmPortal}
            <div className="flex flex-col h-full w-full gap-3 sm:gap-4 overflow-hidden animate-in fade-in duration-500 pb-2">

                {/* ─── ENTEGRE TEK SATIR HEADER BAR ─── */}
                <div 
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pb-2 border-b border-white/[0.06] shrink-0"
                    style={{
                        paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))'
                    }}
                >
                    {/* Sol: Hamburger + Başlık + TR Plaka */}
                    <div className="flex items-center justify-between sm:justify-start gap-2.5 sm:gap-4 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
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
                                E-Arşiv Fatura
                            </h2>
                            {activeTruckData?.plate && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-mono font-bold text-slate-200 shadow-sm">
                                    <span className="text-[9px] font-black text-orange-400 tracking-tighter">TR</span>
                                    <span className="tracking-wide text-white">{activeTruckData.plate}</span>
                                </span>
                            )}
                        </div>

                        {/* Mobilde Sağ GİB Canlı Durum Kapsülü */}
                        <div className="sm:hidden flex items-center gap-1.5 px-2 py-1 rounded-xl bg-black/40 border border-white/[0.08] text-xs">
                            <span className="relative flex h-2 w-2 shrink-0">
                                {gibHealth.status === 'optimal' && (
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                )}
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                                    gibHealth.status === 'optimal' 
                                        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' 
                                        : gibHealth.status === 'slow'
                                            ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                                            : gibHealth.status === 'down'
                                                ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]'
                                                : 'bg-slate-500'
                                }`} />
                            </span>
                            <span className="font-semibold text-slate-200 text-[11px]">
                                {gibHealth.status === 'optimal' && "GİB Aktif"}
                                {gibHealth.status === 'slow' && "GİB Yoğun"}
                                {gibHealth.status === 'down' && "GİB Kapalı"}
                                {gibHealth.status === 'unconfigured' && "Girişsiz"}
                                {gibHealth.status === 'checking' && "..."}
                            </span>
                            {gibHealth.latencyMs > 0 && (
                                <span className="text-[10px] font-mono text-slate-400 border-l border-white/10 pl-1">
                                    {gibHealth.latencyMs}ms
                                </span>
                            )}
                            <button
                                onClick={checkGibHealth}
                                disabled={isCheckingHealth}
                                title="Bağlantıyı Yenile"
                                className="text-slate-400 hover:text-white transition-colors cursor-pointer ml-0.5 disabled:opacity-50"
                            >
                                <RefreshCw size={10} className={isCheckingHealth ? "animate-spin text-orange-400" : ""} />
                            </button>
                        </div>
                    </div>

                    {/* Sağ: GİB Canlı Durum, GİB Portal & Bağlantı Ayarları */}
                    <div className="flex items-center justify-end gap-2 shrink-0">
                        {/* Masaüstü GİB Health Live Capsule */}
                        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 border border-white/[0.08] text-xs">
                            <span className="relative flex h-2 w-2 shrink-0">
                                {gibHealth.status === 'optimal' && (
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                )}
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                                    gibHealth.status === 'optimal' 
                                        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' 
                                        : gibHealth.status === 'slow'
                                            ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                                            : gibHealth.status === 'down'
                                                ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]'
                                                : 'bg-slate-500'
                                }`} />
                            </span>
                            <span className="font-semibold text-slate-200">
                                {gibHealth.status === 'optimal' && "GİB Aktif"}
                                {gibHealth.status === 'slow' && "GİB Yoğun"}
                                {gibHealth.status === 'down' && "GİB Kapalı"}
                                {gibHealth.status === 'unconfigured' && "Giriş Yapılmadı"}
                                {gibHealth.status === 'checking' && "Kontrol..."}
                            </span>
                            {gibHealth.latencyMs > 0 && (
                                <span className="text-[10px] font-mono text-slate-400 border-l border-white/10 pl-1.5">
                                    {gibHealth.latencyMs}ms
                                </span>
                            )}
                            <button
                                onClick={checkGibHealth}
                                disabled={isCheckingHealth}
                                title="Bağlantıyı Yenile"
                                className="text-slate-400 hover:text-white transition-colors cursor-pointer ml-0.5 disabled:opacity-50"
                            >
                                <RefreshCw size={11} className={isCheckingHealth ? "animate-spin text-orange-400" : ""} />
                            </button>
                        </div>

                        {/* GİB Portal Link Button */}
                        <a 
                            href={gibPortalUrl}
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 text-xs font-semibold text-slate-300 hover:text-white transition-all shadow-sm cursor-pointer"
                            title="GİB e-Arşiv Portalına Git"
                        >
                            <span>GİB Portal</span>
                            <ExternalLink size={12} className="text-slate-400" />
                        </a>

                        {/* Bağlantı Ayarları Primary Button */}
                        <button
                            type="button"
                            onClick={() => setIsSettingsModalOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-orange-500/20 active:scale-95 cursor-pointer"
                            title="GİB Giriş ve Fatura Ayarları"
                        >
                            <Settings size={13} />
                            <span>Bağlantı Ayarları</span>
                        </button>
                    </div>

                </div>

                {/* Error Message */}
                {syncError && (
                    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-2xl text-sm shrink-0">
                        <AlertTriangle size={18} className="shrink-0" />
                        <div>
                            <span className="font-semibold">Aktarım Hatası:</span> {syncError}
                        </div>
                    </div>
                )}

                {/* ANA İÇERİK: TAM GENİŞLİKTE GRAFİK VE FATURA TABLOSU */}
                <div className="flex-1 w-full min-w-0 flex flex-col gap-3 h-full overflow-hidden">
                    {/* 1. Üst Grafik Kartı (FINANCIA / Tasks Overview - Pürüzsüz Grid Row Kapanışı) */}
                    <div 
                        className="grid shrink-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                        style={{
                            gridTemplateRows: (isModalOpen && selectedInvoice) || isSettingsModalOpen ? '0fr' : '1fr',
                            opacity: (isModalOpen && selectedInvoice) || isSettingsModalOpen ? 0 : 1,
                            pointerEvents: (isModalOpen && selectedInvoice) || isSettingsModalOpen ? 'none' : 'auto',
                        }}
                    >
                        <div className="overflow-hidden min-h-0">
                            <div 
                                className="h-[180px] sm:h-[210px] md:h-[240px] relative overflow-hidden rounded-3xl border border-[#1e2230] shadow-2xl shadow-black/90 flex flex-col justify-between p-3.5 sm:p-5"
                                style={{ 
                                    backgroundColor: '#080a12',
                                    backgroundImage: 'radial-gradient(ellipse 65% 55% at 0% 100%, rgba(249,115,22,0.28) 0%, transparent 70%), radial-gradient(ellipse 65% 55% at 100% 100%, rgba(249,115,22,0.28) 0%, transparent 70%)'
                                }}
                            >
                                {/* Sol En Alttan Yükselen Işık Hüzmesi (Bottom-Left Corner Flare) */}
                                <div className="absolute -bottom-20 -left-16 w-72 h-72 bg-gradient-to-tr from-orange-500/35 via-orange-500/15 to-transparent blur-[55px] pointer-events-none rounded-full" />
                                
                                {/* Sağ En Alttan Yükselen Işık Hüzmesi (Bottom-Right Corner Flare) */}
                                <div className="absolute -bottom-20 -right-16 w-72 h-72 bg-gradient-to-tl from-orange-500/35 via-orange-500/15 to-transparent blur-[55px] pointer-events-none rounded-full" />

                                {/* Alt Eksen Zemin Yumuşak Parıltı Şeridi */}
                                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-orange-500/10 to-transparent pointer-events-none" />

                                {/* Başlık (Minimalist & Temiz) */}
                                <div className="flex items-center justify-between mb-1.5 sm:mb-2 shrink-0 relative z-10">
                                    <h3 className="text-sm sm:text-base md:text-lg font-bold text-white tracking-tight">Finansal Performans</h3>
                                </div>

                                {/* Grafik Gövdesi */}
                                <div className="w-full flex-1 min-h-0 relative select-none z-10">
                                    {chartData.length === 0 ? (
                                        <div className="h-full flex items-center justify-center text-xs text-slate-500">
                                            Henüz dönem hakediş verisi bulunamadı.
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={chartData} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
                                                <defs>
                                                    {/* Dikey İğne / Barkod Dokusu (Fotoğraftaki Dikey Eşitleyici Çizgileri) */}
                                                    <pattern id="verticalNeedlesOrange" width="4" height="1000" patternUnits="userSpaceOnUse">
                                                        <line x1="2" y1="0" x2="2" y2="1000" stroke="#f97316" strokeWidth="1" strokeOpacity="0.40" />
                                                    </pattern>
                                                    
                                                    <pattern id="verticalNeedlesFuel" width="4" height="1000" patternUnits="userSpaceOnUse">
                                                        <line x1="2" y1="0" x2="2" y2="1000" stroke="#cbd5e1" strokeWidth="1" strokeOpacity="0.25" />
                                                    </pattern>

                                                    {/* Yumuşak Cam Gradyanı */}
                                                    <linearGradient id="financiaIncomeGlow" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#f97316" stopOpacity="0.40" />
                                                        <stop offset="65%" stopColor="#f97316" stopOpacity="0.10" />
                                                        <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
                                                    </linearGradient>
                                                </defs>

                                                {/* İnce Şeffaf Yatay Kılavuz Çizgileri */}
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.04)" vertical={false} />
                                                
                                                <XAxis 
                                                    dataKey="name" 
                                                    stroke="#94a3b8" 
                                                    fontSize={11} 
                                                    tickLine={false} 
                                                    axisLine={false} 
                                                    dy={6}
                                                    padding={{ left: 30, right: 30 }}
                                                />
                                                <YAxis 
                                                    stroke="#64748b" 
                                                    fontSize={10} 
                                                    tickLine={false} 
                                                    axisLine={false} 
                                                    tickFormatter={(v) => v === 0 ? '0' : `${Math.round(v / 1000)}K`}
                                                    domain={[0, 'auto']}
                                                    dx={-4}
                                                />
                                                <Tooltip 
                                                    content={<CustomChartTooltip />} 
                                                    cursor={{ stroke: 'rgba(249, 115, 22, 0.7)', strokeWidth: 1.5, strokeDasharray: '3 3' }} 
                                                    isAnimationActive={false}
                                                    wrapperStyle={{ outline: 'none', pointerEvents: 'none' }}
                                                />
                                                
                                                {/* 1. Dalga: Ana Hakediş & Dikey İğne Dokulu Neon Turuncu Çizgi (Fotoğraftaki Kalın Dalga) */}
                                                <Area 
                                                    type="monotone" 
                                                    dataKey="income" 
                                                    stroke="#fb923c" 
                                                    strokeWidth={3.2} 
                                                    fill="url(#verticalNeedlesOrange)" 
                                                    dot={false} 
                                                    activeDot={{ r: 5, fill: '#fb923c', stroke: '#07090e', strokeWidth: 2 }} 
                                                    isAnimationActive={false}
                                                />

                                                {/* 2. Dalga: Mazot Gideri Düz ve Parlak Çizgi */}
                                                <Line 
                                                    type="monotone" 
                                                    dataKey="fuel" 
                                                    stroke="#e2e8f0" 
                                                    strokeWidth={2.2} 
                                                    dot={false} 
                                                    activeDot={{ r: 4, fill: '#e2e8f0', stroke: '#07090e', strokeWidth: 2 }} 
                                                    isAnimationActive={false}
                                                />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. Alt Tablo Kartı (İçeriden Kayan Fatura Listesi VEYA In-Card GİB Düzenleyici) */}
                    <div className="bg-[#07090e] border border-white/[0.06] rounded-2xl shadow-xl flex-1 flex flex-col overflow-hidden p-0 min-h-0 relative">
                        {isModalOpen && selectedInvoice ? (
                            /* IN-PLACE GİB WORKSPACE EDITÖRÜ */
                            <div 
                                key="gib-in-place-workspace"
                                className="flex-1 flex flex-col h-full min-h-0 bg-[#07090e] animate-in fade-in zoom-in-[0.99] duration-300"
                            >
                                {/* In-Card Header */}
                                <div className="h-14 shrink-0 bg-[#07090e] border-b border-white/[0.06] px-4 sm:px-6 flex items-center justify-between gap-4 z-10">
                                    {/* Left: Clean Title & Period */}
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs sm:text-sm font-bold text-white tracking-tight">
                                            E-Arşiv Fatura Düzenleyici
                                        </span>
                                        <span className="text-xs text-slate-400 hidden sm:inline font-mono">
                                            • {formatInvoicePeriod(selectedInvoice.startDate, selectedInvoice.endDate).primary}
                                        </span>
                                    </div>

                                    {/* Right: Close Button */}
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer border border-white/[0.06]"
                                        title="Kapat"
                                    >
                                        <X size={15} />
                                    </button>
                                </div>

                                {/* Step 1: Form View (Seamless Bento Grid Layout) */}
                                {modalStep === 1 && (
                                    <form 
                                        onSubmit={(e) => { e.preventDefault(); handleNextStep(); }} 
                                        className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden animate-in fade-in duration-200"
                                    >
                                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6 flex flex-col justify-start">
                                            <div className="max-w-6xl mx-auto w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
                                                
                                                {/* Sol Kolon (5/12): Fatura Parametreleri + Not & Banka */}
                                                <div className="lg:col-span-5 flex flex-col justify-between bg-white/[0.02] border border-white/[0.05] rounded-3xl p-4 sm:p-5 gap-3.5">
                                                    {/* Başlık (Sağ taraf ile tam eşit h-10 ve taban çizgisi) */}
                                                    <div className="h-10 flex items-center justify-between border-b border-white/[0.05] pb-2">
                                                        <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                                                            Fatura Parametreleri
                                                        </h4>
                                                    </div>

                                                    {/* Satır 1: Tarih, Tip, KDV */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                        <div>
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Fatura Tarihi</label>
                                                            <CustomDatePicker
                                                                value={invoiceDate}
                                                                onChange={setInvoiceDate}
                                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl text-xs focus:border-amber-500 outline-none uppercase font-semibold"
                                                                placeholder="Tarih Seçin"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Fatura Tipi</label>
                                                            <CustomSelect
                                                                value={invoiceType}
                                                                onChange={setInvoiceType}
                                                                buttonClassName="h-8 py-0"
                                                                options={[
                                                                    { value: 'SATIS', label: 'SATIŞ' },
                                                                    { value: 'TEVKIFAT', label: 'TEVKİFAT' },
                                                                    { value: 'ISTISNA', label: 'İSTİSNA' }
                                                                ]}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">KDV Oranı</label>
                                                            <CustomSelect
                                                                value={vatRate}
                                                                onChange={(v) => setVatRate(Number(v))}
                                                                buttonClassName="h-8 py-0"
                                                                options={[
                                                                    { value: 20, label: '%20' },
                                                                    { value: 10, label: '%10' },
                                                                    { value: 0, label: '%0' }
                                                                ]}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Satır 2: Tevkifat / İstisna Kodu */}
                                                    <div className="h-[54px] flex flex-col justify-end">
                                                        {invoiceType === 'TEVKIFAT' ? (
                                                            <div>
                                                                <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Tevkifat Kodu</label>
                                                                <CustomSelect
                                                                    value={tevkifatKodu}
                                                                    onChange={setTevkifatKodu}
                                                                    buttonClassName="h-8 py-0"
                                                                    options={TEVKIFAT_CODES.map(t => ({
                                                                        value: t.code,
                                                                        label: t.label
                                                                    }))}
                                                                    searchable
                                                                />
                                                            </div>
                                                        ) : invoiceType === 'ISTISNA' ? (
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                <div>
                                                                    <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">İstisna Kodu</label>
                                                                    <CustomSelect
                                                                        value={kdvMuafiyetKodu}
                                                                        onChange={setKdvMuafiyetKodu}
                                                                        buttonClassName="h-8 py-0"
                                                                        options={EXEMPTION_CODES.map(e => ({
                                                                            value: e.code,
                                                                            label: e.label
                                                                        }))}
                                                                        searchable
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">İstisna Açıklaması</label>
                                                                    <input
                                                                        type="text"
                                                                        required
                                                                        value={kdvMuafiyetNedeni}
                                                                        onChange={(e) => setKdvMuafiyetNedeni(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                                        className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-2.5 text-xs focus:border-amber-500 outline-none"
                                                                        placeholder="Örn: 306/1-a Kapsamında..."
                                                                    />
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="h-8 rounded-xl border border-dashed border-white/[0.05] bg-white/[0.01] px-3 flex items-center text-[11px] text-slate-500 italic">
                                                                Standart Satış Faturası
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Satır 3: Fatura Notu */}
                                                    <div className="flex-1 flex flex-col justify-between pt-3 border-t border-white/[0.05]">
                                                        <div className="h-5 flex items-center mb-1.5">
                                                            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                                                                Fatura Notu & Banka / İBAN
                                                            </h4>
                                                        </div>
                                                        <textarea
                                                            value={invoiceNote}
                                                            onChange={(e) => setInvoiceNote(e.target.value)}
                                                            className="w-full flex-1 min-h-[90px] bg-[#0d1117] border border-white/[0.08] text-slate-200 rounded-2xl p-3.5 text-xs font-mono focus:border-amber-500 outline-none resize-none transition"
                                                            placeholder="Fatura üzerinde yer alacak ek notlar..."
                                                        />
                                                    </div>
                                                </div>

                                                {/* Sağ Kolon (7/12): Alıcı Şirket Bilgileri */}
                                                <div className="lg:col-span-7 flex flex-col justify-between bg-white/[0.02] border border-white/[0.05] rounded-3xl p-4 sm:p-5 gap-3.5">
                                                    {/* Başlık (Sol taraf ile tam eşit h-10 ve taban çizgisi) */}
                                                    <div className="h-10 flex items-center justify-between border-b border-white/[0.05] pb-2 gap-2">
                                                        <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider shrink-0">
                                                            Alıcı Şirket Bilgileri
                                                        </h4>
                                                        <div className="flex items-center gap-2">
                                                            {/* Havuza Kaydet Butonu (VKN ve Ünvan girilmişse ve havuzdakinden farklıysa veya yeni ise) */}
                                                            {buyerVkn && buyerTitle && (!gibClients[buyerVkn] || gibClients[buyerVkn].title !== buyerTitle || gibClients[buyerVkn].address !== buyerAddress || gibClients[buyerVkn].taxOffice !== buyerTaxOffice) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSaveClientToPool()}
                                                                    disabled={isSavingClient}
                                                                    title="Bu Müşteri Bilgilerini Müşteri Havuzuna Kaydet"
                                                                    className="h-7 px-2.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 border border-orange-500/30 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50"
                                                                >
                                                                    {isSavingClient ? <RefreshCw size={11} className="animate-spin" /> : <BookmarkPlus size={12} />}
                                                                    <span>{gibClients[buyerVkn] ? 'Hafızayı Güncelle' : 'Havuza Kaydet'}</span>
                                                                </button>
                                                            )}

                                                            {Object.keys(gibClients || {}).length > 0 && (
                                                                <CustomSelect
                                                                    value={gibClients[buyerVkn] ? buyerVkn : ''}
                                                                    placeholder="Kayıtlı Müşteri Seç"
                                                                    onChange={(v) => { if (v) handleVknChange(v); }}
                                                                    options={Object.values(gibClients).map(c => ({
                                                                        value: c.vkn,
                                                                        label: c.title,
                                                                        sublabel: `VKN: ${c.vkn} • ${c.taxOffice || c.city || ''}`
                                                                    }))}
                                                                    searchable
                                                                    buttonClassName="h-7 py-0 text-[11px]"
                                                                    className="w-44 sm:w-52"
                                                                />
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Satır 1: VKN & Ünvan */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                                                        <div className="sm:col-span-4">
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4 flex items-center justify-between">
                                                                <span>TCKN / VKN *</span>
                                                                {buyerVkn && gibClients[buyerVkn] && <span className="text-[10px] text-slate-500 font-normal">Kayıtlı</span>}
                                                            </label>
                                                            <input
                                                                type="text"
                                                                required
                                                                maxLength={11}
                                                                value={buyerVkn}
                                                                onChange={(e) => handleVknChange(e.target.value)}
                                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs sm:text-sm font-mono font-bold focus:border-amber-500 outline-none"
                                                                placeholder="10 VKN / 11 TCKN"
                                                            />
                                                        </div>
                                                        <div className="sm:col-span-8">
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Ünvan / Ad Soyad *</label>
                                                            <input
                                                                type="text"
                                                                required
                                                                value={buyerTitle}
                                                                onChange={(e) => setBuyerTitle(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs sm:text-sm font-semibold focus:border-amber-500 outline-none"
                                                                placeholder="Şirket Resmi Unvanı"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Satır 2: Vergi Dairesi, İlçe, Şehir */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 h-[54px] flex flex-col justify-end">
                                                        <div className="sm:col-span-6">
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Vergi Dairesi</label>
                                                            <input
                                                                type="text"
                                                                value={buyerTaxOffice}
                                                                onChange={(e) => setBuyerTaxOffice(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs focus:border-amber-500 outline-none"
                                                                placeholder="Vergi Dairesi Müdürlüğü"
                                                            />
                                                        </div>
                                                        <div className="sm:col-span-3">
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">İlçe</label>
                                                            <input
                                                                type="text"
                                                                value={buyerDistrict}
                                                                onChange={(e) => setBuyerDistrict(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-2.5 text-xs focus:border-amber-500 outline-none"
                                                                placeholder="İlçe"
                                                            />
                                                        </div>
                                                        <div className="sm:col-span-3">
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Şehir (İl)</label>
                                                            <input
                                                                type="text"
                                                                value={buyerCity}
                                                                onChange={(e) => setBuyerCity(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-2.5 text-xs focus:border-amber-500 outline-none"
                                                                placeholder="Şehir"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Satır 3: Açık Adres */}
                                                    <div className="flex-1 flex flex-col justify-between pt-3 border-t border-white/[0.05]">
                                                        <div className="h-5 flex items-center mb-1.5">
                                                            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">Açık Adres *</label>
                                                        </div>
                                                        <textarea
                                                            value={buyerAddress}
                                                            onChange={(e) => setBuyerAddress(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                            rows={2}
                                                            required
                                                            className="w-full flex-1 min-h-[90px] bg-[#0d1117] border border-white/[0.08] text-white rounded-2xl p-3.5 text-xs focus:border-amber-500 outline-none resize-none transition"
                                                            placeholder="Açık adres..."
                                                        />
                                                    </div>
                                                </div>

                                            </div>
                                        </div>

                                        {/* Step 1 Footer */}
                                        <div className="h-14 shrink-0 bg-[#07090e] border-t border-white/[0.06] px-4 sm:px-6 flex items-center justify-between gap-4">
                                            <button
                                                type="button"
                                                onClick={() => setIsModalOpen(false)}
                                                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition cursor-pointer"
                                            >
                                                Vazgeç
                                            </button>
                                            <button
                                                type="submit"
                                                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 shadow-md shadow-orange-500/20 active:scale-95 transition flex items-center gap-2 cursor-pointer"
                                            >
                                                <span>Güzergah ve Fiyatlara Geç</span>
                                                <ChevronRight size={14} />
                                            </button>
                                        </div>
                                    </form>
                                )}

                                {/* Step 2: Table & Calculation View */}
                                {modalStep === 2 && (
                                    <form 
                                        onSubmit={handleSendInvoiceSubmit} 
                                        className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden animate-in fade-in duration-200"
                                    >
                                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-4 sm:p-6">
                                            <div className="flex-1 min-h-0 flex flex-col bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden shadow-sm">
                                                {/* Table Header */}
                                                <div className="bg-[#07090e] border-b border-white/[0.06] px-4 py-2.5 shrink-0 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                                    <span>Güzergah Kalemleri ({routeLines.length} Kalem)</span>
                                                </div>

                                                {/* Table Body */}
                                                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                                    <table className="w-full text-left text-xs border-collapse">
                                                        <thead className="sticky top-0 z-10 bg-[#07090e] border-b border-white/[0.06] text-slate-400 uppercase text-[10px] font-bold">
                                                            <tr>
                                                                <th className="p-3 pl-4">Hizmet Adı / Açıklama</th>
                                                                <th className="p-3 text-right w-28 whitespace-nowrap">Miktar (Ton)</th>
                                                                <th className="p-3 text-right w-32 whitespace-nowrap">Birim Fiyat (₺)</th>
                                                                <th className="p-3 text-right w-36 pr-4 whitespace-nowrap">Tutar (Matrah)</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-white/[0.04]">
                                                            {routeLines.map((line, idx) => (
                                                                <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                                                    <td className="p-2 pl-4">
                                                                        <input
                                                                            type="text"
                                                                            required
                                                                            value={line.name}
                                                                            onChange={(e) => handleLineChange(idx, 'name', e.target.value)}
                                                                            className="w-full bg-[#0d1117] border border-white/[0.06] text-white rounded-xl px-3 py-1.5 text-xs font-medium focus:border-amber-500 outline-none uppercase transition"
                                                                        />
                                                                    </td>
                                                                    <td className="p-2 text-right w-28 whitespace-nowrap">
                                                                        <input
                                                                            type="number"
                                                                            step="0.001"
                                                                            required
                                                                            value={line.quantity || ''}
                                                                            onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                                                                            className="w-24 bg-[#0d1117] border border-white/[0.06] text-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-right outline-none"
                                                                            placeholder="0.00"
                                                                        />
                                                                    </td>
                                                                    <td className="p-2 text-right w-32 whitespace-nowrap">
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            required
                                                                            value={line.unitPrice || ''}
                                                                            onChange={(e) => handleLineChange(idx, 'unitPrice', e.target.value)}
                                                                            className="w-28 bg-[#0d1117] border border-orange-500/30 text-orange-400 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-right focus:border-orange-400 outline-none"
                                                                            placeholder="0.00"
                                                                        />
                                                                    </td>
                                                                    <td className="p-2 pr-4 text-right text-orange-400 font-bold font-mono whitespace-nowrap w-36 text-xs sm:text-sm">
                                                                        {line.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Step 2 Footer */}
                                        <div className="shrink-0 bg-[#07090e] border-t border-white/[0.06] px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
                                            {/* Left: Matrah / KDV breakdown */}
                                            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                                                <div>
                                                    <span className="text-slate-400 font-medium">Matrah: </span>
                                                    <span className="font-bold text-white font-mono">{totals.base.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 font-medium">KDV (%{vatRate}): </span>
                                                    <span className="font-bold text-white font-mono">+{totals.vat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                                </div>
                                                {invoiceType === 'TEVKIFAT' && (
                                                    <div>
                                                        <span className="text-slate-400 font-medium">Tevkifat: </span>
                                                        <span className="font-bold text-amber-400 font-mono">-{totals.vatOfTax.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                                    </div>
                                                )}
                                                <div>
                                                    <span className="text-slate-500 font-medium">Genel Toplam: </span>
                                                    <span className="font-semibold text-slate-400 font-mono">{totals.withTaxes.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                                </div>
                                            </div>

                                            {/* Right: Net & Actions */}
                                            <div className="flex items-center gap-3 shrink-0">
                                                <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] px-3 py-1.5 rounded-xl">
                                                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Ödenecek Net:</span>
                                                    <span className="text-sm sm:text-base font-mono font-bold text-orange-400">{totals.payment.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => setModalStep(1)}
                                                    className="px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition cursor-pointer"
                                                >
                                                    Geri Dön
                                                </button>

                                                <button
                                                    type="submit"
                                                    disabled={sendingInvoiceId === selectedInvoice.id}
                                                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 shadow-md shadow-orange-500/20 active:scale-95 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                                                >
                                                    {sendingInvoiceId === selectedInvoice.id ? (
                                                        <>
                                                            <RefreshCw size={13} className="animate-spin" />
                                                            GİB Portalına Aktarılıyor...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Send size={13} /> GİB Taslak Oluştur
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                )}
                            </div>
                        ) : isSettingsModalOpen ? (
                            /* IN-PLACE GİB AYARLARI BENTO STUDIO */
                            <div 
                                key="gib-in-place-settings"
                                className="flex-1 flex flex-col h-full min-h-0 bg-[#07090e] animate-in fade-in zoom-in-[0.99] duration-300"
                            >
                                {/* In-Card Header */}
                                <div className="h-14 shrink-0 bg-[#07090e] border-b border-white/[0.06] px-4 sm:px-6 flex items-center justify-between gap-4 z-10">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                                            <Key size={15} />
                                        </div>
                                        <div>
                                            <span className="text-xs sm:text-sm font-bold text-white tracking-tight">
                                                GİB Portal & Fatura Bağlantı Ayarları
                                            </span>
                                            <span className="text-xs text-slate-500 hidden sm:inline ml-2">
                                                • Tercihler & Güvenlik
                                            </span>
                                        </div>
                                    </div>

                                    {/* Right: Close Button */}
                                    <button
                                        type="button"
                                        onClick={() => setIsSettingsModalOpen(false)}
                                        className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer border border-white/[0.06]"
                                        title="Kapat"
                                    >
                                        <X size={15} />
                                    </button>
                                </div>

                                {/* In-Card Settings Form Body (Zero-Scroll 2-Column Bento Grid) */}
                                <form onSubmit={handleSaveSettings} className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
                                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6 flex flex-col justify-start">
                                        <div className="max-w-6xl mx-auto w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
                                            
                                            {/* Sol Kolon (5/12): Portal Giriş, Test Modu, İBAN, Acil Sıfırlama */}
                                            <div className="lg:col-span-5 flex flex-col justify-between bg-white/[0.02] border border-white/[0.05] rounded-3xl p-4 sm:p-5 gap-3.5">
                                                {/* Başlık */}
                                                <div className="h-10 flex items-center justify-between border-b border-white/[0.05] pb-2">
                                                    <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                                                        Portal Giriş & Sistem
                                                    </h4>
                                                    <span className="text-[10px] text-slate-500">SSL 256-Bit Şifreli</span>
                                                </div>

                                                {/* Kompakt Bilgilendirme Notu */}
                                                <div className="p-2.5 rounded-xl bg-orange-500/5 border border-orange-500/15 text-slate-300 text-[11px] flex items-start gap-2">
                                                    <HelpCircle size={14} className="text-orange-400 shrink-0 mt-0.5" />
                                                    <p className="text-slate-400 text-[10px] leading-tight">
                                                        İnteraktif Vergi Dairesi (İVD) giriş bilgilerinizdir. Yalnızca fatura taslağı oluşturmada kullanılır.
                                                    </p>
                                                </div>

                                                {/* Giriş Bilgileri (Kullanıcı Kodu + Şifre) */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Kullanıcı Kodu (VKN / TCKN)</label>
                                                        <input
                                                            type="text"
                                                            required
                                                            value={gibUsername}
                                                            onChange={(e) => setGibUsername(e.target.value)}
                                                            className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-mono font-bold focus:border-amber-500 outline-none"
                                                            placeholder="VKN / TCKN"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">GİB Portal Şifresi</label>
                                                        <input
                                                            type="password"
                                                            required
                                                            value={gibPassword}
                                                            onChange={(e) => setGibPassword(e.target.value)}
                                                            className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs focus:border-amber-500 outline-none"
                                                            placeholder="••••••••"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Test Modu Switch */}
                                                <div className="flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                                                    <div className="space-y-0.5">
                                                        <div className="text-xs font-bold text-slate-200">GİB Test Portalı Modu</div>
                                                        <div className="text-[10px] text-slate-500">Resmi fatura kesmeden önce test portalında deneme yapın.</div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setGibTestMode(!gibTestMode)}
                                                        className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 outline-none flex items-center cursor-pointer ${
                                                            gibTestMode ? 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]' : 'bg-slate-800 border border-white/10'
                                                        }`}
                                                    >
                                                        <div
                                                            className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                                                                gibTestMode ? 'translate-x-4' : 'translate-x-0'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>

                                                {/* İBAN Bilgileri */}
                                                <div className="pt-3 border-t border-white/[0.05]">
                                                    <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
                                                        Fatura Notuna Eklenecek İBAN & İsim
                                                    </h4>
                                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                                                        <div className="sm:col-span-7">
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Banka İBAN</label>
                                                            <input
                                                                type="text"
                                                                value={defaultIban}
                                                                onChange={(e) => setDefaultIban(e.target.value)}
                                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs font-mono focus:border-amber-500 outline-none"
                                                                placeholder="TR86 0004 ..."
                                                            />
                                                        </div>
                                                        <div className="sm:col-span-5">
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">İBAN Sahibi</label>
                                                            <input
                                                                type="text"
                                                                value={defaultIbanName}
                                                                onChange={(e) => setDefaultIbanName(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs focus:border-amber-500 outline-none"
                                                                placeholder="Ad Soyad / Unvan"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Acil Oturum Sıfırlama */}
                                                <div className="pt-2.5 border-t border-white/[0.05] flex items-center justify-between gap-3">
                                                    <div className="text-[10px] text-slate-500 leading-tight">
                                                        "Birden fazla giriş yapamazsınız" uyarısı için oturumu sonlandırın.
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleForceGibLogout}
                                                        disabled={isForceLoggingOut}
                                                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                                                    >
                                                        {isForceLoggingOut ? (
                                                            <RefreshCw size={11} className="animate-spin" />
                                                        ) : (
                                                            <LogOut size={11} />
                                                        )}
                                                        <span>Oturumu Sıfırla</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Sağ Kolon (7/12): Varsayılan Fatura & Alıcı Bilgileri */}
                                            <div className="lg:col-span-7 flex flex-col justify-between bg-white/[0.02] border border-white/[0.05] rounded-3xl p-4 sm:p-5 gap-3.5">
                                                {/* Başlık */}
                                                <div className="h-10 flex items-center justify-between border-b border-white/[0.05] pb-2">
                                                    <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                                                        Varsayılan Fatura & Alıcı Tercihleri
                                                    </h4>
                                                </div>

                                                {/* Varsayılan Fatura Parametreleri */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Varsayılan Fatura Tipi</label>
                                                        <CustomSelect
                                                            value={defaultInvoiceType}
                                                            onChange={setDefaultInvoiceType}
                                                            buttonClassName="h-8 py-0"
                                                            options={[
                                                                { value: 'SATIS', label: 'SATIŞ FATURASI' },
                                                                { value: 'TEVKIFAT', label: 'TEVKİFATLI FATURA' },
                                                                { value: 'ISTISNA', label: 'İSTİSNA (KDV MUAFİYETLİ)' }
                                                            ]}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Varsayılan KDV Oranı</label>
                                                        <CustomSelect
                                                            value={defaultVatRate}
                                                            onChange={(v) => setDefaultVatRate(Number(v))}
                                                            buttonClassName="h-8 py-0"
                                                            options={[
                                                                { value: 20, label: '%20' },
                                                                { value: 10, label: '%10' },
                                                                { value: 0, label: '%0' }
                                                            ]}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Tevkifat / İstisna Satırı */}
                                                <div className="h-[54px] flex flex-col justify-end">
                                                    {defaultInvoiceType === 'TEVKIFAT' ? (
                                                        <div>
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Varsayılan Tevkifat Kodu</label>
                                                            <CustomSelect
                                                                value={defaultTevkifatKodu}
                                                                onChange={setDefaultTevkifatKodu}
                                                                buttonClassName="h-8 py-0"
                                                                options={TEVKIFAT_CODES.map(t => ({ value: t.code, label: t.label }))}
                                                                searchable
                                                            />
                                                        </div>
                                                    ) : defaultInvoiceType === 'ISTISNA' ? (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Varsayılan Muafiyet Kodu</label>
                                                                <CustomSelect
                                                                    value={defaultKdvMuafiyetKodu}
                                                                    onChange={setDefaultKdvMuafiyetKodu}
                                                                    buttonClassName="h-8 py-0"
                                                                    options={EXEMPTION_CODES.map(e => ({ value: e.code, label: e.label }))}
                                                                    searchable
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Muafiyet Açıklaması</label>
                                                                <input
                                                                    type="text"
                                                                    value={defaultKdvMuafiyetNedeni}
                                                                    onChange={(e) => setDefaultKdvMuafiyetNedeni(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                                    className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-2.5 text-xs focus:border-amber-500 outline-none"
                                                                    placeholder="306/1-a Kapsamında..."
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="h-8 rounded-xl border border-dashed border-white/[0.05] bg-white/[0.01] px-3 flex items-center text-[11px] text-slate-500 italic">
                                                            Standart Satış Faturası
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Varsayılan Alıcı Şirket Bilgileri */}
                                                <div className="pt-3 border-t border-white/[0.05]">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                                                            Varsayılan Alıcı Şirket Bilgileri
                                                        </h4>
                                                        {defaultBuyerVkn && defaultBuyerTitle && (!gibClients[defaultBuyerVkn] || gibClients[defaultBuyerVkn].title !== defaultBuyerTitle) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSaveClientToPool({
                                                                    vkn: defaultBuyerVkn,
                                                                    title: defaultBuyerTitle,
                                                                    taxOffice: defaultBuyerTaxOffice,
                                                                    address: defaultBuyerAddress,
                                                                    city: defaultBuyerCity,
                                                                    district: defaultBuyerDistrict
                                                                })}
                                                                disabled={isSavingClient}
                                                                className="h-6 px-2 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 border border-orange-500/30 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer active:scale-95 disabled:opacity-50"
                                                            >
                                                                {isSavingClient ? <RefreshCw size={10} className="animate-spin" /> : <BookmarkPlus size={11} />}
                                                                <span>Müşteri Havuzuna Ekle</span>
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-3">
                                                        <div className="sm:col-span-4">
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Varsayılan TCKN / VKN</label>
                                                            <input
                                                                type="text"
                                                                maxLength={11}
                                                                value={defaultBuyerVkn}
                                                                onChange={(e) => setDefaultBuyerVkn(e.target.value.replace(/\s/g, ''))}
                                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs sm:text-sm font-mono font-bold focus:border-amber-500 outline-none"
                                                                placeholder="10 VKN / 11 TCKN"
                                                            />
                                                        </div>
                                                        <div className="sm:col-span-8">
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Varsayılan Unvan / Ad Soyad</label>
                                                            <input
                                                                type="text"
                                                                value={defaultBuyerTitle}
                                                                onChange={(e) => setDefaultBuyerTitle(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs sm:text-sm font-semibold focus:border-amber-500 outline-none"
                                                                placeholder="Varsayılan Şirket Resmi Unvanı"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-3">
                                                        <div className="sm:col-span-6">
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Vergi Dairesi</label>
                                                            <input
                                                                type="text"
                                                                value={defaultBuyerTaxOffice}
                                                                onChange={(e) => setDefaultBuyerTaxOffice(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs focus:border-amber-500 outline-none"
                                                                placeholder="Vergi Dairesi Müdürlüğü"
                                                            />
                                                        </div>
                                                        <div className="sm:col-span-3">
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">İlçe</label>
                                                            <input
                                                                type="text"
                                                                value={defaultBuyerDistrict}
                                                                onChange={(e) => setDefaultBuyerDistrict(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-2.5 text-xs focus:border-amber-500 outline-none"
                                                                placeholder="İlçe"
                                                            />
                                                        </div>
                                                        <div className="sm:col-span-3">
                                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Şehir (İl)</label>
                                                            <input
                                                                type="text"
                                                                value={defaultBuyerCity}
                                                                onChange={(e) => setDefaultBuyerCity(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-2.5 text-xs focus:border-amber-500 outline-none"
                                                                placeholder="Şehir"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">Varsayılan Açık Adres</label>
                                                        <textarea
                                                            value={defaultBuyerAddress}
                                                            onChange={(e) => setDefaultBuyerAddress(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                            rows={2}
                                                            className="w-full h-[54px] bg-[#0d1117] border border-white/[0.08] text-white rounded-2xl p-2.5 text-xs focus:border-amber-500 outline-none resize-none transition"
                                                            placeholder="Varsayılan adres..."
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                        </div>
                                    </div>

                                    {/* Step Footer */}
                                    <div className="h-14 shrink-0 bg-[#07090e] border-t border-white/[0.06] px-4 sm:px-6 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {settingsStatus.message && (
                                                <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border ${
                                                    settingsStatus.type === 'error' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                }`}>
                                                    {settingsStatus.type === 'error' ? <AlertTriangle size={14}/> : <CheckCircle size={14}/>}
                                                    <span className="truncate">{settingsStatus.message}</span>
                                                </div>
                                            )}
                                            {forceLogoutStatus && (
                                                <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border ${
                                                    forceLogoutStatus.type === 'error' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                }`}>
                                                    {forceLogoutStatus.type === 'error' ? <AlertTriangle size={14}/> : <CheckCircle size={14}/>}
                                                    <span className="truncate">{forceLogoutStatus.message}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setIsSettingsModalOpen(false)}
                                                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition cursor-pointer"
                                            >
                                                Vazgeç
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={isSavingSettings}
                                                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 shadow-md shadow-orange-500/20 active:scale-95 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                                            >
                                                {isSavingSettings ? (
                                                    <>
                                                        <RefreshCw size={13} className="animate-spin" />
                                                        <span>Kaydediliyor...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Save size={13} />
                                                        <span>GİB Ayarlarını Kaydet</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        ) : (
                            /* NORMAL FATURA TABLO GÖRÜNÜMÜ */
                            <div
                                key="invoice-table-view"
                                className="flex-1 flex flex-col h-full min-h-0 animate-in fade-in duration-300"
                            >
                                {isLoadingSettings ? (
                                    <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2 m-auto">
                                        <RefreshCw size={24} className="animate-spin text-orange-500" />
                                        <span>Veriler yükleniyor...</span>
                                    </div>
                                ) : activeInvoices.length === 0 ? (
                                    <div className="p-12 text-center text-slate-500 m-auto">
                                        Gönderilmeyi bekleyen veya onaylanmış fatura bulunmamaktadır.
                                    </div>
                                ) : (
                                    <>
                                        {/* ─── MASAÜSTÜ TABLO GÖRÜNÜMÜ (hidden md:block) ─── */}
                                        <div className="hidden md:block overflow-y-auto flex-1 custom-scrollbar">
                                            <table className="w-full text-left text-sm border-collapse">
                                                <thead className="bg-[#07090e] sticky top-0 z-10 border-b border-white/[0.06] text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                                    <tr>
                                                        <th className="py-3 px-4 font-semibold">Dönem & Operasyon</th>
                                                        <th className="py-3 px-4 font-semibold">Hakediş Tutarı</th>
                                                        <th className="py-3 px-4 font-semibold">GİB Durumu</th>
                                                        <th className="py-3 px-4 font-semibold text-right">İşlemler</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.04]">
                                                    {activeInvoices.map((inv) => {
                                                        const isDraftOnGib = inv.gibStatus === 'Draft';
                                                        const isSignedOnGib = inv.gibStatus === 'Signed' || inv.gibStatus === 'Approved';
                                                        const isSending = sendingInvoiceId === inv.id;

                                                        return (
                                                            <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                                                                {/* 1. Sütun: Dönem & Operasyon */}
                                                                <td className="p-4">
                                                                    {(() => {
                                                                        const period = formatInvoicePeriod(inv.startDate, inv.endDate);
                                                                        const tripCount = inv.trips?.length || 0;
                                                                        const totalTon = ((inv.trips && inv.trips.length > 0) ? inv.trips.reduce((acc, t) => acc + parseTonnageInTons(t.tonnage), 0) : (inv.totalTonnage || 0)).toFixed(2);
                                                                        return (
                                                                            <div className="flex flex-col">
                                                                                <span className="text-white text-sm font-bold tracking-tight">
                                                                                    {period.primary}
                                                                                </span>
                                                                                <span className="text-[11px] text-slate-400 font-medium mt-0.5">
                                                                                    {tripCount > 0 ? `${tripCount} Sefer • ${totalTon} Ton` : (period.sub || '2026 Dönemi')}
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </td>

                                                                {/* 2. Sütun: Hakediş Tutarı */}
                                                                <td className="p-4">
                                                                    {(() => {
                                                                        const est = getInvoiceEstimate(inv);
                                                                        if (!est) {
                                                                            return <span className="text-slate-600 font-mono text-sm">—</span>;
                                                                        }
                                                                        if (est.isActual) {
                                                                            return (
                                                                                <span className="text-white font-bold font-mono text-sm">
                                                                                    {est.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                                                                                </span>
                                                                            );
                                                                        }
                                                                        return (
                                                                            <div className="flex flex-col">
                                                                                <span className="text-slate-300 font-semibold font-mono text-sm">
                                                                                    {est.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                                                                                </span>
                                                                                <span className="text-[10px] text-slate-500 font-medium tracking-tight">
                                                                                    (Tahmini Tutar)
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </td>

                                                                {/* 3. Sütun: GİB Durumu Rozeti */}
                                                                <td className="p-4">
                                                                    {isDraftOnGib ? (
                                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-orange-500/10 text-orange-300 border border-orange-500/20 text-xs font-semibold">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                                                                            GİB'de Taslak {inv.gibTestMode && "(TEST)"}
                                                                        </span>
                                                                    ) : isSignedOnGib ? (
                                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.05] text-slate-200 border border-white/[0.08] text-xs font-semibold">
                                                                            <CheckCircle size={12} className="text-slate-400" />
                                                                            Resmi Onaylı {inv.gibTestMode && "(TEST)"}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs font-semibold">
                                                                            <Clock size={12} className="text-orange-400" />
                                                                            Taslak Bekliyor
                                                                        </span>
                                                                    )}
                                                                </td>

                                                                {/* 4. Sütun: İşlemler & Butonlar */}
                                                                <td className="p-4 text-right">
                                                                    <div className="flex justify-end items-center gap-2">
                                                                        {/* Belge / PDF Yönetim Modalı Butonu */}
                                                                        <button
                                                                            onClick={() => {
                                                                                setPdfModalInvoice(inv);
                                                                                setModalFiles(inv.files || []);
                                                                                setModalNote(inv.note || '');
                                                                            }}
                                                                            title={inv.files?.length > 0 ? "Fatura Belgelerini Düzenle / Görüntüle" : "Faturaya PDF / Belge Ekle"}
                                                                            className={`p-1.5 text-xs font-semibold rounded-lg transition border cursor-pointer ${inv.files?.length > 0 ? 'bg-orange-500/15 border-orange-500/30 text-orange-400 hover:bg-orange-500/25' : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-700'}`}
                                                                        >
                                                                            <Paperclip size={13} />
                                                                        </button>

                                                                        {isDraftOnGib ? (
                                                                            <>
                                                                                <button
                                                                                    onClick={() => handleApproveSmsInit(inv)}
                                                                                    disabled={isApprovingSms === inv.id}
                                                                                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white px-3 py-1.5 rounded-xl transition disabled:opacity-50 cursor-pointer shadow-md shadow-orange-950/40"
                                                                                >
                                                                                    {isApprovingSms === inv.id ? (
                                                                                        <RefreshCw size={12} className="animate-spin" />
                                                                                    ) : (
                                                                                        <Smartphone size={12} />
                                                                                    )}
                                                                                    Sistemde Onayla
                                                                                </button>
                                                                                <a
                                                                                    href={gibPortalUrl}
                                                                                    target="_blank" 
                                                                                    rel="noopener noreferrer" 
                                                                                    className="inline-flex items-center gap-1 text-xs font-semibold bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/10 px-3 py-1.5 rounded-xl transition cursor-pointer"
                                                                                >
                                                                                    Portalda Onayla <ExternalLink size={12} />
                                                                                </a>
                                                                                <button
                                                                                    onClick={() => handleMarkAsSigned(inv)}
                                                                                    title="İmzalandı Olarak İşaretle"
                                                                                    className="p-1.5 text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-orange-400 border border-slate-700/60 hover:border-orange-500/30 rounded-xl transition cursor-pointer"
                                                                                >
                                                                                    <CheckCircle size={13} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleResetGibStatus(inv)}
                                                                                    title="GİB Durumunu Sıfırla (Yeniden Göndermek İçin)"
                                                                                    className="p-1.5 text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/60 hover:border-slate-500 rounded-xl transition cursor-pointer"
                                                                                >
                                                                                    <RefreshCw size={13} />
                                                                                </button>
                                                                            </>
                                                                        ) : isSignedOnGib ? (
                                                                            <>
                                                                                <button
                                                                                    onClick={() => handleDownloadPdf(inv)}
                                                                                    disabled={!inv.gibUuid || isDownloadingPdf === inv.id}
                                                                                    title={inv.gibUuid ? "Faturayı Görüntüle / Yazdır" : "Sistem dışı onaylandığı için görüntülenemez"}
                                                                                    className="p-1.5 text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-orange-400 border border-slate-700/60 hover:border-orange-500/30 rounded-xl transition disabled:opacity-30 disabled:hover:bg-slate-800 disabled:hover:text-slate-400 disabled:hover:border-slate-700 disabled:cursor-not-allowed cursor-pointer"
                                                                                >
                                                                                    {isDownloadingPdf === inv.id ? (
                                                                                        <RefreshCw size={12} className="animate-spin" />
                                                                                    ) : (
                                                                                        <Download size={13} />
                                                                                    )}
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleResetGibStatus(inv)}
                                                                                    title="GİB Durumunu Sıfırla (Yeniden Göndermek İçin)"
                                                                                    className="p-1.5 text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/60 hover:border-slate-500 rounded-xl transition cursor-pointer"
                                                                                >
                                                                                    <RefreshCw size={13} />
                                                                                </button>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <button
                                                                                    onClick={() => handleOpenSendModal(inv)}
                                                                                    disabled={isSending}
                                                                                    className="inline-flex items-center gap-1.5 text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white px-3.5 py-1.5 rounded-xl transition disabled:opacity-50 shadow-md shadow-orange-500/25 active:scale-95 cursor-pointer"
                                                                                >
                                                                                    {isSending ? (
                                                                                        <>
                                                                                            <RefreshCw size={12} className="animate-spin" />
                                                                                            Hazırlanıyor...
                                                                                        </>
                                                                                    ) : (
                                                                                        <>
                                                                                            GİB Taslak Hazırla
                                                                                        </>
                                                                                    )}
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleMarkAsSigned(inv)}
                                                                                    title="İmzalandı Olarak İşaretle"
                                                                                    className="p-1.5 text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-orange-400 border border-slate-700/60 hover:border-orange-500/30 rounded-xl transition cursor-pointer"
                                                                                >
                                                                                    <CheckCircle size={13} />
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* ─── MOBİL GÖRÜNÜM: DOKUNMATİK DOSTU KARTLAR (md:hidden) ─── */}
                                        <div className="md:hidden overflow-y-auto flex-1 custom-scrollbar p-3 space-y-2.5">
                                            {activeInvoices.map((inv) => {
                                                const isDraftOnGib = inv.gibStatus === 'Draft';
                                                const isSignedOnGib = inv.gibStatus === 'Signed' || inv.gibStatus === 'Approved';
                                                const isSending = sendingInvoiceId === inv.id;
                                                const period = formatInvoicePeriod(inv.startDate, inv.endDate);
                                                const tripCount = inv.trips?.length || 0;
                                                const totalTon = ((inv.trips && inv.trips.length > 0) ? inv.trips.reduce((acc, t) => acc + parseTonnageInTons(t.tonnage), 0) : (inv.totalTonnage || 0)).toFixed(2);
                                                const est = getInvoiceEstimate(inv);

                                                return (
                                                    <div 
                                                        key={inv.id}
                                                        className="bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.07] hover:border-white/[0.12] rounded-2xl p-3.5 flex flex-col gap-2.5 transition-all shadow-sm relative overflow-hidden"
                                                    >
                                                        {/* 1. Üst Satır: Dönem Tarihi & GİB Durum Rozeti */}
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="text-white text-sm font-bold tracking-tight truncate">
                                                                    {period.primary}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 font-medium">
                                                                    {period.sub || '2026 Dönemi'}
                                                                </span>
                                                            </div>

                                                            {/* GİB Durum Rozeti */}
                                                            <div className="shrink-0">
                                                                {isDraftOnGib ? (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-orange-500/15 text-orange-300 border border-orange-500/25 text-[10px] font-semibold">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                                                                        GİB Taslak {inv.gibTestMode && "(TEST)"}
                                                                    </span>
                                                                ) : isSignedOnGib ? (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 text-[10px] font-semibold">
                                                                        <CheckCircle size={10} className="text-emerald-400" />
                                                                        Resmi Onaylı {inv.gibTestMode && "(TEST)"}
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.04] text-slate-300 border border-white/[0.08] text-[10px] font-semibold">
                                                                        <Clock size={10} className="text-amber-400" />
                                                                        Taslak Bekliyor
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* 2. Orta Bilgi: Sefer / Tonaj ve Hakediş Tutarı */}
                                                        <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.04]">
                                                            <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                                                                <span className="inline-block bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-md text-[11px] font-semibold text-slate-300">
                                                                    {tripCount} Sefer
                                                                </span>
                                                                <span className="text-slate-500">•</span>
                                                                <span className="font-mono text-slate-300 text-xs">
                                                                    {totalTon} Ton
                                                                </span>
                                                            </div>

                                                            {/* Tutar */}
                                                            <div className="text-right">
                                                                {est ? (
                                                                    <div className="flex flex-col items-end">
                                                                        <span className="text-sm font-bold font-mono text-orange-400">
                                                                            ₺{est.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                        </span>
                                                                        {!est.isActual && (
                                                                            <span className="text-[9px] text-slate-500 font-medium leading-none mt-0.5">
                                                                                (Tahmini Tutar)
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-slate-600 font-mono text-xs">—</span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* 3. Alt Satır: Aksiyon Butonları */}
                                                        <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04] flex-wrap">
                                                            {/* Belge / PDF Yönetimi */}
                                                            <button
                                                                onClick={() => {
                                                                    setPdfModalInvoice(inv);
                                                                    setModalFiles(inv.files || []);
                                                                    setModalNote(inv.note || '');
                                                                }}
                                                                title={inv.files?.length > 0 ? "Fatura Belgelerini Düzenle" : "Faturaya PDF / Belge Ekle"}
                                                                className={`p-2 text-xs font-semibold rounded-xl transition border cursor-pointer flex items-center gap-1 shrink-0 ${
                                                                    inv.files?.length > 0 
                                                                        ? 'bg-orange-500/15 border-orange-500/30 text-orange-400 hover:bg-orange-500/25' 
                                                                        : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-white'
                                                                }`}
                                                            >
                                                                <Paperclip size={13} />
                                                                <span className="text-[11px]">{inv.files?.length > 0 ? `${inv.files.length} Belge` : 'Ekler'}</span>
                                                            </button>

                                                            {/* Duruma Göre Ana Butonlar */}
                                                            {isDraftOnGib ? (
                                                                <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
                                                                    <button
                                                                        onClick={() => handleApproveSmsInit(inv)}
                                                                        disabled={isApprovingSms === inv.id}
                                                                        className="flex-1 min-w-[110px] inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white px-2.5 py-1.5 rounded-xl transition disabled:opacity-50 cursor-pointer shadow-sm"
                                                                    >
                                                                        {isApprovingSms === inv.id ? (
                                                                            <RefreshCw size={12} className="animate-spin" />
                                                                        ) : (
                                                                            <Smartphone size={12} />
                                                                        )}
                                                                        <span>Sistemde Onayla</span>
                                                                    </button>
                                                                    <a
                                                                        href={gibPortalUrl}
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer" 
                                                                        className="p-2 text-xs font-semibold bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/10 rounded-xl transition cursor-pointer shrink-0"
                                                                        title="GİB Portalında Onayla"
                                                                    >
                                                                        <ExternalLink size={13} />
                                                                    </a>
                                                                    <button
                                                                        onClick={() => handleMarkAsSigned(inv)}
                                                                        title="İmzalandı Olarak İşaretle"
                                                                        className="p-2 text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-orange-400 border border-slate-700/60 rounded-xl transition cursor-pointer shrink-0"
                                                                    >
                                                                        <CheckCircle size={13} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleResetGibStatus(inv)}
                                                                        title="GİB Durumunu Sıfırla"
                                                                        className="p-2 text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/60 rounded-xl transition cursor-pointer shrink-0"
                                                                    >
                                                                        <RefreshCw size={13} />
                                                                    </button>
                                                                </div>
                                                            ) : isSignedOnGib ? (
                                                                <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
                                                                    <button
                                                                        onClick={() => handleDownloadPdf(inv)}
                                                                        disabled={!inv.gibUuid || isDownloadingPdf === inv.id}
                                                                        className="flex-1 min-w-[100px] inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 hover:text-white border border-white/10 px-3 py-1.5 rounded-xl transition disabled:opacity-30 cursor-pointer shadow-sm"
                                                                    >
                                                                        {isDownloadingPdf === inv.id ? (
                                                                            <RefreshCw size={12} className="animate-spin" />
                                                                        ) : (
                                                                            <Download size={13} />
                                                                        )}
                                                                        <span>PDF İndir</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleResetGibStatus(inv)}
                                                                        title="GİB Durumunu Sıfırla"
                                                                        className="p-2 text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/60 rounded-xl transition cursor-pointer shrink-0"
                                                                    >
                                                                        <RefreshCw size={13} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
                                                                    <button
                                                                        onClick={() => handleOpenSendModal(inv)}
                                                                        disabled={isSending}
                                                                        className="flex-1 min-w-[130px] inline-flex items-center justify-center gap-1.5 text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white px-3 py-1.5 rounded-xl transition disabled:opacity-50 shadow-md shadow-orange-500/25 active:scale-95 cursor-pointer"
                                                                    >
                                                                        {isSending ? (
                                                                            <>
                                                                                <RefreshCw size={12} className="animate-spin" />
                                                                                <span>Hazırlanıyor...</span>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <Sparkles size={12} />
                                                                                <span>GİB Taslak Hazırla</span>
                                                                            </>
                                                                        )}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleMarkAsSigned(inv)}
                                                                        title="İmzalandı Olarak İşaretle"
                                                                        className="p-2 text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-orange-400 border border-slate-700/60 rounded-xl transition cursor-pointer shrink-0"
                                                                    >
                                                                        <CheckCircle size={13} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>



            {smsModalOpen && smsTargetInvoice && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#07090e] border border-emerald-500/30 rounded-2xl shadow-2xl p-6 w-full max-w-md animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-emerald-400 mb-2 flex items-center gap-2">
                            <Smartphone size={20} />
                            SMS Onayı
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] mb-6">
                            GİB sistemine kayıtlı {smsPhone ? <strong>{smsPhone}</strong> : "ilgili"} numaralı telefona gönderilen 6 haneli doğrulama kodunu giriniz.
                        </p>
                        
                        <form onSubmit={handleApproveSmsSubmit}>
                            <div className="mb-6">
                                <input
                                    type="text"
                                    maxLength={6}
                                    value={smsCode}
                                    onChange={(e) => setSmsCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                                    placeholder="XXXXXX"
                                    className="w-full text-center tracking-[0.5em] font-mono text-2xl bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-4 py-3 focus:border-emerald-500 outline-none"
                                />
                            </div>
                            
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => { setSmsModalOpen(false); setSmsCode(''); }}
                                    className="flex-1 px-4 py-2 text-sm font-semibold text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isApprovingSms === 'submitting' || smsCode.length < 6}
                                    className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                                >
                                    {isApprovingSms === 'submitting' && <RefreshCw size={14} className="animate-spin" />}
                                    Onayla
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}



        {/* Manuel PDF / Belge Yönetimi Modalı */}
        {pdfModalInvoice && createPortal(
            <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={() => setPdfModalInvoice(null)}>
                <div className="bg-[#07090e] rounded-2xl border border-white/[0.08] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center px-5 py-4 border-b border-white/[0.08] bg-white/[0.02]">
                        <h3 className="font-bold flex items-center gap-2.5 text-[var(--text-primary)]">
                            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0 text-amber-400 shadow-[0_0_10px_rgba(249,115,22,0.2)]">
                                <FileText size={16} />
                            </span>
                            <span>{pdfModalInvoice.docId || pdfModalInvoice.id} <span className="text-slate-500 font-normal text-xs">— Belge Yönetimi</span></span>
                        </h3>
                        <button onClick={() => setPdfModalInvoice(null)} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all text-xl cursor-pointer">&times;</button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div>
                            <p className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                                <Paperclip size={13} className="text-amber-400" /> E-Arşiv Fatura PDF'i / Belge Yükle
                            </p>
                            <FileUpload files={modalFiles} onChange={setModalFiles} maxSizeMB={10} />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-slate-300 mb-1.5">Fatura Notu (Opsiyonel)</p>
                            <textarea
                                value={modalNote}
                                onChange={(e) => setModalNote(e.target.value)}
                                className="w-full bg-[#0d1117] border border-white/[0.08] focus:border-amber-500/40 rounded-xl p-3 text-sm text-[var(--text-primary)] placeholder-slate-600 outline-none min-h-[80px] resize-none transition-colors"
                                placeholder="Not ekle... (örn: GİB'den manuel kesildi, onay belgesi eklendi vb.)"
                            />
                        </div>
                    </div>
                    <div className="px-5 py-4 border-t border-white/[0.08] flex justify-end gap-3 bg-white/[0.02]">
                        <button
                            onClick={() => setPdfModalInvoice(null)}
                            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                        >
                            İptal
                        </button>
                        <button
                            onClick={handleSaveManualFiles}
                            disabled={isSavingPdf}
                            className="px-5 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white transition-all shadow-lg shadow-orange-500/25 active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                        >
                            {isSavingPdf ? (
                                <>
                                    <RefreshCw size={14} className="animate-spin" /> Kaydediliyor...
                                </>
                            ) : (
                                <>
                                    <Save size={14} /> Kaydet
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )}

        {toastPortal}
        {confirmPortal}
        </>
    );
};

export default EArsiv;

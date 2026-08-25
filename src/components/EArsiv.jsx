import React, { useState, useEffect, useContext, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DataContext } from '../context/DataContext';
import { useCompany } from '../context/CompanyContext';
import { useTruck } from '../context/TruckContext';
import { auth } from '../services/firebaseConfig';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { FileText, Save, Key, RefreshCw, CheckCircle, AlertTriangle, ExternalLink, HelpCircle, X, Send, BookOpen, Settings, Smartphone, Download, Paperclip } from 'lucide-react';

import CustomDatePicker from './CustomDatePicker';
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

const EArsiv = () => {
    const { invoices, addLog, routeHistory, saveRouteHistory } = useContext(DataContext);
    const { activeCompanyId } = useCompany();
    const { trucks } = useTruck();

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
    const [defaultIsVatIncluded, setDefaultIsVatIncluded] = useState(true);
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
    const [isVatIncluded, setIsVatIncluded] = useState(false);
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

    const showToast = (type, message, duration = 5000) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), duration);
    };

    const showConfirm = (message) => new Promise((resolve) => {
        setConfirmDialog({ message, onConfirm: resolve });
    });

    // Lock body scroll when any overlay is open
    useEffect(() => {
        const isAnyOverlayOpen = isModalOpen || !!confirmDialog;
        if (isAnyOverlayOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isModalOpen, confirmDialog]);

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
                setDefaultIsVatIncluded(data.defaultIsVatIncluded ?? true);
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

    const handleSaveSettings = async (e) => {
        e.preventDefault();
        setSettingsStatus({ type: '', message: '' });
        setIsSavingSettings(true);

        try {
            const docRef = doc(db, 'company_data', docId);
            await setDoc(docRef, {
                gibUsername: gibUsername.trim(),
                gibPassword: gibPassword.trim(),
                gibTestMode: gibTestMode,
                // Save default preferences
                defaultIban: defaultIban.trim(),
                defaultIbanName: defaultIbanName.trim(),
                defaultInvoiceType,
                defaultVatRate: Number(defaultVatRate),
                defaultIsVatIncluded,
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

        // Load route history for remembrance (from Firebase, fallback to localStorage)
        let history = routeHistory && Object.keys(routeHistory).length > 0 ? routeHistory : {};
        if (Object.keys(history).length === 0) {
            try {
                const stored = localStorage.getItem(`route_history_${activeCompanyId || 'default'}`);
                if (stored) history = JSON.parse(stored);
            } catch (e) {
                console.error("Güzergah hafızası yüklenirken hata:", e);
            }
        }

        // Map routeSummary to routeLines
        const initialLines = routeSummary.map(r => {
            const key = `${r.from.trim()}|||${r.to.trim()}`;
            const existingLine = routeLines.find(l => l.from === r.from && l.to === r.to);
            const cached = history[key] || {};
            
            const name = existingLine?.name || cached.name || `${r.from} ${r.to} UÇUCU KÜL NAKLİYESİ.`.toUpperCase();
            const unitPrice = existingLine !== undefined ? existingLine.unitPrice : (cached.unitPrice || 0);
            
            const quantity = Number(r.tonnage.toFixed(2));
            let price = 0;
            let vatAmount = 0;
            let vatAmountOfTax = 0;
            let totalAmount = 0;

            const lineRate = invoiceType === 'ISTISNA' ? 0 : Number(vatRate);
            const activeTevkifat = TEVKIFAT_CODES.find(t => t.code === tevkifatKodu);
            const tRate = activeTevkifat ? activeTevkifat.rate : 20;

            if (isVatIncluded) {
                totalAmount = Number((quantity * unitPrice).toFixed(2));
                price = Number((totalAmount / (1 + (lineRate / 100))).toFixed(2));
                vatAmount = Number((totalAmount - price).toFixed(2));
                vatAmountOfTax = invoiceType === 'TEVKIFAT' ? Number((vatAmount * (tRate / 100)).toFixed(2)) : 0;
            } else {
                price = Number((quantity * unitPrice).toFixed(2));
                vatAmount = Number((price * (lineRate / 100)).toFixed(2));
                vatAmountOfTax = invoiceType === 'TEVKIFAT' ? Number((vatAmount * (tRate / 100)).toFixed(2)) : 0;
                totalAmount = Number((price + vatAmount).toFixed(2));
            }

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
            let price = 0;
            let vatAmount = 0;
            let vatAmountOfTax = 0;
            let totalAmount = 0;

            const lineRate = invoiceType === 'ISTISNA' ? 0 : Number(vatRate);
            const activeTevkifat = TEVKIFAT_CODES.find(t => t.code === tevkifatKodu);
            const tRate = activeTevkifat ? activeTevkifat.rate : 20;

            if (isVatIncluded) {
                totalAmount = Number((quantity * uPrice).toFixed(2));
                price = Number((totalAmount / (1 + (lineRate / 100))).toFixed(2));
                vatAmount = Number((totalAmount - price).toFixed(2));
                vatAmountOfTax = invoiceType === 'TEVKIFAT' ? Number((vatAmount * (tRate / 100)).toFixed(2)) : 0;
            } else {
                price = Number((quantity * uPrice).toFixed(2));
                vatAmount = Number((price * (lineRate / 100)).toFixed(2));
                vatAmountOfTax = invoiceType === 'TEVKIFAT' ? Number((vatAmount * (tRate / 100)).toFixed(2)) : 0;
                totalAmount = Number((price + vatAmount).toFixed(2));
            }

            line.price = price;
            line.vatAmount = vatAmount;
            line.vatAmountOfTax = vatAmountOfTax;
            line.totalAmount = totalAmount;
        }

        updated[index] = line;
        setRouteLines(updated);

        // Save route line to remembrance history immediately (Firebase + localStorage)
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
        setIsVatIncluded(defaultIsVatIncluded);
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
                    isVatIncluded,
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
                        className="px-5 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition shadow-lg shadow-orange-500/20"
                    >Onayla</button>
                </div>
            </div>
        </div>
    ) : null;
    const confirmPortal = confirmEl ? createPortal(confirmEl, document.body) : null;

    return (
        <>

            <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">

            {/* Header */}
            <div className="glass-panel p-6 border-l-4 border-l-orange-500">
                <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2 flex items-center">
                    <FileText className="mr-2 text-orange-500" size={24} />
                    GİB e-Arşiv Fatura Entegrasyonu
                </h3>
                <p className="text-[var(--text-secondary)] text-sm">
                    Bu ekrandan sistemde onaylanan faturalarınızı GİB e-Arşiv Portalına tek tıkla **Taslak** olarak aktarabilirsiniz. Aktarım sonrası faturalarınızı portalda imzalayarak resmiyet kazandırabilirsiniz.
                </p>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-2 border-b border-[var(--border-color)] pb-px">
                <button
                    onClick={() => setActiveSubTab('list')}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
                        activeSubTab === 'list'
                            ? 'border-orange-500 text-orange-500'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Faturaları Yönet
                </button>
                <button
                    onClick={() => setActiveSubTab('settings')}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
                        activeSubTab === 'settings'
                            ? 'border-orange-500 text-orange-500'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Bağlantı Ayarları
                </button>
            </div>

            {/* Error Message */}
            {syncError && (
                <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm">
                    <AlertTriangle size={18} className="shrink-0" />
                    <div>
                        <span className="font-semibold">Aktarım Hatası:</span> {syncError}
                    </div>
                </div>
            )}

            {/* List Tab */}
            {activeSubTab === 'list' && (
                <div className="glass-panel overflow-hidden">
                    <div className="p-4 bg-slate-900/40 border-b border-[var(--border-color)] flex items-center justify-between">
                        <span className="text-sm font-bold text-[var(--text-primary)]">
                            Gönderilebilir Faturalar ({activeInvoices.length})
                        </span>
                        <a 
                            href={gibPortalUrl}
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 font-semibold transition"
                        >
                            GİB e-Arşiv Portalına Git <ExternalLink size={12} />
                        </a>
                    </div>

                    {isLoadingSettings ? (
                        <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                            <RefreshCw size={24} className="animate-spin text-orange-500" />
                            <span>Veriler yükleniyor...</span>
                        </div>
                    ) : activeInvoices.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">
                            Gönderilmeyi bekleyen veya onaylanmış fatura bulunmamaktadır.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead>
                                    <tr className="bg-slate-950/20 text-[var(--text-secondary)] text-xs uppercase tracking-wider border-b border-[var(--border-color)]">
                                        <th className="p-4 font-semibold">Fatura No</th>
                                        <th className="p-4 font-semibold">Araç / Plaka</th>
                                        <th className="p-4 font-semibold">Dönem</th>
                                        <th className="p-4 font-semibold">Tutar</th>
                                        <th className="p-4 font-semibold">GİB e-Arşiv Durumu</th>
                                        <th className="p-4 font-semibold text-right">İşlem</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-color)]">
                                    {activeInvoices.map((inv) => {
                                        const isDraftOnGib = inv.gibStatus === 'Draft';
                                        const isSignedOnGib = inv.gibStatus === 'Signed' || inv.gibStatus === 'Approved';
                                        const isSending = sendingInvoiceId === inv.id;
                                        const invTruck = trucksMap.get(inv.truckId);
                                        const plate = invTruck?.plate || '—';

                                        return (
                                            <tr key={inv.id} className="hover:bg-white/[0.01] transition-colors">
                                                <td className="p-4 font-semibold text-[var(--text-primary)]">
                                                    {inv.docId || inv.id}
                                                </td>
                                                <td className="p-4 text-[var(--text-secondary)] font-mono font-bold">
                                                    {plate}
                                                </td>
                                                <td className="p-4 text-[var(--text-secondary)] text-xs">
                                                    {inv.startDate} - {inv.endDate}
                                                </td>
                                                <td className="p-4 text-emerald-400 font-bold">
                                                    {inv.grandTotal?.toLocaleString('tr-TR')} ₺
                                                </td>
                                                <td className="p-4">
                                                    {isDraftOnGib ? (
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="inline-flex items-center gap-1 text-xs bg-orange-500/10 border border-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-medium w-fit">
                                                                <CheckCircle size={12} /> GİB'de Taslak {inv.gibTestMode && "(TEST)"}
                                                            </span>
                                                            <span className="text-[10px] text-slate-500 font-mono select-all">
                                                                UUID: {inv.gibUuid}
                                                            </span>
                                                        </div>
                                                    ) : isSignedOnGib ? (
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="inline-flex items-center gap-1 text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium w-fit">
                                                                <CheckCircle size={12} /> GİB'de İmzalandı {inv.gibTestMode && "(TEST)"}
                                                            </span>
                                                            {inv.gibUuid && (
                                                                <span className="text-[10px] text-slate-500 font-mono select-all">
                                                                    UUID: {inv.gibUuid}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="inline-flex items-center text-xs bg-slate-800 border border-slate-700 text-slate-400 px-2 py-0.5 rounded-full font-medium">
                                                            GİB'e Gönderilmedi
                                                        </span>
                                                    )}
                                                </td>
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
                                                            className={`p-1.5 text-xs font-semibold rounded-lg transition border ${inv.files?.length > 0 ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'}`}
                                                        >
                                                            <Paperclip size={12} />
                                                        </button>

                                                        {isDraftOnGib ? (
                                                            <>
                                                                <button
                                                                    onClick={() => handleApproveSmsInit(inv)}
                                                                    disabled={isApprovingSms === inv.id}
                                                                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50"
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
                                                                    className="inline-flex items-center gap-1 text-xs font-semibold bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 px-3 py-1.5 rounded-lg transition"
                                                                >
                                                                    Portalda Onayla <ExternalLink size={12} />
                                                                </a>
                                                                <button
                                                                    onClick={() => handleMarkAsSigned(inv)}
                                                                    title="İmzalandı Olarak İşaretle"
                                                                    className="p-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 border border-slate-700 hover:border-emerald-500/30 rounded-lg transition"
                                                                >
                                                                    <CheckCircle size={12} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleResetGibStatus(inv)}
                                                                    title="GİB Durumunu Sıfırla (Yeniden Göndermek İçin)"
                                                                    className="p-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/30 rounded-lg transition"
                                                                >
                                                                    <RefreshCw size={12} />
                                                                </button>
                                                            </>
                                                        ) : isSignedOnGib ? (
                                                            <>
                                                                <button
                                                                    onClick={() => handleDownloadPdf(inv)}
                                                                    disabled={!inv.gibUuid || isDownloadingPdf === inv.id}
                                                                    title={inv.gibUuid ? "Faturayı Görüntüle / Yazdır" : "Sistem dışı onaylandığı için görüntülenemez"}
                                                                    className="p-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-sky-400 border border-slate-700 hover:border-sky-500/30 rounded-lg transition disabled:opacity-30 disabled:hover:bg-slate-800 disabled:hover:text-slate-400 disabled:hover:border-slate-700 disabled:cursor-not-allowed"
                                                                >
                                                                    {isDownloadingPdf === inv.id ? (
                                                                        <RefreshCw size={12} className="animate-spin" />
                                                                    ) : (
                                                                        <Download size={12} />
                                                                    )}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleResetGibStatus(inv)}
                                                                    title="GİB Durumunu Sıfırla (Yeniden Göndermek İçin)"
                                                                    className="p-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/30 rounded-lg transition"
                                                                >
                                                                    <RefreshCw size={12} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => handleOpenSendModal(inv)}
                                                                    disabled={isSending}
                                                                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50"
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
                                                                    className="p-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 border border-slate-700 hover:border-emerald-500/30 rounded-lg transition"
                                                                >
                                                                    <CheckCircle size={12} />
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
                    )}
                </div>
            )}

            {/* Settings Tab */}
            {activeSubTab === 'settings' && (
                <div className="glass-panel p-6 space-y-6">
                    <div>
                        <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center">
                            <Key className="mr-2 text-orange-500" size={20} />
                            GİB Portal Giriş Bilgileri
                        </h4>
                        
                        <form onSubmit={handleSaveSettings} className="max-w-xl space-y-5">
                            <div className="bg-orange-500/10 border border-orange-500/20 text-orange-400 p-4 rounded-xl text-xs space-y-1">
                                <span className="font-bold flex items-center gap-1 mb-1">
                                    <HelpCircle size={14} /> Önemli Bilgilendirme
                                </span>
                                <p>GİB e-Arşiv şifreniz İnteraktif Vergi Dairesi (İVD) giriş şifrenizdir. Bu bilgiler SSL ile korunmakta ve fatura taslağı oluşturmak haricinde hiçbir amaçla kullanılmamaktadır.</p>
                                <p className="mt-1 font-semibold">Lütfen canlı ortamda resmi fatura kesmeden önce **Test Modu**'nu aktif ederek deneme yapın.</p>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                                    Kullanıcı Kodu (VKN / TCKN)
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={gibUsername}
                                    onChange={(e) => setGibUsername(e.target.value)}
                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 text-sm focus:border-orange-500 outline-none"
                                    placeholder="GİB Kullanıcı Kodunuz veya VKN/TCKN"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                                    GİB Portal Şifresi
                                </label>
                                <input
                                    type="password"
                                    required
                                    value={gibPassword}
                                    onChange={(e) => setGibPassword(e.target.value)}
                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 text-sm focus:border-orange-500 outline-none"
                                    placeholder="GİB / İnteraktif Vergi Dairesi Şifreniz"
                                />
                            </div>

                            {/* Test Mode Switcher */}
                            <div className="flex items-center justify-between p-4 bg-slate-900/30 border border-[var(--border-color)] rounded-xl">
                                <div className="space-y-0.5">
                                    <div className="text-sm font-semibold text-[var(--text-primary)]">GİB Test Portalı Modu</div>
                                    <div className="text-xs text-[var(--text-secondary)]">Açık olduğunda earsivportaltest.efatura.gov.tr üzerinde işlem yapar (Resmi fatura kesilmez).</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setGibTestMode(!gibTestMode)}
                                    className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 outline-none flex items-center ${
                                        gibTestMode ? 'bg-orange-500' : 'bg-slate-800 border border-[var(--border-color)]'
                                    }`}
                                >
                                    <div
                                        className={`w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200 ${
                                            gibTestMode ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            {/* PREFERRED DEFAULTS SECTION */}
                            <div className="border-t border-[var(--border-color)] pt-6 mt-6">
                                <h4 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center">
                                    <Settings className="mr-2 text-orange-500" size={18} />
                                    Varsayılan Fatura Tercihleri
                                </h4>
                                
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Varsayılan Fatura Tipi
                                            </label>
                                            <select
                                                value={defaultInvoiceType}
                                                onChange={(e) => setDefaultInvoiceType(e.target.value)}
                                                className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none"
                                            >
                                                <option value="SATIS">SATIŞ FATURASI</option>
                                                <option value="TEVKIFAT">TEVKİFATLI FATURA</option>
                                                <option value="ISTISNA">İSTİSNA (KDV MUAFİYETLİ)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Varsayılan KDV Oranı
                                            </label>
                                            <select
                                                value={defaultVatRate}
                                                onChange={(e) => setDefaultVatRate(Number(e.target.value))}
                                                className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none"
                                            >
                                                <option value={20}>%20</option>
                                                <option value={10}>%10</option>
                                                <option value={0}>%0</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Hesaplama Türü
                                            </label>
                                            <div className="flex gap-2 mt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setDefaultIsVatIncluded(false)}
                                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition ${
                                                        !defaultIsVatIncluded 
                                                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' 
                                                            : 'bg-transparent text-slate-400 border-[var(--border-color)]'
                                                    }`}
                                                >
                                                    KDV Hariç
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDefaultIsVatIncluded(true)}
                                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition ${
                                                        defaultIsVatIncluded 
                                                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' 
                                                            : 'bg-transparent text-slate-400 border-[var(--border-color)]'
                                                    }`}
                                                >
                                                    KDV Dahil
                                                </button>
                                            </div>
                                        </div>

                                        {defaultInvoiceType === 'TEVKIFAT' && (
                                            <div>
                                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                    Varsayılan Tevkifat Kodu
                                                </label>
                                                <select
                                                    value={defaultTevkifatKodu}
                                                    onChange={(e) => setDefaultTevkifatKodu(e.target.value)}
                                                    className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none"
                                                >
                                                    {TEVKIFAT_CODES.map(t => (
                                                        <option key={t.code} value={t.code}>{t.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {defaultInvoiceType === 'ISTISNA' && (
                                            <div>
                                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                    Varsayılan Muafiyet Kodu
                                                </label>
                                                <select
                                                    value={defaultKdvMuafiyetKodu}
                                                    onChange={(e) => setDefaultKdvMuafiyetKodu(e.target.value)}
                                                    className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none"
                                                >
                                                    {EXEMPTION_CODES.map(e => (
                                                        <option key={e.code} value={e.code}>{e.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    {defaultInvoiceType === 'ISTISNA' && (
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Varsayılan Muafiyet Nedeni Açıklaması
                                            </label>
                                            <input
                                                type="text"
                                                value={defaultKdvMuafiyetNedeni}
                                                onChange={(e) => setDefaultKdvMuafiyetNedeni(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="Örn: 306/1-a Maddesi Kapsamında Uluslararası Nakliye..."
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* DEFAULT IBAN INFORMATION SECTION */}
                            <div className="border-t border-[var(--border-color)] pt-6 mt-6">
                                <h4 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center">
                                    <FileText className="mr-2 text-orange-500" size={18} />
                                    Fatura Notuna Eklenecek Bilgiler (İBAN & İsim)
                                </h4>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Banka İBAN Numarası
                                            </label>
                                            <input
                                                type="text"
                                                value={defaultIban}
                                                onChange={(e) => setDefaultIban(e.target.value)}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="Örn: TR86 0004 ..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                İBAN Adı Soyadı / Unvan
                                            </label>
                                            <input
                                                type="text"
                                                value={defaultIbanName}
                                                onChange={(e) => setDefaultIbanName(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="Örn: AHMET YILMAZ veya ŞİRKET UNVANI"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-[var(--text-secondary)]">
                                        Bu alanları doldurursanız, fatura oluşturulurken açıklama (not) kısmının en altına otomatik olarak İBAN bilginiz eklenecektir.
                                    </p>
                                </div>
                            </div>

                            {/* DEFAULT BUYER INFORMATION SECTION */}
                            <div className="border-t border-[var(--border-color)] pt-6 mt-6">
                                <h4 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center">
                                    <BookOpen className="mr-2 text-orange-500" size={18} />
                                    Varsayılan Alıcı (Müşteri) Bilgileri
                                </h4>
                                
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Varsayılan Alıcı TCKN / VKN
                                            </label>
                                            <input
                                                type="text"
                                                maxLength={11}
                                                value={defaultBuyerVkn}
                                                onChange={(e) => setDefaultBuyerVkn(e.target.value.replace(/\s/g, ''))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="10 veya 11 haneli numara"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Varsayılan Alıcı Unvanı / Adı Soyadı
                                            </label>
                                            <input
                                                type="text"
                                                value={defaultBuyerTitle}
                                                onChange={(e) => setDefaultBuyerTitle(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="Şirket unvanı veya ad soyad"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Vergi Dairesi
                                            </label>
                                            <input
                                                type="text"
                                                value={defaultBuyerTaxOffice}
                                                onChange={(e) => setDefaultBuyerTaxOffice(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="Vergi Dairesi"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                İlçe / Mahalle
                                            </label>
                                            <input
                                                type="text"
                                                value={defaultBuyerDistrict}
                                                onChange={(e) => setDefaultBuyerDistrict(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="İlçe"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Şehir (İl)
                                            </label>
                                            <input
                                                type="text"
                                                value={defaultBuyerCity}
                                                onChange={(e) => setDefaultBuyerCity(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="Şehir"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                            Açık Adres
                                        </label>
                                        <textarea
                                            value={defaultBuyerAddress}
                                            onChange={(e) => setDefaultBuyerAddress(e.target.value.toLocaleUpperCase('tr-TR'))}
                                            rows={2}
                                            className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:border-orange-500 outline-none resize-none"
                                            placeholder="Detaylı adres..."
                                        />
                                    </div>
                                </div>
                            </div>

                            {settingsStatus.message && (
                                <div className={`flex items-center gap-2 text-sm p-3 rounded-md border ${
                                    settingsStatus.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                }`}>
                                    {settingsStatus.type === 'error' ? <AlertTriangle size={16}/> : <CheckCircle size={16}/>}
                                    {settingsStatus.message}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isSavingSettings}
                                className="w-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isSavingSettings ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin" />
                                        Kaydediliyor...
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} /> GİB Ayarlarını ve Tercihlerini Kaydet
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Force Logout Utility */}
                        <div className="border-t border-[var(--border-color)] pt-6 mt-6 max-w-xl">
                            <h4 className="text-sm font-bold text-[var(--text-primary)] mb-2 flex items-center">
                                <AlertTriangle className="mr-2 text-red-500" size={18} />
                                GİB Oturumu Zorla Kapat
                            </h4>
                            <p className="text-xs text-[var(--text-secondary)] mb-4">
                                Tarayıcınızda veya başka bir cihazda GİB portalı açık kaldığı için &quot;Birden fazla giriş yapamazsınız&quot; hatası alıyorsanız, GİB sunucularındaki oturumunuzu buradan zorla sonlandırabilirsiniz.
                            </p>

                            {forceLogoutStatus && (
                                <div className={`flex items-start gap-2 text-sm p-3 rounded-lg border mb-4 ${
                                    forceLogoutStatus.type === 'success'
                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                                }`}>
                                    {forceLogoutStatus.type === 'success'
                                        ? <CheckCircle size={16} className="shrink-0 mt-0.5" />
                                        : <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                                    }
                                    <span>{forceLogoutStatus.message}</span>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={handleForceGibLogout}
                                disabled={isForceLoggingOut}
                                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isForceLoggingOut ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin" />
                                        Oturum Sonlandırılıyor...
                                    </>
                                ) : (
                                    <>
                                        GİB Aktif Oturumunu Sonlandır
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {smsModalOpen && smsTargetInvoice && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#0b1120] border border-emerald-500/30 rounded-2xl shadow-2xl p-6 w-full max-w-md animate-in zoom-in-95 duration-200">
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
                                    className="w-full text-center tracking-[0.5em] font-mono text-2xl bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 focus:border-emerald-500 outline-none"
                                />
                            </div>
                            
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => { setSmsModalOpen(false); setSmsCode(''); }}
                                    className="flex-1 px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
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

            {/* SENDING MODAL OVERLAY */}
            {isModalOpen && selectedInvoice && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
                    <div className="glass-panel w-full max-w-3xl max-h-[95vh] overflow-hidden shadow-2xl grid grid-rows-[auto_minmax(0,1fr)]">
                        {/* Header */}
                        <div className="p-5 sm:p-6 border-b border-[var(--border-color)] flex items-center justify-between bg-slate-900/40 shrink-0">
                            <div className="flex items-center gap-2">
                                <FileText className="text-orange-500" size={20} />
                                <span className="font-bold text-md text-[var(--text-primary)] font-mono">
                                    GİB Taslak Hazırla - {modalStep === 1 ? "1. Adım: Bilgileri Kontrol Et" : "2. Adım: Güzergahlar ve Fiyatlar"} ({selectedInvoice.docId || selectedInvoice.id})
                                </span>
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-200 p-1 bg-[var(--bg-panel-hover)] rounded-md transition"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Step 1 Form */}
                        {modalStep === 1 && (
                            <form onSubmit={(e) => { e.preventDefault(); handleNextStep(); }} className="grid grid-rows-[minmax(0,1fr)_auto] overflow-hidden h-full">
                                <div className="overflow-y-auto p-5 space-y-3 custom-scrollbar">
                                    {/* Invoice Type and Calculation Type */}
                                    <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_0.8fr_1.2fr] gap-4 bg-slate-900/20 p-4 border border-[var(--border-color)] rounded-xl">
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Fatura Tarihi
                                            </label>
                                            <CustomDatePicker
                                                value={invoiceDate}
                                                onChange={setInvoiceDate}
                                                className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-xs focus:border-orange-500 outline-none uppercase"
                                                placeholder="Tarih Seçin"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Fatura Tipi
                                            </label>
                                            <select
                                                value={invoiceType}
                                                onChange={(e) => setInvoiceType(e.target.value)}
                                                className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-1.5 text-xs focus:border-orange-500 outline-none"
                                            >
                                                <option value="SATIS">SATIŞ</option>
                                                <option value="TEVKIFAT">TEVKİFAT</option>
                                                <option value="ISTISNA">İSTİSNA</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                KDV Oranı
                                            </label>
                                            <select
                                                value={vatRate}
                                                onChange={(e) => setVatRate(Number(e.target.value))}
                                                className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-1.5 text-xs focus:border-orange-500 outline-none"
                                            >
                                                <option value={20}>%20</option>
                                                <option value={10}>%10</option>
                                                <option value={0}>%0</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Hesaplama Türü
                                            </label>
                                            <div className="flex gap-2 mt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsVatIncluded(false)}
                                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition ${
                                                        !isVatIncluded
                                                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                                                            : 'bg-transparent text-slate-400 border-[var(--border-color)]'
                                                    }`}
                                                >
                                                    KDV Hariç
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsVatIncluded(true)}
                                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition ${
                                                        isVatIncluded
                                                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                                                            : 'bg-transparent text-slate-400 border-[var(--border-color)]'
                                                    }`}
                                                >
                                                    KDV Dahil
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {isVatIncluded && (
                                        <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-start gap-2">
                                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                            <span>
                                                <strong>Dikkat:</strong> Asıl kullanılması gereken yöntem <strong>KDV Hariç</strong> hesaplamadır. KDV Dahil seçildiğinde girdiğiniz birim fiyatların KDV eklenmiş son tutarlar olduğunu onaylamış olursunuz.
                                            </span>
                                        </div>
                                    )}

                                    {/* Conditionally render Tevkifat parameters */}
                                    {invoiceType === 'TEVKIFAT' && (
                                        <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-2">
                                            <label className="block text-xs font-semibold text-indigo-400">
                                                Tevkifat Kodu ve Oranı
                                            </label>
                                            <select
                                                value={tevkifatKodu}
                                                onChange={(e) => setTevkifatKodu(e.target.value)}
                                                className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none"
                                            >
                                                {TEVKIFAT_CODES.map(t => (
                                                    <option key={t.code} value={t.code}>{t.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Conditionally render Exemption parameters */}
                                    {invoiceType === 'ISTISNA' && (
                                        <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl space-y-3">
                                            <div>
                                                <label className="block text-xs font-semibold text-orange-400 mb-1">
                                                    KDV İstisna Kodu
                                                </label>
                                                <select
                                                    value={kdvMuafiyetKodu}
                                                    onChange={(e) => setKdvMuafiyetKodu(e.target.value)}
                                                    className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none"
                                                >
                                                    {EXEMPTION_CODES.map(e => (
                                                        <option key={e.code} value={e.code}>{e.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-orange-400 mb-1">
                                                    KDV İstisna Nedeni Açıklaması
                                                </label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={kdvMuafiyetNedeni}
                                                    onChange={(e) => setKdvMuafiyetNedeni(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                    className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none"
                                                    placeholder="Örn: 306/1-a Maddesi Kapsamında Uluslararası Nakliye..."
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Client VKN and Title */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                                                    Alıcı TCKN / VKN *
                                                </label>
                                                {Object.keys(gibClients || {}).length > 0 && (
                                                    <select
                                                        onChange={(e) => {
                                                            if (e.target.value) {
                                                                handleVknChange(e.target.value);
                                                            }
                                                        }}
                                                        className="text-[10px] bg-slate-950 border border-[var(--border-color)] text-orange-400 rounded px-1.5 py-0.5 outline-none max-w-[180px] font-medium"
                                                        defaultValue=""
                                                    >
                                                        <option value="" disabled>Kayıtlı Müşteri Seç</option>
                                                        {Object.values(gibClients).map(c => (
                                                            <option key={c.vkn} value={c.vkn}>
                                                                {c.title.length > 20 ? c.title.substring(0, 18) + '...' : c.title}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    required
                                                    maxLength={11}
                                                    value={buyerVkn}
                                                    onChange={(e) => handleVknChange(e.target.value)}
                                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg pl-9 pr-4 py-2 text-sm focus:border-orange-500 outline-none font-mono"
                                                    placeholder="11 haneli TCKN veya 10 haneli VKN"
                                                />
                                                <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                                            </div>
                                            {buyerVkn && gibClients[buyerVkn] && (
                                                <span className="text-[10px] text-emerald-400 mt-1 block">
                                                    ✓ Kayıtlı müşteri bilgileri otomatik dolduruldu.
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Alıcı Unvanı / Adı Soyadı
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={buyerTitle}
                                                onChange={(e) => setBuyerTitle(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none"
                                                placeholder="Şirket unvanı veya şahıs adı soyadı"
                                            />
                                        </div>
                                    </div>

                                    {/* Tax Office, City, District */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="md:col-span-1">
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Vergi Dairesi
                                            </label>
                                            <input
                                                type="text"
                                                value={buyerTaxOffice}
                                                onChange={(e) => setBuyerTaxOffice(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none"
                                                placeholder="Vergi Dairesi adı"
                                            />
                                        </div>
                                        <div className="md:col-span-1">
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                İlçe / Mahalle
                                            </label>
                                            <input
                                                type="text"
                                                value={buyerDistrict}
                                                onChange={(e) => setBuyerDistrict(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none"
                                                placeholder="İlçe veya mahalle"
                                            />
                                        </div>
                                        <div className="md:col-span-1">
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Şehir (İl)
                                            </label>
                                            <input
                                                type="text"
                                                value={buyerCity}
                                                onChange={(e) => setBuyerCity(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none"
                                                placeholder="Şehir"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                            Açık Adres
                                        </label>
                                        <textarea
                                            value={buyerAddress}
                                            onChange={(e) => setBuyerAddress(e.target.value.toLocaleUpperCase('tr-TR'))}
                                            rows={2}
                                            className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none resize-none"
                                            placeholder="Sokak, bulvar, apartman no ve detaylı adres..."
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                            Fatura Notu
                                        </label>
                                        <textarea
                                            value={invoiceNote}
                                            onChange={(e) => setInvoiceNote(e.target.value)}
                                            rows={2}
                                            className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none resize-none font-mono"
                                            placeholder="Faturaya eklenecek notlar..."
                                        />
                                    </div>
                                </div>

                                {/* Footer Buttons inside Modal - Step 1 */}
                                <div className="p-5 sm:p-6 border-t border-[var(--border-color)] flex gap-3 bg-slate-900/20 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="flex-1 bg-[var(--bg-panel-hover)] hover:bg-[var(--bg-panel-hover)]/80 text-[var(--text-secondary)] border border-[var(--border-color)] py-2.5 rounded-lg text-sm font-semibold transition"
                                    >
                                        Vazgeç
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
                                    >
                                        Onayla ve Devam Et
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Step 2 Form */}
                        {modalStep === 2 && (
                            <form onSubmit={handleSendInvoiceSubmit} className="grid grid-rows-[minmax(0,1fr)_auto] overflow-hidden h-full">
                                <div className="overflow-y-auto p-6 space-y-4 custom-scrollbar">
                                    <div className="overflow-x-auto border border-[var(--border-color)] rounded-xl">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-slate-950/20 text-[var(--text-secondary)] uppercase border-b border-[var(--border-color)]">
                                                    <th className="p-3 font-semibold">Hizmet Adı / Açıklama</th>
                                                    <th className="p-3 font-semibold text-right">Miktar (Ton)</th>
                                                    <th className="p-3 font-semibold text-right">Birim Fiyat (TL)</th>
                                                    <th className="p-3 font-semibold text-right">Tutar (Matrah)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[var(--border-color)]">
                                                {routeLines.map((line, idx) => (
                                                    <tr key={idx} className="hover:bg-white/[0.01]">
                                                        <td className="p-2 min-w-[320px]">
                                                            <input
                                                                type="text"
                                                                required
                                                                value={line.name}
                                                                onChange={(e) => handleLineChange(idx, 'name', e.target.value)}
                                                                className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-2 py-1.5 text-xs focus:border-orange-500 outline-none uppercase"
                                                            />
                                                        </td>
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                step="0.001"
                                                                required
                                                                value={line.quantity || ''}
                                                                onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                                                                className="w-24 bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-2 py-1.5 text-xs focus:border-orange-500 outline-none text-right font-mono"
                                                                placeholder="0.00"
                                                            />
                                                        </td>
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                required
                                                                value={line.unitPrice || ''}
                                                                onChange={(e) => handleLineChange(idx, 'unitPrice', e.target.value)}
                                                                className="w-24 bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-2 py-1.5 text-xs focus:border-orange-500 outline-none text-right font-mono"
                                                                placeholder="0.00"
                                                            />
                                                        </td>
                                                        <td className="p-2 text-right text-emerald-400 font-bold font-mono whitespace-nowrap">
                                                            {line.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Dynamic calculations summary card */}
                                    <div className="bg-slate-900/30 p-4 border border-[var(--border-color)] rounded-xl space-y-2 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-[var(--text-secondary)]">Mal Hizmet Toplam Tutarı:</span>
                                            <span className="font-bold text-[var(--text-primary)]">{totals.base.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[var(--text-secondary)]">Hesaplanan KDV (%{vatRate}):</span>
                                            <span className="font-bold text-[var(--text-primary)]">{totals.vat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                        </div>
                                        
                                        {invoiceType === 'TEVKIFAT' && (
                                            <>
                                                <div className="flex justify-between border-t border-[var(--border-color)]/30 pt-1.5 text-indigo-400">
                                                    <span>Hesaplanan KDV Tevkifatı (%{TEVKIFAT_CODES.find(t => t.code === tevkifatKodu)?.rate}%):</span>
                                                    <span className="font-bold">{totals.vatOfTax.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                                </div>
                                                <div className="flex justify-between text-slate-400">
                                                    <span>Tevkifata Tabi İşlem Tutarı:</span>
                                                    <span className="font-semibold">{totals.base.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                                </div>
                                                <div className="flex justify-between text-slate-400">
                                                    <span>Tevkifata Tabi İşlem Üzerinden Hes. KDV:</span>
                                                    <span className="font-semibold">{totals.vat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                                </div>
                                            </>
                                        )}
                                        
                                        <div className="flex justify-between border-t border-[var(--border-color)] pt-2">
                                            <span className="text-[var(--text-secondary)]">Vergiler Dahil Toplam Tutar:</span>
                                            <span className="font-bold text-[var(--text-primary)]">{totals.withTaxes.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                        </div>
                                        <div className="flex justify-between border-t-2 border-orange-500/30 pt-2 text-sm text-orange-400">
                                            <span className="font-bold">Ödenecek Tutar:</span>
                                            <span className="font-black text-md">{totals.payment.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer buttons inside Step 2 */}
                                <div className="p-6 border-t border-[var(--border-color)] flex gap-3 bg-slate-900/20 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setModalStep(1)}
                                        className="flex-1 bg-[var(--bg-panel-hover)] hover:bg-[var(--bg-panel-hover)]/80 text-[var(--text-secondary)] border border-[var(--border-color)] py-2.5 rounded-lg text-sm font-semibold transition"
                                    >
                                        Geri Dön
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={sendingInvoiceId === selectedInvoice.id}
                                        className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
                                    >
                                        {sendingInvoiceId === selectedInvoice.id ? (
                                            <>
                                                <RefreshCw size={14} className="animate-spin" />
                                                Gönderiliyor...
                                            </>
                                        ) : (
                                            <>
                                                <Send size={14} /> GİB Taslak Hazırla
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>

        {/* Manuel PDF / Belge Yönetimi Modalı */}
        {pdfModalInvoice && createPortal(
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setPdfModalInvoice(null)}>
                <div className="bg-[#0f1117] rounded-2xl border border-orange-500/20 shadow-2xl shadow-orange-900/20 w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center px-5 py-4 border-b border-white/5">
                        <h3 className="font-bold flex items-center gap-2.5 text-[var(--text-primary)]">
                            <span className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center flex-shrink-0">
                                <FileText size={14} className="text-orange-400" />
                            </span>
                            <span>{pdfModalInvoice.docId || pdfModalInvoice.id} <span className="text-slate-500 font-normal">— E-Arşiv / Belge Yönetimi</span></span>
                        </h3>
                        <button onClick={() => setPdfModalInvoice(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all text-lg">&times;</button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div>
                            <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                                <Paperclip size={12} className="text-orange-400" /> E-Arşiv Fatura PDF'i / Belge Yükle
                            </p>
                            <FileUpload files={modalFiles} onChange={setModalFiles} maxSizeMB={10} />
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 mb-1.5">Fatura Notu (Opsiyonel)</p>
                            <textarea
                                value={modalNote}
                                onChange={(e) => setModalNote(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 focus:border-orange-500/40 rounded-lg p-3 text-sm text-[var(--text-primary)] placeholder-slate-600 outline-none min-h-[80px] resize-none transition-colors"
                                placeholder="Not ekle... (örn: GİB'den manuel kesildi, onay belgesi eklendi vb.)"
                            />
                        </div>
                    </div>
                    <div className="px-5 py-4 border-t border-white/5 flex justify-end gap-3">
                        <button
                            onClick={() => setPdfModalInvoice(null)}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
                        >
                            İptal
                        </button>
                        <button
                            onClick={handleSaveManualFiles}
                            disabled={isSavingPdf}
                            className="px-5 py-2 rounded-lg text-sm font-semibold bg-orange-600 hover:bg-orange-500 text-white transition-colors shadow-lg shadow-orange-900/40 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
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

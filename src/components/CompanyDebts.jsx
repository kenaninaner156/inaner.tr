import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
    Landmark, 
    CreditCard, 
    Coins, 
    Plus, 
    Lock, 
    Unlock, 
    Calendar, 
    TrendingDown, 
    TrendingUp, 
    CheckCircle2, 
    AlertCircle, 
    Clock, 
    History,
    Minus,
    Trash2, 
    Pencil, 
    X, 
    Check, 
    RefreshCw, 
    ChevronDown, 
    ChevronUp, 
    ChevronLeft,
    ChevronRight,
    DollarSign, 
    Truck, 
    User, 
    Building2, 
    ScrollText,
    Menu, 
    Sparkles, 
    FileText, 
    ExternalLink,
    HelpCircle,
    ArrowRight,
    RotateCcw,
    Paperclip
} from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { useCompany } from '../context/CompanyContext';
import { useTruck } from '../context/TruckContext';
import { DataContext } from '../context/DataContext';
import PinLockOverlay from './PinLockOverlay';
import CustomDatePicker from './CustomDatePicker';
import CustomSelect from './CustomSelect';
import FileUpload from './FileUpload';
import { uploadToCloudinary } from '../services/cloudinaryService';
import { 
    fetchLiveRates, 
    getStoredRates, 
    getEffectiveRates, 
    calculateTryEquivalent, 
    GOLD_PURITY 
} from '../services/currencyService';

const LOAN_TYPES = [
    { id: 'bireysel', label: 'Bireysel Kredi', icon: User },
    { id: 'ticari', label: 'Ticari Kredi', icon: Building2 },
    { id: 'tasit', label: 'Taşıt Kredisi', icon: Truck },
    { id: 'senet', label: 'Senetli Borç / Senet', icon: ScrollText },
];

const CURRENCY_TYPES = [
    { id: 'TL', label: 'Türk Lirası (₺)', symbol: '₺', group: 'Nakit' },
    { id: 'USD', label: 'Amerikan Doları ($)', symbol: '$', group: 'Döviz' },
    { id: 'EUR', label: 'Euro (€)', symbol: '€', group: 'Döviz' },
    { id: 'GOLD_GRAM_24', label: 'Gram Altın (24 Ayar Has)', symbol: 'gr', group: 'Altın' },
    { id: 'GOLD_BILEZIK_22', label: '22 Ayar Bilezik (Gram)', symbol: 'gr', group: 'Altın' },
    { id: 'GOLD_14', label: '14 Ayar Hurda / Takı (Gram)', symbol: 'gr', group: 'Altın' },
    { id: 'GOLD_CEYREK', label: 'Çeyrek Altın (Adet)', symbol: 'adet', group: 'Ziynet' },
    { id: 'GOLD_YARIM', label: 'Yarım Altın (Adet)', symbol: 'adet', group: 'Ziynet' },
    { id: 'GOLD_TAM', label: 'Tam / Ziynet Altın (Adet)', symbol: 'adet', group: 'Ziynet' },
    { id: 'GOLD_ATA', label: 'Cumhuriyet / Ata Altın (Adet)', symbol: 'adet', group: 'Ziynet' },
];

const getCurrencyMeta = (currencyId) => {
    const cur = CURRENCY_TYPES.find(c => c.id === currencyId) || CURRENCY_TYPES[0];
    if (cur.id === 'TL') {
        return { label: 'Borç Tutarı (TL)', placeholder: '', suffix: '₺' };
    }
    if (cur.id === 'USD') {
        return { label: 'Borç Tutarı (USD)', placeholder: '', suffix: '$' };
    }
    if (cur.id === 'EUR') {
        return { label: 'Borç Tutarı (EUR)', placeholder: '', suffix: '€' };
    }
    if (cur.symbol === 'gr') {
        const shortName = cur.label.split('(')[0].trim();
        return { label: `Miktar (${shortName})`, placeholder: '', suffix: 'gr' };
    }
    if (cur.symbol === 'adet') {
        const shortName = cur.label.split('(')[0].trim();
        return { label: `Miktar (${shortName})`, placeholder: '', suffix: 'Adet' };
    }
    return { label: 'Borç Miktarı', placeholder: '', suffix: cur.symbol || '' };
};

const formatDebtAge = (dateStr) => {
    if (!dateStr) return '';
    try {
        const debtDate = new Date(dateStr);
        if (isNaN(debtDate.getTime())) return '';
        const now = new Date();
        const d1 = new Date(debtDate.getFullYear(), debtDate.getMonth(), debtDate.getDate());
        const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffMs = d2 - d1;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) return 'Bugün alındı';
        if (diffDays < 30) return `${diffDays} gündür borçlu`;
        
        const months = Math.floor(diffDays / 30.4375);
        const remDays = Math.floor(diffDays % 30.4375);
        if (diffDays < 365) {
            if (remDays === 0) return `${months} aydır borçlu`;
            return `${months} ay ${remDays} gündür borçlu`;
        }
        const years = Math.floor(diffDays / 365.25);
        const remMonths = Math.floor((diffDays % 365.25) / 30.4375);
        if (remMonths === 0) return `${years} yıldır borçlu`;
        return `${years} yıl ${remMonths} aydır borçlu`;
    } catch {
        return '';
    }
};

const formatTurkishDate = (dateStr) => {
    if (!dateStr) return '';
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}.${parts[1]}.${parts[0]}`;
        }
        return dateStr;
    } catch {
        return dateStr;
    }
};

const openAttachment = (f) => {
    if (!f) return;
    const url = f.data || f.url;
    if (!url) return;
    if ((f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf')) && url.startsWith('data:')) {
        try {
            const byteStr = atob(url.split(',')[1]);
            const arr = new Uint8Array(byteStr.length);
            for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
            const blob = new Blob([arr], { type: 'application/pdf' });
            window.open(URL.createObjectURL(blob));
            return;
        } catch (e) {
            console.error("PDF açılamadı:", e);
        }
    }
    window.open(url, '_blank');
};

const processSelectedFiles = async (fileList, maxSizeMB = 5) => {
    const files = Array.from(fileList || []);
    const maxBytes = maxSizeMB * 1024 * 1024;
    const processed = [];

    for (const file of files) {
        if (file.size > maxBytes) {
            alert(`"${file.name}" dosyası ${maxSizeMB}MB sınırını aşıyor.`);
            continue;
        }
        const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');
        try {
            let dataUrl;
            if (isPdf) {
                dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            } else {
                try {
                    const result = await uploadToCloudinary(file);
                    dataUrl = result.url;
                } catch {
                    dataUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                }
            }
            processed.push({
                id: Date.now() + Math.random(),
                name: file.name,
                type: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
                size: file.size,
                data: dataUrl
            });
        } catch (err) {
            console.error("Dosya işlenemedi:", err);
            alert(`"${file.name}" dosyası yüklenemedi.`);
        }
    }
    return processed;
};

const CompanyDebts = ({ onOpenMenu, isMobile } = {}) => {
    const { activeCompanyId, companyData } = useCompany();
    const { trucks = [] } = useTruck();

    // ─── 1. GÜVENLİK & KİLİT MEKANİZMASI (ŞİFRE GİRİLENE KADAR VERİ ASLA YÜKLENMEZ) ───
    const [isUnlocked, setIsUnlocked] = useState(() => {
        // Sayfa yenilenmesinde güvenlik gereği her zaman kilitli başlasın
        return false;
    });

    // Kasa Verileri (Sadece PIN doğru girilince Firestore'dan anlık dinlenir)
    const [loans, setLoans] = useState([]);
    const [openDebts, setOpenDebts] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(false);

    // Aktif Alt Sekme ('loans' = Krediler, 'open_debts' = Vadesiz Borçlar)
    const [activeSubTab, setActiveSubTab] = useState('loans');

    // Döviz & Altın Kurları
    const [marketRates, setMarketRates] = useState(() => getStoredRates());
    const [isRefreshingRates, setIsRefreshingRates] = useState(false);

    // Canlı Kurları Hesapla
    const effectiveRates = useMemo(() => {
        return getEffectiveRates(marketRates);
    }, [marketRates]);

    // Formatlama Yardımcıları
    const formatMoney = (val, currency = '₺') => {
        const num = Number(val) || 0;
        const formatted = num.toLocaleString('tr-TR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
        if (currency === '₺') return `₺${formatted}`;
        if (currency === '$') return `$${formatted}`;
        if (currency === '€') return `€${formatted}`;
        return `${formatted} ${currency}`;
    };

    // Güvenli Kilitleme (Hafızayı anında temizler)
    const handleLock = () => {
        setIsUnlocked(false);
        setLoans([]);
        setOpenDebts([]);
    };

    // ─── FIRESTORE ANLIK DİNLEYİCİLERİ (SADECE KİLİT AÇIKKEN ÇALIŞIR) ───
    useEffect(() => {
        if (!isUnlocked || !activeCompanyId) {
            setLoans([]);
            setOpenDebts([]);
            return;
        }

        setIsLoadingData(true);
        const unsubs = [];

        // 1. Krediler Dinleyicisi
        const loansQuery = query(
            collection(db, 'loans'),
            where('companyId', '==', activeCompanyId)
        );
        unsubs.push(onSnapshot(loansQuery, (snapshot) => {
            const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
            // Tarihe göre sırala
            data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            setLoans(data);
            setIsLoadingData(false);
        }, (err) => {
            console.error("Krediler yüklenirken hata:", err);
            setIsLoadingData(false);
        }));

        // 2. Vadesiz Borçlar Dinleyicisi
        const debtsQuery = query(
            collection(db, 'open_debts'),
            where('companyId', '==', activeCompanyId)
        );
        unsubs.push(onSnapshot(debtsQuery, (snapshot) => {
            const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
            data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            setOpenDebts(data);
        }, (err) => {
            console.error("Vadesiz borçlar yüklenirken hata:", err);
        }));

        return () => {
            unsubs.forEach(unsub => unsub());
        };
    }, [isUnlocked, activeCompanyId]);

    // Kurları Yenile
    const handleRefreshRates = async () => {
        setIsRefreshingRates(true);
        try {
            const newRates = await fetchLiveRates();
            setMarketRates(newRates);
        } catch (e) {
            console.error("Kurlar güncellenemedi:", e);
        } finally {
            setIsRefreshingRates(false);
        }
    };

    useEffect(() => {
        if (isUnlocked) {
            handleRefreshRates();
        }
    }, [isUnlocked]);

    // ─── 2. KREDİ YÖNETİMİ STATE & FORMLARI ───
    const [isLoanFormOpen, setIsLoanFormOpen] = useState(false);
    const [editingLoanId, setEditingLoanId] = useState(null);
    const [expandedLoanId, setExpandedLoanId] = useState(null);
    const [loanFormErrors, setLoanFormErrors] = useState({});

    const [loanForm, setLoanForm] = useState({
        bankName: '',
        loanTitle: '',
        loanType: 'bireysel',
        truckId: '',
        monthlyAmount: '',
        monthsCount: '',
        startDate: '',
        totalAmount: '',
        notes: '',
        files: []
    });

    const handleOpenNewLoan = () => {
        setEditingLoanId(null);
        setLoanFormErrors({});
        setLoanForm({
            bankName: '',
            loanTitle: '',
            loanType: 'bireysel',
            truckId: '',
            monthlyAmount: '',
            monthsCount: '',
            startDate: '',
            totalAmount: '',
            notes: '',
            files: []
        });
        setIsLoanFormOpen(true);
    };

    const handleOpenEditLoan = (loan) => {
        setEditingLoanId(loan.id);
        setLoanFormErrors({});
        setLoanForm({
            bankName: loan.bankName || '',
            loanTitle: loan.loanTitle || '',
            loanType: loan.loanType || 'bireysel',
            truckId: loan.truckId || '',
            monthlyAmount: loan.monthlyAmount ? String(loan.monthlyAmount) : '',
            monthsCount: loan.monthsCount ? String(loan.monthsCount) : (loan.installments ? String(loan.installments.length) : ''),
            startDate: loan.startDate || '',
            totalAmount: loan.totalAmount ? String(loan.totalAmount) : '',
            notes: loan.notes || '',
            files: loan.files || []
        });
        setIsLoanFormOpen(true);
    };

    const handleReopenLoan = async (loanId) => {
        if (!window.confirm("Bu krediyi yeniden 'Aktif' duruma getirmek istiyor musunuz?")) return;
        try {
            await updateDoc(doc(db, 'loans', loanId), {
                status: 'active',
                updatedAt: new Date().toISOString()
            });
        } catch (err) {
            console.error("Kredi aktif edilemedi:", err);
        }
    };

    // Otomatik Toplam Hesaplama (Aylık tutar veya ay sayısı değiştikçe)
    const handleMonthlyOrMonthsChange = (mAmount, mCount) => {
        const amt = parseFloat(mAmount) || 0;
        const count = parseInt(mCount) || 0;
        setLoanForm(prev => ({
            ...prev,
            monthlyAmount: mAmount,
            monthsCount: mCount,
            totalAmount: (amt > 0 && count > 0) ? String(amt * count) : ''
        }));
        setLoanFormErrors(prev => {
            const next = { ...prev };
            if (mAmount && parseFloat(mAmount) > 0) delete next.monthlyAmount;
            if (mCount && parseInt(mCount) > 0 && parseInt(mCount) <= 120) delete next.monthsCount;
            return next;
        });
    };

    // Kredi Ekle / Düzenle Kaydet
    const handleSaveLoan = async (e) => {
        e.preventDefault();
        const monthly = parseFloat(loanForm.monthlyAmount);
        const months = parseInt(loanForm.monthsCount);

        const errors = {};
        if (!loanForm.bankName.trim()) errors.bankName = true;
        if (!monthly || monthly <= 0) errors.monthlyAmount = true;
        if (!months || months < 1 || months > 120) errors.monthsCount = true;
        if (!loanForm.startDate) errors.startDate = true;

        if (Object.keys(errors).length > 0) {
            setLoanFormErrors(errors);
            return;
        }

        try {
            if (editingLoanId) {
                // Mevcut krediyi güncelle
                await updateDoc(doc(db, 'loans', editingLoanId), {
                    bankName: loanForm.bankName.trim(),
                    loanTitle: loanForm.loanTitle.trim(),
                    loanType: loanForm.loanType,
                    truckId: loanForm.loanType === 'tasit' ? loanForm.truckId : '',
                    monthlyAmount: monthly,
                    monthsCount: months,
                    startDate: loanForm.startDate,
                    totalAmount: parseFloat(loanForm.totalAmount) || (monthly * months),
                    notes: loanForm.notes || '',
                    files: loanForm.files || [],
                    updatedAt: new Date().toISOString()
                });
            } else {
                // YENİ KREDİ: Otomatik Taksit İtfa Tablosu Üretimi
                const installments = [];
                const startD = new Date(loanForm.startDate);

                for (let i = 0; i < months; i++) {
                    const dueD = new Date(startD.getFullYear(), startD.getMonth() + i, startD.getDate());
                    // Ay sonu taşmalarını düzelt
                    const yyyy = dueD.getFullYear();
                    const mm = String(dueD.getMonth() + 1).padStart(2, '0');
                    const dd = String(dueD.getDate()).padStart(2, '0');
                    const dueDateStr = `${yyyy}-${mm}-${dd}`;

                    installments.push({
                        no: i + 1,
                        dueDate: dueDateStr,
                        amount: monthly,
                        status: 'pending', // 'pending' | 'paid' | 'overdue' | 'early_closed'
                        paidDate: null,
                        paidAmount: null,
                        note: '',
                        files: []
                    });
                }

                await addDoc(collection(db, 'loans'), {
                    companyId: activeCompanyId,
                    bankName: loanForm.bankName.trim(),
                    loanTitle: loanForm.loanTitle.trim(),
                    loanType: loanForm.loanType,
                    truckId: loanForm.loanType === 'tasit' ? loanForm.truckId : '',
                    monthlyAmount: monthly,
                    monthsCount: months,
                    startDate: loanForm.startDate,
                    totalAmount: parseFloat(loanForm.totalAmount) || (monthly * months),
                    notes: loanForm.notes || '',
                    files: loanForm.files || [],
                    status: 'active', // 'active' | 'closed'
                    installments: installments,
                    createdAt: new Date().toISOString()
                });
            }

            setIsLoanFormOpen(false);
            setEditingLoanId(null);
            setLoanForm({
                bankName: '',
                loanTitle: '',
                loanType: 'bireysel',
                truckId: '',
                monthlyAmount: '',
                monthsCount: '',
                startDate: '',
                totalAmount: '',
                notes: '',
                files: []
            });
        } catch (err) {
            console.error("Kredi kaydedilirken hata:", err);
        }
    };

    // Taksit Ödeme / Düzenleme Modalı
    const [selectedInstallment, setSelectedInstallment] = useState(null); // { loanId, installment }
    const [payModalErrors, setPayModalErrors] = useState({});
    const [payModalForm, setPayModalForm] = useState({
        paidDate: new Date().toISOString().split('T')[0],
        paidAmount: '',
        note: '',
        files: []
    });

    const handleOpenPayModal = (loanId, inst) => {
        setSelectedInstallment({ loanId, inst });
        setPayModalErrors({});
        setPayModalForm({
            paidDate: inst.paidDate || new Date().toISOString().split('T')[0],
            paidAmount: inst.paidAmount !== null && inst.paidAmount !== undefined ? String(inst.paidAmount) : String(inst.amount),
            note: inst.note || '',
            files: inst.files || []
        });
    };

    // Taksiti "Ödendi" İşaretle
    const handleConfirmPayment = async (e) => {
        e.preventDefault();
        if (!selectedInstallment) return;

        const paidAmt = parseFloat(payModalForm.paidAmount);
        const errors = {};
        if (!paidAmt || paidAmt <= 0) errors.paidAmount = true;
        if (!payModalForm.paidDate) errors.paidDate = true;

        if (Object.keys(errors).length > 0) {
            setPayModalErrors(errors);
            return;
        }

        const { loanId, inst } = selectedInstallment;
        const targetLoan = loans.find(l => l.id === loanId);
        if (!targetLoan) return;

        const updatedInstallments = targetLoan.installments.map(item => {
            if (item.no === inst.no) {
                return {
                    ...item,
                    status: 'paid',
                    paidDate: payModalForm.paidDate,
                    paidAmount: paidAmt,
                    note: payModalForm.note.trim(),
                    files: payModalForm.files || []
                };
            }
            return item;
        });

        // Tüm taksitler ödendi mi kontrol et
        const allPaid = updatedInstallments.every(i => i.status === 'paid' || i.status === 'early_closed');

        try {
            await updateDoc(doc(db, 'loans', loanId), {
                installments: updatedInstallments,
                status: allPaid ? 'closed' : 'active',
                ...(allPaid ? { closedAt: new Date().toISOString() } : {}),
                updatedAt: new Date().toISOString()
            });
            setSelectedInstallment(null);
            setPayModalErrors({});
        } catch (err) {
            console.error("Taksit güncellenemedi:", err);
        }
    };

    // Taksit Ödemesini İptal Et (Geri Al)
    const handleCancelPayment = async (loanId, instNo) => {
        if (!window.confirm("Bu taksitin 'Ödendi' durumunu geri alıp bekliyor durumuna getirmek istediğinize emin misiniz?")) return;

        const targetLoan = loans.find(l => l.id === loanId);
        if (!targetLoan) return;

        const updatedInstallments = targetLoan.installments.map(item => {
            if (item.no === instNo) {
                return {
                    ...item,
                    status: 'pending',
                    paidDate: null,
                    paidAmount: null,
                    note: '',
                    files: []
                };
            }
            return item;
        });

        try {
            await updateDoc(doc(db, 'loans', loanId), {
                installments: updatedInstallments,
                status: 'active',
                updatedAt: new Date().toISOString()
            });
        } catch (err) {
            console.error("Taksit geri alınamadı:", err);
        }
    };

    // Kredi Taksitini Manuel Düzenleme (Tutar, Tarih, Not veya Dekont/Dosya Değiştirme)
    const [editingInstallmentItem, setEditingInstallmentItem] = useState(null); // { loanId, inst }
    const [editInstErrors, setEditInstErrors] = useState({});
    const [editInstForm, setEditInstForm] = useState({ dueDate: '', amount: '', note: '', files: [] });

    const handleOpenEditInstallment = (loanId, inst) => {
        setEditingInstallmentItem({ loanId, inst });
        setEditInstErrors({});
        setEditInstForm({
            dueDate: inst.dueDate,
            amount: String(inst.amount),
            note: inst.note || '',
            files: inst.files || []
        });
    };

    const handleSaveEditInstallment = async (e) => {
        e.preventDefault();
        if (!editingInstallmentItem) return;

        const newAmount = parseFloat(editInstForm.amount);
        const errors = {};
        if (!newAmount || newAmount <= 0) errors.amount = true;
        if (!editInstForm.dueDate) errors.dueDate = true;

        if (Object.keys(errors).length > 0) {
            setEditInstErrors(errors);
            return;
        }

        const { loanId, inst } = editingInstallmentItem;
        const targetLoan = loans.find(l => l.id === loanId);
        if (!targetLoan) return;

        const updatedInstallments = targetLoan.installments.map(item => {
            if (item.no === inst.no) {
                return {
                    ...item,
                    dueDate: editInstForm.dueDate,
                    amount: newAmount,
                    note: editInstForm.note.trim(),
                    files: editInstForm.files || []
                };
            }
            return item;
        });

        try {
            await updateDoc(doc(db, 'loans', loanId), {
                installments: updatedInstallments,
                updatedAt: new Date().toISOString()
            });
            setEditingInstallmentItem(null);
            setEditInstErrors({});
        } catch (err) {
            console.error("Taksit güncellenemedi:", err);
        }
    };

    // Krediyi Erken Kapatma (Kalan Tüm Taksitleri Erken Kapat)
    const handleCloseLoanEarly = async (loanId) => {
        if (!window.confirm("Bu kredinin kalan tüm taksitlerini topluca 'Erken Kapatıldı' olarak işaretlemek istiyor musunuz?")) return;

        const targetLoan = loans.find(l => l.id === loanId);
        if (!targetLoan) return;

        const todayStr = new Date().toISOString().split('T')[0];
        const updatedInstallments = targetLoan.installments.map(item => {
            if (item.status === 'pending') {
                return {
                    ...item,
                    status: 'early_closed',
                    paidDate: todayStr,
                    note: 'Erken kapatma ile ödendi'
                };
            }
            return item;
        });

        try {
            await updateDoc(doc(db, 'loans', loanId), {
                installments: updatedInstallments,
                status: 'closed',
                closedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        } catch (err) {
            console.error("Kredi erken kapatılamadı:", err);
        }
    };

    // Krediyi Sil
    const handleDeleteLoan = async (loanId, bankName) => {
        if (window.confirm(`"${bankName}" kredisini ve tüm taksit planını kalıcı olarak silmek istediğinizden emin misiniz?`)) {
            try {
                await deleteDoc(doc(db, 'loans', loanId));
            } catch (err) {
                console.error("Kredi silinemedi:", err);
            }
        }
    };

    // ─── 3. VADESİZ BORÇLAR STATE & FORMLARI ───
    const [isDebtFormOpen, setIsDebtFormOpen] = useState(false);
    const [editingDebtId, setEditingDebtId] = useState(null);
    const [debtFormErrors, setDebtFormErrors] = useState({});

    const [debtForm, setDebtForm] = useState({
        creditor: '',
        currency: 'TL',
        initialAmount: '',
        date: '',
        isVadesiz: true,
        dueDate: '',
        notes: '',
        goldCalcMode: 'total', // 'total' | 'pieces'
        pieceCount: '',
        pieceGram: '',
        files: []
    });

    // Dosya Seçim Refleri & İşleyicileri
    const debtFileInputRef = useRef(null);
    const payFileInputRef = useRef(null);
    const directDebtFileInputRef = useRef(null);
    const [directUploadDebtId, setDirectUploadDebtId] = useState(null);

    const handleDebtFileSelect = async (e) => {
        const selected = e.target.files;
        if (!selected || selected.length === 0) return;
        const newFiles = await processSelectedFiles(selected);
        if (newFiles.length > 0) {
            setDebtForm(prev => ({ ...prev, files: [...(prev.files || []), ...newFiles] }));
        }
        e.target.value = '';
    };

    const handlePayFileSelect = async (e) => {
        const selected = e.target.files;
        if (!selected || selected.length === 0) return;
        const newFiles = await processSelectedFiles(selected);
        if (newFiles.length > 0) {
            setPartialPayForm(prev => ({ ...prev, files: [...(prev.files || []), ...newFiles] }));
        }
        e.target.value = '';
    };

    const triggerDebtUpload = (debtId) => {
        setDirectUploadDebtId(debtId);
        setTimeout(() => directDebtFileInputRef.current?.click(), 50);
    };

    const handleDirectDebtFileSelect = async (e) => {
        const selected = e.target.files;
        if (!selected || selected.length === 0 || !directUploadDebtId) return;
        const targetDebt = openDebts.find(d => d.id === directUploadDebtId);
        if (!targetDebt) return;
        const newFiles = await processSelectedFiles(selected);
        if (newFiles.length > 0) {
            const updatedFiles = [...(targetDebt.files || []), ...newFiles];
            try {
                await updateDoc(doc(db, 'open_debts', directUploadDebtId), {
                    files: updatedFiles,
                    updatedAt: new Date().toISOString()
                });
                setOpenDocsDebtId(directUploadDebtId);
            } catch (err) {
                console.error("Belge eklenemedi:", err);
            }
        }
        e.target.value = '';
        setDirectUploadDebtId(null);
    };

    // Alacaklı kişi önerileri & Otomatik Tamamlama
    const creditorDropdownRef = useRef(null);
    const [isCreditorDropdownOpen, setIsCreditorDropdownOpen] = useState(false);

    // Dışarı tıklanınca dropdown kapat
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (creditorDropdownRef.current && !creditorDropdownRef.current.contains(event.target)) {
                setIsCreditorDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Daha önce kaydedilmiş benzersiz alacaklılar listesi (Sadece açık/kapanmamış borcu olanlar)
    const existingCreditors = useMemo(() => {
        const set = new Set();
        (openDebts || []).forEach(d => {
            const initialAmt = Number(d.initialAmount) || 0;
            const remainingAmt = d.remainingAmount !== undefined ? Number(d.remainingAmount) : initialAmt;
            const isSettled = d.status === 'settled' || remainingAmt <= 0;

            if (!isSettled && d.creditor && typeof d.creditor === 'string') {
                const trimmed = d.creditor.trim();
                if (trimmed) set.add(trimmed);
            }
        });
        (loans || []).forEach(l => {
            const insts = l.installments || [];
            const hasPending = insts.some(i => i.status === 'pending');
            if (l.loanType === 'senet' && hasPending && l.bankName && typeof l.bankName === 'string') {
                const trimmed = l.bankName.trim();
                if (trimmed) set.add(trimmed);
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
    }, [openDebts, loans]);

    // Filtrelenmiş öneriler
    const filteredCreditors = useMemo(() => {
        const q = (debtForm.creditor || '').trim().toLocaleLowerCase('tr');
        if (!q) return existingCreditors;
        return existingCreditors.filter(c => c.toLocaleLowerCase('tr').includes(q));
    }, [existingCreditors, debtForm.creditor]);

    const handleOpenNewDebt = () => {
        setEditingDebtId(null);
        setDebtFormErrors({});
        setIsCreditorDropdownOpen(false);
        setDebtForm({
            creditor: '',
            currency: 'TL',
            initialAmount: '',
            date: '',
            isVadesiz: true,
            dueDate: '',
            notes: '',
            goldCalcMode: 'total',
            pieceCount: '',
            pieceGram: '',
            files: []
        });
        setIsDebtFormOpen(true);
    };

    // Belirli bir alacaklıya hızlı yeni kalem ekleme
    const handleOpenNewDebtForCreditor = (creditorName) => {
        setEditingDebtId(null);
        setDebtFormErrors({});
        setIsCreditorDropdownOpen(false);
        setDebtForm({
            creditor: creditorName || '',
            currency: 'TL',
            initialAmount: '',
            date: '',
            isVadesiz: true,
            dueDate: '',
            notes: '',
            goldCalcMode: 'total',
            pieceCount: '',
            pieceGram: '',
            files: []
        });
        setIsDebtFormOpen(true);
    };

    // Mevcut bir borcu düzenleme
    const handleOpenEditDebt = (debt) => {
        setEditingDebtId(debt.id);
        setDebtFormErrors({});
        setIsCreditorDropdownOpen(false);
        setDebtForm({
            creditor: debt.creditor || '',
            currency: debt.currency || 'TL',
            initialAmount: String(debt.initialAmount || ''),
            date: debt.date || '',
            isVadesiz: !debt.dueDate,
            dueDate: debt.dueDate || '',
            notes: debt.notes || '',
            goldCalcMode: (debt.pieceCount && debt.pieceGram) ? 'pieces' : 'total',
            pieceCount: debt.pieceCount ? String(debt.pieceCount) : '',
            pieceGram: debt.pieceGram ? String(debt.pieceGram) : '',
            files: debt.files || []
        });
        setIsDebtFormOpen(true);
    };

    // Ödeme geçmişini kart üzerinde açıp kapatma
    const [expandedDebtHistoryId, setExpandedDebtHistoryId] = useState(null);
    const toggleDebtHistory = (debtId) => {
        setExpandedDebtHistoryId(prev => (prev === debtId ? null : debtId));
    };

    // Master-Detail Seçili Alacaklı & Mobil Görünüm State
    const [selectedCreditorKey, setSelectedCreditorKey] = useState(null);
    const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);

    // Mobil görünümde seçili alacaklının tüm borçları silinir/kapanırsa veya liste boşalırsa alacaklılar listesine geri dön
    useEffect(() => {
        if (isMobileDetailOpen && selectedCreditorKey) {
            const exists = groupedOpenDebts.some(g => g.key === selectedCreditorKey);
            if (!exists) {
                setIsMobileDetailOpen(false);
                setSelectedCreditorKey(null);
            }
        }
    }, [groupedOpenDebts, isMobileDetailOpen, selectedCreditorKey]);

    // Kart üzerinde ekli belgeleri açıp kapatma
    const [openDocsDebtId, setOpenDocsDebtId] = useState(null);
    const toggleDebtDocs = (debtId) => {
        setOpenDocsDebtId(prev => (prev === debtId ? null : debtId));
    };

    // Kart üzerinden ekli belge silme
    const handleDeleteDebtFile = async (debtId, fileIndex) => {
        if (!window.confirm("Bu belgeyi silmek istediğinizden emin misiniz?")) return;
        const target = openDebts.find(d => d.id === debtId);
        if (!target) return;
        const updatedFiles = (target.files || []).filter((_, i) => i !== fileIndex);
        try {
            await updateDoc(doc(db, 'open_debts', debtId), {
                files: updatedFiles,
                updatedAt: new Date().toISOString()
            });
        } catch (err) {
            console.error("Belge silinemedi:", err);
        }
    };

    // Kısmi Ödeme Modalı
    const [selectedDebtForPayment, setSelectedDebtForPayment] = useState(null);
    const [partialPayErrors, setPartialPayErrors] = useState({});
    const [partialPayForm, setPartialPayForm] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        note: '',
        files: []
    });

    // Vadesiz Borç Ekle / Düzenle
    const handleSaveOpenDebt = async (e) => {
        e.preventDefault();
        const amt = parseFloat(debtForm.initialAmount);

        const errors = {};
        if (!debtForm.creditor.trim()) errors.creditor = true;
        if (!amt || amt <= 0) errors.initialAmount = true;
        if (!debtForm.date) errors.date = true;
        if (!debtForm.isVadesiz && !debtForm.dueDate) errors.dueDate = true;

        if (Object.keys(errors).length > 0) {
            setDebtFormErrors(errors);
            return;
        }

        const effectiveDueDate = (!debtForm.isVadesiz && debtForm.dueDate) ? debtForm.dueDate : null;
        const isPiecesMode = debtForm.goldCalcMode === 'pieces' && debtForm.pieceCount && debtForm.pieceGram;
        const pieceCountVal = isPiecesMode ? Number(debtForm.pieceCount) : null;
        const pieceGramVal = isPiecesMode ? Number(debtForm.pieceGram) : null;

        try {
            if (editingDebtId) {
                const debt = openDebts.find(d => d.id === editingDebtId);
                let remaining = amt;
                if (debt && debt.payments && debt.payments.length > 0) {
                    const totalPaid = debt.payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
                    remaining = Math.max(0, amt - totalPaid);
                }
                const isSettled = remaining <= 0;

                await updateDoc(doc(db, 'open_debts', editingDebtId), {
                    creditor: debtForm.creditor.trim(),
                    currency: debtForm.currency,
                    initialAmount: amt,
                    remainingAmount: remaining,
                    pieceCount: pieceCountVal,
                    pieceGram: pieceGramVal,
                    status: isSettled ? 'settled' : 'active',
                    date: debtForm.date,
                    dueDate: effectiveDueDate,
                    notes: debtForm.notes.trim(),
                    files: debtForm.files || [],
                    updatedAt: new Date().toISOString()
                });
            } else {
                await addDoc(collection(db, 'open_debts'), {
                    companyId: activeCompanyId,
                    creditor: debtForm.creditor.trim(),
                    currency: debtForm.currency,
                    initialAmount: amt,
                    remainingAmount: amt,
                    pieceCount: pieceCountVal,
                    pieceGram: pieceGramVal,
                    payments: [], // [{ id, date, amount, note, files }]
                    date: debtForm.date,
                    dueDate: effectiveDueDate,
                    notes: debtForm.notes.trim(),
                    files: debtForm.files || [],
                    status: 'active', // 'active' | 'settled'
                    createdAt: new Date().toISOString()
                });
            }

            setIsDebtFormOpen(false);
            setEditingDebtId(null);
            setDebtFormErrors({});
            setDebtForm({
                creditor: '',
                currency: 'TL',
                initialAmount: '',
                date: '',
                isVadesiz: true,
                dueDate: '',
                notes: '',
                goldCalcMode: 'total',
                pieceCount: '',
                pieceGram: '',
                files: []
            });
        } catch (err) {
            console.error("Vadesiz borç kaydedilemedi:", err);
        }
    };

    // Vadesiz Borca Kısmi / Tam Ödeme Yap
    const handleAddPartialPayment = async (e) => {
        e.preventDefault();
        if (!selectedDebtForPayment) return;

        const payAmt = parseFloat(partialPayForm.amount);
        const errors = {};
        if (!payAmt || payAmt <= 0) errors.amount = true;
        if (!partialPayForm.date) errors.date = true;

        if (Object.keys(errors).length > 0) {
            setPartialPayErrors(errors);
            return;
        }

        const debt = openDebts.find(d => d.id === selectedDebtForPayment.id);
        if (!debt) return;

        const currentRemaining = debt.remainingAmount !== undefined ? debt.remainingAmount : debt.initialAmount;
        const newRemaining = Math.max(0, currentRemaining - payAmt);
        const isSettled = newRemaining === 0;

        const newPayment = {
            id: 'pay_' + Date.now().toString(36),
            amount: payAmt,
            date: partialPayForm.date,
            note: partialPayForm.note.trim(),
            files: partialPayForm.files || [],
            createdAt: new Date().toISOString()
        };

        const updatedPayments = [...(debt.payments || []), newPayment];

        try {
            await updateDoc(doc(db, 'open_debts', debt.id), {
                remainingAmount: newRemaining,
                payments: updatedPayments,
                status: isSettled ? 'settled' : 'active',
                updatedAt: new Date().toISOString()
            });

            setSelectedDebtForPayment(null);
            setPartialPayErrors({});
            setPartialPayForm({
                amount: '',
                date: new Date().toISOString().split('T')[0],
                note: '',
                files: []
            });
        } catch (err) {
            console.error("Ödeme kaydedilemedi:", err);
        }
    };

    // Vadesiz Borç Sil
    const handleDeleteOpenDebt = async (debtId, creditor) => {
        if (window.confirm(`"${creditor}" borç kaydını ve ödeme geçmişini silmek istediğinize emin misiniz?`)) {
            try {
                await deleteDoc(doc(db, 'open_debts', debtId));
            } catch (err) {
                console.error("Borç silinemedi:", err);
            }
        }
    };

    // ─── 4. FİNANSAL HESAPLAMALAR & KPI METRİKLERİ ───
    const kpiMetrics = useMemo(() => {
        const today = new Date();
        const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const todayStr = today.toISOString().split('T')[0];

        // 1. Krediler İstatistikleri
        let totalLoanRemainingTL = 0;
        let thisMonthLoanDueTL = 0;
        let thisMonthDueCount = 0;
        let overdueCount = 0;
        let overdueTL = 0;

        loans.forEach(loan => {
            (loan.installments || []).forEach(inst => {
                if (inst.status === 'pending') {
                    totalLoanRemainingTL += inst.amount;

                    const instYm = (inst.dueDate || '').substring(0, 7);
                    if (instYm === currentYearMonth) {
                        thisMonthLoanDueTL += inst.amount;
                        thisMonthDueCount += 1;
                    }

                    if (inst.dueDate && inst.dueDate < todayStr) {
                        overdueCount += 1;
                        overdueTL += inst.amount;
                    }
                }
            });
        });

        // 2. Vadesiz Borçlar İstatistikleri
        let totalOpenDebtTL = 0;
        let totalOpenDebtCount = 0;

        openDebts.forEach(debt => {
            if (debt.status !== 'settled') {
                const remaining = debt.remainingAmount !== undefined ? debt.remainingAmount : debt.initialAmount;
                if (remaining > 0) {
                    const tryEq = calculateTryEquivalent(remaining, debt.currency, effectiveRates);
                    totalOpenDebtTL += tryEq;
                    totalOpenDebtCount += 1;
                }
            }
        });

        // 3. Genel Toplam Borç Stoku (TL)
        const grandTotalDebtTL = totalLoanRemainingTL + totalOpenDebtTL;

        return {
            grandTotalDebtTL,
            totalLoanRemainingTL,
            thisMonthLoanDueTL,
            thisMonthDueCount,
            overdueCount,
            overdueTL,
            totalOpenDebtTL,
            totalOpenDebtCount
        };
    }, [loans, openDebts, effectiveRates]);

    // Kredileri Sırala: Devam edenler üstte, kapananlar altta; yeni kapananlar kendi içinde en üstte
    const sortedLoans = useMemo(() => {
        return [...loans].sort((a, b) => {
            const instsA = a.installments || [];
            const totalA = instsA.length;
            const paidA = instsA.filter(i => i.status === 'paid' || i.status === 'early_closed').length;
            const isClosedA = a.status === 'closed' || (totalA > 0 && totalA === paidA);

            const instsB = b.installments || [];
            const totalB = instsB.length;
            const paidB = instsB.filter(i => i.status === 'paid' || i.status === 'early_closed').length;
            const isClosedB = b.status === 'closed' || (totalB > 0 && totalB === paidB);

            // 1. Kapananlar listenin en altına geçsin
            if (!isClosedA && isClosedB) return -1;
            if (isClosedA && !isClosedB) return 1;

            // 2. Kapananlar kendi arasında: Yeni kapananlar üstte kalsın (azalan tarih)
            if (isClosedA && isClosedB) {
                const getClosedTimestamp = (loan) => {
                    let latestPaid = '';
                    (loan.installments || []).forEach(i => {
                        if (i.paidDate && i.paidDate > latestPaid) latestPaid = i.paidDate;
                    });
                    const dStr = loan.closedAt || loan.updatedAt || latestPaid || loan.createdAt || 0;
                    return new Date(dStr).getTime() || 0;
                };
                return getClosedTimestamp(b) - getClosedTimestamp(a);
            }

            // 3. Devam edenler kendi arasında: En yeni eklenen en üstte
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });
    }, [loans]);

    // Vadesiz Borçları Kişilere Göre Grupla (Master-Detail Modeli İçin Türkçe Karakter Toleranslı)
    const groupedOpenDebts = useMemo(() => {
        const map = new Map();

        const normalizeCreditorKey = (name) => {
            if (!name) return 'diger';
            return name
                .trim()
                .replace(/İ/g, 'i')
                .replace(/I/g, 'i')
                .replace(/ı/g, 'i')
                .toLocaleLowerCase('tr')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
        };

        (openDebts || []).forEach(debt => {
            const rawCreditor = (debt.creditor || 'Diğer').trim();
            const key = normalizeCreditorKey(rawCreditor);

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    creditor: rawCreditor,
                    debts: [],
                    totalTRY: 0,
                    activeCount: 0,
                    settledCount: 0,
                    oldestActiveDate: null,
                    latestActivity: debt.updatedAt || debt.createdAt || debt.date || ''
                });
            }

            const group = map.get(key);
            // Eğer mevcut isim küçük harfle başlamış ama yenisi düzgün yazılmışsa başlığı güzelleştir
            if (rawCreditor.charAt(0) === rawCreditor.charAt(0).toUpperCase() && group.creditor.charAt(0) !== group.creditor.charAt(0).toUpperCase()) {
                group.creditor = rawCreditor;
            }

            group.debts.push(debt);

            const initialAmt = Number(debt.initialAmount) || 0;
            const remainingAmt = debt.remainingAmount !== undefined ? Number(debt.remainingAmount) : initialAmt;
            const isSettled = debt.status === 'settled' || remainingAmt <= 0;

            if (isSettled) {
                group.settledCount += 1;
            } else {
                group.activeCount += 1;
                const tryEq = calculateTryEquivalent(remainingAmt, debt.currency, effectiveRates);
                group.totalTRY += tryEq;

                if (debt.date) {
                    if (!group.oldestActiveDate || debt.date < group.oldestActiveDate) {
                        group.oldestActiveDate = debt.date;
                    }
                }
            }

            const actDate = debt.updatedAt || debt.createdAt || debt.date || '';
            if (actDate > group.latestActivity) {
                group.latestActivity = actDate;
            }
        });

        // Her grubun borçlarını sırala: Devam edenler üstte, eski borçlar üstte (yeni borçlar alta eklenir), kapalılar en altta
        const result = Array.from(map.values()).map(group => {
            const sortedDebts = [...group.debts].sort((a, b) => {
                const remA = a.remainingAmount !== undefined ? Number(a.remainingAmount) : (Number(a.initialAmount) || 0);
                const isSettledA = a.status === 'settled' || remA <= 0;
                const remB = b.remainingAmount !== undefined ? Number(b.remainingAmount) : (Number(b.initialAmount) || 0);
                const isSettledB = b.status === 'settled' || remB <= 0;

                if (!isSettledA && isSettledB) return -1;
                if (isSettledA && !isSettledB) return 1;

                // Eski borç üstte olsun: oluşturulma/tarih sırasına göre artan (eskiden yeniye)
                const timeA = new Date(a.createdAt || a.date || 0).getTime();
                const timeB = new Date(b.createdAt || b.date || 0).getTime();
                if (timeA !== timeB) return timeA - timeB;

                return (a.date || '').localeCompare(b.date || '');
            });

            return {
                ...group,
                debts: sortedDebts
            };
        });

        // Grupları filtrele: Sadece aktif borcu olan kişiler listelenir (Borcu olmayanlar gösterilmez/silinir)
        const activeGroups = result.filter(group => group.activeCount > 0);
        activeGroups.sort((a, b) => b.totalTRY - a.totalTRY);

        return activeGroups;
    }, [openDebts, effectiveRates]);

    // Aktif Seçili Alacaklı Grubu (Varsayılan olarak ilk/en yüksek borçlu kişi)
    const activeCreditorGroup = useMemo(() => {
        if (!groupedOpenDebts || groupedOpenDebts.length === 0) return null;
        if (selectedCreditorKey) {
            const found = groupedOpenDebts.find(g => g.key === selectedCreditorKey);
            if (found) return found;
        }
        return groupedOpenDebts[0] || null;
    }, [groupedOpenDebts, selectedCreditorKey]);

    // ─── KİLİT EKRANI (ŞİFRE GİRİLMEMİŞSE GÖSTERİLİR) ───
    if (!isUnlocked) {
        return (
            <PinLockOverlay
                companyName={companyData?.name || 'Şirket'}
                onUnlock={() => setIsUnlocked(true)}
                onCancel={() => {
                    // Varsayılan olarak dashboard'a geri dön
                    window.dispatchEvent(new CustomEvent('tir_switch_tab', { detail: 'dashboard' }));
                }}
            />
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full w-full p-2.5 sm:p-4 lg:p-6 overflow-hidden gap-3 max-w-[1920px] mx-auto select-none">
            
            {/* ── Üst Başlık & Kontrol Barı ── */}
            <div className="flex items-center justify-between gap-3 pb-2 border-b border-white/[0.06] shrink-0"
                style={{ paddingTop: isMobile ? 'calc(0.5rem + env(safe-area-inset-top, 0px))' : '0' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                    {isMobile && onOpenMenu && (
                        <button onClick={onOpenMenu} className="p-1.5 -ml-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer">
                            <Menu size={22} />
                        </button>
                    )}
                    <h2 className="text-sm sm:text-lg font-bold tracking-tight text-white truncate">
                        <span className="hidden sm:inline">Kredi & Borç Yönetimi</span>
                        <span className="sm:hidden">Borçlar</span>
                    </h2>
                </div>

                {/* Sağ Aksiyon: Sekmeler + Yeni Ekle (+) + Kilit Butonu */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Sekme Seçimi (Vadeli Borçlar & Vadesiz Borçlar) */}
                    <div className="flex items-center p-0.5 sm:p-1 rounded-xl bg-[#0a0d14] border border-white/[0.06] relative">
                        <button
                            onClick={() => setActiveSubTab('loans')}
                            className={`relative flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 cursor-pointer ${
                                activeSubTab === 'loans'
                                    ? 'text-black font-bold'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            {activeSubTab === 'loans' && (
                                <motion.div
                                    layoutId="debts-subtab-pill"
                                    className="absolute inset-0 bg-amber-500 rounded-lg shadow-sm"
                                    style={{ zIndex: 0 }}
                                    initial={false}
                                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                />
                            )}
                            <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
                                <CreditCard size={14} />
                                <span className="hidden sm:inline">Vadeli Borçlar</span>
                                <span className="sm:hidden">Vadeli</span>
                            </span>
                        </button>

                        <button
                            onClick={() => setActiveSubTab('open_debts')}
                            className={`relative flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 cursor-pointer ${
                                activeSubTab === 'open_debts'
                                    ? 'text-black font-bold'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            {activeSubTab === 'open_debts' && (
                                <motion.div
                                    layoutId="debts-subtab-pill"
                                    className="absolute inset-0 bg-amber-500 rounded-lg shadow-sm"
                                    style={{ zIndex: 0 }}
                                    initial={false}
                                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                />
                            )}
                            <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
                                <Coins size={14} />
                                <span className="hidden sm:inline">Vadesiz Borçlar</span>
                                <span className="sm:hidden">Vadesiz</span>
                            </span>
                        </button>
                    </div>

                    {/* Yeni Ekle (+) Butonu (Vadeli Borçlar: Yeni Kredi/Senet, Vadesiz Borçlar: Yeni Borç) */}
                    <button
                        onClick={activeSubTab === 'loans' ? handleOpenNewLoan : handleOpenNewDebt}
                        className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.08] flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
                        title={activeSubTab === 'loans' ? "Yeni Kredi / Senet Ekle" : "Yeni Vadesiz Borç Ekle"}
                    >
                        <Plus size={15} />
                    </button>

                    {/* Kasayı Kilitle Butonu */}
                    <button
                        onClick={handleLock}
                        className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.08] flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
                        title="Kasayı Kilitle"
                    >
                        <Lock size={15} />
                    </button>
                </div>
            </div>

            {/* ── 1. Bento KPI Kartları (Sade & Zarif 60-30-10 - Mobilde 2x2 Kompakt Grid, Tablet & Masaüstünde Tek Sıra) ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 shrink-0">
                {/* 1. KART: Toplam Borç Stoku */}
                <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-white/[0.06] p-2.5 sm:p-4 bg-[#0a0d14] flex flex-col justify-center">
                    <div className="flex items-center mb-1 sm:mb-1.5">
                        <span className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center gap-1.5 truncate">
                            <TrendingDown size={13} className="text-slate-400 shrink-0" />
                            <span className="truncate">Toplam Borç Stoku</span>
                        </span>
                    </div>
                    <h3 className="text-base sm:text-xl lg:text-2xl font-bold text-white font-mono tracking-tight truncate">
                        {formatMoney(kpiMetrics.grandTotalDebtTL)}
                    </h3>
                </div>

                {/* 2. KART: Bu Ay Ödenecek Taksitler */}
                <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-white/[0.06] p-2.5 sm:p-4 bg-[#0a0d14] flex flex-col justify-center">
                    <div className="flex items-center mb-1 sm:mb-1.5">
                        <span className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center gap-1.5 truncate">
                            <Calendar size={13} className="text-slate-400 shrink-0" />
                            <span className="truncate">Bu Ayki Taksitler</span>
                        </span>
                    </div>
                    <h3 className="text-base sm:text-xl lg:text-2xl font-bold text-white font-mono tracking-tight truncate">
                        {formatMoney(kpiMetrics.thisMonthLoanDueTL)}
                    </h3>
                </div>

                {/* 3. KART: Vadesiz & Emtia Borçları */}
                <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-white/[0.06] p-2.5 sm:p-4 bg-[#0a0d14] flex flex-col justify-center">
                    <div className="flex items-center mb-1 sm:mb-1.5">
                        <span className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center gap-1.5 truncate">
                            <Coins size={13} className="text-slate-400 shrink-0" />
                            <span className="truncate sm:hidden">Vadesiz & Altın</span>
                            <span className="hidden sm:inline truncate">Vadesiz & Altın / Döviz</span>
                        </span>
                    </div>
                    <h3 className="text-base sm:text-xl lg:text-2xl font-bold text-white font-mono tracking-tight truncate">
                        {formatMoney(kpiMetrics.totalOpenDebtTL)}
                    </h3>
                </div>

                {/* 4. KART: Geciken Taksitler */}
                <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-white/[0.06] p-2.5 sm:p-4 bg-[#0a0d14] flex flex-col justify-center">
                    <div className="flex items-center mb-1 sm:mb-1.5">
                        <span className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center gap-1.5 truncate">
                            <Clock size={13} className="text-slate-400 shrink-0" />
                            <span className="truncate">Geciken Taksitler</span>
                        </span>
                    </div>
                    <h3 className="text-base sm:text-xl lg:text-2xl font-bold text-white font-mono tracking-tight truncate">
                        {kpiMetrics.overdueCount > 0 ? formatMoney(kpiMetrics.overdueTL) : '₺0'}
                    </h3>
                </div>
            </div>

            {/* ── 2. ANA İÇERİK ALANI ── */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                
                {/* ── SEKME 1: VADELİ BORÇLAR (KREDİLER & SENETLER) ── */}
                {activeSubTab === 'loans' && (
                    <div className="space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-0.5">
                        {loans.length === 0 ? (
                            <div className="bg-[#0a0d14] border border-white/[0.06] rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center justify-center">
                                <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-slate-400 mb-3">
                                    <CreditCard size={22} />
                                </div>
                                <h4 className="text-sm font-semibold text-white mb-1">Henüz Kayıtlı Vadeli Borç / Kredi Bulunmuyor</h4>
                                <p className="text-xs text-slate-500 max-w-sm mb-4">
                                    Bireysel, ticari, araç kredilerinizi veya senetli borçlarınızı ekleyerek aylık ödeme planını ve kalan borçlarınızı anlık takip edebilirsiniz.
                                </p>
                                <button
                                    onClick={handleOpenNewLoan}
                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition cursor-pointer shadow-sm"
                                >
                                    İlk Kaydı Ekleyin
                                </button>
                            </div>
                        ) : (
                            sortedLoans.map((loan) => {
                                const todayStr = new Date().toISOString().split('T')[0];
                                const installments = loan.installments || [];
                                const totalCount = installments.length;
                                const paidInstallments = installments.filter(i => i.status === 'paid' || i.status === 'early_closed');
                                const paidCount = paidInstallments.length;
                                const remainingCount = totalCount - paidCount;

                                const totalPaidTL = paidInstallments.reduce((sum, i) => sum + (i.paidAmount !== null && i.paidAmount !== undefined ? i.paidAmount : i.amount), 0);
                                const totalRemainingTL = installments.filter(i => i.status === 'pending').reduce((sum, i) => sum + i.amount, 0);
                                const progressPercent = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;

                                const isExpanded = expandedLoanId === loan.id;
                                const truckObj = trucks.find(t => t.id === loan.truckId);
                                const isClosed = loan.status === 'closed' || (totalCount > 0 && remainingCount === 0);
                                const hasOverdue = !isClosed && installments.some(i => i.status === 'pending' && i.dueDate < todayStr);

                                return (
                                    <div 
                                        key={loan.id}
                                        className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                                            isClosed 
                                                ? 'bg-[#080b11] border-white/[0.04]' 
                                                : hasOverdue
                                                    ? 'bg-[#0a0d14] border-amber-500/60 shadow-sm shadow-amber-500/10'
                                                    : 'bg-[#0a0d14] border-white/[0.06] hover:border-white/[0.12]'
                                        }`}
                                    >
                                        {/* Kredi Üst Kart Başlığı - İnce & Zarif Bar Tasarımı */}
                                        <div className="px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-transparent">
                                            <div className="flex items-center min-w-0">
                                                <div className="min-w-0 flex flex-col justify-center">
                                                    <div className="flex items-center gap-2 flex-wrap leading-tight">
                                                        <h4 className={`text-sm sm:text-base font-bold tracking-tight truncate leading-tight ${
                                                            isClosed ? 'text-slate-400' : 'text-white'
                                                        }`}>
                                                            {loan.loanTitle ? `${loan.bankName} ${loan.loanTitle}` : loan.bankName}
                                                        </h4>
                                                        {isClosed && (
                                                            <span className="text-[10px] bg-white/[0.04] text-slate-400 border border-white/[0.08] px-2 py-0.5 rounded-full font-semibold tracking-wide">
                                                                KAPANDI
                                                            </span>
                                                        )}
                                                        {hasOverdue && (
                                                            <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold tracking-wide flex items-center gap-1">
                                                                <AlertCircle size={10} className="text-amber-400" />
                                                                <span>GECİKEN TAKSİT</span>
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-x-3 sm:gap-x-4 gap-y-1 flex-wrap text-xs text-slate-400 leading-tight mt-1">
                                                        {/* Kolon 1: Aylık Taksit / Senet (Sabit Genişlik - Dikey Hizalama İçin) */}
                                                        <div className="sm:w-[135px] sm:shrink-0 flex items-center">
                                                            <span>{loan.loanType === 'senet' ? 'Aylık Senet: ' : 'Aylık Taksit: '}<strong className={`font-mono font-medium ${isClosed ? 'text-slate-400' : 'text-white'}`}>{formatMoney(loan.monthlyAmount)}</strong></span>
                                                        </div>

                                                        {/* Kolon 2: Kalan Ay / Senet (Sabit Genişlik - Simetrik Font ve Boşluk) */}
                                                        {!isClosed && (
                                                            <div className="sm:w-[115px] sm:shrink-0 flex items-center">
                                                                <span>Kalan: <strong className="text-amber-400 font-semibold tabular-nums">{remainingCount} {loan.loanType === 'senet' ? 'Senet' : 'Ay'}</strong> <span className="text-slate-500">/</span> <span className="tabular-nums">{totalCount} {loan.loanType === 'senet' ? 'Senet' : 'Ay'}</span></span>
                                                            </div>
                                                        )}

                                                        {/* Kapanan Kredilerde Kolon Hizalama Boşluğu */}
                                                        {isClosed && (
                                                            <div className="hidden sm:block sm:w-[115px] sm:shrink-0" />
                                                        )}

                                                        {/* Kolon 3: Kredi Notu */}
                                                        {loan.notes && (
                                                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 italic truncate max-w-[180px] sm:max-w-[240px] sm:shrink-0" title={loan.notes}>
                                                                <FileText size={12} className="text-amber-400/80 shrink-0" />
                                                                <span className="truncate">{loan.notes}</span>
                                                            </div>
                                                        )}

                                                        {/* Kolon 4: Kredi Sözleşmesi & PDF Dosyaları */}
                                                        {loan.files && loan.files.length > 0 && (
                                                            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                                                                {loan.files.map((file, fIdx) => (
                                                                    <button
                                                                        key={file.id || fIdx}
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            openAttachment(file);
                                                                        }}
                                                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[10px] font-medium transition cursor-pointer"
                                                                        title={`${file.name || 'Ek.pdf'} - Görüntüle`}
                                                                    >
                                                                        <FileText size={10} />
                                                                        <span className="max-w-[85px] truncate">{file.name || 'Ek.pdf'}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Sağ Tutar & Aksiyon Butonları */}
                                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
                                                <div className="text-left sm:text-right min-h-10 flex flex-col justify-center leading-tight">
                                                    <div className="text-[11px] text-slate-500 font-medium leading-tight">{loan.loanType === 'senet' ? 'Kalan Senet Borcu' : 'Kalan Kredi Borcu'}</div>
                                                    <div className={`text-base sm:text-lg font-bold font-mono leading-tight mt-0.5 ${
                                                        isClosed ? 'text-slate-500' : 'text-white'
                                                    }`}>
                                                        {formatMoney(totalRemainingTL)}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1.5">
                                                    {/* SİLME SİMGESİ YERİNE DÜZENLEME & YÖNETME SİMGESİ */}
                                                    <button
                                                        onClick={() => handleOpenEditLoan(loan)}
                                                        className="w-8 h-8 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 flex items-center justify-center transition cursor-pointer"
                                                        title="Düzenle, Kapat veya Sil"
                                                    >
                                                        <Pencil size={15} />
                                                    </button>

                                                    <button
                                                        onClick={() => setExpandedLoanId(isExpanded ? null : loan.id)}
                                                        className={`h-8 px-3 rounded-xl text-xs font-semibold border flex items-center gap-1 transition cursor-pointer ${
                                                            isClosed 
                                                                ? 'bg-white/[0.02] hover:bg-white/[0.05] text-slate-400 border-white/[0.05]' 
                                                                : 'bg-white/[0.04] hover:bg-white/[0.08] text-white border-white/[0.08]'
                                                        }`}
                                                    >
                                                        <span>{loan.loanType === 'senet' ? 'Senet Planı' : 'Taksit Planı'}</span>
                                                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Açılır Taksit Tablosu */}
                                        {isExpanded && (
                                            <div className="border-t border-white/[0.08] bg-[#05070a] p-3 sm:p-5 animate-in fade-in duration-200">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                                                    {installments.map((inst) => {
                                                        const isPaid = inst.status === 'paid';
                                                        const isEarlyClosed = inst.status === 'early_closed';
                                                        const isOverdue = !isPaid && !isEarlyClosed && inst.dueDate < todayStr;
                                                        const isCurrentMonth = !isPaid && !isEarlyClosed && (inst.dueDate || '').substring(0, 7) === todayStr.substring(0, 7);

                                                        return (
                                                            <div 
                                                                key={inst.no}
                                                                className={`rounded-xl p-3 border transition flex flex-col justify-between ${
                                                                    isPaid
                                                                        ? 'bg-[#0a0d13] border-white/[0.06]'
                                                                        : isEarlyClosed
                                                                            ? 'bg-white/[0.02] border-white/[0.06] opacity-60'
                                                                            : isOverdue
                                                                                ? 'bg-amber-500/10 border-amber-500/60 shadow-sm shadow-amber-500/10'
                                                                                : isCurrentMonth
                                                                                    ? 'bg-amber-950/20 border-amber-500/35 shadow-sm shadow-amber-500/10'
                                                                                    : 'bg-[#0a0d13] border-white/[0.06]'
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between mb-1.5">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-xs font-bold font-mono text-white">
                                                                            {inst.no}. {loan.loanType === 'senet' ? 'Senet' : 'Taksit'}
                                                                        </span>
                                                                        {isPaid && (
                                                                            <span className="text-[9px] bg-white/[0.06] text-slate-300 border border-white/[0.08] px-1.5 py-0.2 rounded font-bold">
                                                                                ÖDENDİ
                                                                            </span>
                                                                        )}
                                                                        {isEarlyClosed && (
                                                                            <span className="text-[9px] bg-white/10 text-slate-300 px-1.5 py-0.2 rounded font-bold">
                                                                                KAPATILDI
                                                                            </span>
                                                                        )}
                                                                        {isOverdue && (
                                                                            <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-bold animate-pulse">
                                                                                GECİKTİ
                                                                            </span>
                                                                        )}
                                                                        {isCurrentMonth && !isOverdue && (
                                                                            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold">
                                                                                BU AY
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    <button
                                                                        onClick={() => handleOpenEditInstallment(loan.id, inst)}
                                                                        className="text-slate-500 hover:text-white p-1 rounded hover:bg-white/5 transition cursor-pointer"
                                                                        title="Taksit Detayını Düzenle & Dekont/Not Ekle"
                                                                    >
                                                                        <Pencil size={11} />
                                                                    </button>
                                                                </div>

                                                                <div className="mb-2">
                                                                    <div className="text-sm font-bold text-white font-mono">
                                                                        {formatMoney(inst.amount)}
                                                                    </div>
                                                                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                                                                        <Calendar size={10} />
                                                                        <span>Vade: {inst.dueDate}</span>
                                                                    </div>
                                                                    {isPaid && inst.paidDate && (
                                                                        <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                                                                            ✓ Ödendi: {inst.paidDate} ({formatMoney(inst.paidAmount || inst.amount)})
                                                                        </div>
                                                                    )}

                                                                    {/* Taksit Notu */}
                                                                    {inst.note && (
                                                                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 truncate" title={inst.note}>
                                                                            <FileText size={10} className="text-amber-400/80 shrink-0" />
                                                                            <span className="truncate">{inst.note}</span>
                                                                        </div>
                                                                    )}

                                                                    {/* Taksit Dekont & PDF Dosyaları */}
                                                                    {inst.files && inst.files.length > 0 && (
                                                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                                                            {inst.files.map((file, idx) => (
                                                                                <button
                                                                                    key={file.id || idx}
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        openAttachment(file);
                                                                                    }}
                                                                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[10px] font-medium transition cursor-pointer"
                                                                                    title={`${file.name} - Dekontu Görüntüle`}
                                                                                >
                                                                                    <FileText size={10} />
                                                                                    <span className="max-w-[85px] truncate">{file.name || 'Dekont.pdf'}</span>
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Taksit Aksiyon Butonu */}
                                                                <div className="pt-1.5 border-t border-white/[0.05]">
                                                                    {isPaid ? (
                                                                        <button
                                                                            onClick={() => handleCancelPayment(loan.id, inst.no)}
                                                                            className="w-full h-8 sm:h-7 rounded-lg bg-white/[0.03] hover:bg-amber-500/15 text-slate-400 hover:text-amber-300 text-[11px] sm:text-[10px] font-semibold transition cursor-pointer flex items-center justify-center gap-1 active:scale-[0.98]"
                                                                        >
                                                                            <X size={12} /> Ödemeyi Geri Al
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleOpenPayModal(loan.id, inst)}
                                                                            className={`w-full h-8 sm:h-7 rounded-lg text-[11px] sm:text-[10px] font-bold transition cursor-pointer flex items-center justify-center gap-1 active:scale-[0.98] ${
                                                                                isOverdue || isCurrentMonth
                                                                                    ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-sm shadow-amber-500/20'
                                                                                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 border border-white/[0.08]'
                                                                            }`}
                                                                        >
                                                                            <Check size={13} /> Ödendi Olarak İşle
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* ── SEKME 2: VADESİZ BORÇLAR (TL, DÖVİZ, ALTIN TÜRLERİ) ── */}
                {activeSubTab === 'open_debts' && (
                    <div className="flex-1 min-h-0 flex flex-col h-full">
                        {groupedOpenDebts.length === 0 ? (
                            <div className="bg-[#0a0d14] border border-white/[0.06] rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center justify-center my-auto">
                                <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-slate-400 mb-3">
                                    <Coins size={22} />
                                </div>
                                <h4 className="text-sm font-semibold text-white mb-1">Henüz Aktif Vadesiz Borç Kaydı Yok</h4>
                                <p className="text-xs text-slate-500 max-w-sm mb-4">
                                    Kişilere, esnafa veya kurumlara olan TL, Dolar, Euro veya Altın borçlarınızı kaydedip anlık TL karşılıklarıyla takip edebilirsiniz.
                                </p>
                                <button
                                    onClick={handleOpenNewDebt}
                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition cursor-pointer shadow-sm"
                                >
                                    İlk Borç Kaydını Ekleyin
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col lg:flex-row gap-4 items-stretch w-full flex-1 min-h-0 h-full">
                                {/* ── SOL PANEL: KİŞİLER & ALACAKLILAR LİSTESİ (MASTER) ── */}
                                <div className={`w-full lg:w-80 xl:w-96 shrink-0 bg-[#0a0d14] border border-white/[0.06] rounded-2xl overflow-hidden flex flex-col h-full min-h-0 ${
                                    isMobileDetailOpen ? 'hidden lg:flex' : 'flex'
                                }`}>
                                    {/* Panel Başlığı */}
                                    <div className="p-3.5 sm:p-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.01] shrink-0">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-lg bg-white/[0.04] text-slate-300 border border-white/[0.08] flex items-center justify-center">
                                                <User size={13} />
                                            </div>
                                            <h4 className="text-xs sm:text-sm font-bold text-white">Alacaklılar</h4>
                                            <span className="px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.06] text-[10px] font-mono font-semibold text-slate-400">
                                                {groupedOpenDebts.length}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleOpenNewDebt}
                                            className="h-7 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-sm"
                                            title="Yeni Borç Kaydı Ekle"
                                        >
                                            <Plus size={12} /> Borç Ekle
                                        </button>
                                    </div>

                                    {/* Kişi Satırları Listesi */}
                                    <div className="divide-y divide-white/[0.04] flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                        {groupedOpenDebts.map((group) => {
                                            const isSelected = activeCreditorGroup?.key === group.key;
                                            return (
                                                <div
                                                    key={group.key}
                                                    onClick={() => {
                                                        setSelectedCreditorKey(group.key);
                                                        setIsMobileDetailOpen(true);
                                                    }}
                                                    className={`p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer transition select-none border-l-2 ${
                                                        isSelected
                                                            ? 'bg-white/[0.06] border-l-amber-400 text-white'
                                                            : 'border-l-transparent hover:bg-white/[0.02] text-slate-300'
                                                    }`}
                                                >
                                                    {/* Sol: Avatar + İsim */}
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs uppercase shrink-0 transition ${
                                                            isSelected 
                                                                ? 'bg-amber-400/10 text-amber-300 border border-amber-400/30' 
                                                                : 'bg-white/[0.04] text-slate-300 border border-white/[0.08]'
                                                        }`}>
                                                            {group.creditor.charAt(0) || <User size={13} />}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <h5 className={`text-xs sm:text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                                                                {group.creditor}
                                                            </h5>
                                                        </div>
                                                    </div>

                                                    {/* Sağ: Toplam Borç TL */}
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <div className="text-right">
                                                            <div className="font-mono text-xs sm:text-sm font-black text-white tracking-tight">
                                                                {formatMoney(group.totalTRY)}
                                                            </div>
                                                            <div className="text-[9px] text-slate-400 font-medium">
                                                                Toplam
                                                            </div>
                                                        </div>
                                                        <ChevronRight size={14} className={`shrink-0 transition-colors ${isSelected ? 'text-amber-400' : 'text-slate-500'}`} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* ── SAĞ PANEL: SEÇİLİ KİŞİNİN HESAP DEFTERİ (DETAIL) ── */}
                                <div className={`flex-1 min-w-0 w-full bg-[#0a0d14] border border-white/[0.06] rounded-2xl p-4 sm:p-5 flex flex-col h-full min-h-0 ${
                                    isMobileDetailOpen ? 'flex' : 'hidden lg:flex'
                                }`}>
                                    {!activeCreditorGroup ? (
                                        <div className="py-16 text-center text-slate-500 text-xs my-auto flex flex-col items-center justify-center gap-3">
                                            <span>Lütfen detaylarını görüntülemek için soldan bir alacaklı seçin.</span>
                                            <button
                                                type="button"
                                                onClick={() => setIsMobileDetailOpen(false)}
                                                className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-white text-xs font-semibold cursor-pointer active:scale-95"
                                            >
                                                <ChevronLeft size={14} className="text-amber-400" />
                                                <span>Alacaklılar Listesine Dön</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Mobil Geri Dön Butonu */}
                                            <div className="lg:hidden mb-3 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsMobileDetailOpen(false)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer active:scale-95"
                                                >
                                                    <ChevronLeft size={15} className="text-amber-400" />
                                                    <span>Alacaklılar Listesine Dön</span>
                                                </button>
                                            </div>

                                            {/* Defter Üst Başlığı */}
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.06] shrink-0">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white flex items-center justify-center font-black text-sm uppercase shrink-0">
                                                        {activeCreditorGroup.creditor.charAt(0) || <User size={16} />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="text-base sm:text-lg font-black text-white tracking-tight truncate">
                                                            {activeCreditorGroup.creditor}
                                                        </h3>
                                                    </div>
                                                </div>

                                                {/* Sağ: Toplam Değer & Kalem Ekle Butonu */}
                                                <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                                                    <div className="text-right">
                                                        <div className="text-[10px] text-slate-400 font-medium">Toplam Değer</div>
                                                        <div className="font-mono text-base sm:text-xl font-black text-white tracking-tight">
                                                            {formatMoney(activeCreditorGroup.totalTRY)}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenNewDebtForCreditor(activeCreditorGroup.creditor)}
                                                        className="h-8 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                                                        title={`${activeCreditorGroup.creditor} adına yeni kalem ekle`}
                                                    >
                                                        <Plus size={13} /> Kalem Ekle
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Kalemler Listesi */}
                                            <div className="space-y-3 mt-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
                                                {activeCreditorGroup.debts.map((debt) => {
                                                    const initialAmt = Number(debt.initialAmount) || 0;
                                                    const remainingAmt = debt.remainingAmount !== undefined ? Number(debt.remainingAmount) : initialAmt;
                                                    const paidAmt = initialAmt - remainingAmt;
                                                    const curInfo = CURRENCY_TYPES.find(c => c.id === debt.currency) || CURRENCY_TYPES[0];
                                                    const tryEquivalent = calculateTryEquivalent(remainingAmt, debt.currency, effectiveRates);
                                                    const isSettled = debt.status === 'settled' || remainingAmt <= 0;
                                                    const payments = debt.payments || [];
                                                    const isHistoryOpen = expandedDebtHistoryId === debt.id;

                                                    const subtitle = debt.currency.startsWith('GOLD_')
                                                        ? (debt.pieceCount && debt.pieceGram 
                                                            ? `${debt.pieceCount} Adet × ${debt.pieceGram} gr (${curInfo.label.split('(')[0].trim()})`
                                                            : curInfo.label.split('(')[0].trim())
                                                        : (debt.currency === 'USD'
                                                            ? 'Dolar'
                                                            : debt.currency === 'EUR'
                                                                ? 'Euro'
                                                                : debt.currency === 'TL'
                                                                    ? 'Türk Lirası'
                                                                    : curInfo.label.split('(')[0].trim());

                                                    return (
                                                        <div 
                                                            key={debt.id}
                                                            className={`rounded-xl p-3.5 sm:p-4 border transition-all ${
                                                                isSettled 
                                                                    ? 'bg-white/[0.015] border-white/[0.03] opacity-60' 
                                                                    : isHistoryOpen
                                                                        ? 'bg-[#07090e] border-white/[0.15]'
                                                                        : 'bg-[#07090e] border-white/[0.06] hover:border-white/[0.12]'
                                                            }`}
                                                        >
                                                            {/* 1. Üst Satır: Borç Tutarı, Güncel Değer & Saat Simgesi (Tıklanabilir) */}
                                                            <div 
                                                                onClick={() => toggleDebtHistory(debt.id)}
                                                                className="flex items-center justify-between gap-3 cursor-pointer select-none"
                                                            >
                                                                {/* Sol: Borç Tutarı & Altında Para Birimi / Altın Türü */}
                                                                <div className="min-w-0">
                                                                    <div className={`font-mono text-base sm:text-lg font-black tracking-tight ${isSettled ? 'text-slate-400 line-through' : 'text-white'}`}>
                                                                        {remainingAmt.toLocaleString('tr-TR')} {curInfo.symbol}
                                                                    </div>
                                                                    <div className="text-xs text-slate-400 truncate mt-0.5">
                                                                        {subtitle}
                                                                    </div>
                                                                </div>

                                                                {/* Sağ: Güncel TL Değeri & Saat/Geçmiş Butonu */}
                                                                <div className="flex items-center gap-3 shrink-0">
                                                                    {debt.currency !== 'TL' && !isSettled && (
                                                                        <div className="text-right">
                                                                            <div className="font-mono text-sm sm:text-base font-bold text-slate-200">
                                                                                {formatMoney(tryEquivalent)}
                                                                            </div>
                                                                            <div className="text-[10px] text-slate-500 font-medium">
                                                                                Güncel Değer
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Saat İkonu (Geçmiş ve İşlemleri Açar) */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            toggleDebtHistory(debt.id);
                                                                        }}
                                                                        className={`h-7.5 px-2 rounded-lg border transition cursor-pointer flex items-center gap-1 shrink-0 ${
                                                                            isHistoryOpen 
                                                                                ? 'bg-white/[0.08] border-white/[0.15] text-white' 
                                                                                : 'bg-white/[0.04] border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.08]'
                                                                        }`}
                                                                        title="Borç Geçmişi ve İşlemler"
                                                                    >
                                                                        <History size={13} />
                                                                        <ChevronDown size={11} className={`transition-transform duration-200 ${isHistoryOpen ? 'rotate-180 text-white' : 'text-slate-500'}`} />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* 2. GEÇMİŞ VE İŞLEMLER DETAYI (Açılır/Kapanır) */}
                                                            {isHistoryOpen && (
                                                                <div className="mt-3.5 pt-3.5 border-t border-white/[0.06] space-y-2.5 text-[11px] animate-in fade-in duration-150">
                                                                    {/* Başlangıç Borcu & Alınış Tarihi/Süresi */}
                                                                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                                                        <div>
                                                                            <div className="text-[10px] text-slate-500 font-medium">Başlangıç Borcu</div>
                                                                            <div className="font-mono font-bold text-slate-200 text-xs sm:text-sm">
                                                                                {initialAmt.toLocaleString('tr-TR')} {curInfo.symbol}
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <div className="text-[10px] text-slate-500 font-medium">Alınış Tarihi</div>
                                                                            <div className="text-slate-300 font-medium text-[11px]">
                                                                                {formatTurkishDate(debt.date) || '-'}
                                                                            </div>
                                                                            {!isSettled && debt.date && (
                                                                                <div className="text-[10px] text-slate-500">
                                                                                    {formatDebtAge(debt.date)}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Hedef Vade (varsa) */}
                                                                    {debt.dueDate && (
                                                                        <div className="flex items-center justify-between text-slate-400 px-2.5 py-1.5 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                                                                            <span className="text-slate-500">Hedef Vade:</span>
                                                                            <span className="font-mono text-slate-300 font-medium">{formatTurkishDate(debt.dueDate)}</span>
                                                                        </div>
                                                                    )}

                                                                    {/* Borç Notu / Açıklama (varsa) */}
                                                                    {debt.notes && (
                                                                        <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-slate-300 italic">
                                                                            <span className="not-italic text-slate-500 font-medium mr-1.5">Açıklama:</span>
                                                                            "{debt.notes}"
                                                                        </div>
                                                                    )}

                                                                    {/* Ödeme Hareketleri */}
                                                                    <div>
                                                                        <div className="text-[10px] text-slate-500 font-semibold mb-1.5 flex items-center justify-between px-1">
                                                                            <span>Ödeme Hareketleri</span>
                                                                            <span>{payments.length} İşlem</span>
                                                                        </div>

                                                                        {payments.length === 0 ? (
                                                                            <div className="text-[10px] text-slate-500 italic py-2 text-center bg-white/[0.01] rounded-lg border border-white/[0.02]">
                                                                                Henüz yapılmış bir ödeme bulunmuyor.
                                                                            </div>
                                                                        ) : (
                                                                            <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                                                                                {payments.map(p => (
                                                                                    <div key={p.id} className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                                                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                                                            <span className="text-slate-400 font-mono text-[10px] shrink-0">{formatTurkishDate(p.date)}</span>
                                                                                            <span className="text-slate-300 truncate text-[11px]">{p.note || 'Ödeme'}</span>
                                                                                            {p.files && p.files.length > 0 && (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        openAttachment(p.files[0]);
                                                                                                    }}
                                                                                                    className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white shrink-0 transition cursor-pointer"
                                                                                                    title={`${p.files.length} Dekont / Belge`}
                                                                                                >
                                                                                                    <FileText size={10} className="text-red-400" />
                                                                                                    <span className="text-[9px]">Dekont</span>
                                                                                                </button>
                                                                                            )}
                                                                                        </div>
                                                                                        <span className="font-bold text-slate-200 font-mono shrink-0 ml-2 text-[11px]">
                                                                                            -{Number(p.amount).toLocaleString('tr-TR')} {curInfo.symbol}
                                                                                        </span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Özet: Toplam Ödenen */}
                                                                    {paidAmt > 0 && (
                                                                        <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between text-xs">
                                                                            <span className="text-slate-400 font-medium">Toplam Ödenen:</span>
                                                                            <span className="font-mono font-bold text-slate-200">
                                                                                {paidAmt.toLocaleString('tr-TR')} {curInfo.symbol}
                                                                            </span>
                                                                        </div>
                                                                    )}

                                                                    {/* 3. İŞLEM BUTONLARI: Ödeme Düş, Belge, Düzenle, Sil */}
                                                                    <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                                                                        {/* Sol: Ödeme Düş */}
                                                                        {!isSettled ? (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setSelectedDebtForPayment(debt);
                                                                                    setPartialPayForm({
                                                                                        amount: '',
                                                                                        date: new Date().toISOString().split('T')[0],
                                                                                        note: '',
                                                                                        files: []
                                                                                    });
                                                                                }}
                                                                                className="h-8 sm:h-7 px-2.5 sm:px-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 hover:text-white border border-white/[0.08] text-xs sm:text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 active:scale-95"
                                                                                title="Kısmi veya Tam Ödeme Düş"
                                                                            >
                                                                                <Coins size={13} className="text-amber-400" /> <span>Ödeme Düş</span>
                                                                            </button>
                                                                        ) : (
                                                                            <span className="text-xs sm:text-[11px] text-slate-400 font-semibold flex items-center gap-1 whitespace-nowrap shrink-0">
                                                                                <Check size={13} /> Borç Kapandı
                                                                            </span>
                                                                        )}

                                                                        {/* Sağ: Belge, Düzenle & Sil */}
                                                                        <div className="flex items-center gap-1.5 sm:gap-1 shrink-0">
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    toggleDebtDocs(debt.id);
                                                                                }}
                                                                                className={`h-8 sm:h-7 px-2.5 sm:px-2 rounded-lg border text-xs sm:text-[11px] font-medium flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0 active:scale-95 ${
                                                                                    openDocsDebtId === debt.id
                                                                                        ? 'bg-white/[0.12] border-white/[0.2] text-white font-semibold'
                                                                                        : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08]'
                                                                                }`}
                                                                                title="Ekli Belgeleri Görüntüle / Yeni Belge Ekle"
                                                                            >
                                                                                <Paperclip size={12} />
                                                                                <span>{debt.files && debt.files.length > 0 ? `Belgeler (${debt.files.length})` : 'Belge'}</span>
                                                                                <ChevronDown size={10} className={`transition-transform duration-200 ${openDocsDebtId === debt.id ? 'rotate-180 text-white' : 'text-slate-500'}`} />
                                                                            </button>

                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleOpenEditDebt(debt);
                                                                                }}
                                                                                className="h-8 sm:h-7 px-2.5 sm:px-2 text-slate-300 hover:text-white rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs sm:text-[11px] font-medium flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0 active:scale-95"
                                                                                title="Kalemi Düzenle"
                                                                            >
                                                                                <Pencil size={11} /> <span>Düzenle</span>
                                                                            </button>

                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleDeleteOpenDebt(debt.id, debt.creditor);
                                                                                }}
                                                                                className="h-8 w-8 sm:h-7 sm:w-7 text-slate-400 hover:text-rose-400 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-rose-500/20 text-xs font-medium flex items-center justify-center transition cursor-pointer shrink-0 active:scale-95"
                                                                                title="Kalemi Sil"
                                                                            >
                                                                                <Trash2 size={13} />
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    {/* 4. TIKLANINCA AÇILAN EKLİ BELGELER ALANI */}
                                                                    {openDocsDebtId === debt.id && (
                                                                        <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-2 animate-in fade-in duration-150">
                                                                            <div className="flex items-center justify-between gap-2 px-0.5">
                                                                                <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5">
                                                                                    <Paperclip size={11} className="text-slate-400" />
                                                                                    <span>Ekli Belgeler</span>
                                                                                    {debt.files?.length > 0 && (
                                                                                        <span className="text-[10px] font-mono text-slate-500">({debt.files.length})</span>
                                                                                    )}
                                                                                </span>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        triggerDebtUpload(debt.id);
                                                                                    }}
                                                                                    className="h-6 px-2.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] text-[10px] font-medium flex items-center gap-1 transition cursor-pointer"
                                                                                    title="Yeni PDF / Dekont Ekle"
                                                                                >
                                                                                    <Plus size={10} /> Belge Ekle
                                                                                </button>
                                                                            </div>

                                                                            {(!debt.files || debt.files.length === 0) ? (
                                                                                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center">
                                                                                    <p className="text-[11px] text-slate-400">Bu borca ait henüz ekli belge bulunmuyor.</p>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            triggerDebtUpload(debt.id);
                                                                                        }}
                                                                                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 transition cursor-pointer"
                                                                                    >
                                                                                        <Plus size={12} /> PDF / Belge Yükle
                                                                                    </button>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                                                                    {debt.files.map((file, idx) => (
                                                                                        <div
                                                                                            key={idx}
                                                                                            className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.15] text-[11px] text-slate-200 transition"
                                                                                        >
                                                                                            <div
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    openAttachment(file);
                                                                                                }}
                                                                                                className="flex items-center gap-1.5 cursor-pointer max-w-[150px]"
                                                                                                title={file.name || 'Belgeyi Aç'}
                                                                                            >
                                                                                                <FileText size={12} className="text-red-400 shrink-0" />
                                                                                                <span className="truncate">{file.name || `Belge ${idx + 1}`}</span>
                                                                                                <ExternalLink size={10} className="text-slate-500 group-hover:text-slate-300 shrink-0 ml-0.5" />
                                                                                            </div>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    handleDeleteDebtFile(debt.id, idx);
                                                                                                }}
                                                                                                className="text-slate-500 hover:text-rose-400 p-0.5 rounded hover:bg-white/[0.06] transition cursor-pointer ml-1"
                                                                                                title="Belgeyi Sil"
                                                                                            >
                                                                                                <X size={11} />
                                                                                            </button>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── MODAL: YENİ KREDİ EKLE / DÜZENLE (IN-CARD MODAL) ── */}
            {isLoanFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#07090e] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        {/* Başlık */}
                        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                <CreditCard size={16} className="text-amber-400" />
                                <span>{editingLoanId ? 'Krediyi Düzenle' : 'Yeni Kredi Ekle'}</span>
                            </h4>
                            <button onClick={() => { setIsLoanFormOpen(false); setLoanFormErrors({}); }} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Form Gövdesi */}
                        <form onSubmit={handleSaveLoan} noValidate className="p-4 sm:p-5 overflow-y-auto space-y-3.5 custom-scrollbar">
                            {/* Tür Seçimi */}
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1.5">Borç / Kredi Türü</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {LOAN_TYPES.map(type => (
                                         <button
                                            key={type.id}
                                            type="button"
                                            onClick={() => setLoanForm(prev => ({ ...prev, loanType: type.id }))}
                                            className={`p-2.5 rounded-xl border text-center transition cursor-pointer flex flex-col items-center gap-1 ${
                                                loanForm.loanType === type.id
                                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold'
                                                    : 'bg-[#0d1117] border-white/[0.08] text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            <type.icon size={16} />
                                            <span className="text-[10px] leading-tight line-clamp-1">{type.label.split('(')[0]}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Banka / Alacaklı Adı & Başlık */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-300 mb-1">
                                        {loanForm.loanType === 'senet' ? 'Alacaklı (Kişi / Firma / Kurum) *' : 'Banka / Finansman Kurumu *'}
                                    </label>
                                    <input
                                        type="text"
                                        placeholder=""
                                        value={loanForm.bankName}
                                        onChange={e => {
                                            setLoanForm(prev => ({ ...prev, bankName: e.target.value }));
                                            if (loanFormErrors.bankName) setLoanFormErrors(prev => ({ ...prev, bankName: false }));
                                        }}
                                        className={`w-full h-10 bg-[#0d1117] rounded-xl px-3 text-xs text-white focus:border-amber-500 outline-none transition-all ${
                                            loanFormErrors.bankName 
                                                ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]' 
                                                : 'border border-white/[0.08]'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-300 mb-1">
                                        {loanForm.loanType === 'senet' ? 'Senet / Borç Başlığı (İsteğe Bağlı)' : 'Kredi Adı / Tanımı'}
                                    </label>
                                    <input
                                        type="text"
                                        placeholder=""
                                        value={loanForm.loanTitle}
                                        onChange={e => setLoanForm(prev => ({ ...prev, loanTitle: e.target.value }))}
                                        className="w-full h-10 bg-[#0d1117] border border-white/[0.08] rounded-xl px-3 text-xs text-white focus:border-amber-500 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Aylık Taksit & Vade Sayısı */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-300 mb-1">
                                        {loanForm.loanType === 'senet' ? 'Aylık Senet Tutarı (TL) *' : 'Aylık Taksit Tutarı (TL) *'}
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        placeholder=""
                                        value={loanForm.monthlyAmount}
                                        onChange={e => handleMonthlyOrMonthsChange(e.target.value, loanForm.monthsCount)}
                                        className={`w-full h-10 bg-[#0d1117] rounded-xl px-3 text-xs text-white font-mono font-bold focus:border-amber-500 outline-none transition-all ${
                                            loanFormErrors.monthlyAmount 
                                                ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]' 
                                                : 'border border-white/[0.08]'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-300 mb-1">
                                        {loanForm.loanType === 'senet' ? 'Senet Sayısı (Vade) *' : 'Vade / Ay Sayısı *'}
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="120"
                                        placeholder=""
                                        value={loanForm.monthsCount}
                                        onChange={e => handleMonthlyOrMonthsChange(loanForm.monthlyAmount, e.target.value)}
                                        className={`w-full h-10 bg-[#0d1117] rounded-xl px-3 text-xs text-white font-mono font-bold focus:border-amber-500 outline-none transition-all ${
                                            loanFormErrors.monthsCount 
                                                ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]' 
                                                : 'border border-white/[0.08]'
                                        }`}
                                    />
                                </div>
                            </div>

                            {/* İlk Taksit Tarihi & Toplam Geri Ödeme */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-300 mb-1">
                                        {loanForm.loanType === 'senet' ? 'İlk Senet Vade Tarihi *' : 'İlk Taksit Tarihi *'}
                                    </label>
                                    <CustomDatePicker
                                        value={loanForm.startDate}
                                        onChange={val => {
                                            setLoanForm(prev => ({ ...prev, startDate: val }));
                                            if (loanFormErrors.startDate) setLoanFormErrors(prev => ({ ...prev, startDate: false }));
                                        }}
                                        className={`w-full h-10 bg-[#0d1117] rounded-xl px-2 text-xs text-white focus-within:border-amber-500 transition-all ${
                                            loanFormErrors.startDate 
                                                ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]' 
                                                : 'border border-white/[0.08]'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-300 mb-1">
                                        {loanForm.loanType === 'senet' ? 'Toplam Senet Borcu (TL)' : 'Toplam Geri Ödeme (TL)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={loanForm.totalAmount}
                                        onChange={e => setLoanForm(prev => ({ ...prev, totalAmount: e.target.value }))}
                                        className="w-full h-10 bg-[#0d1117] border border-white/[0.08] rounded-xl px-3 text-xs text-slate-300 font-mono focus:border-amber-500 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Notlar */}
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">
                                    {loanForm.loanType === 'senet' ? 'Senet Notu / Açıklama' : 'Özel Notlar'}
                                </label>
                                <textarea
                                    rows="2"
                                    placeholder=""
                                    value={loanForm.notes}
                                    onChange={e => setLoanForm(prev => ({ ...prev, notes: e.target.value }))}
                                    className="w-full bg-[#0d1117] border border-white/[0.08] rounded-xl p-3 text-xs text-white focus:border-amber-500 outline-none resize-none"
                                />
                            </div>

                            {/* Kredi Sözleşmesi & Dosyalar (PDF / Görsel) */}
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">
                                    {loanForm.loanType === 'senet' ? 'Senet Görseli / Evrak (PDF veya Görsel)' : 'Kredi Sözleşmesi & Evraklar (PDF / Görsel)'}
                                </label>
                                <FileUpload
                                    files={loanForm.files || []}
                                    onChange={f => setLoanForm(prev => ({ ...prev, files: f }))}
                                    maxSizeMB={5}
                                    hideHint={true}
                                />
                            </div>

                            {/* Krediyi / Senedi Kapatma & Silme Butonları (Yalnızca Düzenleme Modunda) */}
                            {editingLoanId && (() => {
                                const targetLoan = loans.find(l => l.id === editingLoanId);
                                const isClosed = targetLoan?.status === 'closed';
                                const isSenet = loanForm.loanType === 'senet';
                                return (
                                    <div className="pt-3 border-t border-white/[0.08] space-y-2">
                                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                            {isSenet ? 'Senet Durumu & Hızlı İşlemler' : 'Kredi Durumu & Hızlı İşlemler'}
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {!isClosed ? (
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        await handleCloseLoanEarly(editingLoanId);
                                                        setIsLoanFormOpen(false);
                                                    }}
                                                    className="h-9 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                                                >
                                                    <CheckCircle2 size={14} />
                                                    <span>{isSenet ? 'Senetleri Kapat (Tümünü Bitir)' : 'Krediyi Kapat (Tümünü Bitir)'}</span>
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        await handleReopenLoan(editingLoanId);
                                                        setIsLoanFormOpen(false);
                                                    }}
                                                    className="h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08] text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                                                >
                                                    <RotateCcw size={14} />
                                                    <span>{isSenet ? 'Senetleri Yeniden Aktif Et' : 'Krediyi Yeniden Aktif Et'}</span>
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleDeleteLoan(editingLoanId, loanForm.bankName);
                                                    setIsLoanFormOpen(false);
                                                }}
                                                className="h-9 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                                            >
                                                <Trash2 size={14} />
                                                <span>{isSenet ? 'Kaydı Kalıcı Olarak Sil' : 'Krediyi Kalıcı Olarak Sil'}</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Butonlar */}
                            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
                                <button
                                    type="button"
                                    onClick={() => { setIsLoanFormOpen(false); setLoanFormErrors({}); }}
                                    className="h-9 px-4 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="submit"
                                    className="h-9 px-5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20"
                                >
                                    <Check size={14} />
                                    <span>{editingLoanId ? 'Değişiklikleri Kaydet' : (loanForm.loanType === 'senet' ? 'Senetleri ve Planı Oluştur' : 'Krediyi ve Taksitleri Oluştur')}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODAL: YENİ VADESİZ BORÇ EKLE (IN-CARD MODAL) ── */}
            {isDebtFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#07090e] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                <Coins size={16} className="text-amber-400" />
                                <span>{editingDebtId ? 'Borç Kaydını Düzenle' : 'Yeni Vadesiz Borç Ekle'}</span>
                            </h4>
                            <button onClick={() => { setIsDebtFormOpen(false); setDebtFormErrors({}); }} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveOpenDebt} noValidate className="p-4 sm:p-5 overflow-y-auto space-y-3.5 custom-scrollbar">
                            <div className="relative" ref={creditorDropdownRef}>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-medium text-slate-300">Alacaklı Kişi / Kurum / Esnaf *</label>
                                    {existingCreditors.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setIsCreditorDropdownOpen(prev => !prev)}
                                            className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                                        >
                                            {isCreditorDropdownOpen ? 'Listeyi Gizle' : `Kayıtlı Kişiler (${existingCreditors.length})`}
                                        </button>
                                    )}
                                </div>
                                <input
                                    type="text"
                                    placeholder=""
                                    value={debtForm.creditor}
                                    onFocus={() => {
                                        if (existingCreditors.length > 0) setIsCreditorDropdownOpen(true);
                                    }}
                                    onChange={e => {
                                        setDebtForm(prev => ({ ...prev, creditor: e.target.value }));
                                        setIsCreditorDropdownOpen(true);
                                        if (debtFormErrors.creditor) setDebtFormErrors(prev => ({ ...prev, creditor: false }));
                                    }}
                                    className={`w-full h-10 bg-[#0d1117] rounded-xl px-3 text-xs text-white focus:border-amber-500 outline-none transition-all ${
                                        debtFormErrors.creditor
                                            ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]'
                                            : 'border border-white/[0.08]'
                                    }`}
                                />

                                {/* Alacaklı Öneri Listesi (Hafıza / Otomatik Tamamlama) */}
                                {isCreditorDropdownOpen && filteredCreditors.length > 0 && (
                                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#10141e] border border-white/10 rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar p-1">
                                        <div className="text-[10px] uppercase font-bold text-slate-500 px-2 py-1 tracking-wider">
                                            Kayıtlı Alacaklılar
                                        </div>
                                        {filteredCreditors.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => {
                                                    setDebtForm(prev => ({ ...prev, creditor: c }));
                                                    setIsCreditorDropdownOpen(false);
                                                    if (debtFormErrors.creditor) setDebtFormErrors(prev => ({ ...prev, creditor: false }));
                                                }}
                                                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-amber-500/15 hover:text-amber-300 flex items-center justify-between cursor-pointer transition"
                                            >
                                                <span className="font-medium truncate">{c}</span>
                                                <span className="text-[10px] text-slate-500 shrink-0">Seç</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Borç Cinsi (TL, Dolar, Euro, Altın Türleri) */}
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Borç Cinsi (Birim) *</label>
                                <select
                                    value={debtForm.currency}
                                    onChange={e => setDebtForm(prev => ({ ...prev, currency: e.target.value }))}
                                    className="w-full h-10 bg-[#0d1117] border border-white/[0.08] rounded-xl px-3 text-xs text-white focus:border-amber-500 outline-none"
                                >
                                    {CURRENCY_TYPES.map(cur => (
                                        <option key={cur.id} value={cur.id}>
                                            [{cur.group}] {cur.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Miktar & Borç Alınma Tarihi (Yan Yana) */}
                            {(() => {
                                const meta = getCurrencyMeta(debtForm.currency);
                                return (
                                    <div className="space-y-3">
                                        {/* Altın Türlerinde (gr) Adet x Gram Seçeneği */}
                                        {meta.suffix === 'gr' && (
                                            <div className="flex items-center gap-1.5 p-1 bg-[#0a0d14] border border-white/[0.06] rounded-xl">
                                                <button
                                                    type="button"
                                                    onClick={() => setDebtForm(prev => ({ ...prev, goldCalcMode: 'total' }))}
                                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                                        debtForm.goldCalcMode !== 'pieces'
                                                            ? 'bg-white/[0.08] text-white font-bold'
                                                            : 'text-slate-400 hover:text-white'
                                                    }`}
                                                >
                                                    Toplam Gram
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDebtForm(prev => {
                                                            const count = prev.pieceCount || '';
                                                            const gram = prev.pieceGram || '';
                                                            const calcTotal = (count && gram) ? (Number(count) * Number(gram)).toString() : prev.initialAmount;
                                                            return { ...prev, goldCalcMode: 'pieces', initialAmount: calcTotal };
                                                        });
                                                    }}
                                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                                        debtForm.goldCalcMode === 'pieces'
                                                            ? 'bg-white/[0.08] text-white font-bold'
                                                            : 'text-slate-400 hover:text-white'
                                                    }`}
                                                >
                                                    Adet × Gram (Örn: 3 Adet 12 gr)
                                                </button>
                                            </div>
                                        )}

                                        {/* Adet x Gram Modu */}
                                        {meta.suffix === 'gr' && debtForm.goldCalcMode === 'pieces' ? (
                                            <div className="space-y-2">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-300 mb-1">Adet *</label>
                                                        <input
                                                            type="number"
                                                            step="any"
                                                            placeholder=""
                                                            value={debtForm.pieceCount}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                const gram = debtForm.pieceGram;
                                                                const total = (val && gram) ? (Number(val) * Number(gram)).toString() : '';
                                                                setDebtForm(prev => ({ ...prev, pieceCount: val, initialAmount: total }));
                                                                if (debtFormErrors.initialAmount) setDebtFormErrors(prev => ({ ...prev, initialAmount: false }));
                                                            }}
                                                            className="w-full h-10 bg-[#0d1117] border border-white/[0.08] rounded-xl px-3 text-xs text-white font-mono font-bold focus:border-amber-500 outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-300 mb-1">Birim Gramı (gr) *</label>
                                                        <input
                                                            type="number"
                                                            step="any"
                                                            placeholder=""
                                                            value={debtForm.pieceGram}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                const count = debtForm.pieceCount;
                                                                const total = (val && count) ? (Number(count) * Number(val)).toString() : '';
                                                                setDebtForm(prev => ({ ...prev, pieceGram: val, initialAmount: total }));
                                                                if (debtFormErrors.initialAmount) setDebtFormErrors(prev => ({ ...prev, initialAmount: false }));
                                                            }}
                                                            className="w-full h-10 bg-[#0d1117] border border-white/[0.08] rounded-xl px-3 text-xs text-white font-mono font-bold focus:border-amber-500 outline-none"
                                                        />
                                                    </div>
                                                </div>

                                                {debtForm.pieceCount && debtForm.pieceGram && (
                                                    <div className="text-xs text-slate-300 font-mono flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                                                        <span>Hesaplanan Toplam:</span>
                                                        <span className="font-bold text-white">{debtForm.initialAmount} gr</span>
                                                    </div>
                                                )}

                                                <div>
                                                    <label className="block text-xs font-medium text-slate-300 mb-1">Borç Alınma Tarihi *</label>
                                                    <CustomDatePicker
                                                        value={debtForm.date}
                                                        onChange={val => {
                                                            setDebtForm(prev => ({ ...prev, date: val }));
                                                            if (debtFormErrors.date) setDebtFormErrors(prev => ({ ...prev, date: false }));
                                                        }}
                                                        className={`w-full h-10 bg-[#0d1117] rounded-xl px-2 text-xs text-white focus-within:border-amber-500 transition-all ${
                                                            debtFormErrors.date
                                                                ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]'
                                                                : 'border border-white/[0.08]'
                                                        }`}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            /* Normal Tekil Miktar & Tarih Modu */
                                            <div className="grid grid-cols-2 gap-3">
                                                {/* Miktar */}
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-300 mb-1">
                                                        {meta.label} *
                                                    </label>
                                                    <div className="relative flex items-center">
                                                        <input
                                                            type="number"
                                                            step="any"
                                                            placeholder=""
                                                            value={debtForm.initialAmount}
                                                            onChange={e => {
                                                                setDebtForm(prev => ({ ...prev, initialAmount: e.target.value }));
                                                                if (debtFormErrors.initialAmount) setDebtFormErrors(prev => ({ ...prev, initialAmount: false }));
                                                            }}
                                                            className={`w-full h-10 bg-[#0d1117] rounded-xl pl-3 pr-12 text-xs text-white font-mono font-bold focus:border-amber-500 outline-none transition-all ${
                                                                debtFormErrors.initialAmount
                                                                    ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]'
                                                                    : 'border border-white/[0.08]'
                                                            }`}
                                                        />
                                                        <span className="absolute right-3 text-xs font-bold text-slate-400 font-mono pointer-events-none select-none">
                                                            {meta.suffix}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Borç Alınma Tarihi */}
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-300 mb-1">Borç Alınma Tarihi *</label>
                                                    <CustomDatePicker
                                                        value={debtForm.date}
                                                        onChange={val => {
                                                            setDebtForm(prev => ({ ...prev, date: val }));
                                                            if (debtFormErrors.date) setDebtFormErrors(prev => ({ ...prev, date: false }));
                                                        }}
                                                        className={`w-full h-10 bg-[#0d1117] rounded-xl px-2 text-xs text-white focus-within:border-amber-500 transition-all ${
                                                            debtFormErrors.date
                                                                ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]'
                                                                : 'border border-white/[0.08]'
                                                        }`}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {debtForm.initialAmount && debtForm.currency !== 'TL' && (
                                            <div className="text-[11px] text-slate-300 font-mono">
                                                Güncel Değer: {formatMoney(calculateTryEquivalent(debtForm.initialAmount, debtForm.currency, effectiveRates))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Vade Durumu / Tipi */}
                            <div className="space-y-2">
                                <label className="block text-xs font-medium text-slate-300">Vade Durumu</label>
                                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0a0d14] border border-white/[0.06] rounded-xl">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDebtForm(prev => ({ ...prev, isVadesiz: true, dueDate: '' }));
                                            if (debtFormErrors.dueDate) setDebtFormErrors(prev => ({ ...prev, dueDate: false }));
                                        }}
                                        className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                            debtForm.isVadesiz
                                                ? 'bg-amber-500 text-black font-bold shadow-sm'
                                                : 'text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        <span>Vadesiz</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDebtForm(prev => ({ ...prev, isVadesiz: false }))}
                                        className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                            !debtForm.isVadesiz
                                                ? 'bg-amber-500 text-black font-bold shadow-sm'
                                                : 'text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        <span>Vadeli</span>
                                    </button>
                                </div>

                                {!debtForm.isVadesiz && (
                                    <div className="space-y-1 pt-1 animate-in fade-in duration-150">
                                        <label className="block text-[11px] font-medium text-slate-400">Hedef Ödeme Vadesi *</label>
                                        <CustomDatePicker
                                            value={debtForm.dueDate}
                                            onChange={val => {
                                                setDebtForm(prev => ({ ...prev, dueDate: val }));
                                                if (debtFormErrors.dueDate) setDebtFormErrors(prev => ({ ...prev, dueDate: false }));
                                            }}
                                            showToday={false}
                                            placeholder=""
                                            className={`w-full h-10 bg-[#0d1117] rounded-xl px-2 text-xs text-white focus-within:border-amber-500 transition-all ${
                                                debtFormErrors.dueDate
                                                    ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]'
                                                    : 'border border-white/[0.08]'
                                            }`}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Not */}
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Açıklama / Not</label>
                                <textarea
                                    rows="2"
                                    placeholder=""
                                    value={debtForm.notes}
                                    onChange={e => setDebtForm(prev => ({ ...prev, notes: e.target.value }))}
                                    className="w-full bg-[#0d1117] border border-white/[0.08] rounded-xl p-3 text-xs text-white focus:border-amber-500 outline-none resize-none"
                                />
                            </div>

                            {/* PDF / Belge Ekleme (Kompakt Simgeli, Geniş Bar Yok) */}
                            <div>
                                <input
                                    ref={debtFileInputRef}
                                    type="file"
                                    multiple
                                    accept="application/pdf,image/*"
                                    className="hidden"
                                    onChange={handleDebtFileSelect}
                                />
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                                        <Paperclip size={12} className="text-slate-400" />
                                        <span>PDF / Dosya Ekle</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => debtFileInputRef.current?.click()}
                                        className="h-6.5 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] text-slate-300 hover:text-white flex items-center gap-1 transition cursor-pointer"
                                    >
                                        <Plus size={11} /> Belge Seç
                                    </button>
                                </div>
                                {debtForm.files && debtForm.files.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {debtForm.files.map((file, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300"
                                            >
                                                <FileText size={11} className="text-red-400 shrink-0" />
                                                <span className="max-w-[140px] truncate">{file.name || `Belge ${idx + 1}`}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setDebtForm(prev => ({
                                                        ...prev,
                                                        files: prev.files.filter((_, i) => i !== idx)
                                                    }))}
                                                    className="text-slate-500 hover:text-rose-400 p-0.5 rounded hover:bg-white/[0.06] cursor-pointer"
                                                >
                                                    <X size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-slate-500 italic">
                                        İsteğe bağlı borç senedi, sözleşme veya PDF ekleyebilirsiniz.
                                    </p>
                                )}
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
                                <button
                                    type="button"
                                    onClick={() => { setIsDebtFormOpen(false); setDebtFormErrors({}); }}
                                    className="h-9 px-4 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="submit"
                                    className="h-9 px-5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20"
                                >
                                    <Check size={14} />
                                    <span>Borcu Kaydet</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODAL: TAKSİTİ ÖDENDİ YAP ── */}
            {selectedInstallment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#07090e] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
                            <h4 className="text-xs font-bold text-white flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-amber-400" />
                                <span>{selectedInstallment.inst.no}. {loans.find(l => l.id === selectedInstallment.loanId)?.loanType === 'senet' ? 'Senet Ödemesi' : 'Taksit Ödemesi'}</span>
                            </h4>
                            <button onClick={() => { setSelectedInstallment(null); setPayModalErrors({}); }} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                                <X size={15} />
                            </button>
                        </div>

                        <form onSubmit={handleConfirmPayment} noValidate className="p-4 space-y-3 overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Gerçek Ödeme Tarihi *</label>
                                <CustomDatePicker
                                    value={payModalForm.paidDate}
                                    onChange={val => {
                                        setPayModalForm(prev => ({ ...prev, paidDate: val }));
                                        if (payModalErrors.paidDate) setPayModalErrors(prev => ({ ...prev, paidDate: false }));
                                    }}
                                    className={`w-full h-10 bg-[#0d1117] rounded-xl px-2 text-xs text-white focus-within:border-amber-500 transition-all ${
                                        payModalErrors.paidDate
                                            ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]'
                                            : 'border border-white/[0.08]'
                                    }`}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Ödenen Tutar (TL) *</label>
                                <input
                                    type="number"
                                    step="any"
                                    placeholder=""
                                    value={payModalForm.paidAmount}
                                    onChange={e => {
                                        setPayModalForm(prev => ({ ...prev, paidAmount: e.target.value }));
                                        if (payModalErrors.paidAmount) setPayModalErrors(prev => ({ ...prev, paidAmount: false }));
                                    }}
                                    className={`w-full h-10 bg-[#0d1117] rounded-xl px-3 text-xs text-white font-mono font-bold focus:border-amber-500 outline-none transition-all ${
                                        payModalErrors.paidAmount
                                            ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]'
                                            : 'border border-white/[0.08]'
                                    }`}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Ödeme Notu / Açıklama</label>
                                <input
                                    type="text"
                                    placeholder=""
                                    value={payModalForm.note}
                                    onChange={e => setPayModalForm(prev => ({ ...prev, note: e.target.value }))}
                                    className="w-full h-10 bg-[#0d1117] border border-white/[0.08] rounded-xl px-3 text-xs text-white focus:border-amber-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">
                                    Ödeme Dekontu / Belgesi (PDF veya Görsel)
                                </label>
                                <FileUpload
                                    files={payModalForm.files || []}
                                    onChange={files => setPayModalForm(prev => ({ ...prev, files }))}
                                    maxSizeMB={5}
                                    hideHint={true}
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
                                <button
                                    type="button"
                                    onClick={() => { setSelectedInstallment(null); setPayModalErrors({}); }}
                                    className="h-8 px-3 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="submit"
                                    className="h-8 px-4 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20"
                                >
                                    <Check size={14} />
                                    <span>Ödendi Olarak Kaydet</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODAL: TAKSİT TUTAR / TARİH / NOT / DEKONT DÜZENLEME ── */}
            {editingInstallmentItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#07090e] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
                            <h4 className="text-xs font-bold text-white flex items-center gap-2">
                                <Pencil size={14} className="text-amber-400" />
                                <span>{editingInstallmentItem.inst.no}. {loans.find(l => l.id === editingInstallmentItem.loanId)?.loanType === 'senet' ? 'Senet Bilgilerini Düzenle' : 'Taksit Bilgilerini Düzenle'}</span>
                            </h4>
                            <button onClick={() => { setEditingInstallmentItem(null); setEditInstErrors({}); }} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                                <X size={15} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEditInstallment} noValidate className="p-4 space-y-3 overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Vade Tarihi *</label>
                                <CustomDatePicker
                                    value={editInstForm.dueDate}
                                    onChange={val => {
                                        setEditInstForm(prev => ({ ...prev, dueDate: val }));
                                        if (editInstErrors.dueDate) setEditInstErrors(prev => ({ ...prev, dueDate: false }));
                                    }}
                                    showToday={false}
                                    className={`w-full h-10 bg-[#0d1117] rounded-xl px-2 text-xs text-white focus-within:border-amber-500 transition-all ${
                                        editInstErrors.dueDate
                                            ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]'
                                            : 'border border-white/[0.08]'
                                    }`}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">
                                    {loans.find(l => l.id === editingInstallmentItem.loanId)?.loanType === 'senet' ? 'Senet Tutarı (TL) *' : 'Taksit Tutarı (TL) *'}
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    placeholder=""
                                    value={editInstForm.amount}
                                    onChange={e => {
                                        setEditInstForm(prev => ({ ...prev, amount: e.target.value }));
                                        if (editInstErrors.amount) setEditInstErrors(prev => ({ ...prev, amount: false }));
                                    }}
                                    className={`w-full h-10 bg-[#0d1117] rounded-xl px-3 text-xs text-white font-mono font-bold focus:border-amber-500 outline-none transition-all ${
                                        editInstErrors.amount
                                            ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]'
                                            : 'border border-white/[0.08]'
                                    }`}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Not / Açıklama</label>
                                <input
                                    type="text"
                                    placeholder=""
                                    value={editInstForm.note}
                                    onChange={e => setEditInstForm(prev => ({ ...prev, note: e.target.value }))}
                                    className="w-full h-10 bg-[#0d1117] border border-white/[0.08] rounded-xl px-3 text-xs text-white focus:border-amber-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">
                                    Dekont / Evrak (PDF veya Görsel)
                                </label>
                                <FileUpload
                                    files={editInstForm.files || []}
                                    onChange={files => setEditInstForm(prev => ({ ...prev, files }))}
                                    maxSizeMB={5}
                                    hideHint={true}
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
                                <button
                                    type="button"
                                    onClick={() => { setEditingInstallmentItem(null); setEditInstErrors({}); }}
                                    className="h-8 px-3 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="submit"
                                    className="h-8 px-4 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20"
                                >
                                    <Check size={14} />
                                    <span>Taksiti Güncelle</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODAL: VADESİZ BORCA KISMİ / TAM ÖDEME DÜŞ ── */}
            {selectedDebtForPayment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#07090e] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
                            <h4 className="text-xs font-bold text-white flex items-center gap-2">
                                <Coins size={15} className="text-amber-400" />
                                <span>{selectedDebtForPayment.creditor} - Ödeme Düş</span>
                            </h4>
                            <button onClick={() => { setSelectedDebtForPayment(null); setPartialPayErrors({}); }} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                                <X size={15} />
                            </button>
                        </div>

                        <form onSubmit={handleAddPartialPayment} noValidate className="p-4 space-y-3 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                            <div className="bg-[#0b0f17] p-2.5 rounded-xl border border-white/[0.05] text-xs">
                                <div className="text-slate-400">Kalan Borç:</div>
                                <div className="flex items-baseline justify-between mt-0.5">
                                    <div className="text-base font-bold text-white font-mono">
                                        {(selectedDebtForPayment.remainingAmount !== undefined ? selectedDebtForPayment.remainingAmount : selectedDebtForPayment.initialAmount).toLocaleString('tr-TR')} {selectedDebtForPayment.currency}
                                    </div>
                                    {selectedDebtForPayment.currency !== 'TL' && (
                                        <div className="text-xs font-mono text-slate-300 font-bold">
                                            {formatMoney(calculateTryEquivalent(selectedDebtForPayment.remainingAmount !== undefined ? selectedDebtForPayment.remainingAmount : selectedDebtForPayment.initialAmount, selectedDebtForPayment.currency, effectiveRates))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {(() => {
                                const meta = getCurrencyMeta(selectedDebtForPayment.currency);
                                return (
                                    <div>
                                        <label className="block text-xs font-medium text-slate-300 mb-1">
                                            Ödenen {meta.label} *
                                        </label>
                                        <div className="relative flex items-center">
                                            <input
                                                type="number"
                                                step="any"
                                                placeholder=""
                                                value={partialPayForm.amount}
                                                onChange={e => {
                                                    setPartialPayForm(prev => ({ ...prev, amount: e.target.value }));
                                                    if (partialPayErrors.amount) setPartialPayErrors(prev => ({ ...prev, amount: false }));
                                                }}
                                                className={`w-full h-10 bg-[#0d1117] rounded-xl pl-3 pr-14 text-xs text-white font-mono font-bold focus:border-amber-500 outline-none transition-all ${
                                                    partialPayErrors.amount
                                                        ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]'
                                                        : 'border border-white/[0.08]'
                                                }`}
                                            />
                                            <span className="absolute right-3 text-xs font-bold text-slate-400 font-mono pointer-events-none select-none">
                                                {meta.suffix}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Ödeme Tarihi *</label>
                                <CustomDatePicker
                                    value={partialPayForm.date}
                                    onChange={val => {
                                        setPartialPayForm(prev => ({ ...prev, date: val }));
                                        if (partialPayErrors.date) setPartialPayErrors(prev => ({ ...prev, date: false }));
                                    }}
                                    className={`w-full h-10 bg-[#0d1117] rounded-xl px-2 text-xs text-white focus-within:border-amber-500 transition-all ${
                                        partialPayErrors.date
                                            ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]'
                                            : 'border border-white/[0.08]'
                                    }`}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Açıklama / Not</label>
                                <input
                                    type="text"
                                    placeholder=""
                                    value={partialPayForm.note}
                                    onChange={e => setPartialPayForm(prev => ({ ...prev, note: e.target.value }))}
                                    className="w-full h-10 bg-[#0d1117] border border-white/[0.08] rounded-xl px-3 text-xs text-white focus:border-amber-500 outline-none"
                                />
                            </div>

                            {/* PDF / Dekont Ekleme (Kompakt Simgeli, Geniş Bar Yok) */}
                            <div>
                                <input
                                    ref={payFileInputRef}
                                    type="file"
                                    multiple
                                    accept="application/pdf,image/*"
                                    className="hidden"
                                    onChange={handlePayFileSelect}
                                />
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                                        <Paperclip size={12} className="text-slate-400" />
                                        <span>Dekont / Belge</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => payFileInputRef.current?.click()}
                                        className="h-6.5 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] text-slate-300 hover:text-white flex items-center gap-1 transition cursor-pointer"
                                    >
                                        <Plus size={11} /> Belge Seç
                                    </button>
                                </div>
                                {partialPayForm.files && partialPayForm.files.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {partialPayForm.files.map((file, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300"
                                            >
                                                <FileText size={11} className="text-red-400 shrink-0" />
                                                <span className="max-w-[140px] truncate">{file.name || `Belge ${idx + 1}`}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setPartialPayForm(prev => ({
                                                        ...prev,
                                                        files: prev.files.filter((_, i) => i !== idx)
                                                    }))}
                                                    className="text-slate-500 hover:text-rose-400 p-0.5 rounded hover:bg-white/[0.06] cursor-pointer"
                                                >
                                                    <X size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-slate-500 italic">
                                        İsteğe bağlı banka dekontu veya makbuz PDF'i ekleyebilirsiniz.
                                    </p>
                                )}
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06] shrink-0">
                                <button
                                    type="button"
                                    onClick={() => { setSelectedDebtForPayment(null); setPartialPayErrors({}); }}
                                    className="h-8 px-3 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="submit"
                                    className="h-8 px-4 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20"
                                >
                                    <Check size={14} />
                                    <span>Ödemeyi Kaydet</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Doğrudan Kart Üzerinden Belge/PDF Yükleme İçin Gizli Input */}
            <input
                ref={directDebtFileInputRef}
                type="file"
                multiple
                accept="application/pdf,image/*"
                className="hidden"
                onChange={handleDirectDebtFileSelect}
            />

        </div>
    );
};

export default CompanyDebts;

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
    Trash2, 
    Pencil, 
    X, 
    Check, 
    RefreshCw, 
    ChevronDown, 
    ChevronUp, 
    DollarSign, 
    Truck, 
    User, 
    Building2, 
    Menu, 
    Sparkles, 
    FileText, 
    ExternalLink,
    HelpCircle,
    ArrowRight
} from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { useCompany } from '../context/CompanyContext';
import { useTruck } from '../context/TruckContext';
import { DataContext } from '../context/DataContext';
import PinLockOverlay from './PinLockOverlay';
import CustomDatePicker from './CustomDatePicker';
import CustomSelect from './CustomSelect';
import { 
    fetchLiveRates, 
    getStoredRates, 
    getEffectiveRates, 
    calculateTryEquivalent, 
    GOLD_PURITY 
} from '../services/currencyService';

const LOAN_TYPES = [
    { id: 'bireysel', label: 'Bireysel Kredi (İhtiyaç / Konut / Şahsi)', icon: User },
    { id: 'ticari', label: 'Ticari / Şirket Kredisi', icon: Building2 },
    { id: 'tasit', label: 'Taşıt Kredisi (Araç / Çekici / Dorse)', icon: Truck },
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
        startDate: new Date().toISOString().split('T')[0],
        totalAmount: '',
        notes: ''
    });

    // Otomatik Toplam Hesaplama (Aylık tutar veya ay sayısı değiştikçe)
    const handleMonthlyOrMonthsChange = (mAmount, mCount) => {
        const amt = parseFloat(mAmount) || 0;
        const count = parseInt(mCount) || 0;
        setLoanForm(prev => ({
            ...prev,
            monthlyAmount: mAmount,
            monthsCount: mCount,
            totalAmount: (amt * count > 0) ? String(amt * count) : prev.totalAmount
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
                    loanTitle: loanForm.loanTitle.trim() || `${loanForm.bankName} Kredisi`,
                    loanType: loanForm.loanType,
                    truckId: loanForm.loanType === 'tasit' ? loanForm.truckId : '',
                    monthlyAmount: monthly,
                    monthsCount: months,
                    startDate: loanForm.startDate,
                    totalAmount: parseFloat(loanForm.totalAmount) || (monthly * months),
                    notes: loanForm.notes || '',
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
                        note: ''
                    });
                }

                await addDoc(collection(db, 'loans'), {
                    companyId: activeCompanyId,
                    bankName: loanForm.bankName.trim(),
                    loanTitle: loanForm.loanTitle.trim() || `${loanForm.bankName} Kredisi`,
                    loanType: loanForm.loanType,
                    truckId: loanForm.loanType === 'tasit' ? loanForm.truckId : '',
                    monthlyAmount: monthly,
                    monthsCount: months,
                    startDate: loanForm.startDate,
                    totalAmount: parseFloat(loanForm.totalAmount) || (monthly * months),
                    notes: loanForm.notes || '',
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
                monthsCount: 18,
                startDate: new Date().toISOString().split('T')[0],
                totalAmount: '',
                notes: ''
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
        note: ''
    });

    const handleOpenPayModal = (loanId, inst) => {
        setSelectedInstallment({ loanId, inst });
        setPayModalErrors({});
        setPayModalForm({
            paidDate: inst.paidDate || new Date().toISOString().split('T')[0],
            paidAmount: inst.paidAmount !== null ? String(inst.paidAmount) : String(inst.amount),
            note: inst.note || ''
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
                    note: payModalForm.note.trim()
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
                    note: ''
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

    // Kredi Taksitini Manuel Düzenleme (Tutar veya Tarih Değiştirme)
    const [editingInstallmentItem, setEditingInstallmentItem] = useState(null); // { loanId, inst }
    const [editInstErrors, setEditInstErrors] = useState({});
    const [editInstForm, setEditInstForm] = useState({ dueDate: '', amount: '' });

    const handleOpenEditInstallment = (loanId, inst) => {
        setEditingInstallmentItem({ loanId, inst });
        setEditInstErrors({});
        setEditInstForm({
            dueDate: inst.dueDate,
            amount: String(inst.amount)
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
                    amount: newAmount
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
        date: new Date().toISOString().split('T')[0],
        isVadesiz: true,
        dueDate: '',
        notes: ''
    });

    // Kısmi Ödeme Modalı
    const [selectedDebtForPayment, setSelectedDebtForPayment] = useState(null);
    const [partialPayErrors, setPartialPayErrors] = useState({});
    const [partialPayForm, setPartialPayForm] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        note: ''
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

        try {
            if (editingDebtId) {
                await updateDoc(doc(db, 'open_debts', editingDebtId), {
                    creditor: debtForm.creditor.trim(),
                    currency: debtForm.currency,
                    date: debtForm.date,
                    dueDate: effectiveDueDate,
                    notes: debtForm.notes.trim(),
                    updatedAt: new Date().toISOString()
                });
            } else {
                await addDoc(collection(db, 'open_debts'), {
                    companyId: activeCompanyId,
                    creditor: debtForm.creditor.trim(),
                    currency: debtForm.currency,
                    initialAmount: amt,
                    remainingAmount: amt,
                    payments: [], // [{ id, date, amount, note }]
                    date: debtForm.date,
                    dueDate: effectiveDueDate,
                    notes: debtForm.notes.trim(),
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
                date: new Date().toISOString().split('T')[0],
                isVadesiz: true,
                dueDate: '',
                notes: ''
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
                note: ''
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
                    <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                        Kredi & Borç Yönetimi
                    </h2>
                </div>

                {/* Sağ Aksiyon: Sadece Kilit Simgesi */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleLock}
                        className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.08] flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                        title="Kasayı Kilitle"
                    >
                        <Lock size={15} />
                    </button>
                </div>
            </div>

            {/* ── Döviz & Altın Kurları Bantı ── */}
            <div className="shrink-0 flex items-center justify-between gap-2 overflow-x-auto custom-scrollbar py-2 px-3 sm:px-4 rounded-2xl bg-[#0a0d14] border border-white/[0.06] text-xs">
                {/* Kur Mikro Kartları (Döviz & Altın) */}
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar py-0.5">
                    {/* USD */}
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/20 transition-all font-mono whitespace-nowrap">
                        <span className="text-slate-400 font-sans font-semibold text-[11px]">USD</span>
                        <span className="font-bold text-white">₺{effectiveRates.USD}</span>
                    </div>

                    {/* EUR */}
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/20 transition-all font-mono whitespace-nowrap">
                        <span className="text-slate-400 font-sans font-semibold text-[11px]">EUR</span>
                        <span className="font-bold text-white">₺{effectiveRates.EUR}</span>
                    </div>

                    {/* Gram Altın (24A Has) */}
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/20 transition-all font-mono whitespace-nowrap">
                        <span className="text-slate-400 font-sans font-semibold text-[11px]">Gram (24A)</span>
                        <span className="font-bold text-white">₺{effectiveRates.GOLD_GRAM_24?.toLocaleString('tr-TR')}</span>
                    </div>

                    {/* 22A Bilezik */}
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/20 transition-all font-mono whitespace-nowrap">
                        <span className="text-slate-400 font-sans font-semibold text-[11px]">22A Bilezik</span>
                        <span className="font-bold text-white">₺{effectiveRates.GOLD_BILEZIK_22?.toLocaleString('tr-TR')}</span>
                    </div>

                    {/* Çeyrek */}
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/20 transition-all font-mono whitespace-nowrap">
                        <span className="text-slate-400 font-sans font-semibold text-[11px]">Çeyrek</span>
                        <span className="font-bold text-white">₺{effectiveRates.GOLD_CEYREK?.toLocaleString('tr-TR')}</span>
                    </div>

                    {/* Yarım */}
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/20 transition-all font-mono whitespace-nowrap">
                        <span className="text-slate-400 font-sans font-semibold text-[11px]">Yarım</span>
                        <span className="font-bold text-white">₺{effectiveRates.GOLD_YARIM?.toLocaleString('tr-TR')}</span>
                    </div>

                    {/* Ata / Ziynet */}
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/20 transition-all font-mono whitespace-nowrap">
                        <span className="text-slate-400 font-sans font-semibold text-[11px]">Ata / Ziynet</span>
                        <span className="font-bold text-white">₺{effectiveRates.GOLD_ATA?.toLocaleString('tr-TR')}</span>
                    </div>
                </div>

                {/* Sağ: Sadece Yenile Butonu */}
                <button
                    onClick={handleRefreshRates}
                    disabled={isRefreshingRates}
                    className="h-7 w-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.08] flex items-center justify-center transition cursor-pointer shrink-0 ml-2"
                    title="Kurları Yenile"
                >
                    <RefreshCw size={12} className={isRefreshingRates ? 'animate-spin text-amber-400' : ''} />
                </button>
            </div>

            {/* ── 1. Bento KPI Kartları (Sade & Zarif 60-30-10 - Mobilde 2x2 Kompakt Grid) ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 shrink-0">
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
                <div className={`relative overflow-hidden rounded-xl sm:rounded-2xl border p-2.5 sm:p-4 flex flex-col justify-center ${
                    kpiMetrics.overdueCount > 0 
                        ? 'bg-rose-950/15 border-rose-500/25' 
                        : 'bg-[#0a0d14] border-white/[0.06]'
                }`}>
                    <div className="flex items-center mb-1 sm:mb-1.5">
                        <span className="text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 truncate text-slate-400">
                            <Clock size={13} className={`${kpiMetrics.overdueCount > 0 ? 'text-rose-400' : 'text-slate-400'} shrink-0`} />
                            <span className="truncate">Geciken Taksitler</span>
                        </span>
                    </div>
                    <h3 className={`text-base sm:text-xl lg:text-2xl font-bold font-mono tracking-tight truncate ${
                        kpiMetrics.overdueCount > 0 ? 'text-rose-400' : 'text-white'
                    }`}>
                        {kpiMetrics.overdueCount > 0 ? formatMoney(kpiMetrics.overdueTL) : '₺0'}
                    </h3>
                </div>
            </div>

            {/* ── 2. Segmentli Sekme Butonları & Yeni Ekle Butonları ── */}
            <div className="flex items-center justify-between gap-3 shrink-0 pb-1">
                {/* Sol: Sekme Seçimi (Kayan animasyonlu indicator) */}
                <div className="flex items-center p-1 rounded-xl bg-[#0a0d14] border border-white/[0.06] relative">
                    <button
                        onClick={() => setActiveSubTab('loans')}
                        className={`relative flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 cursor-pointer ${
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
                        <span className="relative z-10 flex items-center gap-2">
                            <CreditCard size={14} />
                            <span>Taksitli Krediler</span>
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveSubTab('open_debts')}
                        className={`relative flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 cursor-pointer ${
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
                        <span className="relative z-10 flex items-center gap-2">
                            <Coins size={14} />
                            <span>Vadesiz Borçlar</span>
                        </span>
                    </button>
                </div>

                {/* Sağ: Yeni Ekle Butonu (Sabit Genişlik: w-36 ile sıçrama yapmaz) */}
                {activeSubTab === 'loans' ? (
                    <button
                        onClick={() => {
                            setEditingLoanId(null);
                            setLoanFormErrors({});
                            setLoanForm({
                                bankName: '',
                                loanTitle: '',
                                loanType: 'bireysel',
                                truckId: '',
                                monthlyAmount: '',
                                monthsCount: '',
                                startDate: new Date().toISOString().split('T')[0],
                                totalAmount: '',
                                notes: ''
                            });
                            setIsLoanFormOpen(true);
                        }}
                        className="h-8 w-36 justify-center rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm shrink-0"
                    >
                        <Plus size={15} />
                        <span>Yeni Kredi Ekle</span>
                    </button>
                ) : (
                    <button
                        onClick={() => {
                            setEditingDebtId(null);
                            setDebtFormErrors({});
                            setDebtForm({
                                creditor: '',
                                currency: 'TL',
                                initialAmount: '',
                                date: new Date().toISOString().split('T')[0],
                                isVadesiz: true,
                                dueDate: '',
                                notes: ''
                            });
                            setIsDebtFormOpen(true);
                        }}
                        className="h-8 w-36 justify-center rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm shrink-0"
                    >
                        <Plus size={15} />
                        <span>Yeni Borç Ekle</span>
                    </button>
                )}
            </div>

            {/* ── 3. ANA İÇERİK LİSTESİ (KAYDIRILABİLİR) ── */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-0.5 space-y-4">
                
                {/* ── SEKME 1: KREDİLER & TAKSİT PLANI ── */}
                {activeSubTab === 'loans' && (
                    <div className="space-y-4">
                        {loans.length === 0 ? (
                            <div className="bg-[#0a0d14] border border-white/[0.06] rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center justify-center">
                                <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-slate-400 mb-3">
                                    <CreditCard size={22} />
                                </div>
                                <h4 className="text-sm font-semibold text-white mb-1">Henüz Kayıtlı Kredi Bulunmuyor</h4>
                                <p className="text-xs text-slate-500 max-w-sm mb-4">
                                    Bireysel, ticari veya araç kredilerinizi ekleyerek aylık taksit itfa takvimini ve kalan borçlarınızı anlık takip edebilirsiniz.
                                </p>
                                <button
                                    onClick={() => setIsLoanFormOpen(true)}
                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition cursor-pointer shadow-sm"
                                >
                                    İlk Kredinizi Ekleyin
                                </button>
                            </div>
                        ) : (
                            loans.map((loan) => {
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

                                return (
                                    <div 
                                        key={loan.id}
                                        className="bg-[#070a0f] border border-white/[0.08] hover:border-white/[0.15] rounded-2xl overflow-hidden transition-all duration-200 shadow-md shadow-black/40"
                                    >
                                        {/* Kredi Üst Kart Başlığı */}
                                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-white/[0.02] to-transparent">
                                            <div className="flex items-start gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                                                    {loan.loanType === 'tasit' ? <Truck size={18} /> : loan.loanType === 'ticari' ? <Building2 size={18} /> : <User size={18} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        <h4 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                                                            {loan.bankName} - {loan.loanTitle}
                                                        </h4>
                                                        {loan.status === 'closed' ? (
                                                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                                                                TAMAMLANDI
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                                                                ÖDENİYOR
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] bg-white/5 text-slate-400 border border-white/10 px-2 py-0.5 rounded-full font-medium">
                                                            {loan.loanType === 'tasit' ? `Taşıt (${truckObj?.plate || 'Araç'})` : loan.loanType === 'ticari' ? 'Ticari / Şirket' : 'Bireysel / Şahsi'}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-4 text-xs text-slate-400">
                                                        <span>Aylık Taksit: <strong className="text-white font-mono">{formatMoney(loan.monthlyAmount)}</strong></span>
                                                        <span>•</span>
                                                        <span>Kalan: <strong className="text-amber-400 font-mono">{remainingCount} Ay</strong> / {totalCount} Ay</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Sağ Tutar & Aksiyon Butonları */}
                                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
                                                <div className="text-left sm:text-right">
                                                    <div className="text-[11px] text-slate-400 font-medium">Kalan Kredi Borcu</div>
                                                    <div className="text-base sm:text-lg font-black text-white font-mono">
                                                        {formatMoney(totalRemainingTL)}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1.5">
                                                    {loan.status !== 'closed' && (
                                                        <button
                                                            onClick={() => handleCloseLoanEarly(loan.id)}
                                                            className="h-8 px-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                                                            title="Kalan borcu erken kapat"
                                                        >
                                                            <CheckCircle2 size={13} className="text-emerald-400" />
                                                            <span className="hidden sm:inline">Erken Kapat</span>
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => handleDeleteLoan(loan.id, loan.bankName)}
                                                        className="p-2 text-slate-500 hover:text-rose-400 rounded-xl hover:bg-rose-500/10 transition cursor-pointer"
                                                        title="Krediyi Sil"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>

                                                    <button
                                                        onClick={() => setExpandedLoanId(isExpanded ? null : loan.id)}
                                                        className="h-8 px-3 rounded-xl bg-[#0d1117] hover:bg-white/[0.08] text-white text-xs font-bold border border-white/[0.08] flex items-center gap-1 transition cursor-pointer"
                                                    >
                                                        <span>{isExpanded ? 'Taksitleri Gizle' : 'Taksit Planı'}</span>
                                                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* İlerleme Çubuğu (Progress Bar) */}
                                        <div className="px-4 sm:px-5 pb-3">
                                            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                                                <span>Ödenen: {formatMoney(totalPaidTL)} ({paidCount} Taksit)</span>
                                                <span className="font-bold text-amber-400">%{progressPercent} Tamamlandı</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-500 rounded-full"
                                                    style={{ width: `${progressPercent}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Açılır Taksit Tablosu */}
                                        {isExpanded && (
                                            <div className="border-t border-white/[0.08] bg-[#05070a] p-3 sm:p-5 animate-in fade-in duration-200">
                                                <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/[0.06]">
                                                    <h5 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                                        <Calendar size={13} className="text-amber-400" />
                                                        <span>Taksit Takvimi & Ödeme Durumları ({installments.length} Ay)</span>
                                                    </h5>
                                                    <span className="text-[11px] text-slate-400">
                                                        Taksit tutarını veya tarihini sağdaki düzenle butonuyla değiştirebilirsiniz.
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                                                    {installments.map((inst) => {
                                                        const isPaid = inst.status === 'paid';
                                                        const isEarlyClosed = inst.status === 'early_closed';
                                                        const todayStr = new Date().toISOString().split('T')[0];
                                                        const isOverdue = !isPaid && !isEarlyClosed && inst.dueDate < todayStr;
                                                        const isCurrentMonth = !isPaid && !isEarlyClosed && (inst.dueDate || '').substring(0, 7) === todayStr.substring(0, 7);

                                                        return (
                                                            <div 
                                                                key={inst.no}
                                                                className={`rounded-xl p-3 border transition flex flex-col justify-between ${
                                                                    isPaid
                                                                        ? 'bg-emerald-950/15 border-emerald-500/30'
                                                                        : isEarlyClosed
                                                                            ? 'bg-white/[0.02] border-white/[0.06] opacity-60'
                                                                            : isOverdue
                                                                                ? 'bg-rose-950/20 border-rose-500/40 shadow-sm shadow-rose-500/10'
                                                                                : isCurrentMonth
                                                                                    ? 'bg-amber-950/20 border-amber-500/35 shadow-sm shadow-amber-500/10'
                                                                                    : 'bg-[#0a0d13] border-white/[0.06]'
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between mb-1.5">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-xs font-bold font-mono text-white">
                                                                            {inst.no}. Taksit
                                                                        </span>
                                                                        {isPaid && (
                                                                            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                                                                                ÖDENDİ
                                                                            </span>
                                                                        )}
                                                                        {isEarlyClosed && (
                                                                            <span className="text-[9px] bg-white/10 text-slate-300 px-1.5 py-0.2 rounded font-bold">
                                                                                KAPATILDI
                                                                            </span>
                                                                        )}
                                                                        {isOverdue && (
                                                                            <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded font-bold animate-pulse">
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
                                                                        title="Taksit Detayını Düzenle"
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
                                                                        <div className="text-[10px] text-emerald-400/90 mt-0.5 font-medium">
                                                                            ✓ Ödendi: {inst.paidDate} ({formatMoney(inst.paidAmount || inst.amount)})
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Taksit Aksiyon Butonu */}
                                                                <div className="pt-1.5 border-t border-white/[0.05]">
                                                                    {isPaid ? (
                                                                        <button
                                                                            onClick={() => handleCancelPayment(loan.id, inst.no)}
                                                                            className="w-full h-7 rounded-lg bg-white/[0.03] hover:bg-rose-500/15 text-slate-400 hover:text-rose-300 text-[10px] font-semibold transition cursor-pointer flex items-center justify-center gap-1"
                                                                        >
                                                                            <X size={11} /> Ödemeyi Geri Al
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleOpenPayModal(loan.id, inst)}
                                                                            className={`w-full h-7 rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
                                                                                isOverdue
                                                                                    ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-sm shadow-rose-500/20'
                                                                                    : isCurrentMonth
                                                                                        ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-sm shadow-amber-500/20'
                                                                                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                                                                            }`}
                                                                        >
                                                                            <Check size={12} /> Ödendi Olarak İşle
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
                    <div className="space-y-4">
                        {openDebts.length === 0 ? (
                            <div className="bg-[#0a0d14] border border-white/[0.06] rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center justify-center">
                                <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-slate-400 mb-3">
                                    <Coins size={22} />
                                </div>
                                <h4 className="text-sm font-semibold text-white mb-1">Henüz Vadesiz Borç Kaydı Yok</h4>
                                <p className="text-xs text-slate-500 max-w-sm mb-4">
                                    Kişilere, esnafa veya kurumlara olan TL, Dolar, Euro veya Altın (22A Bilezik, Gram, Çeyrek) borçlarınızı canlı kurlarla kaydedip anlık TL karşılığını görebilirsiniz.
                                </p>
                                <button
                                    onClick={() => setIsDebtFormOpen(true)}
                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition cursor-pointer shadow-sm"
                                >
                                    İlk Borç Kaydını Ekleyin
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                                {openDebts.map((debt) => {
                                    const initialAmt = Number(debt.initialAmount) || 0;
                                    const remainingAmt = debt.remainingAmount !== undefined ? Number(debt.remainingAmount) : initialAmt;
                                    const paidAmt = initialAmt - remainingAmt;

                                    const curInfo = CURRENCY_TYPES.find(c => c.id === debt.currency) || CURRENCY_TYPES[0];
                                    const tryEquivalent = calculateTryEquivalent(remainingAmt, debt.currency, effectiveRates);

                                    const payments = debt.payments || [];
                                    const isSettled = remainingAmt <= 0;

                                    return (
                                        <div 
                                            key={debt.id}
                                            className={`rounded-2xl p-4 sm:p-5 border transition-all flex flex-col justify-between shadow-md shadow-black/40 ${
                                                isSettled
                                                    ? 'bg-[#06080d] border-white/[0.04] opacity-75'
                                                    : 'bg-[#070a0f] border-white/[0.08] hover:border-amber-500/30'
                                            }`}
                                        >
                                            <div>
                                                {/* Üst Kısım: Alacaklı & Durum Rozeti */}
                                                <div className="flex items-start justify-between gap-2 mb-3">
                                                    <div>
                                                        <span className="text-[10px] font-bold text-amber-400 tracking-wider uppercase">
                                                            {curInfo.group} Borcu
                                                        </span>
                                                        <h4 className="text-sm sm:text-base font-bold text-white tracking-tight">
                                                            {debt.creditor}
                                                        </h4>
                                                    </div>

                                                    <div className="flex items-center gap-1.5">
                                                        {isSettled ? (
                                                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold border border-emerald-500/30">
                                                                KAPANDI
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-full font-bold border border-amber-500/30">
                                                                AKTİF
                                                            </span>
                                                        )}

                                                        <button
                                                            onClick={() => handleDeleteOpenDebt(debt.id, debt.creditor)}
                                                            className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition cursor-pointer"
                                                            title="Kaydı Sil"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Kalan Borç Tutarı & Canlı TL Karşılığı */}
                                                <div className="bg-[#0b0f17] border border-white/[0.05] rounded-xl p-3 mb-3">
                                                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                                                        <span>Kalan Miktar:</span>
                                                        <span className="font-bold text-white font-mono text-sm">
                                                            {remainingAmt.toLocaleString('tr-TR')} {curInfo.symbol}
                                                        </span>
                                                    </div>

                                                    {debt.currency !== 'TL' && (
                                                        <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
                                                            <span className="text-[11px] text-amber-400/90 font-medium">Güncel TL Değeri:</span>
                                                            <span className="font-black text-amber-400 font-mono text-sm sm:text-base">
                                                                {formatMoney(tryEquivalent)}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {initialAmt > remainingAmt && (
                                                        <div className="mt-1.5 text-[10px] text-emerald-400/80">
                                                            ✓ {paidAmt.toLocaleString('tr-TR')} {curInfo.symbol} ödendi (Başlangıç: {initialAmt} {curInfo.symbol})
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Açıklama & Tarih */}
                                                <div className="space-y-1 text-xs text-slate-400 mb-3">
                                                    {debt.notes && (
                                                        <p className="italic text-slate-300 bg-white/[0.02] p-2 rounded-lg text-[11px] border border-white/[0.04]">
                                                            "{debt.notes}"
                                                        </p>
                                                    )}
                                                    <div className="flex items-center justify-between text-[11px] pt-1">
                                                        <span>Alınma: {debt.date}</span>
                                                        {debt.dueDate ? (
                                                            <span className="text-slate-300 font-mono">Vade: {debt.dueDate}</span>
                                                        ) : (
                                                            <span className="text-emerald-400 font-medium">Vadesiz (Esnek)</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Ödeme Geçmişi Özeti */}
                                                {payments.length > 0 && (
                                                    <div className="mb-3 space-y-1">
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                                            Ödeme Geçmişi ({payments.length})
                                                        </span>
                                                        <div className="max-h-24 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                                                            {payments.map(p => (
                                                                <div key={p.id} className="text-[10px] flex items-center justify-between p-1.5 rounded bg-white/[0.02] border border-white/[0.04]">
                                                                    <span className="text-slate-300">{p.date}: {p.note || 'Ödeme'}</span>
                                                                    <span className="font-bold text-emerald-400 font-mono">
                                                                        -{p.amount} {curInfo.symbol}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Alt Aksiyon Butonu */}
                                            {!isSettled && (
                                                <button
                                                    onClick={() => {
                                                        setSelectedDebtForPayment(debt);
                                                        setPartialPayForm({
                                                            amount: '',
                                                            date: new Date().toISOString().split('T')[0],
                                                            note: ''
                                                        });
                                                    }}
                                                    className="w-full h-8 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                                                >
                                                    <Plus size={14} /> Ödeme Düş / Kapat
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
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
                                <span>{editingLoanId ? 'Krediyi Düzenle' : 'Yeni Kredi Tanımla'}</span>
                            </h4>
                            <button onClick={() => { setIsLoanFormOpen(false); setLoanFormErrors({}); }} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Form Gövdesi */}
                        <form onSubmit={handleSaveLoan} noValidate className="p-4 sm:p-5 overflow-y-auto space-y-3.5 custom-scrollbar">
                            {/* Kredi Türü */}
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1.5">Kredi Türü</label>
                                <div className="grid grid-cols-3 gap-2">
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

                            {/* Taşıt Kredisi ise Araç Seçimi */}
                            {loanForm.loanType === 'tasit' && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-300 mb-1">İlgili Araç (Plaka)</label>
                                    <select
                                        value={loanForm.truckId}
                                        onChange={e => setLoanForm(prev => ({ ...prev, truckId: e.target.value }))}
                                        className="w-full h-10 bg-[#0d1117] border border-white/[0.08] rounded-xl px-3 text-xs text-white focus:border-amber-500 outline-none"
                                    >
                                        <option value="">Genel Taşıt (Plaka Seçilmedi)</option>
                                        {trucks.map(t => (
                                             <option key={t.id} value={t.id}>{t.plate} - {t.brand || 'Araç'}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Banka Adı & Başlık */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-300 mb-1">Banka / Finansman Kurumu *</label>
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
                                    <label className="block text-xs font-medium text-slate-300 mb-1">Kredi Adı / Tanımı</label>
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
                                    <label className="block text-xs font-medium text-slate-300 mb-1">Aylık Taksit Tutarı (TL) *</label>
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
                                    <label className="block text-xs font-medium text-slate-300 mb-1">Vade / Ay Sayısı *</label>
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
                                    <label className="block text-xs font-medium text-slate-300 mb-1">İlk Taksit Tarihi *</label>
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
                                    <label className="block text-xs font-medium text-slate-300 mb-1">Toplam Geri Ödeme (TL)</label>
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
                                <label className="block text-xs font-medium text-slate-300 mb-1">Özel Notlar</label>
                                <textarea
                                    rows="2"
                                    placeholder=""
                                    value={loanForm.notes}
                                    onChange={e => setLoanForm(prev => ({ ...prev, notes: e.target.value }))}
                                    className="w-full bg-[#0d1117] border border-white/[0.08] rounded-xl p-3 text-xs text-white focus:border-amber-500 outline-none resize-none"
                                />
                            </div>

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
                                    <span>{editingLoanId ? 'Değişiklikleri Kaydet' : 'Krediyi ve Taksitleri Oluştur'}</span>
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
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Alacaklı Kişi / Kurum / Esnaf *</label>
                                <input
                                    type="text"
                                    placeholder=""
                                    value={debtForm.creditor}
                                    onChange={e => {
                                        setDebtForm(prev => ({ ...prev, creditor: e.target.value }));
                                        if (debtFormErrors.creditor) setDebtFormErrors(prev => ({ ...prev, creditor: false }));
                                    }}
                                    className={`w-full h-10 bg-[#0d1117] rounded-xl px-3 text-xs text-white focus:border-amber-500 outline-none transition-all ${
                                        debtFormErrors.creditor
                                            ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]'
                                            : 'border border-white/[0.08]'
                                    }`}
                                />
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
                                    <div>
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

                                        {debtForm.initialAmount && debtForm.currency !== 'TL' && (
                                            <div className="mt-1 text-[11px] text-amber-400 font-mono">
                                                ≈ Güncel Değer: {formatMoney(calculateTryEquivalent(debtForm.initialAmount, debtForm.currency, effectiveRates))}
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
                    <div className="bg-[#07090e] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
                        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                            <h4 className="text-xs font-bold text-white flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-emerald-400" />
                                <span>{selectedInstallment.inst.no}. Taksit Ödemesi</span>
                            </h4>
                            <button onClick={() => { setSelectedInstallment(null); setPayModalErrors({}); }} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                                <X size={15} />
                            </button>
                        </div>

                        <form onSubmit={handleConfirmPayment} noValidate className="p-4 space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Gerçek Ödeme Tarihi *</label>
                                <CustomDatePicker
                                    value={payModalForm.paidDate}
                                    onChange={val => {
                                        setPayModalForm(prev => ({ ...prev, paidDate: val }));
                                        if (payModalErrors.paidDate) setPayModalErrors(prev => ({ ...prev, paidDate: false }));
                                    }}
                                    className={`w-full h-10 bg-[#0d1117] rounded-xl px-2 text-xs text-white focus-within:border-emerald-500 transition-all ${
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
                                    className={`w-full h-10 bg-[#0d1117] rounded-xl px-3 text-xs text-white font-mono font-bold focus:border-emerald-500 outline-none transition-all ${
                                        payModalErrors.paidAmount
                                            ? 'border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/[0.04]'
                                            : 'border border-white/[0.08]'
                                    }`}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Ödeme Notu / Dekont No</label>
                                <input
                                    type="text"
                                    placeholder=""
                                    value={payModalForm.note}
                                    onChange={e => setPayModalForm(prev => ({ ...prev, note: e.target.value }))}
                                    className="w-full h-10 bg-[#0d1117] border border-white/[0.08] rounded-xl px-3 text-xs text-white focus:border-emerald-500 outline-none"
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
                                    className="h-8 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/20"
                                >
                                    <Check size={14} />
                                    <span>Ödendi Olarak Kaydet</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODAL: TAKSİT TUTAR / TARİH DÜZENLEME ── */}
            {editingInstallmentItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#07090e] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
                        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                            <h4 className="text-xs font-bold text-white flex items-center gap-2">
                                <Pencil size={14} className="text-amber-400" />
                                <span>{editingInstallmentItem.inst.no}. Taksit Bilgilerini Düzenle</span>
                            </h4>
                            <button onClick={() => { setEditingInstallmentItem(null); setEditInstErrors({}); }} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                                <X size={15} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEditInstallment} noValidate className="p-4 space-y-3">
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
                                <label className="block text-xs font-medium text-slate-300 mb-1">Taksit Tutarı (TL) *</label>
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
                    <div className="bg-[#07090e] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
                        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                            <h4 className="text-xs font-bold text-white flex items-center gap-2">
                                <Coins size={15} className="text-amber-400" />
                                <span>{selectedDebtForPayment.creditor} - Ödeme Düş</span>
                            </h4>
                            <button onClick={() => { setSelectedDebtForPayment(null); setPartialPayErrors({}); }} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                                <X size={15} />
                            </button>
                        </div>

                        <form onSubmit={handleAddPartialPayment} noValidate className="p-4 space-y-3">
                            <div className="bg-[#0b0f17] p-2.5 rounded-xl border border-white/[0.05] text-xs">
                                <div className="text-slate-400">Kalan Borç:</div>
                                <div className="text-base font-bold text-white font-mono mt-0.5">
                                    {(selectedDebtForPayment.remainingAmount !== undefined ? selectedDebtForPayment.remainingAmount : selectedDebtForPayment.initialAmount).toLocaleString('tr-TR')} {selectedDebtForPayment.currency}
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
                                                placeholder={meta.placeholder}
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

                            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
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

        </div>
    );
};

export default CompanyDebts;

import React, { useState, useContext, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DataContext } from '../context/DataContext';
import { useCompany } from '../context/CompanyContext';
import {
    Scale,
    Plus,
    Search,
    Calendar,
    Trash2,
    Edit3,
    X,
    Check,
    FileText,
    Paperclip,
    ExternalLink,
    Download,
    Menu,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Filter,
    Settings,
    Tag,
    ArrowUpRight,
    TrendingUp,
    Receipt,
    Wallet,
    Building2,
    Eye
} from 'lucide-react';
import FileUpload from './FileUpload';

// ── Varsayılan Standart Vergi ve SGK Türleri ──
const DEFAULT_TAX_TYPES = [
    { id: 'kdv1', name: 'KDV 1 (Katma Değer Vergisi)', category: 'vergi' },
    { id: 'muhtasar', name: 'Muhtasar ve Prim Hizmet Beyannamesi', category: 'vergi' },
    { id: 'gecici_vergi', name: 'Geçici Vergi (Kurumlar / Gelir)', category: 'vergi' },
    { id: 'kurumlar_vergisi', name: 'Kurumlar / Yıllık Gelir Vergisi', category: 'vergi' },
    { id: 'mtv', name: 'Motorlu Taşıtlar Vergisi (MTV)', category: 'vergi' },
    { id: 'sgk', name: 'SGK Prim Ödemesi', category: 'sgk' },
    { id: 'damga', name: 'Damga Vergisi', category: 'vergi' },
];

const Payments = ({ onOpenMenu, isMobile } = {}) => {
    const {
        paymentRecords,
        addPayment,
        deletePayment,
        updatePayment,
        addLog
    } = useContext(DataContext);
    const { activeCompanyId } = useCompany();

    // ── Dinamik Vergi Türü Hafızası (Şirket Bazlı) ──
    const [customTaxTypes, setCustomTaxTypes] = useState(() => {
        try {
            const saved = localStorage.getItem(`tax_types_${activeCompanyId || 'default'}`);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    useEffect(() => {
        try {
            const saved = localStorage.getItem(`tax_types_${activeCompanyId || 'default'}`);
            setCustomTaxTypes(saved ? JSON.parse(saved) : []);
        } catch {
            setCustomTaxTypes([]);
        }
    }, [activeCompanyId]);

    const saveCustomTaxTypesList = (newList) => {
        setCustomTaxTypes(newList);
        try {
            localStorage.setItem(`tax_types_${activeCompanyId || 'default'}`, JSON.stringify(newList));
        } catch (err) {
            console.error('Vergi türleri kaydedilemedi:', err);
        }
    };

    // Tüm Vergi Türleri Listesi (Standart + Özel Hafıza)
    const allTaxTypes = useMemo(() => {
        const customObjects = customTaxTypes.map(name => ({
            id: `custom_${name}`,
            name,
            category: name.toLowerCase().includes('sgk') ? 'sgk' : 'vergi',
            isCustom: true
        }));
        return [...DEFAULT_TAX_TYPES, ...customObjects];
    }, [customTaxTypes]);

    // ── Filtreler & Arama State'leri ──
    const [activeTabFilter, setActiveTabFilter] = useState('all'); // 'all' | 'vergi' | 'sgk' | 'pending' | 'paid'
    const [filterMonth, setFilterMonth] = useState('all'); // 'all' | 'YYYY-MM'
    const [searchTerm, setSearchTerm] = useState('');

    // ── Form & Studio State'leri ──
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingPaymentId, setEditingPaymentId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCustomTypeInput, setIsCustomTypeInput] = useState(false);
    const [customTypeInputValue, setCustomTypeInputValue] = useState('');

    // Form Verileri
    const [formData, setFormData] = useState({
        subCategory: 'vergi', // 'vergi' | 'sgk'
        taxType: 'KDV 1 (Katma Değer Vergisi)',
        period: new Date().toISOString().slice(0, 7), // 'YYYY-MM'
        date: new Date().toISOString().split('T')[0], // İşlem / Tahakkuk Tarihi
        dueDate: new Date().toISOString().split('T')[0], // Yasal Vade
        amount: '',
        status: 'paid', // 'paid' | 'pending'
        description: '',
        note: '',
        files: []
    });

    // ── Modal State'leri ──
    const [previewDoc, setPreviewDoc] = useState(null);
    const [isTaxTypeManagerOpen, setIsTaxTypeManagerOpen] = useState(false);
    const [newTaxTypeName, setNewTaxTypeName] = useState('');

    // Para birimi formatlayıcı
    const formatCurrency = (val) => {
        const num = Number(val) || 0;
        return `₺${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // ── Dinamik Dönem Listesi (Filtre İçin) ──
    const monthOptions = useMemo(() => {
        const options = [{ value: 'all', label: 'Tüm Dönemler' }];
        const activeList = (paymentRecords || []).filter(r => !r.deleted);

        const uniqueMonths = [...new Set(activeList.map(r => {
            if (r.period) return r.period;
            if (r.date) return r.date.substring(0, 7);
            return null;
        }).filter(Boolean))].sort().reverse();

        const currentYm = new Date().toISOString().slice(0, 7);
        if (!uniqueMonths.includes(currentYm)) {
            uniqueMonths.unshift(currentYm);
        }

        uniqueMonths.forEach(ym => {
            const [y, m] = ym.split('-');
            const year = parseInt(y, 10);
            const monthIndex = parseInt(m, 10) - 1;
            const date = new Date(year, monthIndex, 1);
            const monthName = date.toLocaleString('tr-TR', { month: 'long' });
            const capMonthName = monthName.charAt(0).toLocaleUpperCase('tr-TR') + monthName.slice(1);
            options.push({ value: ym, label: `${capMonthName} ${year}` });
        });

        return options;
    }, [paymentRecords]);

    // ── Filtrelenmiş Resmi Ödeme Kayıtları ──
    const filteredRecords = useMemo(() => {
        let records = (paymentRecords || []).filter(r => !r.deleted);

        // Tarihe göre sırala (en yeni en üstte)
        records.sort((a, b) => new Date(b.date || b.dueDate || 0) - new Date(a.date || a.dueDate || 0));

        // Alt Kategori / Durum Filtresi
        if (activeTabFilter === 'vergi') {
            records = records.filter(r => r.subCategory === 'vergi' || (!r.subCategory && r.category !== 'SGK & Vergi'));
        } else if (activeTabFilter === 'sgk') {
            records = records.filter(r => r.subCategory === 'sgk' || r.category === 'SGK & Vergi');
        } else if (activeTabFilter === 'pending') {
            records = records.filter(r => r.status === 'pending');
        } else if (activeTabFilter === 'paid') {
            records = records.filter(r => r.status === 'paid');
        }

        // Dönem Filtresi
        if (filterMonth !== 'all') {
            records = records.filter(r => {
                const recPeriod = r.period || (r.date ? r.date.substring(0, 7) : '');
                return recPeriod === filterMonth;
            });
        }

        // Arama Terimi
        if (searchTerm.trim()) {
            const q = searchTerm.trim().toLocaleLowerCase('tr-TR');
            records = records.filter(r => {
                const desc = (r.description || '').toLocaleLowerCase('tr-TR');
                const taxType = (r.taxType || '').toLocaleLowerCase('tr-TR');
                const note = (r.note || '').toLocaleLowerCase('tr-TR');
                const amountStr = String(r.amount || '');
                return desc.includes(q) || taxType.includes(q) || note.includes(q) || amountStr.includes(q);
            });
        }

        return records;
    }, [paymentRecords, activeTabFilter, filterMonth, searchTerm]);

    // ── KPI Metrikleri ──
    const kpiMetrics = useMemo(() => {
        const activeList = (paymentRecords || []).filter(r => !r.deleted);
        const currentYm = new Date().toISOString().slice(0, 7);
        const currentYear = new Date().getFullYear().toString();

        // Bu ay ödenenler
        const paidThisMonthRecords = activeList.filter(r => {
            const recPeriod = r.period || (r.date ? r.date.substring(0, 7) : '');
            return recPeriod === currentYm && r.status === 'paid';
        });
        const paidThisMonthTotal = paidThisMonthRecords.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

        // Vadesi bekleyenler (Ödenmemişler)
        const pendingRecords = activeList.filter(r => r.status === 'pending');
        const pendingTotal = pendingRecords.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

        // Yıllık kümülatif resmi ödemeler
        const yearlyPaidRecords = activeList.filter(r => {
            const recYear = (r.date || r.period || '').substring(0, 4);
            return recYear === currentYear && r.status === 'paid';
        });
        const yearlyPaidTotal = yearlyPaidRecords.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

        return {
            paidThisMonthTotal,
            paidThisMonthCount: paidThisMonthRecords.length,
            pendingTotal,
            pendingCount: pendingRecords.length,
            yearlyPaidTotal,
            yearlyPaidCount: yearlyPaidRecords.length
        };
    }, [paymentRecords]);

    // ── Form İşlemleri ──
    const handleOpenAddForm = () => {
        setEditingPaymentId(null);
        setIsCustomTypeInput(false);
        setCustomTypeInputValue('');
        setFormData({
            subCategory: 'vergi',
            taxType: 'KDV 1 (Katma Değer Vergisi)',
            period: new Date().toISOString().slice(0, 7),
            date: new Date().toISOString().split('T')[0],
            dueDate: new Date().toISOString().split('T')[0],
            amount: '',
            status: 'paid',
            description: '',
            note: '',
            files: []
        });
        setIsFormOpen(true);
    };

    const handleOpenEditForm = (rec) => {
        setEditingPaymentId(rec.id);
        const isSgk = rec.subCategory === 'sgk' || rec.category === 'SGK & Vergi';
        const subCat = isSgk ? 'sgk' : 'vergi';
        const existingTaxType = rec.taxType || rec.description || 'Diğer Vergi';

        setIsCustomTypeInput(false);
        setCustomTypeInputValue('');
        setFormData({
            subCategory: subCat,
            taxType: existingTaxType,
            period: rec.period || (rec.date ? rec.date.slice(0, 7) : new Date().toISOString().slice(0, 7)),
            date: rec.date || new Date().toISOString().split('T')[0],
            dueDate: rec.dueDate || rec.date || new Date().toISOString().split('T')[0],
            amount: rec.amount !== undefined ? String(rec.amount) : '',
            status: rec.status || 'paid',
            description: rec.description || '',
            note: rec.note || '',
            files: rec.files || []
        });
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setEditingPaymentId(null);
        setIsCustomTypeInput(false);
        setCustomTypeInputValue('');
    };

    const handleSavePayment = async (e) => {
        e.preventDefault();
        const amt = parseFloat(formData.amount);
        if (!amt || isNaN(amt) || amt <= 0) {
            alert('Lütfen geçerli bir ödeme tutarı giriniz.');
            return;
        }

        let selectedTaxTypeName = formData.taxType;
        if (isCustomTypeInput) {
            const cleanCustom = customTypeInputValue.trim();
            if (!cleanCustom) {
                alert('Lütfen yeni vergi türünün adını giriniz.');
                return;
            }
            selectedTaxTypeName = cleanCustom;
            // Yeni tür hafızada yoksa ekle
            if (!customTaxTypes.includes(cleanCustom) && !DEFAULT_TAX_TYPES.some(t => t.name.toLowerCase() === cleanCustom.toLowerCase())) {
                const updated = [...customTaxTypes, cleanCustom];
                saveCustomTaxTypesList(updated);
            }
        }

        setIsSubmitting(true);
        try {
            const payload = {
                type: 'Ödeme', // Şirket gider raporları ve mali tablolarla tam uyum
                category: 'SGK & Vergi', // Personel modülü ve filtre köprüsü
                subCategory: formData.subCategory, // 'vergi' | 'sgk'
                taxType: selectedTaxTypeName,
                period: formData.period,
                date: formData.date,
                dueDate: formData.dueDate || formData.date,
                amount: amt,
                status: formData.status,
                description: formData.description?.trim() || `${selectedTaxTypeName} (${formData.period})`,
                note: formData.note?.trim() || '',
                files: formData.files || [],
                companyId: activeCompanyId,
                truckId: null
            };

            if (editingPaymentId) {
                await updatePayment(editingPaymentId, payload);
                addLog('VERGI_SGK_GUNCELLE', `${selectedTaxTypeName} (${formData.period}) kaydı güncellendi: ₺${amt.toLocaleString('tr-TR')}`);
            } else {
                await addPayment(payload);
                addLog('VERGI_SGK_EKLE', `${selectedTaxTypeName} (${formData.period}) kaydedildi: ₺${amt.toLocaleString('tr-TR')}`);
            }

            handleCloseForm();
        } catch (err) {
            console.error('Ödeme kaydedilirken hata:', err);
            alert('İşlem kaydedilemedi. Lütfen tekrar deneyiniz.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteRecord = async (id, taxTitle) => {
        if (window.confirm(`${taxTitle || 'Bu resmi ödeme'} kaydını silmek istediğinize emin misiniz?`)) {
            try {
                await deletePayment(id);
                addLog('VERGI_SGK_SIL', `${taxTitle} kaydı silindi.`);
            } catch (err) {
                console.error('Kayıt silinirken hata:', err);
            }
        }
    };

    // ── Özel Vergi Türleri Yönetimi ──
    const handleAddCustomType = (e) => {
        e.preventDefault();
        const trimmed = newTaxTypeName.trim();
        if (!trimmed) return;
        if (customTaxTypes.includes(trimmed) || DEFAULT_TAX_TYPES.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
            alert('Bu vergi türü listede zaten mevcut.');
            return;
        }
        const updated = [...customTaxTypes, trimmed];
        saveCustomTaxTypesList(updated);
        setNewTaxTypeName('');
    };

    const handleDeleteCustomType = (typeName) => {
        if (window.confirm(`"${typeName}" vergi türünü hafızadan silmek istediğinize emin misiniz?`)) {
            const updated = customTaxTypes.filter(t => t !== typeName);
            saveCustomTaxTypesList(updated);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full w-full p-2 sm:p-3 lg:p-4 overflow-hidden gap-2 sm:gap-2.5 max-w-[1920px] mx-auto select-none">

            {/* ── 1. ÜST BAŞLIK VE KONTROL BARI ── */}
            <div
                className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3 pb-2 border-b border-white/[0.06] shrink-0"
                style={{ paddingTop: isMobile ? 'calc(0.5rem + env(safe-area-inset-top, 0px))' : '0' }}
            >
                {/* Üst Satır (Mobil) / Sol Taraf (Masaüstü) */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        {isMobile && onOpenMenu && (
                            <button
                                onClick={onOpenMenu}
                                className="p-1.5 -ml-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer shrink-0"
                                aria-label="Menüyü Aç"
                            >
                                <Menu size={20} />
                            </button>
                        )}
                        <h2 className="text-sm sm:text-base lg:text-lg font-bold tracking-tight text-white flex items-center gap-2 truncate">
                            <Scale size={18} className="text-amber-400 shrink-0" />
                            <span className="truncate">Vergi & SGK Masası</span>
                        </h2>
                    </div>

                    {/* Mobilde sağ üstte hızlı aksiyon butonu */}
                    <div className="md:hidden shrink-0 flex items-center gap-1.5">
                        <button
                            onClick={() => setIsTaxTypeManagerOpen(true)}
                            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
                            title="Vergi Türlerini Yönet"
                        >
                            <Settings size={15} />
                        </button>
                        <button
                            onClick={handleOpenAddForm}
                            className="h-8 px-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1 shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
                        >
                            <Plus size={14} />
                            <span>Yeni Ödeme</span>
                        </button>
                    </div>
                </div>

                {/* Alt Satır (Mobil Filtreler) / Sağ Taraf (iPad & Masaüstü) */}
                <div className="flex items-center gap-2 w-full md:w-auto shrink-0 overflow-x-auto no-scrollbar py-0.5">
                    {/* Filtre Butonları */}
                    <div className="flex items-center p-1 rounded-xl bg-[#080a0f] border border-white/[0.06] shrink-0">
                        {[
                            { id: 'all', label: 'Tümü' },
                            { id: 'vergi', label: 'Vergiler' },
                            { id: 'sgk', label: 'SGK Primi' },
                            { id: 'pending', label: 'Bekleyenler' },
                            { id: 'paid', label: 'Ödenenler' }
                        ].map((tab) => {
                            const isActive = activeTabFilter === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTabFilter(tab.id)}
                                    className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                                        isActive
                                            ? 'bg-amber-500 text-black font-bold shadow-sm'
                                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Masaüstü ve iPad Aksiyon Butonları */}
                    <div className="hidden md:flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => setIsTaxTypeManagerOpen(true)}
                            className="h-8 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                            title="Vergi Türlerini Yönet"
                        >
                            <Settings size={14} />
                            <span className="hidden lg:inline">Türleri Yönet</span>
                        </button>

                        <button
                            onClick={handleOpenAddForm}
                            className="h-8 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
                        >
                            <Plus size={14} />
                            <span>Yeni Resmi Ödeme</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── 2. BENTO KPI ÖZET KARTLARI (Kompakt Tek Satır) ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 shrink-0">
                {/* 1. Bu Ay Ödenen */}
                <div className="rounded-xl border border-white/[0.06] px-3 py-2 bg-[#080a0f] flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                            <CheckCircle2 size={15} />
                        </div>
                        <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 block leading-tight">Bu Ay Ödenen</span>
                            <span className="text-xs sm:text-sm font-bold text-white font-mono truncate block">
                                {formatCurrency(kpiMetrics.paidThisMonthTotal)}
                            </span>
                        </div>
                    </div>
                    <span className="text-[10px] font-mono font-semibold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 shrink-0 hidden sm:inline">
                        {kpiMetrics.paidThisMonthCount} Kalem
                    </span>
                </div>

                {/* 2. Ödeme Bekleyenler (Tahakkuk / Vade) */}
                <div
                    onClick={() => setActiveTabFilter('pending')}
                    className="rounded-xl border border-amber-500/30 px-3 py-2 bg-[#080a0f] flex items-center justify-between cursor-pointer hover:border-amber-500/50 transition-colors"
                >
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                            <Clock size={15} />
                        </div>
                        <div className="min-w-0">
                            <span className="text-[10px] text-amber-300/80 block leading-tight">Vadesi Bekleyen</span>
                            <span className="text-xs sm:text-sm font-bold text-amber-300 font-mono truncate block">
                                {formatCurrency(kpiMetrics.pendingTotal)}
                            </span>
                        </div>
                    </div>
                    {kpiMetrics.pendingCount > 0 && (
                        <span className="text-[10px] font-mono font-bold text-amber-300 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 shrink-0">
                            {kpiMetrics.pendingCount} Bekleyen
                        </span>
                    )}
                </div>

                {/* 3. Yıllık Kümülatif Resmi Ödemeler */}
                <div className="col-span-2 sm:col-span-1 rounded-xl border border-white/[0.06] px-3 py-2 bg-[#080a0f] flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 shrink-0">
                            <Building2 size={15} />
                        </div>
                        <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 block leading-tight">Yıllık Toplam</span>
                            <span className="text-xs sm:text-sm font-bold text-white font-mono truncate block">
                                {formatCurrency(kpiMetrics.yearlyPaidTotal)}
                            </span>
                        </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-white/5 shrink-0 hidden sm:inline">
                        {new Date().getFullYear()}
                    </span>
                </div>
            </div>

            {/* ── 3. ANA İÇERİK (IN-CARD FORM VEYA VERGİ & SGK TABLOSU) ── */}
            <div className="flex-1 flex flex-col rounded-2xl bg-[#07090e] border border-white/[0.06] overflow-hidden min-h-0 relative">

                {isFormOpen ? (
                    /* ═════════════ IN-CARD FORM STÜDYOSU (RESPONSIVE) ═════════════ */
                    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#07090e] overflow-y-auto custom-scrollbar">
                        {/* Stüdyo Başlığı */}
                        <div className="p-3 sm:px-5 sm:py-3.5 bg-[#080a0f] border-b border-white/[0.08] flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2.5">
                                <span className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                                    <Scale size={15} />
                                </span>
                                <div>
                                    <h3 className="text-xs sm:text-sm font-bold text-white">
                                        {editingPaymentId ? 'Resmi Ödeme Kaydını Düzenle' : 'Yeni Vergi veya SGK Kaydı Ekle'}
                                    </h3>
                                    <span className="text-[10px] text-slate-500">Tahakkuk, Vade ve Dekont Arşivleme</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleCloseForm}
                                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {/* Form Gövdesi */}
                        <form onSubmit={handleSavePayment} className="flex-1 p-3.5 sm:p-5 flex flex-col justify-between gap-4">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                
                                {/* Sol Sütun: İşlem Bilgileri (7/12) */}
                                <div className="lg:col-span-7 flex flex-col gap-3">
                                    {/* Kategori Seçimi: Vergi / SGK */}
                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-400 mb-1 block">İşlem Türü *</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        subCategory: 'vergi',
                                                        taxType: 'KDV 1 (Katma Değer Vergisi)'
                                                    }));
                                                    setIsCustomTypeInput(false);
                                                }}
                                                className={`py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                                    formData.subCategory === 'vergi'
                                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                                                        : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
                                                }`}
                                            >
                                                <Receipt size={14} />
                                                <span>Vergi Ödemesi</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        subCategory: 'sgk',
                                                        taxType: 'SGK Prim Ödemesi'
                                                    }));
                                                    setIsCustomTypeInput(false);
                                                }}
                                                className={`py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                                    formData.subCategory === 'sgk'
                                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                                                        : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
                                                }`}
                                            >
                                                <Building2 size={14} />
                                                <span>SGK Prim Ödemesi</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Vergi / SGK Kalemi (Seçim + Yeni Yazma) */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-[11px] font-semibold text-slate-400">Vergi / Prim Kalemi *</label>
                                            <button
                                                type="button"
                                                onClick={() => setIsTaxTypeManagerOpen(true)}
                                                className="text-[10px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                                            >
                                                <Settings size={11} />
                                                <span>Türleri Düzenle</span>
                                            </button>
                                        </div>

                                        {!isCustomTypeInput ? (
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={formData.taxType}
                                                    onChange={(e) => {
                                                        if (e.target.value === '__new__') {
                                                            setIsCustomTypeInput(true);
                                                            setCustomTypeInputValue('');
                                                        } else {
                                                            setFormData(prev => ({ ...prev, taxType: e.target.value }));
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-amber-500/40 cursor-pointer"
                                                >
                                                    {allTaxTypes
                                                        .filter(t => formData.subCategory === 'sgk' ? t.category === 'sgk' : true)
                                                        .map(t => (
                                                            <option key={t.id} value={t.name} className="bg-[#080a0f] text-white">
                                                                {t.name} {t.isCustom ? '(Özel)' : ''}
                                                            </option>
                                                        ))}
                                                    <option value="__new__" className="bg-[#080a0f] text-amber-400 font-bold">
                                                        + Yeni Vergi Türü Yaz...
                                                    </option>
                                                </select>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={customTypeInputValue}
                                                    onChange={e => setCustomTypeInputValue(e.target.value)}
                                                    placeholder="Yeni vergi türü adı yazınız..."
                                                    className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-amber-500/40 text-xs text-white placeholder-slate-500 outline-none"
                                                    autoFocus
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setIsCustomTypeInput(false)}
                                                    className="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs transition-colors cursor-pointer"
                                                >
                                                    Listeden Seç
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Dönem, Tutar ve Durum */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-400 mb-1 block">Dönem (Ay/Yıl) *</label>
                                            <input
                                                type="month"
                                                required
                                                value={formData.period}
                                                onChange={e => setFormData(prev => ({ ...prev, period: e.target.value }))}
                                                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white font-mono outline-none focus:border-amber-500/40"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-400 mb-1 block">Ödeme Tutarı (₺) *</label>
                                            <input
                                                type="number"
                                                required
                                                step="0.01"
                                                value={formData.amount}
                                                onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                                                placeholder="0.00"
                                                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white font-mono font-bold outline-none focus:border-amber-500/40"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-400 mb-1 block">Durum *</label>
                                            <select
                                                value={formData.status}
                                                onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                                                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-amber-500/40 cursor-pointer"
                                            >
                                                <option value="paid" className="bg-[#080a0f] text-emerald-400">Ödendi</option>
                                                <option value="pending" className="bg-[#080a0f] text-amber-400">Ödeme Bekliyor</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Tarihler: Yasal Vade & Ödeme Tarihi */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-400 mb-1 block">Yasal Vade (Son Gün) *</label>
                                            <input
                                                type="date"
                                                required
                                                value={formData.dueDate}
                                                onChange={e => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                                                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white font-mono outline-none focus:border-amber-500/40"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-400 mb-1 block">Ödeme / İşlem Tarihi *</label>
                                            <input
                                                type="date"
                                                required
                                                value={formData.date}
                                                onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                                                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white font-mono outline-none focus:border-amber-500/40"
                                            />
                                        </div>
                                    </div>

                                    {/* Açıklama */}
                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-400 mb-1 block">Açıklama / Detay</label>
                                        <input
                                            type="text"
                                            value={formData.description}
                                            onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                            placeholder="Örn: 2026 1. Dönem Geçici Vergi Ödemesi"
                                            className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-600 outline-none focus:border-amber-500/40"
                                        />
                                    </div>
                                </div>

                                {/* Sağ Sütun: Tahakkuk Fişi & Ödeme Dekontları (5/12) */}
                                <div className="lg:col-span-5 flex flex-col justify-between bg-black/40 border border-white/[0.06] rounded-xl p-3.5 sm:p-4 gap-3">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <Paperclip size={14} className="text-amber-400" />
                                            <h4 className="text-xs font-bold text-white">Resmi Evraklar & Dekontlar</h4>
                                        </div>
                                        <p className="text-[11px] text-slate-400 mb-3">
                                            GİB / SGK Tahakkuk fişi veya banka ödeme dekontunu (PDF / Görsel) ekleyebilirsiniz.
                                        </p>
                                        <FileUpload
                                            files={formData.files || []}
                                            onChange={files => setFormData(prev => ({ ...prev, files }))}
                                            maxSizeMB={8}
                                        />
                                    </div>

                                    {/* Dahili Not */}
                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-400 mb-1 block">Dahili Muhasebe Notu</label>
                                        <textarea
                                            rows={2}
                                            value={formData.note}
                                            onChange={e => setFormData(prev => ({ ...prev, note: e.target.value }))}
                                            placeholder="Muhasebe veya banka referans notları..."
                                            className="w-full px-3 py-2 rounded-xl bg-[#080a0f] border border-white/10 text-xs text-white placeholder-slate-600 outline-none focus:border-amber-500/40 resize-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Alt Aksiyon Butonları */}
                            <div className="pt-3 border-t border-white/[0.06] flex items-center justify-end gap-2.5 shrink-0">
                                <button
                                    type="button"
                                    onClick={handleCloseForm}
                                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all cursor-pointer"
                                >
                                    {isSubmitting ? 'Kaydediliyor...' : (editingPaymentId ? 'Değişiklikleri Güncelle' : 'Resmi Ödemeyi Kaydet')}
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    /* ═════════════ LİSTE & ARAMA MASASI ═════════════ */
                    <div className="flex-1 flex flex-col h-full min-h-0">
                        {/* Arama ve Ay Çubuğu */}
                        <div className="p-2.5 sm:px-4 sm:py-2.5 bg-[#080a0f] border-b border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
                            <div className="relative w-full sm:w-72">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    placeholder="Vergi türü, açıklama veya tutar ara..."
                                    className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500/40"
                                />
                                {searchTerm && (
                                    <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                                        <X size={12} />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                <select
                                    value={filterMonth}
                                    onChange={e => setFilterMonth(e.target.value)}
                                    className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-slate-300 font-mono outline-none focus:border-amber-500/40 cursor-pointer"
                                >
                                    {monthOptions.map(opt => (
                                        <option key={opt.value} value={opt.value} className="bg-[#080a0f] text-white">
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Tablo / Kart Listesi */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 sm:p-3 space-y-1.5 min-h-0">
                            {filteredRecords.length > 0 ? (
                                filteredRecords.map((rec) => {
                                    const isSgk = rec.subCategory === 'sgk' || rec.category === 'SGK & Vergi';
                                    const isPaid = rec.status === 'paid';
                                    const hasFiles = rec.files && rec.files.length > 0;
                                    const displayTitle = rec.taxType || rec.description || (isSgk ? 'SGK Prim Ödemesi' : 'Vergi Ödemesi');

                                    return (
                                        <div
                                            key={rec.id}
                                            className="p-3 sm:px-4 sm:py-3 rounded-xl bg-[#080a0f] border border-white/[0.06] hover:border-amber-500/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 group"
                                        >
                                            {/* Sol Blok: Tür, Dönem ve Açıklama */}
                                            <div className="flex items-start gap-3 min-w-0 flex-1">
                                                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                                                    isSgk
                                                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                                        : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                                }`}>
                                                    {isSgk ? <Building2 size={16} /> : <Receipt size={16} />}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">
                                                            {displayTitle}
                                                        </h4>
                                                        <span className="text-[10px] font-mono font-semibold px-2 py-0.2 rounded bg-white/5 text-slate-300 border border-white/10 shrink-0">
                                                            {rec.period || (rec.date ? rec.date.slice(0, 7) : '')}
                                                        </span>
                                                        <span className={`text-[10px] font-semibold px-2 py-0.2 rounded border shrink-0 ${
                                                            isPaid
                                                                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                                                : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                                                        }`}>
                                                            {isPaid ? 'Ödendi' : 'Ödeme Bekliyor'}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                                                        {rec.dueDate && (
                                                            <span className="text-[11px] text-slate-500 font-mono">
                                                                Vade: {new Date(rec.dueDate).toLocaleDateString('tr-TR')}
                                                            </span>
                                                        )}
                                                        {rec.date && (
                                                            <>
                                                                <span className="text-slate-600 hidden sm:inline">·</span>
                                                                <span className="text-[11px] text-slate-500 font-mono">
                                                                    Ödeme: {new Date(rec.date).toLocaleDateString('tr-TR')}
                                                                </span>
                                                            </>
                                                        )}
                                                        {rec.description && rec.description !== displayTitle && (
                                                            <>
                                                                <span className="text-slate-600 hidden sm:inline">·</span>
                                                                <span className="text-[11px] text-slate-400 truncate max-w-xs">
                                                                    {rec.description}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Sağ Blok: Evrak Rozeti, Tutar ve Aksiyonlar */}
                                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.04]">
                                                {/* Yüklü Evraklar (Tek tıkla inceleme) */}
                                                {hasFiles && (
                                                    <button
                                                        onClick={() => setPreviewDoc(rec.files[0])}
                                                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                                                        title="Evrakları İncele"
                                                    >
                                                        <Paperclip size={12} className="text-amber-400" />
                                                        <span>{rec.files.length} Belge</span>
                                                    </button>
                                                )}

                                                {/* Tutar */}
                                                <div className="text-right">
                                                    <span className="text-sm sm:text-base font-bold text-white font-mono block">
                                                        {formatCurrency(rec.amount)}
                                                    </span>
                                                </div>

                                                {/* Düzenle & Sil Butonları */}
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleOpenEditForm(rec)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                                                        title="Düzenle"
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteRecord(rec.id, displayTitle)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                                        title="Sil"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
                                    <Scale size={32} className="text-slate-600" />
                                    <p>Filtreye uygun vergi veya SGK ödeme kaydı bulunamadı.</p>
                                    <button
                                        onClick={handleOpenAddForm}
                                        className="mt-2 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                                    >
                                        <Plus size={13} />
                                        <span>Yeni Resmi Ödeme Ekle</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ═════════════ 4. BELGE / PDF ÖNİZLEME MODALI ═════════════ */}
            {previewDoc && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[9999] p-2 sm:p-6"
                    onClick={() => setPreviewDoc(null)}
                >
                    <div
                        className="bg-[#07090e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-4xl h-[92vh] sm:h-[88vh] overflow-hidden flex flex-col my-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] bg-[#080a0f] shrink-0">
                            <div className="flex items-center gap-2">
                                <FileText size={16} className="text-amber-400" />
                                <h3 className="text-sm font-bold text-white truncate">{previewDoc.name || 'Resmi Evrak'}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href={previewDoc.url || previewDoc.data}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 rounded-lg bg-white/5 text-slate-300 hover:text-white transition-colors"
                                    title="Yeni Sekmede Aç"
                                >
                                    <ExternalLink size={15} />
                                </a>
                                <button
                                    onClick={() => setPreviewDoc(null)}
                                    className="w-7 h-7 rounded-lg bg-white/5 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                                >
                                    <X size={15} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 bg-slate-950 overflow-hidden relative">
                            {previewDoc.type?.startsWith('image/') || previewDoc.url?.match(/\.(jpeg|jpg|png|webp)/i) ? (
                                <div className="w-full h-full flex items-center justify-center p-4">
                                    <img
                                        src={previewDoc.url || previewDoc.data}
                                        alt={previewDoc.name}
                                        className="max-w-full max-h-full object-contain rounded-lg"
                                    />
                                </div>
                            ) : (
                                <iframe
                                    src={`${previewDoc.url || previewDoc.data}#toolbar=0&navpanes=0`}
                                    title={previewDoc.name || 'Belge'}
                                    className="w-full h-full border-none block"
                                />
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ═════════════ 5. VERGİ TÜRLERİ YÖNETİM MODALI (HAFIZA) ═════════════ */}
            {isTaxTypeManagerOpen && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999] p-3 sm:p-4"
                    onClick={() => setIsTaxTypeManagerOpen(false)}
                >
                    <div
                        className="bg-[#07090e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col my-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] bg-[#080a0f] shrink-0">
                            <div className="flex items-center gap-2">
                                <Settings size={16} className="text-amber-400" />
                                <h3 className="text-sm font-bold text-white">Kayıtlı Vergi Türleri Masası</h3>
                            </div>
                            <button
                                onClick={() => setIsTaxTypeManagerOpen(false)}
                                className="w-7 h-7 rounded-lg bg-white/5 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <div className="p-4 sm:p-5 flex-1 overflow-y-auto custom-scrollbar space-y-4">
                            {/* Yeni Tür Ekle Formu */}
                            <form onSubmit={handleAddCustomType} className="flex gap-2">
                                <input
                                    type="text"
                                    value={newTaxTypeName}
                                    onChange={e => setNewTaxTypeName(e.target.value)}
                                    placeholder="Yeni özel vergi türü adı yazınız..."
                                    className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500/40"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1 transition-all cursor-pointer shrink-0"
                                >
                                    <Plus size={14} />
                                    <span>Ekle</span>
                                </button>
                            </form>

                            {/* Standart Vergi Türleri */}
                            <div>
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                                    Sistem Standart Türleri
                                </span>
                                <div className="space-y-1">
                                    {DEFAULT_TAX_TYPES.map(t => (
                                        <div key={t.id} className="px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs text-slate-300 flex items-center justify-between">
                                            <span>{t.name}</span>
                                            <span className="text-[10px] text-slate-500 font-mono">Varsayılan</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Kullanıcının Özel Hafızaya Eklediği Türler */}
                            <div>
                                <span className="text-[11px] font-bold text-amber-400/90 uppercase tracking-wider block mb-2">
                                    Özel Kayıtlı Türler ({customTaxTypes.length})
                                </span>
                                {customTaxTypes.length > 0 ? (
                                    <div className="space-y-1">
                                        {customTaxTypes.map((typeName) => (
                                            <div key={typeName} className="px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-white flex items-center justify-between">
                                                <span>{typeName}</span>
                                                <button
                                                    onClick={() => handleDeleteCustomType(typeName)}
                                                    className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                                    title="Hafızadan Sil"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-500 italic py-2">
                                        Henüz özel bir vergi türü eklenmedi. Yukarıdan ekleyebilir veya yeni ödeme kaydederken doğrudan yazabilirsiniz.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t border-white/[0.06] bg-[#080a0f] flex justify-end shrink-0">
                            <button
                                onClick={() => setIsTaxTypeManagerOpen(false)}
                                className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors cursor-pointer"
                            >
                                Kapat
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Payments;

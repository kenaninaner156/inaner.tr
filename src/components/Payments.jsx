import React, { useState, useContext, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DataContext } from '../context/DataContext';
import { useCompany } from '../context/CompanyContext';
import {
    Scale,
    Plus,
    Search,
    Trash2,
    Edit3,
    X,
    Check,
    FileText,
    Paperclip,
    ExternalLink,
    Download,
    Menu,
    CheckCircle2,
    Settings,
    Receipt,
    Building2,
    RotateCcw,
    Lock
} from 'lucide-react';
import PinLockOverlay from './PinLockOverlay';
import FileUpload from './FileUpload';
import CustomSelect from './CustomSelect';
import CustomDatePicker from './CustomDatePicker';

// ── Sadeleştirilmiş Kurumsal Vergi ve SGK Türleri ──
const INITIAL_TAX_TYPES = [
    { id: 'kdv', name: 'KDV', category: 'vergi' },
    { id: 'kdv2', name: 'KDV 2', category: 'vergi' },
    { id: 'muhtasar', name: 'Muhtasar', category: 'vergi' },
    { id: 'gecici_vergi', name: 'Geçici Vergi', category: 'vergi' },
    { id: 'gelir_vergisi', name: 'Gelir Vergisi', category: 'vergi' },
    { id: 'kurumlar_vergisi', name: 'Kurumlar Vergisi', category: 'vergi' },
    { id: 'mtv', name: 'MTV', category: 'vergi' },
    { id: 'damga', name: 'Damga Vergisi', category: 'vergi' },
    { id: 'sgk', name: 'SGK Primi', category: 'sgk' },
];

// Uzun veya eski adları sade kurumsal adlara dönüştürme
const cleanTaxName = (name) => {
    if (!name) return 'Vergi Ödemesi';
    let clean = name;
    if (clean.includes('KDV 1 (Katma Değer Vergisi)')) clean = 'KDV';
    else if (clean.includes('KDV 1')) clean = 'KDV';
    else if (clean.includes('Katma Değer Vergisi')) clean = 'KDV';
    if (clean.includes('KDV 2 (Tevkifatlı)')) clean = 'KDV 2';
    if (clean.includes('Muhtasar ve Prim')) clean = 'Muhtasar';
    if (clean.includes('Geçici Vergi (Kurumlar')) clean = 'Geçici Vergi';
    if (clean.includes('Kurumlar / Yıllık')) clean = 'Kurumlar Vergisi';
    if (clean.includes('Motorlu Taşıtlar')) clean = 'MTV';
    if (clean.includes('SGK Prim Ödemesi')) clean = 'SGK Primi';
    return clean;
};

// Kaydedilmiş listeyi normalize etme (Gelir Vergisi ve Damga Vergisi garantisi ile)
const normalizeSavedTypes = (savedList) => {
    if (!Array.isArray(savedList) || savedList.length === 0) return INITIAL_TAX_TYPES;
    const cleaned = savedList.map(item => {
        if (typeof item === 'string') {
            const cName = cleanTaxName(item);
            return {
                id: `type_${cName.toLowerCase().replace(/\s+/g, '_')}`,
                name: cName,
                category: cName.toLowerCase().includes('sgk') ? 'sgk' : 'vergi'
            };
        }
        const cName = cleanTaxName(item.name);
        return {
            ...item,
            name: cName,
            category: item.category || (cName.toLowerCase().includes('sgk') ? 'sgk' : 'vergi')
        };
    });

    if (!cleaned.some(t => t.name.toLowerCase() === 'gelir vergisi')) {
        cleaned.splice(4, 0, { id: 'gelir_vergisi', name: 'Gelir Vergisi', category: 'vergi' });
    }
    if (!cleaned.some(t => t.name.toLowerCase() === 'damga vergisi')) {
        cleaned.push({ id: 'damga', name: 'Damga Vergisi', category: 'vergi' });
    }
    return cleaned;
};

// Ay Seçenekleri Üretici (Son 24 ay ve Gelecek 6 ay)
const generatePeriodList = () => {
    const list = [];
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    for (let offset = 6; offset >= -24; offset--) {
        const d = new Date(curYear, curMonth + offset, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const ym = `${y}-${m}`;
        const monthName = d.toLocaleString('tr-TR', { month: 'long' });
        const capMonth = monthName.charAt(0).toLocaleUpperCase('tr-TR') + monthName.slice(1);
        list.push({
            value: ym,
            label: `${capMonth} ${y}`
        });
    }
    return list;
};

const PERIOD_OPTIONS = generatePeriodList();

// Kaydın SGK mı yoksa Vergi mi olduğunu kesin tespit eden fonksiyon
// ASLA rec.category ('SGK & Vergi') taranmaz, çünkü tüm kayıtlar o kategoriye aittir!
const isSgkRecord = (rec, taxTypesList = []) => {
    if (!rec) return false;

    const rawTaxType = (rec.taxType || '').trim();
    const rawDesc = (rec.description || '').trim();
    const typeName = cleanTaxName(rawTaxType || rawDesc).toLowerCase();

    // 1. taxTypes konfigürasyonunda bu tür kayıtlıysa kullanıcı tercihine bak (En yüksek öncelik)
    const matchedType = (taxTypesList || []).find(t => t.name.toLowerCase() === typeName);
    if (matchedType) {
        return matchedType.category === 'sgk';
    }

    // 2. Başlık veya açıklama analizi (Açık vergi isimleri asla SGK olamaz)
    const text = `${typeName} ${rawTaxType.toLowerCase()} ${rawDesc.toLowerCase()}`;
    
    // Damga, kdv, gelir, kurumlar, geçici, mtv, muhtasar vb. kesinlikle vergidir
    if (
        text.includes('damga') ||
        text.includes('kdv') ||
        text.includes('muhtasar') ||
        text.includes('gelir') ||
        text.includes('kurumlar') ||
        text.includes('geçici') ||
        text.includes('gecici') ||
        text.includes('mtv') ||
        text.includes('taşıtlar') ||
        text.includes('harç') ||
        text.includes('vergi')
    ) {
        return false;
    }

    // SGK ve prim anahtar kelimeleri
    if (
        text.includes('sgk') ||
        text.includes('bağkur') ||
        text.includes('bagkur') ||
        text.includes('sigorta') ||
        text.includes('emekli') ||
        text.includes('prim')
    ) {
        return true;
    }

    // 3. Kayıttaki subCategory kontrolü (güvenli fallback)
    if (rec.subCategory === 'sgk') return true;
    if (rec.subCategory === 'vergi') return false;

    // Varsayılan: Vergi
    return false;
};

const Payments = ({ onOpenMenu, isMobile } = {}) => {
    const {
        paymentRecords,
        addPayment,
        deletePayment,
        updatePayment,
        addLog
    } = useContext(DataContext);
    const { activeCompanyId } = useCompany();

    // ─── Güvenlik & Kilit Mekanizması (Şifre girilene kadar sayfa kilitli kalır) ───
    const [isUnlocked, setIsUnlocked] = useState(false);

    // ── Dinamik Vergi Türleri (Tümü Düzenlenebilir & Silinebilir, Şirket Bazlı) ──
    const [taxTypes, setTaxTypes] = useState(() => {
        try {
            const saved = localStorage.getItem(`tax_types_${activeCompanyId || 'default'}`);
            if (saved) {
                const parsed = JSON.parse(saved);
                return normalizeSavedTypes(parsed);
            }
        } catch (err) {
            console.error('Vergi türleri okunamadı:', err);
        }
        return INITIAL_TAX_TYPES;
    });

    useEffect(() => {
        try {
            const key = `tax_types_${activeCompanyId || 'default'}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                const parsed = JSON.parse(saved);
                const normalized = normalizeSavedTypes(parsed);
                localStorage.setItem(key, JSON.stringify(normalized));
                setTaxTypes(normalized);
                return;
            } else {
                localStorage.setItem(key, JSON.stringify(INITIAL_TAX_TYPES));
            }
        } catch (err) {
            console.error('Vergi türleri okunamadı:', err);
        }
        setTaxTypes(INITIAL_TAX_TYPES);
    }, [activeCompanyId]);

    const saveTaxTypesList = (newList) => {
        setTaxTypes(newList);
        try {
            localStorage.setItem(`tax_types_${activeCompanyId || 'default'}`, JSON.stringify(newList));
        } catch (err) {
            console.error('Vergi türleri kaydedilemedi:', err);
        }
    };

    // ── Filtreler & Arama State'leri ──
    const [activeTabFilter, setActiveTabFilter] = useState('all'); // 'all' | 'vergi' | 'sgk'
    const [filterMonth, setFilterMonth] = useState('all'); // 'all' | 'YYYY-MM'
    const [searchTerm, setSearchTerm] = useState('');

    // ── Form State'leri ──
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingPaymentId, setEditingPaymentId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCustomTypeInput, setIsCustomTypeInput] = useState(false);
    const [customTypeInputValue, setCustomTypeInputValue] = useState('');

    const [formData, setFormData] = useState({
        subCategory: 'vergi', // 'vergi' | 'sgk'
        taxType: 'KDV',
        period: new Date().toISOString().slice(0, 7), // 'YYYY-MM'
        date: new Date().toISOString().split('T')[0], // İşlem / Ödeme Tarihi
        amount: '',
        description: '',
        note: '',
        files: []
    });

    // ── Modal State'leri ──
    const [previewDoc, setPreviewDoc] = useState(null);
    const [isTaxTypeManagerOpen, setIsTaxTypeManagerOpen] = useState(false);
    const [newTaxTypeName, setNewTaxTypeName] = useState('');
    const [editingTaxTypeId, setEditingTaxTypeId] = useState(null);
    const [editingTaxTypeName, setEditingTaxTypeName] = useState('');

    // Para birimi formatlayıcı
    const formatCurrency = (val) => {
        const num = Number(val) || 0;
        return `₺${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // ── Dinamik Dönem Listesi (Arama / Filtreleme Çubuğu İçin) ──
    const filterMonthOptions = useMemo(() => {
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
        records.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        // Alt Kategori Filtresi (Tümü / Vergiler / SGK Primi)
        if (activeTabFilter === 'vergi') {
            records = records.filter(r => !isSgkRecord(r, taxTypes));
        } else if (activeTabFilter === 'sgk') {
            records = records.filter(r => isSgkRecord(r, taxTypes));
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
    }, [paymentRecords, activeTabFilter, filterMonth, searchTerm, taxTypes]);

    // ── KPI Metrikleri ──
    const kpiMetrics = useMemo(() => {
        let activeList = (paymentRecords || []).filter(r => !r.deleted);

        // Aktif sekmeye göre KPI filtreleme
        if (activeTabFilter === 'vergi') {
            activeList = activeList.filter(r => !isSgkRecord(r, taxTypes));
        } else if (activeTabFilter === 'sgk') {
            activeList = activeList.filter(r => isSgkRecord(r, taxTypes));
        }

        const currentYm = new Date().toISOString().slice(0, 7);
        const currentYear = new Date().getFullYear().toString();

        // Bu ay ödenenler
        const paidThisMonthRecords = activeList.filter(r => {
            const recPeriod = r.period || (r.date ? r.date.substring(0, 7) : '');
            return recPeriod === currentYm;
        });
        const paidThisMonthTotal = paidThisMonthRecords.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

        // Toplam Kayıt Sayısı
        const totalCount = activeList.length;

        // Yıllık kümülatif resmi ödemeler
        const yearlyPaidRecords = activeList.filter(r => {
            const recYear = (r.date || r.period || '').substring(0, 4);
            return recYear === currentYear;
        });
        const yearlyPaidTotal = yearlyPaidRecords.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

        return {
            paidThisMonthTotal,
            totalCount,
            yearlyPaidTotal
        };
    }, [paymentRecords, activeTabFilter, taxTypes]);

    // Form için Seçenek Listesi
    const formTaxTypeOptions = useMemo(() => {
        const isSgkSelected = formData.subCategory === 'sgk';
        const filtered = taxTypes.filter(t => isSgkSelected ? t.category === 'sgk' : t.category !== 'sgk');
        const opts = filtered.map(t => ({
            value: t.name,
            label: t.name
        }));
        opts.push({
            value: '__new__',
            label: '+ Yeni Tür Yaz...',
            sublabel: isSgkSelected ? 'Yeni SGK türü' : 'Yeni vergi türü'
        });
        return opts;
    }, [taxTypes, formData.subCategory]);

    // ── Form Açma & Kapatma İşlemleri ──
    const handleOpenAddForm = () => {
        setEditingPaymentId(null);
        setIsCustomTypeInput(false);
        setCustomTypeInputValue('');
        const defaultType = taxTypes.find(t => t.category === 'vergi')?.name || 'KDV';
        setFormData({
            subCategory: 'vergi',
            taxType: defaultType,
            period: new Date().toISOString().slice(0, 7),
            date: new Date().toISOString().split('T')[0],
            amount: '',
            description: '',
            note: '',
            files: []
        });
        setIsFormOpen(true);
    };

    const handleOpenEditForm = (rec) => {
        setEditingPaymentId(rec.id);
        const isSgk = isSgkRecord(rec, taxTypes);
        const subCat = isSgk ? 'sgk' : 'vergi';
        const existingTaxType = cleanTaxName(rec.taxType || rec.description || (isSgk ? 'SGK Primi' : 'KDV'));

        setIsCustomTypeInput(false);
        setCustomTypeInputValue('');
        setFormData({
            subCategory: subCat,
            taxType: existingTaxType,
            period: rec.period || (rec.date ? rec.date.slice(0, 7) : new Date().toISOString().slice(0, 7)),
            date: rec.date || new Date().toISOString().split('T')[0],
            amount: rec.amount !== undefined ? String(rec.amount) : '',
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

        let selectedTaxTypeName = cleanTaxName(formData.taxType);
        if (isCustomTypeInput) {
            const cleanCustom = customTypeInputValue.trim();
            if (!cleanCustom) {
                alert('Lütfen yeni vergi türünün adını giriniz.');
                return;
            }
            selectedTaxTypeName = cleanCustom;
            if (!taxTypes.some(t => t.name.toLowerCase() === cleanCustom.toLowerCase())) {
                const newEntry = {
                    id: `type_${Date.now()}`,
                    name: cleanCustom,
                    category: formData.subCategory
                };
                const updated = [...taxTypes, newEntry];
                saveTaxTypesList(updated);
            }
        }

        const isSgk = formData.subCategory === 'sgk' || selectedTaxTypeName.toLowerCase().includes('sgk');

        setIsSubmitting(true);
        try {
            const payload = {
                type: 'Ödeme',
                category: 'SGK & Vergi',
                subCategory: isSgk ? 'sgk' : 'vergi',
                taxType: selectedTaxTypeName,
                period: formData.period,
                date: formData.date,
                dueDate: formData.date,
                amount: amt,
                status: 'paid',
                description: formData.description?.trim() || `${selectedTaxTypeName} (${formData.period})`,
                note: formData.note?.trim() || '',
                files: formData.files || [],
                companyId: activeCompanyId,
                truckId: null
            };

            if (editingPaymentId) {
                await updatePayment(editingPaymentId, payload);
                addLog('VERGI_SGK_GUNCELLE', `${selectedTaxTypeName} kaydı güncellendi: ₺${amt.toLocaleString('tr-TR')}`);
            } else {
                await addPayment(payload);
                addLog('VERGI_SGK_EKLE', `${selectedTaxTypeName} kaydedildi: ₺${amt.toLocaleString('tr-TR')}`);
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

    // ── Vergi Türleri Yönetimi (Ekle, Düzenle, Sil, Kategori Değiştir, Sıfırla) ──
    const handleAddNewTaxType = (e) => {
        e.preventDefault();
        const trimmed = newTaxTypeName.trim();
        if (!trimmed) return;
        if (taxTypes.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
            alert('Bu vergi türü listede zaten mevcut.');
            return;
        }
        const lower = trimmed.toLowerCase();
        const isSgk = lower.includes('sgk') || lower.includes('bağkur') || lower.includes('bagkur') || lower.includes('sigorta') || lower.includes('prim');
        const newEntry = {
            id: `type_${Date.now()}`,
            name: trimmed,
            category: isSgk ? 'sgk' : 'vergi'
        };
        const updated = [...taxTypes, newEntry];
        saveTaxTypesList(updated);
        setNewTaxTypeName('');
        // Eğer form açıksa eklenen türü otomatik seç
        if (isFormOpen) {
            setFormData(prev => ({
                ...prev,
                taxType: trimmed,
                subCategory: newEntry.category
            }));
            setIsCustomTypeInput(false);
        }
    };

    const handleToggleCategory = (id) => {
        const updated = taxTypes.map(t => {
            if (t.id === id) {
                const nextCat = t.category === 'sgk' ? 'vergi' : 'sgk';
                return { ...t, category: nextCat };
            }
            return t;
        });
        saveTaxTypesList(updated);
    };

    const handleSetTypeCategory = (id, newCat) => {
        const updated = taxTypes.map(t => {
            if (t.id === id) {
                return { ...t, category: newCat };
            }
            return t;
        });
        saveTaxTypesList(updated);
    };

    const handleSaveEditTaxType = (id) => {
        const trimmed = editingTaxTypeName.trim();
        if (!trimmed) return;
        const updated = taxTypes.map(t => t.id === id ? { ...t, name: trimmed } : t);
        saveTaxTypesList(updated);
        setEditingTaxTypeId(null);
        setEditingTaxTypeName('');
    };

    const handleDeleteTaxType = (id, name) => {
        if (window.confirm(`"${name}" vergi türünü sistemden silmek istediğinize emin misiniz?`)) {
            const updated = taxTypes.filter(t => t.id !== id);
            saveTaxTypesList(updated);
            if (formData.taxType === name) {
                setFormData(prev => ({ ...prev, taxType: updated[0]?.name || '' }));
            }
        }
    };

    const handleResetTaxTypesToDefault = () => {
        if (window.confirm('Tüm vergi türlerini standart sistem varsayılanlarına sıfırlamak istiyor musunuz?')) {
            saveTaxTypesList(INITIAL_TAX_TYPES);
            setEditingTaxTypeId(null);
        }
    };

    // PDF / Belgeyi yeni sekmede açıcı
    const handleOpenInNewTab = (doc) => {
        if (!doc) return;
        const url = doc.url || doc.data;
        if (url?.startsWith('data:')) {
            try {
                const byteStr = atob(url.split(',')[1]);
                const arr = new Uint8Array(byteStr.length);
                for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
                const blob = new Blob([arr], { type: doc.type || 'application/pdf' });
                window.open(URL.createObjectURL(blob), '_blank');
                return;
            } catch (e) {
                console.error('Blob açma hatası:', e);
            }
        }
        window.open(url, '_blank');
    };

    // ─── Kilit Ekranı (Şifre girilmemişse gösterilir) ───
    if (!isUnlocked) {
        return (
            <PinLockOverlay
                companyName="Şirket"
                title="Vergi & SGK Masası"
                onUnlock={() => setIsUnlocked(true)}
                onCancel={() => {
                    window.dispatchEvent(new CustomEvent('tir_switch_tab', { detail: 'dashboard' }));
                }}
            />
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full w-full p-2 sm:p-3 lg:p-4 overflow-hidden gap-2 sm:gap-2.5 max-w-[1920px] mx-auto select-none">

            {/* ── 1. ÜST BAŞLIK VE KONTROL BARI ── */}
            <div
                className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3 pb-2 border-b border-white/[0.06] shrink-0"
                style={{ paddingTop: isMobile ? 'calc(0.5rem + env(safe-area-inset-top, 0px))' : '0' }}
            >
                {/* Sol Taraf: Sayfa Başlığı */}
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

                    {/* Mobilde sağ üstte hızlı ekleme ve kilit butonu */}
                    <div className="md:hidden shrink-0 flex items-center gap-1.5">
                        <button
                            onClick={handleOpenAddForm}
                            className="h-8 px-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1 shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
                        >
                            <Plus size={14} />
                            <span>Yeni Ödeme</span>
                        </button>
                        <button
                            onClick={() => setIsUnlocked(false)}
                            className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.08] flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
                            title="Vergi & SGK Masasını Kilitle"
                        >
                            <Lock size={15} />
                        </button>
                    </div>
                </div>

                {/* Sağ Taraf: Filtre Butonları (Tümü, Vergiler, SGK) ve Masaüstü Yeni Ödeme */}
                <div className="flex items-center gap-2 w-full md:w-auto shrink-0 overflow-x-auto no-scrollbar py-0.5">
                    {/* Filtre Sekmeleri: Sadece Tümü, Vergiler, SGK Primi */}
                    <div className="flex items-center p-1 rounded-xl bg-[#080a0f] border border-white/[0.06] shrink-0">
                        {[
                            { id: 'all', label: 'Tümü' },
                            { id: 'vergi', label: 'Vergiler' },
                            { id: 'sgk', label: 'SGK Primi' }
                        ].map((tab) => {
                            const isActive = activeTabFilter === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTabFilter(tab.id)}
                                    className={`px-3 py-1 sm:py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 whitespace-nowrap ${
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

                    {/* Masaüstü ve iPad Yeni Resmi Ödeme ve Kilit Butonu */}
                    <div className="hidden md:flex items-center gap-2 shrink-0">
                        <button
                            onClick={handleOpenAddForm}
                            className="h-8 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
                        >
                            <Plus size={14} />
                            <span>Yeni Resmi Ödeme</span>
                        </button>
                        <button
                            onClick={() => setIsUnlocked(false)}
                            className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.08] flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
                            title="Vergi & SGK Masasını Kilitle"
                        >
                            <Lock size={15} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── 2. BENTO KPI ÖZET KARTLARI (Pürüzsüz Grid Row Kapanış Animasyonu - E-Arşiv Tarzı) ── */}
            <div 
                className="grid shrink-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{
                    gridTemplateRows: isFormOpen ? '0fr' : '1fr',
                    opacity: isFormOpen ? 0 : 1,
                    pointerEvents: isFormOpen ? 'none' : 'auto',
                }}
            >
                <div className="overflow-hidden min-h-0">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pb-1">
                        {/* 1. Bu Ay Ödenen (Temayla Tam Uyumlu Amber Vurgu, Yan Bilgisiz) */}
                        <div className="rounded-2xl border border-white/[0.06] px-4 py-2.5 bg-[#080a0f] flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                                <CheckCircle2 size={16} />
                            </div>
                            <div className="min-w-0">
                                <span className="text-[11px] text-slate-400 block leading-tight">Bu Ay Ödenen</span>
                                <span className="text-sm sm:text-base font-bold text-white font-mono truncate block">
                                    {formatCurrency(kpiMetrics.paidThisMonthTotal)}
                                </span>
                            </div>
                        </div>

                        {/* 2. Toplam Kayıt (Yan Bilgisiz) */}
                        <div className="rounded-2xl border border-white/[0.06] px-4 py-2.5 bg-[#080a0f] flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                                <Receipt size={16} />
                            </div>
                            <div className="min-w-0">
                                <span className="text-[11px] text-slate-400 block leading-tight">Toplam Kayıt</span>
                                <span className="text-sm sm:text-base font-bold text-white font-mono truncate block">
                                    {kpiMetrics.totalCount} Kalem
                                </span>
                            </div>
                        </div>

                        {/* 3. Yıllık Toplam (Yan Bilgisiz) */}
                        <div className="rounded-2xl border border-white/[0.06] px-4 py-2.5 bg-[#080a0f] flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                                <Building2 size={16} />
                            </div>
                            <div className="min-w-0">
                                <span className="text-[11px] text-slate-400 block leading-tight">Yıllık Toplam</span>
                                <span className="text-sm sm:text-base font-bold text-white font-mono truncate block">
                                    {formatCurrency(kpiMetrics.yearlyPaidTotal)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 3. ANA İÇERİK (SİMETRİK FORM VEYA VERGİ & SGK TABLOSU) ── */}
            <div className="flex-1 flex flex-col rounded-2xl bg-[#07090e] border border-white/[0.06] overflow-hidden min-h-0 relative">

                {isFormOpen ? (
                    /* ═════════════ SİMETRİK VE ANİMASYONLU IN-CARD FORM STÜDYOSU ═════════════ */
                    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#07090e] animate-in fade-in zoom-in-[0.99] duration-300">
                        {/* Stüdyo Başlığı */}
                        <div className="h-12 sm:h-14 shrink-0 bg-[#080a0f] border-b border-white/[0.08] px-4 sm:px-6 flex items-center justify-between z-10">
                            <div className="flex items-center gap-2.5">
                                <span className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                                    <Scale size={15} />
                                </span>
                                <div>
                                    <h3 className="text-xs sm:text-sm font-bold text-white">
                                        {editingPaymentId ? 'Resmi Ödeme Kaydını Düzenle' : 'Yeni Vergi veya SGK Kaydı'}
                                    </h3>
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

                        {/* Form Gövdesi (Scroll Sorunsuz, Sabit Footer Düzeni) */}
                        <form onSubmit={handleSavePayment} className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6 flex flex-col justify-start">
                                <div className="w-full max-w-3xl mx-auto flex flex-col gap-3.5">
                                    
                                    {/* Satır 1: İşlem Türü (Tam Simetrik 2 Buton) */}
                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-400 mb-1.5 block">İşlem Türü *</label>
                                        <div className="grid grid-cols-2 gap-3 w-full">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const defaultV = taxTypes.find(t => t.category === 'vergi')?.name || 'KDV';
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        subCategory: 'vergi',
                                                        taxType: defaultV
                                                    }));
                                                    setIsCustomTypeInput(false);
                                                }}
                                                className={`h-10 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                                                    formData.subCategory === 'vergi'
                                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold shadow-sm'
                                                        : 'bg-[#0d1117] border-white/[0.08] text-slate-400 hover:text-white hover:border-white/20'
                                                }`}
                                            >
                                                <Receipt size={15} />
                                                <span>Vergi Ödemesi</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const defaultS = taxTypes.find(t => t.category === 'sgk')?.name || 'SGK Primi';
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        subCategory: 'sgk',
                                                        taxType: defaultS
                                                    }));
                                                    setIsCustomTypeInput(false);
                                                }}
                                                className={`h-10 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                                                    formData.subCategory === 'sgk'
                                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold shadow-sm'
                                                        : 'bg-[#0d1117] border-white/[0.08] text-slate-400 hover:text-white hover:border-white/20'
                                                }`}
                                            >
                                                <Building2 size={15} />
                                                <span>SGK Prim Ödemesi</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Satır 2: Vergi / SGK Kalemi (Sadece Gri Ayar İkonu) */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="text-[11px] font-semibold text-slate-400">Vergi / Prim Kalemi *</label>
                                            <button
                                                type="button"
                                                onClick={() => setIsTaxTypeManagerOpen(true)}
                                                className="p-1 -mr-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                                                title="Türleri Düzenle"
                                            >
                                                <Settings size={14} />
                                            </button>
                                        </div>

                                        {!isCustomTypeInput ? (
                                            <CustomSelect
                                                value={formData.taxType}
                                                onChange={(val) => {
                                                    if (val === '__new__') {
                                                        setIsCustomTypeInput(true);
                                                        setCustomTypeInputValue('');
                                                    } else {
                                                        const match = taxTypes.find(t => t.name === val);
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            taxType: val,
                                                            subCategory: match ? match.category : prev.subCategory
                                                        }));
                                                    }
                                                }}
                                                options={formTaxTypeOptions}
                                                buttonClassName="h-10"
                                                placeholder="Vergi / Prim Kalemi Seçin..."
                                                searchable={true}
                                            />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={customTypeInputValue}
                                                    onChange={e => setCustomTypeInputValue(e.target.value)}
                                                    placeholder="Yeni vergi/prim adı yazınız..."
                                                    className="flex-1 h-10 px-3.5 rounded-xl bg-[#0d1117] border border-amber-500/40 text-xs text-white placeholder-slate-500 outline-none"
                                                    autoFocus
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setIsCustomTypeInput(false)}
                                                    className="h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs transition-colors cursor-pointer shrink-0"
                                                >
                                                    Listeden Seç
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Satır 3: 3'lü Simetrik Finansal Grid (Dönem, Tutar, Tarih) */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-400 mb-1.5 block">Dönem (Ay/Yıl) *</label>
                                            <CustomSelect
                                                value={formData.period}
                                                onChange={(val) => setFormData(prev => ({ ...prev, period: val }))}
                                                options={PERIOD_OPTIONS}
                                                buttonClassName="h-10"
                                                placeholder="Dönem Seçin"
                                                searchable={true}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-400 mb-1.5 block">Ödeme Tutarı (₺) *</label>
                                            <input
                                                type="number"
                                                required
                                                step="0.01"
                                                value={formData.amount}
                                                onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                                                placeholder="0.00"
                                                className="w-full h-10 px-3.5 rounded-xl bg-[#0d1117] border border-white/[0.08] hover:border-white/[0.16] focus:border-amber-500/70 text-xs text-white font-mono font-bold outline-none transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-400 mb-1.5 block">Ödeme Tarihi *</label>
                                            <CustomDatePicker
                                                value={formData.date}
                                                onChange={(newDate) => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        date: newDate,
                                                        period: newDate ? newDate.slice(0, 7) : prev.period
                                                    }));
                                                }}
                                                placeholder="GG/AA/YYYY"
                                                className="w-full h-10 bg-[#0d1117] border border-white/[0.08] hover:border-white/[0.16] rounded-xl text-white font-mono"
                                            />
                                        </div>
                                    </div>

                                    {/* Satır 4: Açıklama */}
                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-400 mb-1.5 block">Açıklama / Detay</label>
                                        <input
                                            type="text"
                                            value={formData.description}
                                            onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                            placeholder="Örn: 2026 1. Dönem Geçici Vergi Ödemesi"
                                            className="w-full h-10 px-3.5 rounded-xl bg-[#0d1117] border border-white/[0.08] hover:border-white/[0.16] focus:border-amber-500/70 text-xs text-white placeholder-slate-600 outline-none transition-colors"
                                        />
                                    </div>

                                    {/* Satır 5: Dekont & Not Bölümü */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-black/40 border border-white/[0.06]">
                                        <div className="flex flex-col justify-between">
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <Paperclip size={13} className="text-amber-400" />
                                                <span className="text-[11px] font-semibold text-slate-300">Dekont / Tahakkuk Fişi</span>
                                            </div>
                                            <FileUpload
                                                files={formData.files || []}
                                                onChange={files => setFormData(prev => ({ ...prev, files }))}
                                                maxSizeMB={8}
                                                hideHint={true}
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-[11px] font-semibold text-slate-400 mb-1.5 block">Dahili Muhasebe Notu</label>
                                            <textarea
                                                rows={3}
                                                value={formData.note}
                                                onChange={e => setFormData(prev => ({ ...prev, note: e.target.value }))}
                                                placeholder="Banka dekont no veya muhasebe notları..."
                                                className="w-full flex-1 min-h-[70px] px-3 py-2 rounded-xl bg-[#080a0f] border border-white/[0.08] text-xs text-white placeholder-slate-600 outline-none focus:border-amber-500/40 resize-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Alt Aksiyon Butonları (Sabit Footer) */}
                            <div className="h-14 shrink-0 px-4 sm:px-6 border-t border-white/[0.06] bg-[#080a0f] flex items-center justify-between gap-3 z-10">
                                <div>
                                    {editingPaymentId && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                handleDeleteRecord(editingPaymentId, formData.taxType);
                                                handleCloseForm();
                                            }}
                                            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1.5 transition-colors cursor-pointer"
                                        >
                                            <Trash2 size={14} />
                                            <span>Kaydı Sil</span>
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2.5">
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
                            </div>
                        </form>
                    </div>
                ) : (
                    /* ═════════════ LİSTE & ARAMA MASASI ═════════════ */
                    <div className="flex-1 flex flex-col h-full min-h-0">
                        {/* Arama ve Dönem Çubuğu */}
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
                                <CustomSelect
                                    value={filterMonth}
                                    onChange={(val) => setFilterMonth(val)}
                                    options={filterMonthOptions}
                                    className="w-48 shrink-0"
                                />
                            </div>
                        </div>

                        {/* Tablo / Kart Listesi (Sade, Yan Bilgisiz) */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 sm:p-3 space-y-1.5 min-h-0">
                            {filteredRecords.length > 0 ? (
                                filteredRecords.map((rec) => {
                                    const isSgk = isSgkRecord(rec, taxTypes);
                                    const hasFiles = rec.files && rec.files.length > 0;
                                    const rawTitle = rec.taxType || rec.description || (isSgk ? 'SGK Primi' : 'Vergi Ödemesi');
                                    const displayTitle = cleanTaxName(rawTitle);

                                    return (
                                        <div
                                            key={rec.id}
                                            className="p-3 sm:px-4 sm:py-3 rounded-xl bg-[#080a0f] border border-white/[0.06] hover:border-amber-500/30 transition-colors flex items-center justify-between gap-3 group"
                                        >
                                            {/* Sol Blok: İkon, Başlık ve Yalın Tarih */}
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                                                    isSgk
                                                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                                        : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                                }`}>
                                                    {isSgk ? <Building2 size={16} /> : <Receipt size={16} />}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">
                                                        {displayTitle}
                                                    </h4>
                                                    {rec.date && (
                                                        <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                                                            {new Date(rec.date).toLocaleDateString('tr-TR')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Sağ Blok: Tutar ve Aksiyonlar (Belge İkonu + Düzenle) */}
                                            <div className="flex items-center gap-3 shrink-0">
                                                {/* Tutar */}
                                                <div className="text-right">
                                                    <span className="text-sm sm:text-base font-bold text-white font-mono block">
                                                        {formatCurrency(rec.amount)}
                                                    </span>
                                                </div>

                                                {/* Aksiyon Butonları */}
                                                <div className="flex items-center gap-1.5">
                                                    {/* Belge varsa: Yalnızca Şık Belge İkonu Butonu */}
                                                    {hasFiles && (
                                                        <button
                                                            onClick={() => setPreviewDoc(rec.files[0])}
                                                            className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-colors cursor-pointer"
                                                            title={`${rec.files.length} Belgeyi İncele`}
                                                        >
                                                            <Paperclip size={15} />
                                                        </button>
                                                    )}

                                                    {/* Düzenle Butonu */}
                                                    <button
                                                        onClick={() => handleOpenEditForm(rec)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 border border-white/[0.06] hover:border-white/15 transition-colors cursor-pointer"
                                                        title="Düzenle"
                                                    >
                                                        <Edit3 size={15} />
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
                    className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[9999] p-2 sm:p-6 animate-in fade-in duration-200"
                    onClick={() => setPreviewDoc(null)}
                >
                    <div
                        className="bg-[#07090e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] sm:h-[90vh] overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] bg-[#080a0f] shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <FileText size={16} className="text-amber-400 shrink-0" />
                                <h3 className="text-sm font-bold text-white truncate">{previewDoc.name || 'Resmi Evrak'}</h3>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <a
                                    href={previewDoc.url || previewDoc.data}
                                    download={previewDoc.name || 'resmi-evrak.pdf'}
                                    className="p-1.5 rounded-lg bg-white/5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                    title="İndir"
                                >
                                    <Download size={15} />
                                </a>
                                <button
                                    type="button"
                                    onClick={() => handleOpenInNewTab(previewDoc)}
                                    className="p-1.5 rounded-lg bg-white/5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                    title="Yeni Sekmede Aç"
                                >
                                    <ExternalLink size={15} />
                                </button>
                                <button
                                    onClick={() => setPreviewDoc(null)}
                                    className="w-7 h-7 rounded-lg bg-white/5 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                                >
                                    <X size={15} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 bg-[#090c15] overflow-hidden relative">
                            {previewDoc.type?.startsWith('image/') || previewDoc.url?.match(/\.(jpeg|jpg|png|webp)/i) ? (
                                <div className="w-full h-full flex items-center justify-center p-4">
                                    <img
                                        src={previewDoc.url || previewDoc.data}
                                        alt={previewDoc.name}
                                        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
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

            {/* ═════════════ 5. TÜM VERGİ TÜRLERİ YÖNETİMİ (DÜZENLEME, SİLME, KATEGORİ DEĞİŞTİRME) ═════════════ */}
            {isTaxTypeManagerOpen && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999] p-3 sm:p-4 animate-in fade-in duration-200"
                    onClick={() => setIsTaxTypeManagerOpen(false)}
                >
                    <div
                        className="bg-[#07090e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Başlık */}
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] bg-[#080a0f] shrink-0">
                            <div className="flex items-center gap-2">
                                <Settings size={16} className="text-slate-400" />
                                <h3 className="text-sm font-bold text-white">Kayıtlı Vergi & SGK Türleri</h3>
                            </div>
                            <button
                                onClick={() => setIsTaxTypeManagerOpen(false)}
                                className="w-7 h-7 rounded-lg bg-white/5 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {/* Gövde */}
                        <div className="p-4 sm:p-5 flex-1 overflow-y-auto custom-scrollbar space-y-4">
                            {/* Yeni Tür Ekle Formu */}
                            <form onSubmit={handleAddNewTaxType} className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Yeni Tür Ekle</span>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newTaxTypeName}
                                        onChange={e => setNewTaxTypeName(e.target.value)}
                                        placeholder="Vergi veya prim adı (Örn: Damga Vergisi, MTV)..."
                                        className="flex-1 h-9 px-3.5 rounded-xl bg-[#0d1117] border border-white/10 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500/40"
                                    />
                                    <button
                                        type="submit"
                                        className="px-4 h-9 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-lg shadow-amber-500/20"
                                    >
                                        <Plus size={14} />
                                        <span>Ekle</span>
                                    </button>
                                </div>
                            </form>

                            {/* Mevcut Türler Listesi (Tümü Düzenlenebilir, Silinebilir ve Kategorisi Değiştirilebilir) */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                        Kayıtlı Türler ({taxTypes.length})
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleResetTaxTypesToDefault}
                                        className="text-[10px] text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition-colors"
                                        title="Standart sistem türlerine geri dön"
                                    >
                                        <RotateCcw size={11} />
                                        <span>Varsayılanlara Sıfırla</span>
                                    </button>
                                </div>

                                <div className="space-y-1.5">
                                    {taxTypes.map((item) => {
                                        const isEditingThis = editingTaxTypeId === item.id;
                                        const isSgk = item.category === 'sgk';

                                        return (
                                            <div
                                                key={item.id}
                                                className="px-3 py-2 rounded-xl bg-[#080a0f] border border-white/[0.06] hover:border-white/15 flex items-center justify-between gap-2 text-xs text-slate-300 transition-colors"
                                            >
                                                {isEditingThis ? (
                                                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                        <input
                                                            type="text"
                                                            value={editingTaxTypeName}
                                                            onChange={e => setEditingTaxTypeName(e.target.value)}
                                                            className="flex-1 px-2 py-1 rounded-lg bg-[#0d1117] border border-amber-500/50 text-xs text-white outline-none"
                                                            autoFocus
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSaveEditTaxType(item.id)}
                                                            className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded cursor-pointer"
                                                            title="Kaydet"
                                                        >
                                                            <Check size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingTaxTypeId(null)}
                                                            className="p-1 text-slate-400 hover:bg-white/10 rounded cursor-pointer"
                                                            title="Vazgeç"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                                            <span className="truncate text-white font-medium">{item.name}</span>
                                                            <div className="flex rounded-lg bg-[#0d1117] border border-white/10 p-0.5 shrink-0 ml-auto sm:ml-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSetTypeCategory(item.id, 'vergi')}
                                                                    className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                                                                        !isSgk
                                                                            ? 'bg-amber-500 text-black'
                                                                            : 'text-slate-500 hover:text-slate-300'
                                                                    }`}
                                                                    title="Vergi olarak ayarla"
                                                                >
                                                                    Vergi
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSetTypeCategory(item.id, 'sgk')}
                                                                    className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                                                                        isSgk
                                                                            ? 'bg-blue-600 text-white'
                                                                            : 'text-slate-500 hover:text-slate-300'
                                                                    }`}
                                                                    title="SGK olarak ayarla"
                                                                >
                                                                    SGK
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setEditingTaxTypeId(item.id);
                                                                    setEditingTaxTypeName(item.name);
                                                                }}
                                                                className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded transition-colors cursor-pointer"
                                                                title="Düzenle"
                                                            >
                                                                <Edit3 size={13} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteTaxType(item.id, item.name)}
                                                                className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                                                                title="Sil"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Alt Bar */}
                        <div className="p-3 border-t border-white/[0.06] bg-[#080a0f] flex justify-end shrink-0">
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

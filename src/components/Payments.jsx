import React, { useState, useContext, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DataContext } from '../context/DataContext';
import { 
    Wallet, 
    Search, 
    Filter, 
    TrendingUp, 
    TrendingDown, 
    Plus, 
    Download, 
    Trash2, 
    Calendar, 
    Pencil, 
    ArrowDownRight, 
    ArrowUpRight, 
    X, 
    Check, 
    Save, 
    Receipt, 
    FileText, 
    Paperclip, 
    RefreshCw,
    Sparkles,
    Coins,
    Menu
} from 'lucide-react';
import FileUpload from './FileUpload';
import CustomDatePicker from './CustomDatePicker';
import CustomSelect from './CustomSelect';

const Payments = ({ onOpenMenu, isMobile } = {}) => {
    const {
        paymentRecords,
        addPayment,
        deletePayment,
        updatePayment
    } = useContext(DataContext);

    // Filters
    const [filterType, setFilterType] = useState('Hepsi'); // 'Hepsi', 'Tahsilat', 'Ödeme', 'Rapor Dışı'
    const [filterMonth, setFilterMonth] = useState(''); // 'YYYY-MM'
    const [searchTerm, setSearchTerm] = useState('');

    // In-Card Studio State (Zero-Scroll / Modal-Free)
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingPaymentId, setEditingPaymentId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [viewingFilesRecord, setViewingFilesRecord] = useState(null);

    // Helpers for viewing files directly
    const openFile = (f) => {
        if ((f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf')) && f.data?.startsWith('data:')) {
            const byteStr = atob(f.data.split(',')[1]);
            const arr = new Uint8Array(byteStr.length);
            for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
            const blob = new Blob([arr], { type: 'application/pdf' });
            window.open(URL.createObjectURL(blob));
        } else {
            window.open(f.data, '_blank');
        }
    };

    // Form States
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        type: 'Tahsilat',
        description: '',
        amount: '',
        files: []
    });

    // Formatting helper
    const formatCurrency = (val, showSign = false) => {
        const num = Number(val) || 0;
        const absFormatted = Math.abs(num).toLocaleString('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        if (num < 0) {
            return `-₺${absFormatted}`;
        }
        if (showSign && num > 0) {
            return `+₺${absFormatted}`;
        }
        return `₺${absFormatted}`;
    };

    // Dynamic Month Options for Filter (matching Mazot Fişleri / Seferler style)
    const monthOptions = useMemo(() => {
        const options = [{ value: 'all', label: 'Tüm Zamanlar' }];
        const currentYear = new Date().getFullYear();

        const activeList = (paymentRecords || []).filter(r => !r.deleted);
        const uniqueMonths = [...new Set(activeList.map(r => {
            if (!r.date) return null;
            const d = new Date(r.date);
            if (isNaN(d.getTime())) return null;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }).filter(Boolean))].sort().reverse();

        // Include current month
        const nowYm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        if (!uniqueMonths.includes(nowYm)) {
            uniqueMonths.unshift(nowYm);
        }

        uniqueMonths.forEach(ym => {
            const [y, m] = ym.split('-');
            const year = parseInt(y);
            const monthIndex = parseInt(m) - 1;
            const date = new Date(year, monthIndex, 1);
            const monthName = date.toLocaleString('tr-TR', { month: 'long' });
            const capMonthName = monthName.charAt(0).toLocaleUpperCase('tr-TR') + monthName.slice(1);

            const label = `${capMonthName} ${year}`;
            options.push({ value: ym, label });
        });

        return options;
    }, [paymentRecords]);

    // Filter & Search calculation
    const activePaymentRecords = useMemo(() => {
        let records = (paymentRecords || []).filter(r => !r.deleted)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        if (filterType !== 'Hepsi') {
            records = records.filter(r => r.type === filterType);
        }

        if (filterMonth && filterMonth !== 'all') {
            records = records.filter(r => {
                const recordMonth = (r.date || '').substring(0, 7); // 'YYYY-MM'
                return recordMonth === filterMonth;
            });
        }

        if (searchTerm.trim()) {
            const q = searchTerm.trim().toLocaleLowerCase('tr-TR');
            records = records.filter(r => {
                const desc = (r.description || '').toLocaleLowerCase('tr-TR');
                const amountStr = String(r.amount || '');
                const typeStr = (r.type || '').toLocaleLowerCase('tr-TR');
                return desc.includes(q) || amountStr.includes(q) || typeStr.includes(q);
            });
        }

        return records;
    }, [paymentRecords, filterType, filterMonth, searchTerm]);

    // Stats calculated based on active time filter (Period-aware)
    const activeForBalance = useMemo(() => {
        let records = (paymentRecords || []).filter(r => !r.deleted);
        if (filterMonth && filterMonth !== 'all') {
            records = records.filter(r => (r.date || '').substring(0, 7) === filterMonth);
        }
        return records;
    }, [paymentRecords, filterMonth]);

    const totalIncome = activeForBalance.filter(r => r.type === 'Tahsilat').reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalExpense = activeForBalance.filter(r => r.type === 'Ödeme').reduce((sum, r) => sum + (r.amount || 0), 0);
    const netBalance = totalIncome - totalExpense;

    const handleOpenAddForm = () => {
        setEditingPaymentId(null);
        setFormData({
            type: 'Tahsilat',
            date: new Date().toISOString().split('T')[0],
            description: '',
            amount: '',
            files: []
        });
        setIsFormOpen(true);
    };

    const handleOpenEditForm = (record) => {
        setEditingPaymentId(record.id);
        setFormData({
            type: record.type || 'Tahsilat',
            date: record.date || new Date().toISOString().split('T')[0],
            description: record.description || '',
            amount: record.amount !== undefined ? String(record.amount) : '',
            files: record.files || []
        });
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setEditingPaymentId(null);
        setFormData({
            type: 'Tahsilat',
            date: new Date().toISOString().split('T')[0],
            description: '',
            amount: '',
            files: []
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.amount || isNaN(parseFloat(formData.amount))) {
            alert('Lütfen geçerli bir tutar giriniz.');
            return;
        }
        if (!formData.description.trim()) {
            alert('Lütfen açıklama alanını doldurunuz.');
            return;
        }

        setIsSubmitting(true);
        try {
            if (editingPaymentId) {
                await updatePayment(editingPaymentId, {
                    ...formData,
                    amount: parseFloat(formData.amount)
                });
            } else {
                await addPayment({
                    ...formData,
                    amount: parseFloat(formData.amount)
                });
            }
            handleCloseForm();
        } catch (err) {
            console.error("Ödeme kaydedilemedi:", err);
            alert('İşlem kaydedilemedi. Lütfen tekrar deneyin.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = (id) => {
        if (window.confirm('Bu kaydı silmek istediğinizden emin misiniz?')) {
            deletePayment(id);
        }
    };

    return (
        <div 
            className="flex-1 flex flex-col h-full w-full p-2.5 sm:p-4 lg:p-6 overflow-hidden gap-2.5 sm:gap-3 max-w-[1920px] mx-auto pb-1 sm:pb-2"
        >
            {/* Mobilde Şık Başlık & Menü Çubuğu */}
            {isMobile && onOpenMenu && (
                <div 
                    className="flex items-center justify-between gap-3 pb-2 border-b border-white/[0.06] shrink-0"
                    style={{
                        paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))'
                    }}
                >
                    <div className="flex items-center gap-2.5 min-w-0">
                        <button 
                            onClick={onOpenMenu} 
                            className="p-1.5 -ml-1 text-slate-400 hover:text-slate-100 transition-colors flex items-center justify-center cursor-pointer rounded-lg hover:bg-white/5"
                            title="Menüyü Aç"
                        >
                            <Menu size={22} />
                        </button>
                        <h2 className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
                            Ödeme Takibi
                        </h2>
                    </div>
                </div>
            )}
            
            {/* 1. Üst Finansal Bento Kartları (Pürüzsüz Grid Row Kapanışı) */}
            <div 
                className="grid shrink-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{
                    gridTemplateRows: isFormOpen ? '0fr' : '1fr',
                    opacity: isFormOpen ? 0 : 1,
                    pointerEvents: isFormOpen ? 'none' : 'auto',
                }}
            >
                <div className="overflow-hidden min-h-0">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 pb-1">
                        {/* 1. KART: Toplam Tahsilat (Giriş - Zümrüt Yeşili) */}
                        <div 
                            className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-[#1b2f28] shadow-lg sm:shadow-2xl shadow-black/80 flex flex-col justify-between p-3 sm:p-5"
                            style={{ 
                                backgroundColor: '#070f0c',
                                backgroundImage: 'radial-gradient(ellipse 70% 60% at 100% 0%, rgba(16,185,129,0.22) 0%, transparent 70%), radial-gradient(ellipse 70% 60% at 0% 100%, rgba(16,185,129,0.10) 0%, transparent 70%)'
                            }}
                        >
                            <div className="flex items-center justify-between mb-1 sm:mb-2">
                                <span className="text-[11px] sm:text-sm font-bold text-emerald-400 tracking-wide flex items-center gap-1 sm:gap-1.5">
                                    <ArrowDownRight size={14} className="sm:w-4 sm:h-4" /> Toplam Tahsilat (Giriş)
                                </span>
                                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                                    <TrendingUp size={13} className="sm:w-4 sm:h-4" />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xl sm:text-3xl font-black text-white font-mono tracking-tight">
                                    {formatCurrency(totalIncome)}
                                </h3>
                                <p className="text-[10px] sm:text-[11px] text-emerald-400/80 mt-0.5 sm:mt-1 font-medium">
                                    {activeForBalance.filter(r => r.type === 'Tahsilat').length} adet tahsilat işlemi
                                </p>
                            </div>
                        </div>

                        {/* 2. KART: Toplam Ödeme (Çıkış - Okyanus Cyan / Teal) */}
                        <div 
                            className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-[#162933] shadow-lg sm:shadow-2xl shadow-black/80 flex flex-col justify-between p-3 sm:p-5"
                            style={{ 
                                backgroundColor: '#070f14',
                                backgroundImage: 'radial-gradient(ellipse 70% 60% at 100% 0%, rgba(6,182,212,0.22) 0%, transparent 70%), radial-gradient(ellipse 70% 60% at 0% 100%, rgba(6,182,212,0.08) 0%, transparent 70%)'
                            }}
                        >
                            <div className="flex items-center justify-between mb-1 sm:mb-2">
                                <span className="text-[11px] sm:text-sm font-bold text-cyan-400 tracking-wide flex items-center gap-1 sm:gap-1.5">
                                    <ArrowUpRight size={14} className="sm:w-4 sm:h-4" /> Toplam Ödeme (Çıkış)
                                </span>
                                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                                    <TrendingDown size={13} className="sm:w-4 sm:h-4" />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xl sm:text-3xl font-black text-white font-mono tracking-tight">
                                    {formatCurrency(totalExpense)}
                                </h3>
                                <p className="text-[10px] sm:text-[11px] text-cyan-400/80 mt-0.5 sm:mt-1 font-medium">
                                    {activeForBalance.filter(r => r.type === 'Ödeme').length} adet ödeme işlemi
                                </p>
                            </div>
                        </div>

                        {/* 3. KART: Net Kasa (Bakiye - Lüks Zümrüt Obsidian) */}
                        <div 
                            className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-[#1b2f28] shadow-lg sm:shadow-2xl shadow-black/80 flex flex-col justify-between p-3 sm:p-5"
                            style={{ 
                                backgroundColor: '#070f0c',
                                backgroundImage: 'radial-gradient(ellipse 70% 60% at 100% 0%, rgba(16,185,129,0.25) 0%, transparent 70%), radial-gradient(ellipse 70% 60% at 0% 100%, rgba(16,185,129,0.12) 0%, transparent 70%)'
                            }}
                        >
                            <div className="flex items-center justify-between mb-1 sm:mb-2">
                                <span className="text-[11px] sm:text-sm font-bold text-emerald-400 tracking-wide flex items-center gap-1 sm:gap-1.5">
                                    <Wallet size={14} className="sm:w-4 sm:h-4" /> Net Kasa (Bakiye)
                                </span>
                                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                                    <Coins size={13} className="sm:w-4 sm:h-4" />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xl sm:text-3xl font-black font-mono tracking-tight text-white">
                                    {formatCurrency(netBalance, true)}
                                </h3>
                                <p className="text-[10px] sm:text-[11px] mt-0.5 sm:mt-1 font-medium text-emerald-400/80">
                                    {filterMonth && filterMonth !== 'all' 
                                        ? `${monthOptions.find(o => o.value === filterMonth)?.label || 'Dönem'} Net Dengesi`
                                        : 'Tüm Zamanlar Net Dengesi'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Ana Kart (In-Card Form Stüdyosu VEYA Tablo Listesi) */}
            <div className="bg-[#07090e] border border-white/[0.06] rounded-2xl shadow-xl flex-1 flex flex-col overflow-hidden min-h-0 relative">
                
                {isFormOpen ? (
                    /* IN-CARD ZERO-SCROLL İŞLEM STÜDYOSU */
                    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#07090e] animate-in fade-in zoom-in-[0.99] duration-300">
                        {/* Stüdyo Başlığı */}
                        <div className="h-14 shrink-0 bg-[#07090e] border-b border-white/[0.06] px-4 sm:px-6 flex items-center justify-between gap-4 z-10">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                                    <Wallet size={16} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                                            {editingPaymentId ? 'İşlemi Düzenle' : 'Yeni Finansal İşlem Ekle'}
                                        </h3>
                                        <span className="text-[11px] text-slate-400 hidden sm:inline font-mono">
                                            • {formData.type === 'Tahsilat' ? 'Para Girişi' : formData.type === 'Ödeme' ? 'Para Çıkışı' : 'Rapor Dışı Kayıt'}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 hidden sm:block">
                                        Nakit akış kaydı, tarih, tutar ve makbuz yönetimi
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleCloseForm}
                                className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-white transition flex items-center justify-center cursor-pointer"
                                title="Kapat (ESC / X)"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Stüdyo Form Gövdesi (2 Sütunlu Dengeli Bento Mimarisi) */}
                        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col justify-between">
                            <div className="flex-1 min-h-0 p-4 sm:p-5 overflow-y-auto custom-scrollbar">
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
                                    
                                    {/* Sol Kolon (5/12): İşlem Parametreleri */}
                                    <div className="lg:col-span-5 flex flex-col justify-between bg-white/[0.02] border border-white/[0.05] rounded-3xl p-4 sm:p-5 gap-3.5">
                                        <div className="h-10 flex items-center border-b border-white/[0.05] pb-2">
                                            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                                                İşlem Parametreleri
                                            </h4>
                                        </div>

                                        {/* 1. İşlem Türü (3'lü Segmented Butonlar) */}
                                        <div>
                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">
                                                İşlem Türü *
                                            </label>
                                            <div className="grid grid-cols-3 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, type: 'Tahsilat' })}
                                                    className={`h-8 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                        formData.type === 'Tahsilat'
                                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                                                            : 'bg-[#0d1117] border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.04]'
                                                    }`}
                                                >
                                                    <ArrowDownRight size={14} /> Tahsilat
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, type: 'Ödeme' })}
                                                    className={`h-8 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                        formData.type === 'Ödeme'
                                                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20'
                                                            : 'bg-[#0d1117] border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.04]'
                                                    }`}
                                                >
                                                    <ArrowUpRight size={14} /> Ödeme
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, type: 'Rapor Dışı' })}
                                                    className={`h-8 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                        formData.type === 'Rapor Dışı'
                                                            ? 'bg-slate-500/20 text-slate-200 border border-slate-500/40 shadow-sm'
                                                            : 'bg-[#0d1117] border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.04]'
                                                    }`}
                                                >
                                                    Rapor Dışı
                                                </button>
                                            </div>
                                        </div>

                                        {/* 2. Tarih */}
                                        <div>
                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">
                                                İşlem Tarihi *
                                            </label>
                                            <CustomDatePicker
                                                value={formData.date}
                                                onChange={(val) => setFormData({ ...formData, date: val })}
                                                placeholder="İşlem Tarihi Seçin"
                                                className="w-full h-8"
                                            />
                                        </div>

                                        {/* 3. Tutar */}
                                        <div>
                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">
                                                Tutar (₺) *
                                            </label>
                                            <div className="relative flex items-center">
                                                <span className="absolute left-3 text-xs font-bold text-slate-400 pointer-events-none font-mono">
                                                    ₺
                                                </span>
                                                <input
                                                    type="number"
                                                    required
                                                    min="0"
                                                    step="0.01"
                                                    value={formData.amount}
                                                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                                    className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl pl-7 pr-3 text-xs sm:text-sm font-mono font-bold focus:border-emerald-500 outline-none"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sağ Kolon (7/12): Açıklama & Makbuz/Belge Ekle */}
                                    <div className="lg:col-span-7 flex flex-col justify-between bg-white/[0.02] border border-white/[0.05] rounded-3xl p-4 sm:p-5 gap-3.5">
                                        <div className="h-10 flex items-center border-b border-white/[0.05] pb-2">
                                            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                                                Açıklama & Ekli Belgeler
                                            </h4>
                                        </div>

                                        {/* 1. Açıklama */}
                                        <div>
                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4">
                                                Açıklama (Kime / Kimden) *
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={formData.description}
                                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                className="w-full h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl px-3 text-xs sm:text-sm font-semibold focus:border-emerald-500 outline-none"
                                                placeholder={
                                                    formData.type === 'Tahsilat'
                                                        ? 'Örn: Çayırhan Nakliye Tahsilatı'
                                                        : formData.type === 'Ödeme'
                                                        ? 'Örn: Lastikçi Ahmet Usta Ödemesi'
                                                        : 'Örn: 6 Aylık Gelir Vergisi Beyannamesi'
                                                }
                                            />
                                        </div>

                                        {/* 2. Belge / Makbuz / Fatura Ekle */}
                                        <div className="flex-1 flex flex-col justify-between pt-2">
                                            <label className="block text-[11px] font-medium text-slate-400 mb-1.5 h-4 flex items-center gap-1.5">
                                                <Paperclip size={13} className="text-emerald-400" /> Makbuz / Dekont / Belge Ekle
                                            </label>
                                            <div className="bg-[#0d1117] border border-white/[0.08] rounded-2xl p-2.5">
                                                <FileUpload files={formData.files} onChange={files => setFormData({ ...formData, files })} />
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>

                            {/* Alt Aksiyon Çubuğu */}
                            <div className="h-14 shrink-0 bg-[#07090e] border-t border-white/[0.06] px-4 sm:px-6 flex items-center justify-between gap-3 z-10">
                                <div className="text-xs text-slate-400 hidden sm:flex items-center gap-1.5">
                                    <Sparkles size={14} className="text-emerald-400" />
                                    <span>Tüm değişiklikler güvenle şirketinize kaydedilir.</span>
                                </div>
                                <div className="flex items-center gap-2.5 ml-auto">
                                    <button
                                        type="button"
                                        onClick={handleCloseForm}
                                        className="h-8 px-4 text-xs font-semibold text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition cursor-pointer"
                                    >
                                        Vazgeç
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="h-8 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/25 cursor-pointer disabled:opacity-50 active:scale-95"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <RefreshCw size={13} className="animate-spin" />
                                                Kaydediliyor...
                                            </>
                                        ) : (
                                            <>
                                                <Save size={13} />
                                                {editingPaymentId ? 'Değişiklikleri Kaydet' : 'İşlemi Kaydet'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                ) : (
                    /* TABLO VE FİLTRE GÖRÜNÜMÜ */
                    <div className="flex-1 flex flex-col h-full min-h-0">
                        {/* Filtre & Aksiyon Barı */}
                        <div className="min-h-12 py-2.5 sm:py-2 shrink-0 bg-[#07090e] border-b border-white/[0.06] px-3 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-2.5 z-10">
                            
                            {/* Sol Filtreler (Canlı Arama + Tür Seçici + Ay/Dönem Filtresi) */}
                            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                                {/* Canlı Arama Input */}
                                <div className="relative flex items-center flex-1 sm:flex-initial min-w-[140px]">
                                    <Search size={13} className="absolute left-3 text-slate-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="İşlem / tutar ara..."
                                        className="h-8 bg-[#0d1117] border border-white/[0.08] text-white rounded-xl pl-8 pr-7 text-xs focus:border-emerald-500 outline-none w-full sm:w-48 transition placeholder:text-slate-500"
                                    />
                                    {searchTerm && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchTerm('')}
                                            className="absolute right-2 text-slate-400 hover:text-white cursor-pointer"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>

                                {/* Tür Filtresi */}
                                <div className="w-[calc(50%-4px)] sm:w-32">
                                    <CustomSelect
                                        value={filterType}
                                        onChange={setFilterType}
                                        options={[
                                            { value: 'Hepsi', label: 'Tüm Türler' },
                                            { value: 'Tahsilat', label: 'Tahsilatlar' },
                                            { value: 'Ödeme', label: 'Ödemeler' },
                                            { value: 'Rapor Dışı', label: 'Rapor Dışı' }
                                        ]}
                                        buttonClassName="h-8 py-0 text-xs"
                                    />
                                </div>

                                {/* Şık Tarih / Dönem Filtresi (Tüm Zamanlar / Ağustos 2026 vb.) */}
                                <div className="w-[calc(50%-4px)] sm:w-36">
                                    <CustomSelect
                                        value={filterMonth || 'all'}
                                        onChange={(val) => setFilterMonth(val === 'all' ? '' : val)}
                                        options={monthOptions}
                                        placeholder="Tüm Zamanlar"
                                        buttonClassName="h-8 py-0 text-xs"
                                    />
                                </div>
                            </div>

                            {/* Sağ Aksiyon: Yeni İşlem Ekle */}
                            <button
                                type="button"
                                onClick={handleOpenAddForm}
                                className="h-8 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-md shadow-emerald-500/25 active:scale-95 cursor-pointer shrink-0 w-full sm:w-auto"
                            >
                                <Plus size={14} /> Yeni İşlem Ekle
                            </button>
                        </div>

                        {/* Ödemeler İçeriği (Masaüstü Tablo + Mobil Kart Görünümü) */}
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                            {activePaymentRecords.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 m-auto">
                                    <div className="w-14 h-14 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center text-slate-600 mb-3">
                                        <Wallet size={26} />
                                    </div>
                                    <p className="text-sm font-semibold text-slate-400">Kayıt Bulunamadı</p>
                                    <p className="text-xs text-slate-600 mt-1 max-w-xs">
                                        {searchTerm || filterType !== 'Hepsi' || (filterMonth && filterMonth !== 'all')
                                            ? 'Filtreleme kriterlerinize uygun ödeme kaydı bulunamadı.' 
                                            : 'Nakit akışınızı takip etmek için yukarıdaki "Yeni İşlem Ekle" butonuna tıklayın.'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* ─── MASAÜSTÜ TABLO GÖRÜNÜMÜ (hidden md:block) ─── */}
                                    <div className="hidden md:block overflow-y-auto flex-1 custom-scrollbar">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="sticky top-0 bg-[#07090e] border-b border-white/[0.06] text-[11px] font-bold text-slate-400 uppercase tracking-wider z-10">
                                                <tr>
                                                    <th className="py-3 px-4 sm:px-6">Tarih</th>
                                                    <th className="py-3 px-4">Tür</th>
                                                    <th className="py-3 px-4">Açıklama (Kime / Kimden)</th>
                                                    <th className="py-3 px-4 text-right">Tutar</th>
                                                    <th className="py-3 px-4 sm:px-6 text-center w-24">İşlem</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/[0.04] text-xs">
                                                {activePaymentRecords.map((record) => {
                                                    const isIncome = record.type === 'Tahsilat';
                                                    const isExpense = record.type === 'Ödeme';

                                                    return (
                                                        <tr 
                                                            key={record.id} 
                                                            className="hover:bg-white/[0.02] transition-colors group"
                                                        >
                                                            <td className="py-3 px-4 sm:px-6 font-mono text-slate-300 font-medium">
                                                                {record.date ? new Date(record.date).toLocaleDateString('tr-TR') : '-'}
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                                                    isIncome
                                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                                                        : isExpense
                                                                        ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25'
                                                                        : 'bg-slate-500/10 text-slate-400 border-slate-500/25'
                                                                }`}>
                                                                    {record.type}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4 text-white font-medium">
                                                                <div className="flex items-center gap-2">
                                                                    <span>{record.description}</span>
                                                                    {record.files?.length > 0 && (
                                                                        <button 
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if (record.files.length === 1) {
                                                                                    openFile(record.files[0]);
                                                                                } else {
                                                                                    setViewingFilesRecord(record);
                                                                                }
                                                                            }}
                                                                            className="text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-emerald-500/20"
                                                                            title="Belgeyi Gör"
                                                                        >
                                                                            <Paperclip size={10} />
                                                                            <span>{record.files.length}</span>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className={`py-3 px-4 text-right font-mono font-bold text-xs sm:text-sm ${
                                                                isIncome ? 'text-emerald-400' : isExpense ? 'text-cyan-300' : 'text-slate-400'
                                                            }`}>
                                                                {isIncome ? '+' : isExpense ? '-' : ''}₺{(record.amount || 0).toLocaleString('tr-TR', {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2
                                                                })}
                                                            </td>
                                                            <td className="py-3 px-4 sm:px-6 text-center">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenEditForm(record)}
                                                                        className="w-7 h-7 rounded-lg transition text-slate-400 hover:text-emerald-400 hover:bg-white/5 flex items-center justify-center cursor-pointer"
                                                                        title="Kaydı Düzenle"
                                                                    >
                                                                        <Pencil size={14} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDelete(record.id)}
                                                                        className="w-7 h-7 rounded-lg transition text-slate-400 hover:text-red-400 hover:bg-white/10 flex items-center justify-center cursor-pointer"
                                                                        title="Kaydı Sil"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* ─── MOBİL GÖRÜNÜM: DOKUNMATİK KARTLAR (md:hidden) ─── */}
                                    <div className="md:hidden overflow-y-auto flex-1 custom-scrollbar p-3 space-y-2.5">
                                        {activePaymentRecords.map((record) => {
                                            const isIncome = record.type === 'Tahsilat';
                                            const isExpense = record.type === 'Ödeme';

                                            return (
                                                <div 
                                                    key={record.id}
                                                    className="bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.07] rounded-2xl p-3.5 flex flex-col gap-2.5 transition-all shadow-sm relative overflow-hidden"
                                                >
                                                    {/* 1. Üst Satır: Tarih & Tür Rozeti & Aksiyonlar */}
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-xs text-slate-300 font-semibold">
                                                                {record.date ? new Date(record.date).toLocaleDateString('tr-TR') : '-'}
                                                            </span>
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                                                isIncome
                                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                                                    : isExpense
                                                                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25'
                                                                    : 'bg-slate-500/10 text-slate-400 border-slate-500/25'
                                                            }`}>
                                                                {record.type}
                                                            </span>
                                                        </div>

                                                        {/* Aksiyon Butonları */}
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenEditForm(record)}
                                                                className="w-7 h-7 rounded-lg transition text-slate-400 hover:text-emerald-400 hover:bg-white/5 flex items-center justify-center cursor-pointer"
                                                                title="Düzenle"
                                                            >
                                                                <Pencil size={13} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDelete(record.id)}
                                                                className="w-7 h-7 rounded-lg transition text-slate-400 hover:text-red-400 hover:bg-white/5 flex items-center justify-center cursor-pointer"
                                                                title="Sil"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* 2. Orta & Alt Satır: Açıklama, Belge ve Tutar */}
                                                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.04]">
                                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                                            <span className="text-white text-xs font-semibold truncate">
                                                                {record.description}
                                                            </span>
                                                            {record.files?.length > 0 && (
                                                                <button 
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (record.files.length === 1) {
                                                                            openFile(record.files[0]);
                                                                        } else {
                                                                            setViewingFilesRecord(record);
                                                                        }
                                                                    }}
                                                                    className="text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md text-[10px] font-bold cursor-pointer shrink-0"
                                                                    title="Belgeleri Görüntüle"
                                                                >
                                                                    <Paperclip size={10} />
                                                                    <span>{record.files.length}</span>
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Tutar */}
                                                        <div className={`text-right font-mono font-bold text-sm shrink-0 ${
                                                            isIncome ? 'text-emerald-400' : isExpense ? 'text-cyan-300' : 'text-slate-300'
                                                        }`}>
                                                            {isIncome ? '+' : isExpense ? '-' : ''}₺{(record.amount || 0).toLocaleString('tr-TR', {
                                                                minimumFractionDigits: 2,
                                                                maximumFractionDigits: 2
                                                            })}
                                                        </div>
                                                    </div>
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

            {/* Dosya Görüntüleme Modalı (Çoklu dosya varsa) */}
            {viewingFilesRecord && createPortal(
                <div 
                    className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" 
                    onClick={() => setViewingFilesRecord(null)}
                >
                    <div 
                        className="bg-[#07090e] border border-white/[0.08] rounded-3xl p-5 sm:p-6 w-full max-w-sm shadow-2xl shadow-black/90 animate-in zoom-in-95 duration-200" 
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/[0.06]">
                            <div className="flex items-center gap-2">
                                <Paperclip size={16} className="text-emerald-400" />
                                <h3 className="font-bold text-white text-sm">Ekli Belgeler</h3>
                            </div>
                            <button 
                                onClick={() => setViewingFilesRecord(null)} 
                                className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-white transition flex items-center justify-center cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                            {viewingFilesRecord.files.map(f => (
                                <div 
                                    key={f.id} 
                                    onClick={() => openFile(f)} 
                                    className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-2xl cursor-pointer hover:bg-white/[0.06] hover:border-emerald-500/30 transition-all group"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-slate-900 border border-white/[0.08] flex items-center justify-center shrink-0">
                                        <ArrowUpRight size={16} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-white truncate">{f.name || 'İsimsiz Belge'}</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">{f.size ? (f.size / 1024 / 1024).toFixed(2) + ' MB' : 'Görsel / PDF'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Payments;


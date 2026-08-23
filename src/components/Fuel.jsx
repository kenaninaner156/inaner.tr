import React, { useState, useContext, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Droplet, Plus, MapPin, X, Trash2, Paperclip, FileText, Download, Pencil, StickyNote, ChevronDown, Calendar, Activity, Wallet, TrendingUp, Gauge, Fuel as FuelIcon, Menu } from 'lucide-react';
import { DataContext } from '../context/DataContext';
import FileUpload from './FileUpload';
import { sendDiscordAlert } from '../services/discordWebhook';

const Fuel = ({ onOpenMenu, isMobile }) => {
    const { fuelRecords, addFuel, deleteFuel, editFuel } = useContext(DataContext);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [viewFiles, setViewFiles] = useState(null);
    const [editingFuel, setEditingFuel] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [showExtra, setShowExtra] = useState(false);
    const [editShowExtra, setEditShowExtra] = useState(false);
    const [showAddSuggestions, setShowAddSuggestions] = useState(false);
    const [showEditSuggestions, setShowEditSuggestions] = useState(false);
    const [timeFilter, setTimeFilter] = useState('all');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        station: '',
        liters: '',
        price: '',
        odometer: '',
        notes: '',
        files: [],
        isPartial: false
    });

    const formatKM = (val) => {
        if (val === undefined || val === null) return '';
        const num = val.toString().replace(/\D/g, '');
        return num.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    };

    const formatDecimal = (val) => {
        if (val === undefined || val === null || val === '') return '';
        
        // Sayısal değer ise (number type) önce Türkçe formata çevir
        if (typeof val === 'number') {
            const str = val.toString();
            const [intPart, decPart] = str.split('.');
            const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            return decPart && decPart !== '0' ? `${formattedInt},${decPart}` : formattedInt;
        }

        let str = val.toString();
        
        // Kullanıcının ondalık ayraç olarak nokta kullanmasını destekle:
        // Eğer string'in son karakteri noktaysa (kullanıcı az önce nokta tuşuna bastıysa), virgüle çevir.
        if (str.endsWith('.')) {
            str = str.slice(0, -1) + ',';
        } else if (!str.includes(',')) {
            const lastDot = str.lastIndexOf('.');
            if (lastDot !== -1) {
                const afterDot = str.length - lastDot - 1;
                // Eğer noktadan sonra 1 veya 2 karakter varsa, bu büyük ihtimalle ondalık ayracıdır (örn: 12.5)
                // 3 karakterse binlik ayracıdır (örn: 1.234)
                // 4 veya daha fazlaysa, binlik ayracına sayı eklenmiştir (örn: 1.2345), ondalık değildir.
                if (afterDot === 1 || afterDot === 2) {
                    str = str.slice(0, lastDot) + ',' + str.slice(lastDot + 1);
                }
            }
        }

        // Birden fazla virgül varsa, sadece ilkini tut, diğerlerini sil
        const commaIndex = str.indexOf(',');
        if (commaIndex !== -1) {
            str = str.slice(0, commaIndex + 1) + str.slice(commaIndex + 1).replace(/,/g, '');
        }

        // Virgülü geçici bir karaktere al
        str = str.replace(',', 'TEMP_COMMA');
        
        // Tüm noktaları ve rakam olmayanları temizle
        str = str.replace(/[^0-9TEMP_COMMA]/g, '');
        
        // Virgüle geri çevir
        str = str.replace('TEMP_COMMA', ',');

        // Tam ve ondalık kısmı ayır
        let [intStr, decStr] = str.split(',');
        
        // Tam kısmı binlik ayraçla formatla
        intStr = (intStr || '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        
        // Ondalık kısım varsa virgülle birleştir
        return decStr !== undefined ? `${intStr},${decStr}` : intStr;
    };

    const parseDecimal = (val) => {
        if (!val) return 0;
        return parseFloat(val.toString().replace(/\./g, '').replace(',', '.'));
    };

    const toTitleCase = (str) => {
        if (!str) return '';
        return str.split(' ').map(word => {
            if (!word) return '';
            return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1).toLocaleLowerCase('tr-TR');
        }).join(' ');
    };

    const handleOdometerClick = (e) => {
        const input = e.target;
        const val = input.value || '';
        if (!val) return;

        // Tıklanan veya dokunulan imleç pozisyonunu al
        let pos = input.selectionStart;
        
        // Eğer konum belirlenememişse varsayılan son 3 hane
        if (pos === null || pos === undefined) {
            pos = val.length >= 3 ? val.length - 3 : 0;
        }

        // Tıklanan karakter ayraç '.' ise bir sonraki rakamdan başlat
        if (val[pos] === '.' && pos + 1 < val.length) {
            pos = pos + 1;
        }

        // Tıklanan rakam dahil sonuna kadar olan kısmı seç
        const start = Math.max(0, Math.min(pos, val.length));
        setTimeout(() => {
            input.setSelectionRange(start, val.length);
        }, 10);
    };

    const openAddModal = () => {
        // En son girilen KM değerini bulup form'a otomatik yerleştir
        const activeRecords = fuelRecords.filter(r => !r.deleted);
        const sortedRecords = [...activeRecords].sort((a,b) => new Date(b.date) - new Date(a.date));
        const lastRecordWithOdometer = sortedRecords.find(r => r.odometer);
        const lastOdometerValue = lastRecordWithOdometer ? lastRecordWithOdometer.odometer : '';
        
        setFormData({
            date: new Date().toISOString().split('T')[0],
            station: '',
            liters: '',
            price: '',
            odometer: formatKM(lastOdometerValue),
            notes: '',
            files: [],
            isPartial: false
        });
        setIsModalOpen(true);
    };

    const openEditModal = (record) => {
        setEditingFuel(record);
        setEditForm({
            date: record.date,
            station: record.station,
            liters: formatDecimal(record.liters),
            price: formatDecimal(record.price),
            odometer: formatKM(record.odometer) || '',
            notes: record.notes || '',
            files: record.files || [],
            isPartial: record.isPartial || false
        });
    };

    const handleAdd = (e) => {
        e.preventDefault();
        addFuel({
            date: formData.date,
            station: formData.station,
            liters: parseDecimal(formData.liters),
            price: parseDecimal(formData.price),
            odometer: formData.odometer ? parseFloat(formData.odometer.toString().replace(/\./g, '')) : null,
            notes: formData.notes,
            files: formData.files,
            isPartial: formData.isPartial
        });
        // Y1: Yeni yakıt fişi bildirimi
        sendDiscordAlert({
            type: 'info',
            title: '⛽ Yeni Yakıt Fişi Eklendi',
            description: `Yakıt kaydı oluşturuldu.`,
            fields: [
                { name: '📍 İstasyon', value: String(formData.station || '—'), inline: true },
                { name: '🛢️ Miktar', value: String(formData.liters || '—') + ' litre', inline: true },
                { name: '💰 Tutar', value: String(formData.price || '—') + ' ₺', inline: true },
                { name: '📅 Tarih', value: String(formData.date || '—'), inline: true },
            ]
        });
        setIsModalOpen(false);
        setShowExtra(false);
        setFormData({ date: new Date().toISOString().split('T')[0], station: '', liters: '', price: '', odometer: '', notes: '', files: [], isPartial: false });
    };

    const handleEdit = async () => {
        await editFuel(editingFuel.id, {
            date: editForm.date,
            station: editForm.station,
            liters: parseDecimal(editForm.liters),
            price: parseDecimal(editForm.price),
            odometer: editForm.odometer ? parseFloat(editForm.odometer.toString().replace(/\./g, '')) : null,
            notes: editForm.notes,
            files: editForm.files,
            isPartial: editForm.isPartial
        });
        setEditingFuel(null);
    };

    const handleDelete = (id) => {
        const deletedRecord = fuelRecords.find(r => r.id === id);
        deleteFuel(id);
        // Y3: Yakıt fişi silme bildirimi
        sendDiscordAlert({
            type: 'warning',
            title: '🗑️ Yakıt Fişi Silindi',
            description: 'Bir yakıt kaydı silindi.',
            fields: [
                { name: '📍 İstasyon', value: String(deletedRecord?.station || '—'), inline: true },
                { name: '💰 Tutar', value: String(deletedRecord?.price || '—') + ' ₺', inline: true },
                { name: '🛢️ Miktar', value: String(deletedRecord?.liters || '—') + ' litre', inline: true },
                { name: '📅 Tarih', value: String(deletedRecord?.date || '—'), inline: true },
            ]
        });
    };

    const activeFuelRecords = fuelRecords.filter(r => !r.deleted);
    
    // Kümülatif Yakıt Tüketimi Hesaplama Algoritması
    const processedRecords = React.useMemo(() => {
        // Hesaplamayı yapabilmek için kayıtları kronolojik (eskiden yeniye) sıralayalım.
        // DataContext'te b-a (yeni -> eski) sıralandığı için tersine çeviriyoruz.
        const chronological = [...activeFuelRecords].reverse();
        
        let lastOdometer = null;
        let accumulatedLiters = 0;
        let accumulatedPrice = 0;
        
        const enriched = chronological.map((record) => {
            const enrichedRecord = { ...record };
            
            if (record.odometer && record.odometer > 0 && !record.isPartial) {
                if (lastOdometer && record.odometer > lastOdometer) {
                    const distance = record.odometer - lastOdometer;
                    const totalLitersForDistance = accumulatedLiters + record.liters;
                    const totalCostForDistance = accumulatedPrice + record.price;
                    
                    enrichedRecord.consumptionStats = {
                        distance,
                        totalLiters: totalLitersForDistance,
                        ltPer100km: (totalLitersForDistance / distance) * 100,
                        costPerKm: totalCostForDistance / distance
                    };
                }
                // Yeni referans KM'yi güncelle ve birikimleri sıfırla
                lastOdometer = record.odometer;
                accumulatedLiters = 0;
                accumulatedPrice = 0;
            } else {
                // KM girilmediyse veya Kısmi Dolum (isPartial) işaretliyse biriktirmeye devam et
                if (lastOdometer) {
                    accumulatedLiters += record.liters;
                    accumulatedPrice += record.price;
                }
            }
            return enrichedRecord;
        });
        
        // Gösterim için tekrar eskiden yeniye ters çeviriyoruz
        return enriched.reverse();
    }, [activeFuelRecords]);

    const monthOptions = React.useMemo(() => {
        const options = [];
        const currentYear = new Date().getFullYear();
        
        const uniqueMonths = [...new Set(activeFuelRecords.map(r => {
            const d = new Date(r.date);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }))].sort().reverse();
        
        uniqueMonths.forEach(ym => {
            const [y, m] = ym.split('-');
            const year = parseInt(y);
            const monthIndex = parseInt(m) - 1;
            const date = new Date(year, monthIndex, 1);
            const monthName = date.toLocaleString('tr-TR', { month: 'long' });
            
            const label = year === currentYear ? monthName : `${monthName} ${year}`;
            options.push({ value: ym, label });
        });
        
        return options;
    }, [activeFuelRecords]);

    const filteredRecords = React.useMemo(() => {
        if (timeFilter === 'all') return processedRecords;
        
        return processedRecords.filter(r => {
            const d = new Date(r.date);
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            return ym === timeFilter;
        });
    }, [processedRecords, timeFilter]);

    const summaryStats = React.useMemo(() => {
        let totalLiters = 0;
        let totalCost = 0;
        let totalDistanceForConsumption = 0;
        let totalLitersForConsumption = 0;
        let totalCostForConsumption = 0;
        
        filteredRecords.forEach(r => {
            totalLiters += (r.liters || 0);
            totalCost += (r.price || 0);
            
            if (r.consumptionStats) {
                totalDistanceForConsumption += r.consumptionStats.distance;
                totalLitersForConsumption += r.consumptionStats.totalLiters;
                totalCostForConsumption += (r.consumptionStats.costPerKm * r.consumptionStats.distance);
            }
        });
        
        const avgLtPer100km = totalDistanceForConsumption > 0 ? (totalLitersForConsumption / totalDistanceForConsumption) * 100 : null;
        const avgCostPerKm = totalDistanceForConsumption > 0 ? (totalCostForConsumption / totalDistanceForConsumption) : null;
        const avgPricePerLiter = totalLiters > 0 ? (totalCost / totalLiters) : null;
        
        return { 
            totalLiters, 
            totalCost, 
            avgLtPer100km, 
            avgCostPerKm, 
            avgPricePerLiter, 
            totalDistanceForConsumption,
            receiptCount: filteredRecords.length
        };
    }, [filteredRecords]);

    const uniqueStations = [...new Set(activeFuelRecords.filter(r => r.station).map(r => toTitleCase(r.station)))];

    return (
        <div className="space-y-5 animate-in fade-in duration-500 relative pb-ios-nav">
            {/* ─── ENTEGRE TEK SATIR HEADER BAR (LİNEAR & VERCEL STANDARDI) ─── */}
            <div 
                className="flex items-center justify-between gap-3 pb-3 border-b border-white/[0.06]"
                style={{
                    paddingTop: 'calc(0.2rem + env(safe-area-inset-top, 0px))'
                }}
            >
                {/* Sol Grup: Hamburger (Mobil) + Başlık + Tarih Kapsülü */}
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
                        Mazot Fişleri
                    </h2>
                    
                    {/* Zarif Zaman Seçici Kapsülü (Başlığın hemen yanında) */}
                    <div className="relative" ref={dropdownRef}>
                        <button 
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="bg-white/[0.04] hover:bg-white/[0.08] px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 flex items-center gap-1.5 sm:gap-2 hover:border-cyan-500/40 hover:text-white transition-all border border-white/10 shadow-sm group cursor-pointer"
                        >
                            <Calendar size={13} className="text-cyan-400 group-hover:text-cyan-300 transition-colors shrink-0" />
                            <span className="truncate max-w-[100px] sm:max-w-none">{timeFilter === 'all' ? 'Tüm Zamanlar' : monthOptions.find(o => o.value === timeFilter)?.label}</span>
                            <ChevronDown size={13} className={`text-slate-500 transition-transform duration-200 shrink-0 ${isDropdownOpen ? 'rotate-180 text-cyan-400' : ''}`} />
                        </button>
                        
                        {isDropdownOpen && (
                            <div className="absolute z-50 top-full left-0 mt-2 min-w-[190px] bg-[#0B0E14]/95 backdrop-blur-2xl border border-white/10 rounded-xl overflow-hidden shadow-2xl shadow-black/80 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="max-h-[300px] overflow-y-auto custom-scrollbar flex flex-col p-1.5 gap-0.5">
                                    <button 
                                        onClick={() => { setTimeFilter('all'); setIsDropdownOpen(false); }}
                                        className={`w-full text-left px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer ${timeFilter === 'all' ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                                    >
                                        Tüm Zamanlar
                                    </button>
                                    {monthOptions.map(opt => (
                                        <button 
                                            key={opt.value}
                                            onClick={() => { setTimeFilter(opt.value); setIsDropdownOpen(false); }}
                                            className={`w-full text-left px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer ${timeFilter === opt.value ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sağ Aksiyon: Yeni Fiş Butonu */}
                <button 
                    onClick={() => openAddModal()}
                    className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:shadow-[0_0_25px_rgba(6,182,212,0.45)] hover:-translate-y-0.5 flex items-center justify-center shrink-0 cursor-pointer"
                >
                    <Plus size={15} className="mr-1 sm:mr-1.5" /> 
                    <span className="whitespace-nowrap">Yeni Fiş</span>
                </button>
            </div>

            {/* ─── YENİ TASARIM 4'LÜ ÖZET KARTLAR (MÜKEMMEL SİMETRİ) ─── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                
                {/* KART 1: Toplam Tutar */}
                <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] hover:border-cyan-500/35 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group transition-all duration-200">
                    <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-10 transition-opacity text-cyan-400 pointer-events-none">
                        <Wallet size={90} />
                    </div>
                    
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="p-1 rounded-md bg-cyan-500/10 text-cyan-400">
                                <Wallet size={12} />
                            </span>
                            Toplam Tutar
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/5 font-mono">
                            {summaryStats.receiptCount} Fiş
                        </span>
                    </div>

                    <div>
                        <div className="font-black text-xl sm:text-2xl text-white tracking-tight flex items-baseline gap-0.5">
                            <span className="text-cyan-400 text-base sm:text-lg font-bold">₺</span>
                            <span>{Math.round(summaryStats.totalCost).toLocaleString('tr-TR')}</span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-400/80 mt-0.5 flex items-center gap-1">
                            <Droplet size={11} className="text-cyan-400/80" />
                            <span>{Math.round(summaryStats.totalLiters).toLocaleString('tr-TR')} Lt</span>
                        </div>
                    </div>
                </div>

                {/* KART 2: Ortalama Litre Fiyatı */}
                <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] hover:border-amber-500/35 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group transition-all duration-200">
                    <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-10 transition-opacity text-amber-400 pointer-events-none">
                        <TrendingUp size={90} />
                    </div>

                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="p-1 rounded-md bg-amber-500/10 text-amber-400">
                                <TrendingUp size={12} />
                            </span>
                            Ortalama Litre Fiyatı
                        </span>
                    </div>

                    <div>
                        <div className="font-black text-xl sm:text-2xl text-white tracking-tight flex items-baseline gap-1">
                            <span className="text-amber-400 text-base sm:text-lg font-bold">₺</span>
                            <span>{summaryStats.avgPricePerLiter ? summaryStats.avgPricePerLiter.toFixed(2) : '0,00'}</span>
                            <span className="text-xs font-semibold text-slate-500">/ Lt</span>
                        </div>
                        <div className="h-[17px] mt-0.5"></div>
                    </div>
                </div>

                {/* KART 3: Ortalama Tüketim */}
                <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] hover:border-sky-500/35 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group transition-all duration-200">
                    <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-10 transition-opacity text-sky-400 pointer-events-none">
                        <Activity size={90} />
                    </div>

                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="p-1 rounded-md bg-sky-500/10 text-sky-400">
                                <Activity size={12} />
                            </span>
                            Ortalama Tüketim
                        </span>
                    </div>

                    <div>
                        <div className="font-black text-xl sm:text-2xl text-white tracking-tight flex items-baseline gap-1">
                            <span className={summaryStats.avgLtPer100km ? "text-white" : "text-slate-600"}>
                                {summaryStats.avgLtPer100km ? summaryStats.avgLtPer100km.toFixed(1) : '—'}
                            </span>
                            {summaryStats.avgLtPer100km && (
                                <span className="text-xs font-semibold text-sky-400">L/100km</span>
                            )}
                        </div>
                        <div className="h-[17px] mt-0.5"></div>
                    </div>
                </div>

                {/* KART 4: Kilometre Maliyeti */}
                <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] hover:border-emerald-500/35 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group transition-all duration-200">
                    <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-10 transition-opacity text-emerald-400 pointer-events-none">
                        <Gauge size={90} />
                    </div>

                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="p-1 rounded-md bg-emerald-500/10 text-emerald-400">
                                <Gauge size={12} />
                            </span>
                            Kilometre Maliyeti
                        </span>
                    </div>

                    <div>
                        <div className="font-black text-xl sm:text-2xl text-white tracking-tight flex items-baseline gap-1">
                            {summaryStats.avgCostPerKm ? (
                                <>
                                    <span className="text-emerald-400 text-base sm:text-lg font-bold">₺</span>
                                    <span>{summaryStats.avgCostPerKm.toFixed(2)}</span>
                                    <span className="text-xs font-semibold text-slate-500">/ km</span>
                                </>
                            ) : (
                                <span className="text-slate-600">—</span>
                            )}
                        </div>
                        <div className="h-[17px] mt-0.5"></div>
                    </div>
                </div>

            </div>

            {/* Tablo */}
            <div className="glass-panel overflow-hidden">
                <div className="overflow-x-auto -mx-0 md:mx-0">
                    <table className="w-full table-fixed text-left border-collapse hidden md:table" style={{ minWidth: '600px' }}>
                        <thead>
                            <tr className="bg-white/5 border-b border-[var(--border-color)] text-[var(--text-secondary)] text-xs uppercase tracking-wide">
                                <th className="p-3 pl-4 w-[16%]">Tarih</th>
                                <th className="p-3 w-[42%]">İstasyon</th>
                                <th className="p-3 text-center w-[18%]">Litre</th>
                                <th className="p-3 text-right w-[16%]">Tutar</th>
                                <th className="p-3 text-center w-[8%]"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredRecords.length > 0 ? filteredRecords.map((record) => (
                                <tr key={record.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="p-3 pl-4 text-[var(--text-primary)] text-sm whitespace-nowrap">
                                        {new Date(record.date).toLocaleDateString('tr-TR')}
                                    </td>
                                    <td className="p-3 overflow-hidden">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <MapPin size={10} className="text-cyan-400 flex-shrink-0" />
                                            <span className="text-[var(--text-primary)] text-sm font-medium truncate">{record.station}</span>
                                        </div>
                                        {(record.notes || record.odometer) && (
                                            <div className="flex flex-col gap-0.5 mt-0.5 min-w-0">
                                                {record.odometer && (
                                                    <div className="flex items-center gap-1 text-emerald-400/80">
                                                        <span className="text-[10px] font-bold tracking-wide">KM:</span>
                                                        <span className="text-xs font-medium">{record.odometer.toLocaleString('tr-TR')}</span>
                                                    </div>
                                                )}
                                                {record.notes && (
                                                    <div className="flex items-center gap-1 min-w-0">
                                                        <StickyNote size={9} className="text-slate-500 flex-shrink-0" />
                                                        <span className="text-xs text-slate-500 truncate max-w-full">{record.notes}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-3 text-center whitespace-nowrap">
                                        <div className="text-[var(--text-primary)] font-medium text-sm">{record.liters} Lt</div>
                                        {record.isPartial && (
                                            <div className="text-[10px] text-cyan-500 bg-cyan-500/10 inline-block px-1.5 py-0.5 rounded font-bold mt-1 border border-cyan-500/20">
                                                Kısmi Dolum
                                            </div>
                                        )}
                                        {record.consumptionStats && (
                                            <div className="text-[10px] text-emerald-400 bg-emerald-400/10 inline-block px-1.5 py-0.5 rounded font-medium mt-1">
                                                {record.consumptionStats.ltPer100km.toFixed(1)} L/100km
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-3 text-right whitespace-nowrap">
                                        <div className="text-orange-400 font-bold text-sm">₺{record.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                                        <div className="text-xs text-slate-500 font-normal">₺{(record.price / record.liters).toFixed(2)}/Lt</div>
                                        {record.consumptionStats && (
                                            <div className="text-[10px] text-orange-400 mt-0.5 font-medium">
                                                ₺{record.consumptionStats.costPerKm.toFixed(2)} / km
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-2 text-center">
                                        <div className="flex items-center justify-center gap-0.5">
                                            {record.files && record.files.length > 0 && (
                                                <button onClick={() => setViewFiles({ title: record.station, files: record.files })}
                                                    title={`${record.files.length} ek`}
                                                    className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 cursor-pointer">
                                                    <Paperclip size={14} />
                                                </button>
                                            )}
                                            <button onClick={() => openEditModal(record)}
                                                className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 cursor-pointer">
                                                <Pencil size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan="5" className="p-8 text-center text-slate-500">
                                    <Droplet size={32} className="mx-auto mb-3 opacity-30" />
                                    <p className="text-[var(--text-secondary)] font-medium">Henüz Kayıtlı Fiş Yok</p>
                                </td></tr>
                            )}
                        </tbody>
                    </table>

                    {/* Mobil Kart Görünümü */}
                    <div className="md:hidden flex flex-col gap-3 p-2">
                        {filteredRecords.length > 0 ? (
                            filteredRecords.map((record) => (
                                <div key={record.id} className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl p-4 shadow-sm relative overflow-hidden">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <div className="font-bold text-[var(--text-primary)] leading-tight flex items-center gap-1.5 text-[13px]">
                                                <MapPin size={14} className="text-cyan-500" />
                                                {record.station}
                                            </div>
                                            {(record.notes || record.odometer) && (
                                                <div className="flex flex-col gap-1 mt-1">
                                                    {record.odometer && (
                                                        <div className="flex items-center gap-1 text-emerald-400/80">
                                                            <span className="text-[10px] font-bold tracking-wide">KM:</span>
                                                            <span className="text-xs font-medium">{record.odometer.toLocaleString('tr-TR')}</span>
                                                        </div>
                                                    )}
                                                    {record.notes && (
                                                        <div className="flex items-center gap-1">
                                                            <StickyNote size={9} className="text-slate-500" />
                                                            <span className="text-[10px] text-slate-500 truncate max-w-[160px]">{record.notes}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-[10px] text-slate-500 font-medium">
                                                {new Date(record.date).toLocaleDateString('tr-TR')}
                                            </div>
                                            {record.files && record.files.length > 0 && (
                                                <button onClick={() => setViewFiles({ title: `Fiş Eki`, files: record.files })}
                                                    className="p-1 bg-cyan-500/10 hover:bg-cyan-500/20 rounded-md text-cyan-400 transition-colors flex items-center">
                                                    <Paperclip size={12} />
                                                </button>
                                            )}
                                            <button onClick={() => openEditModal(record)}
                                                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-md text-[var(--text-secondary)] hover:text-cyan-400 transition-colors">
                                                <Pencil size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 bg-white/5 rounded-xl p-2.5 items-center mt-3">
                                        <div className="flex flex-col">
                                            <div className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">LİTRE</div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-[var(--text-primary)] font-medium text-xs">{record.liters} Lt</span>
                                                {record.isPartial && <span className="text-[8px] bg-cyan-500/10 text-cyan-500 px-1 py-0.5 rounded font-bold border border-cyan-500/20">KISMİ</span>}
                                            </div>
                                        </div>
                                        <div className="flex flex-col border-l border-white/10 pl-2">
                                            <div className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">BİRİM</div>
                                            <div className="text-[var(--text-secondary)] font-medium text-xs">₺{(record.price / record.liters).toFixed(2)}</div>
                                        </div>
                                        <div className="flex flex-col items-end border-l border-white/10 pl-2 relative">
                                            <div className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5 w-full text-right">TUTAR</div>
                                            <div className="text-orange-400 font-bold text-sm w-full text-right">₺{parseFloat(record.price).toLocaleString('tr-TR')}</div>
                                        </div>
                                    </div>
                                    
                                    {/* Mobil Tüketim Performans Satırı */}
                                    {record.consumptionStats && (
                                        <div className="mt-2.5 grid grid-cols-3 gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5 items-center">
                                            <div className="flex flex-col">
                                                <div className="text-[9px] text-emerald-500/70 uppercase font-bold mb-0.5">Menzil</div>
                                                <div className="text-emerald-400 font-medium text-xs">{record.consumptionStats.distance.toLocaleString('tr-TR')} km</div>
                                            </div>
                                            <div className="flex flex-col border-l border-emerald-500/20 pl-2">
                                                <div className="text-[9px] text-emerald-500/70 uppercase font-bold mb-0.5">Tüketim</div>
                                                <div className="text-emerald-400 font-medium text-xs">{record.consumptionStats.ltPer100km.toFixed(1)} L/100</div>
                                            </div>
                                            <div className="flex flex-col items-end border-l border-emerald-500/20 pl-2">
                                                <div className="text-[9px] text-emerald-500/70 uppercase font-bold mb-0.5 w-full text-right">Maliyet</div>
                                                <div className="text-orange-400 font-bold text-xs w-full text-right">₺{record.consumptionStats.costPerKm.toFixed(2)}/km</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center text-slate-500">
                                <Droplet size={32} className="mx-auto mb-3 opacity-30" />
                                <p className="text-[var(--text-secondary)] font-medium">Henüz Kayıtlı Fiş Yok</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── DÜZENLE MODAL ─── */}
            {editingFuel && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-panel w-full max-w-lg p-6 relative animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
                        <button onClick={() => setEditingFuel(null)} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-5 flex items-center gap-2">
                            <Pencil size={16} className="text-cyan-400" /> Fişi Düzenle
                        </h3>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                {/* Tarih */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tarih</label>
                                    <input type="date" className="w-full glass-input px-3 py-2.5 text-sm"
                                        value={editForm.date}
                                        onChange={e => setEditForm({ ...editForm, date: e.target.value })} />
                                </div>
                                <div className="flex items-end">
                                    <button
                                        type="button"
                                        onClick={() => setEditShowExtra(!editShowExtra)}
                                        className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${editShowExtra ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-lg shadow-cyan-500/10' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                                    >
                                        <StickyNote size={14} className={editShowExtra ? "animate-pulse" : ""} />
                                        Ek Bilgiler {editShowExtra ? <ChevronDown size={14} className="rotate-180" /> : <ChevronDown size={14} />}
                                    </button>
                                </div>
                            </div>
                            
                            {/* İstasyon */}
                            {/* İstasyon */}
                            <div className="relative z-[100]">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">İstasyon / Konum</label>
                                <input 
                                    type="text" 
                                    className="w-full glass-input px-3 py-2 text-sm"
                                    value={editForm.station}
                                    onFocus={() => setShowEditSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowEditSuggestions(false), 200)}
                                    onChange={e => setEditForm({ ...editForm, station: toTitleCase(e.target.value) })} 
                                />
                                {showEditSuggestions && uniqueStations.filter(s => s.toLowerCase('tr-TR').includes((editForm.station || '').toLowerCase('tr-TR'))).length > 0 && (
                                    <ul className="absolute z-50 w-full mt-1 bg-black/90 backdrop-blur-2xl border border-white/[0.07] shadow-[0_16px_48px_rgba(0,0,0,0.95)] rounded-xl max-h-48 overflow-y-auto">
                                        {uniqueStations.filter(s => s.toLowerCase('tr-TR').includes((editForm.station || '').toLowerCase('tr-TR'))).map(station => (
                                            <li 
                                                key={station}
                                                className="px-4 py-2 hover:bg-white/10 cursor-pointer text-sm text-[var(--text-secondary)] hover:text-white transition-colors"
                                                onMouseDown={() => {
                                                    setEditForm({...editForm, station});
                                                    setShowEditSuggestions(false);
                                                }}
                                            >
                                                {station}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Litre, Tutar ve KM Alanı - Liste Tasarımı */}
                            <div className="flex flex-col gap-2 my-3">
                                {/* Litre Row */}
                                <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm relative overflow-hidden">
                                    <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-transparent via-cyan-500/40 to-transparent"></div>
                                    <label className="text-[11px] font-bold text-cyan-500/80 uppercase tracking-widest flex items-center gap-2 whitespace-nowrap"><Droplet size={14}/> Litre</label>
                                    <div className="flex-1 ml-4 flex justify-end">
                                        <input 
                                            type="tel" 
                                            required
                                            className="bg-transparent text-xl font-black text-cyan-400 text-right focus:outline-none w-[90px] min-w-0 placeholder:text-cyan-900/30"
                                            value={editForm.liters}
                                            onChange={e => setEditForm({ ...editForm, liters: formatDecimal(e.target.value) })}
                                            placeholder="0,00"
                                        />
                                    </div>
                                </div>

                                {/* Tutar Row */}
                                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between shadow-sm relative overflow-hidden">
                                    <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-transparent via-emerald-500/40 to-transparent"></div>
                                    <label className="text-[11px] font-bold text-emerald-500/80 uppercase tracking-widest flex items-center gap-2 whitespace-nowrap">Toplam Tutar</label>
                                    <div className="flex-1 ml-2 flex justify-end items-center">
                                        <input 
                                            type="tel" 
                                            required
                                            className="bg-transparent text-xl font-black text-emerald-400 text-right focus:outline-none w-[90px] min-w-0 placeholder:text-emerald-900/30"
                                            value={editForm.price}
                                            onChange={e => setEditForm({ ...editForm, price: formatDecimal(e.target.value) })}
                                            placeholder="0,00"
                                        />
                                        <span className={`font-bold text-lg mt-0.5 shrink-0 ml-1 transition-colors duration-300 ${editForm.price ? 'text-emerald-400' : 'text-emerald-900/30'}`}>₺</span>
                                    </div>
                                    {parseDecimal(editForm.liters) > 0 && parseDecimal(editForm.price) > 0 && (
                                        <div className="w-full text-right text-[10px] text-emerald-500/60 mt-1.5 font-bold animate-in fade-in zoom-in duration-300">
                                            BİRİM: ₺{(parseDecimal(editForm.price) / parseDecimal(editForm.liters)).toFixed(2)} / Lt
                                        </div>
                                    )}
                                </div>

                                {/* Araç KM Row */}
                                <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm relative overflow-hidden">
                                    <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-transparent via-cyan-500/40 to-transparent"></div>
                                    <label className="text-[11px] font-bold text-cyan-500/80 uppercase tracking-widest flex items-center gap-2 whitespace-nowrap"><MapPin size={14}/> Araç KM</label>
                                    <div className="flex-1 ml-4 flex justify-end">
                                        <input 
                                            type="tel" 
                                            className="bg-transparent text-xl font-black text-cyan-400 text-right focus:outline-none w-[140px] min-w-0 placeholder:text-cyan-900/30 font-mono tracking-tight"
                                            value={editForm.odometer}
                                            onClick={handleOdometerClick}
                                            onMouseUp={handleOdometerClick}
                                            onTouchEnd={handleOdometerClick}
                                            onChange={e => setEditForm({ ...editForm, odometer: formatKM(e.target.value) })}
                                            placeholder="Km Girin"
                                        />
                                    </div>
                                </div>
                            </div>
                            {editShowExtra && (
                                <div className="space-y-4 pt-2 border-t border-white/5 animate-in slide-in-from-top-4 duration-300">
                                    <div className="mb-4">
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Dolum Durumu</label>
                                        <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-xl border border-white/5">
                                            <button
                                                type="button"
                                                onClick={() => setEditForm({ ...editForm, isPartial: false })}
                                                className={`py-2 rounded-lg text-xs font-bold transition-all ${!editForm.isPartial ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                            >
                                                Depo Fullendi
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditForm({ ...editForm, isPartial: true })}
                                                className={`py-2 rounded-lg text-xs font-bold transition-all ${editForm.isPartial ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                            >
                                                Kısmi Dolum
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">📝 Not (İsteğe Bağlı)</label>
                                        <textarea
                                            rows={2}
                                            className="w-full glass-input px-3 py-2 text-sm resize-none text-[var(--text-primary)]"
                                            placeholder="Not ekleyin..."
                                            value={editForm.notes}
                                            onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">📎 Fotoğraf / Belge</label>
                                        <FileUpload files={editForm.files} onChange={files => setEditForm({ ...editForm, files })} />
                                    </div>
                                </div>
                            )}

                            {/* Aksiyon Butonları */}
                            <div className="flex gap-3 mt-4">
                                <button onClick={handleEdit}
                                    className="flex-1 bg-gradient-to-r from-cyan-500 to-cyan-500 hover:from-cyan-400 hover:to-cyan-400 text-white py-3.5 rounded-2xl font-black transition-all shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:-translate-y-0.5 uppercase tracking-wide">
                                    Kaydet
                                </button>
                                <button onClick={() => { handleDelete(editingFuel.id); setEditingFuel(null); }}
                                    className="w-14 flex items-center justify-center bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 hover:border-red-500 rounded-2xl transition-all shadow-lg shadow-red-500/5 hover:shadow-red-500/30 hover:-translate-y-0.5">
                                    <Trash2 size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ─── YENİ FİŞ MODAL ─── */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-panel w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto border-cyan-500/30">
                        <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                            <X size={20} />
                        </button>
                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center">
                            <Droplet className="mr-2 text-cyan-500" /> Yeni Mazot Fişi
                        </h3>
                        <form onSubmit={handleAdd} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tarih</label>
                                    <input type="date" required className="w-full glass-input px-4 py-2.5 text-sm font-medium" value={formData.date}
                                        onChange={e => setFormData({ ...formData, date: e.target.value })} />
                                </div>
                                <div className="flex items-end">
                                    <button
                                        type="button"
                                        onClick={() => setShowExtra(!showExtra)}
                                        className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${showExtra ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-lg shadow-cyan-500/10' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                                    >
                                        <StickyNote size={14} className={showExtra ? "animate-pulse" : ""} />
                                        Ek Bilgiler {showExtra ? <ChevronDown size={14} className="rotate-180" /> : <ChevronDown size={14} />}
                                    </button>
                                </div>
                            </div>
                            {/* İstasyon */}
                            <div className="relative z-[100]">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">İstasyon / Konum</label>
                                <input 
                                    type="text" 
                                    required 
                                    placeholder="Örn: Shell Eryaman" 
                                    className="w-full glass-input px-4 py-2.5 text-sm" 
                                    value={formData.station}
                                    onFocus={() => setShowAddSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowAddSuggestions(false), 200)}
                                    onChange={e => setFormData({ ...formData, station: toTitleCase(e.target.value) })} 
                                />
                                {showAddSuggestions && uniqueStations.filter(s => s.toLowerCase('tr-TR').includes((formData.station || '').toLowerCase('tr-TR'))).length > 0 && (
                                    <ul className="absolute z-50 w-full mt-1 bg-black/90 backdrop-blur-2xl border border-white/[0.07] shadow-[0_16px_48px_rgba(0,0,0,0.95)] rounded-xl max-h-48 overflow-y-auto">
                                        {uniqueStations.filter(s => s.toLowerCase('tr-TR').includes((formData.station || '').toLowerCase('tr-TR'))).map(station => (
                                            <li 
                                                key={station}
                                                className="px-4 py-2 hover:bg-white/10 cursor-pointer text-sm text-[var(--text-secondary)] hover:text-white transition-colors"
                                                onMouseDown={() => {
                                                    setFormData({...formData, station});
                                                    setShowAddSuggestions(false);
                                                }}
                                            >
                                                {station}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Litre, Tutar ve KM Alanı - Liste Tasarımı */}
                            <div className="flex flex-col gap-2 my-3">
                                {/* Litre Row */}
                                <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm relative overflow-hidden">
                                    <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-transparent via-cyan-500/40 to-transparent"></div>
                                    <label className="text-[11px] font-bold text-cyan-500/80 uppercase tracking-widest flex items-center gap-2 whitespace-nowrap"><Droplet size={14}/> Litre</label>
                                    <div className="flex-1 ml-4 flex justify-end">
                                        <input 
                                            type="tel" 
                                            required
                                            className="bg-transparent text-xl font-black text-cyan-400 text-right focus:outline-none w-[90px] min-w-0 placeholder:text-cyan-900/30"
                                            value={formData.liters}
                                            onChange={e => setFormData({ ...formData, liters: formatDecimal(e.target.value) })}
                                            placeholder="0,00"
                                        />
                                    </div>
                                </div>

                                {/* Tutar Row */}
                                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between shadow-sm relative overflow-hidden">
                                    <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-transparent via-emerald-500/40 to-transparent"></div>
                                    <label className="text-[11px] font-bold text-emerald-500/80 uppercase tracking-widest flex items-center gap-2 whitespace-nowrap">Toplam Tutar</label>
                                    <div className="flex-1 ml-2 flex justify-end items-center">
                                        <input 
                                            type="tel" 
                                            required
                                            className="bg-transparent text-xl font-black text-emerald-400 text-right focus:outline-none w-[90px] min-w-0 placeholder:text-emerald-900/30"
                                            value={formData.price}
                                            onChange={e => setFormData({ ...formData, price: formatDecimal(e.target.value) })}
                                            placeholder="0,00"
                                        />
                                        <span className={`font-bold text-lg mt-0.5 shrink-0 ml-1 transition-colors duration-300 ${formData.price ? 'text-emerald-400' : 'text-emerald-900/30'}`}>₺</span>
                                    </div>
                                    {parseDecimal(formData.liters) > 0 && parseDecimal(formData.price) > 0 && (
                                        <div className="w-full text-right text-[10px] text-emerald-500/60 mt-1.5 font-bold animate-in fade-in zoom-in duration-300">
                                            BİRİM: ₺{(parseDecimal(formData.price) / parseDecimal(formData.liters)).toFixed(2)} / Lt
                                        </div>
                                    )}
                                </div>

                                {/* Araç KM Row */}
                                <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm relative overflow-hidden">
                                    <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-transparent via-cyan-500/40 to-transparent"></div>
                                    <label className="text-[11px] font-bold text-cyan-500/80 uppercase tracking-widest flex items-center gap-2 whitespace-nowrap"><MapPin size={14}/> Araç KM</label>
                                    <div className="flex-1 ml-4 flex justify-end">
                                        <input 
                                            type="tel" 
                                            className="bg-transparent text-xl font-black text-cyan-400 text-right focus:outline-none w-[140px] min-w-0 placeholder:text-cyan-900/30 font-mono tracking-tight"
                                            value={formData.odometer}
                                            onClick={handleOdometerClick}
                                            onMouseUp={handleOdometerClick}
                                            onTouchEnd={handleOdometerClick}
                                            onChange={e => setFormData({ ...formData, odometer: formatKM(e.target.value) })}
                                            placeholder="Km Girin"
                                        />
                                    </div>
                                </div>
                            </div>

                            {showExtra && (
                                <div className="space-y-4 pt-4 border-t border-white/5 animate-in slide-in-from-top-4 duration-500">
                                    <div className="mb-4">
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Dolum Durumu</label>
                                        <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-xl border border-white/5">
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, isPartial: false })}
                                                className={`py-2 rounded-lg text-xs font-bold transition-all ${!formData.isPartial ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                            >
                                                Depo Fullendi
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, isPartial: true })}
                                                className={`py-2 rounded-lg text-xs font-bold transition-all ${formData.isPartial ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                            >
                                                Kısmi Dolum
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">📝 Not (İsteğe Bağlı)</label>
                                        <textarea
                                            rows={2}
                                            className="w-full glass-input px-4 py-2 resize-none text-sm text-[var(--test-primary)]"
                                            placeholder="Fiş hakkında not ekleyin..."
                                            value={formData.notes}
                                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">📎 Fiş Fotoğrafı / Belge</label>
                                        <FileUpload files={formData.files} onChange={files => setFormData({ ...formData, files })} />
                                    </div>
                                </div>
                            )}

                            <button type="submit"
                                className="w-full bg-gradient-to-r from-cyan-500 to-cyan-500 hover:from-cyan-400 hover:to-cyan-400 text-white px-4 py-3.5 rounded-2xl font-black transition-all shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:-translate-y-0.5 mt-4 uppercase tracking-wider">
                                Fişi Kaydet
                            </button>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* ─── DOSYA GÖRÜNTÜLEYICI ─── */}
            {viewFiles && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-panel w-full max-w-2xl p-6 relative animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <FileText className="text-cyan-400" />
                                {viewFiles.title} İçin Ekler
                            </h3>
                            <button onClick={() => setViewFiles(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                            {viewFiles.files.map((file, idx) => (
                                <div key={idx} className="bg-white/5 border border-[var(--border-color)] rounded-xl overflow-hidden">
                                    {file.type && file.type.startsWith('image/') ? (
                                        <div className="bg-black/30 w-full flex justify-center p-4">
                                            <img src={file.data} alt="Belge/Makbuz" className="max-w-full max-h-[400px] object-contain rounded shadow-2xl" />
                                        </div>
                                    ) : (
                                        <div className="p-8 flex flex-col items-center justify-center bg-white/5">
                                            <FileText size={48} className="text-[var(--text-secondary)] mb-3" />
                                            <p className="text-[var(--text-primary)] font-medium">{file.name || 'Belge dosyası'}</p>
                                        </div>
                                    )}
                                    <div className="p-4 bg-white/5 border-t border-[var(--border-color)] flex justify-between items-center">
                                        <span className="text-sm text-[var(--text-secondary)] truncate max-w-[70%] font-medium">{file.name || 'Ek_Belge'}</span>
                                        <a href={file.data} download={file.name || 'Belge'}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-cyan-400 hover:text-[var(--text-primary)] bg-cyan-500/10 hover:bg-cyan-500/30 border border-cyan-500/20 rounded-lg transition-colors">
                                            <Download size={14} /> İndir
                                        </a>
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

export default Fuel;

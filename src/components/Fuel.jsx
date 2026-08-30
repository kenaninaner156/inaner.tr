import React, { useState, useContext, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Droplet, Plus, MapPin, X, Trash2, Paperclip, FileText, Download, Pencil, StickyNote, ChevronDown, Calendar, Activity, Wallet, TrendingUp, Gauge, Fuel as FuelIcon, Menu } from 'lucide-react';
import { DataContext } from '../context/DataContext';
import FileUpload from './FileUpload';
import CustomDatePicker from './CustomDatePicker';
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
        const chronological = [...activeFuelRecords].reverse();
        
        let lastOdometer = null;
        let accumulatedLiters = 0;
        let accumulatedPrice = 0;
        
        const enriched = chronological.map((record) => {
            const enrichedRecord = { ...record };
            const recOdometer = record.odometer ? parseFloat(String(record.odometer).replace(/\./g, '')) : null;
            const recLiters = parseFloat(record.liters) || 0;
            const recPrice = parseFloat(record.price) || 0;
            
            if (recOdometer && recOdometer > 0 && !record.isPartial) {
                if (lastOdometer && recOdometer > lastOdometer) {
                    const distance = recOdometer - lastOdometer;
                    const totalLitersForDistance = accumulatedLiters + recLiters;
                    const totalCostForDistance = accumulatedPrice + recPrice;
                    
                    enrichedRecord.consumptionStats = {
                        distance,
                        totalLiters: totalLitersForDistance,
                        ltPer100km: distance > 0 ? (totalLitersForDistance / distance) * 100 : 0,
                        costPerKm: distance > 0 ? totalCostForDistance / distance : 0
                    };
                }
                // Yeni referans KM'yi güncelle ve birikimleri sıfırla
                lastOdometer = recOdometer;
                accumulatedLiters = 0;
                accumulatedPrice = 0;
            } else {
                // KM girilmediyse veya Kısmi Dolum (isPartial) işaretliyse biriktirmeye devam et
                if (lastOdometer) {
                    accumulatedLiters += recLiters;
                    accumulatedPrice += recPrice;
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
            if (isNaN(d.getTime())) return null;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }).filter(Boolean))].sort().reverse();
        
        uniqueMonths.forEach(ym => {
            const [y, m] = ym.split('-');
            const year = parseInt(y, 10);
            const monthIndex = parseInt(m, 10) - 1;
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
            if (isNaN(d.getTime())) return false;
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
            const l = parseFloat(r.liters) || 0;
            const p = parseFloat(r.price) || 0;
            totalLiters += l;
            totalCost += p;
            
            if (r.consumptionStats) {
                const dist = parseFloat(r.consumptionStats.distance) || 0;
                const cLit = parseFloat(r.consumptionStats.totalLiters) || 0;
                const cCost = parseFloat(r.consumptionStats.costPerKm) || 0;
                totalDistanceForConsumption += dist;
                totalLitersForConsumption += cLit;
                totalCostForConsumption += (cCost * dist);
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
        {/* ─── ENTEGRE TEK SATIR HEADER BAR ─── */}
        <div 
            className="flex items-center justify-between gap-2 sm:gap-3 pb-2 border-b border-white/[0.06]"
            style={{
                paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))'
            }}
        >
            {/* Sol Grup: Hamburger (Mobil) + Başlık + Zaman Seçici */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                {isMobile && onOpenMenu && (
                    <button 
                        onClick={onOpenMenu} 
                        className="p-1.5 -ml-1 text-slate-400 hover:text-slate-100 transition-colors flex items-center justify-center cursor-pointer rounded-lg hover:bg-white/5 shrink-0"
                        title="Menüyü Aç"
                    >
                        <Menu size={22} />
                    </button>
                )}
                
                <h2 className="text-base sm:text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0">
                    Mazot Fişleri
                </h2>
                
                {/* Zarif Zaman Seçici Kapsülü (Responsive genişlik) */}
                <div className="relative min-w-0 shrink" ref={dropdownRef}>
                    <button 
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="h-[36px] w-[125px] sm:w-[155px] px-2 sm:px-3 bg-[#0b0e14]/90 border border-white/10 hover:border-cyan-500/35 rounded-xl flex items-center justify-between gap-1.5 sm:gap-2 text-[11px] sm:text-sm font-semibold text-slate-200 hover:text-white transition-all shadow-lg cursor-pointer"
                    >
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                            <Calendar size={13} className="text-cyan-400 shrink-0" />
                            <span className="truncate">
                                {timeFilter === 'all' 
                                    ? 'Tüm Zamanlar' 
                                    : (monthOptions.find(o => o.value === timeFilter)?.label || timeFilter)}
                            </span>
                        </div>
                        <ChevronDown size={12} className={`text-slate-400 shrink-0 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-cyan-400' : ''}`} />
                    </button>
                    
                    {isDropdownOpen && (
                        <div className="absolute z-50 top-full left-0 mt-1.5 w-44 bg-[#0c1017]/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150">
                            <button 
                                onClick={() => { setTimeFilter('all'); setIsDropdownOpen(false); }}
                                className={`w-full text-left px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer ${timeFilter === 'all' ? 'bg-cyan-500/15 text-cyan-300 font-bold' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                            >
                                <span>Tüm Zamanlar</span>
                            </button>
                            <div className="my-1 border-t border-white/5" />
                            <div className="max-h-56 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {monthOptions.map(opt => (
                                    <button 
                                        key={opt.value}
                                        onClick={() => { setTimeFilter(opt.value); setIsDropdownOpen(false); }}
                                        className={`w-full text-left px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer ${timeFilter === opt.value ? 'bg-cyan-500/15 text-cyan-300 font-bold' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                                    >
                                        <span className="truncate">{opt.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sağ Aksiyon: Yeni Fiş Butonu (Asla Kesilmez) */}
            <button 
                onClick={() => openAddModal()}
                className="bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 border border-cyan-400/40 text-white px-2.5 sm:px-4 h-[36px] rounded-xl text-xs sm:text-sm font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.35)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] flex items-center justify-center shrink-0 cursor-pointer"
            >
                <Plus size={15} className="sm:mr-1.5" /> 
                <span className="hidden sm:inline whitespace-nowrap">Yeni Fiş</span>
                <span className="sm:hidden whitespace-nowrap ml-1">Fiş</span>
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

            {/* ─── MAZOT FİŞLERİ LİSTESİ / TABLOSU ─── */}
            <div className="bg-[#0c1017]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse hidden md:table min-w-[680px]">
                        <thead>
                            <tr className="bg-white/[0.03] border-b border-white/[0.06] text-slate-400 text-[11px] uppercase font-bold tracking-wider">
                                <th className="p-3 pl-4 whitespace-nowrap w-32">Tarih</th>
                                <th className="p-3 whitespace-nowrap min-w-[220px]">İstasyon</th>
                                <th className="p-3 text-center whitespace-nowrap w-32">Litre</th>
                                <th className="p-3 text-right whitespace-nowrap w-36">Tutar</th>
                                <th className="p-3 text-center whitespace-nowrap w-20">İşlemler</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {filteredRecords.length > 0 ? filteredRecords.map((record) => {
                                const recPrice = parseFloat(record.price) || 0;
                                const recLiters = parseFloat(record.liters) || 0;
                                const unitPrice = recLiters > 0 ? (recPrice / recLiters).toFixed(2) : '0.00';
                                const recDate = record.date ? new Date(record.date) : new Date();
                                const formattedDate = !isNaN(recDate.getTime()) ? recDate.toLocaleDateString('tr-TR') : '—';
                                const recKm = record.odometer ? parseFloat(String(record.odometer).replace(/\./g, '')) : null;

                                return (
                                <tr key={record.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="p-3 pl-4 whitespace-nowrap">
                                        <div className="text-white text-sm font-semibold">{formattedDate}</div>
                                    </td>
                                    <td className="p-3 min-w-[220px]">
                                        <div className="text-sm font-bold text-white flex items-center gap-1.5 flex-wrap">
                                            <MapPin size={13} className="text-cyan-400 shrink-0" />
                                            <span>{record.station || 'İstasyon Belirtilmedi'}</span>
                                        </div>
                                        {(record.notes || recKm) && (
                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                {recKm && (
                                                    <span className="text-[10px] text-slate-500 font-medium font-mono">
                                                        KM: {recKm.toLocaleString('tr-TR')}
                                                    </span>
                                                )}
                                                {record.notes && (
                                                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                                        <StickyNote size={10} className="text-slate-500 shrink-0" />
                                                        <span className="truncate max-w-[220px]">{record.notes}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-3 text-center whitespace-nowrap">
                                        <div className="text-white font-bold text-sm">{recLiters} Lt</div>
                                        <div className="flex items-center justify-center gap-1 mt-1">
                                            {record.isPartial && (
                                                <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold whitespace-nowrap">
                                                    Kısmi Dolum
                                                </span>
                                            )}
                                            {record.consumptionStats && (
                                                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold whitespace-nowrap">
                                                    {Number(record.consumptionStats.ltPer100km || 0).toFixed(1)} L/100km
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-3 text-right whitespace-nowrap">
                                        <div className="text-amber-400 font-bold text-sm">₺{recPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                        <div className="text-[11px] text-slate-500 font-medium font-mono">₺{unitPrice}/Lt</div>
                                        {record.consumptionStats && (
                                            <div className="text-[10px] text-amber-400/80 font-medium font-mono mt-0.5">
                                                ₺{Number(record.consumptionStats.costPerKm || 0).toFixed(2)} / km
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-3 text-center whitespace-nowrap">
                                        <div className="flex items-center justify-center gap-1">
                                            {record.files && record.files.length > 0 && (
                                                <button 
                                                    onClick={() => setViewFiles({ title: record.station, files: record.files })}
                                                    title={`${record.files.length} Ek Dosya`}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors cursor-pointer"
                                                >
                                                    <Paperclip size={14} />
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => openEditModal(record)}
                                                title="Fişi Düzenle"
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors cursor-pointer"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan="5" className="p-12 text-center text-slate-500">
                                        <Droplet size={36} className="mx-auto mb-3 opacity-20 text-cyan-400" />
                                        <p className="text-base font-semibold text-slate-300">Kayıtlı Fiş Bulunamadı</p>
                                        <p className="text-xs text-slate-500 mt-1">Seçili dönemde mazot fişi kaydı yok.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {/* Mobil Kart Görünümü */}
                    <div className="md:hidden flex flex-col gap-2.5 p-3">
                        {filteredRecords.length > 0 ? (
                            filteredRecords.map((record) => {
                                const recPrice = parseFloat(record.price) || 0;
                                const recLiters = parseFloat(record.liters) || 0;
                                const unitPrice = recLiters > 0 ? (recPrice / recLiters).toFixed(2) : '0.00';
                                const recDate = record.date ? new Date(record.date) : new Date();
                                const formattedDate = !isNaN(recDate.getTime()) ? recDate.toLocaleDateString('tr-TR') : '—';
                                const recKm = record.odometer ? parseFloat(String(record.odometer).replace(/\./g, '')) : null;

                                return (
                                <div key={record.id} className="bg-[#0b0e14]/90 border border-white/[0.08] hover:border-cyan-500/30 rounded-xl p-3.5 shadow-md relative transition-all">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col min-w-0 pr-2">
                                            <div className="font-bold text-white leading-tight flex items-center gap-1.5 text-sm truncate">
                                                <MapPin size={14} className="text-cyan-400 shrink-0" />
                                                <span className="truncate">{record.station || 'İstasyon'}</span>
                                            </div>
                                            {(record.notes || recKm) && (
                                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                                    {recKm && (
                                                        <span className="text-[10px] text-slate-500 font-medium font-mono">
                                                            KM: {recKm.toLocaleString('tr-TR')}
                                                        </span>
                                                    )}
                                                    {record.notes && (
                                                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                                            <StickyNote size={10} className="text-slate-500 shrink-0" />
                                                            <span className="truncate max-w-[160px]">{record.notes}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <div className="text-xs font-bold text-slate-400">
                                                {formattedDate}
                                            </div>
                                            {record.files && record.files.length > 0 && (
                                                <button 
                                                    onClick={() => setViewFiles({ title: `Fiş Eki`, files: record.files })}
                                                    className="p-1 bg-cyan-500/10 hover:bg-cyan-500/20 rounded-lg text-cyan-400 transition-colors flex items-center cursor-pointer"
                                                >
                                                    <Paperclip size={12} />
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => openEditModal(record)}
                                                className="p-1 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                                            >
                                                <Pencil size={13} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 bg-white/[0.02] border border-white/5 rounded-xl p-2.5 items-center mt-3">
                                        <div className="flex flex-col">
                                            <div className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">LİTRE</div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-white font-bold text-xs">{recLiters} Lt</span>
                                                {record.isPartial && <span className="text-[8px] bg-cyan-500/10 text-cyan-400 px-1 py-0.5 rounded font-bold border border-cyan-500/20">KISMİ</span>}
                                            </div>
                                        </div>
                                        <div className="flex flex-col border-l border-white/10 pl-2">
                                            <div className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">BİRİM</div>
                                            <div className="text-slate-400 font-medium text-xs font-mono">₺{unitPrice}</div>
                                        </div>
                                        <div className="flex flex-col items-end border-l border-white/10 pl-2 relative">
                                            <div className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5 w-full text-right">TUTAR</div>
                                            <div className="text-amber-400 font-bold text-sm w-full text-right">₺{recPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                        </div>
                                    </div>
                                    
                                    {/* Mobil Tüketim Performans Satırı */}
                                    {record.consumptionStats && (
                                        <div className="mt-2 grid grid-cols-3 gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-2.5 items-center">
                                            <div className="flex flex-col">
                                                <div className="text-[9px] text-emerald-400/70 uppercase font-bold mb-0.5">Menzil</div>
                                                <div className="text-emerald-400 font-medium text-xs font-mono">{Number(record.consumptionStats.distance || 0).toLocaleString('tr-TR')} km</div>
                                            </div>
                                            <div className="flex flex-col border-l border-emerald-500/20 pl-2">
                                                <div className="text-[9px] text-emerald-400/70 uppercase font-bold mb-0.5">Tüketim</div>
                                                <div className="text-emerald-400 font-medium text-xs font-mono">{Number(record.consumptionStats.ltPer100km || 0).toFixed(1)} L/100</div>
                                            </div>
                                            <div className="flex flex-col items-end border-l border-emerald-500/20 pl-2">
                                                <div className="text-[9px] text-emerald-400/70 uppercase font-bold mb-0.5 w-full text-right">Maliyet</div>
                                                <div className="text-amber-400 font-bold text-xs w-full text-right font-mono">₺{Number(record.consumptionStats.costPerKm || 0).toFixed(2)}/km</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                );
                            })
                        ) : (
                            <div className="p-8 text-center text-slate-500">
                                <Droplet size={32} className="mx-auto mb-3 opacity-20 text-cyan-400" />
                                <p className="text-sm font-semibold text-slate-300">Kayıtlı Fiş Bulunamadı</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── DÜZENLE MODAL ─── */}
            {editingFuel && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md">
                    <div className="glass-panel w-full max-w-md p-4 sm:p-6 relative animate-in zoom-in-95 duration-200 max-h-[92dvh] overflow-hidden flex flex-col border-cyan-500/30">
                        <button onClick={() => setEditingFuel(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer z-20"><X size={20} /></button>
                        <h3 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-5 flex items-center gap-2 flex-shrink-0">
                            <Pencil size={18} className="text-cyan-400" /> Fişi Düzenle
                        </h3>
                        <div className="space-y-4 flex-1 overflow-y-auto pr-1 sm:pr-2 custom-scrollbar pb-3">
                            <div className="grid grid-cols-2 gap-3 items-end">
                                {/* Tarih */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tarih</label>
                                    <CustomDatePicker 
                                        value={editForm.date}
                                        onChange={val => setEditForm({ ...editForm, date: val })}
                                        className="glass-input text-left px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setEditShowExtra(!editShowExtra)}
                                        className={`w-full py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer h-[38px] ${editShowExtra ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-lg shadow-cyan-500/10' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                                    >
                                        <StickyNote size={13} className={editShowExtra ? "animate-pulse" : ""} />
                                        <span>Ek Bilgiler</span>
                                        <ChevronDown size={13} className={editShowExtra ? "rotate-180 transition-transform" : "transition-transform"} />
                                    </button>
                                </div>
                            </div>
                            
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
                                                className="px-4 py-2 hover:bg-white/10 cursor-pointer text-sm text-slate-300 hover:text-white transition-colors"
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
                                                className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${!editForm.isPartial ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                            >
                                                Depo Fullendi
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditForm({ ...editForm, isPartial: true })}
                                                className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${editForm.isPartial ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                            >
                                                Kısmi Dolum
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">📝 Not (İsteğe Bağlı)</label>
                                        <textarea
                                            rows={2}
                                            className="w-full glass-input px-3 py-2 text-sm resize-none text-white"
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
                                    className="flex-1 bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 border border-cyan-400/40 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:-translate-y-0.5 uppercase tracking-wider cursor-pointer">
                                    Kaydet
                                </button>
                                <button onClick={() => { handleDelete(editingFuel.id); setEditingFuel(null); }}
                                    className="w-14 flex items-center justify-center bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 hover:border-red-500 rounded-xl transition-all shadow-lg shadow-red-500/5 hover:shadow-red-500/30 hover:-translate-y-0.5 cursor-pointer">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ─── YENİ FİŞ MODAL ─── */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md">
                    <div className="glass-panel w-full max-w-md p-4 sm:p-6 relative animate-in zoom-in-95 duration-200 max-h-[92dvh] overflow-hidden flex flex-col border-cyan-500/30">
                        <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer z-20">
                            <X size={20} />
                        </button>
                        <h3 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-6 flex items-center flex-shrink-0">
                            <Droplet className="mr-2 text-cyan-400" /> Yeni Mazot Fişi
                        </h3>
                        <form onSubmit={handleAdd} className="space-y-4 flex-1 overflow-y-auto pr-1 sm:pr-2 custom-scrollbar pb-3">
                            <div className="grid grid-cols-2 gap-3 items-end">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tarih</label>
                                    <CustomDatePicker 
                                        value={formData.date}
                                        onChange={val => setFormData({ ...formData, date: val })}
                                        className="glass-input text-left px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setShowExtra(!showExtra)}
                                        className={`w-full py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer h-[38px] ${showExtra ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-lg shadow-cyan-500/10' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                                    >
                                        <StickyNote size={13} className={showExtra ? "animate-pulse" : ""} />
                                        <span>Ek Bilgiler</span>
                                        <ChevronDown size={13} className={showExtra ? "rotate-180 transition-transform" : "transition-transform"} />
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
                                                className="px-4 py-2 hover:bg-white/10 cursor-pointer text-sm text-slate-300 hover:text-white transition-colors"
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
                                                className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${!formData.isPartial ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                            >
                                                Depo Fullendi
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, isPartial: true })}
                                                className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${formData.isPartial ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                            >
                                                Kısmi Dolum
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">📝 Not (İsteğe Bağlı)</label>
                                        <textarea
                                            rows={2}
                                            className="w-full glass-input px-4 py-2 resize-none text-sm text-white"
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
                                className="w-full bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 border border-cyan-400/40 text-white px-4 py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:-translate-y-0.5 mt-4 uppercase tracking-wider cursor-pointer">
                                Fişi Kaydet
                            </button>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* ─── DOSYA GÖRÜNTÜLEYICI ─── */}
            {viewFiles && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setViewFiles(null)}>
                    <div className="glass-panel w-full max-w-2xl p-6 relative animate-in zoom-in-95 duration-200 border-cyan-500/30" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <FileText className="text-cyan-400" />
                                {viewFiles.title} İçin Ekler
                            </h3>
                            <button onClick={() => setViewFiles(null)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                            {viewFiles.files.map((file, idx) => (
                                <div key={idx} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                                    {file.type && file.type.startsWith('image/') ? (
                                        <div className="bg-black/30 w-full flex justify-center p-4">
                                            <img src={file.data} alt="Belge/Makbuz" className="max-w-full max-h-[400px] object-contain rounded shadow-2xl" />
                                        </div>
                                    ) : (
                                        <div className="p-8 flex flex-col items-center justify-center bg-white/5">
                                            <FileText size={48} className="text-slate-400 mb-3" />
                                            <p className="text-white font-medium">{file.name || 'Belge dosyası'}</p>
                                        </div>
                                    )}
                                    <div className="p-4 bg-white/5 border-t border-white/10 flex justify-between items-center">
                                        <span className="text-sm text-slate-300 truncate max-w-[70%] font-medium">{file.name || 'Ek_Belge'}</span>
                                        <a href={file.data} download={file.name || 'Belge'}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-cyan-400 hover:text-white bg-cyan-500/10 hover:bg-cyan-500/30 border border-cyan-500/20 rounded-lg transition-colors">
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

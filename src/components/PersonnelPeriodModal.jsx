import React, { useState, useMemo } from 'react';
import { X, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Users } from 'lucide-react';

const PersonnelPeriodModal = ({ isOpen, onClose, trips, allTrips = [], onSelectPeriod, allDrivers = [] }) => {
    // Current viewed month in the calendar
    const [currentDate, setCurrentDate] = useState(new Date());

    // Selection state
    const [selectedDriver, setSelectedDriver] = useState('');
    const [selectionStep, setSelectionStep] = useState(0);
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);

    // Filtered trips for the selected range and driver to show a preview
    const tripsInPeriod = useMemo(() => {
        if (!startDate || !endDate || !selectedDriver) return [];
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];
        return trips.filter(t => 
            !t.deleted && 
            t.driverName === selectedDriver && 
            t.premiumStatus !== 'paid' && 
            t.date >= startStr && 
            t.date <= endStr
        );
    }, [startDate, endDate, selectedDriver, trips]);

    // Helper map for fast lookup of premium statuses by date for the selected driver
    const tripStatusByDate = useMemo(() => {
        if (!selectedDriver) return {};
        return allTrips.reduce((acc, t) => {
            if (t.deleted || t.driverName !== selectedDriver) return acc;
            const dateStr = t.date;
            if (!acc[dateStr]) acc[dateStr] = { count: 0, pending: 0, completed: 0 };
            acc[dateStr].count++;
            if (t.premiumStatus === 'paid') {
                acc[dateStr].completed++;
            } else {
                acc[dateStr].pending++;
            }
            return acc;
        }, {});
    }, [allTrips, selectedDriver]);

    if (!isOpen) return null;

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    // Adjust Sunday to 6, Monday to 0 for TR locale
    const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

    const handleDateClick = (day) => {
        if (!selectedDriver) {
            alert("Lütfen önce bir personel seçiniz.");
            return;
        }

        const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day, 12, 0, 0); // Noon to avoid timezone shifts
        const dateStr = clickedDate.toISOString().split('T')[0];

        // Primi zaten ödenmiş günleri başlangıç veya bitiş olarak seçmesini engelle
        const tripsInfo = tripStatusByDate[dateStr];
        if (tripsInfo && tripsInfo.completed > 0 && tripsInfo.pending === 0) {
            return; // Zaten ödenmiş, tıklanamaz
        }

        if (selectionStep === 0 || selectionStep === 2) {
            setStartDate(clickedDate);
            setEndDate(null);
            setSelectionStep(1);
        } else if (selectionStep === 1) {
            if (clickedDate < startDate) {
                setEndDate(startDate);
                setStartDate(clickedDate);
            } else {
                setEndDate(clickedDate);
            }
            setSelectionStep(2);
        }
    };

    const handleConfirm = () => {
        if (startDate && endDate && selectedDriver) {
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];
            onSelectPeriod({ 
                startDate: startStr, 
                endDate: endStr, 
                driverName: selectedDriver, 
                trips: tripsInPeriod 
            });
            onClose();
        } else {
            alert("Lütfen bir personel, başlangıç ve bitiş tarihi seçin.");
        }
    };

    // Render calendar grid
    const renderCalendarDays = () => {
        const grid = [];
        const weekdays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

        // Weekday Headers
        weekdays.forEach(day => {
            grid.push(<div key={`header-${day}`} className="py-2 text-center text-xs font-semibold text-slate-500 uppercase">{day}</div>);
        });

        // Empty cells before the 1st
        for (let i = 0; i < startOffset; i++) {
            grid.push(<div key={`empty-${i}`} className="p-2"></div>);
        }

        // Days
        for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), day, 12, 0, 0);
            const dateStr = dateObj.toISOString().split('T')[0];
            const tripsInfo = tripStatusByDate[dateStr];

            // Interaction States
            const isStartDate = startDate && dateObj.toDateString() === startDate.toDateString();
            const isEndDate = endDate && dateObj.toDateString() === endDate.toDateString();
            const isInRange = startDate && endDate && dateObj > startDate && dateObj < endDate;

            // Sadece primi ödenmiş (ve bekleyeni olmayan) bir gün ise tıklanmasın
            const isFullyCompleted = tripsInfo && tripsInfo.completed > 0 && tripsInfo.pending === 0;

            // Visual Styles based on Trip Data
            let lineStyle = "";
            let dotTitle = "";
            if (tripsInfo) {
                if (tripsInfo.pending > 0) {
                    lineStyle = "bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.8)]"; // Turuncu yatay çizgi (Hak Ediş Bekleyen)
                    dotTitle = `${tripsInfo.pending} sefer prim ödemesi bekliyor`;
                } else if (tripsInfo.completed > 0) {
                    lineStyle = "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"; // Yeşil yatay çizgi (Ödenen)
                    dotTitle = "Bu tarihin primleri daha önce ödendi";
                }
            }

            // Cell Styles
            let cellStyle = "text-[var(--text-primary)] hover:bg-white/10 hover:text-[var(--text-primary)]";
            if (isFullyCompleted) {
                cellStyle = "text-slate-500 cursor-default";
            } else if (isStartDate || isEndDate) {
                cellStyle = "bg-orange-500 text-white font-bold shadow-lg scale-105 z-10 rounded-lg";
            } else if (isInRange) {
                cellStyle = "bg-orange-500/20 text-orange-100 rounded-none";
            }

            // Make start and end bounds connect visually if within a range
            let roundedClasses = "rounded-lg";
            if (isStartDate && endDate) roundedClasses = "rounded-l-lg rounded-r-none";
            if (isEndDate && startDate) roundedClasses = "rounded-r-lg rounded-l-none";
            if (isStartDate && isEndDate) roundedClasses = "rounded-lg"; // Same day

            grid.push(
                <div
                    key={day}
                    onClick={() => !isFullyCompleted && handleDateClick(day)}
                    className={`relative flex flex-col items-center justify-center p-2 transition-all duration-200 ${!isFullyCompleted && selectedDriver ? 'cursor-pointer' : ''} ${cellStyle} ${roundedClasses}`}
                    title={dotTitle}
                >
                    <span className="text-sm z-10 relative flex flex-col items-center">
                        {day}
                        {lineStyle && (
                            <div className={`absolute -bottom-1.5 w-4 h-[2.5px] rounded-full ${lineStyle}`}></div>
                        )}
                    </span>
                </div>
            );
        }

        return grid;
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-50">
            <div className="glass-panel w-full max-w-2xl flex flex-col md:flex-row max-h-[98vh] md:max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Sol Taraf: Takvim & Şoför Seçimi */}
                <div className="w-full md:w-[60%] p-3 sm:p-4 md:p-6 border-b md:border-b-0 md:border-r border-[var(--border-color)] flex flex-col overflow-y-auto md:overflow-visible min-h-[320px] md:min-h-0">
                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Hak Ediş Sahibi Personel</label>
                        <div className="relative">
                            <select
                                value={selectedDriver}
                                onChange={(e) => {
                                    setSelectedDriver(e.target.value);
                                    setStartDate(null);
                                    setEndDate(null);
                                    setSelectionStep(0);
                                }}
                                className="w-full glass-input py-2 pl-9 pr-8 text-sm"
                            >
                                <option value="">Şoför Seçiniz...</option>
                                {allDrivers.map(d => (
                                    <option key={d.id} value={d.name}>{d.name}</option>
                                ))}
                            </select>
                            <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={16} />
                        </div>
                    </div>

                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center">
                            <CalendarIcon className="mr-2 text-orange-400" size={16} />
                            Periyot Seçimi
                        </h3>
                        <div className="flex gap-2">
                            <button onClick={prevMonth} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/10 rounded transition-colors"><ChevronLeft size={14} /></button>
                            <span className="text-xs font-medium text-[var(--text-primary)] w-24 text-center">
                                {currentDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                            </span>
                            <button onClick={nextMonth} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/10 rounded transition-colors"><ChevronRight size={14} /></button>
                        </div>
                    </div>

                    <div className="relative flex-1">
                        {!selectedDriver ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[1px] rounded-xl z-20 text-center p-4 border border-[var(--border-color)]">
                                <Users size={32} className="text-orange-500/50 mb-2 animate-pulse" />
                                <p className="text-xs font-semibold text-slate-400">Takvimi kullanabilmek için lütfen önce bir personel seçiniz.</p>
                            </div>
                        ) : null}
                        <div className="grid grid-cols-7 gap-y-1 sm:gap-y-2 gap-x-1">
                            {renderCalendarDays()}
                        </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex flex-wrap gap-x-5 gap-y-2 text-[9px] sm:text-[10px] text-[var(--text-secondary)] justify-center items-center">
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-[2.5px] rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)] block"></span> Ödenen Primler
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-[2.5px] rounded-full bg-orange-400 shadow-[0_0_5px_rgba(251,146,60,0.8)] block"></span> Bekleyen Primler
                        </div>
                    </div>
                </div>

                {/* Sağ Taraf: Detaylar & Seçim */}
                <div className="w-full md:w-[40%] bg-[var(--bg-panel)] p-3 sm:p-4 md:p-6 flex flex-col border-t md:border-t-0 border-[var(--border-color)] overflow-y-auto">
                    <div className="flex justify-between items-start mb-3 sm:mb-6">
                        <h4 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">Seçim Detayları</h4>
                        <button onClick={onClose} className="p-1 text-slate-500 hover:text-[var(--text-primary)] transition-colors">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flex flex-row md:flex-col gap-2 md:space-y-4 mb-3 sm:mb-6">
                        <div className="flex-1 bg-black/30 p-2 sm:p-3 rounded-lg border border-[var(--border-color)]">
                            <p className="text-[8px] sm:text-[10px] text-slate-500 mb-0.5 sm:mb-1 uppercase tracking-wider">BAŞLANGIÇ</p>
                            <p className="text-[10px] sm:text-sm font-semibold text-orange-300 leading-tight">
                                {startDate ? startDate.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : 'Seçiniz...'}
                            </p>
                        </div>
                        <div className="flex-1 bg-black/30 p-2 sm:p-3 rounded-lg border border-[var(--border-color)]">
                            <p className="text-[8px] sm:text-[10px] text-slate-500 mb-0.5 sm:mb-1 uppercase tracking-wider">BİTİŞ</p>
                            <p className="text-[10px] sm:text-sm font-semibold text-orange-300 leading-tight">
                                {endDate ? endDate.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : 'Seçiniz...'}
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 min-h-[100px] md:min-h-0 overflow-y-auto custom-scrollbar border border-[var(--border-color)] rounded-lg bg-black/20 p-2 sm:p-3">
                        <p className="text-[10px] sm:text-xs text-[var(--text-secondary)] mb-2 border-b border-[var(--border-color)] pb-1 sm:pb-2">
                            Aralıkta Seçili Seferler: <strong className="text-orange-400">{tripsInPeriod.length}</strong>
                        </p>
                        <ul className="space-y-1.5 sm:space-y-2">
                            {tripsInPeriod.map(t => (
                                <li key={t.id} className="text-[9px] sm:text-[10px] flex justify-between bg-white/5 p-1 sm:p-1.5 rounded">
                                    <span className="text-[var(--text-primary)]">{new Date(t.date).getDate()} {new Date(t.date).toLocaleDateString('tr-TR', { month: 'short' })}</span>
                                    <span className="text-[var(--text-secondary)] truncate max-w-[60px] sm:max-w-[80px]">{t.to}</span>
                                    <span className="text-orange-300 font-mono font-bold">₺{t.premiumAmount?.toLocaleString('tr-TR')}</span>
                                </li>
                            ))}
                            {tripsInPeriod.length === 0 && (
                                <li className="text-[10px] text-slate-500 italic text-center py-4">Prim bekleyen sefer yok.</li>
                            )}
                        </ul>
                    </div>

                    <div className="mt-3 sm:mt-6 pt-3 sm:pt-4 border-t border-[var(--border-color)] shrink-0">
                        <button
                            onClick={handleConfirm}
                            disabled={!startDate || !endDate || !selectedDriver || tripsInPeriod.length === 0}
                            className={`w-full py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-lg ${startDate && endDate && selectedDriver && tripsInPeriod.length > 0
                                ? 'bg-orange-600 hover:bg-orange-500 text-[var(--text-primary)] shadow-orange-500/25 border border-orange-500'
                                : 'bg-[var(--bg-panel-hover)] text-slate-500 cursor-not-allowed border border-[var(--border-color)]'
                                }`}
                        >
                            Dökümü Oluştur
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PersonnelPeriodModal;

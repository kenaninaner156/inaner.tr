import React, { useState, useMemo } from 'react';
import { X, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Droplet } from 'lucide-react';

const InvoicePeriodModal = ({ isOpen, onClose, trips, allTrips = [], onSelectPeriod, fuelRecords = [] }) => {
    // Current viewed month in the calendar
    const [currentDate, setCurrentDate] = useState(new Date());

    // Selection state
    // 0: none selected, 1: start selected, 2: both selected
    const [selectionStep, setSelectionStep] = useState(0);
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);

    // Filtered trips for the selected range to show a preview
    const tripsInPeriod = useMemo(() => {
        if (!startDate || !endDate) return [];
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];
        return trips.filter(t => !t.deleted && t.status === 'Fatura Bekliyor' && t.date >= startStr && t.date <= endStr);
    }, [startDate, endDate, trips]);

    if (!isOpen) return null;

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    // Adjust Sunday to 6, Monday to 0 for TR locale
    const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    // Helper map for fast lookup of trip statuses by date
    const tripStatusByDate = allTrips.reduce((acc, t) => {
        if (t.deleted) return acc;
        if (!acc[t.date]) acc[t.date] = { count: 0, pending: 0, completed: 0 };
        acc[t.date].count++;
        if (t.status === 'Fatura Bekliyor') acc[t.date].pending++;
        if (t.status === 'Fatura Kesildi') acc[t.date].completed++;
        return acc;
    }, {});

    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

    const handleDateClick = (day) => {
        const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day, 12, 0, 0); // Noon to avoid timezone shifts
        const dateStr = clickedDate.toISOString().split('T')[0];

        // Faturası zaten kesilmiş bir günü başlangıç veya bitiş olarak seçmesini engelle
        const tripsInfo = tripStatusByDate[dateStr];
        if (tripsInfo && tripsInfo.completed > 0 && tripsInfo.pending === 0) {
            return; // Zaten kesilmiş, tıklanamaz
        }

        if (selectionStep === 0 || selectionStep === 2) {
            // Start parsing a new range
            setStartDate(clickedDate);
            setEndDate(null);
            setSelectionStep(1);
        } else if (selectionStep === 1) {
            // Complete the range
            if (clickedDate < startDate) {
                // Swap if they clicked an earlier date
                setEndDate(startDate);
                setStartDate(clickedDate);
            } else {
                setEndDate(clickedDate);
            }
            setSelectionStep(2);
        }
    };

    const handleConfirm = () => {
        if (startDate && endDate) {
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];
            onSelectPeriod({ startDate: startStr, endDate: endStr, trips: tripsInPeriod });
            onClose();
        } else {
            alert("Lütfen bir başlangıç ve bitiş tarihi seçin.");
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

            // Yakıt alındı mı?
            const hasFuel = fuelRecords.some(r => !r.deleted && r.date === dateStr);

            // Interaction States
            const isStartDate = startDate && dateObj.toDateString() === startDate.toDateString();
            const isEndDate = endDate && dateObj.toDateString() === endDate.toDateString();
            const isInRange = startDate && endDate && dateObj > startDate && dateObj < endDate;

            // Sadece faturası kesilmiş (ve bekleyeni olmayan) bir gün ise tıklanmasın
            const isFullyCompleted = tripsInfo && tripsInfo.completed > 0 && tripsInfo.pending === 0;

            // Visual Styles based on Trip Data
            let dotStyle = "";
            let dotTitle = "";
            if (tripsInfo) {
                if (tripsInfo.pending > 0) {
                    dotStyle = "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"; // Fatura Bekliyor (Yeşil)
                    dotTitle = `${tripsInfo.pending} sefer faturası bekliyor`;
                } else if (tripsInfo.completed > 0) {
                    dotStyle = "bg-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.8)]"; // Önceden kesilmiş (Turuncu/Sönük)
                    dotTitle = "Bu tarihin faturaları daha önce kesildi";
                }
            }

            // Cell Styles
            let cellStyle = "text-[var(--text-primary)] hover:bg-white/10 hover:text-[var(--text-primary)]";
            if (isFullyCompleted) {
                cellStyle = "text-slate-500 cursor-default"; // Turuncu (tamamlanan) günler hover efektine sahip olmasın
            } else if (isStartDate || isEndDate) {
                cellStyle = "bg-brand-500 text-[var(--text-primary)] font-bold shadow-lg scale-105 z-10 rounded-lg";
            } else if (isInRange) {
                cellStyle = "bg-brand-500/20 text-brand-100 rounded-none";
            }

            // Make start and end bounds connect visually if within a range
            let roundedClasses = "rounded-lg";
            if (isStartDate && endDate) roundedClasses = "rounded-l-lg rounded-r-none";
            if (isEndDate && startDate) roundedClasses = "rounded-r-lg rounded-l-none";
            if (isStartDate && isEndDate) roundedClasses = "rounded-lg"; // Same day

            grid.push(
                <div
                    key={day}
                    onClick={() => handleDateClick(day)}
                    className={`relative flex flex-col items-center justify-center p-2 transition-all duration-200 ${!isFullyCompleted ? 'cursor-pointer' : ''} ${cellStyle} ${roundedClasses}`}
                    title={dotTitle}
                >
                    <span className="text-sm z-10 relative flex flex-col items-center">
                        {day}
                        {hasFuel && (
                            <div className="absolute -bottom-2 w-4 h-[2px] bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,1)] rounded-full"></div>
                        )}
                    </span>
                    {dotStyle && (
                        <div className={`absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ${dotStyle} z-10`}></div>
                    )}
                </div>
            );
        }

        return grid;
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-50">
            <div className="glass-panel w-full max-w-2xl flex flex-col md:flex-row max-h-[98vh] md:max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Sol Taraf: Takvim */}
                <div className="w-full md:w-[60%] p-3 sm:p-4 md:p-6 border-b md:border-b-0 md:border-r border-[var(--border-color)] flex flex-col overflow-y-auto md:overflow-visible min-h-[320px] md:min-h-0">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center">
                            <CalendarIcon className="mr-2 text-brand-400" size={18} />
                            Periyot Seçimi
                        </h3>
                        <div className="flex gap-2">
                            <button onClick={prevMonth} className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/10 rounded transition-colors"><ChevronLeft size={16} /></button>
                            <span className="text-sm font-medium text-[var(--text-primary)] w-24 text-center">
                                {currentDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                            </span>
                            <button onClick={nextMonth} className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/10 rounded transition-colors"><ChevronRight size={16} /></button>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 gap-y-1 sm:gap-y-2 gap-x-1 flex-1">
                        {renderCalendarDays()}
                    </div>

                    <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-[var(--border-color)] flex flex-wrap gap-x-4 gap-y-2 text-[9px] sm:text-[10px] text-[var(--text-secondary)] justify-center">
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)] block"></span> Kesilecek
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.8)] block"></span> Tamamlanan
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-0.5 sm:w-3 sm:h-0.5 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,1)] block"></span> Yakıt Alındı
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
                            <p className="text-[10px] sm:text-sm font-semibold text-brand-300 leading-tight">
                                {startDate ? startDate.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : 'Seçiniz...'}
                            </p>
                        </div>
                        <div className="flex-1 bg-black/30 p-2 sm:p-3 rounded-lg border border-[var(--border-color)]">
                            <p className="text-[8px] sm:text-[10px] text-slate-500 mb-0.5 sm:mb-1 uppercase tracking-wider">BİTİŞ</p>
                            <p className="text-[10px] sm:text-sm font-semibold text-brand-300 leading-tight">
                                {endDate ? endDate.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : 'Seçiniz...'}
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 min-h-[100px] md:min-h-0 overflow-y-auto custom-scrollbar border border-[var(--border-color)] rounded-lg bg-black/20 p-2 sm:p-3">
                        <p className="text-[10px] sm:text-xs text-[var(--text-secondary)] mb-2 border-b border-[var(--border-color)] pb-1 sm:pb-2">
                            Aralıkta Seçili Seferler: <strong className="text-emerald-400">{tripsInPeriod.length}</strong>
                        </p>
                        <ul className="space-y-1.5 sm:space-y-2">
                            {tripsInPeriod.map(t => (
                                <li key={t.id} className="text-[9px] sm:text-[10px] flex justify-between bg-white/5 p-1 sm:p-1.5 rounded">
                                    <span className="text-[var(--text-primary)]">{new Date(t.date).getDate()} {new Date(t.date).toLocaleDateString('tr-TR', { month: 'short' })}</span>
                                    <span className="text-[var(--text-secondary)] truncate max-w-[60px] sm:max-w-[80px]">{t.to}</span>
                                    <span className="text-brand-300 font-mono font-bold">{t.tonnage}t</span>
                                </li>
                            ))}
                            {tripsInPeriod.length === 0 && (
                                <li className="text-[10px] text-slate-500 italic text-center py-4">Fatura bekleyen sefer yok.</li>
                            )}
                        </ul>
                    </div>

                    <div className="mt-3 sm:mt-6 pt-3 sm:pt-4 border-t border-[var(--border-color)] shrink-0">
                        <button
                            onClick={handleConfirm}
                            disabled={!startDate || !endDate || tripsInPeriod.length === 0}
                            className={`w-full py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-lg ${startDate && endDate && tripsInPeriod.length > 0
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-[var(--text-primary)] shadow-emerald-500/25 border border-emerald-500'
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

export default InvoicePeriodModal;

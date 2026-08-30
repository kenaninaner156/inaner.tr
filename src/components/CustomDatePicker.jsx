import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { createPortal } from 'react-dom';

const CustomDatePicker = ({ value, onChange, placeholder = 'Tarih Seçin', className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(() => value ? new Date(value) : new Date());
    
    const [day, setDay] = useState('');
    const [month, setMonth] = useState('');
    const [year, setYear] = useState('');

    const dayRef = useRef(null);
    const monthRef = useRef(null);
    const yearRef = useRef(null);

    const toggleOpen = () => setIsOpen(!isOpen);

    useEffect(() => {
        if (value) {
            setCurrentMonth(new Date(value));
            const parts = value.split('-');
            if (parts.length === 3) {
                setYear(parts[0]);
                setMonth(parts[1]);
                setDay(parts[2]);
            }
        } else {
            setDay('');
            setMonth('');
            setYear('');
        }
    }, [value]);

    const emitChange = (d, m, y) => {
        if (d.length === 2 && m.length === 2 && y.length === 4) {
            const dn = parseInt(d, 10);
            const mn = parseInt(m, 10);
            const yn = parseInt(y, 10);
            if (dn > 0 && mn > 0 && yn > 1900) {
                const date = new Date(yn, mn - 1, dn);
                if (!isNaN(date.getTime())) {
                    setCurrentMonth(date);
                    onChange(`${yn}-${String(mn).padStart(2, '0')}-${String(dn).padStart(2, '0')}`);
                }
            }
        }
    };

    const handleDayChange = (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 2) val = val.substring(0, 2);
        if (parseInt(val, 10) > 31) val = '31';
        if (val === '00') val = '01';
        setDay(val);
        if (val.length === 2) {
            monthRef.current?.focus();
        }
        emitChange(val, month, year);
    };

    const handleMonthChange = (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 2) val = val.substring(0, 2);
        if (parseInt(val, 10) > 12) val = '12';
        if (val === '00') val = '01';
        setMonth(val);
        if (val.length === 2) {
            yearRef.current?.focus();
        }
        emitChange(day, val, year);
    };

    const handleYearChange = (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 4) val = val.substring(0, 4);
        setYear(val);
        emitChange(day, month, val);
    };

    const handleMonthKeyDown = (e) => {
        if (e.key === 'Backspace' && !month) {
            dayRef.current?.focus();
        }
    };

    const handleYearKeyDown = (e) => {
        if (e.key === 'Backspace' && !year) {
            monthRef.current?.focus();
        }
    };

    const handleDayBlur = () => {
        if (day.length === 1) {
            const padded = '0' + day;
            setDay(padded);
            emitChange(padded, month, year);
        }
    };

    const handleMonthBlur = () => {
        if (month.length === 1) {
            const padded = '0' + month;
            setMonth(padded);
            emitChange(day, padded, year);
        }
    };

    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    const startDayIndex = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // Pazartesi = 0

    const days = [];
    for (let i = 0; i < startDayIndex; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

    const handlePrevMonth = (e) => {
        e.stopPropagation();
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const handleNextMonth = (e) => {
        e.stopPropagation();
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const handleMonthSelect = (e) => {
        const newMonth = parseInt(e.target.value);
        setCurrentMonth(new Date(currentMonth.getFullYear(), newMonth, 1));
    };

    const handleYearInputForCalendar = (e) => {
        const newYear = parseInt(e.target.value) || new Date().getFullYear();
        setCurrentMonth(new Date(newYear, currentMonth.getMonth(), 1));
    };

    const handleSelectDate = (d) => {
        if (!d) return;
        const y = currentMonth.getFullYear();
        const m = String(currentMonth.getMonth() + 1).padStart(2, '0');
        const ds = String(d).padStart(2, '0');
        const formatted = `${y}-${m}-${ds}`;
        onChange(formatted);
        setIsOpen(false);
    };

    return (
        <div className="relative w-full">
            <div className={`relative flex items-center ${className} p-0 overflow-hidden cursor-text`}>
                <div className="flex-1 flex items-center justify-center gap-0.5 px-1 py-1.5 select-none">
                    <input
                        ref={dayRef}
                        type="text"
                        value={day}
                        onChange={handleDayChange}
                        onBlur={handleDayBlur}
                        placeholder="GG"
                        className="w-5 text-center bg-transparent outline-none text-white placeholder:text-slate-500 text-xs font-mono font-bold"
                    />
                    <span className="text-slate-600 text-xs">/</span>
                    <input
                        ref={monthRef}
                        type="text"
                        value={month}
                        onChange={handleMonthChange}
                        onKeyDown={handleMonthKeyDown}
                        onBlur={handleMonthBlur}
                        placeholder="AA"
                        className="w-5 text-center bg-transparent outline-none text-white placeholder:text-slate-500 text-xs font-mono font-bold"
                    />
                    <span className="text-slate-600 text-xs">/</span>
                    <input
                        ref={yearRef}
                        type="text"
                        value={year}
                        onChange={handleYearChange}
                        onKeyDown={handleYearKeyDown}
                        placeholder="YYYY"
                        className="w-9 text-center bg-transparent outline-none text-white placeholder:text-slate-500 text-xs font-mono font-bold"
                    />
                </div>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleOpen(); }}
                    className="shrink-0 px-2 py-2 hover:bg-orange-500/15 text-slate-400 hover:text-orange-400 transition-colors border-l border-white/[0.06] flex items-center justify-center cursor-pointer"
                >
                    <Calendar size={14} />
                </button>
            </div>

            {isOpen && createPortal(
                <div 
                    className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-150" 
                    onClick={() => setIsOpen(false)}
                >
                    <div 
                        className="bg-[#07090e] border border-white/[0.1] rounded-3xl shadow-2xl shadow-black/95 p-5 w-full max-w-sm animate-in zoom-in-95 duration-150"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <button type="button" onClick={handlePrevMonth} className="p-2 bg-white/[0.04] hover:bg-orange-500/20 text-slate-400 hover:text-orange-400 rounded-xl transition-colors cursor-pointer border border-white/[0.06]">
                                <ChevronLeft size={16} />
                            </button>
                            <div className="font-bold text-white flex items-center gap-1.5">
                                <select 
                                    value={currentMonth.getMonth()} 
                                    onChange={handleMonthSelect}
                                    className="bg-[#0d1117] border border-white/[0.08] text-white rounded-lg px-2 py-1 text-xs outline-none cursor-pointer hover:border-orange-500/50 transition-colors"
                                >
                                    {monthNames.map((m, i) => <option key={m} value={i} className="bg-[#07090e] text-white">{m}</option>)}
                                </select>
                                <input 
                                    type="number" 
                                    value={currentMonth.getFullYear()} 
                                    onChange={handleYearInputForCalendar}
                                    className="w-16 bg-[#0d1117] border border-white/[0.08] text-white rounded-lg px-2 py-1 text-xs outline-none hover:border-orange-500/50 transition-colors text-center font-mono font-bold"
                                />
                            </div>
                            <button type="button" onClick={handleNextMonth} className="p-2 bg-white/[0.04] hover:bg-orange-500/20 text-slate-400 hover:text-orange-400 rounded-xl transition-colors cursor-pointer border border-white/[0.06]">
                                <ChevronRight size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 mb-2">
                            {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(d => (
                                <div key={d} className="text-center text-[11px] font-bold text-slate-500 uppercase">{d}</div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                            {days.map((d, idx) => {
                                let isSelected = false;
                                if (d && value) {
                                    const valDate = new Date(value);
                                    isSelected = currentMonth.getFullYear() === valDate.getFullYear() && 
                                                 currentMonth.getMonth() === valDate.getMonth() && 
                                                 d === valDate.getDate();
                                }
                                
                                const today = new Date();
                                const isToday = d && 
                                                currentMonth.getFullYear() === today.getFullYear() && 
                                                currentMonth.getMonth() === today.getMonth() && 
                                                d === today.getDate();

                                return (
                                    <div key={idx} className="aspect-square">
                                        {d && (
                                            <button
                                                type="button"
                                                onClick={() => handleSelectDate(d)}
                                                className={`w-full h-full flex items-center justify-center rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                                    isSelected ? 'bg-gradient-to-tr from-orange-500 to-amber-500 text-white font-bold shadow-lg shadow-orange-500/30' : 
                                                    isToday ? 'bg-orange-500/15 text-orange-400 font-bold border border-orange-500/30' : 
                                                    'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                                                }`}
                                            >
                                                {d}
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default CustomDatePicker;

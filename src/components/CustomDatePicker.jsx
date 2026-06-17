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
                <div className="flex-1 flex items-center gap-1 px-3 py-2">
                    <input
                        ref={dayRef}
                        type="text"
                        value={day}
                        onChange={handleDayChange}
                        onBlur={handleDayBlur}
                        placeholder="GG"
                        className="w-7 text-center bg-transparent outline-none text-[var(--text-primary)] placeholder:text-slate-500 font-medium"
                    />
                    <span className="text-slate-500">/</span>
                    <input
                        ref={monthRef}
                        type="text"
                        value={month}
                        onChange={handleMonthChange}
                        onKeyDown={handleMonthKeyDown}
                        onBlur={handleMonthBlur}
                        placeholder="AA"
                        className="w-7 text-center bg-transparent outline-none text-[var(--text-primary)] placeholder:text-slate-500 font-medium"
                    />
                    <span className="text-slate-500">/</span>
                    <input
                        ref={yearRef}
                        type="text"
                        value={year}
                        onChange={handleYearChange}
                        onKeyDown={handleYearKeyDown}
                        placeholder="YYYY"
                        className="w-12 text-center bg-transparent outline-none text-[var(--text-primary)] placeholder:text-slate-500 font-medium"
                    />
                </div>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleOpen(); }}
                    className="px-3 py-2 hover:bg-white/10 transition-colors border-l border-white/5"
                >
                    <Calendar size={16} className="text-slate-400" />
                </button>
            </div>

            {isOpen && createPortal(
                <div 
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" 
                    onClick={() => setIsOpen(false)}
                >
                    <div 
                        className="bg-[#0b1120] border border-sky-500/30 rounded-2xl shadow-2xl p-4 w-full max-w-sm animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <button type="button" onClick={handlePrevMonth} className="p-2 bg-white/5 hover:bg-sky-500/20 text-slate-400 hover:text-sky-400 rounded-lg transition-colors">
                                <ChevronLeft size={18} />
                            </button>
                            <div className="font-bold text-[var(--text-primary)] flex items-center gap-1">
                                <select 
                                    value={currentMonth.getMonth()} 
                                    onChange={handleMonthSelect}
                                    className="bg-transparent appearance-none outline-none cursor-pointer hover:text-sky-400 transition-colors"
                                >
                                    {monthNames.map((m, i) => <option key={m} value={i} className="bg-[#0b1120] text-[var(--text-primary)]">{m}</option>)}
                                </select>
                                <input 
                                    type="number" 
                                    value={currentMonth.getFullYear()} 
                                    onChange={handleYearInputForCalendar}
                                    className="w-14 bg-transparent outline-none hover:text-sky-400 transition-colors text-center"
                                />
                            </div>
                            <button type="button" onClick={handleNextMonth} className="p-2 bg-white/5 hover:bg-sky-500/20 text-slate-400 hover:text-sky-400 rounded-lg transition-colors">
                                <ChevronRight size={18} />
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 mb-2">
                            {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(d => (
                                <div key={d} className="text-center text-[10px] font-bold text-slate-500 uppercase">{d}</div>
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
                                                className={`w-full h-full flex items-center justify-center rounded-lg text-sm transition-colors ${
                                                    isSelected ? 'bg-sky-500 text-[var(--text-primary)] font-bold shadow-lg shadow-sky-500/30' : 
                                                    isToday ? 'bg-white/10 text-sky-400 font-bold border border-sky-500/30' : 
                                                    'text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)]'
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

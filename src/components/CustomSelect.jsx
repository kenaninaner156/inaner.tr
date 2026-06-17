import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const CustomSelect = ({ value, onChange, options, placeholder, dropup }) => {
    const [isOpen, setIsOpen] = useState(false);
    const selectRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (selectRef.current && !selectRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.value === value) || { label: placeholder, value: '' };

    return (
        <div className="relative" ref={selectRef}>
            <button
                type="button"
                className={`w-full glass-input px-3 py-2 text-sm text-left flex justify-between items-center ${!value && 'text-slate-400'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="truncate block flex-1 mr-2">{selectedOption.label}</span>
                <ChevronDown size={14} className={`transition-transform flex-shrink-0 ${isOpen ? 'rotate-180 text-sky-400' : 'text-slate-400'}`} />
            </button>
            {isOpen && (
                <div className={`absolute z-50 w-full ${dropup ? 'bottom-full mb-1' : 'top-full mt-1'} bg-[#0b1120]/95 backdrop-blur-xl border border-sky-500/30 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in ${dropup ? 'slide-in-from-bottom-2' : 'zoom-in-95'} duration-200`}>
                    <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                        {options.map((opt, i) => (
                            <button
                                key={i}
                                type="button"
                                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center justify-between ${value === opt.value ? 'bg-sky-500/20 text-sky-400 font-medium' : 'text-[var(--text-primary)] hover:bg-[var(--bg-panel-hover)]'}`}
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                }}
                            >
                                {opt.label}
                                {value === opt.value && <Check size={14} />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomSelect;

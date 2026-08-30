import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { createPortal } from 'react-dom';

const CustomSelect = ({ 
    value, 
    onChange, 
    options = [], 
    placeholder = 'Seçiniz...', 
    className = '', 
    buttonClassName = '',
    menuClassName = '',
    searchable = false,
    minMenuWidth = null,
    align = 'auto', // 'auto', 'left', 'right'
    disabled = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [coords, setCoords] = useState({ top: 0, left: undefined, right: undefined, width: 0, dropUp: false });
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const searchInputRef = useRef(null);

    // Normalize options: support string/number array or object array [{ value, label, sublabel }]
    const normalizedOptions = options.map(opt => {
        if (typeof opt === 'object' && opt !== null) {
            return {
                value: opt.value,
                label: opt.label || String(opt.value),
                sublabel: opt.sublabel || null,
                icon: opt.icon || null
            };
        }
        return {
            value: opt,
            label: String(opt),
            sublabel: null,
            icon: null
        };
    });

    const selectedOption = normalizedOptions.find(o => String(o.value) === String(value));

    const updatePosition = () => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const dropUp = spaceBelow < 220 && spaceAbove > spaceBelow;

        // Smart alignment: if explicit 'right', or if placed in the right half where menu could overflow
        const isRight = align === 'right' || (align === 'auto' && (rect.left + 320 > window.innerWidth || rect.left > window.innerWidth / 2));

        setCoords({
            top: dropUp ? (rect.top + window.scrollY - 6) : (rect.bottom + window.scrollY + 6),
            left: isRight ? undefined : (rect.left + window.scrollX),
            right: isRight ? (window.innerWidth - rect.right - window.scrollX) : undefined,
            width: minMenuWidth ? Math.max(rect.width, minMenuWidth) : rect.width,
            dropUp
        });
    };

    const handleToggle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;
        if (!isOpen) {
            updatePosition();
            setSearchTerm('');
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        updatePosition();

        const handleScrollOrResize = () => {
            updatePosition();
        };

        const handleClickOutside = (e) => {
            if (
                triggerRef.current && !triggerRef.current.contains(e.target) &&
                menuRef.current && !menuRef.current.contains(e.target)
            ) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        window.addEventListener('resize', handleScrollOrResize);
        window.addEventListener('scroll', handleScrollOrResize, true);
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);

        if (searchable) {
            setTimeout(() => {
                searchInputRef.current?.focus();
            }, 50);
        }

        return () => {
            window.removeEventListener('resize', handleScrollOrResize);
            window.removeEventListener('scroll', handleScrollOrResize, true);
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, searchable]);

    const filteredOptions = normalizedOptions.filter(opt => {
        if (!searchTerm) return true;
        const s = searchTerm.toLocaleLowerCase('tr-TR');
        return opt.label.toLocaleLowerCase('tr-TR').includes(s) || 
               (opt.sublabel && opt.sublabel.toLocaleLowerCase('tr-TR').includes(s));
    });

    const isAutoSearchable = searchable || normalizedOptions.length > 7;

    return (
        <div className={`relative inline-block w-full ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                onClick={handleToggle}
                className={`w-full bg-[#0d1117] border border-white/[0.08] hover:border-white/[0.16] focus:border-amber-500/70 text-white rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center justify-between gap-2 transition outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isOpen ? 'border-amber-500/70 shadow-[0_0_12px_rgba(249,115,22,0.15)]' : ''
                } ${buttonClassName}`}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1 text-left">
                    {selectedOption?.icon && (
                        <span className="shrink-0">{selectedOption.icon}</span>
                    )}
                    <span className="truncate block font-medium">
                        {selectedOption ? selectedOption.label : <span className="text-slate-500 font-normal">{placeholder}</span>}
                    </span>
                </div>
                <ChevronDown 
                    size={13} 
                    className={`text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-amber-400' : ''}`} 
                />
            </button>

            {isOpen && createPortal(
                <div
                    ref={menuRef}
                    style={{
                        position: 'absolute',
                        top: coords.dropUp ? undefined : `${coords.top}px`,
                        bottom: coords.dropUp ? `${window.innerHeight - (coords.top - window.scrollY)}px` : undefined,
                        left: coords.left !== undefined ? `${coords.left}px` : undefined,
                        right: coords.right !== undefined ? `${coords.right}px` : undefined,
                        minWidth: `${coords.width}px`,
                        maxWidth: 'min(440px, 90vw)',
                        zIndex: 999999
                    }}
                    className={`bg-[#07090e] border border-white/[0.1] rounded-2xl shadow-2xl shadow-black/95 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 ${menuClassName}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Optional Search Input */}
                    {isAutoSearchable && (
                        <div className="p-2 border-b border-white/[0.06] bg-white/[0.02]">
                            <div className="relative flex items-center">
                                <Search size={12} className="absolute left-2.5 text-slate-400 pointer-events-none" />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Filtrele..."
                                    className="w-full bg-[#0d1117] border border-white/[0.08] text-white rounded-lg pl-7 pr-7 py-1 text-xs outline-none focus:border-orange-500/70 placeholder:text-slate-500"
                                />
                                {searchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-2 text-slate-400 hover:text-white"
                                    >
                                        <X size={11} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Options List */}
                    <div className="max-h-56 overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-0.5">
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-3 text-center text-xs text-slate-500">
                                Eşleşen seçenek bulunamadı
                            </div>
                        ) : (
                            filteredOptions.map((opt) => {
                                const isSelected = String(opt.value) === String(value);
                                return (
                                    <button
                                        key={String(opt.value)}
                                        type="button"
                                        onClick={() => {
                                            onChange(opt.value);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all flex items-center justify-between gap-3 cursor-pointer ${
                                            isSelected
                                                ? 'bg-orange-500/15 text-orange-400 font-bold border border-orange-500/25 shadow-sm'
                                                : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
                                        }`}
                                    >
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className="truncate">{opt.label}</span>
                                            {opt.sublabel && (
                                                <span className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{opt.sublabel}</span>
                                            )}
                                        </div>
                                        {isSelected && (
                                            <Check size={13} className="text-orange-400 shrink-0" />
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default CustomSelect;

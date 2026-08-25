import React, { useState, useEffect, useRef } from 'react';
import { Check, ThumbsUp } from 'lucide-react';
import { parseTonnageInTons } from '../utils/tonnageUtils';

const A4InvoicePreview = React.forwardRef(({
    invoiceData,
    vehicleInfo,
    netPrice,
    onChangeNetPrice,
    onSavePrice,
    fuelRecords = [],
    ownerName: propOwnerName
}, ref) => {

    const [localPrice, setLocalPrice] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [saveAnim, setSaveAnim] = useState('idle'); // idle | entering | saved | leaving
    const initialPriceRef = useRef(null);

    useEffect(() => {
        const parsedLocal = parseFloat(localPrice.replace(/\./g, '').replace(',', '.'));
        if (netPrice !== parsedLocal && netPrice !== undefined && netPrice !== null) {
             const parts = netPrice.toFixed(2).split('.');
             const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
             const formatted = `${intPart},${parts[1]}`;
             setLocalPrice(formatted);
             initialPriceRef.current = formatted;
             setIsDirty(false);
             setSaveAnim('idle');
        } else if (!netPrice && netPrice !== 0) {
             setLocalPrice('');
             initialPriceRef.current = '';
        }
    }, [netPrice]);

    const handlePriceChange = (e) => {
        const val = e.target.value;
        let raw = val.replace(/[^0-9,]/g, '');
        
        const commaCount = (raw.match(/,/g) || []).length;
        if (commaCount > 1) {
            const firstComma = raw.indexOf(',');
            raw = raw.substring(0, firstComma + 1) + raw.substring(firstComma + 1).replace(/,/g, '');
        }

        const parts = raw.split(',');
        let intPart = parts[0];
        let decPart = parts.length > 1 ? parts[1].substring(0, 2) : undefined;

        if (intPart) {
            intPart = intPart.replace(/^0+/, '') || '0';
            intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        } else if (decPart !== undefined) {
            intPart = '0';
        }
        
        const formatted = decPart !== undefined ? `${intPart},${decPart}` : intPart;
        setLocalPrice(formatted);
        
        const floatVal = parseFloat(raw.replace(',', '.'));
        onChangeNetPrice(isNaN(floatVal) ? 0 : floatVal);

        // Show save button if changed from initial
        const changed = formatted !== initialPriceRef.current;
        if (changed && !isDirty) {
            setIsDirty(true);
            setSaveAnim('entering');
            setTimeout(() => setSaveAnim('visible'), 10);
        } else if (!changed) {
            setIsDirty(false);
            setSaveAnim('leaving');
            setTimeout(() => setSaveAnim('idle'), 300);
        }
    };

    const handleSaveClick = async () => {
        if (!onSavePrice) return;
        setSaveAnim('saved');
        await onSavePrice();
        setTimeout(() => {
            setSaveAnim('leaving');
            setTimeout(() => {
                setSaveAnim('idle');
                setIsDirty(false);
                initialPriceRef.current = localPrice;
            }, 350);
        }, 700);
    };

    const { startDate, endDate, trips = [] } = invoiceData || {};

    const totalTonnage = trips.reduce((acc, trip) => acc + parseTonnageInTons(trip.tonnage), 0);

    // Güzergah bazlı özet (çok tondan az tona)
    const routeSummary = Object.values(
        trips.reduce((acc, trip) => {
            const key = `${trip.from}|||${trip.to}`;
            if (!acc[key]) acc[key] = { from: trip.from, to: trip.to, tonnage: 0 };
            acc[key].tonnage += parseTonnageInTons(trip.tonnage);
            return acc;
        }, {})
    ).sort((a, b) => b.tonnage - a.tonnage);

    // Fatura Seçim Aralığındaki Günleri Oluştur
    const tableRows = [];
    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const dateStrLocal = `${y}-${m}-${day}`;

                const tripsOnDate = trips.filter(t => t.date === dateStrLocal);
                if (tripsOnDate.length > 0) {
                    tripsOnDate.forEach((trip, idx) => {
                        tableRows.push({ type: 'trip', dateStr: dateStrLocal, data: trip, isFirstOfDay: idx === 0 });
                    });
                }
            }
        }
    } else {
        trips.forEach((trip, idx) => {
            const isFirstOfDay = trips.findIndex(t => t.date === trip.date) === idx;
            tableRows.push({ type: 'trip', dateStr: trip.date, data: trip, isFirstOfDay });
        });
    }

    const [docViewTab, setDocViewTab] = useState('summary'); // 'summary' | 'trips'

    // Editable truck owner name – persisted per plate
    const plateKey = vehicleInfo?.plate || 'default';
    const storageKey = `truck_owner_name_${plateKey}`;
    const [ownerName, setOwnerName] = useState(() => propOwnerName || localStorage.getItem(storageKey) || 'GÖKSEL İNANER');
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState(propOwnerName || ownerName);

    useEffect(() => {
        if (propOwnerName) {
            setOwnerName(propOwnerName);
            setEditNameValue(propOwnerName);
        }
    }, [propOwnerName]);

    const handleSaveName = () => {
        const trimmed = editNameValue.trim().toLocaleUpperCase('tr-TR') || 'GÖKSEL İNANER';
        setOwnerName(trimmed);
        localStorage.setItem(storageKey, trimmed);
        setIsEditingName(false);
    };

    const displayOwnerName = propOwnerName || ownerName;

    const renderHeader = () => (
        <div className="flex justify-between items-end border-b-2 border-blue-800 pb-3 mb-4 shrink-0">
            <div className="flex flex-col">
                <h1 className="text-2xl sm:text-3xl font-black text-blue-900 mb-0.5 tracking-tight">SEFER DÖKÜMÜ</h1>
                <p className="text-xs font-semibold text-slate-500">
                    Periyot: {startDate ? new Date(startDate).toLocaleDateString('tr-TR') : '-'} - {endDate ? new Date(endDate).toLocaleDateString('tr-TR') : '-'}
                </p>
                <p className="text-xs font-semibold text-slate-500">Tarih: {new Date().toLocaleDateString('tr-TR')}</p>
            </div>

            <div className="flex flex-col items-end">
                <div className="flex flex-col text-right border-r-[4px] border-blue-800 pr-3">
                    {isEditingName ? (
                        <div className="flex items-center gap-1 mb-1">
                            <input
                                type="text"
                                value={editNameValue}
                                onChange={e => setEditNameValue(e.target.value.toLocaleUpperCase('tr-TR'))}
                                onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                                className="text-[14px] font-black tracking-tight text-slate-800 uppercase border-b border-blue-500 outline-none text-right bg-transparent w-40"
                                autoFocus
                            />
                            <button onClick={handleSaveName} className="p-0.5 hover:text-blue-600 text-slate-600 print:hidden"><Check size={13} /></button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 mb-1 justify-end">
                            <h2
                                onDoubleClick={() => { setEditNameValue(displayOwnerName); setIsEditingName(true); }}
                                className="text-[16px] sm:text-[18px] font-black tracking-tight text-slate-800 leading-none uppercase cursor-text select-none print:cursor-default"
                                title="Düzenlemek için çift tıklayın"
                            >{displayOwnerName}</h2>
                        </div>
                    )}
                    <p className="text-[10px] font-extrabold text-slate-600 uppercase tracking-[0.2em] leading-none mb-1">ARAÇ BİLGİSİ</p>
                    <p className="text-[16px] sm:text-[18px] font-mono text-slate-700 font-extrabold tracking-[0.05em] leading-none mb-0.5">{vehicleInfo?.plate || '06 FTN 692'}</p>
                    {vehicleInfo?.trailerPlate && (
                        <p className="text-[9px] font-mono text-slate-500 leading-none tracking-widest font-semibold">Dorse: {vehicleInfo.trailerPlate}</p>
                    )}
                </div>
            </div>
        </div>
    );

    const renderTabBar = () => (
        <div className="print:hidden flex items-center justify-between bg-slate-100 p-1.5 rounded-xl mb-3 border border-slate-200 shadow-sm shrink-0">
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => setDocViewTab('summary')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                        docViewTab === 'summary'
                            ? 'bg-blue-900 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                    }`}
                >
                    <span>📊 Toplam Tonaj</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${docViewTab === 'summary' ? 'bg-blue-800 text-blue-100' : 'bg-slate-200 text-slate-700'}`}>
                        {routeSummary.length}
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => setDocViewTab('trips')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                        docViewTab === 'trips'
                            ? 'bg-blue-900 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                    }`}
                >
                    <span>📋 Seferler</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${docViewTab === 'trips' ? 'bg-blue-800 text-blue-100' : 'bg-slate-200 text-slate-700'}`}>
                        {trips.length}
                    </span>
                </button>
            </div>
            <div className="text-[11px] font-bold text-slate-600 pr-2 flex items-center gap-1">
                <span>Toplam:</span>
                <span className="text-blue-950 font-black text-xs">{totalTonnage.toFixed(2)} Ton</span>
            </div>
        </div>
    );

    const renderToplamTonaj = () => (
        routeSummary.length > 0 && (
            <div className={`mb-3 ${docViewTab === 'summary' ? 'block' : 'hidden print:block'}`}>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-0.5">Toplam Tonaj İcmali</div>
                <table className="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr className="bg-slate-100 text-slate-700 border-y border-slate-200 leading-tight">
                            <th className="py-2 px-2 font-bold border-r border-slate-200 w-[44%]">Alınan Yer</th>
                            <th className="py-2 px-2 font-bold border-r border-slate-200 w-[44%]">Gidilen Yer</th>
                            <th className="py-2 px-2 font-bold text-right w-[12%]">Tonaj</th>
                        </tr>
                    </thead>
                    <tbody>
                        {routeSummary.map((r, i) => (
                            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="py-2 px-2 text-slate-800 font-medium">{r.from}</td>
                                <td className="py-2 px-2 text-slate-800 font-medium">{r.to}</td>
                                <td className="py-2 px-2 text-right text-slate-900 font-black">{r.tonnage.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    );

    const renderSeferler = () => (
        <div className={`mb-3 ${docViewTab === 'trips' ? 'block' : 'hidden print:block'}`}>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-0.5">Sefer Detayları</div>
            <div className="max-h-[320px] overflow-y-auto custom-scrollbar print:max-h-none print:overflow-visible">
                <table className="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr className="bg-slate-100 text-slate-700 border-y border-slate-200 leading-tight sticky top-0 bg-slate-100 print:static">
                            <th className="py-2 px-2 font-bold border-r border-slate-200 w-[14%]">Tarih</th>
                            <th className="py-2 px-2 font-bold border-r border-slate-200 w-[42%]">Alınan Yer</th>
                            <th className="py-2 px-2 font-bold border-r border-slate-200 w-[32%]">Gidilen Yer</th>
                            <th className="py-2 px-2 text-right font-bold w-[12%]">Tonaj</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableRows.length > 0 ? tableRows.map((row, idx) => {
                            const localDate = new Date(row.dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            const trip = row.data;
                            return (
                                <tr key={trip.id || idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                    <td className="py-1.5 px-2 text-slate-600 whitespace-nowrap font-medium">{localDate}</td>
                                    <td className="py-1.5 px-2 text-slate-800 font-medium truncate max-w-[120px]">{trip.from}</td>
                                    <td className="py-1.5 px-2 text-slate-800 font-medium truncate max-w-[120px]">{trip.to}</td>
                                    <td className="py-1.5 px-2 text-right text-slate-900 font-black">{parseTonnageInTons(trip.tonnage).toFixed(2)}</td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan="4" className="py-8 text-center text-slate-400 italic text-sm">Bu periyotta gösterilecek veri bulunamadı.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderNetFiyat = () => (
        <div className="print:hidden flex justify-end mt-2 pt-2 border-t border-slate-100 shrink-0">
            <style>{`
                @keyframes btnPopIn {
                    0% { transform: scale(0) rotate(-20deg); opacity: 0; }
                    70% { transform: scale(1.15) rotate(4deg); opacity: 1; }
                    100% { transform: scale(1) rotate(0deg); opacity: 1; }
                }
                @keyframes btnPopOut {
                    0% { transform: scale(1); opacity: 1; }
                    100% { transform: scale(0) rotate(20deg); opacity: 0; }
                }
                @keyframes thumbPulse {
                    0% { transform: scale(1); }
                    40% { transform: scale(1.3) rotate(-10deg); }
                    70% { transform: scale(0.95) rotate(5deg); }
                    100% { transform: scale(1) rotate(0deg); }
                }
                .btn-pop-in  { animation: btnPopIn  0.3s cubic-bezier(0.34,1.56,0.64,1) forwards; }
                .btn-pop-out { animation: btnPopOut 0.3s ease-in forwards; }
                .btn-thumb   { animation: thumbPulse 0.5s ease forwards; }
            `}</style>
            <div className="flex items-center gap-2 pr-2">
                <span className="text-blue-900 font-black text-xs">NET FİYAT:</span>
                <span className="text-slate-500 text-[10px]">₺</span>
                <div className="relative">
                    <input
                        type="text"
                        placeholder="0,00"
                        className="w-32 text-right bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-blue-900 font-black text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                        value={localPrice}
                        onChange={handlePriceChange}
                    />
                    {onSavePrice && saveAnim !== 'idle' && (
                        <button
                            onClick={handleSaveClick}
                            title="Fiyatı kaydet"
                            className={`absolute -right-9 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-white flex-shrink-0
                                ${ saveAnim === 'saved' ? 'bg-emerald-500 btn-thumb' : 'bg-emerald-500 hover:bg-emerald-400' }
                                ${ saveAnim === 'entering' || saveAnim === 'visible' ? 'btn-pop-in' : '' }
                                ${ saveAnim === 'leaving' ? 'btn-pop-out' : '' }
                            `}
                        >
                            {saveAnim === 'saved'
                                ? <ThumbsUp size={13} />
                                : <Check size={13} />
                            }
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="w-full h-full relative overflow-hidden flex items-center justify-center p-2 sm:p-3 print:p-0 print:block print:h-auto print:overflow-visible">
            {/* Canlı Belge Kartı (Ekranda Sıfır Scroll & Tek Ekran) */}
            <div
                ref={ref}
                className="w-full max-w-[780px] bg-white rounded-2xl shadow-2xl p-5 sm:p-6 text-black border border-slate-200/90 flex flex-col justify-between print:w-full print:max-w-none print:rounded-none print:shadow-none print:border-none print:p-8"
                style={{ fontFamily: "'Inter', sans-serif" }}
            >
                {renderHeader()}
                {renderTabBar()}
                {renderToplamTonaj()}
                {renderSeferler()}
                {renderNetFiyat()}
            </div>
        </div>
    );
});

A4InvoicePreview.displayName = 'A4InvoicePreview';
export default A4InvoicePreview;

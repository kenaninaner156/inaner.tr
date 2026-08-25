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
    const estimatedHeight = 160 + (routeSummary.length * 30) + (tableRows.length * 26);
    const isSinglePage = estimatedHeight <= 860;

    const renderHeader = (isPage2 = false) => (
        <div className="flex justify-between items-end border-b-2 border-blue-800 pb-3 mb-4 shrink-0 bg-white">
            <div className="flex flex-col">
                <h1 className="text-2xl font-black text-blue-900 mb-0.5 tracking-tight">
                    {isPage2 ? 'SEFER DETAYLARI' : 'SEFER DÖKÜMÜ'}
                </h1>
                <p className="text-xs font-semibold text-slate-500">
                    Periyot: {startDate ? new Date(startDate).toLocaleDateString('tr-TR') : '-'} - {endDate ? new Date(endDate).toLocaleDateString('tr-TR') : '-'}
                </p>
                <p className="text-xs font-semibold text-slate-500">Tarih: {new Date().toLocaleDateString('tr-TR')}</p>
            </div>

            <div className="flex flex-col items-end">
                <div className="flex flex-col text-right border-r-[4px] border-blue-800 pr-3">
                    {!isPage2 && (
                        <h2 className="text-[16px] font-black tracking-tight text-slate-800 leading-none uppercase mb-1">
                            {displayOwnerName}
                        </h2>
                    )}
                    <p className="text-[10px] font-extrabold text-slate-600 uppercase tracking-[0.2em] leading-none mb-1">ARAÇ BİLGİSİ</p>
                    <p className="text-[16px] font-mono text-slate-700 font-extrabold tracking-[0.05em] leading-none mb-0.5">{vehicleInfo?.plate || '06 FTN 692'}</p>
                    {vehicleInfo?.trailerPlate && (
                        <p className="text-[9px] font-mono text-slate-500 leading-none tracking-widest font-semibold">Dorse: {vehicleInfo.trailerPlate}</p>
                    )}
                </div>
            </div>
        </div>
    );

    const renderToplamTonaj = () => (
        routeSummary.length > 0 && (
            <div className="mb-4 bg-white">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 px-0.5 border-b border-slate-200 pb-1">
                    Toplam Tonaj İcmali
                </div>
                <table className="w-full text-left border-collapse text-xs bg-white">
                    <thead>
                        <tr className="bg-slate-100 text-slate-800 border-y border-slate-300 leading-tight">
                            <th className="py-2.5 px-3 font-bold border-r border-slate-200 w-[42%]">Alınan Yer</th>
                            <th className="py-2.5 px-3 font-bold border-r border-slate-200 w-[42%]">Gidilen Yer</th>
                            <th className="py-2.5 px-3 font-bold text-right w-[16%]">Tonaj</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {routeSummary.map((r, i) => (
                            <tr key={i} className="border-b border-slate-100">
                                <td className="py-2 px-3 text-slate-800 font-medium">{r.from}</td>
                                <td className="py-2 px-3 text-slate-800 font-medium">{r.to}</td>
                                <td className="py-2 px-3 text-right text-slate-950 font-black font-mono">{r.tonnage.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    );

    const renderSeferler = () => (
        <div className="mb-4 bg-white">
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 px-0.5 border-b border-slate-200 pb-1">
                Sefer Detayları
            </div>
            <table className="w-full text-left border-collapse text-xs bg-white">
                <thead>
                    <tr className="bg-slate-100 text-slate-800 border-y border-slate-300 leading-tight">
                        <th className="py-2.5 px-3 font-bold border-r border-slate-200 w-[16%]">Tarih</th>
                        <th className="py-2.5 px-3 font-bold border-r border-slate-200 w-[38%]">Alınan Yer</th>
                        <th className="py-2.5 px-3 font-bold border-r border-slate-200 w-[32%]">Gidilen Yer</th>
                        <th className="py-2.5 px-3 text-right font-bold w-[14%]">Tonaj</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {tableRows.length > 0 ? tableRows.map((row, idx) => {
                        const localDate = new Date(row.dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                        const trip = row.data;
                        return (
                            <tr key={trip.id || idx} className="border-b border-slate-100" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                <td className="py-1.5 px-3 text-slate-600 whitespace-nowrap font-medium font-mono">{localDate}</td>
                                <td className="py-1.5 px-3 text-slate-800 font-medium">{trip.from}</td>
                                <td className="py-1.5 px-3 text-slate-800 font-medium">{trip.to}</td>
                                <td className="py-1.5 px-3 text-right text-slate-950 font-black font-mono">{parseTonnageInTons(trip.tonnage).toFixed(2)}</td>
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
    );

    return (
        <div ref={ref} className="w-full bg-white text-black font-sans">
            {isSinglePage ? (
                /* TEK SAYFAYA SIĞIYOR */
                <div className="a4-page single-page bg-white">
                    {renderHeader(false)}
                    {renderToplamTonaj()}
                    {renderSeferler()}
                </div>
            ) : (
                /* İKİ SAYFAYA BÖLÜNÜYOR */
                <div className="a4-multi-page bg-white">
                    {/* SAYFA 1: Başlık + Toplam Tonaj İcmali */}
                    <div className="a4-page page-1 bg-white mb-8" style={{ pageBreakAfter: 'always', breakAfter: 'page' }}>
                        {renderHeader(false)}
                        {renderToplamTonaj()}
                    </div>

                    {/* SAYFA 2: Sefer Detayları (En baştan başlar) */}
                    <div className="a4-page page-2 bg-white" style={{ pageBreakBefore: 'always', breakBefore: 'page' }}>
                        {renderHeader(true)}
                        {renderSeferler()}
                    </div>
                </div>
            )}
        </div>
    );
});

A4InvoicePreview.displayName = 'A4InvoicePreview';
export default A4InvoicePreview;

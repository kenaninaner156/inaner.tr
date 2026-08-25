import React, { useState, useEffect, useRef } from 'react';
import { Check, ThumbsUp } from 'lucide-react';
import { useCompany } from '../context/CompanyContext';
import { parseTonnageInTons } from '../utils/tonnageUtils';

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

const A4PersonnelPreview = React.forwardRef(({
    payoutData,
    vehicleInfo,
    netPrice,
    onChangeNetPrice,
    onSavePrice
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

    const { startDate, endDate, driverName, trips = [] } = payoutData || {};

    const totalCalculatedPremium = trips.reduce((acc, trip) => acc + (Number(trip.premiumAmount) || 0), 0);

    // Güzergah bazlı özet (çok tondan az tona)
    const routeSummary = Object.values(
        trips.reduce((acc, trip) => {
            const key = `${trip.from}|||${trip.to}`;
            if (!acc[key]) acc[key] = { from: trip.from, to: trip.to, count: 0, premiumAmount: 0 };
            acc[key].count++;
            acc[key].premiumAmount += Number(trip.premiumAmount) || 0;
            return acc;
        }, {})
    ).sort((a, b) => b.premiumAmount - a.premiumAmount);

    // Tablo Satırları
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

    const containerRef = React.useRef(null);
    const [scale, setScale] = React.useState(1);
    const [realHeight, setRealHeight] = React.useState(A4_HEIGHT);
    const [isMobile, setIsMobile] = React.useState(false);

    // Persist owner name per driver name
    const { companyData } = useCompany();
    const driverKey = driverName || 'default';
    const storageKey = `payout_owner_name_${driverKey}`;
    const [ownerName, setOwnerName] = React.useState(() => localStorage.getItem(storageKey) || companyData?.name || 'ŞİRKET ADI');
    const [isEditingName, setIsEditingName] = React.useState(false);
    const [editNameValue, setEditNameValue] = React.useState(ownerName);
    
    const [activePage, setActivePage] = React.useState(1);
    const isTwoPages = tableRows.length > 15;

    const handleSaveName = () => {
        const trimmed = editNameValue.trim().toLocaleUpperCase('tr-TR') || companyData?.name || 'ŞİRKET ADI';
        setOwnerName(trimmed);
        localStorage.setItem(storageKey, trimmed);
        setIsEditingName(false);
    };

    React.useLayoutEffect(() => {
        const updateScale = () => {
            if (!containerRef.current) return;
            const cw = containerRef.current.clientWidth || containerRef.current.parentElement?.clientWidth || window.innerWidth;
            if (cw === 0) return;

            const mobile = cw < 768;
            setIsMobile(mobile);

            const ch = containerRef.current.clientHeight;
            const sx = cw / A4_WIDTH;

            let newScale;
            if (!mobile && ch > 0) {
                const sy = ch / realHeight;
                newScale = Math.min(sx, sy);
            } else {
                newScale = sx;
            }
            setScale(newScale);
        };

        const ro = new ResizeObserver(() => {
            updateScale();
            if (ref && 'current' in ref && ref.current) {
                const sh = Math.max(ref.current.scrollHeight, A4_HEIGHT);
                if (sh !== realHeight) setRealHeight(sh);
            }
        });

        if (containerRef.current) ro.observe(containerRef.current);
        if (ref && 'current' in ref && ref.current) ro.observe(ref.current);

        updateScale();
        return () => ro.disconnect();
    }, [ref, realHeight]);

    const containerStyle = isMobile
        ? { height: `${realHeight * scale}px`, position: 'relative' }
        : { height: '100%', position: 'relative' };

    const paperStyle = isMobile
        ? {
            width: `${A4_WIDTH}px`,
            minHeight: `${realHeight}px`,
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            position: 'absolute',
            left: `calc(50% - ${(A4_WIDTH * scale) / 2}px)`,
            top: 0,
            fontFamily: "'Inter', sans-serif",
            padding: '20mm 15mm 12mm 15mm',
            boxSizing: 'border-box'
        }
        : {
            width: `${A4_WIDTH}px`,
            minHeight: `${realHeight}px`,
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            position: 'absolute',
            left: `calc(50% - ${(A4_WIDTH * scale) / 2}px)`,
            top: `calc(50% - ${(realHeight * scale) / 2}px)`,
            fontFamily: "'Inter', sans-serif",
            padding: '20mm 15mm 12mm 15mm',
            boxSizing: 'border-box'
        };

    const renderHeader = () => (
        <div className="flex justify-between items-end border-b-2 border-orange-600 pb-4 mb-6 shrink-0">
            <div className="flex flex-col">
                <h1 className="text-2xl font-black text-orange-800 mb-1 tracking-tight">PERSONEL PRİM DÖKÜMÜ</h1>
                <p className="text-xs font-semibold text-slate-500">
                    Personel: <strong className="text-slate-800 font-bold">{driverName || '-'}</strong>
                </p>
                <p className="text-[11px] font-semibold text-slate-500">
                    Periyot: {startDate ? new Date(startDate).toLocaleDateString('tr-TR') : '-'} - {endDate ? new Date(endDate).toLocaleDateString('tr-TR') : '-'}
                </p>
                <p className="text-[10px] text-slate-400">Yazdırma Tarihi: {new Date().toLocaleDateString('tr-TR')}</p>
            </div>

            <div className="flex flex-col items-end">
                <div className="flex flex-col text-right border-r-[4px] border-orange-500 pr-3">
                    {isEditingName ? (
                        <div className="flex items-center gap-1 mb-1.5">
                            <input
                                type="text"
                                value={editNameValue}
                                onChange={e => setEditNameValue(e.target.value.toLocaleUpperCase('tr-TR'))}
                                onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                                className="text-[14px] font-black tracking-tight text-slate-800 uppercase border-b border-orange-500 outline-none text-right bg-transparent w-40"
                                autoFocus
                            />
                            <button onClick={handleSaveName} className="p-0.5 hover:text-orange-600 text-slate-600 print:hidden"><Check size={13} /></button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 mb-1.5 justify-end">
                            <h2
                                onDoubleClick={() => { setEditNameValue(ownerName); setIsEditingName(true); }}
                                className="text-[16px] font-black tracking-tight text-slate-800 leading-none uppercase cursor-text select-none print:cursor-default"
                                title="Düzenlemek için çift tıklayın"
                            >{ownerName}</h2>
                        </div>
                    )}
                    <p className="text-[9px] font-extrabold text-slate-500 uppercase tracking-[0.2em] leading-none mb-1.5 font-semibold">ŞİRKET / YÖNETİCİ</p>
                    <p className="text-[15px] font-mono text-slate-700 font-extrabold tracking-[0.05em] leading-none mb-1">{vehicleInfo?.plate || '—'}</p>
                    {vehicleInfo?.trailerPlate && (
                        <p className="text-[9px] font-mono text-slate-500 leading-none tracking-widest font-semibold">Dorse: {vehicleInfo.trailerPlate}</p>
                    )}
                </div>
            </div>
        </div>
    );

    const renderToplamHakEdis = () => (
        routeSummary.length > 0 && (
            <div className="mb-4">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-0.5">Güzergah Bazlı Hak Ediş Özeti</div>
                <table className="w-full text-left border-collapse" style={{ fontSize: '10px' }}>
                    <thead>
                        <tr className="bg-slate-100 text-slate-700 border-y border-slate-200 leading-tight">
                            <th className="py-1.5 px-2 font-semibold border-r border-slate-200 w-[35%]">Alınan Yer</th>
                            <th className="py-1.5 px-2 font-semibold border-r border-slate-200 w-[35%]">Gidilen Yer</th>
                            <th className="py-1.5 px-2 font-semibold border-r border-slate-200 text-center w-[12%]">Sefer Sayısı</th>
                            <th className="py-1.5 px-2 font-semibold text-right w-[18%]">Hesaplanan Prim</th>
                        </tr>
                    </thead>
                    <tbody>
                        {routeSummary.map((r, i) => (
                            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="py-1.5 px-2 text-slate-700 truncate max-w-[80px]">{r.from}</td>
                                <td className="py-1.5 px-2 text-slate-700 truncate max-w-[80px]">{r.to}</td>
                                <td className="py-1.5 px-2 text-slate-800 text-center font-bold">{r.count}</td>
                                <td className="py-1.5 px-2 text-right text-slate-800 font-bold">₺{r.premiumAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    );

    const renderSeferler = () => (
        <div className="mb-4 min-h-[50px]">
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-0.5">Seferler ve Prim Detayları</div>
            <table className="w-full text-left border-collapse" style={{ fontSize: '10px' }}>
                <thead>
                    <tr className="bg-slate-100 text-slate-700 border-y border-slate-200 leading-tight">
                        <th className="py-1.5 px-2 font-semibold border-r border-slate-200 w-[12%]">Tarih</th>
                        <th className="py-1.5 px-2 font-semibold border-r border-slate-200 w-[28%]">Alınan Yer</th>
                        <th className="py-1.5 px-2 font-semibold border-r border-slate-200 w-[24%]">Gidilen Yer</th>
                        <th className="py-1.5 px-2 font-semibold border-r border-slate-200 text-center w-[10%]">Tonaj</th>
                        <th className="py-1.5 px-2 font-semibold border-r border-slate-200 w-[14%]">Prim Türü</th>
                        <th className="py-1.5 px-2 text-right font-semibold w-[12%]">Tutar</th>
                    </tr>
                </thead>
                <tbody>
                    {tableRows.length > 0 ? tableRows.map((row, idx) => {
                        const localDate = new Date(row.dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                        const trip = row.data;
                        return (
                            <tr key={trip.id || idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="py-1.5 px-2 text-slate-600 whitespace-nowrap">{localDate}</td>
                                <td className="py-1.5 px-2 text-slate-700 truncate max-w-[65px]">{trip.from}</td>
                                <td className="py-1.5 px-2 text-slate-700 truncate max-w-[65px]">{trip.to}</td>
                                <td className="py-1.5 px-2 text-slate-800 text-center">{parseTonnageInTons(trip.tonnage).toFixed(2)} t</td>
                                <td className="py-1.5 px-2 text-slate-600 truncate max-w-[50px]">{trip.premiumName || 'Özel Prim'}</td>
                                <td className="py-1.5 px-2 text-right text-slate-800 font-bold">₺{Number(trip.premiumAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        );
                    }) : (
                        <tr>
                            <td colSpan="6" className="py-8 text-center text-slate-400 italic text-sm">Gösterilecek sefer bulunamadı.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    const renderNetFiyat = () => (
        <div className="flex justify-between items-start mt-6 border-t border-slate-200 pt-4 px-1">
            <div className="flex flex-col text-slate-500" style={{ fontSize: '9px' }}>
                <span className="font-semibold uppercase tracking-widest text-slate-400 mb-1">Hesaplama Özeti</span>
                <span>Toplam Hak Edilen Prim: <strong>₺{totalCalculatedPremium.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong></span>
                <span>Sefer Adedi: <strong>{trips.length}</strong></span>
            </div>
            
            <div className="flex flex-col items-end">
                <div className="print:hidden flex items-center gap-2">
                    <span className="text-orange-900 font-black text-xs">NET HAK EDİŞ:</span>
                    <span className="text-slate-500 text-[10px]">₺</span>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="0,00"
                            className="w-28 text-right bg-white border border-slate-300 rounded px-2 py-1 text-orange-900 font-black text-sm focus:outline-none focus:border-orange-400"
                            value={localPrice}
                            onChange={handlePriceChange}
                        />
                        {onSavePrice && saveAnim !== 'idle' && (
                            <button
                                onClick={handleSaveClick}
                                title="Net tutarı kaydet"
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
                
                {/* Print layout net price */}
                <div className="hidden print:flex flex-col items-end">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Net Ödeme Tutarı</span>
                    <span className="text-lg font-black text-orange-950 font-mono">
                        ₺{netPrice?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </span>
                </div>
            </div>
        </div>
    );

    return (
        <div
            ref={containerRef}
            className="w-full overflow-hidden bg-transparent print:h-auto print:overflow-visible print:p-0 relative flex justify-center"
            style={containerStyle}
        >
            {isTwoPages && (
                <div className="absolute top-3 right-3 z-50 print:hidden">
                    <style>{`
                        @keyframes pageGlowOrange {
                            0%, 100% { box-shadow: 0 0 12px rgba(249,115,22,0.4), 0 4px 24px rgba(0,0,0,0.5); }
                            50% { box-shadow: 0 0 20px rgba(249,115,22,0.6), 0 4px 24px rgba(0,0,0,0.5); }
                        }
                    `}</style>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: 'rgba(15, 20, 40, 0.85)',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            borderRadius: '8px',
                            padding: '3px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            animation: 'pageGlowOrange 3s ease-in-out infinite',
                            position: 'relative',
                            gap: '2px',
                        }}
                    >
                        <div
                            style={{
                                position: 'absolute',
                                top: '3px',
                                left: activePage === 1 ? '3px' : 'calc(50% + 1px)',
                                width: 'calc(50% - 4px)',
                                height: 'calc(100% - 6px)',
                                borderRadius: '6px',
                                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                                transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: '0 2px 10px rgba(249,115,22,0.5)',
                            }}
                        />
                        {[1, 2].map(page => (
                            <button
                                key={page}
                                onClick={() => setActivePage(page)}
                                style={{
                                    position: 'relative',
                                    zIndex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                    width: '32px',
                                    height: '20px',
                                    borderRadius: '5px',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    padding: 0,
                                }}
                            >
                                <span style={{
                                    fontSize: '9px',
                                    fontWeight: 800,
                                    letterSpacing: '0.02em',
                                    color: activePage === page ? '#fff' : 'rgba(255,255,255,0.35)',
                                    transition: 'color 0.3s ease',
                                    fontFamily: "'Inter', sans-serif",
                                }}>{page}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div ref={ref} className="bg-transparent print:bg-white w-full flex flex-col print:flex-col print:gap-0">
                {/* SAYFA 1 */}
                <div
                    className={`bg-white text-black shrink-0 flex-col print:!scale-100 print:!min-h-0 print:!m-0 print:!shadow-none print:!static
                        ${isTwoPages && activePage !== 1 ? 'hidden print:flex' : 'flex'}
                        ${isTwoPages ? 'print:break-after-page' : ''}
                    `}
                    style={paperStyle}
                >
                    {renderHeader()}
                    {renderToplamHakEdis()}
                    {!isTwoPages && renderSeferler()}
                    {!isTwoPages && renderNetFiyat()}
                </div>

                {/* SAYFA 2 */}
                {isTwoPages && (
                    <div
                        className={`bg-white text-black shrink-0 flex-col print:!scale-100 print:!min-h-0 print:!m-0 print:!shadow-none print:!static
                            ${activePage !== 2 ? 'hidden print:flex' : 'flex'}
                        `}
                        style={paperStyle}
                    >
                        {renderHeader()}
                        {renderSeferler()}
                        {renderNetFiyat()}
                    </div>
                )}
            </div>
        </div>
    );
});

A4PersonnelPreview.displayName = 'A4PersonnelPreview';
export default A4PersonnelPreview;

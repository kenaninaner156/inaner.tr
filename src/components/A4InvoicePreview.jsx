import React from 'react';
import { Truck, Check } from 'lucide-react';

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

const A4InvoicePreview = React.forwardRef(({
    invoiceData,
    vehicleInfo,
    note,
    onChangeNote,
    taxRate,
    onChangeTaxRate,
    unitPrice,
    onChangeUnitPrice,
    fuelRecords = []
}, ref) => {

    const { startDate, endDate, trips = [] } = invoiceData || {};

    const totalTonnage = trips.reduce((acc, trip) => acc + (Number(trip.tonnage) || 0), 0);
    // Her seferin kendi birim fiyatını kullan (trip.price), yoksa global unitPrice'a düş
    const subTotal = trips.reduce((acc, trip) => {
        const price = Number(trip.price) > 0 ? Number(trip.price) : unitPrice;
        return acc + (Number(trip.tonnage) || 0) * price;
    }, 0);

    // Yakıtları tarihe göre grupla
    const fuelByDate = {};
    if (fuelRecords && fuelRecords.length > 0) {
        fuelRecords.forEach(record => {
            if (!record.deleted && record.date >= startDate && record.date <= endDate) {
                if (!fuelByDate[record.date]) fuelByDate[record.date] = { liters: 0, amount: 0 };
                fuelByDate[record.date].liters += Number(record.liters) || 0;
                fuelByDate[record.date].amount += Number(record.price) || 0;
            }
        });
    }

    const totalFuelLiters = Object.values(fuelByDate).reduce((acc, curr) => acc + curr.liters, 0);
    const totalFuelAmount = Object.values(fuelByDate).reduce((acc, curr) => acc + curr.amount, 0);

    const taxAmount = subTotal * (taxRate / 100);
    const grandTotal = subTotal + taxAmount;

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

    const containerRef = React.useRef(null);
    const [scale, setScale] = React.useState(1);
    const [realHeight, setRealHeight] = React.useState(A4_HEIGHT);
    const [isMobile, setIsMobile] = React.useState(false);

    // Editable truck owner name – persisted per plate
    const plateKey = vehicleInfo?.plate || 'default';
    const storageKey = `truck_owner_name_${plateKey}`;
    const [ownerName, setOwnerName] = React.useState(() => localStorage.getItem(storageKey) || 'GÖKSEL İNANER');
    const [isEditingName, setIsEditingName] = React.useState(false);
    const [editNameValue, setEditNameValue] = React.useState(ownerName);

    const handleSaveName = () => {
        const trimmed = editNameValue.trim().toLocaleUpperCase('tr-TR') || 'GÖKSEL İNANER';
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
                // Desktop: fit both width and height
                const sy = ch / realHeight;
                newScale = Math.min(sx, sy);
            } else {
                // Mobile: fit to width only, let height flow naturally
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

    // On mobile: container height = A4 content height * scale so the page layouts correctly
    const containerStyle = isMobile
        ? { height: `${realHeight * scale}px`, position: 'relative' }
        : { height: '100%', position: 'relative' };

    // A4 paper positioning
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

    return (
        <div
            ref={containerRef}
            className="w-full overflow-hidden bg-transparent print:h-auto print:overflow-visible print:p-0"
            style={containerStyle}
        >
            {/* A4 Gövde */}
            <div
                ref={ref}
                className="bg-white text-black shrink-0 flex flex-col print:!scale-100 print:!min-h-0 print:!m-0 print:!shadow-none print:!static"
                style={paperStyle}
            >
                {/* Antetli Kısım (Header) */}
                <div className="flex justify-between items-end border-b-2 border-blue-800 pb-4 mb-6">
                    <div className="flex flex-col">
                        <h1 className="text-3xl font-black text-blue-900 mb-1 tracking-tight">SEFER DÖKÜMÜ</h1>
                        <p className="text-xs font-semibold text-slate-500">
                            Periyot: {startDate ? new Date(startDate).toLocaleDateString('tr-TR') : '-'} - {endDate ? new Date(endDate).toLocaleDateString('tr-TR') : '-'}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">Tarih: {new Date().toLocaleDateString('tr-TR')}</p>
                    </div>

                    <div className="flex flex-col items-end">
                        <div className="flex flex-col text-right border-r-[4px] border-[var(--border-color)] pr-3">
                            {isEditingName ? (
                                <div className="flex items-center gap-1 mb-1.5">
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
                                <div className="flex items-center gap-1 mb-1.5 justify-end">
                                    <h2
                                        onDoubleClick={() => { setEditNameValue(ownerName); setIsEditingName(true); }}
                                        className="text-[18px] font-black tracking-tight text-slate-800 leading-none uppercase cursor-text select-none print:cursor-default"
                                        title="Düzenlemek için çift tıklayın"
                                    >{ownerName}</h2>
                                </div>
                            )}
                            <p className="text-[10px] font-extrabold text-slate-600 uppercase tracking-[0.2em] leading-none mb-1.5">ARAÇ BİLGİSİ</p>
                            <p className="text-[18px] font-mono text-slate-700 font-extrabold tracking-[0.05em] leading-none mb-1">{vehicleInfo?.plate || '06 FTN 692'}</p>
                            {vehicleInfo?.trailerPlate && (
                                <p className="text-[9px] font-mono text-slate-500 leading-none tracking-widest font-semibold">Dorse: {vehicleInfo.trailerPlate}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sefer Tablosu */}
                <div className="mb-4 min-h-[50px]">
                    <table className="w-full text-left border-collapse" style={{ fontSize: '10px' }}>
                        <thead>
                            <tr className="bg-blue-50 text-blue-900 border-y border-blue-200 leading-tight">
                                <th className="py-2 px-1 font-semibold border-r border-[var(--border-color)] w-[10%]">Tarih</th>
                                <th className="py-2 px-1 font-semibold border-r border-[var(--border-color)] w-[17%]">Alınan Yer</th>
                                <th className="py-2 px-1 font-semibold border-r border-[var(--border-color)] w-[17%]">Gidilen Yer</th>
                                <th className="py-2 px-1 text-right font-semibold border-r border-[var(--border-color)] w-[8%]">Tonaj</th>
                                <th className="py-2 px-1 text-center font-semibold border-r border-[var(--border-color)] w-[10%]">Plaka</th>
                                <th className="py-2 px-1 text-right font-semibold border-r border-[var(--border-color)] w-[10%]">B. Fiyat</th>
                                <th className="py-2 px-1 text-right font-semibold border-r border-[var(--border-color)] w-[12%]">Top. Fiyat</th>
                                <th className="py-2 px-1 text-right font-semibold border-r border-[var(--border-color)] w-[8%] leading-none text-[8px]">Mazot<br />(Litre)</th>
                                <th className="py-2 px-1 text-right font-semibold w-[8%] leading-none text-[8px]">Mazot<br />(Tutar)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tableRows.length > 0 ? tableRows.map((row, idx) => {
                                const localDate = new Date(row.dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                const trip = row.data;
                                let fuelStrLiters = "-";
                                let fuelStrAmount = "-";
                                if (row.isFirstOfDay && fuelByDate[row.dateStr]) {
                                    fuelStrLiters = fuelByDate[row.dateStr].liters.toString();
                                    fuelStrAmount = fuelByDate[row.dateStr].amount.toLocaleString('tr-TR');
                                }
                                const tripUnitPrice = Number(trip.price) > 0 ? Number(trip.price) : unitPrice;
                                const rowTotal = (Number(trip.tonnage) || 0) * tripUnitPrice;
                                return (
                                    <tr key={trip.id || idx} className="border-b border-slate-100/50 hover:bg-slate-50 transition-colors">
                                        <td className="py-1.5 px-1 text-slate-700 whitespace-nowrap">{localDate}</td>
                                        <td className="py-1.5 px-1 text-slate-800 truncate max-w-[75px]">{trip.from}</td>
                                        <td className="py-1.5 px-1 text-slate-800 truncate max-w-[75px]">{trip.to}</td>
                                        <td className="py-1.5 px-1 text-right text-slate-800 font-bold">{Number(trip.tonnage).toFixed(2)}</td>
                                        <td className="py-1.5 px-1 text-center text-slate-600 font-mono tracking-tighter whitespace-nowrap">{vehicleInfo?.plate?.replace(/\s/g, '') || '06FTN692'}</td>
                                        <td className="py-1.5 px-1 text-right text-slate-700">{tripUnitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                        <td className="py-1.5 px-1 text-right text-slate-800 font-bold">{rowTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                        <td className="py-1.5 px-1 text-right text-slate-600">{fuelStrLiters}</td>
                                        <td className="py-1.5 px-1 text-right text-slate-600 font-medium">{fuelStrAmount}</td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan="9" className="py-8 text-center text-[var(--text-secondary)] italic text-sm">Bu periyotta gösterilecek veri bulunamadı.</td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-50 border-y-2 border-slate-300 font-bold text-slate-800">
                                <td colSpan="3" className="py-2 px-1 text-right">TOPLAM SEFER:</td>
                                <td className="py-2 px-1 text-right text-blue-700">{totalTonnage.toFixed(2)}</td>
                                <td colSpan="2"></td>
                                <td className="py-2 px-1 text-right text-blue-700">{subTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                <td className="py-2 px-1 text-right text-red-600/80">{totalFuelLiters > 0 ? totalFuelLiters : ''}</td>
                                <td className="py-2 px-1 text-right text-red-600/80">{totalFuelAmount > 0 ? totalFuelAmount.toLocaleString('tr-TR') : ''}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* Alt Toplamlar & Vergi */}
                <div className="flex justify-between items-start mt-4 gap-4 pb-12">
                    <div className="w-1/2 flex flex-col">
                        <div className="print:hidden mb-1">
                            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">AÇIKLAMALAR / NOT:</span>
                        </div>
                        {note && (
                            <h4 className="hidden print:block text-[10px] font-bold text-slate-800 uppercase mb-1 border-b border-slate-200">AÇIKLAMALAR / NOT</h4>
                        )}
                        <textarea
                            className={`w-full text-xs text-slate-800 bg-slate-50 print:bg-transparent border border-dashed border-slate-200 print:border-none rounded resize-none focus:ring-0 p-2 print:p-0 italic ${!note ? 'print:hidden' : ''}`}
                            rows={3}
                            value={note}
                            onChange={(e) => onChangeNote(e.target.value)}
                            placeholder="Döküme eklemek istediğiniz not..."
                        />
                    </div>

                    <div className="w-2/5 rounded-xl bg-slate-50/50 p-4 border border-slate-200">
                        <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-200">
                            <span className="text-slate-600 font-medium text-[10px]">Tonaj Birim Fiyat:</span>
                            <div className="flex items-center">
                                <span className="text-[var(--text-secondary)] mr-1 text-[10px]">₺</span>
                                <input
                                    type="number"
                                    className="w-14 text-right bg-white border border-slate-200 rounded px-1 py-0.5 text-slate-800 font-bold text-[10px]"
                                    value={unitPrice}
                                    onChange={(e) => onChangeUnitPrice(Number(e.target.value))}
                                />
                            </div>
                        </div>
                        <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-200">
                            <span className="text-slate-600 font-medium text-[10px]">Ara Toplam:</span>
                            <span className="text-slate-800 font-bold text-[10px]">₺{subTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-slate-600 font-medium text-[10px] flex items-center gap-1">
                                KDV (%):
                                <input
                                    type="number"
                                    className="w-8 text-center bg-white border border-slate-200 rounded px-1 py-0.5 text-slate-800 font-bold text-[10px]"
                                    value={taxRate}
                                    onChange={(e) => onChangeTaxRate(Number(e.target.value))}
                                />
                            </span>
                            <span className="text-slate-800 font-medium text-[10px]">₺{taxAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t-2 border-[var(--border-color)] mt-1">
                            <span className="text-blue-900 font-black text-xs">GENEL TOPLAM:</span>
                                <span className="text-blue-900 font-black tracking-tight text-base">₺{grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

A4InvoicePreview.displayName = 'A4InvoicePreview';
export default A4InvoicePreview;

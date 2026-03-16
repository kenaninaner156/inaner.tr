import React, { useContext, useState, useRef, useEffect } from 'react';
import { FileText, Printer, Save, PlusCircle, CheckCircle, Clock, Trash2, StickyNote, Paperclip } from 'lucide-react';
import { DataContext } from '../context/DataContext';
import { useTruck } from '../context/TruckContext';
import InvoicePeriodModal from './InvoicePeriodModal';
import A4InvoicePreview from './A4InvoicePreview';
import FileUpload from './FileUpload';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';

const Invoices = () => {
    const { trips, invoices, addInvoice, updateInvoice, deleteInvoice, addLog, fuelRecords, draftInvoice, saveDraftInvoice, clearDraftInvoice } = useContext(DataContext);
    const { activeTruckData } = useTruck();
    const invoicePrintRef = useRef(null);

    const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);

    // Aktif Düzenlenen Fatura State'i
    const [activeInvoice, setActiveInvoice] = useState(null);
    const [note, setNote] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [noteModalInvoice, setNoteModalInvoice] = useState(null);
    const [modalNote, setModalNote] = useState('');
    const [modalFiles, setModalFiles] = useState([]);
    const [taxRate, setTaxRate] = useState(20); // Default 20%
    const [unitPrice, setUnitPrice] = useState(351.40); // Default Price

    // Sadece Fatura Bekleyen Seferler listesi (Yeni fatura oluşturmak için adaylar)
    const availableTrips = (trips || []).filter(t => !t.deleted && t.status === 'Fatura Bekliyor');

    // Son kesilen faturanın bitiş tarihini bul
    const lastInvoice = (invoices || [])[0];
    const lastInvoiceEndDate = lastInvoice ? lastInvoice.endDate : null;

    // Eski fatura görüntüleme modu
    const [isViewingOldInvoice, setIsViewingOldInvoice] = useState(false);
    const [showOldInvoiceWarning, setShowOldInvoiceWarning] = useState(false);

    // Uyarıyı 3 saniye sonra kapat
    useEffect(() => {
        if (showOldInvoiceWarning) {
            const timer = setTimeout(() => setShowOldInvoiceWarning(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [showOldInvoiceWarning]);

    // Araç (veya şirket) değiştiğinde önizlemeyi sıfırla — F5 gerekmez
    const { activeTruckId } = useTruck();
    useEffect(() => {
        setActiveInvoice(null);
        setIsViewingOldInvoice(false);
        setNote('');
        setTaxRate(20);
        setUnitPrice(351.40);
    }, [activeTruckId]);

    // Fatura listesi değişince aktif görüntülemenin geçerli olup olmadığını kontrol et
    useEffect(() => {
        if (isViewingOldInvoice && activeInvoice) {
            // Eğer görüntülenen fatura artık listede yoksa temizle (ID veya DocId üzerinden kontrol)
            const stillExists = (invoices || []).some(inv =>
                !inv.deleted && (inv.id === activeInvoice.id || (inv.docId && inv.docId === activeInvoice.docId))
            );
            if (!stillExists) {
                setActiveInvoice(null);
                setIsViewingOldInvoice(false);
                setNote('');
            }
        } else if (!activeInvoice && !isViewingOldInvoice) {
            // Önce taslağı yükle, yoksa son faturayı otomatik yükle
            if (draftInvoice) {
                setActiveInvoice(draftInvoice);
                setNote(draftInvoice.note || '');
                setTaxRate(draftInvoice.taxRate ?? 20);
                setUnitPrice(draftInvoice.unitPrice ?? 351.40);
                setIsViewingOldInvoice(false);
            } else {
                const last = (invoices || []).filter(inv => !inv.deleted)[0];
                if (last) {
                    setActiveInvoice(last);
                    setNote(last.note || '');
                    setTaxRate(last.taxRate ?? 20);
                    setUnitPrice(last.unitPrice ?? 351.40);
                    setIsViewingOldInvoice(true);
                    setShowOldInvoiceWarning(true);
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoices]);



    const handleOpenPeriodModal = () => {
        setIsPeriodModalOpen(true);
    };

    const handleSelectPeriod = ({ startDate, endDate, trips: selectedTrips }) => {
        // Yeni taslak oluştur
        const newDraft = {
            id: `TASLAK-${Date.now().toString().slice(-4)}`,
            startDate,
            endDate,
            trips: selectedTrips,
            status: 'Draft',
            note: '',
            taxRate: 20,
            unitPrice: 351.40
        };
        setActiveInvoice(newDraft);
        saveDraftInvoice(newDraft);
        setIsViewingOldInvoice(false);
        setNote('');
        setTaxRate(20);
        setUnitPrice(351.40);
    };

    // Eski faturaya tıklandığında önizleleme yükle
    const handleViewInvoice = (inv) => {
        setActiveInvoice(inv);
        setNote(inv.note || '');
        setTaxRate(inv.taxRate ?? 20);
        setUnitPrice(inv.unitPrice ?? 351.40);
        setIsViewingOldInvoice(true);
        setShowOldInvoiceWarning(true);
    };

    const handleSaveInvoice = async () => {
        if (!activeInvoice || activeInvoice.trips.length === 0) {
            alert("Kaydedilecek sefer bulunamadı.");
            return;
        }

        const totalTonnage = activeInvoice.trips.reduce((acc, t) => acc + (Number(t.tonnage) || 0), 0);
        const subTotal = totalTonnage * unitPrice;
        const taxAmount = subTotal * (taxRate / 100);
        const grandTotal = subTotal + taxAmount;

        const newInvoiceData = {
            startDate: activeInvoice.startDate,
            endDate: activeInvoice.endDate,
            trips: (activeInvoice.trips || []).map(t => ({ id: t.id, date: t.date, from: t.from, to: t.to, tonnage: t.tonnage })),
            totalTonnage,
            subTotal,
            taxRate,
            taxAmount,
            grandTotal,
            note,
            unitPrice,
            status: 'Sent',
            docId: `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(3, '0')}` // Örn: INV-2026-001
        };

        try {
            // Faturayı Firebase'e ekle
            await addInvoice(newInvoiceData);

            // Faturası kesilen seferlerin status'ünü 'Fatura Kesildi' yap. (Batch Update)
            const batch = writeBatch(db);
            activeInvoice.trips.forEach(trip => {
                const tripRef = doc(db, 'trips', trip.id);
                batch.update(tripRef, { status: 'Fatura Kesildi' });
            });
            await batch.commit();
            await clearDraftInvoice();

            addLog('FATURA_KESILDI', `${activeInvoice.startDate} - ${activeInvoice.endDate} periyodu için fatura başarıyla kesildi.`);

            // Faturayı ekranda tut ve 'Sent' durumuna çek
            setActiveInvoice({ ...newInvoiceData, id: newInvoiceData.docId });
            setIsViewingOldInvoice(false);
        } catch {
            
            alert("Fatura kaydedilirken bir hata oluştu.");
        }
    };

    const handleDeleteInvoice = async (invoiceId, docId, e) => {
        e.stopPropagation();

        // Mobil kontrolü (768px altı)
        const isMobile = window.innerWidth < 768;

        if (isMobile || window.confirm(`${docId} numaralı faturayı/dökümü silmek istediğinize emin misiniz? (Bağlı seferler faturası kesilmemiş hale dönecektir)`)) {
            try {
                // Faturayı siliyoruz (Soft Delete)
                await deleteInvoice(invoiceId);

                // Bu faturaya bağlı olan seferleri bulup statülerini "Fatura Bekliyor" olarak geri alıyoruz
                const linkedInvoice = invoices.find(inv => inv.id === invoiceId);
                if (linkedInvoice && linkedInvoice.trips) {
                    const batch = writeBatch(db);
                    linkedInvoice.trips.forEach(trip => {
                        const tripRef = doc(db, 'trips', trip.id);
                        batch.update(tripRef, { status: 'Fatura Bekliyor' });
                    });
                    await batch.commit();
                }
            } catch { /* empty */ }
        }
    };

    const handlePrintPDF = () => {
        if (!invoicePrintRef.current) return;

        // Sadece A4 alanını yazdırmak için geçici bir iframe veya window.print yöntemi kullanılabilir.
        // Tailwind classları yazıcıya geçerken bozulmasın diye modern tarayıcılarda direk body gizlenip sadece bu ref de yazdırılabilir.

        const printContent = invoicePrintRef.current;

        // CSS in Js trick to print just the component
        const printWindow = window.open('', '', 'width=900,height=1200');
        printWindow.document.write('<html><head><title>Fatura Yazdır</title>');
        // Load all current stylesheets
        const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
        styles.forEach(s => {
            printWindow.document.write(s.outerHTML);
        });
        printWindow.document.write('</head><body style="background-color: white;">');
        printWindow.document.write(printContent.outerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500); // Wait for styles to load
    };

    return (
        <div className="flex flex-col md:flex-row md:h-[calc(100vh-64px)] gap-6 md:gap-8 animate-in fade-in duration-500 overflow-y-auto md:overflow-hidden pb-4 md:pb-0">

            {/* Sol Panel: Kontrol Merkezi */}
            <div className="w-full md:w-[45%] lg:w-[40%] flex flex-col gap-4 md:gap-6 md:overflow-y-auto custom-scrollbar md:pr-2">

                {/* Masüstü İzole Başlık (App.jsx'teki global başlığın yerini alır) */}
                <div className="hidden md:flex glass-panel px-6 py-4 items-center justify-between shadow-sm border-b border-[var(--border-color)] backdrop-blur-md rounded-2xl shrink-0">
                    <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mb-0.5">Fatura Durumu</h2>
                </div>



                <div className="glass-panel p-6">
                    <button
                        onClick={handleOpenPeriodModal}
                        className="w-full bg-brand-600 hover:bg-brand-500 text-[var(--text-primary)] p-3 rounded-lg font-bold flex items-center justify-center transition-all shadow-lg shadow-brand-500/20"
                    >
                        <PlusCircle className="mr-2" size={20} /> Yeni Fatura Periyodu Seç
                    </button>
                    {activeInvoice && activeInvoice.status === 'Draft' && (
                        <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg group">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="flex items-center text-emerald-400 font-semibold">
                                    <Clock size={16} className="mr-2" /> İşlem Bekleyen Taslak
                                </h4>
                                <button
                                    onClick={() => {
                                        if (window.confirm("Taslağı iptal etmek istediğinize emin misiniz?")) {
                                            clearDraftInvoice();
                                            setActiveInvoice(null);
                                        }
                                    }}
                                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                >
                                    İptal Et
                                </button>
                            </div>
                            <p className="text-sm text-[var(--text-primary)]">
                                {new Date(activeInvoice.startDate).toLocaleDateString('tr-TR')} - {new Date(activeInvoice.endDate).toLocaleDateString('tr-TR')}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">{activeInvoice.trips.length} sefer seçildi.</p>
                        </div>
                    )}

                    {/* Aktif Fatura Aksiyonları (PDF, Onayla vb.) */}
                    {activeInvoice && (
                        <div className="mt-4 flex flex-col gap-2">
                            <button
                                onClick={handlePrintPDF}
                                className="w-full flex items-center justify-center gap-2 p-3 bg-slate-700 hover:bg-slate-600 text-[var(--text-primary)] rounded-xl text-sm font-medium transition-colors"
                            >
                                <Printer size={16} /> PDF İndir / Yazdır
                            </button>
                            {activeInvoice.status === 'Sent' ? (
                                <button
                                    disabled
                                    className="w-full flex items-center justify-center gap-2 p-3 bg-[var(--bg-panel-hover)] text-emerald-400 rounded-xl text-sm font-medium border border-emerald-500/30 opacity-80"
                                >
                                    <CheckCircle size={16} /> Fatura Onaylandı
                                </button>
                            ) : (
                                <button
                                    onClick={handleSaveInvoice}
                                    className="w-full flex items-center justify-center gap-2 p-3 bg-emerald-600 hover:bg-emerald-500 text-[var(--text-primary)] rounded-xl text-sm font-medium transition-colors border border-emerald-500 shadow-lg shadow-emerald-500/20"
                                >
                                    <Save size={16} /> Faturayı Kes & Onayla
                                </button>
                            )}
                        </div>
                    )}


                    {/* Yetim Sefer Uyarısı */}

                </div>

                {/* Geçmiş Faturalar Listesi */}
                <div className="glass-panel flex-1 min-h-0 flex flex-col">
                    <div className="p-4 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-panel)] backdrop-blur z-10 rounded-t-xl">
                        <h4 className="font-bold text-[var(--text-primary)] flex items-center">
                            <CheckCircle className="mr-2 text-brand-400" size={18} />
                            Tamamlanan Faturalar
                        </h4>
                    </div>
                    <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-3">
                        {(invoices || []).length > 0 ? (invoices || []).filter(inv => !inv.deleted).map(inv => (
                            <div
                                key={inv.id}
                                onClick={() => handleViewInvoice(inv)}
                                className={`p-3 bg-white/5 hover:bg-white/10 border rounded-lg transition-colors group relative cursor-pointer ${activeInvoice?.id === inv.id && isViewingOldInvoice ? 'border-amber-400/50 bg-amber-400/5' : 'border-[var(--border-color)]'
                                    }`}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-brand-400 text-sm">{inv.docId}</span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-[var(--text-secondary)]">{new Date(inv.endDate).toLocaleDateString('tr-TR')}</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setNoteModalInvoice(inv); setModalNote(inv.note || ''); setModalFiles(inv.files || []); }}
                                            className={`p-1 rounded transition-colors ${inv.note || inv.files?.length > 0 ? 'text-brand-400' : 'text-slate-600 hover:text-brand-400 md:opacity-0 group-hover:opacity-100'}`}
                                            title="Not & Belge Ekle"
                                        >
                                            <StickyNote size={13} />
                                        </button>
                                        <button
                                            onClick={(e) => handleDeleteInvoice(inv.id, inv.docId, e)}
                                            className="text-slate-500 hover:text-red-400 p-1 md:opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Faturayı Sil"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                <div className="text-sm text-[var(--text-primary)] font-medium">₺{inv.grandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                                <div className="text-xs text-slate-500 mt-1">{inv.trips?.length || 0} Sefer | {inv.totalTonnage?.toFixed(2)} Ton
                                    {(inv.note || inv.files?.length > 0) && <span className="ml-2 text-brand-400">📎 {inv.files?.length || 0}{inv.note ? ' · not' : ''}</span>}
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-8 text-slate-500 text-sm">
                                <FileText size={24} className="mx-auto mb-2 opacity-50" />
                                Henüz kesilmiş fatura yok.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Sağ Panel: A4 Fatura Görünümü */}
            <div className="w-full md:w-[55%] lg:w-[60%] relative flex flex-col overflow-hidden md:min-h-0 pl-0 md:pl-4" style={{ minHeight: '70vh' }}>
                {/* A4 Render Alanı (Çerçevesiz ve temiz alan) */}
                <div className="w-full relative overflow-hidden flex flex-col" style={{ flex: 1, minHeight: '70vh' }}>
                    {activeInvoice ? (
                        <A4InvoicePreview
                            ref={invoicePrintRef}
                            invoiceData={activeInvoice}
                            vehicleInfo={{ plate: activeTruckData?.plate, trailerPlate: activeTruckData?.trailerPlate }}
                            note={note}
                            onChangeNote={setNote}
                            taxRate={taxRate}
                            onChangeTaxRate={setTaxRate}
                            unitPrice={unitPrice}
                            onChangeUnitPrice={setUnitPrice}
                            fuelRecords={fuelRecords}
                        />
                    ) : (
                        <div className="text-center flex flex-col items-center justify-center text-slate-500 pt-20">
                            <FileText size={48} className="mb-4 opacity-30" />
                            <p className="text-lg font-medium text-[var(--text-primary)] mb-2">Önizleme Yok</p>
                            <p className="text-sm">Sol taraftaki menüden "Yeni Fatura Periyodu Seç" butonuna tıklayarak taslak oluşturun.</p>
                        </div>
                    )}
                </div>
            </div>

            <InvoicePeriodModal
                isOpen={isPeriodModalOpen}
                onClose={() => setIsPeriodModalOpen(false)}
                trips={availableTrips}
                allTrips={trips}
                lastInvoiceEndDate={lastInvoiceEndDate}
                onSelectPeriod={handleSelectPeriod}
                fuelRecords={fuelRecords}
            />

            {/* Not & Belge Modal */}
            {noteModalInvoice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setNoteModalInvoice(null)}>
                    <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <StickyNote size={16} className="text-brand-400" />
                                {noteModalInvoice.docId} — Not & Belge
                            </h3>
                            <button onClick={() => setNoteModalInvoice(null)} className="text-slate-500 hover:text-[var(--text-primary)] transition-colors">✕</button>
                        </div>
                        <textarea
                            rows={4}
                            placeholder="Not ekle... (örn: ödeme tarihi, onay notu, müşteri yorumu)"
                            className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm resize-none outline-none focus:border-brand-500"
                            value={modalNote}
                            onChange={e => setModalNote(e.target.value)}
                        />
                        <div>
                            <p className="text-xs text-slate-500 mb-2 flex items-center gap-1"><Paperclip size={11} /> Onay Belgesi / Fotoğraf / PDF</p>
                            <FileUpload files={modalFiles} onChange={setModalFiles} maxSizeMB={10} />
                        </div>
                        <button
                            onClick={async () => {
                                setIsSavingNote(true);
                                try {
                                    await updateInvoice(noteModalInvoice.id, { note: modalNote, files: modalFiles });
                                    addLog('FATURA_NOT', `${noteModalInvoice.docId} notları güncellendi`);
                                    setNoteModalInvoice(null);
                                } catch { /* empty */ }
                                setIsSavingNote(false);
                            }}
                            disabled={isSavingNote}
                            className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-[var(--text-primary)] py-2.5 rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2"
                        >
                            <Save size={14} /> {isSavingNote ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Invoices;

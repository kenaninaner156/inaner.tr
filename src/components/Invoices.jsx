import React, { useContext, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Printer, Save, PlusCircle, CheckCircle, Clock, Trash2, StickyNote, Paperclip } from 'lucide-react';
import { DataContext } from '../context/DataContext';
import { useTruck } from '../context/TruckContext';
import InvoicePeriodModal from './InvoicePeriodModal';
import A4InvoicePreview from './A4InvoicePreview';
import FileUpload from './FileUpload';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { sendDiscordAlert } from '../services/discordWebhook';

// PDF Görüntüleme Bileşeni
const PdfViewer = ({ files }) => {
    return (
        <div className="w-full flex flex-col rounded-xl overflow-hidden border border-[var(--border-color)] shadow-lg" style={{ height: '100%' }}>
            {/* Custom dark header */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 shrink-0"
                style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-color)' }}>
                <FileText size={14} className="text-red-400 shrink-0" />
                <span className="text-sm font-semibold text-[var(--text-primary)] truncate flex-1">
                    {files[0]?.name || 'Fatura Belgesi'}
                </span>
                {files.length > 1 && (
                    <span className="text-xs text-slate-500 shrink-0">{files.length} dosya</span>
                )}
            </div>
            {/* iframe: base64 data URL + navpanes=0 sidebar kapalı */}
            <div style={{ minHeight: 0, overflow: 'hidden', flex: 1, position: 'relative' }}>
                {files.map((f, i) => (
                    <iframe
                        key={i}
                        src={`${f.data}#toolbar=0&navpanes=0&view=FitH`}
                        title={f.name || `Ek ${i + 1}`}
                        scrolling="no"
                        style={{
                            display: 'block',
                            position: 'absolute',
                            top: 0, left: 0,
                            width: 'calc(100% + 17px)',
                            height: '100%',
                            border: 'none',
                        }}
                    />
                ))}
            </div>
            {/* Alt bilgi */}
            <div className="text-center text-[10px] text-slate-600 py-1.5 shrink-0"
                style={{ background: 'var(--bg-panel)', borderTop: '1px solid var(--border-color)' }}>
                Sefer dökümüne dönmek için fatura kartına tekrar tıklayın
            </div>
        </div>
    );
};

const Invoices = () => {
    const { trips, invoices, addInvoice, updateInvoice, deleteInvoice, addLog, fuelRecords, draftInvoice, saveDraftInvoice, clearDraftInvoice } = useContext(DataContext);
    const { activeTruckData } = useTruck();
    const invoicePrintRef = useRef(null);

    const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);

    // Aktif Düzenlenen Fatura State'i
    const [activeInvoice, setActiveInvoice] = useState(null);
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [noteModalInvoice, setNoteModalInvoice] = useState(null);
    const [modalNote, setModalNote] = useState('');
    const [modalFiles, setModalFiles] = useState([]);
    const [netPrice, setNetPrice] = useState(0); // Net fiyat (manuel girilecek)
    // viewMode: 'sefer' | 'pdf' — tamamlanan fatura görüntüleme modu
    const [viewMode, setViewMode] = useState('sefer');
    const [viewModeInvId, setViewModeInvId] = useState(null); // hangi faturanın PDF’si görüntüleniyor

    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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
        setNetPrice(0);
        setViewMode('sefer');
        setViewModeInvId(null);
    }, [activeTruckId]);

    // Fatura listesi değişince aktif görüntülemenin geçerli olup olmadığını kontrol et
    useEffect(() => {
        if (isViewingOldInvoice && activeInvoice) {
            const stillExists = (invoices || []).some(inv =>
                !inv.deleted && (inv.id === activeInvoice.id || (inv.docId && inv.docId === activeInvoice.docId))
            );
            if (!stillExists) {
                setActiveInvoice(null);
                setIsViewingOldInvoice(false);
            }
        } else if (!activeInvoice && !isViewingOldInvoice) {
            if (draftInvoice) {
                setActiveInvoice(draftInvoice);
                setNetPrice(draftInvoice.grandTotal ?? 0);
                setIsViewingOldInvoice(false);
            } else {
                const last = (invoices || []).filter(inv => !inv.deleted)[0];
                if (last) {
                    setActiveInvoice(last);
                    setNetPrice(last.grandTotal ?? 0);
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
        };
        setActiveInvoice(newDraft);
        saveDraftInvoice(newDraft);
        setIsViewingOldInvoice(false);
        setNetPrice(0);
        setViewMode('sefer');
        setViewModeInvId(null);
    };

    // Eski faturaya tıklandığında önizlele
    const handleViewInvoice = (inv) => {
        if (activeInvoice?.id === inv.id && isViewingOldInvoice) {
            // Aynı faturaya tekrar tıklandı: PDF varsa toggle
            const hasPdf = inv.files && inv.files.length > 0;
            if (hasPdf) {
                setViewMode(vm => vm === 'sefer' ? 'pdf' : 'sefer');
                setViewModeInvId(inv.id);
            }
            return;
        }
        setActiveInvoice(inv);
        setNetPrice(inv.grandTotal ?? 0);
        setIsViewingOldInvoice(true);
        setShowOldInvoiceWarning(true);
        setViewMode('sefer');
        setViewModeInvId(inv.id);
    };

    const handleSaveInvoice = async () => {
        if (!activeInvoice || activeInvoice.trips.length === 0) {
            alert("Kaydedilecek sefer bulunamadı.");
            return;
        }

        const totalTonnage = activeInvoice.trips.reduce((acc, t) => acc + (Number(t.tonnage) || 0), 0);

        const newInvoiceData = {
            startDate: activeInvoice.startDate,
            endDate: activeInvoice.endDate,
            trips: (activeInvoice.trips || []).map(t => ({ id: t.id, date: t.date, from: t.from, to: t.to, tonnage: t.tonnage })),
            totalTonnage,
            grandTotal: netPrice || 0,
            status: 'Sent',
            docId: `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(3, '0')}`
        };

        try {
            await addInvoice(newInvoiceData);

            const batch = writeBatch(db);
            activeInvoice.trips.forEach(trip => {
                const tripRef = doc(db, 'trips', trip.id);
                batch.update(tripRef, { status: 'Fatura Kesildi' });
            });
            await batch.commit();
            await clearDraftInvoice();

            // F1: Fatura kesildi bildirimi
            sendDiscordAlert({
              type: 'success',
              title: '🧾 Yeni Fatura Kesildi',
              description: 'Fatura başarıyla oluşturuldu.',
              fields: [
                { name: '🏢 Firma', value: String(newInvoiceData?.customer || newInvoiceData?.company || '—'), inline: true },
                { name: '💰 Tutar', value: String(newInvoiceData?.grandTotal || '—') + ' ₺', inline: true },
              ]
            });

            addLog('FATURA_KESILDI', `${activeInvoice.startDate} - ${activeInvoice.endDate} periyodu için fatura başarıyla kesildi.`);

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
                const deletedInvoice = invoices.find(inv => inv.id === invoiceId);
                await deleteInvoice(invoiceId);

                // F2: Fatura silme bildirimi
                sendDiscordAlert({
                  type: 'danger',
                  title: '🗑️ Fatura Silindi',
                  description: 'Bir fatura kaydı silindi.',
                  fields: [
                    { name: '💰 Tutar', value: String(deletedInvoice?.grandTotal || deletedInvoice?.amount || deletedInvoice?.total || '—') + ' ₺', inline: true },
                  ]
                });

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
                <div className="hidden md:flex glass-panel px-4 py-3 items-center justify-between shadow-sm border-b border-[var(--border-color)] backdrop-blur-md rounded-2xl shrink-0">
                    <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">Fatura Durumu</h2>
                </div>



                <div className="glass-panel p-4 overflow-hidden relative">
                    {/* Arka plan animasyon efekti */}
                    <div className="absolute -right-10 -top-10 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full pointer-events-none"></div>
                    
                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleOpenPeriodModal}
                        className="relative w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 py-2.5 px-4 rounded-xl font-semibold flex items-center justify-center transition-all duration-300 shadow-sm hover:shadow-[0_4px_20px_rgba(16,185,129,0.15)] text-sm group overflow-hidden border border-emerald-500/20"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
                        <PlusCircle className="mr-2 relative z-10 transition-transform duration-300 group-hover:scale-110" size={17} /> 
                        <span className="relative z-10 tracking-wide">Yeni Fatura Periyodu Seç</span>
                    </motion.button>
                    <AnimatePresence>
                        {activeInvoice && activeInvoice.status === 'Draft' && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0, marginTop: 0 }} 
                                animate={{ opacity: 1, height: 'auto', marginTop: 12 }} 
                                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl relative overflow-hidden">
                                    <motion.div 
                                        animate={{ opacity: [0.2, 0.4, 0.2] }} 
                                        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                                        className="absolute top-0 right-0 w-24 h-24 bg-emerald-400/5 blur-2xl rounded-full pointer-events-none"
                                    />
                                    <div className="flex justify-between items-center mb-1 relative z-10">
                                        <h4 className="flex items-center text-emerald-400 font-semibold text-sm">
                                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 4, ease: "linear" }}>
                                                <Clock size={14} className="mr-1.5" />
                                            </motion.div>
                                            İşlem Bekleyen Taslak
                                        </h4>
                                        <button
                                            onClick={() => setShowCancelConfirm(true)}
                                            className="text-xs bg-red-500/10 px-2 py-1 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors"
                                        >
                                            İptal Et
                                        </button>
                                    </div>
                                    <p className="text-xs text-[var(--text-primary)] relative z-10">
                                        {new Date(activeInvoice.startDate).toLocaleDateString('tr-TR')} - {new Date(activeInvoice.endDate).toLocaleDateString('tr-TR')}
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-0.5 relative z-10">{activeInvoice.trips.length} sefer seçildi.</p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Aktif Fatura Aksiyonları */}
                    {activeInvoice && (
                        <div className="mt-3 flex flex-row gap-2">
                            <button
                                onClick={handlePrintPDF}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-slate-700 hover:bg-slate-600 text-[var(--text-primary)] rounded-lg text-xs font-medium transition-colors"
                            >
                                <Printer size={14} /> PDF İndir
                            </button>
                            {activeInvoice.status === 'Sent' ? (
                                <button disabled className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-[var(--bg-panel-hover)] text-emerald-400 rounded-lg text-xs font-medium border border-emerald-500/30 opacity-80">
                                    <CheckCircle size={14} /> Onaylandı
                                </button>
                            ) : (
                                <button
                                    onClick={handleSaveInvoice}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-emerald-600 hover:bg-emerald-500 text-[var(--text-primary)] rounded-lg text-xs font-medium transition-colors border border-emerald-500 shadow-lg shadow-emerald-500/20"
                                >
                                    <Save size={14} /> Kes & Onayla
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Geçmiş Faturalar Listesi */}
                <div className="glass-panel flex-1 min-h-0 flex flex-col">
                    <div className="p-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-panel)] backdrop-blur z-10 rounded-t-xl">
                        <h4 className="font-bold text-[var(--text-primary)] flex items-center text-sm">
                            <CheckCircle className="mr-2 text-emerald-400" size={16} />
                            Tamamlanan Faturalar
                        </h4>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto custom-scrollbar space-y-2 relative">
                        {(invoices || []).length > 0 ? (invoices || []).filter(inv => !inv.deleted).map((inv) => {
                            const isActive = activeInvoice?.id === inv.id && isViewingOldInvoice;
                            return (
                            <button
                                key={inv.id}
                                onClick={() => handleViewInvoice(inv)}
                                className={`w-full text-left p-3 rounded-xl transition-all duration-300 group relative cursor-pointer outline-none overflow-hidden block ${isActive ? 'border-transparent' : 'border border-[var(--border-color)] bg-white/5 hover:bg-white/10'}`}
                            >
                                {!isActive && <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-300 -z-10" />}
                                {isActive && (
                                  <motion.div layoutId="invoice-active-apple"
                                    className={`absolute inset-0 bg-gradient-to-br rounded-xl border ${viewMode === 'pdf' ? 'from-indigo-500/10 to-indigo-600/5 border-indigo-500/30 shadow-[0_2px_15px_rgba(99,102,241,0.15)]' : 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/30 shadow-[0_2px_15px_rgba(16,185,129,0.15)]'}`}
                                    style={{ zIndex: 0 }} initial={false}
                                    transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.8 }}
                                  />
                                )}
                                
                                <div className="relative z-10 flex flex-col gap-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <span 
                                            className={`font-semibold text-sm transition-colors ${isActive ? (viewMode === 'pdf' ? 'text-indigo-300' : 'text-emerald-400') : 'text-slate-300 group-hover:text-emerald-400'}`}
                                        >
                                            {inv.docId}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <span className={`text-xs transition-colors ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>{new Date(inv.endDate).toLocaleDateString('tr-TR')}</span>
                                            {inv.files?.length > 0 && (
                                                <span className={`${isActive ? 'text-indigo-300' : 'text-emerald-500/60'}`} title="PDF eki var">
                                                    <Paperclip size={12} />
                                                </span>
                                            )}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setNoteModalInvoice(inv); setModalNote(inv.note || ''); setModalFiles(inv.files || []); }}
                                                className={`p-1 rounded transition-colors ${inv.note || inv.files?.length > 0 ? (isActive ? 'text-white hover:text-emerald-300' : 'text-emerald-500/80') : (isActive ? 'text-white/50 hover:text-white' : 'text-slate-600 hover:text-emerald-400')}`}
                                                title="Düzenle / Not & Belge"
                                            >
                                                <StickyNote size={14} />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteInvoice(inv.id, inv.docId, e)}
                                                className={`p-1 transition-colors ${isActive ? 'text-white/50 hover:text-red-400' : 'text-slate-500 hover:text-red-400'}`}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <motion.div 
                                        className={`text-sm font-semibold tracking-wide mt-0.5 ${isActive ? 'text-white drop-shadow-md' : 'text-[var(--text-primary)]'}`}
                                        animate={{ scale: isActive ? 1.02 : 1, originX: 0 }}
                                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                    >
                                        ₺{inv.grandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                    </motion.div>
                                    <div className={`text-xs mt-0.5 transition-colors ${isActive ? 'text-white/60' : 'text-slate-500'}`}>{inv.trips?.length || 0} Sefer | {inv.totalTonnage?.toFixed(2)} Ton</div>
                                </div>
                            </button>
                            )
                        }) : (
                            <div className="text-center py-8 text-slate-500 text-sm absolute inset-0 flex flex-col items-center justify-center">
                                <FileText size={24} className="mx-auto mb-2 opacity-50" />
                                Henüz kesilmiş fatura yok.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Sağ Panel: A4 Fatura Görünümü veya Ek PDF */}
            <div className="w-full md:w-[55%] lg:w-[60%] relative flex flex-col overflow-hidden md:min-h-0 pl-0 md:pl-4" style={{ minHeight: '70vh' }}>
                <div className="w-full relative overflow-hidden flex flex-col" style={{ flex: 1, minHeight: '70vh' }}>
                    {activeInvoice ? (
                        viewMode === 'pdf' && activeInvoice.files && activeInvoice.files.length > 0 ? (
                            <div className="absolute inset-0">
                                <PdfViewer files={activeInvoice.files} />
                            </div>
                        ) : (
                            <A4InvoicePreview
                                ref={invoicePrintRef}
                                invoiceData={activeInvoice}
                                vehicleInfo={{ plate: activeTruckData?.plate, trailerPlate: activeTruckData?.trailerPlate }}
                                netPrice={netPrice}
                                onChangeNetPrice={setNetPrice}
                                onSavePrice={activeInvoice?.status === 'Sent' && isViewingOldInvoice ? async () => {
                                    await updateInvoice(activeInvoice.id, { grandTotal: netPrice });
                                    addLog('FATURA_FIYAT', `${activeInvoice.docId} net fiyat güncellendi: ₺${netPrice?.toLocaleString('tr-TR')}`);
                                    // F3: Fatura güncelleme bildirimi
                                    sendDiscordAlert({
                                      type: 'info',
                                      title: '✏️ Fatura Güncellendi',
                                      description: 'Fatura bilgileri değiştirildi.',
                                    });
                                } : undefined}
                                fuelRecords={fuelRecords}
                            />
                        )
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

            {/* Hızlı Not Modal */}
            {noteModalInvoice && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setNoteModalInvoice(null)}>
                    <div className="bg-[#0f1117] rounded-2xl border border-emerald-500/20 shadow-2xl shadow-emerald-900/20 w-full max-w-lg overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center px-5 py-4 border-b border-white/5">
                            <h3 className="font-bold flex items-center gap-2.5 text-[var(--text-primary)]">
                                <span className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
                                    <StickyNote size={14} className="text-emerald-400" />
                                </span>
                                <span>{noteModalInvoice.docId} <span className="text-slate-500 font-normal">— Düzenle</span></span>
                            </h3>
                            <button onClick={() => setNoteModalInvoice(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all text-lg">&times;</button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1"><Save size={11} /> Net Fiyat (₺)</p>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={noteModalInvoice._editPrice ?? noteModalInvoice.grandTotal ?? 0}
                                    onChange={(e) => setNoteModalInvoice(prev => ({ ...prev, _editPrice: parseFloat(e.target.value) || 0 }))}
                                    className="w-full bg-white/5 border border-white/10 focus:border-emerald-500/40 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1.5">Not</p>
                                <textarea
                                    value={modalNote}
                                    onChange={(e) => setModalNote(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 focus:border-emerald-500/40 rounded-lg p-3 text-sm text-[var(--text-primary)] placeholder-slate-600 outline-none min-h-[80px] resize-none transition-colors"
                                    placeholder="Not ekle... (ödeme tarihi, onay notu vb.)"
                                />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-2 flex items-center gap-1"><Paperclip size={11} /> Onay Belgesi / Fotoğraf / PDF</p>
                                <FileUpload files={modalFiles} onChange={setModalFiles} maxSizeMB={10} />
                            </div>
                        </div>
                        <div className="px-5 py-4 border-t border-white/5 flex justify-end gap-3">
                            <button
                                onClick={() => setNoteModalInvoice(null)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
                            >
                                İptal
                            </button>
                            <button
                                onClick={async () => {
                                    setIsSavingNote(true);
                                    try {
                                        const newPrice = noteModalInvoice._editPrice ?? noteModalInvoice.grandTotal ?? 0;
                                        await updateInvoice(noteModalInvoice.id, { note: modalNote, files: modalFiles, grandTotal: newPrice });
                                        if (activeInvoice?.id === noteModalInvoice.id) setNetPrice(newPrice);
                                        addLog('FATURA_NOT', `${noteModalInvoice.docId} güncellendi`);
                                        // F3: Fatura güncelleme bildirimi
                                        sendDiscordAlert({
                                          type: 'info',
                                          title: '✏️ Fatura Güncellendi',
                                          description: 'Fatura bilgileri değiştirildi.',
                                        });
                                        setNoteModalInvoice(null);
                                    } catch (err) {
                                        console.error("Fatura güncellenirken hata oluştu:", err);
                                        alert("Kaydedilemedi: " + (err.message || err));
                                    }
                                    setIsSavingNote(false);
                                }}
                                disabled={isSavingNote}
                                className="px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-lg shadow-emerald-900/40 disabled:opacity-50"
                            >
                                {isSavingNote ? 'Kaydediliyor...' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Taslak İptal Onay Modalı */}
            {showCancelConfirm && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] shadow-2xl w-full max-w-sm overflow-hidden flex flex-col p-6 text-center animate-in zoom-in-95 duration-200">
                        <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                            <Trash2 className="text-red-400" size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Taslağı İptal Et</h3>
                        <p className="text-slate-400 text-sm mb-6">İşlem bekleyen taslağı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.</p>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCancelConfirm(false)}
                                className="flex-1 py-2.5 rounded-lg font-bold w-full text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all text-sm"
                            >
                                Vazgeç
                            </button>
                            <button
                                onClick={() => {
                                    clearDraftInvoice();
                                    setActiveInvoice(null);
                                    setShowCancelConfirm(false);
                                }}
                                className="flex-1 py-2.5 rounded-lg font-bold w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-all text-sm"
                            >
                                Evet, İptal Et
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Invoices;

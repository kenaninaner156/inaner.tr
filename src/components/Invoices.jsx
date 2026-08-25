import React, { useContext, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Printer, Save, PlusCircle, CheckCircle, Clock, Trash2, StickyNote, Paperclip, Menu } from 'lucide-react';
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
        <div className="w-full flex flex-col rounded-xl overflow-hidden border border-white/10 shadow-lg" style={{ height: '100%' }}>
            {/* Custom dark header */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 shrink-0 bg-[#0c1017] border-b border-white/10">
                <FileText size={14} className="text-red-400 shrink-0" />
                <span className="text-sm font-semibold text-slate-200 truncate flex-1">
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
            <div className="text-center text-[10px] text-slate-500 py-1.5 shrink-0 bg-[#0c1017] border-t border-white/10">
                Sefer dökümüne dönmek için fatura kartına tekrar tıklayın
            </div>
        </div>
    );
};

const Invoices = ({ onOpenMenu, isMobile } = {}) => {
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
        const isMobileDevice = window.innerWidth < 768;

        if (isMobileDevice || window.confirm(`${docId} numaralı faturayı/dökümü silmek istediğinize emin misiniz? (Bağlı seferler faturası kesilmemiş hale dönecektir)`)) {
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

        const printContent = invoicePrintRef.current;

        const printWindow = window.open('', '', 'width=900,height=1200');
        printWindow.document.write('<html><head><title>Fatura Yazdır</title>');
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
        }, 500);
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-500 relative pb-ios-nav">
            {/* ─── ENTEGRE TEK SATIR HEADER BAR ─── */}
            <div 
                className="flex items-center justify-between gap-3 pb-2 border-b border-white/[0.06]"
                style={{
                    paddingTop: 'calc(0.2rem + env(safe-area-inset-top, 0px))'
                }}
            >
                {/* Sol Grup: Hamburger (Mobil) + Başlık */}
                <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
                    {isMobile && onOpenMenu && (
                        <button 
                            onClick={onOpenMenu} 
                            className="p-1.5 -ml-1 text-slate-400 hover:text-slate-100 transition-colors flex items-center justify-center cursor-pointer rounded-lg hover:bg-white/5"
                            title="Menüyü Aç"
                        >
                            <Menu size={22} />
                        </button>
                    )}
                    
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap">
                        Fatura Durumu
                    </h2>
                </div>

                {/* Sağ Aksiyon: Yeni Periyot Seç */}
                <button
                    type="button"
                    onClick={handleOpenPeriodModal}
                    className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs sm:text-sm font-bold transition-all shadow-md shadow-emerald-600/25 border border-emerald-400/30 cursor-pointer"
                >
                    <PlusCircle size={15} />
                    <span>Yeni Fatura Periyodu Seç</span>
                </button>
            </div>

            {/* ─── İKİ SÜTÜN DÜZEN (Sol: Kontrol & Liste, Sağ: A4 Önizleme) ─── */}
            <div className="flex flex-col md:flex-row md:h-[calc(100vh-140px)] gap-4 md:gap-6 overflow-y-auto md:overflow-hidden">
                {/* Sol Panel: Kontrol Merkezi & Liste */}
                <div className="w-full md:w-[42%] lg:w-[38%] flex flex-col gap-3 md:overflow-y-auto custom-scrollbar md:pr-1">
                    
                    {/* Aktif Fatura & Taslak Bilgi Kartı */}
                    {activeInvoice && (
                        <div className="p-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-md relative overflow-hidden space-y-2.5">
                            {activeInvoice.status === 'Draft' ? (
                                <div className="flex justify-between items-center bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                                    <div className="flex items-center gap-2">
                                        <Clock size={14} className="text-amber-400 animate-spin" />
                                        <span className="text-xs font-bold text-amber-300">İşlem Bekleyen Taslak</span>
                                    </div>
                                    <button
                                        onClick={() => setShowCancelConfirm(true)}
                                        className="text-[11px] px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors font-medium cursor-pointer"
                                    >
                                        İptal Et
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono font-bold text-emerald-400">{activeInvoice.docId}</span>
                                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 font-bold border border-emerald-500/20">
                                            Aktif Seçim
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-slate-400 font-mono">
                                        {activeInvoice.endDate ? new Date(activeInvoice.endDate).toLocaleDateString('tr-TR') : ''}
                                    </span>
                                </div>
                            )}

                            {/* Tutar & Sefer Özeti */}
                            <div className="flex items-baseline justify-between pt-1">
                                <div>
                                    <p className="text-[11px] text-slate-400 font-medium">Fatura Tutarı</p>
                                    <p className="text-lg font-bold font-mono text-white">
                                        ₺{(netPrice || activeInvoice.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[11px] text-slate-400 font-medium">Hacim</p>
                                    <p className="text-xs font-mono text-slate-200">
                                        {activeInvoice.trips?.length || 0} Sefer · {(activeInvoice.totalTonnage || 0).toFixed(2)} Ton
                                    </p>
                                </div>
                            </div>

                            {/* Hızlı Aksiyon Butonları */}
                            <div className="flex gap-2 pt-1 border-t border-white/[0.05]">
                                <button
                                    type="button"
                                    onClick={handlePrintPDF}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white/[0.04] hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                                >
                                    <Printer size={13} />
                                    <span>PDF İndir</span>
                                </button>

                                {activeInvoice.status === 'Sent' ? (
                                    <button disabled type="button" className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-500/10 text-emerald-400 rounded-xl text-xs font-semibold border border-emerald-500/20 opacity-90 cursor-default">
                                        <CheckCircle size={13} />
                                        <span>Onaylandı</span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleSaveInvoice}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all border border-emerald-400/30 shadow-md shadow-emerald-600/20 cursor-pointer"
                                    >
                                        <Save size={13} />
                                        <span>Kes & Onayla</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Geçmiş Faturalar Listesi */}
                    <div className="p-3 sm:p-4 rounded-2xl border border-white/[0.07] bg-white/[0.015] backdrop-blur-md flex-1 min-h-0 flex flex-col space-y-2">
                        <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
                            <div className="flex items-center gap-2">
                                <CheckCircle size={15} className="text-emerald-400" />
                                <h4 className="font-bold text-xs sm:text-sm text-slate-200">Tamamlanan Faturalar</h4>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-400 font-mono">
                                {(invoices || []).filter(inv => !inv.deleted).length} Fatura
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                            {(invoices || []).length > 0 ? (invoices || []).filter(inv => !inv.deleted).map((inv) => {
                                const isActive = activeInvoice?.id === inv.id && isViewingOldInvoice;
                                return (
                                    <div
                                        key={inv.id}
                                        onClick={() => handleViewInvoice(inv)}
                                        className={`p-3 rounded-xl border transition-all duration-150 cursor-pointer ${
                                            isActive
                                                ? 'bg-white/[0.06] border-white/20 shadow-md shadow-white/5'
                                                : 'bg-white/[0.015] border-white/[0.05] hover:bg-white/[0.03] hover:border-white/10'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-xs font-bold font-mono ${isActive ? 'text-emerald-400' : 'text-slate-200'}`}>
                                                        {inv.docId}
                                                    </span>
                                                    <span className="text-[11px] font-mono text-slate-500">
                                                        {inv.endDate ? new Date(inv.endDate).toLocaleDateString('tr-TR') : ''}
                                                    </span>
                                                </div>

                                                <div className="flex items-baseline gap-2 mt-1">
                                                    <span className="text-sm font-bold font-mono text-white">
                                                        ₺{(inv.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                    <span className="text-[11px] text-slate-400 font-mono">
                                                        · {inv.trips?.length || 0} Sefer ({(inv.totalTonnage || 0).toFixed(2)} Ton)
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Aksiyon İkonları */}
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {inv.files?.length > 0 && (
                                                    <span className="p-1 text-emerald-400" title="PDF Belgesi Var">
                                                        <Paperclip size={13} />
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setNoteModalInvoice(inv);
                                                        setModalNote(inv.note || '');
                                                        setModalFiles(inv.files || []);
                                                    }}
                                                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                                                    title="Düzenle / Not & Belge"
                                                >
                                                    <StickyNote size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDeleteInvoice(inv.id, inv.docId, e)}
                                                    className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                                                    title="Faturayı Sil"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="text-center py-10 text-slate-500 text-xs">
                                    <FileText size={28} className="mx-auto mb-2 opacity-30 text-slate-400" />
                                    Henüz kesilmiş fatura yok.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sağ Panel: A4 Sefer Dökümü veya PDF İzleyici */}
                <div className="w-full md:w-[58%] lg:w-[62%] p-3 sm:p-4 rounded-2xl border border-white/[0.07] bg-white/[0.01] backdrop-blur-md relative flex flex-col items-center justify-center min-h-[500px] md:min-h-0 overflow-hidden">
                    {activeInvoice ? (
                        viewMode === 'pdf' && activeInvoice.files && activeInvoice.files.length > 0 ? (
                            <div className="w-full h-full">
                                <PdfViewer files={activeInvoice.files} />
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden">
                                <A4InvoicePreview
                                    ref={invoicePrintRef}
                                    invoiceData={activeInvoice}
                                    vehicleInfo={{ plate: activeTruckData?.plate, trailerPlate: activeTruckData?.trailerPlate }}
                                    netPrice={netPrice}
                                    onChangeNetPrice={setNetPrice}
                                    onSavePrice={activeInvoice?.status === 'Sent' && isViewingOldInvoice ? async () => {
                                        await updateInvoice(activeInvoice.id, { grandTotal: netPrice });
                                        addLog('FATURA_FIYAT', `${activeInvoice.docId} net fiyat güncellendi: ₺${netPrice?.toLocaleString('tr-TR')}`);
                                        sendDiscordAlert({
                                            type: 'info',
                                            title: '✏️ Fatura Güncellendi',
                                            description: 'Fatura bilgileri değiştirildi.',
                                        });
                                    } : undefined}
                                    fuelRecords={fuelRecords}
                                />
                            </div>
                        )
                    ) : (
                        <div className="text-center flex flex-col items-center justify-center text-slate-500 py-16">
                            <FileText size={40} className="mb-3 opacity-25 text-slate-400" />
                            <p className="text-sm font-semibold text-slate-300 mb-1">Fatura Önizlemesi Yok</p>
                            <p className="text-xs text-slate-500 max-w-xs">
                                Sol menüden geçmiş bir faturaya tıklayın veya "Yeni Fatura Periyodu Seç" butonundan yeni periyot başlatın.
                            </p>
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
                                    } catch { /* empty */ }
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

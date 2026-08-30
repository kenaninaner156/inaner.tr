import React, { useContext, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Printer, Save, PlusCircle, CheckCircle, Clock, Trash2, StickyNote, Paperclip, FileText, Menu } from 'lucide-react';
import { DataContext } from '../context/DataContext';
import { useTruck } from '../context/TruckContext';
import PersonnelPeriodModal from './PersonnelPeriodModal';
import A4PersonnelPreview from './A4PersonnelPreview';
import FileUpload from './FileUpload';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { sendDiscordAlert } from '../services/discordWebhook';
import { parseTonnageInTons } from '../utils/tonnageUtils';

// PDF Görüntüleme Bileşeni
const PdfViewer = ({ files }) => {
    return (
        <div className="w-full flex flex-col rounded-xl overflow-hidden border border-[var(--border-color)] shadow-lg" style={{ height: '100%' }}>
            <div className="flex items-center gap-2.5 px-4 py-2.5 shrink-0"
                style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-color)' }}>
                <FileText size={14} className="text-red-400 shrink-0" />
                <span className="text-sm font-semibold text-[var(--text-primary)] truncate flex-1">
                    {files[0]?.name || 'Hak Ediş Belgesi'}
                </span>
                {files.length > 1 && (
                    <span className="text-xs text-slate-500 shrink-0">{files.length} dosya</span>
                )}
            </div>
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
                            width: 'focus:w-full w-full',
                            height: '100%',
                            border: 'none',
                        }}
                    />
                ))}
            </div>
            <div className="text-center text-[10px] text-slate-600 py-1.5 shrink-0"
                style={{ background: 'var(--bg-panel)', borderTop: '1px solid var(--border-color)' }}>
                Sefer dökümüne dönmek için hak ediş kartına tekrar tıklayın
            </div>
        </div>
    );
};

const Personnel = ({ onOpenMenu, isMobile } = {}) => {
    const { trips, payouts, addPayout, deletePayout, updatePayout, addLog, allDrivers } = useContext(DataContext);
    const { activeTruckData } = useTruck();
    const payoutPrintRef = useRef(null);

    const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);

    // Aktif Düzenlenen Hak Ediş State'i (Taslak LocalStorage'da tutulur)
    const [activePayoutState, setActivePayoutState] = useState(() => {
        try {
            const saved = localStorage.getItem('tir_draft_payout');
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });

    const [isSavingNote, setIsSavingNote] = useState(false);
    const [noteModalPayout, setNoteModalPayout] = useState(null);
    const [modalNote, setModalNote] = useState('');
    const [modalFiles, setModalFiles] = useState([]);
    const [netPrice, setNetPrice] = useState(0); 

    const [viewMode, setViewMode] = useState('sefer'); // 'sefer' | 'pdf'
    const [viewModePayoutId, setViewModePayoutId] = useState(null); 

    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [isViewingOldPayout, setIsViewingOldPayout] = useState(false);
    const [showOldPayoutWarning, setShowOldPayoutWarning] = useState(false);

    const { activeTruckId } = useTruck();

    // Sadece Hak Ediş Bekleyen Seferler listesi
    const availableTrips = (trips || []).filter(t => !t.deleted && t.premiumStatus !== 'paid' && (Number(t.premiumAmount) > 0 || t.premiumId));

    const saveDraftPayout = (draft) => {
        setActivePayoutState(draft);
        if (draft) {
            localStorage.setItem('tir_draft_payout', JSON.stringify(draft));
        } else {
            localStorage.removeItem('tir_draft_payout');
        }
    };

    const clearDraftPayout = () => {
        setActivePayoutState(null);
        localStorage.removeItem('tir_draft_payout');
    };

    // Uyarıyı 3 saniye sonra kapat
    useEffect(() => {
        if (showOldPayoutWarning) {
            const timer = setTimeout(() => setShowOldPayoutWarning(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [showOldPayoutWarning]);

    // Araç değiştiğinde önizlemeyi sıfırla
    useEffect(() => {
        setActivePayoutState(null);
        setIsViewingOldPayout(false);
        setNetPrice(0);
        setViewMode('sefer');
        setViewModePayoutId(null);
    }, [activeTruckId]);

    // Payout listesi değişince aktif görüntülemenin geçerli olup olmadığını kontrol et
    useEffect(() => {
        if (isViewingOldPayout && activePayoutState) {
            const stillExists = (payouts || []).some(p =>
                !p.deleted && (p.id === activePayoutState.id || (p.docId && p.docId === activePayoutState.docId))
            );
            if (!stillExists) {
                setActivePayoutState(null);
                setIsViewingOldPayout(false);
            }
        } else if (!activePayoutState && !isViewingOldPayout) {
            const draft = localStorage.getItem('tir_draft_payout');
            if (draft) {
                const parsed = JSON.parse(draft);
                setActivePayoutState(parsed);
                setNetPrice(parsed.grandTotal ?? 0);
                setIsViewingOldPayout(false);
            } else {
                const last = (payouts || []).filter(p => !p.deleted)[0];
                if (last) {
                    setActivePayoutState(last);
                    setNetPrice(last.grandTotal ?? 0);
                    setIsViewingOldPayout(true);
                    setShowOldPayoutWarning(true);
                    setViewMode('sefer');
                    setViewModePayoutId(last.id);
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payouts]);

    // Hak ediş periyodu değiştiğinde netPrice güncelle
    useEffect(() => {
        if (activePayoutState) {
            if (activePayoutState.grandTotal !== undefined) {
                setNetPrice(activePayoutState.grandTotal);
            } else {
                const total = activePayoutState.trips.reduce((acc, t) => acc + (Number(t.premiumAmount) || 0), 0);
                setNetPrice(total);
            }
        }
    }, [activePayoutState]);

    const handleOpenPeriodModal = () => {
        setIsPeriodModalOpen(true);
    };

    const handleSelectPeriod = ({ startDate, endDate, driverName, trips: selectedTrips }) => {
        const newDraft = {
            id: `TASLAK-${Date.now().toString().slice(-4)}`,
            startDate,
            endDate,
            driverName,
            trips: selectedTrips,
            status: 'Draft',
        };
        saveDraftPayout(newDraft);
        setIsViewingOldPayout(false);
        setViewMode('sefer');
        setViewModePayoutId(null);
    };

    const handleViewPayout = (payout) => {
        if (activePayoutState?.id === payout.id && isViewingOldPayout) {
            const hasPdf = payout.files && payout.files.length > 0;
            if (hasPdf) {
                setViewMode(vm => vm === 'sefer' ? 'pdf' : 'sefer');
                setViewModePayoutId(payout.id);
            }
            return;
        }
        setActivePayoutState(payout);
        setNetPrice(payout.grandTotal ?? 0);
        setIsViewingOldPayout(true);
        setShowOldPayoutWarning(true);
        setViewMode('sefer');
        setViewModePayoutId(payout.id);
    };

    const handleSavePayout = async () => {
        if (!activePayoutState || activePayoutState.trips.length === 0) {
            alert("Kaydedilecek sefer bulunamadı.");
            return;
        }

        const totalTonnage = activePayoutState.trips.reduce((acc, t) => acc + parseTonnageInTons(t.tonnage), 0);
        const calculatedTotal = activePayoutState.trips.reduce((acc, t) => acc + (Number(t.premiumAmount) || 0), 0);

        const newPayoutData = {
            startDate: activePayoutState.startDate,
            endDate: activePayoutState.endDate,
            driverName: activePayoutState.driverName,
            trips: (activePayoutState.trips || []).map(t => ({ 
                id: t.id, 
                date: t.date, 
                from: t.from, 
                to: t.to, 
                tonnage: t.tonnage,
                premiumAmount: t.premiumAmount,
                premiumName: t.premiumName || 'Özel Prim'
            })),
            totalTonnage,
            calculatedTotal,
            grandTotal: netPrice !== undefined ? netPrice : calculatedTotal,
            status: 'Approved',
            docId: `PAY-${new Date().getFullYear()}-${String(payouts.length + 1).padStart(3, '0')}`
        };

        try {
            await addPayout(newPayoutData);

            // P1: Hak ediş bildirimi
            sendDiscordAlert({
              type: 'success',
              title: '💵 Prim Hak Edişi Oluşturuldu',
              description: 'Personel prim hak edişi kaydedildi.',
              fields: [
                { name: '👤 Personel', value: String(newPayoutData?.driverName || '—'), inline: true },
                { name: '💰 Tutar', value: String(newPayoutData?.grandTotal || newPayoutData?.calculatedTotal || '—') + ' ₺', inline: true },
              ]
            });

            const batch = writeBatch(db);
            activePayoutState.trips.forEach(trip => {
                const tripRef = doc(db, 'trips', trip.id);
                batch.update(tripRef, { premiumStatus: 'paid' });
            });
            await batch.commit();
            clearDraftPayout();

            setActivePayoutState({ ...newPayoutData, id: newPayoutData.docId });
            setIsViewingOldPayout(false);
        } catch {
            alert("Hak ediş kaydedilirken bir hata oluştu.");
        }
    };

    const handleDeletePayout = async (payoutId, docId, e) => {
        e.stopPropagation();
        const isMobile = window.innerWidth < 768;

        if (isMobile || window.confirm(`${docId} numaralı personel hak ediş kaydını silmek istediğinize emin misiniz? (İlgili seferlerin prim durumları ödenmemiş hale dönecektir)`)) {
            try {
                const deletedPayout = payouts.find(p => p.id === payoutId);
                await deletePayout(payoutId);

                // P2: Hak ediş silme bildirimi
                sendDiscordAlert({
                  type: 'warning',
                  title: '🗑️ Hak Ediş Silindi',
                  description: 'Bir prim hak ediş kaydı silindi.',
                  fields: [
                    { name: '👤 Personel', value: String(deletedPayout?.driverName || '—'), inline: true },
                    { name: '💰 Tutar', value: String(deletedPayout?.grandTotal || deletedPayout?.calculatedTotal || '—') + ' ₺', inline: true },
                  ]
                });

                if (deletedPayout && deletedPayout.trips) {
                    const batch = writeBatch(db);
                    deletedPayout.trips.forEach(trip => {
                        const tripRef = doc(db, 'trips', trip.id);
                        batch.update(tripRef, { premiumStatus: 'unpaid' });
                    });
                    await batch.commit();
                }
            } catch { /* empty */ }
        }
    };

    const handlePrintPDF = () => {
        if (!payoutPrintRef.current) return;

        const printContent = payoutPrintRef.current;
        const printWindow = window.open('', '', 'width=900,height=1200');
        printWindow.document.write('<html><head><title>Hak Ediş Yazdır</title>');
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
        <div 
            className="flex flex-col md:flex-row md:h-[calc(100vh-64px)] gap-4 md:gap-8 animate-in fade-in duration-500 overflow-y-auto md:overflow-hidden pb-4 md:pb-0"
            style={{
                paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))'
            }}
        >
            {/* Sol Panel: Kontrol Merkezi */}
            <div className="w-full md:w-[45%] lg:w-[40%] flex flex-col gap-3 md:gap-6 md:overflow-y-auto custom-scrollbar md:pr-2">

                {/* Panel Başlık (Masaüstü & Mobil) */}
                <div className="flex glass-panel px-4 py-3 items-center justify-between shadow-sm border border-[var(--border-color)] backdrop-blur-md rounded-2xl shrink-0">
                    <div className="flex items-center gap-2.5">
                        {isMobile && onOpenMenu && (
                            <button 
                                onClick={onOpenMenu} 
                                className="p-1.5 -ml-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors md:hidden cursor-pointer"
                                title="Menüyü Aç"
                            >
                                <Menu size={20} />
                            </button>
                        )}
                        <h2 className="text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)]">Personel Prim Hak Edişi</h2>
                    </div>
                </div>

                <div className="glass-panel p-4 overflow-hidden relative">
                    <div className="absolute -right-10 -top-10 w-32 h-32 bg-orange-500/5 blur-3xl rounded-full pointer-events-none"></div>
                    
                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleOpenPeriodModal}
                        className="relative w-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 hover:text-orange-300 py-2.5 px-4 rounded-xl font-semibold flex items-center justify-center transition-all duration-300 shadow-sm hover:shadow-[0_4px_20px_rgba(249,115,22,0.15)] text-sm group overflow-hidden border border-orange-500/20"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
                        <PlusCircle className="mr-2 relative z-10 transition-transform duration-300 group-hover:scale-110" size={17} /> 
                        <span className="relative z-10 tracking-wide font-semibold">Yeni Hak Ediş Dönemi Seç</span>
                    </motion.button>
                    
                    <AnimatePresence>
                        {activePayoutState && activePayoutState.status === 'Draft' && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0, marginTop: 0 }} 
                                animate={{ opacity: 1, height: 'auto', marginTop: 12 }} 
                                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-xl relative overflow-hidden">
                                    <motion.div 
                                        animate={{ opacity: [0.2, 0.4, 0.2] }} 
                                        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                                        className="absolute top-0 right-0 w-24 h-24 bg-orange-400/5 blur-2xl rounded-full pointer-events-none"
                                    />
                                    <div className="flex justify-between items-center mb-1 relative z-10">
                                        <h4 className="flex items-center text-orange-400 font-semibold text-sm">
                                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 4, ease: "linear" }}>
                                                <Clock size={14} className="mr-1.5" />
                                            </motion.div>
                                            Hak Ediş Taslağı
                                        </h4>
                                        <button
                                            onClick={() => setShowCancelConfirm(true)}
                                            className="text-xs bg-red-500/10 px-2 py-1 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors cursor-pointer"
                                        >
                                            İptal Et
                                        </button>
                                    </div>
                                    <p className="text-xs text-[var(--text-primary)] font-semibold mt-1 relative z-10">
                                        Şoför: {activePayoutState.driverName}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-0.5 relative z-10">
                                        Periyot: {new Date(activePayoutState.startDate).toLocaleDateString('tr-TR')} - {new Date(activePayoutState.endDate).toLocaleDateString('tr-TR')}
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-1 relative z-10">{activePayoutState.trips.length} sefer dahil edildi.</p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Aktif Hak Ediş Aksiyonları */}
                    {activePayoutState && (
                        <div className="mt-3 flex flex-row gap-2">
                            <button
                                onClick={handlePrintPDF}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-slate-700 hover:bg-slate-600 text-[var(--text-primary)] rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                                <Printer size={14} /> PDF / Yazdır
                            </button>
                            {activePayoutState.status === 'Approved' ? (
                                <button disabled className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-[var(--bg-panel-hover)] text-emerald-400 rounded-lg text-xs font-semibold border border-emerald-500/30 opacity-80">
                                    <CheckCircle size={14} /> Ödendi / Onaylandı
                                </button>
                            ) : (
                                <button
                                    onClick={handleSavePayout}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-orange-600 hover:bg-orange-500 text-[var(--text-primary)] rounded-lg text-xs font-semibold transition-colors border border-orange-500 shadow-lg shadow-orange-500/20 cursor-pointer"
                                >
                                    <Save size={14} /> Ödemeyi Yap & Onayla
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Geçmiş Hak Edişler Listesi */}
                <div className="glass-panel flex-1 min-h-0 flex flex-col">
                    <div className="p-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-panel)] backdrop-blur z-10 rounded-t-xl">
                        <h4 className="font-bold text-[var(--text-primary)] flex items-center text-sm">
                            <CheckCircle className="mr-2 text-orange-400" size={16} />
                            Geçmiş Ödemeler
                        </h4>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto custom-scrollbar space-y-2 relative">
                        {(payouts || []).length > 0 ? (payouts || []).filter(p => !p.deleted).map((p) => {
                            const isActive = activePayoutState?.id === p.id && isViewingOldPayout;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => handleViewPayout(p)}
                                    className={`w-full text-left p-3 rounded-xl transition-all duration-300 group relative cursor-pointer outline-none overflow-hidden block ${isActive ? 'border-transparent' : 'border border-[var(--border-color)] bg-white/5 hover:bg-white/10'}`}
                                >
                                    {!isActive && <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-300 -z-10" />}
                                    {isActive && (
                                        <motion.div layoutId="payout-active-apple"
                                            className={`absolute inset-0 bg-gradient-to-br rounded-xl border ${viewMode === 'pdf' ? 'from-indigo-500/10 to-indigo-600/5 border-indigo-500/30 shadow-[0_2px_15px_rgba(99,102,241,0.15)]' : 'from-orange-500/10 to-orange-600/5 border-orange-500/30 shadow-[0_2px_15px_rgba(249,115,22,0.15)]'}`}
                                            style={{ zIndex: 0 }} initial={false}
                                            transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.8 }}
                                        />
                                    )}
                                    
                                    <div className="relative z-10 flex flex-col gap-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <span 
                                                className={`font-semibold text-sm transition-colors ${isActive ? (viewMode === 'pdf' ? 'text-indigo-300' : 'text-orange-400') : 'text-slate-300 group-hover:text-orange-400'}`}
                                            >
                                                {p.docId || 'HAK EDİŞ'}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                <span className={`text-[10px] transition-colors ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>{new Date(p.endDate).toLocaleDateString('tr-TR')}</span>
                                                {p.files?.length > 0 && (
                                                    <span className={`${isActive ? 'text-indigo-300' : 'text-orange-500/60'}`} title="PDF eki var">
                                                        <Paperclip size={12} />
                                                    </span>
                                                )}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setNoteModalPayout(p); setModalNote(p.note || ''); setModalFiles(p.files || []); }}
                                                    className={`p-1 rounded transition-colors ${p.note || p.files?.length > 0 ? (isActive ? 'text-white hover:text-orange-300' : 'text-orange-500/80') : (isActive ? 'text-white/50 hover:text-white' : 'text-slate-600 hover:text-orange-400')}`}
                                                    title="Düzenle / Not & Belge"
                                                >
                                                    <StickyNote size={14} />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeletePayout(p.id, p.docId || 'Hak Ediş', e)}
                                                    className={`p-1 transition-colors ${isActive ? 'text-white/50 hover:text-red-400' : 'text-slate-500 hover:text-red-400'}`}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <div className={`text-xs font-semibold ${isActive ? 'text-orange-200' : 'text-slate-300'}`}>{p.driverName}</div>
                                                <div className={`text-[10px] transition-colors ${isActive ? 'text-white/60' : 'text-slate-500'}`}>{p.trips?.length || 0} Sefer | {p.totalTonnage?.toFixed(2)} Ton</div>
                                            </div>
                                            <motion.div 
                                                className={`text-sm font-black tracking-wide ${isActive ? 'text-white drop-shadow-md' : 'text-[var(--text-primary)]'}`}
                                                animate={{ scale: isActive ? 1.02 : 1, originX: 0 }}
                                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                            >
                                                ₺{p.grandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                            </motion.div>
                                        </div>
                                    </div>
                                </button>
                            );
                        }) : (
                            <div className="text-center py-8 text-slate-500 text-sm absolute inset-0 flex flex-col items-center justify-center">
                                <FileText size={24} className="mx-auto mb-2 opacity-50 text-orange-500" />
                                Henüz hak ediş ödemesi yapılmamış.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Sağ Panel: A4 Hak Ediş Görünümü veya Ek PDF */}
            <div className="w-full md:w-[55%] lg:w-[60%] relative flex flex-col overflow-hidden md:min-h-0 pl-0 md:pl-4" style={{ minHeight: '70vh' }}>
                <div className="w-full relative overflow-hidden flex flex-col" style={{ flex: 1, minHeight: '70vh' }}>
                    {activePayoutState ? (
                        viewMode === 'pdf' && activePayoutState.files && activePayoutState.files.length > 0 ? (
                            <div className="absolute inset-0">
                                <PdfViewer files={activePayoutState.files} />
                            </div>
                        ) : (
                            <A4PersonnelPreview
                                ref={payoutPrintRef}
                                payoutData={activePayoutState}
                                vehicleInfo={{ plate: activeTruckData?.plate, trailerPlate: activeTruckData?.trailerPlate }}
                                netPrice={netPrice}
                                onChangeNetPrice={setNetPrice}
                                onSavePrice={activePayoutState?.status === 'Approved' && isViewingOldPayout ? async () => {
                                    await updatePayout(activePayoutState.id, { grandTotal: netPrice });
                                    addLog('FATURA_FIYAT', `${activePayoutState.docId} net fiyat güncellendi: ₺${netPrice?.toLocaleString('tr-TR')}`);
                                } : undefined}
                            />
                        )
                    ) : (
                        <div className="text-center flex flex-col items-center justify-center text-slate-500 pt-20">
                            <Users size={48} className="mb-4 opacity-30 text-orange-500" />
                            <p className="text-lg font-semibold text-[var(--text-primary)] mb-2">Önizleme Yok</p>
                            <p className="text-sm">Sol panelden "Yeni Hak Ediş Dönemi Seç" butonuna tıklayarak taslak oluşturabilirsiniz.</p>
                        </div>
                    )}
                </div>
            </div>

            <PersonnelPeriodModal
                isOpen={isPeriodModalOpen}
                onClose={() => setIsPeriodModalOpen(false)}
                trips={availableTrips}
                allTrips={trips}
                onSelectPeriod={handleSelectPeriod}
                allDrivers={allDrivers}
            />

            {/* Düzenle / Not & Belge Modalı */}
            {noteModalPayout && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setNoteModalPayout(null)}>
                    <div className="bg-[#0f1117] rounded-2xl border border-orange-500/20 shadow-2xl shadow-orange-955/20 w-full max-w-lg overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center px-5 py-4 border-b border-white/5">
                            <h3 className="font-bold flex items-center gap-2.5 text-[var(--text-primary)]">
                                <span className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center flex-shrink-0">
                                    <StickyNote size={14} className="text-orange-400" />
                                </span>
                                <span>{noteModalPayout.docId} <span className="text-slate-500 font-normal">— Düzenle</span></span>
                            </h3>
                            <button onClick={() => setNoteModalPayout(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all text-lg cursor-pointer">&times;</button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <p className="text-xs text-slate-400 mb-1.5 flex items-center gap-1"><Save size={11} /> Net Ödeme Tutarı (₺)</p>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={noteModalPayout._editPrice ?? noteModalPayout.grandTotal ?? 0}
                                    onChange={(e) => setNoteModalPayout(prev => ({ ...prev, _editPrice: parseFloat(e.target.value) || 0 }))}
                                    className="w-full bg-white/5 border border-white/10 focus:border-orange-500/40 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 mb-1.5">Özel Not / Açıklama</p>
                                <textarea
                                    value={modalNote}
                                    onChange={(e) => setModalNote(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 focus:border-orange-500/40 rounded-lg p-3 text-sm text-[var(--text-primary)] placeholder-slate-600 outline-none min-h-[80px] resize-none transition-colors"
                                    placeholder="Hak ediş ile ilgili not ekleyin..."
                                />
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><Paperclip size={11} /> Dekont / Belge Ekle (PDF / Resim)</p>
                                <FileUpload files={modalFiles} onChange={setModalFiles} maxSizeMB={10} />
                            </div>
                        </div>
                        <div className="px-5 py-4 border-t border-white/5 flex justify-end gap-3">
                            <button
                                onClick={() => setNoteModalPayout(null)}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
                            >
                                İptal
                            </button>
                            <button
                                onClick={async () => {
                                    setIsSavingNote(true);
                                    try {
                                        const newPrice = noteModalPayout._editPrice ?? noteModalPayout.grandTotal ?? 0;
                                        await updatePayout(noteModalPayout.id, { note: modalNote, files: modalFiles, grandTotal: newPrice });
                                        if (activePayoutState?.id === noteModalPayout.id) setNetPrice(newPrice);
                                        addLog('FATURA_NOT', `${noteModalPayout.docId} personel kaydı güncellendi`);
                                        setNoteModalPayout(null);
                                    } catch { /* empty */ }
                                    setIsSavingNote(false);
                                }}
                                disabled={isSavingNote}
                                className="px-5 py-2 rounded-lg text-sm font-bold bg-orange-600 hover:bg-orange-500 text-white transition-colors shadow-lg shadow-orange-900/40 disabled:opacity-50 cursor-pointer"
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
                        <p className="text-slate-400 text-sm mb-6">İşlem bekleyen bu personel hak ediş taslağını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.</p>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCancelConfirm(false)}
                                className="flex-1 py-2.5 rounded-lg font-bold w-full text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all text-sm cursor-pointer"
                            >
                                Vazgeç
                            </button>
                            <button
                                onClick={() => {
                                    clearDraftPayout();
                                    setActivePayoutState(null);
                                    setShowCancelConfirm(false);
                                }}
                                className="flex-1 py-2.5 rounded-lg font-bold w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-all text-sm cursor-pointer"
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

export default Personnel;

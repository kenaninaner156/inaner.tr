import React, { useContext, useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Printer, Save, PlusCircle, CheckCircle, Clock, Trash2, StickyNote, Paperclip, Menu, Calendar, User, ChevronDown, Check, Edit2, Layers, ListChecks, AlertCircle, X } from 'lucide-react';
import { DataContext } from '../context/DataContext';
import { useTruck } from '../context/TruckContext';
import { useCompany } from '../context/CompanyContext';
import InvoicePeriodModal from './InvoicePeriodModal';
import A4InvoicePreview from './A4InvoicePreview';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { sendDiscordAlert } from '../services/discordWebhook';
import { parseTonnageInTons } from '../utils/tonnageUtils';

const Invoices = ({ onOpenMenu, isMobile } = {}) => {
    const { trips, invoices, addInvoice, updateInvoice, deleteInvoice, addLog, fuelRecords, draftInvoice, saveDraftInvoice, clearDraftInvoice, routeHistory, saveRouteHistory } = useContext(DataContext);
    const { activeTruckData } = useTruck();
    const { companyData } = useCompany();
    const invoicePrintRef = useRef(null);

    // Akıllı Şoför / İsim Seçimi State'leri
    const [ownerName, setOwnerName] = useState(() => {
        return localStorage.getItem(`truck_owner_name_${activeTruckData?.plate || 'default'}`) || activeTruckData?.driverName || companyData?.name || 'GÖKSEL İNANER';
    });
    const [isNameDropdownOpen, setIsNameDropdownOpen] = useState(false);
    const [isCustomNameEditing, setIsCustomNameEditing] = useState(false);
    const [customNameInput, setCustomNameInput] = useState('');
    const nameDropdownRef = useRef(null);

    // Plaka veya şirket değiştikçe hafızadaki ismi yükle
    useEffect(() => {
        const saved = localStorage.getItem(`truck_owner_name_${activeTruckData?.plate || 'default'}`);
        if (saved) {
            setOwnerName(saved);
        } else if (activeTruckData?.driverName) {
            setOwnerName(activeTruckData.driverName.toLocaleUpperCase('tr-TR'));
        } else if (companyData?.name) {
            setOwnerName(companyData.name.toLocaleUpperCase('tr-TR'));
        } else {
            setOwnerName('GÖKSEL İNANER');
        }
    }, [activeTruckData?.plate, activeTruckData?.driverName, companyData?.name]);

    // Dışarı tıklayınca dropdown'ı kapat
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (nameDropdownRef.current && !nameDropdownRef.current.contains(e.target)) {
                setIsNameDropdownOpen(false);
                setIsCustomNameEditing(false);
            }
        };
        if (isNameDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isNameDropdownOpen]);

    const handleSelectName = (name) => {
        const upperName = (name || '').trim().toLocaleUpperCase('tr-TR');
        if (!upperName) return;
        setOwnerName(upperName);
        localStorage.setItem(`truck_owner_name_${activeTruckData?.plate || 'default'}`, upperName);
        setIsNameDropdownOpen(false);
        setIsCustomNameEditing(false);
    };

    // Şirket ve seferlerden toplanan şoförler listesi
    const driverList = useMemo(() => {
        const list = new Set();
        if (companyData?.name) list.add(companyData.name.toLocaleUpperCase('tr-TR'));
        if (activeTruckData?.driverName) list.add(activeTruckData.driverName.toLocaleUpperCase('tr-TR'));
        (trips || []).forEach(t => {
            if (t.driverName && t.driverName.trim()) {
                list.add(t.driverName.trim().toLocaleUpperCase('tr-TR'));
            }
        });
        if (companyData?.drivers && Array.isArray(companyData.drivers)) {
            companyData.drivers.forEach(d => {
                const dName = typeof d === 'string' ? d : d.name;
                if (dName && dName.trim()) list.add(dName.trim().toLocaleUpperCase('tr-TR'));
            });
        }
        list.add('GÖKSEL İNANER');
        return Array.from(list);
    }, [trips, companyData, activeTruckData]);

    const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);

    // Aktif Düzenlenen Fatura State'i
    const [activeInvoice, setActiveInvoice] = useState(null);
    const [netPrice, setNetPrice] = useState(0); // Net fiyat (manuel girilecek)
    const [docViewTab, setDocViewTab] = useState('summary'); // 'summary' | 'trips'

    // Aktif Faturanın Toplam Tonajı & Rota Bazlı İcmali
    const totalInvoiceTonnage = useMemo(() => {
        return (activeInvoice?.trips || []).reduce((acc, t) => acc + parseTonnageInTons(t.tonnage), 0);
    }, [activeInvoice?.trips]);

    const routeSummary = useMemo(() => {
        const trips = activeInvoice?.trips || [];
        const groups = {};
        trips.forEach(t => {
            const key = `${t.from || 'Bilinmeyen'}__${t.to || 'Bilinmeyen'}`;
            if (!groups[key]) {
                groups[key] = { from: t.from || '—', to: t.to || '—', tonnage: 0, count: 0 };
            }
            groups[key].tonnage += parseTonnageInTons(t.tonnage);
            groups[key].count += 1;
        });
        return Object.values(groups);
    }, [activeInvoice?.trips]);

    // Firebase Rota Hafızasından Tahmini Hakediş / Ödenecek Tutar Hesabı
    const estimatedCalculation = useMemo(() => {
        if (!activeInvoice || !activeInvoice.trips || activeInvoice.trips.length === 0) {
            return { totalNet: 0, totalPayable: 0, hasMissingPrice: false, knownCount: 0, totalCount: 0, allPriced: false, routeDetails: [] };
        }

        const history = routeHistory || {};
        let totalNet = 0;
        let knownCount = 0;
        const totalCount = routeSummary.length;
        let hasMissingPrice = false;

        const routeDetails = routeSummary.map(group => {
            const fromStr = (group.from || '').trim();
            const toStr = (group.to || '').trim();
            const key = `${fromStr}|||${toStr}`;
            const historyItem = history[key] || {};
            const unitPrice = historyItem.unitPrice || 0;
            const isPriced = unitPrice > 0;

            if (isPriced) {
                knownCount += 1;
                totalNet += (group.tonnage * unitPrice);
            } else {
                hasMissingPrice = true;
            }

            const lineNet = isPriced ? (group.tonnage * unitPrice) : 0;
            const linePayable = lineNet * 1.16;

            return {
                key,
                from: group.from,
                to: group.to,
                tonnage: group.tonnage,
                count: group.count,
                unitPrice,
                isPriced,
                lineNet,
                linePayable
            };
        });

        // Taşımacılıkta 2/10 Tevkifatlı KDV (%16 Net Tahsil Edilen KDV): Matrah * 1.16
        const totalPayable = totalNet * 1.16;

        return {
            totalNet,
            totalPayable,
            hasMissingPrice,
            knownCount,
            totalCount,
            allPriced: totalCount > 0 && knownCount === totalCount,
            routeDetails
        };
    }, [activeInvoice, routeSummary, routeHistory]);

    // Faturanın GİB'de imzalanıp imzalanmadığı kontrolü (İmzalanmışsa tahmini fiyat gizlenir)
    const isInvoiceSigned = activeInvoice?.gibStatus?.toLowerCase() === 'signed' || activeInvoice?.signed === true;

    // Fiyat Kırılımı ve Eksik Rota Modal State'leri
    const [showPriceBreakdownModal, setShowPriceBreakdownModal] = useState(false);
    const [editingRouteKey, setEditingRouteKey] = useState(null);
    const [editingPriceInput, setEditingPriceInput] = useState('');
    const [isSavingRoutePrice, setIsSavingRoutePrice] = useState(false);

    const handleSaveRoutePrice = async (from, to, priceVal) => {
        const numPrice = Number(priceVal) || 0;
        if (numPrice <= 0) return;
        setIsSavingRoutePrice(true);
        try {
            const key = `${(from || '').trim()}|||${(to || '').trim()}`;
            const updatedHistory = {
                ...(routeHistory || {}),
                [key]: {
                    name: `${from} ${to} NAKLİYESİ`.toUpperCase(),
                    unitPrice: numPrice
                }
            };
            if (saveRouteHistory) await saveRouteHistory(updatedHistory);
            setEditingRouteKey(null);
            setEditingPriceInput('');
        } catch (e) {
            console.error("Rota fiyatı kaydedilirken hata:", e);
        } finally {
            setIsSavingRoutePrice(false);
        }
    };

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
        
        
    };

    // Eski faturaya tıklandığında önizlele
    const handleViewInvoice = (inv) => {
        if (activeInvoice?.id === inv.id && isViewingOldInvoice) {
            // Aynı faturaya tekrar tıklandı: PDF varsa toggle
            const hasPdf = inv.files && inv.files.length > 0;
            if (hasPdf) {
                
                
            }
            return;
        }
        setActiveInvoice(inv);
        setNetPrice(inv.grandTotal ?? 0);
        setIsViewingOldInvoice(true);
        setShowOldInvoiceWarning(true);
        
        
    };

    const handleSaveInvoice = async () => {
        if (!activeInvoice || activeInvoice.trips.length === 0) {
            alert("Kaydedilecek sefer bulunamadı.");
            return;
        }

        const totalTonnage = activeInvoice.trips.reduce((acc, t) => acc + parseTonnageInTons(t.tonnage), 0);

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

    const formatFullDateRange = (startDate, endDate, fallbackDocId) => {
        if (!startDate && !endDate) return fallbackDocId || 'Tarih Belirtilmedi';
        const formatFull = (d) => {
            if (!d) return '';
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return '';
            return dt.toLocaleDateString('tr-TR');
        };
        const s = formatFull(startDate);
        const e = formatFull(endDate);
        if (s && e) {
            return `${s} - ${e}`;
        }
        return s || e || fallbackDocId;
    };

    const formatInvoicePeriodName = (startDate, endDate, fallbackDocId) => {
        if (!startDate && !endDate) return fallbackDocId || 'Sefer Dökümü';
        const formatShort = (d) => {
            if (!d) return '';
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return '';
            const day = String(dt.getDate()).padStart(2, '0');
            const month = String(dt.getMonth() + 1).padStart(2, '0');
            return `${day}.${month}`;
        };
        const s = formatShort(startDate);
        const e = formatShort(endDate);
        if (s && e) {
            return `Sefer Dökümü ${s}-${e}`;
        }
        return `Sefer Dökümü ${s || e}` || fallbackDocId || 'Sefer Dökümü';
    };

    const handlePrintPDF = () => {
        if (!invoicePrintRef.current) return;

        const printTitle = formatInvoicePeriodName(activeInvoice?.startDate, activeInvoice?.endDate, activeInvoice?.docId);
        const printContent = invoicePrintRef.current;

        const printWindow = window.open('', '', 'width=900,height=1200');
        printWindow.document.write(`<!DOCTYPE html><html><head><title>${printTitle}</title>`);
        printWindow.document.write(`
            <meta charset="utf-8">
            <style>
                @page {
                    size: A4 portrait;
                    margin: 0 !important;
                }
                *, *::before, *::after {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #ffffff !important;
                    background-color: #ffffff !important;
                    color: #000000 !important;
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                    width: 100% !important;
                }
                .a4-page {
                    box-sizing: border-box !important;
                    padding: 12mm 15mm !important;
                    background: #ffffff !important;
                    background-color: #ffffff !important;
                    color: #000000 !important;
                    width: 100% !important;
                }
                .page-1 {
                    page-break-after: always !important;
                    break-after: page !important;
                }
                .page-2 {
                    page-break-before: always !important;
                    break-before: page !important;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    background-color: #ffffff !important;
                }
                tr {
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                }
                th, td {
                    color: #000000 !important;
                }
            </style>
        `);
        // Load all current stylesheets
        const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
        styles.forEach(s => {
            printWindow.document.write(s.outerHTML);
        });
        printWindow.document.write('</head><body style="background:#ffffff !important; background-color:#ffffff !important; color:#000000 !important; margin:0 !important; padding:0 !important;">');
        printWindow.document.write(printContent.outerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 350);
    };

    return (
        <div className="flex flex-col md:flex-row h-full w-full gap-4 md:gap-5 overflow-hidden animate-in fade-in duration-500 pb-2 md:pb-0">

            {/* Sol Panel: Kontrol Merkezi */}
            <div className="w-full md:w-[380px] lg:w-[420px] shrink-0 h-full flex flex-col gap-3 overflow-hidden">

                {/* Panel Başlık (Masaüstü & Mobil) */}
                <div className="flex glass-panel px-4 py-3 items-center justify-between shadow-none border border-white/[0.08] backdrop-blur-md rounded-2xl shrink-0">
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
                        <h2 className="text-lg font-bold tracking-tight text-white">Fatura Durumu</h2>
                    </div>
                </div>

                <div className="glass-panel p-4 overflow-hidden relative shadow-none border border-white/[0.08]">
                    {/* Arka plan animasyon efekti */}
                    <div className="absolute -right-10 -top-10 w-32 h-32 bg-sky-500/5 blur-3xl rounded-full pointer-events-none"></div>
                    
                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleOpenPeriodModal}
                        className="relative w-full bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 py-2.5 px-4 rounded-xl font-semibold flex items-center justify-center transition-all duration-300 shadow-none text-sm group overflow-hidden border border-sky-500/20 cursor-pointer"
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
                                <div className="p-3 bg-sky-500/5 border border-sky-500/20 rounded-xl relative overflow-hidden">
                                    <motion.div 
                                        animate={{ opacity: [0.2, 0.4, 0.2] }} 
                                        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                                        className="absolute top-0 right-0 w-24 h-24 bg-sky-400/5 blur-2xl rounded-full pointer-events-none"
                                    />
                                    <div className="flex justify-between items-center mb-1 relative z-10">
                                        <h4 className="flex items-center text-sky-400 font-semibold text-sm">
                                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 4, ease: "linear" }}>
                                                <Clock size={14} className="mr-1.5" />
                                            </motion.div>
                                            İşlem Bekleyen Taslak
                                        </h4>
                                        <button
                                            onClick={() => setShowCancelConfirm(true)}
                                            className="text-xs bg-red-500/10 px-2 py-1 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors cursor-pointer"
                                        >
                                            İptal Et
                                        </button>
                                    </div>
                                    <p className="text-xs text-[var(--text-primary)] relative z-10 font-medium">
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
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-slate-700 hover:bg-slate-600 text-[var(--text-primary)] rounded-lg text-xs font-medium transition-colors cursor-pointer"
                            >
                                <Printer size={14} /> PDF İndir
                            </button>
                            {activeInvoice.status === 'Sent' ? (
                                <button disabled className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-[var(--bg-panel-hover)] text-sky-400 rounded-lg text-xs font-medium border border-sky-500/30 opacity-80">
                                    <CheckCircle size={14} /> Onaylandı
                                </button>
                            ) : (
                                <button
                                    onClick={handleSaveInvoice}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-sky-600 hover:bg-sky-500 text-[var(--text-primary)] rounded-lg text-xs font-medium transition-colors border border-sky-500 shadow-none cursor-pointer"
                                >
                                    <Save size={14} /> Kes & Onayla
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Geçmiş Faturalar Listesi */}
                <div className="glass-panel flex-1 min-h-0 flex flex-col shadow-none border border-white/[0.08]">
                    <div className="p-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-panel)] backdrop-blur z-10 rounded-t-xl">
                        <h4 className="font-bold text-[var(--text-primary)] flex items-center text-sm">
                            <CheckCircle className="mr-2 text-sky-400" size={16} />
                            Tamamlanan Faturalar
                        </h4>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto custom-scrollbar space-y-2 relative">
                        {(invoices || []).length > 0 ? (invoices || []).filter(inv => !inv.deleted).map((inv) => {
                            const isActive = activeInvoice?.id === inv.id && isViewingOldInvoice;
                            return (
                            <div
                                key={inv.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => handleViewInvoice(inv)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleViewInvoice(inv); } }}
                                className={`w-full text-left p-3 rounded-xl transition-all duration-300 group relative cursor-pointer outline-none overflow-hidden block ${isActive ? 'border-transparent' : 'border border-[var(--border-color)] bg-white/5 hover:bg-white/10'}`}
                            >
                                {!isActive && <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-300 -z-10" />}
                                {isActive && (
                                  <motion.div layoutId="invoice-active-apple"
                                    className="absolute inset-0 bg-gradient-to-br rounded-xl border from-sky-500/10 to-indigo-600/5 border-sky-500/30"
                                    style={{ zIndex: 0 }} initial={false}
                                    transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.8 }}
                                  />
                                )}
                                
                                <div className="relative z-10 flex flex-col gap-1">
                                    <div className="flex justify-between items-center mb-0.5">
                                        <span 
                                            className={`font-bold text-sm tracking-tight truncate transition-colors ${isActive ? 'text-sky-400' : 'text-slate-200 group-hover:text-sky-400'}`}
                                        >
                                            {formatFullDateRange(inv.startDate, inv.endDate, inv.docId)}
                                        </span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={(e) => handleDeleteInvoice(inv.id, inv.docId, e)}
                                                className={`p-1 transition-colors ${isActive ? 'text-white/50 hover:text-red-400' : 'text-slate-500 hover:text-red-400'}`}
                                                title="Sil"
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
                                    <div className={`text-xs mt-0.5 transition-colors ${isActive ? 'text-white/60' : 'text-slate-500'}`}>{inv.trips?.length || 0} Sefer | {((inv.trips && inv.trips.length > 0) ? inv.trips.reduce((acc, t) => acc + parseTonnageInTons(t.tonnage), 0) : (inv.totalTonnage || 0)).toFixed(2)} Ton</div>
                                </div>
                            </div>
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

            {/* Sağ Panel: Tek Parça A4 Benzeri Çerçeve (Açık Tema) */}
            <div className="flex-1 h-full min-w-0 flex flex-col overflow-hidden bg-slate-50 pt-7 sm:pt-9 px-5 sm:px-6 pb-4 sm:pb-5 rounded-2xl border border-slate-200 shadow-xl relative text-slate-800">
                {/* 1. Üst Başlık (Kompakt ve Zarif Boyutlandırma) */}
                <div className="flex justify-between items-end border-b border-blue-800/70 pb-2.5 mb-3 shrink-0">
                    {/* Sol Kısım: Başlık, Periyot ve Tarih */}
                    <div className="flex flex-col">
                        <h1 className="text-lg sm:text-xl font-black text-blue-900 tracking-tight leading-none mb-1">
                            SEFER DÖKÜMÜ
                        </h1>
                        <p className="text-[11px] font-medium text-slate-500 leading-tight">
                            Periyot: <span className="text-slate-700 font-semibold">{activeInvoice?.startDate ? new Date(activeInvoice.startDate).toLocaleDateString('tr-TR') : '-'} - {activeInvoice?.endDate ? new Date(activeInvoice.endDate).toLocaleDateString('tr-TR') : '-'}</span>
                        </p>
                        <p className="text-[11px] font-medium text-slate-500 leading-tight">
                            Tarih: <span className="text-slate-700 font-semibold">{new Date().toLocaleDateString('tr-TR')}</span>
                        </p>
                    </div>

                    {/* Sağ Kısım: Şirket / Şoför & Araç Bilgisi */}
                    <div className="flex flex-col items-end text-right border-r-2 border-blue-800/70 pr-2.5 mr-1 shrink-0">
                        {/* Tıklanabilir İsim */}
                        {isCustomNameEditing ? (
                            <div className="flex items-center gap-1 mb-0.5 justify-end">
                                <input
                                    list="driver-suggestions"
                                    type="text"
                                    autoFocus
                                    value={customNameInput}
                                    onChange={(e) => setCustomNameInput(e.target.value.toLocaleUpperCase('tr-TR'))}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSelectName(customNameInput);
                                        if (e.key === 'Escape') setIsCustomNameEditing(false);
                                    }}
                                    onBlur={() => handleSelectName(customNameInput)}
                                    className="text-xs sm:text-sm font-black tracking-tight text-blue-950 uppercase border-b border-blue-600 outline-none text-right bg-white/80 px-1.5 py-0.5 rounded w-40 font-mono leading-none"
                                />
                                <datalist id="driver-suggestions">
                                    {driverList.map(d => (
                                        <option key={d} value={d} />
                                    ))}
                                </datalist>
                                <button
                                    type="button"
                                    onClick={() => handleSelectName(customNameInput)}
                                    className="p-0.5 text-blue-600 hover:text-blue-700 rounded cursor-pointer"
                                    title="Kaydet"
                                >
                                    <Check size={13} />
                                </button>
                            </div>
                        ) : (
                            <h2
                                onClick={() => {
                                    setCustomNameInput(ownerName);
                                    setIsCustomNameEditing(true);
                                }}
                                className="text-xs sm:text-sm font-black text-blue-950 hover:text-blue-700 uppercase tracking-tight leading-none cursor-pointer select-none transition-colors py-0.5 px-1 -mr-1 rounded hover:bg-slate-200/50 mb-0.5"
                                title="Şoför / Firma ismini değiştirmek için tıklayın"
                            >
                                {ownerName}
                            </h2>
                        )}

                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-0.5">
                            ARAÇ BİLGİSİ
                        </p>
                        <p className="text-xs sm:text-sm font-mono font-bold text-blue-950 tracking-wide leading-none mb-0.5">
                            {activeTruckData?.plate || '06 FTN 692'}
                        </p>
                        <p className="text-[9px] font-mono text-slate-500 leading-none tracking-wider font-medium">
                            Dorse: {activeTruckData?.trailerPlate || '06 FTS 692'}
                        </p>
                    </div>
                </div>

                {/* 2. ZARİF TAB BAR (İç Çerçeve 1 - Açık Tema) */}
                <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-full items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {/* Toplam Tonaj Butonu */}
                        <button
                            type="button"
                            onClick={() => setDocViewTab('summary')}
                            className={`relative flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer outline-none ${
                                docViewTab === 'summary' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                            }`}
                        >
                            {docViewTab === 'summary' && (
                                <motion.div
                                    layoutId="invoice-doc-active-tab"
                                    className="absolute inset-0 bg-slate-100 rounded-xl border border-slate-200 shadow-sm"
                                    style={{ zIndex: 0 }}
                                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                                />
                            )}
                            <Layers size={15} className="relative z-10" />
                            <span className="relative z-10">Toplam Tonaj</span>
                            <span className={`relative z-10 border text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono ${docViewTab === 'summary' ? 'bg-slate-200 border-slate-300 text-slate-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                {routeSummary.length}
                            </span>
                        </button>

                        {/* Seferler Butonu */}
                        <button
                            type="button"
                            onClick={() => setDocViewTab('trips')}
                            className={`relative flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer outline-none ${
                                docViewTab === 'trips' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                            }`}
                        >
                            {docViewTab === 'trips' && (
                                <motion.div
                                    layoutId="invoice-doc-active-tab"
                                    className="absolute inset-0 bg-slate-100 rounded-xl border border-slate-200 shadow-sm"
                                    style={{ zIndex: 0 }}
                                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                                />
                            )}
                            <ListChecks size={15} className="relative z-10" />
                            <span className="relative z-10">Seferler</span>
                            <span className={`relative z-10 border text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono ${docViewTab === 'trips' ? 'bg-slate-200 border-slate-300 text-slate-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                {(activeInvoice?.trips || []).length}
                            </span>
                        </button>
                    </div>
                </div>

                {/* 3. ANA İÇERİK ALANI (Tablo / Liste) */}
                <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
                    {!activeInvoice ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-white/[0.02] rounded-2xl border border-white/5">
                            <FileText size={48} className="mb-4 opacity-20" />
                            <p className="text-sm">Lütfen sol taraftan bir fatura seçin veya yeni periyot oluşturun.</p>
                        </div>
                    ) : (
                        <div className="absolute inset-0 w-full h-full flex flex-col pb-2 pr-1">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={docViewTab}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex flex-col h-full"
                                >
                                    {docViewTab === 'summary' && (
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full min-h-0 overflow-hidden">
                                            <div className="overflow-y-auto custom-scrollbar flex-1">
                                                <table className="w-full table-fixed text-left border-collapse">
                                                    <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-sm z-10 border-b border-slate-200">
                                                        <tr className="text-[10px] sm:text-[11px] text-slate-600 uppercase font-bold tracking-wider">
                                                            <th className="py-2.5 px-3 w-[32%]">Yükleme Yeri</th>
                                                            <th className="py-2.5 px-3 w-[38%]">Boşaltma Yeri</th>
                                                            <th className="py-2.5 px-2 text-center w-[14%]">Sefer Sayısı</th>
                                                            <th className="py-2.5 px-3 text-right w-[16%]">Toplam Tonaj</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="text-xs text-slate-700 divide-y divide-slate-100 font-medium">
                                                        {routeSummary.length > 0 ? routeSummary.map((route, i) => (
                                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                                <td className="py-2 px-3 text-slate-900 truncate" title={route.from}>
                                                                    {route.from}
                                                                </td>
                                                                <td className="py-2 px-3 text-slate-900 truncate" title={route.to}>
                                                                    {route.to}
                                                                </td>
                                                                <td className="py-2 px-2 text-center font-mono">
                                                                    <span className="inline-block bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded text-slate-700 font-semibold text-[11px]">
                                                                        {route.count}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2 px-3 text-right font-mono font-bold text-sky-600 text-xs">
                                                                    {route.tonnage.toFixed(2)} <span className="text-[10px] font-medium text-slate-500">Ton</span>
                                                                </td>
                                                            </tr>
                                                        )) : (
                                                            <tr>
                                                                <td colSpan="4" className="text-center py-8 text-slate-400 text-xs italic">Bu faturada kayıtlı güzergah bulunmuyor.</td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Toplam Tonaj Alt Barı (Tahmini Tutar ve Toplam Tonaj) */}
                                            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0 flex-wrap">
                                                    {/* Tahmini Hakediş Rozeti (Sadece imzalanmamış faturalarda görünür) */}
                                                    {activeInvoice && !isInvoiceSigned && estimatedCalculation.totalCount > 0 && (
                                                        <button 
                                                            type="button"
                                                            onClick={() => setShowPriceBreakdownModal(true)}
                                                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-95 ${
                                                                estimatedCalculation.allPriced 
                                                                    ? 'bg-blue-50 hover:bg-blue-100/80 border-blue-200 text-blue-900 shadow-xs' 
                                                                    : 'bg-amber-50 hover:bg-amber-100/80 border-amber-200 text-amber-800'
                                                            }`} 
                                                            title="Fiyat kırılımı ve eksik rota detaylarını görmek/düzenlemek için tıklayın"
                                                        >
                                                            <span className="text-[11px] font-medium text-slate-500">Tahmini Tutar:</span>
                                                            <span className="font-mono font-bold tracking-tight">
                                                                {estimatedCalculation.allPriced ? (
                                                                    `~₺${estimatedCalculation.totalPayable.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                                ) : (
                                                                    <span className="text-[10px] font-medium text-amber-700 flex items-center gap-1">
                                                                        <AlertCircle size={12} className="text-amber-600" />
                                                                        Fiyat Bilgisi Eksik
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </button>
                                                    )}

                                                    {/* Toplam Tonaj Kutusu */}
                                                    <div className="flex items-center gap-2 bg-white border border-slate-200 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 shadow-xs">
                                                        <span className="text-slate-500 font-medium">Toplam Tonaj:</span>
                                                        <span className="font-mono font-bold text-sky-600 text-sm">
                                                            {totalInvoiceTonnage.toFixed(2)} <span className="text-[11px] font-normal text-slate-500">Ton</span>
                                                        </span>
                                                    </div>
                                            </div>
                                        </div>
                                    )}

                                    {docViewTab === 'trips' && (
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full min-h-0 overflow-hidden">
                                            <div className="overflow-y-auto custom-scrollbar flex-1">
                                                <table className="w-full table-fixed text-left border-collapse">
                                                    <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-sm z-10 border-b border-slate-200">
                                                        <tr className="text-[10px] sm:text-[11px] text-slate-600 uppercase font-bold tracking-wider">
                                                            <th className="py-2.5 px-3 w-[18%]">Tarih</th>
                                                            <th className="py-2.5 px-3 w-[34%]">Yükleme Yeri</th>
                                                            <th className="py-2.5 px-3 w-[34%]">Boşaltma Yeri</th>
                                                            <th className="py-2.5 px-3 text-right w-[14%]">Tonaj</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="text-xs text-slate-700 divide-y divide-slate-100 font-medium">
                                                        {(activeInvoice?.trips || []).length > 0 ? (activeInvoice.trips || []).map((t, i) => (
                                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                                <td className="py-2 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                                                    {t.date ? new Date(t.date).toLocaleDateString('tr-TR') : '—'}
                                                                </td>
                                                                <td className="py-2 px-3 text-slate-900 truncate" title={t.from || '—'}>
                                                                    {t.from || '—'}
                                                                </td>
                                                                <td className="py-2 px-3 text-slate-900 truncate" title={t.to || '—'}>
                                                                    {t.to || '—'}
                                                                </td>
                                                                <td className="py-2 px-3 text-right font-mono font-bold text-sky-600 text-xs">
                                                                    {parseTonnageInTons(t.tonnage).toFixed(2)} <span className="text-[10px] font-medium text-slate-500">Ton</span>
                                                                </td>
                                                            </tr>
                                                        )) : (
                                                            <tr>
                                                                <td colSpan="4" className="text-center py-8 text-slate-400 text-xs italic">Bu faturada kayıtlı sefer bulunmuyor.</td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>

            {/* Gizli A4 Yazdırma Şablonu (PDF İndir Butonu İçin) */}
            <div className="hidden">
                {activeInvoice && (
                    <A4InvoicePreview
                        ref={invoicePrintRef}
                        invoiceData={activeInvoice}
                        vehicleInfo={{ plate: activeTruckData?.plate, trailerPlate: activeTruckData?.trailerPlate }}
                        netPrice={netPrice}
                        onChangeNetPrice={setNetPrice}
                        fuelRecords={fuelRecords}
                        ownerName={ownerName}
                    />
                )}
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

            {/* Tahmini Fiyat Kırılımı ve Eksik Fiyat Düzenleme Modalı (Obsidian Glass Tasarım) */}
            {showPriceBreakdownModal && activeInvoice && createPortal(
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200" onClick={() => setShowPriceBreakdownModal(false)}>
                    <div 
                        className="relative bg-gradient-to-b from-[#0e1422] to-[#070a10] rounded-3xl border border-white/10 shadow-[0_25px_70px_rgba(0,0,0,0.9)] w-full max-w-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Arka Plan Ambient Işık Efektleri */}
                        <div className="absolute -top-12 -right-12 w-64 h-64 bg-sky-500/10 blur-3xl rounded-full pointer-events-none" />
                        <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />

                        {/* Modal Header */}
                        <div className="flex justify-between items-center px-6 py-4 border-b border-white/[0.08] bg-white/[0.02] relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500/20 to-blue-600/20 border border-sky-500/30 flex items-center justify-center shadow-inner text-sky-400">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-base text-white tracking-tight flex items-center gap-2">
                                        Tahmini Hakediş & Rota Detayları
                                    </h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-xs font-mono text-slate-400">
                                            {formatFullDateRange(activeInvoice.startDate, activeInvoice.endDate, 'Seçili Dönem')}
                                        </span>
                                        <span className="text-slate-600">•</span>
                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                            estimatedCalculation.allPriced 
                                                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' 
                                                : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                                        }`}>
                                            {estimatedCalculation.knownCount} / {estimatedCalculation.totalCount} Rota Kayıtlı
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowPriceBreakdownModal(false)} 
                                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-3.5 max-h-[60vh] overflow-y-auto custom-scrollbar relative z-10">
                            {/* Eksik Fiyat Uyarısı (Sadece fiyat eksikse görünür) */}
                            {estimatedCalculation.hasMissingPrice && (
                                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3">
                                    <AlertCircle size={17} className="text-amber-400 shrink-0 mt-0.5" />
                                    <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
                                        Eksik birim fiyatları (TL/Ton) aşağıdan girip kaydedebilirsiniz. Kaydedilen fiyatlar sisteme işlenir ve tüm cihazlarınızda otomatik güncellenir.
                                    </p>
                                </div>
                            )}

                            {/* Rota Listesi */}
                            <div className="space-y-2.5">
                                {estimatedCalculation.routeDetails.map((r, idx) => {
                                    return (
                                        <div 
                                            key={idx}
                                            className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                                r.isPriced 
                                                    ? 'bg-white/[0.025] hover:bg-white/[0.05] border-white/[0.08] hover:border-sky-500/30' 
                                                    : 'bg-amber-500/[0.06] border-amber-500/25'
                                            }`}
                                        >
                                            {/* Sol: Güzergah Bilgisi */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-sm text-slate-100">
                                                        {r.from}
                                                    </span>
                                                    <span className="text-sky-400 text-xs font-mono">➔</span>
                                                    <span className="font-bold text-sm text-sky-400">
                                                        {r.to}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2.5 text-xs text-slate-400 mt-1 font-mono">
                                                    <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded-md text-[11px] text-slate-300">
                                                        {r.count} Sefer
                                                    </span>
                                                    <span className="text-slate-600">•</span>
                                                    <span className="text-slate-300 font-semibold">
                                                        {r.tonnage.toFixed(2)} Ton
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Sağ: Fiyat & Düzenleme */}
                                            <div className="flex items-center gap-2 shrink-0 justify-end">
                                                {editingRouteKey === r.key ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                autoFocus
                                                                placeholder="TL/Ton"
                                                                value={editingPriceInput}
                                                                onChange={e => setEditingPriceInput(e.target.value)}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') handleSaveRoutePrice(r.from, r.to, editingPriceInput);
                                                                    if (e.key === 'Escape') setEditingRouteKey(null);
                                                                }}
                                                                className="w-32 bg-slate-900 border border-sky-500/50 rounded-xl px-2.5 py-1.5 text-xs font-mono text-white text-right focus:outline-none focus:ring-2 focus:ring-sky-400 shadow-inner"
                                                            />
                                                            <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs font-mono">₺</span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleSaveRoutePrice(r.from, r.to, editingPriceInput)}
                                                            disabled={isSavingRoutePrice || !editingPriceInput}
                                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-md shadow-emerald-950/50"
                                                        >
                                                            <Check size={13} /> Kaydet
                                                        </button>
                                                        <button
                                                            onClick={() => { setEditingRouteKey(null); setEditingPriceInput(''); }}
                                                            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                ) : r.isPriced ? (
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="text-right font-mono bg-white/[0.03] border border-white/5 px-3 py-1.5 rounded-xl">
                                                            <div className="text-xs font-bold text-emerald-400">
                                                                ₺{r.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} <span className="text-[10px] text-slate-500 font-normal">/ Ton</span>
                                                            </div>
                                                            <div className="text-[11px] text-slate-300 font-semibold">
                                                                ~₺{r.linePayable.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setEditingRouteKey(r.key);
                                                                setEditingPriceInput(String(r.unitPrice));
                                                            }}
                                                            className="p-2 rounded-xl text-slate-400 hover:text-sky-400 hover:bg-white/5 transition cursor-pointer"
                                                            title="Birim Fiyatı Güncelle"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                placeholder="Fiyat girin..."
                                                                value={editingRouteKey === r.key ? editingPriceInput : ''}
                                                                onFocus={() => {
                                                                    setEditingRouteKey(r.key);
                                                                    setEditingPriceInput('');
                                                                }}
                                                                onChange={e => {
                                                                    setEditingRouteKey(r.key);
                                                                    setEditingPriceInput(e.target.value);
                                                                }}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') handleSaveRoutePrice(r.from, r.to, editingPriceInput);
                                                                }}
                                                                className="w-28 bg-slate-900 border border-amber-500/40 rounded-xl px-2.5 py-1.5 text-xs font-mono text-white text-right focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder:text-slate-500 shadow-inner"
                                                            />
                                                            <span className="absolute left-2.5 top-1.5 text-amber-400/60 text-xs font-mono">₺</span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleSaveRoutePrice(r.from, r.to, editingPriceInput)}
                                                            disabled={isSavingRoutePrice || !editingPriceInput}
                                                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-md shadow-amber-950/50"
                                                        >
                                                            <Check size={12} /> Ekle
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Modal Footer / Hesaplama Kartları */}
                        <div className="px-6 py-4 border-t border-white/[0.08] bg-black/40 relative z-10 flex flex-col gap-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                {/* 1. Matrah */}
                                <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2 flex flex-col">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Matrah (Net)</span>
                                    <span className="font-mono text-sm font-bold text-slate-200 mt-0.5">
                                        ₺{estimatedCalculation.totalNet.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>

                                {/* 2. KDV (2/10 Tevkifat) */}
                                <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2 flex flex-col">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Net KDV (%16)</span>
                                    <span className="font-mono text-sm font-bold text-slate-200 mt-0.5">
                                        ₺{(estimatedCalculation.totalNet * 0.16).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>

                                {/* 3. Tahmini Toplam */}
                                <div className="bg-gradient-to-br from-sky-500/20 via-blue-600/15 to-indigo-600/20 border border-sky-500/30 rounded-xl px-3.5 py-2 flex flex-col justify-center shadow-lg shadow-sky-950/40">
                                    <span className="text-[10px] text-sky-400 font-extrabold uppercase tracking-wider">Tahmini Hakediş</span>
                                    <span className="font-mono text-base font-black text-white mt-0.5">
                                        ~₺{estimatedCalculation.totalPayable.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            <div className="flex justify-end pt-1">
                                <button
                                    onClick={() => setShowPriceBreakdownModal(false)}
                                    className="px-5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white transition-all cursor-pointer border border-white/10 hover:scale-[1.02] active:scale-95"
                                >
                                    Kapat
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Invoices;

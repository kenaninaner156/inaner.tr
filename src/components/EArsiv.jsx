import React, { useState, useEffect, useContext } from 'react';
import { DataContext } from '../context/DataContext';
import { useCompany } from '../context/CompanyContext';
import { useTruck } from '../context/TruckContext';
import { auth } from '../services/firebaseConfig';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { FileText, Save, Key, RefreshCw, CheckCircle, AlertTriangle, ExternalLink, HelpCircle, X, Send, BookOpen, Settings } from 'lucide-react';

const TEVKIFAT_CODES = [
    { code: '624', rate: 20, label: '624 - Yük Taşımacılığı Hizmeti (2/10 - %20)' },
    { code: '620', rate: 50, label: '620 - Servis Taşımacılığı Hizmeti (5/10 - %50)' },
    { code: '612', rate: 90, label: '612 - Temizlik, Bahçe Bakım Hizmetleri (9/10 - %90)' }
];

const EXEMPTION_CODES = [
    { code: '350', label: '350 - KDV Kanunu Geçici Maddeler / Diğerleri' },
    { code: '311', label: '311 - Uluslararası Taşımacılık (KDV Md. 14)' },
    { code: '302', label: '302 - Hizmet İhracatı (KDV Md. 11/1-a)' },
    { code: '301', label: '301 - Mal İhracatı (KDV Md. 11/1-a)' }
];

const EArsiv = () => {
    const { invoices, addLog } = useContext(DataContext);
    const { activeCompanyId } = useCompany();
    const { trucks } = useTruck();

    // Tab state: 'list' | 'settings'
    const [activeSubTab, setActiveSubTab] = useState('list');

    // Settings state
    const [gibUsername, setGibUsername] = useState('');
    const [gibPassword, setGibPassword] = useState('');
    const [gibTestMode, setGibTestMode] = useState(true);
    const [gibClients, setGibClients] = useState({});
    
    // Default preferences state
    const [defaultInvoiceType, setDefaultInvoiceType] = useState('SATIS');
    const [defaultVatRate, setDefaultVatRate] = useState(20);
    const [defaultIsVatIncluded, setDefaultIsVatIncluded] = useState(false);
    const [defaultTevkifatKodu, setDefaultTevkifatKodu] = useState('624');
    const [defaultKdvMuafiyetKodu, setDefaultKdvMuafiyetKodu] = useState('350');
    const [defaultKdvMuafiyetNedeni, setDefaultKdvMuafiyetNedeni] = useState('');
    const [defaultBuyerVkn, setDefaultBuyerVkn] = useState('');
    const [defaultBuyerTitle, setDefaultBuyerTitle] = useState('');
    const [defaultBuyerTaxOffice, setDefaultBuyerTaxOffice] = useState('');
    const [defaultBuyerAddress, setDefaultBuyerAddress] = useState('');
    const [defaultBuyerCity, setDefaultBuyerCity] = useState('');
    const [defaultBuyerDistrict, setDefaultBuyerDistrict] = useState('');

    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [settingsStatus, setSettingsStatus] = useState({ type: '', message: '' });
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);

    // Modal state for sending invoice
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    
    // Modal Form fields
    const [invoiceType, setInvoiceType] = useState('SATIS');
    const [buyerVkn, setBuyerVkn] = useState('');
    const [buyerTitle, setBuyerTitle] = useState('');
    const [buyerTaxOffice, setBuyerTaxOffice] = useState('');
    const [buyerAddress, setBuyerAddress] = useState('');
    const [buyerCity, setBuyerCity] = useState('');
    const [buyerDistrict, setBuyerDistrict] = useState('');
    const [vatRate, setVatRate] = useState(20);
    const [isVatIncluded, setIsVatIncluded] = useState(false);
    const [tevkifatKodu, setTevkifatKodu] = useState('624');
    const [kdvMuafiyetKodu, setKdvMuafiyetKodu] = useState('350');
    const [kdvMuafiyetNedeni, setKdvMuafiyetNedeni] = useState('');
    const [invoiceNote, setInvoiceNote] = useState('');

    // Syncing state
    const [sendingInvoiceId, setSendingInvoiceId] = useState(null);
    const [syncError, setSyncError] = useState('');

    const docId = activeCompanyId === 'inaner_logistics' ? 'info' : `${activeCompanyId}_info`;

    // Listen GİB settings and saved clients from Firestore
    useEffect(() => {
        if (!activeCompanyId) return;
        setIsLoadingSettings(true);
        const docRef = doc(db, 'company_data', docId);
        
        const unsub = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setGibUsername(data.gibUsername || '');
                setGibPassword(data.gibPassword || '');
                setGibTestMode(data.gibTestMode ?? true);
                setGibClients(data.gibClients || {});
                
                // Load default preferences
                setDefaultInvoiceType(data.defaultInvoiceType || 'SATIS');
                setDefaultVatRate(data.defaultVatRate ?? 20);
                setDefaultIsVatIncluded(data.defaultIsVatIncluded ?? false);
                setDefaultTevkifatKodu(data.defaultTevkifatKodu || '624');
                setDefaultKdvMuafiyetKodu(data.defaultKdvMuafiyetKodu || '350');
                setDefaultKdvMuafiyetNedeni(data.defaultKdvMuafiyetNedeni || '');
                
                // Load default buyer details
                setDefaultBuyerVkn(data.defaultBuyerVkn || '');
                setDefaultBuyerTitle(data.defaultBuyerTitle || '');
                setDefaultBuyerTaxOffice(data.defaultBuyerTaxOffice || '');
                setDefaultBuyerAddress(data.defaultBuyerAddress || '');
                setDefaultBuyerCity(data.defaultBuyerCity || '');
                setDefaultBuyerDistrict(data.defaultBuyerDistrict || '');
            }
            setIsLoadingSettings(false);
        }, (err) => {
            console.error("GİB verileri yüklenemedi:", err);
            setIsLoadingSettings(false);
        });

        return () => unsub();
    }, [activeCompanyId, docId]);

    const handleSaveSettings = async (e) => {
        e.preventDefault();
        setSettingsStatus({ type: '', message: '' });
        setIsSavingSettings(true);

        try {
            const docRef = doc(db, 'company_data', docId);
            await setDoc(docRef, {
                gibUsername: gibUsername.trim(),
                gibPassword: gibPassword.trim(),
                gibTestMode: gibTestMode,
                // Save default preferences
                defaultInvoiceType,
                defaultVatRate: Number(defaultVatRate),
                defaultIsVatIncluded,
                defaultTevkifatKodu,
                defaultKdvMuafiyetKodu,
                defaultKdvMuafiyetNedeni: defaultKdvMuafiyetNedeni.trim(),
                // Save default buyer details
                defaultBuyerVkn: defaultBuyerVkn.trim(),
                defaultBuyerTitle: defaultBuyerTitle.trim(),
                defaultBuyerTaxOffice: defaultBuyerTaxOffice.trim(),
                defaultBuyerAddress: defaultBuyerAddress.trim(),
                defaultBuyerCity: defaultBuyerCity.trim(),
                defaultBuyerDistrict: defaultBuyerDistrict.trim()
            }, { merge: true });

            addLog('GIB_AYARLARINI_GUNCELLE', `GİB e-Arşiv entegrasyon ayarları ve tercihleri güncellendi.`);
            setSettingsStatus({ type: 'success', message: 'GİB e-Arşiv ayarları ve tercihleri başarıyla kaydedildi.' });
        } catch (err) {
            console.error("GİB ayarları kaydedilemedi:", err);
            setSettingsStatus({ type: 'error', message: 'Ayarlar kaydedilirken bir hata oluştu.' });
        } finally {
            setIsSavingSettings(false);
        }
    };

    // Auto-fill client details when VKN matches history
    const handleVknChange = (value) => {
        const cleaned = value.replace(/\s/g, '');
        setBuyerVkn(cleaned);
        
        if (gibClients && gibClients[cleaned]) {
            const c = gibClients[cleaned];
            setBuyerTitle(c.title || '');
            setBuyerTaxOffice(c.taxOffice || '');
            setBuyerAddress(c.address || '');
            setBuyerCity(c.city || '');
            setBuyerDistrict(c.district || '');
        }
    };

    const handleOpenSendModal = (invoice) => {
        if (!gibUsername || !gibPassword) {
            alert("Lütfen önce 'Bağlantı Ayarları' sekmesinden GİB e-Arşiv Kullanıcı Kodu ve Şifrenizi kaydedin.");
            setActiveSubTab('settings');
            return;
        }

        const invoiceTruck = trucks.find(t => t.id === invoice.truckId);
        const plate = invoiceTruck?.plate || 'Bilinmiyor';

        const defaultNote = `${plate !== 'Bilinmiyor' ? plate + ' plakalı araç ile ' : ''}${invoice.startDate} - ${invoice.endDate} tarihleri arasında sunulan nakliye hizmet bedelidir.`;

        // Pre-fill using saved default preferences
        setInvoiceType(defaultInvoiceType);
        setBuyerVkn(defaultBuyerVkn || '');
        setBuyerTitle(defaultBuyerTitle || '');
        setBuyerTaxOffice(defaultBuyerTaxOffice || '');
        setBuyerAddress(defaultBuyerAddress || '');
        setBuyerCity(defaultBuyerCity || '');
        setBuyerDistrict(defaultBuyerDistrict || '');
        setVatRate(defaultVatRate);
        setIsVatIncluded(defaultIsVatIncluded);
        setTevkifatKodu(defaultTevkifatKodu);
        setKdvMuafiyetKodu(defaultKdvMuafiyetKodu);
        setKdvMuafiyetNedeni(defaultKdvMuafiyetNedeni);
        
        setSelectedInvoice(invoice);
        setInvoiceNote(defaultNote);
        setSyncError('');
        setIsModalOpen(true);
    };

    const handleSendInvoiceSubmit = async (e) => {
        e.preventDefault();
        if (!selectedInvoice) return;

        setSendingInvoiceId(selectedInvoice.id);
        setIsModalOpen(false);
        setSyncError('');

        const buyerPayload = {
            taxOrIdentityNumber: buyerVkn.trim(),
            buyerTitle: buyerTitle.trim(),
            taxOffice: buyerTaxOffice.trim(),
            fullAddress: buyerAddress.trim(),
            city: buyerCity.trim(),
            district: buyerDistrict.trim()
        };

        const activeTevkifat = TEVKIFAT_CODES.find(t => t.code === tevkifatKodu);
        const tevkifatRate = activeTevkifat ? activeTevkifat.rate : 20;

        try {
            const user = auth.currentUser;
            if (!user) throw new Error("Oturum bulunamadı. Lütfen sayfayı yenileyip tekrar giriş yapın.");
            
            const idToken = await user.getIdToken();

            const response = await fetch('/api/create-gib-draft', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    invoiceId: selectedInvoice.id,
                    invoiceType,
                    buyer: buyerPayload,
                    vatRate: Number(vatRate),
                    isVatIncluded,
                    tevkifatKodu: invoiceType === 'TEVKIFAT' ? tevkifatKodu : null,
                    tevkifatRate: invoiceType === 'TEVKIFAT' ? tevkifatRate : 0,
                    kdvMuafiyetKodu: invoiceType === 'ISTISNA' ? kdvMuafiyetKodu : null,
                    kdvMuafiyetNedeni: invoiceType === 'ISTISNA' ? kdvMuafiyetNedeni : null,
                    note: invoiceNote
                })
            });

            // Read as text first to handle empty/error responses defensively
            const textResponse = await response.text();
            let result = null;
            try {
                result = JSON.parse(textResponse);
            } catch (jsonErr) {
                throw new Error(`Sunucu hatası (${response.status}): ${textResponse || 'Geriye boş yanıt döndü.'}`);
            }

            if (!response.ok || !result.success) {
                throw new Error(result.error || "GİB portalına gönderim sırasında bir hata oluştu.");
            }

            // Save client details to history (Autocomplete pool)
            const updatedClients = {
                ...(gibClients || {}),
                [buyerVkn.trim()]: {
                    vkn: buyerVkn.trim(),
                    title: buyerTitle.trim(),
                    taxOffice: buyerTaxOffice.trim(),
                    address: buyerAddress.trim(),
                    city: buyerCity.trim(),
                    district: buyerDistrict.trim()
                }
            };
            const docRef = doc(db, 'company_data', docId);
            await setDoc(docRef, { gibClients: updatedClients }, { merge: true });

            addLog('GIB_FATURA_GONDERILDI', `${selectedInvoice.docId || selectedInvoice.id} faturası GİB portalına taslak olarak başarıyla aktarıldı.`);
            alert("Fatura başarıyla GİB e-Arşiv portalında Taslak olarak oluşturuldu!");
        } catch (err) {
            console.error("GİB gönderim hatası:", err);
            setSyncError(err.message || "Fatura gönderilirken bir hata oluştu.");
        } finally {
            setSendingInvoiceId(null);
            setSelectedInvoice(null);
        }
    };

    // Filter local active invoices
    const activeInvoices = (invoices || []).filter(inv => !inv.deleted && inv.status === 'Sent');

    const gibPortalUrl = gibTestMode 
        ? "https://earsivportaltest.efatura.gov.tr/" 
        : "https://earsivportal.efatura.gov.tr/";

    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
            {/* Header */}
            <div className="glass-panel p-6 border-l-4 border-l-orange-500">
                <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2 flex items-center">
                    <FileText className="mr-2 text-orange-500" size={24} />
                    GİB e-Arşiv Fatura Entegrasyonu
                </h3>
                <p className="text-[var(--text-secondary)] text-sm">
                    Bu ekrandan sistemde onaylanan faturalarınızı GİB e-Arşiv Portalına tek tıkla **Taslak** olarak aktarabilirsiniz. Aktarım sonrası faturalarınızı portalda imzalayarak resmiyet kazandırabilirsiniz.
                </p>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-2 border-b border-[var(--border-color)] pb-px">
                <button
                    onClick={() => setActiveSubTab('list')}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
                        activeSubTab === 'list'
                            ? 'border-orange-500 text-orange-500'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Faturaları Yönet
                </button>
                <button
                    onClick={() => setActiveSubTab('settings')}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
                        activeSubTab === 'settings'
                            ? 'border-orange-500 text-orange-500'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Bağlantı Ayarları
                </button>
            </div>

            {/* Error Message */}
            {syncError && (
                <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm">
                    <AlertTriangle size={18} className="shrink-0" />
                    <div>
                        <span className="font-semibold">Aktarım Hatası:</span> {syncError}
                    </div>
                </div>
            )}

            {/* List Tab */}
            {activeSubTab === 'list' && (
                <div className="glass-panel overflow-hidden">
                    <div className="p-4 bg-slate-900/40 border-b border-[var(--border-color)] flex items-center justify-between">
                        <span className="text-sm font-bold text-[var(--text-primary)]">
                            Gönderilebilir Faturalar ({activeInvoices.length})
                        </span>
                        <a 
                            href={gibPortalUrl}
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 font-semibold transition"
                        >
                            GİB e-Arşiv Portalına Git <ExternalLink size={12} />
                        </a>
                    </div>

                    {isLoadingSettings ? (
                        <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                            <RefreshCw size={24} className="animate-spin text-orange-500" />
                            <span>Veriler yükleniyor...</span>
                        </div>
                    ) : activeInvoices.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">
                            Gönderilmeyi bekleyen veya onaylanmış fatura bulunmamaktadır.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead>
                                    <tr className="bg-slate-950/20 text-[var(--text-secondary)] text-xs uppercase tracking-wider border-b border-[var(--border-color)]">
                                        <th className="p-4 font-semibold">Fatura No</th>
                                        <th className="p-4 font-semibold">Araç / Plaka</th>
                                        <th className="p-4 font-semibold">Dönem</th>
                                        <th className="p-4 font-semibold">Tutar</th>
                                        <th className="p-4 font-semibold">GİB e-Arşiv Durumu</th>
                                        <th className="p-4 font-semibold text-right">İşlem</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-color)]">
                                    {activeInvoices.map((inv) => {
                                        const isDraftOnGib = inv.gibStatus === 'Draft';
                                        const isSending = sendingInvoiceId === inv.id;
                                        const invTruck = trucks.find(t => t.id === inv.truckId);
                                        const plate = invTruck?.plate || '—';

                                        return (
                                            <tr key={inv.id} className="hover:bg-white/[0.01] transition-colors">
                                                <td className="p-4 font-semibold text-[var(--text-primary)]">
                                                    {inv.docId || inv.id}
                                                </td>
                                                <td className="p-4 text-[var(--text-secondary)] font-mono font-bold">
                                                    {plate}
                                                </td>
                                                <td className="p-4 text-[var(--text-secondary)] text-xs">
                                                    {inv.startDate} - {inv.endDate}
                                                </td>
                                                <td className="p-4 text-emerald-400 font-bold">
                                                    {inv.grandTotal?.toLocaleString('tr-TR')} ₺
                                                </td>
                                                <td className="p-4">
                                                    {isDraftOnGib ? (
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="inline-flex items-center gap-1 text-xs bg-orange-500/10 border border-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-medium w-fit">
                                                                <CheckCircle size={12} /> GİB'de Taslak {inv.gibTestMode && "(TEST)"}
                                                            </span>
                                                            <span className="text-[10px] text-slate-500 font-mono select-all">
                                                                UUID: {inv.gibUuid}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="inline-flex items-center text-xs bg-slate-800 border border-slate-700 text-slate-400 px-2 py-0.5 rounded-full font-medium">
                                                            GİB'e Gönderilmedi
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-right">
                                                    {isDraftOnGib ? (
                                                        <a
                                                            href={gibPortalUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-xs font-semibold bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 px-3 py-1.5 rounded-lg transition"
                                                        >
                                                            Portalda İmzala <ExternalLink size={12} />
                                                        </a>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleOpenSendModal(inv)}
                                                            disabled={isSending}
                                                            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                                                        >
                                                            {isSending ? (
                                                                <>
                                                                    <RefreshCw size={12} className="animate-spin" />
                                                                    Gönderiliyor...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    GİB'e Taslak Gönder
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Settings Tab */}
            {activeSubTab === 'settings' && (
                <div className="glass-panel p-6 space-y-6">
                    <div>
                        <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center">
                            <Key className="mr-2 text-orange-500" size={20} />
                            GİB Portal Giriş Bilgileri
                        </h4>
                        
                        <form onSubmit={handleSaveSettings} className="max-w-xl space-y-5">
                            <div className="bg-orange-500/10 border border-orange-500/20 text-orange-400 p-4 rounded-xl text-xs space-y-1">
                                <span className="font-bold flex items-center gap-1 mb-1">
                                    <HelpCircle size={14} /> Önemli Bilgilendirme
                                </span>
                                <p>GİB e-Arşiv şifreniz İnteraktif Vergi Dairesi (İVD) giriş şifrenizdir. Bu bilgiler SSL ile korunmakta ve fatura taslağı oluşturmak haricinde hiçbir amaçla kullanılmamaktadır.</p>
                                <p className="mt-1 font-semibold">Lütfen canlı ortamda resmi fatura kesmeden önce **Test Modu**'nu aktif ederek deneme yapın.</p>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                                    Kullanıcı Kodu (VKN / TCKN)
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={gibUsername}
                                    onChange={(e) => setGibUsername(e.target.value)}
                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 text-sm focus:border-orange-500 outline-none"
                                    placeholder="GİB Kullanıcı Kodunuz veya VKN/TCKN"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                                    GİB Portal Şifresi
                                </label>
                                <input
                                    type="password"
                                    required
                                    value={gibPassword}
                                    onChange={(e) => setGibPassword(e.target.value)}
                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 text-sm focus:border-orange-500 outline-none"
                                    placeholder="GİB / İnteraktif Vergi Dairesi Şifreniz"
                                />
                            </div>

                            {/* Test Mode Switcher */}
                            <div className="flex items-center justify-between p-4 bg-slate-900/30 border border-[var(--border-color)] rounded-xl">
                                <div className="space-y-0.5">
                                    <div className="text-sm font-semibold text-[var(--text-primary)]">GİB Test Portalı Modu</div>
                                    <div className="text-xs text-[var(--text-secondary)]">Açık olduğunda earsivportaltest.efatura.gov.tr üzerinde işlem yapar (Resmi fatura kesilmez).</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setGibTestMode(!gibTestMode)}
                                    className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 outline-none flex items-center ${
                                        gibTestMode ? 'bg-orange-500' : 'bg-slate-800 border border-[var(--border-color)]'
                                    }`}
                                >
                                    <div
                                        className={`w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200 ${
                                            gibTestMode ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            {/* PREFERRED DEFAULTS SECTION */}
                            <div className="border-t border-[var(--border-color)] pt-6 mt-6">
                                <h4 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center">
                                    <Settings className="mr-2 text-orange-500" size={18} />
                                    Varsayılan Fatura Tercihleri
                                </h4>
                                
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Varsayılan Fatura Tipi
                                            </label>
                                            <select
                                                value={defaultInvoiceType}
                                                onChange={(e) => setDefaultInvoiceType(e.target.value)}
                                                className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none"
                                            >
                                                <option value="SATIS">SATIŞ FATURASI</option>
                                                <option value="TEVKIFAT">TEVKİFATLI FATURA</option>
                                                <option value="ISTISNA">İSTİSNA (KDV MUAFİYETLİ)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Varsayılan KDV Oranı
                                            </label>
                                            <select
                                                value={defaultVatRate}
                                                onChange={(e) => setDefaultVatRate(Number(e.target.value))}
                                                className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none"
                                            >
                                                <option value={20}>%20</option>
                                                <option value={10}>%10</option>
                                                <option value={0}>%0</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Hesaplama Türü
                                            </label>
                                            <div className="flex gap-2 mt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setDefaultIsVatIncluded(false)}
                                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition ${
                                                        !defaultIsVatIncluded 
                                                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' 
                                                            : 'bg-transparent text-slate-400 border-[var(--border-color)]'
                                                    }`}
                                                >
                                                    KDV Hariç
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDefaultIsVatIncluded(true)}
                                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition ${
                                                        defaultIsVatIncluded 
                                                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' 
                                                            : 'bg-transparent text-slate-400 border-[var(--border-color)]'
                                                    }`}
                                                >
                                                    KDV Dahil
                                                </button>
                                            </div>
                                        </div>

                                        {defaultInvoiceType === 'TEVKIFAT' && (
                                            <div>
                                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                    Varsayılan Tevkifat Kodu
                                                </label>
                                                <select
                                                    value={defaultTevkifatKodu}
                                                    onChange={(e) => setDefaultTevkifatKodu(e.target.value)}
                                                    className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none"
                                                >
                                                    {TEVKIFAT_CODES.map(t => (
                                                        <option key={t.code} value={t.code}>{t.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {defaultInvoiceType === 'ISTISNA' && (
                                            <div>
                                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                    Varsayılan Muafiyet Kodu
                                                </label>
                                                <select
                                                    value={defaultKdvMuafiyetKodu}
                                                    onChange={(e) => setDefaultKdvMuafiyetKodu(e.target.value)}
                                                    className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none"
                                                >
                                                    {EXEMPTION_CODES.map(e => (
                                                        <option key={e.code} value={e.code}>{e.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    {defaultInvoiceType === 'ISTISNA' && (
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Varsayılan Muafiyet Nedeni Açıklaması
                                            </label>
                                            <input
                                                type="text"
                                                value={defaultKdvMuafiyetNedeni}
                                                onChange={(e) => setDefaultKdvMuafiyetNedeni(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="Örn: 306/1-a Maddesi Kapsamında Uluslararası Nakliye..."
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* DEFAULT BUYER INFORMATION SECTION */}
                            <div className="border-t border-[var(--border-color)] pt-6 mt-6">
                                <h4 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center">
                                    <BookOpen className="mr-2 text-orange-500" size={18} />
                                    Varsayılan Alıcı (Müşteri) Bilgileri
                                </h4>
                                
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Varsayılan Alıcı TCKN / VKN
                                            </label>
                                            <input
                                                type="text"
                                                maxLength={11}
                                                value={defaultBuyerVkn}
                                                onChange={(e) => setDefaultBuyerVkn(e.target.value.replace(/\s/g, ''))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="10 veya 11 haneli numara"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Varsayılan Alıcı Unvanı / Adı Soyadı
                                            </label>
                                            <input
                                                type="text"
                                                value={defaultBuyerTitle}
                                                onChange={(e) => setDefaultBuyerTitle(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="Şirket unvanı veya ad soyad"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Vergi Dairesi
                                            </label>
                                            <input
                                                type="text"
                                                value={defaultBuyerTaxOffice}
                                                onChange={(e) => setDefaultBuyerTaxOffice(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="Vergi Dairesi"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                İlçe / Mahalle
                                            </label>
                                            <input
                                                type="text"
                                                value={defaultBuyerDistrict}
                                                onChange={(e) => setDefaultBuyerDistrict(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="İlçe"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                                Şehir (İl)
                                            </label>
                                            <input
                                                type="text"
                                                value={defaultBuyerCity}
                                                onChange={(e) => setDefaultBuyerCity(e.target.value.toLocaleUpperCase('tr-TR'))}
                                                className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:border-orange-500 outline-none"
                                                placeholder="Şehir"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                            Açık Adres
                                        </label>
                                        <textarea
                                            value={defaultBuyerAddress}
                                            onChange={(e) => setDefaultBuyerAddress(e.target.value.toLocaleUpperCase('tr-TR'))}
                                            rows={2}
                                            className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:border-orange-500 outline-none resize-none"
                                            placeholder="Detaylı adres..."
                                        />
                                    </div>
                                </div>
                            </div>

                            {settingsStatus.message && (
                                <div className={`flex items-center gap-2 text-sm p-3 rounded-md border ${
                                    settingsStatus.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                }`}>
                                    {settingsStatus.type === 'error' ? <AlertTriangle size={16}/> : <CheckCircle size={16}/>}
                                    {settingsStatus.message}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isSavingSettings}
                                className="w-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isSavingSettings ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin" />
                                        Kaydediliyor...
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} /> GİB Ayarlarını ve Tercihlerini Kaydet
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* SENDING MODAL OVERLAY */}
            {isModalOpen && selectedInvoice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="glass-panel w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between bg-slate-900/40">
                            <div className="flex items-center gap-2">
                                <FileText className="text-orange-500" size={20} />
                                <span className="font-bold text-md text-[var(--text-primary)]">
                                    GİB Fatura Detayları ({selectedInvoice.docId || selectedInvoice.id})
                                </span>
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-200 p-1 bg-[var(--bg-panel-hover)] rounded-md transition"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSendInvoiceSubmit} className="flex-1 p-6 space-y-4 overflow-y-auto">
                            {/* Inovice Type and Calculation Type */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900/20 p-4 border border-[var(--border-color)] rounded-xl">
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                        Fatura Tipi
                                    </label>
                                    <select
                                        value={invoiceType}
                                        onChange={(e) => setInvoiceType(e.target.value)}
                                        className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-1.5 text-xs focus:border-orange-500 outline-none"
                                    >
                                        <option value="SATIS">SATIŞ</option>
                                        <option value="TEVKIFAT">TEVKİFAT</option>
                                        <option value="ISTISNA">İSTİSNA</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                        KDV Oranı
                                    </label>
                                    <select
                                        value={vatRate}
                                        onChange={(e) => setVatRate(Number(e.target.value))}
                                        className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-1.5 text-xs focus:border-orange-500 outline-none"
                                    >
                                        <option value={20}>%20</option>
                                        <option value={10}>%10</option>
                                        <option value={0}>%0</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                        Hesaplama Türü
                                    </label>
                                    <div className="flex gap-1 mt-0.5">
                                        <button
                                            type="button"
                                            onClick={() => setIsVatIncluded(false)}
                                            className={`flex-1 py-1 text-[10px] font-semibold rounded-lg border transition ${
                                                !isVatIncluded 
                                                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' 
                                                    : 'bg-transparent text-slate-400 border-[var(--border-color)]'
                                            }`}
                                        >
                                            KDV Hariç
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsVatIncluded(true)}
                                            className={`flex-1 py-1 text-[10px] font-semibold rounded-lg border transition ${
                                                isVatIncluded 
                                                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' 
                                                    : 'bg-transparent text-slate-400 border-[var(--border-color)]'
                                            }`}
                                        >
                                            KDV Dahil
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Conditionally render Tevkifat parameters */}
                            {invoiceType === 'TEVKIFAT' && (
                                <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-2">
                                    <label className="block text-xs font-semibold text-indigo-400">
                                        Tevkifat Kodu ve Oranı
                                    </label>
                                    <select
                                        value={tevkifatKodu}
                                        onChange={(e) => setTevkifatKodu(e.target.value)}
                                        className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none"
                                    >
                                        {TEVKIFAT_CODES.map(t => (
                                            <option key={t.code} value={t.code}>{t.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Conditionally render Exemption parameters */}
                            {invoiceType === 'ISTISNA' && (
                                <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl space-y-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-orange-400 mb-1">
                                            KDV İstisna Kodu
                                        </label>
                                        <select
                                            value={kdvMuafiyetKodu}
                                            onChange={(e) => setKdvMuafiyetKodu(e.target.value)}
                                            className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none"
                                        >
                                            {EXEMPTION_CODES.map(e => (
                                                <option key={e.code} value={e.code}>{e.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-orange-400 mb-1">
                                            KDV İstisna Nedeni Açıklaması
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={kdvMuafiyetNedeni}
                                            onChange={(e) => setKdvMuafiyetNedeni(e.target.value.toLocaleUpperCase('tr-TR'))}
                                            className="w-full bg-slate-900 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none"
                                            placeholder="Örn: 306/1-a Maddesi Kapsamında Uluslararası Nakliye..."
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Client VKN and Title */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                                            Alıcı TCKN / VKN *
                                        </label>
                                        {Object.keys(gibClients || {}).length > 0 && (
                                            <select
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        handleVknChange(e.target.value);
                                                    }
                                                }}
                                                className="text-[10px] bg-slate-950 border border-[var(--border-color)] text-orange-400 rounded px-1.5 py-0.5 outline-none max-w-[180px] font-medium"
                                                defaultValue=""
                                            >
                                                <option value="" disabled>Kayıtlı Müşteri Seç</option>
                                                {Object.values(gibClients).map(c => (
                                                    <option key={c.vkn} value={c.vkn}>
                                                        {c.title.length > 20 ? c.title.substring(0, 18) + '...' : c.title}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            required
                                            maxLength={11}
                                            value={buyerVkn}
                                            onChange={(e) => handleVknChange(e.target.value)}
                                            className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg pl-9 pr-4 py-2 text-sm focus:border-orange-500 outline-none"
                                            placeholder="11 haneli TCKN veya 10 haneli VKN"
                                        />
                                        <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                                    </div>
                                    {buyerVkn && gibClients[buyerVkn] && (
                                        <span className="text-[10px] text-emerald-400 mt-1 block">
                                            ✓ Kayıtlı müşteri bilgileri otomatik dolduruldu.
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                        Alıcı Unvanı / Adı Soyadı
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={buyerTitle}
                                        onChange={(e) => setBuyerTitle(e.target.value.toLocaleUpperCase('tr-TR'))}
                                        className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none"
                                        placeholder="Şirket unvanı veya şahıs adı soyadı"
                                    />
                                </div>
                            </div>

                            {/* Tax Office, City, District */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-1">
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                        Vergi Dairesi
                                    </label>
                                    <input
                                        type="text"
                                        value={buyerTaxOffice}
                                        onChange={(e) => setBuyerTaxOffice(e.target.value.toLocaleUpperCase('tr-TR'))}
                                        className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none"
                                        placeholder="Vergi Dairesi adı"
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                        İlçe / Mahalle
                                    </label>
                                    <input
                                        type="text"
                                        value={buyerDistrict}
                                        onChange={(e) => setBuyerDistrict(e.target.value.toLocaleUpperCase('tr-TR'))}
                                        className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none"
                                        placeholder="İlçe veya mahalle"
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                        Şehir (İl)
                                    </label>
                                    <input
                                        type="text"
                                        value={buyerCity}
                                        onChange={(e) => setBuyerCity(e.target.value.toLocaleUpperCase('tr-TR'))}
                                        className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none"
                                        placeholder="Şehir"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                    Açık Adres
                                </label>
                                <textarea
                                    value={buyerAddress}
                                    onChange={(e) => setBuyerAddress(e.target.value.toLocaleUpperCase('tr-TR'))}
                                    rows={2}
                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none resize-none"
                                    placeholder="Sokak, bulvar, apartman no ve detaylı adres..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                                    Fatura Açıklaması (GİB Notu)
                                </label>
                                <textarea
                                    value={invoiceNote}
                                    onChange={(e) => setInvoiceNote(e.target.value)}
                                    rows={2}
                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm focus:border-orange-500 outline-none resize-none"
                                    placeholder="Faturada görünecek açıklama notu..."
                                />
                            </div>

                            {/* Footer Buttons inside Modal */}
                            <div className="pt-4 border-t border-[var(--border-color)] flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 bg-[var(--bg-panel-hover)] hover:bg-[var(--bg-panel-hover)]/80 text-[var(--text-secondary)] border border-[var(--border-color)] py-2.5 rounded-lg text-sm font-semibold transition"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
                                >
                                    <Send size={14} /> GİB Portalına Aktar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EArsiv;

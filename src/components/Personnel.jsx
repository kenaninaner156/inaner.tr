import React, { useContext, useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Truck, ShieldAlert, Calendar, Plus, Search, Filter, Phone, Mail,
    MapPin, CreditCard, FileText, CheckCircle2, AlertTriangle, Clock, Trash2,
    Edit3, ExternalLink, Download, ChevronLeft, ChevronRight, X, UserPlus,
    Printer, Save, PlusCircle, Paperclip, StickyNote, Copy, Check, Eye,
    DollarSign, Briefcase, HeartPulse, Award, FileCheck, Shield, ChevronDown,
    Menu, AlertCircle, ArrowUpRight, ArrowDownLeft, UploadCloud, RefreshCw
} from 'lucide-react';
import { DataContext } from '../context/DataContext';
import { useTruck } from '../context/TruckContext';
import { useCompany } from '../context/CompanyContext';
import PersonnelPeriodModal from './PersonnelPeriodModal';
import A4PersonnelPreview from './A4PersonnelPreview';
import FileUpload from './FileUpload';
import { doc, writeBatch, collection, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { sendDiscordAlert } from '../services/discordWebhook';
import { parseTonnageInTons } from '../utils/tonnageUtils';
import { uploadToCloudinary } from '../services/cloudinaryService';

// Sabit Seçenekler ve Roller (Türkçe ve Emojisiz)
const ROLE_OPTIONS = [
    { value: 'driver_long', label: 'Ağır Vasıta Şoförü (Uzunyol)', isDriver: true },
    { value: 'driver_local', label: 'Ağır Vasıta Şoförü (Yurtiçi)', isDriver: true },
    { value: 'dispatcher', label: 'Sevkiyat & Filo Yöneticisi', isDriver: false },
    { value: 'mechanic', label: 'Kademe / Başusta', isDriver: false },
    { value: 'office', label: 'Muhasebe / Ofis Personeli', isDriver: false },
    { value: 'other', label: 'Diğer Personel', isDriver: false },
];

const STATUS_OPTIONS = [
    { value: 'active', label: 'Aktif Çalışan', badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    { value: 'on_leave', label: 'Yıllık İzinde', badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    { value: 'medical_leave', label: 'Raporlu', badgeClass: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
    { value: 'terminated', label: 'Ayrıldı', badgeClass: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
];

const LICENSE_CLASS_OPTIONS = ['CE', 'C', 'D', 'B', 'A2'];
const SRC_TYPE_OPTIONS = ['SRC 1', 'SRC 2', 'SRC 3 (Uluslararası)', 'SRC 4 (Yurtiçi)', 'SRC 5 (ADR)'];
const BLOOD_TYPES = ['A+', '0+', 'B+', 'AB+', 'A-', '0-', 'B-', 'AB-'];

// Kıdem Hesaplama Yardımcısı
const calculateSeniority = (hireDate, leaveDate) => {
    if (!hireDate) return '—';
    const start = new Date(hireDate);
    const end = leaveDate ? new Date(leaveDate) : new Date();
    if (isNaN(start.getTime())) return '—';
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();
    if (days < 0) {
        months -= 1;
        const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
        days += prevMonth.getDate();
    }
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    const parts = [];
    if (years > 0) parts.push(`${years} Yıl`);
    if (months > 0) parts.push(`${months} Ay`);
    if (parts.length === 0) parts.push(`${days} Gün`);
    return parts.join(' ');
};

// Evrak Durum & Radar Analizi
const getDocumentStatus = (expiryDate) => {
    if (!expiryDate) return { status: 'missing', label: null, days: null, badgeClass: '' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expiryDate);
    exp.setHours(0, 0, 0, 0);
    const diffTime = exp.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { status: 'expired', label: 'Süresi Doldu', days: diffDays, badgeClass: 'text-red-400 bg-red-500/10 border-red-500/20' };
    }
    if (diffDays <= 30) {
        return { status: 'critical', label: `${diffDays} Gün Kaldı`, days: diffDays, badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
    }
    if (diffDays <= 90) {
        return { status: 'approaching', label: `${diffDays} Gün Kaldı`, days: diffDays, badgeClass: 'text-sky-400 bg-sky-500/10 border-sky-500/20' };
    }
    return { status: 'valid', label: `${diffDays} Gün Kaldı`, days: diffDays, badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
};

// SGK Kanuni Vade ve Kalan Gün Hesaplama (Takip eden ayın son günü)
const getSgkDueDate = () => {
    const now = new Date();
    // Takip eden ayın son günü
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const diffTime = nextMonthEnd.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const dateFormatted = nextMonthEnd.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    const periodName = nextMonthEnd.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
    return { nextMonthEnd, daysRemaining, dateFormatted, periodName };
};

// Personel Özlük & Evrak Tamamlanma Oranı
const getPersonnelCompleteness = (person) => {
    if (!person) return { percent: 0, missingCount: 0, missingList: [] };
    const requiredChecks = [
        { key: 'tcNo', label: 'T.C. Kimlik No', tab: 'identity' },
        { key: 'phone', label: 'Telefon', tab: 'identity' },
        { key: 'sgkNo', label: 'SGK Sicil No', tab: 'sgk' },
        { key: 'licenseExpiry', label: 'Ehliyet Belgesi', tab: 'documents' },
        { key: 'srcExpiry', label: 'SRC Belgesi', tab: 'documents' },
        { key: 'psikoteknikExpiry', label: 'Psikoteknik', tab: 'documents' },
        { key: 'tachographExpiry', label: 'Takograf Kartı', tab: 'documents' },
    ];

    const roleLower = (person.role || '').toLowerCase();
    const isDriver = !person.role ||
        roleLower.includes('driver') ||
        roleLower.includes('şoför') ||
        roleLower.includes('sofor') ||
        roleLower.includes('kaptan') ||
        roleLower === 'driver_long' ||
        roleLower === 'driver_local';

    const applicableChecks = isDriver ? requiredChecks : requiredChecks.filter(c => c.tab !== 'documents');

    const missingList = [];
    let filled = 0;
    applicableChecks.forEach(c => {
        if (person[c.key] && String(person[c.key]).trim().length > 0) {
            filled++;
        } else {
            missingList.push(c);
        }
    });

    const percent = applicableChecks.length > 0 ? Math.round((filled / applicableChecks.length) * 100) : 100;
    return { percent, missingCount: missingList.length, missingList };
};

// PDF Görüntüleme Bileşeni (Hak Ediş ve Belgeler İçin)
const EmbeddedPdfViewer = ({ files, title = 'Belge İnceleme' }) => {
    return (
        <div className="w-full flex flex-col rounded-xl overflow-hidden border border-white/[0.08] shadow-2xl h-full bg-[#0a0d14]">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#0f131d] border-b border-white/[0.08] shrink-0">
                <div className="flex items-center gap-2">
                    <FileText size={15} className="text-amber-400 shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-white truncate">
                        {files[0]?.name || title}
                    </span>
                </div>
                {files.length > 1 && (
                    <span className="text-xs text-slate-400 px-2 py-0.5 rounded-md bg-white/5">{files.length} dosya</span>
                )}
            </div>
            <div className="relative flex-1 min-h-0 bg-slate-950 overflow-hidden">
                {files.map((f, i) => (
                    <iframe
                        key={i}
                        src={`${f.data || f.url}#toolbar=0&navpanes=0&view=FitH`}
                        title={f.name || `Belge ${i + 1}`}
                        className="w-full h-full border-none block"
                    />
                ))}
            </div>
        </div>
    );
};

const Personnel = ({ onOpenMenu, isMobile } = {}) => {
    const {
        trips, payouts, addPayout, deletePayout, updatePayout, addLog, allDrivers,
        personnelList, addPersonnel, updatePersonnel, deletePersonnel,
        paymentRecords, addPayment, updatePayment, deletePayment
    } = useContext(DataContext);
    const { activeTruckData, trucks } = useTruck();
    const { activeCompanyId } = useCompany();
    const payoutPrintRef = useRef(null);

    // Ana Alt Sekmeler: 'directory' (Özlük & Rehber), 'radar' (Evraklar), 'payments' (SGK & Maaş), 'payouts' (Prim Hak Edişi)
    const [activeSubTab, setActiveSubTab] = useState('directory');

    // Master-Detail Seçili Personel
    const [selectedPersonnelId, setSelectedPersonnelId] = useState(null);
    const [mobileView, setMobileView] = useState('list'); // 'list' | 'detail'

    // Rehber Filtreleri
    const [directorySearch, setDirectorySearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('active');

    // Evraklar Filtresi
    const [radarFilter, setRadarFilter] = useState('all'); // 'all' | 'expired' | 'critical' | 'approaching'
    const [radarSearch, setRadarSearch] = useState('');

    // Modal State'leri
    const [isPersonnelModalOpen, setIsPersonnelModalOpen] = useState(false);
    const [personnelModalMode, setPersonnelModalMode] = useState('add'); // 'add' | 'edit'
    const [personnelFormTab, setPersonnelFormTab] = useState('identity'); // 'identity' | 'sgk' | 'documents' | 'assets' | 'files'
    const [editingPersonnel, setEditingPersonnel] = useState(null);
    const [isSavingPersonnel, setIsSavingPersonnel] = useState(false);

    // SGK Prim & Vergi Takip Masası State'leri
    const [isSgkFormOpen, setIsSgkFormOpen] = useState(false);
    const [editingSgkId, setEditingSgkId] = useState(null);
    const [isSavingSgk, setIsSavingSgk] = useState(false);
    const [sgkFormData, setSgkFormData] = useState({
        period: new Date().toISOString().slice(0, 7),
        date: new Date().toISOString().split('T')[0],
        amount: '',
        status: 'paid',
        description: 'SGK Prim Tahakkuk & Ödemesi',
        note: '',
        files: []
    });

    // Not Ekleme State'i
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [newNoteText, setNewNoteText] = useState('');

    // Belge Önizleme Modalı
    const [previewDoc, setPreviewDoc] = useState(null);

    // Kopyalama Toast State'i
    const [copiedField, setCopiedField] = useState(null);

    // Sağ Bento Bölümü İç Sekme: 'notes' | 'docs' | 'payouts'
    const [detailRightTab, setDetailRightTab] = useState('notes');

    // ── Hak Ediş (Mevcut Payout Engine) State'leri ──
    const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
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
    const [viewMode, setViewMode] = useState('sefer');
    const [viewModePayoutId, setViewModePayoutId] = useState(null);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [isViewingOldPayout, setIsViewingOldPayout] = useState(false);
    const [showOldPayoutWarning, setShowOldPayoutWarning] = useState(false);

    // Sadece Hak Ediş Bekleyen Seferler listesi
    const availableTrips = useMemo(() => {
        return (trips || []).filter(t => !t.deleted && t.premiumStatus !== 'paid' && (Number(t.premiumAmount) > 0 || t.premiumId));
    }, [trips]);

    // Seçili personeli otomatik ilk kayda ata
    useEffect(() => {
        if (!selectedPersonnelId && personnelList && personnelList.length > 0) {
            setSelectedPersonnelId(personnelList[0].id);
        }
    }, [personnelList, selectedPersonnelId]);

    // Seçili Personel Nesnesi
    const selectedPersonnel = useMemo(() => {
        return (personnelList || []).find(p => p.id === selectedPersonnelId) || null;
    }, [personnelList, selectedPersonnelId]);

    // Kopyalama Fonksiyonu
    const handleCopy = (text, fieldName) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedField(fieldName);
        setTimeout(() => setCopiedField(null), 2000);
    };

    // ── FORM STATE BAŞLATMA (Personel Ekle/Düzenle) ──
    const [formData, setFormData] = useState({
        fullName: '',
        tcNo: '',
        phone: '',
        email: '',
        birthDate: '',
        bloodType: '',
        address: '',
        emergencyContact: { name: '', relation: '', phone: '' },
        avatarUrl: '',
        role: 'driver_long',
        employmentStatus: 'active',
        hireDate: new Date().toISOString().split('T')[0],
        leaveDate: '',
        terminationReason: '',
        sgkNo: '',
        sgkOccupationCode: '8332.01',
        baseSalary: '',
        salaryDay: '5',
        isFamilyMember: false,
        bankName: '',
        iban: '',
        licenseClasses: ['CE'],
        licenseExpiry: '',
        srcTypes: ['SRC 3', 'SRC 4'],
        srcExpiry: '',
        psikoteknikExpiry: '',
        tachographCardNo: '',
        tachographExpiry: '',
        healthReportExpiry: '',
        criminalRecordDate: '',
        assignedTruckPlate: '',
        assignedTrailerPlate: '',
        assignedPhone: '',
        assignedFuelCard: '',
        assignedHgs: '',
        inventoryNotes: '',
        documents: [],
        notes: []
    });

    const openAddPersonnelModal = () => {
        setPersonnelModalMode('add');
        setPersonnelFormTab('identity');
        setFormData({
            fullName: '',
            tcNo: '',
            phone: '',
            email: '',
            birthDate: '',
            bloodType: 'A+',
            address: '',
            emergencyContact: { name: '', relation: '', phone: '' },
            avatarUrl: '',
            role: 'driver_long',
            employmentStatus: 'active',
            hireDate: new Date().toISOString().split('T')[0],
            leaveDate: '',
            terminationReason: '',
            sgkNo: '',
            sgkOccupationCode: '8332.01',
            baseSalary: '',
            salaryDay: '5',
            isFamilyMember: false,
            bankName: '',
            iban: '',
            licenseClasses: ['CE', 'C'],
            licenseExpiry: '',
            srcTypes: ['SRC 3', 'SRC 4'],
            srcExpiry: '',
            psikoteknikExpiry: '',
            tachographCardNo: '',
            tachographExpiry: '',
            healthReportExpiry: '',
            criminalRecordDate: '',
            assignedTruckPlate: activeTruckData?.plate || '',
            assignedTrailerPlate: activeTruckData?.trailerPlate || '',
            assignedPhone: '',
            assignedFuelCard: '',
            assignedHgs: '',
            inventoryNotes: '',
            documents: [],
            notes: []
        });
        setIsPersonnelModalOpen(true);
    };

    const openEditPersonnelModal = (person, targetTab = 'identity') => {
        setPersonnelModalMode('edit');
        setEditingPersonnel(person);
        setPersonnelFormTab(targetTab);
        setFormData({
            fullName: person.fullName || '',
            tcNo: person.tcNo || '',
            phone: person.phone || '',
            email: person.email || '',
            birthDate: person.birthDate || '',
            bloodType: person.bloodType || 'A+',
            address: person.address || '',
            emergencyContact: person.emergencyContact || { name: '', relation: '', phone: '' },
            avatarUrl: person.avatarUrl || '',
            role: person.role || 'driver_long',
            employmentStatus: person.employmentStatus || 'active',
            hireDate: person.hireDate || '',
            leaveDate: person.leaveDate || '',
            terminationReason: person.terminationReason || '',
            sgkNo: person.sgkNo || '',
            sgkOccupationCode: person.sgkOccupationCode || '8332.01',
            baseSalary: person.baseSalary || '',
            salaryDay: person.salaryDay || '5',
            isFamilyMember: !!person.isFamilyMember,
            bankName: person.bankName || '',
            iban: person.iban || '',
            licenseClasses: person.licenseClasses || ['CE'],
            licenseExpiry: person.licenseExpiry || '',
            srcTypes: person.srcTypes || ['SRC 3', 'SRC 4'],
            srcExpiry: person.srcExpiry || '',
            psikoteknikExpiry: person.psikoteknikExpiry || '',
            tachographCardNo: person.tachographCardNo || '',
            tachographExpiry: person.tachographExpiry || '',
            healthReportExpiry: person.healthReportExpiry || '',
            criminalRecordDate: person.criminalRecordDate || '',
            assignedTruckPlate: person.assignedTruckPlate || '',
            assignedTrailerPlate: person.assignedTrailerPlate || '',
            assignedPhone: person.assignedPhone || '',
            assignedFuelCard: person.assignedFuelCard || '',
            assignedHgs: person.assignedHgs || '',
            inventoryNotes: person.inventoryNotes || '',
            documents: person.documents || [],
            notes: person.notes || []
        });
        setIsPersonnelModalOpen(true);
    };

    const handleSavePersonnel = async (e) => {
        e?.preventDefault();
        if (!formData.fullName.trim()) {
            alert('Lütfen personelin adını ve soyadını giriniz.');
            return;
        }

        setIsSavingPersonnel(true);
        try {
            const payload = {
                ...formData,
                fullName: formData.fullName.trim(),
                tcNo: (formData.tcNo || '').trim(),
                baseSalary: formData.baseSalary ? Number(formData.baseSalary) : 0,
            };

            if (personnelModalMode === 'add') {
                const newRecord = await addPersonnel(payload);
                try {
                    addLog('PERSONEL_EKLE', `${payload.fullName} personel özlük kaydı oluşturuldu.`);
                } catch { /* empty */ }
                if (newRecord?.id) {
                    setSelectedPersonnelId(newRecord.id);
                }
            } else if (personnelModalMode === 'edit' && editingPersonnel) {
                await updatePersonnel(editingPersonnel.id, payload);
                try {
                    addLog('PERSONEL_GUNCELLE', `${payload.fullName} personel özlük kaydı güncellendi.`);
                } catch { /* empty */ }
            }

            setIsPersonnelModalOpen(false);
            setEditingPersonnel(null);
        } catch (err) {
            console.error('Personel kaydedilirken hata:', err);
            alert('Personel kaydedilirken bir hata oluştu: ' + (err?.message || 'Lütfen tekrar deneyiniz.'));
        } finally {
            setIsSavingPersonnel(false);
        }
    };

    const handleDeletePersonnel = async (person) => {
        if (window.confirm(`${person.fullName} isimli personelin özlük dosyasını silmek istediğinize emin misiniz?`)) {
            try {
                await deletePersonnel(person.id);
                addLog('PERSONEL_SIL', `${person.fullName} personel kaydı silindi.`);
                if (selectedPersonnelId === person.id) {
                    const remaining = personnelList.filter(p => p.id !== person.id);
                    setSelectedPersonnelId(remaining[0]?.id || null);
                }
                setMobileView('list');
            } catch (err) {
                console.error('Personel silinirken hata:', err);
                alert('Personel silinirken bir hata oluştu.');
            }
        }
    };

    // Profil Fotoğrafı Yükleme
    const handleAvatarUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const uploaded = await uploadToCloudinary(file);
            if (uploaded?.url) {
                setFormData(prev => ({ ...prev, avatarUrl: uploaded.url }));
                if (editingPersonnel) {
                    await updatePersonnel(editingPersonnel.id, { avatarUrl: uploaded.url });
                }
            }
        } catch (err) {
            console.error('Fotoğraf yüklenemedi:', err);
            alert('Fotoğraf yüklenirken hata oluştu.');
        }
    };

    // Seçili Personele Hızlı Not Ekleme
    const handleAddNoteToPersonnel = async () => {
        if (!newNoteText.trim() || !selectedPersonnel) return;
        try {
            const updatedNotes = [
                {
                    id: Date.now().toString(),
                    text: newNoteText.trim(),
                    createdAt: new Date().toISOString(),
                    author: 'Yönetici'
                },
                ...(selectedPersonnel.notes || [])
            ];
            await updatePersonnel(selectedPersonnel.id, { notes: updatedNotes });
            setNewNoteText('');
            setIsAddingNote(false);
            addLog('PERSONEL_NOT', `${selectedPersonnel.fullName} için yeni not eklendi.`);
        } catch (err) {
            console.error('Not eklenirken hata:', err);
        }
    };

    const handleDeletePersonnelNote = async (noteId) => {
        if (!selectedPersonnel) return;
        try {
            const updatedNotes = (selectedPersonnel.notes || []).filter(n => n.id !== noteId);
            await updatePersonnel(selectedPersonnel.id, { notes: updatedNotes });
        } catch (err) {
            console.error('Not silinirken hata:', err);
        }
    };

    // PDF / Belge Açma Yardımcısı
    const openPdfOrFile = (f) => {
        if (!f) return;
        if ((f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf')) && f.data?.startsWith('data:')) {
            const byteStr = atob(f.data.split(',')[1]);
            const arr = new Uint8Array(byteStr.length);
            for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
            const blob = new Blob([arr], { type: 'application/pdf' });
            window.open(URL.createObjectURL(blob));
        } else {
            window.open(f.data || f.url, '_blank');
        }
    };

    // SGK Prim & Vergi Ödemeleri Masası İşlemleri
    const handleOpenSgkForm = (rec = null) => {
        if (rec) {
            setEditingSgkId(rec.id);
            setSgkFormData({
                period: rec.period || (rec.date ? rec.date.slice(0, 7) : new Date().toISOString().slice(0, 7)),
                date: rec.date || new Date().toISOString().split('T')[0],
                amount: rec.amount || '',
                status: rec.status || 'paid',
                description: rec.description || 'SGK Prim Tahakkuk & Ödemesi',
                note: rec.note || '',
                files: rec.files || []
            });
        } else {
            setEditingSgkId(null);
            setSgkFormData({
                period: new Date().toISOString().slice(0, 7),
                date: new Date().toISOString().split('T')[0],
                amount: '',
                status: 'paid',
                description: 'SGK Prim Tahakkuk & Ödemesi',
                note: '',
                files: []
            });
        }
        setIsSgkFormOpen(true);
    };

    const handleSaveSgkPayment = async (e) => {
        e?.preventDefault();
        const amt = Number(sgkFormData.amount);
        if (!amt || isNaN(amt) || amt <= 0) {
            alert('Lütfen geçerli bir prim tutarı giriniz.');
            return;
        }

        setIsSavingSgk(true);
        try {
            const payload = {
                type: 'Ödeme',
                category: 'SGK & Vergi',
                subCategory: 'sgk',
                period: sgkFormData.period,
                date: sgkFormData.date,
                amount: amt,
                status: sgkFormData.status,
                description: sgkFormData.description?.trim() || `SGK Prim Ödemesi (${sgkFormData.period})`,
                note: sgkFormData.note?.trim() || '',
                files: sgkFormData.files || [],
                truckId: null
            };

            if (editingSgkId) {
                await updatePayment(editingSgkId, payload);
                addLog('SGK_ODEME_GUNCELLE', `${sgkFormData.period} dönemi SGK prim kaydı güncellendi.`);
            } else {
                await addPayment(payload);
                addLog('SGK_ODEME_EKLE', `${sgkFormData.period} dönemi SGK primi kaydedildi: ₺${amt.toLocaleString('tr-TR')}`);
            }

            setIsSgkFormOpen(false);
            setEditingSgkId(null);
        } catch (err) {
            console.error('SGK ödemesi kaydedilirken hata:', err);
            alert('İşlem kaydedilirken bir hata oluştu.');
        } finally {
            setIsSavingSgk(false);
        }
    };

    const handleDeleteSgkPayment = async (id) => {
        if (window.confirm('Bu SGK prim ödeme kaydını silmek istediğinize emin misiniz?')) {
            try {
                await deletePayment(id);
                addLog('SGK_ODEME_SIL', 'SGK prim ödeme kaydı silindi.');
            } catch (err) {
                console.error('SGK ödeme silme hatası:', err);
            }
        }
    };

    // ── BENTO KPI METRİKLERİ ──
    const kpiMetrics = useMemo(() => {
        const list = personnelList || [];
        const totalEmployees = list.length;
        const activeEmployees = list.filter(p => p.employmentStatus === 'active').length;
        const onLeaveEmployees = list.filter(p => p.employmentStatus === 'on_leave').length;
        const terminatedEmployees = list.filter(p => p.employmentStatus === 'terminated').length;

        const drivers = list.filter(p => p.employmentStatus === 'active' && (p.role === 'driver_long' || p.role === 'driver_local'));
        const assignedTruckCount = list.filter(p => p.employmentStatus === 'active' && p.assignedTruckPlate).length;

        // Evrak Radarı Denetimi
        let expiredDocCount = 0;
        let criticalDocCount = 0;

        list.forEach(p => {
            if (p.employmentStatus !== 'active') return;
            const docDates = [p.licenseExpiry, p.srcExpiry, p.psikoteknikExpiry, p.tachographExpiry, p.healthReportExpiry];
            docDates.forEach(d => {
                if (!d) return;
                const st = getDocumentStatus(d);
                if (st.status === 'expired') expiredDocCount++;
                if (st.status === 'critical') criticalDocCount++;
            });
        });

        // Şirket Fiili Maaş Gideri (Aile Bireyi / isFamilyMember olanlar şirket nakit giderine dahil edilmez)
        const totalNetSalary = list
            .filter(p => p.employmentStatus === 'active' && !p.isFamilyMember)
            .reduce((acc, p) => acc + (Number(p.baseSalary) || 0), 0);

        // Resmi SGK Bildirilen Bordro Maaşı (Aile dahil yasal bildirim)
        const totalOfficialSalary = list
            .filter(p => p.employmentStatus === 'active')
            .reduce((acc, p) => acc + (Number(p.baseSalary) || 0), 0);

        const familyMembersCount = list.filter(p => p.employmentStatus === 'active' && p.isFamilyMember).length;

        // Tahmini SGK prim yükü
        const estimatedSgkTotal = Math.round(totalOfficialSalary * 0.375);

        const sgkDueDateInfo = getSgkDueDate();

        return {
            totalEmployees,
            activeEmployees,
            onLeaveEmployees,
            terminatedEmployees,
            activeDriversCount: drivers.length,
            assignedTruckCount,
            expiredDocCount,
            criticalDocCount,
            totalNetSalary,
            totalOfficialSalary,
            familyMembersCount,
            estimatedSgkTotal,
            sgkDueDateInfo
        };
    }, [personnelList]);

    // Filtrelenmiş Personel Listesi (Rehber İçin)
    const filteredPersonnelList = useMemo(() => {
        return (personnelList || []).filter(p => {
            if (statusFilter !== 'all' && p.employmentStatus !== statusFilter) return false;
            if (roleFilter !== 'all') {
                if (roleFilter === 'driver' && !(p.role === 'driver_long' || p.role === 'driver_local')) return false;
                if (roleFilter !== 'driver' && p.role !== roleFilter) return false;
            }
            if (directorySearch.trim()) {
                const q = directorySearch.toLowerCase();
                const matchName = (p.fullName || '').toLowerCase().includes(q);
                const matchTc = (p.tcNo || '').includes(q);
                const matchPhone = (p.phone || '').includes(q);
                const matchPlate = (p.assignedTruckPlate || '').toLowerCase().includes(q);
                if (!matchName && !matchTc && !matchPhone && !matchPlate) return false;
            }
            return true;
        });
    }, [personnelList, statusFilter, roleFilter, directorySearch]);

    // Evrak Radarı İçin Sürücü Listesi
    const radarDriversList = useMemo(() => {
        return (personnelList || [])
            .filter(p => p.employmentStatus === 'active')
            .filter(p => {
                if (radarSearch.trim()) {
                    const q = radarSearch.toLowerCase();
                    return (p.fullName || '').toLowerCase().includes(q) || (p.assignedTruckPlate || '').toLowerCase().includes(q);
                }
                return true;
            })
            .filter(p => {
                if (radarFilter === 'all') return true;
                const docDates = [p.licenseExpiry, p.srcExpiry, p.psikoteknikExpiry, p.tachographExpiry, p.healthReportExpiry];
                const statuses = docDates.map(d => getDocumentStatus(d).status);
                if (radarFilter === 'expired') return statuses.includes('expired');
                if (radarFilter === 'critical') return statuses.includes('critical');
                if (radarFilter === 'approaching') return statuses.includes('approaching');
                return true;
            });
    }, [personnelList, radarSearch, radarFilter]);

    // Seçili Personelin Geçmiş Hak Ediş Ödemeleri
    const personnelPayoutHistory = useMemo(() => {
        if (!selectedPersonnel) return [];
        return (payouts || []).filter(p => !p.deleted && (p.driverName || '').toLowerCase() === (selectedPersonnel.fullName || '').toLowerCase());
    }, [payouts, selectedPersonnel]);

    // ── HAK EDİŞ (A4 SEFER HESAPLAYICI) MANTIĞI ──
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

    useEffect(() => {
        if (showOldPayoutWarning) {
            const timer = setTimeout(() => setShowOldPayoutWarning(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [showOldPayoutWarning]);

    useEffect(() => {
        if (activePayoutState) {
            if (activePayoutState.grandTotal !== undefined) {
                setNetPrice(activePayoutState.grandTotal);
            } else {
                const total = (activePayoutState.trips || []).reduce((acc, t) => acc + (Number(t.premiumAmount) || 0), 0);
                setNetPrice(total);
            }
        }
    }, [activePayoutState]);

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
        if (!activePayoutState || !activePayoutState.trips || activePayoutState.trips.length === 0) {
            alert('Kaydedilecek sefer bulunamadı.');
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

            sendDiscordAlert({
                type: 'success',
                title: 'Prim Hak Edişi Oluşturuldu',
                description: 'Personel prim hak edişi onaylandı ve kaydedildi.',
                fields: [
                    { name: 'Personel', value: String(newPayoutData?.driverName || '—'), inline: true },
                    { name: 'Tutar', value: String(newPayoutData?.grandTotal || newPayoutData?.calculatedTotal || '—') + ' TL', inline: true },
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
            alert('Hak ediş kaydedilirken bir hata oluştu.');
        }
    };

    const handleDeletePayout = async (payoutId, docId, e) => {
        e.stopPropagation();
        const isMobileScreen = window.innerWidth < 768;

        if (isMobileScreen || window.confirm(`${docId} numaralı hak ediş kaydını silmek istediğinize emin misiniz? (İlgili seferler ödenmemiş duruma dönecektir)`)) {
            try {
                const deletedPayout = payouts.find(p => p.id === payoutId);
                await deletePayout(payoutId);

                sendDiscordAlert({
                    type: 'warning',
                    title: 'Hak Ediş Silindi',
                    description: 'Prim hak ediş kaydı silindi.',
                    fields: [
                        { name: 'Personel', value: String(deletedPayout?.driverName || '—'), inline: true },
                        { name: 'Tutar', value: String(deletedPayout?.grandTotal || deletedPayout?.calculatedTotal || '—') + ' TL', inline: true },
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
        <div className="flex-1 flex flex-col h-full w-full p-2 sm:p-3 lg:p-4 overflow-hidden gap-2 sm:gap-2.5 max-w-[1920px] mx-auto select-none">

            {/* ── 1. Üst Başlık ve Kontrol Barı ── */}
            <div
                className="flex items-center justify-between gap-3 pb-2 border-b border-white/[0.06] shrink-0"
                style={{ paddingTop: isMobile ? 'calc(0.5rem + env(safe-area-inset-top, 0px))' : '0' }}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    {isMobile && onOpenMenu && (
                        <button
                            onClick={onOpenMenu}
                            className="p-1.5 -ml-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
                        >
                            <Menu size={22} />
                        </button>
                    )}
                    <div className="flex flex-col">
                        <h2 className="text-sm sm:text-base lg:text-lg font-bold tracking-tight text-white flex items-center gap-2 truncate">
                            <Users size={19} className="text-amber-400 shrink-0" />
                            <span>Personel & Sürücü Yönetimi</span>
                        </h2>
                    </div>
                </div>

                {/* Sağ Aksiyonlar: Sekme Seçimi & Yeni Ekle */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* 4'lü Alt Sekme Hap Butonları */}
                    <div className="flex items-center p-0.5 sm:p-1 rounded-xl bg-[#0a0d14] border border-white/[0.06] relative overflow-x-auto max-w-[calc(100vw-120px)] sm:max-w-none">
                        {[
                            { id: 'directory', label: 'Rehber & Özlük', shortLabel: 'Rehber', icon: Users },
                            { id: 'radar', label: 'Evraklar', shortLabel: 'Evraklar', icon: ShieldAlert, badge: (kpiMetrics.expiredDocCount + kpiMetrics.criticalDocCount) > 0 ? (kpiMetrics.expiredDocCount + kpiMetrics.criticalDocCount) : null },
                            { id: 'payments', label: 'SGK & Maaş', shortLabel: 'SGK & Maaş', icon: Calendar },
                            { id: 'payouts', label: 'Prim Hak Edişi', shortLabel: 'Hak Ediş', icon: CreditCard }
                        ].map((tab) => {
                            const IconComponent = tab.icon;
                            const isActive = activeSubTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => {
                                        setActiveSubTab(tab.id);
                                        setMobileView('list');
                                    }}
                                    className={`relative flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 cursor-pointer shrink-0 ${
                                        isActive ? 'text-black font-bold' : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="personnel-subtab-pill"
                                            className="absolute inset-0 bg-amber-500 rounded-lg shadow-sm"
                                            style={{ zIndex: 0 }}
                                            initial={false}
                                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                        />
                                    )}
                                    <span className="relative z-10 flex items-center gap-1.5">
                                        <IconComponent size={14} />
                                        <span className="hidden md:inline">{tab.label}</span>
                                        <span className="md:hidden">{tab.shortLabel}</span>
                                        {tab.badge && (
                                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive ? 'bg-black text-amber-400' : 'bg-red-500 text-white'}`}>
                                                {tab.badge}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Yeni Personel / Yeni SGK Ödemesi Ekle Butonu */}
                    {activeSubTab === 'payments' ? (
                        <button
                            onClick={() => handleOpenSgkForm()}
                            className="h-8 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer shrink-0"
                        >
                            <Plus size={14} />
                            <span className="hidden sm:inline">SGK Ödemesi Ekle</span>
                        </button>
                    ) : (
                        <button
                            onClick={openAddPersonnelModal}
                            className="h-8 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer shrink-0"
                            title="Yeni Personel Özlük Dosyası Oluştur"
                        >
                            <UserPlus size={14} />
                            <span className="hidden sm:inline">Yeni Personel</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ── 2. Bento KPI Özet Kartları (Sade & Modern Obsidian Bar) ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
                {/* 1. Toplam Personel */}
                <div
                    onClick={() => {
                        setActiveSubTab('directory');
                        setStatusFilter('all');
                    }}
                    className="rounded-xl border border-white/[0.06] px-3 py-1.5 bg-[#080b11] flex items-center justify-between cursor-pointer hover:border-amber-500/30 transition-colors"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 shrink-0">
                            <Users size={13} />
                        </div>
                        <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 block leading-tight">Toplam Kadro</span>
                            <span className="text-xs font-bold text-white font-mono">{kpiMetrics.totalEmployees} Personel</span>
                        </div>
                    </div>
                </div>

                {/* 2. Aktif Sürücüler */}
                <div
                    onClick={() => {
                        setActiveSubTab('directory');
                        setRoleFilter('driver');
                    }}
                    className="rounded-xl border border-white/[0.06] px-3 py-1.5 bg-[#080b11] flex items-center justify-between cursor-pointer hover:border-amber-500/30 transition-colors"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 shrink-0">
                            <Truck size={13} />
                        </div>
                        <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 block leading-tight">Aktif Sürücüler</span>
                            <span className="text-xs font-bold text-white font-mono">{kpiMetrics.activeDriversCount} Kaptan</span>
                        </div>
                    </div>
                </div>

                {/* 3. Evraklar */}
                <div
                    onClick={() => setActiveSubTab('radar')}
                    className="rounded-xl border border-white/[0.06] px-3 py-1.5 bg-[#080b11] flex items-center justify-between cursor-pointer hover:border-amber-500/30 transition-colors"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 shrink-0">
                            <ShieldAlert size={13} />
                        </div>
                        <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 block leading-tight">Evraklar</span>
                            <span className="text-xs font-bold text-white font-mono">
                                {kpiMetrics.expiredDocCount + kpiMetrics.criticalDocCount > 0 ? `${kpiMetrics.expiredDocCount + kpiMetrics.criticalDocCount} Alarm` : 'Sorun Yok'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 4. SGK Prim Vadesi */}
                <div
                    onClick={() => setActiveSubTab('payments')}
                    className="rounded-xl border border-white/[0.06] px-3 py-1.5 bg-[#080b11] flex items-center justify-between cursor-pointer hover:border-amber-500/30 transition-colors"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 shrink-0">
                            <Calendar size={13} />
                        </div>
                        <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 block leading-tight">SGK Vadesi</span>
                            <span className="text-xs font-bold text-white font-mono">₺{kpiMetrics.totalNetSalary.toLocaleString('tr-TR')}</span>
                        </div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 font-mono shrink-0">
                        {kpiMetrics.sgkDueDateInfo.daysRemaining} Gün
                    </span>
                </div>
            </div>

            {/* ── 3. ALT SEKME İÇERİKLERİ ── */}

            {/* ═════════════ SUB-TAB 1: ÖZLÜK & REHBER (MASTER-DETAIL) ═════════════ */}
            {activeSubTab === 'directory' && (
                <div className="flex-1 flex flex-col md:flex-row gap-2.5 sm:gap-3 min-h-0 overflow-hidden">
                    
                    {/* SOL PANEL: Personel Listesi (Master - Sade & Kompakt) */}
                    <div className={`w-full md:w-60 lg:w-68 flex flex-col gap-2 shrink-0 h-full ${mobileView === 'detail' ? 'hidden md:flex' : 'flex'}`}>
                        {/* Arama Çubuğu (Sade) */}
                        <div className="relative shrink-0">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            <input
                                type="text"
                                value={directorySearch}
                                onChange={(e) => setDirectorySearch(e.target.value)}
                                placeholder="Personel veya plaka ara..."
                                className="w-full pl-8 pr-7 py-2 rounded-xl bg-[#080b11] border border-white/[0.06] text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500/40 transition-colors"
                            />
                            {directorySearch && (
                                <button onClick={() => setDirectorySearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Personel Kart Listesi */}
                        <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar min-h-0">
                            {filteredPersonnelList.length > 0 ? (
                                filteredPersonnelList.map((person) => {
                                    const isSelected = selectedPersonnelId === person.id;

                                    return (
                                        <div
                                            key={person.id}
                                            onClick={() => {
                                                setSelectedPersonnelId(person.id);
                                                setMobileView('detail');
                                            }}
                                            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                                isSelected
                                                    ? 'bg-[#121622] border-amber-500/40 shadow-sm'
                                                    : 'bg-[#080b11] border-white/[0.06] hover:bg-white/[0.03] hover:border-white/10'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                {/* Avatar */}
                                                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-bold text-xs text-amber-400 shrink-0">
                                                    {person.fullName ? person.fullName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'P'}
                                                </div>
                                                <span className={`text-xs sm:text-sm font-semibold truncate ${isSelected ? 'text-amber-400 font-bold' : 'text-white'}`}>
                                                    {person.fullName}
                                                </span>
                                            </div>

                                            {person.assignedTruckPlate && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300 font-mono shrink-0">
                                                    {person.assignedTruckPlate}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="p-8 text-center rounded-xl bg-[#080b11] border border-white/[0.06] text-slate-500 flex flex-col items-center justify-center gap-2">
                                    <Users size={24} className="text-slate-600" />
                                    <p className="text-xs">Personel bulunamadı.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* SAĞ PANEL: Seçili Personelin Dijital Özlük Dosyası (Detail) */}
                    <div className={`flex-1 flex flex-col rounded-2xl bg-[#0a0d14] border border-white/[0.06] overflow-hidden min-h-0 ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
                        {selectedPersonnel ? (
                            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                {/* ── 1. ÜST EXECUTIVE PROFILE HEADER (Ferah, Geniş & Şık) ── */}
                                <div className="px-4 py-3 border-b border-white/[0.08] bg-[#0c1018] flex flex-wrap items-center justify-between gap-3 shrink-0">
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        <button
                                            onClick={() => setMobileView('list')}
                                            className="md:hidden flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-white/5 cursor-pointer shrink-0"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>

                                        {/* Avatar (44px) */}
                                        <div className="relative group shrink-0">
                                            {selectedPersonnel.avatarUrl ? (
                                                <img
                                                    src={selectedPersonnel.avatarUrl}
                                                    alt={selectedPersonnel.fullName}
                                                    className="w-11 h-11 rounded-xl object-cover border border-white/10"
                                                />
                                            ) : (
                                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-white/10 flex items-center justify-center font-bold text-base text-amber-300">
                                                    {selectedPersonnel.fullName ? selectedPersonnel.fullName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'P'}
                                                </div>
                                            )}
                                            <label className="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-white cursor-pointer transition-opacity" title="Fotoğrafı Değiştir">
                                                <UploadCloud size={14} />
                                                <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                                            </label>
                                        </div>

                                        {/* İsim & Durum Rozetleri */}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                                                    {selectedPersonnel.fullName}
                                                </h3>
                                                {selectedPersonnel.bloodType && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-white/5 text-slate-300 border border-white/10 shrink-0">
                                                        {selectedPersonnel.bloodType}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
                                                <span className="text-slate-300 font-medium">
                                                    {ROLE_OPTIONS.find(r => r.value === selectedPersonnel.role)?.label || 'Personel'}
                                                </span>
                                                {selectedPersonnel.phone && (
                                                    <>
                                                        <span className="text-slate-600">·</span>
                                                        <a href={`tel:${selectedPersonnel.phone}`} className="text-slate-300 hover:text-white flex items-center gap-1 font-mono">
                                                            <Phone size={11} className="text-slate-400" />
                                                            <span>{selectedPersonnel.phone}</span>
                                                        </a>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sağ Aksiyonlar */}
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {selectedPersonnel.phone && (
                                            <a
                                                href={`https://wa.me/${selectedPersonnel.phone.replace(/[^0-9]/g, '')}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                                                title="WhatsApp İletişim"
                                            >
                                                <span>WhatsApp</span>
                                            </a>
                                        )}
                                        <button
                                            onClick={() => openEditPersonnelModal(selectedPersonnel)}
                                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
                                            title="Personeli Düzenle"
                                        >
                                            <Edit3 size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDeletePersonnel(selectedPersonnel)}
                                            className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-white/10 transition-colors cursor-pointer"
                                            title="Personeli Sil"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* ── 2. YATAY SÜRÜCÜ YASAL EVRAK RADARI ── */}
                                <div className="px-4 py-2 bg-[#0a0d14] border-b border-white/[0.06] shrink-0">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <Shield size={13} className="text-amber-400" />
                                        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                                            Yasal Sürücü Belgeleri
                                        </span>
                                    </div>

                                    {/* 4 Kolonlu Kompakt Evrak Kartları */}
                                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                                        {/* 1. Sürücü Belgesi */}
                                        {(() => {
                                            const st = getDocumentStatus(selectedPersonnel.licenseExpiry);
                                            const classes = selectedPersonnel.licenseClasses?.length ? selectedPersonnel.licenseClasses.join(', ') : 'CE, C';
                                            return (
                                                <div className="p-2.5 rounded-xl bg-[#080b11] border border-white/[0.06] hover:border-white/10 transition-colors flex flex-col justify-between">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-semibold text-white">Sürücü Belgesi</span>
                                                        {st.label && (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium border ${st.badgeClass}`}>
                                                                {st.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center justify-between text-[11px] font-mono mt-1.5">
                                                        <span className="text-slate-500">{classes}</span>
                                                        <span className={selectedPersonnel.licenseExpiry ? 'text-slate-300 font-medium' : 'text-slate-600'}>
                                                            {selectedPersonnel.licenseExpiry ? new Date(selectedPersonnel.licenseExpiry).toLocaleDateString('tr-TR') : '—'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* 2. SRC Belgesi */}
                                        {(() => {
                                            const st = getDocumentStatus(selectedPersonnel.srcExpiry);
                                            const srcTypes = selectedPersonnel.srcTypes?.length ? selectedPersonnel.srcTypes.join(', ') : 'SRC 3, 4';
                                            return (
                                                <div className="p-2.5 rounded-xl bg-[#080b11] border border-white/[0.06] hover:border-white/10 transition-colors flex flex-col justify-between">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-semibold text-white">SRC Belgesi</span>
                                                        {st.label && (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium border ${st.badgeClass}`}>
                                                                {st.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center justify-between text-[11px] font-mono mt-1.5">
                                                        <span className="text-slate-500 truncate max-w-[100px]" title={srcTypes}>{srcTypes}</span>
                                                        <span className={selectedPersonnel.srcExpiry ? 'text-slate-300 font-medium' : 'text-slate-600'}>
                                                            {selectedPersonnel.srcExpiry ? new Date(selectedPersonnel.srcExpiry).toLocaleDateString('tr-TR') : '—'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* 3. Psikoteknik Raporu */}
                                        {(() => {
                                            const st = getDocumentStatus(selectedPersonnel.psikoteknikExpiry);
                                            return (
                                                <div className="p-2.5 rounded-xl bg-[#080b11] border border-white/[0.06] hover:border-white/10 transition-colors flex flex-col justify-between">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-semibold text-white">Psikoteknik</span>
                                                        {st.label && (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium border ${st.badgeClass}`}>
                                                                {st.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center justify-between text-[11px] font-mono mt-1.5">
                                                        <span className="text-slate-500">Sağlık Raporu</span>
                                                        <span className={selectedPersonnel.psikoteknikExpiry ? 'text-slate-300 font-medium' : 'text-slate-600'}>
                                                            {selectedPersonnel.psikoteknikExpiry ? new Date(selectedPersonnel.psikoteknikExpiry).toLocaleDateString('tr-TR') : '—'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* 4. Dijital Takograf Kartı */}
                                        {(() => {
                                            const st = getDocumentStatus(selectedPersonnel.tachographExpiry);
                                            const cardNo = selectedPersonnel.tachographCardNo || '';
                                            return (
                                                <div className="p-2.5 rounded-xl bg-[#080b11] border border-white/[0.06] hover:border-white/10 transition-colors flex flex-col justify-between">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-semibold text-white">Dijital Takograf</span>
                                                        {st.label && (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium border ${st.badgeClass}`}>
                                                                {st.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center justify-between text-[11px] font-mono mt-1.5">
                                                        <span className="text-slate-500 truncate max-w-[100px]" title={cardNo}>{cardNo || '—'}</span>
                                                        <span className={selectedPersonnel.tachographExpiry ? 'text-slate-300 font-medium' : 'text-slate-600'}>
                                                            {selectedPersonnel.tachographExpiry ? new Date(selectedPersonnel.tachographExpiry).toLocaleDateString('tr-TR') : '—'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* ── 3. İÇ SEKME BAŞLIKLARI (Dossier Tabs Header) ── */}
                                <div className="px-4 pt-2.5 pb-2 bg-[#0c1018] border-b border-white/[0.06] flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setDetailRightTab('overview')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                detailRightTab === 'overview' || detailRightTab === 'notes'
                                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                                                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                                            }`}
                                        >
                                            <Briefcase size={13} />
                                            <span>Resmi Özlük & Finans</span>
                                        </button>
                                        <button
                                            onClick={() => setDetailRightTab('docs')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                detailRightTab === 'docs'
                                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                                                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                                            }`}
                                        >
                                            <Paperclip size={13} />
                                            <span>Dijital Evraklar</span>
                                            <span className="text-[10px] font-mono opacity-80">({(selectedPersonnel.documents || []).length})</span>
                                        </button>
                                        <button
                                            onClick={() => setDetailRightTab('notes_drawer')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                detailRightTab === 'notes_drawer'
                                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                                                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                                            }`}
                                        >
                                            <StickyNote size={13} />
                                            <span>Zimmet & Notlar</span>
                                            <span className="text-[10px] font-mono opacity-80">({(selectedPersonnel.notes || []).length})</span>
                                        </button>
                                        {personnelPayoutHistory.length > 0 && (
                                            <button
                                                onClick={() => setDetailRightTab('payouts')}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    detailRightTab === 'payouts'
                                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                                                        : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                                                }`}
                                            >
                                                <CreditCard size={13} />
                                                <span>Sefer Primleri</span>
                                                <span className="text-[10px] font-mono opacity-80">({personnelPayoutHistory.length})</span>
                                            </button>
                                        )}
                                    </div>

                                    {detailRightTab === 'docs' && (
                                        <button
                                            onClick={() => openEditPersonnelModal(selectedPersonnel, 'files')}
                                            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                                        >
                                            <Plus size={12} />
                                            <span>Yeni Belge Yükle</span>
                                        </button>
                                    )}
                                </div>

                                {/* ── 4. İÇ SEKME İÇERİĞİ ── */}
                                <div className="flex-1 min-h-0 p-3 sm:p-4 overflow-y-auto custom-scrollbar flex flex-col">
                                    {/* SEKME 1: RESMİ ÖZLÜK & FİNANS (Geniş 2 Kolonlu Şık Tablo) */}
                                    {(detailRightTab === 'overview' || detailRightTab === 'notes') && (
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
                                            {/* SOL SÜTUN: SGK & BORDRO FİNANSI */}
                                            <div className="rounded-xl bg-[#080b11] border border-white/[0.06] p-4 flex flex-col h-full">
                                                <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06] shrink-0">
                                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                                                        <Briefcase size={13} className="text-amber-400" />
                                                        <span>SGK & Bordro Finansı</span>
                                                    </h4>
                                                    <span className="text-[10px] font-mono text-slate-500">Resmi Kayıt</span>
                                                </div>

                                                <div className="flex-1 flex flex-col justify-between py-1 text-xs divide-y divide-white/[0.03]">
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-slate-400">İşe Giriş Tarihi:</span>
                                                        <span className="font-mono text-slate-200">
                                                            {selectedPersonnel.hireDate ? new Date(selectedPersonnel.hireDate).toLocaleDateString('tr-TR') : '—'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-slate-400">Kıdem Süresi:</span>
                                                        <span className="font-mono text-amber-400">
                                                            {calculateSeniority(selectedPersonnel.hireDate, selectedPersonnel.leaveDate) || '—'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-slate-400">SGK Sicil No:</span>
                                                        <span className="font-mono text-slate-200">{selectedPersonnel.sgkNo || '—'}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-slate-400">SGK Meslek Kodu:</span>
                                                        <span className="font-mono text-slate-200">{selectedPersonnel.sgkOccupationCode || '8332.01'}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-slate-400">Aylık Net Maaş:</span>
                                                        <span className="font-mono text-white font-semibold">
                                                            {selectedPersonnel.baseSalary ? `₺${Number(selectedPersonnel.baseSalary).toLocaleString('tr-TR')}` : '—'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-slate-400">Maaş Günü:</span>
                                                        <span className="font-mono text-slate-200">
                                                            {selectedPersonnel.salaryDay ? `Her ayın ${selectedPersonnel.salaryDay}. günü` : '—'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-slate-400">Banka & IBAN:</span>
                                                        {selectedPersonnel.iban ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-mono text-slate-200 truncate max-w-[200px]" title={`${selectedPersonnel.bankName || ''} ${selectedPersonnel.iban}`}>
                                                                    {selectedPersonnel.bankName ? `${selectedPersonnel.bankName} · ` : ''}{selectedPersonnel.iban}
                                                                </span>
                                                                <button
                                                                    onClick={() => handleCopy(selectedPersonnel.iban, 'iban')}
                                                                    className="text-slate-500 hover:text-white transition-colors cursor-pointer"
                                                                    title="IBAN Kopyala"
                                                                >
                                                                    {copiedField === 'iban' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => openEditPersonnelModal(selectedPersonnel, 'sgk')}
                                                                className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                                                            >
                                                                + IBAN Ekle
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* SAĞ SÜTUN: KİMLİK & ACİL DURUM İLETİŞİMİ */}
                                            <div className="rounded-xl bg-[#080b11] border border-white/[0.06] p-4 flex flex-col h-full">
                                                <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06] shrink-0">
                                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                                                        <Phone size={13} className="text-amber-400" />
                                                        <span>Kimlik & İletişim</span>
                                                    </h4>
                                                    <span className="text-[10px] font-mono text-slate-500">MERNİS Doğrulama</span>
                                                </div>

                                                <div className="flex-1 flex flex-col justify-between py-1 text-xs divide-y divide-white/[0.03]">
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-slate-400">T.C. Kimlik No:</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-mono text-slate-200">{selectedPersonnel.tcNo || '—'}</span>
                                                            {selectedPersonnel.tcNo && (
                                                                <button
                                                                    onClick={() => handleCopy(selectedPersonnel.tcNo, 'tc')}
                                                                    className="text-slate-500 hover:text-white transition-colors cursor-pointer"
                                                                    title="T.C. Kopyala"
                                                                >
                                                                    {copiedField === 'tc' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-slate-400">Doğum Tarihi:</span>
                                                        <span className="font-mono text-slate-200">
                                                            {selectedPersonnel.birthDate ? new Date(selectedPersonnel.birthDate).toLocaleDateString('tr-TR') : '—'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-slate-400">Kan Grubu:</span>
                                                        <span className="font-mono text-slate-200">{selectedPersonnel.bloodType || '—'}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-slate-400 shrink-0">İkametgah:</span>
                                                        <span className="text-slate-200 text-right truncate max-w-[220px]" title={selectedPersonnel.address}>
                                                            {selectedPersonnel.address || '—'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-slate-400">Acil Durum Yakını:</span>
                                                        {selectedPersonnel.emergencyContact?.phone ? (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-slate-200 truncate max-w-[140px]">
                                                                    {selectedPersonnel.emergencyContact?.name || ''}
                                                                    {selectedPersonnel.emergencyContact?.relation ? ` (${selectedPersonnel.emergencyContact.relation})` : ''}
                                                                </span>
                                                                <a
                                                                    href={`tel:${selectedPersonnel.emergencyContact.phone}`}
                                                                    className="font-mono text-amber-400 hover:underline flex items-center gap-1"
                                                                    title="Ara"
                                                                >
                                                                    <Phone size={10} />
                                                                    <span>{selectedPersonnel.emergencyContact.phone}</span>
                                                                </a>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => openEditPersonnelModal(selectedPersonnel, 'identity')}
                                                                className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                                                            >
                                                                + Kişi Ekle
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* SEKME 2: DİJİTAL EVRAKLAR */}
                                    {detailRightTab === 'docs' && (
                                        <div className="flex flex-col gap-3">
                                            {(selectedPersonnel.documents || []).length > 0 ? (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {(selectedPersonnel.documents || []).map((docItem, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="p-3 rounded-xl bg-[#0f131d] border border-white/[0.06] hover:border-amber-500/30 flex items-center justify-between gap-3 transition-colors"
                                                        >
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                                                                    <FileText size={18} />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-semibold text-white truncate">{docItem.name || 'Özlük Belgesi'}</p>
                                                                    <span className="text-[10px] text-slate-500 font-mono block">
                                                                        {docItem.uploadedAt ? new Date(docItem.uploadedAt).toLocaleDateString('tr-TR') : 'Kayıtlı Belge'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button
                                                                    onClick={() => setPreviewDoc(docItem)}
                                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                                                    title="İncele"
                                                                >
                                                                    <Eye size={14} />
                                                                </button>
                                                                <a
                                                                    href={docItem.url || docItem.data}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-white/10 transition-colors cursor-pointer"
                                                                    title="Yeni Sekmede Aç"
                                                                >
                                                                    <ExternalLink size={14} />
                                                                </a>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-white/10 rounded-2xl bg-[#0f131d]/50 flex flex-col items-center justify-center gap-2">
                                                    <Paperclip size={24} className="text-slate-600" />
                                                    <p>Bu personele ait sisteme yüklenmiş dijital özlük belgesi (ehliyet fotokopisi, adli sicil, sözleşme) bulunmuyor.</p>
                                                    <button
                                                        onClick={() => openEditPersonnelModal(selectedPersonnel, 'files')}
                                                        className="mt-1 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-semibold transition-colors cursor-pointer"
                                                    >
                                                        + Belge Yükle
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* SEKME 3: ZİMMET & NOTLAR */}
                                    {detailRightTab === 'notes_drawer' && (
                                        <div className="flex flex-col gap-3">
                                            {/* Hızlı Not Ekleme */}
                                            <div className="p-3 rounded-xl bg-[#0f131d] border border-white/[0.06] flex gap-2">
                                                <input
                                                    type="text"
                                                    value={newNoteText}
                                                    onChange={(e) => setNewNoteText(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddNoteToPersonnel()}
                                                    placeholder="Bu personele ait operasyonel not, zimmet kaydı veya açıklama yazın..."
                                                    className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500/40 transition-colors"
                                                />
                                                <button
                                                    onClick={handleAddNoteToPersonnel}
                                                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors cursor-pointer shrink-0"
                                                >
                                                    Ekle
                                                </button>
                                            </div>

                                            {/* Notlar Akışı */}
                                            {(selectedPersonnel.notes || []).length > 0 ? (
                                                <div className="space-y-2">
                                                    {(selectedPersonnel.notes || []).map((n) => (
                                                        <div
                                                            key={n.id}
                                                            className="p-3 rounded-xl bg-[#0f131d] border border-white/[0.06] flex items-start justify-between gap-3 group"
                                                        >
                                                            <div className="flex-1">
                                                                <p className="text-xs text-slate-200 leading-relaxed">{n.text}</p>
                                                                <span className="text-[10px] text-slate-500 font-mono mt-1.5 block">
                                                                    {n.createdAt ? new Date(n.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                                </span>
                                                            </div>
                                                            <button
                                                                onClick={() => handleDeletePersonnelNote(n.id)}
                                                                className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 cursor-pointer"
                                                                title="Notu Sil"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="py-8 text-center text-slate-500 text-xs border border-dashed border-white/10 rounded-2xl bg-[#0f131d]/50">
                                                    Bu personele ait henüz eklenmiş bir zimmet veya operasyon notu bulunmuyor.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* SEKME 4: SEFER PRİMLERİ */}
                                    {detailRightTab === 'payouts' && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {personnelPayoutHistory.map((po) => (
                                                <div
                                                    key={po.id}
                                                    onClick={() => {
                                                        handleViewPayout(po);
                                                        setActiveSubTab('payouts');
                                                    }}
                                                    className="p-3.5 rounded-xl bg-[#0f131d] border border-white/[0.06] hover:border-amber-500/30 cursor-pointer flex items-center justify-between transition-colors"
                                                >
                                                    <div>
                                                        <span className="text-xs font-bold text-amber-400 block font-mono">{po.docId || 'HAK EDİŞ'}</span>
                                                        <span className="text-[11px] text-slate-400 mt-0.5 block">
                                                            {po.trips?.length || 0} Sefer · {po.totalTonnage?.toFixed(1)} Ton
                                                        </span>
                                                    </div>
                                                    <div className="text-right font-mono">
                                                        <span className="text-sm font-bold text-white block">
                                                            ₺{po.grandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                        <span className="text-[10px] text-slate-500">{new Date(po.endDate).toLocaleDateString('tr-TR')}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-3">
                                <Users size={40} className="text-slate-700" />
                                <h4 className="text-sm font-semibold text-slate-300">İncelenecek Personel Seçilmedi</h4>
                                <p className="text-xs max-w-sm">
                                    Sol listeden bir personelin üzerine tıklayarak özlük dosyasını, sürücü evrak durumunu ve ödeme geçmişini görüntüleyebilirsiniz.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═════════════ SUB-TAB 2: EVRAKLAR (FİLO YASAL MATRİSİ) ═════════════ */}
            {activeSubTab === 'radar' && (
                <div className="flex-1 flex flex-col rounded-2xl bg-[#0a0d14] border border-white/[0.06] p-3 sm:p-5 gap-3 overflow-hidden min-h-0">
                    {/* Üst Arama Barı */}
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/[0.06] shrink-0">
                        <div className="relative w-full max-w-sm">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                value={radarSearch}
                                onChange={(e) => setRadarSearch(e.target.value)}
                                placeholder="Sürücü veya plaka ara..."
                                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500/40 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Evrak Tablosu / Kart Matrisi */}
                    <div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar min-h-0 pr-1">
                        {radarDriversList.length > 0 ? (
                            radarDriversList.map((driver) => {
                                const licSt = getDocumentStatus(driver.licenseExpiry);
                                const srcSt = getDocumentStatus(driver.srcExpiry);
                                const psiSt = getDocumentStatus(driver.psikoteknikExpiry);
                                const takoSt = getDocumentStatus(driver.tachographExpiry);

                                return (
                                    <div
                                        key={driver.id}
                                        onClick={() => {
                                            setSelectedPersonnelId(driver.id);
                                            setActiveSubTab('directory');
                                            setMobileView('detail');
                                        }}
                                        className="p-3.5 sm:p-4 rounded-xl bg-[#0f131d] border border-white/[0.06] hover:border-amber-500/30 transition-colors flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 cursor-pointer"
                                    >
                                        {/* Sürücü & Araç */}
                                        <div className="flex items-center gap-3 min-w-[200px]">
                                            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-bold text-amber-300 text-xs shrink-0">
                                                {driver.fullName ? driver.fullName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'S'}
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-white truncate">{driver.fullName}</h4>
                                                <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                                                    <Truck size={12} className="text-amber-400" />
                                                    {driver.assignedTruckPlate || '—'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* 4 Ana Evrak Kolonu */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 w-full lg:w-auto">
                                            {/* Ehliyet */}
                                            <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] flex flex-col justify-between">
                                                <span className="text-[10px] text-slate-400 block font-semibold">Ehliyet ({driver.licenseClasses?.join(',') || 'CE'})</span>
                                                {licSt.label ? (
                                                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border mt-1 text-center ${licSt.badgeClass}`}>
                                                        {licSt.label}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-mono text-slate-600 mt-1 text-center">—</span>
                                                )}
                                            </div>

                                            {/* SRC */}
                                            <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] flex flex-col justify-between">
                                                <span className="text-[10px] text-slate-400 block font-semibold truncate">SRC Belgesi</span>
                                                {srcSt.label ? (
                                                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border mt-1 text-center ${srcSt.badgeClass}`}>
                                                        {srcSt.label}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-mono text-slate-600 mt-1 text-center">—</span>
                                                )}
                                            </div>

                                            {/* Psikoteknik */}
                                            <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] flex flex-col justify-between">
                                                <span className="text-[10px] text-slate-400 block font-semibold">Psikoteknik</span>
                                                {psiSt.label ? (
                                                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border mt-1 text-center ${psiSt.badgeClass}`}>
                                                        {psiSt.label}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-mono text-slate-600 mt-1 text-center">—</span>
                                                )}
                                            </div>

                                            {/* Takograf */}
                                            <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] flex flex-col justify-between">
                                                <span className="text-[10px] text-slate-400 block font-semibold truncate">Takograf Kartı</span>
                                                {takoSt.label ? (
                                                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border mt-1 text-center ${takoSt.badgeClass}`}>
                                                        {takoSt.label}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-mono text-slate-600 mt-1 text-center">—</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
                                <ShieldAlert size={32} className="text-slate-600" />
                                <p>Filtreye uygun sürücü evrak kaydı bulunamadı.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═════════════ SUB-TAB 3: ÖDEME & SGK TAKVİMİ ═════════════ */}
            {activeSubTab === 'payments' && (
                <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 overflow-hidden">
                    
                    {/* Sol Sütun: SGK Prim Vadesi & Maaş Takvimi */}
                    <div className="w-full lg:w-1/2 flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-0.5">
                        {/* SGK Prim Vadesi Paneli */}
                        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#0f131d] to-[#0a0d14] border border-white/[0.08] flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Calendar size={16} className="text-sky-400" />
                                    <h3 className="text-sm sm:text-base font-bold text-white">Yasal SGK Prim Vadesi</h3>
                                </div>
                                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 font-bold border border-sky-500/20">
                                    {kpiMetrics.sgkDueDateInfo.daysRemaining} Gün Kaldı
                                </span>
                            </div>

                            <p className="text-xs text-slate-400">
                                Kanuni mevzuat uyarınca her ayın SGK prim bildirimi ve ödemesi, takip eden ayın son günü mesai bitimine kadar gerçekleştirilir.
                            </p>

                            <div className="grid grid-cols-2 gap-2 mt-1">
                                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                    <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Son Ödeme Günü</span>
                                    <span className="text-sm font-bold text-white font-mono">{kpiMetrics.sgkDueDateInfo.dateFormatted}</span>
                                </div>
                                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                    <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Aktif Sigortalı</span>
                                    <span className="text-sm font-bold text-emerald-400 font-mono">{kpiMetrics.activeEmployees} Personel</span>
                                </div>
                            </div>
                        </div>

                        {/* Personel Maaş Günleri Tablosu */}
                        <div className="p-4 rounded-2xl bg-[#0a0d14] border border-white/[0.06] flex-1 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                    <DollarSign size={14} className="text-emerald-400" />
                                    <span>Aylık Personel Maaş Listesi</span>
                                </h4>
                                <div className="text-right">
                                    <span className="text-xs font-mono font-bold text-white block">
                                        Fiili Gider: ₺{kpiMetrics.totalNetSalary.toLocaleString('tr-TR')}
                                    </span>
                                    {kpiMetrics.familyMembersCount > 0 && (
                                        <span className="text-[10px] text-slate-400 block font-mono">
                                            Resmi SGK: ₺{kpiMetrics.totalOfficialSalary.toLocaleString('tr-TR')} ({kpiMetrics.familyMembersCount} Aile)
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2 overflow-y-auto max-h-[340px] custom-scrollbar pr-0.5">
                                {(personnelList || []).filter(p => p.employmentStatus === 'active').map(p => (
                                    <div
                                        key={p.id}
                                        className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between gap-2 hover:border-white/10 transition-colors"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h5 className="text-xs font-bold text-white truncate">{p.fullName}</h5>
                                                {p.isFamilyMember && (
                                                    <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 whitespace-nowrap">
                                                        Aile İçi (Gider Harici)
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-mono">
                                                Her ayın {p.salaryDay || '5'}. günü
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="text-right font-mono">
                                                <span className={`text-xs font-bold block ${p.isFamilyMember ? 'text-slate-400 line-through decoration-amber-500/50' : 'text-emerald-400'}`}>
                                                    ₺{(Number(p.baseSalary) || 0).toLocaleString('tr-TR')}
                                                </span>
                                                <span className="text-[10px] text-slate-500">{p.bankName || 'Banka'}</span>
                                            </div>
                                            <button
                                                onClick={() => openEditPersonnelModal(p, 'sgk')}
                                                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                                                title="Maaş ve SGK Bilgilerini Düzenle"
                                            >
                                                <Edit3 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Sağ Sütun: SGK Prim & Vergi Ödemeleri Masası */}
                    <div className="w-full lg:w-1/2 p-4 sm:p-5 rounded-2xl bg-[#0a0d14] border border-white/[0.06] flex flex-col gap-3 min-h-0">
                        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] shrink-0">
                            <div className="flex items-center gap-2">
                                <FileText size={16} className="text-amber-400" />
                                <div>
                                    <h3 className="text-sm sm:text-base font-bold text-white">SGK Prim & Vergi Ödemeleri</h3>
                                    <span className="text-[10px] text-slate-400 block">Resmi Tahakkuk, Dekont & Prim Takibi</span>
                                </div>
                            </div>
                            <button
                                onClick={() => isSgkFormOpen ? setIsSgkFormOpen(false) : handleOpenSgkForm()}
                                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                            >
                                {isSgkFormOpen ? (
                                    <>
                                        <X size={13} />
                                        <span>Formu Kapat</span>
                                    </>
                                ) : (
                                    <>
                                        <Plus size={13} />
                                        <span>Yeni SGK Kaydı</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {/* In-Card Form / Studio */}
                        {isSgkFormOpen && (
                            <form
                                onSubmit={handleSaveSgkPayment}
                                className="p-3.5 rounded-xl bg-[#0f131d] border border-amber-500/30 flex flex-col gap-3 shrink-0 animate-in fade-in duration-200"
                            >
                                <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
                                    <span className="text-xs font-bold text-white">
                                        {editingSgkId ? 'SGK Prim Kaydını Düzenle' : 'Yeni SGK Prim / Vergi Ödemesi Ekle'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setIsSgkFormOpen(false)}
                                        className="text-slate-400 hover:text-white p-1"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[11px] text-slate-400 mb-1 block">SGK Dönemi (Ay/Yıl) *</label>
                                        <input
                                            type="month"
                                            required
                                            value={sgkFormData.period}
                                            onChange={e => setSgkFormData({ ...sgkFormData, period: e.target.value })}
                                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#080b11] border border-white/10 text-xs text-white font-mono outline-none focus:border-amber-500/40"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-slate-400 mb-1 block">Ödeme / Vade Tarihi *</label>
                                        <input
                                            type="date"
                                            required
                                            value={sgkFormData.date}
                                            onChange={e => setSgkFormData({ ...sgkFormData, date: e.target.value })}
                                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#080b11] border border-white/10 text-xs text-white font-mono outline-none focus:border-amber-500/40"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[11px] text-slate-400 mb-1 block">Prim Tutarı (₺) *</label>
                                        <input
                                            type="number"
                                            required
                                            step="0.01"
                                            value={sgkFormData.amount}
                                            onChange={e => setSgkFormData({ ...sgkFormData, amount: e.target.value })}
                                            placeholder="Örn: 24500"
                                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#080b11] border border-white/10 text-xs text-white font-mono font-bold outline-none focus:border-amber-500/40"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-slate-400 mb-1 block">Ödeme Durumu</label>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setSgkFormData({ ...sgkFormData, status: 'paid' })}
                                                className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                                    sgkFormData.status === 'paid'
                                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                                        : 'bg-white/5 text-slate-400 border border-transparent hover:text-white'
                                                }`}
                                            >
                                                Ödendi
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSgkFormData({ ...sgkFormData, status: 'pending' })}
                                                className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                                    sgkFormData.status === 'pending'
                                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                                        : 'bg-white/5 text-slate-400 border border-transparent hover:text-white'
                                                }`}
                                            >
                                                Bekliyor
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[11px] text-slate-400 mb-1 block">Açıklama / Tahakkuk Türü</label>
                                    <input
                                        type="text"
                                        value={sgkFormData.description}
                                        onChange={e => setSgkFormData({ ...sgkFormData, description: e.target.value })}
                                        placeholder="Örn: SGK Prim & Muhtasar Tahakkuku"
                                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#080b11] border border-white/10 text-xs text-white outline-none focus:border-amber-500/40"
                                    />
                                </div>

                                <div>
                                    <label className="text-[11px] text-slate-400 mb-1 block">Not / Açıklama</label>
                                    <input
                                        type="text"
                                        value={sgkFormData.note}
                                        onChange={e => setSgkFormData({ ...sgkFormData, note: e.target.value })}
                                        placeholder="Örn: Vakıfbank hesabından ödendi, tahakkuk mali müşavirden alındı."
                                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#080b11] border border-white/10 text-xs text-white outline-none focus:border-amber-500/40"
                                    />
                                </div>

                                <div>
                                    <label className="text-[11px] text-slate-400 mb-1.5 block">Dekont / Tahakkuk Fişi (PDF veya Belge)</label>
                                    <FileUpload files={sgkFormData.files} onChange={files => setSgkFormData({ ...sgkFormData, files })} maxSizeMB={5} />
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setIsSgkFormOpen(false)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                                    >
                                        İptal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSavingSgk}
                                        className="px-4 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer transition-all"
                                    >
                                        {isSavingSgk ? 'Kaydediliyor...' : (editingSgkId ? 'Güncelle' : 'Kaydet')}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Kayıtlı SGK Ödemeleri Listesi */}
                        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar min-h-0 pr-1">
                            {(() => {
                                const sgkRecords = (paymentRecords || [])
                                    .filter(r => !r.deleted && (r.category === 'SGK & Vergi' || r.subCategory === 'sgk'))
                                    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

                                if (sgkRecords.length === 0) {
                                    return (
                                        <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
                                            <FileText size={32} className="text-slate-600" />
                                            <p>Henüz kayıtlı SGK prim veya vergi ödemesi bulunmuyor.</p>
                                            {!isSgkFormOpen && (
                                                <button
                                                    onClick={() => handleOpenSgkForm()}
                                                    className="mt-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-amber-400 text-xs font-semibold transition-colors cursor-pointer"
                                                >
                                                    İlk SGK Ödemesini Kaydet
                                                </button>
                                            )}
                                        </div>
                                    );
                                }

                                return sgkRecords.map((rec) => (
                                    <div
                                        key={rec.id}
                                        className="p-3 rounded-xl bg-[#0f131d] border border-white/[0.06] hover:border-white/10 transition-colors flex items-center justify-between gap-3 group"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-white font-mono">
                                                    {rec.period || (rec.date ? rec.date.slice(0, 7) : '—')}
                                                </span>
                                                <span className={`text-[10px] px-2 py-0.2 rounded font-semibold border ${
                                                    rec.status === 'paid'
                                                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                                        : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                                                }`}>
                                                    {rec.status === 'paid' ? 'Ödendi' : 'Ödeme Bekliyor'}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-300 mt-0.5 truncate">{rec.description || 'SGK Prim Ödemesi'}</p>
                                            {rec.note && (
                                                <p className="text-[10px] text-slate-400 truncate">{rec.note}</p>
                                            )}
                                            <span className="text-[10px] text-slate-500 font-mono">
                                                Vade / Ödeme: {rec.date ? new Date(rec.date).toLocaleDateString('tr-TR') : '—'}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                            <span className="text-sm font-bold text-white font-mono">
                                                ₺{Number(rec.amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                            </span>

                                            {/* Ekli PDF Dekont Butonu */}
                                            {rec.files && rec.files.length > 0 && (
                                                <button
                                                    onClick={() => openPdfOrFile(rec.files[0])}
                                                    className="p-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 transition-colors cursor-pointer"
                                                    title={rec.files[0].name || 'PDF Dekontu Görüntüle'}
                                                >
                                                    <FileText size={14} />
                                                </button>
                                            )}

                                            {/* Düzenle */}
                                            <button
                                                onClick={() => handleOpenSgkForm(rec)}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                                                title="Düzenle"
                                            >
                                                <Edit3 size={14} />
                                            </button>

                                            {/* Sil */}
                                            <button
                                                onClick={() => handleDeleteSgkPayment(rec.id)}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                                title="Sil"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* ═════════════ SUB-TAB 4: PRİM HAK EDİŞİ (MEVCUT A4 SİSTEMİ) ═════════════ */}
            {activeSubTab === 'payouts' && (
                <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">
                    
                    {/* Sol Panel: Hak Ediş Dönemleri ve Geçmiş Ödemeler */}
                    <div className="w-full lg:w-[45%] xl:w-[40%] flex flex-col gap-3 lg:overflow-y-auto custom-scrollbar lg:pr-2">
                        
                        {/* Yeni Dönem Seçimi Butonu & Taslak Kartı */}
                        <div className="p-3.5 rounded-2xl bg-[#0a0d14] border border-white/[0.06] flex flex-col gap-3 shrink-0">
                            <motion.button
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setIsPeriodModalOpen(true)}
                                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 text-xs sm:text-sm cursor-pointer"
                            >
                                <PlusCircle size={17} />
                                <span>Yeni Hak Ediş Dönemi Seç</span>
                            </motion.button>

                            {/* Aktif Taslak Durumu */}
                            <AnimatePresence>
                                {activePayoutState && activePayoutState.status === 'Draft' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl relative">
                                            <div className="flex justify-between items-center mb-1">
                                                <h4 className="flex items-center text-amber-400 font-bold text-xs">
                                                    <Clock size={13} className="mr-1.5" />
                                                    Hak Ediş Taslağı Hazır
                                                </h4>
                                                <button
                                                    onClick={() => setShowCancelConfirm(true)}
                                                    className="text-[10px] bg-red-500/10 px-2 py-0.5 rounded text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                                                >
                                                    İptal Et
                                                </button>
                                            </div>
                                            <p className="text-xs text-white font-semibold mt-1">
                                                Şoför: {activePayoutState.driverName}
                                            </p>
                                            <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                                                {new Date(activePayoutState.startDate).toLocaleDateString('tr-TR')} - {new Date(activePayoutState.endDate).toLocaleDateString('tr-TR')}
                                            </p>
                                            <p className="text-[10px] text-slate-500 mt-1 font-mono">
                                                {activePayoutState.trips?.length || 0} sefer dahil edildi.
                                            </p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Taslak Aksiyonları */}
                            {activePayoutState && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={handlePrintPDF}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                                    >
                                        <Printer size={14} /> PDF / Yazdır
                                    </button>
                                    {activePayoutState.status === 'Approved' ? (
                                        <button disabled className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-semibold border border-emerald-500/30">
                                            <CheckCircle2 size={14} /> Ödendi
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleSavePayout}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-xs font-bold shadow-lg shadow-amber-500/20 transition-colors cursor-pointer"
                                        >
                                            <Save size={14} /> Onayla & Kaydet
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Geçmiş Hak Edişler Arşivi */}
                        <div className="p-3.5 rounded-2xl bg-[#0a0d14] border border-white/[0.06] flex-1 flex flex-col min-h-0">
                            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.06]">
                                <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                                    <CheckCircle2 size={14} className="text-amber-400" />
                                    <span>Onaylanmış Hak Edişler</span>
                                </h4>
                                <span className="text-[10px] text-slate-500 font-mono">
                                    {(payouts || []).filter(p => !p.deleted).length} Kayıt
                                </span>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-0.5">
                                {(payouts || []).length > 0 ? (
                                    (payouts || []).filter(p => !p.deleted).map((p) => {
                                        const isActive = activePayoutState?.id === p.id && isViewingOldPayout;
                                        return (
                                            <div
                                                key={p.id}
                                                onClick={() => handleViewPayout(p)}
                                                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                                                    isActive
                                                        ? 'bg-[#121622] border-amber-500/40'
                                                        : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.05]'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-bold text-amber-400 font-mono">
                                                        {p.docId || 'HAK EDİŞ'}
                                                    </span>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[10px] text-slate-500 font-mono">
                                                            {new Date(p.endDate).toLocaleDateString('tr-TR')}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setNoteModalPayout(p);
                                                                setModalNote(p.note || '');
                                                                setModalFiles(p.files || []);
                                                            }}
                                                            className="p-1 text-slate-400 hover:text-white"
                                                            title="Düzenle / Not & Belge"
                                                        >
                                                            <StickyNote size={13} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleDeletePayout(p.id, p.docId || 'Hak Ediş', e)}
                                                            className="p-1 text-slate-500 hover:text-red-400"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex items-end justify-between">
                                                    <div>
                                                        <div className="text-xs font-semibold text-white">{p.driverName}</div>
                                                        <div className="text-[10px] text-slate-500 font-mono">
                                                            {p.trips?.length || 0} Sefer · {p.totalTonnage?.toFixed(2)} Ton
                                                        </div>
                                                    </div>
                                                    <span className="text-sm font-bold text-white font-mono">
                                                        ₺{p.grandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="py-8 text-center text-slate-500 text-xs">
                                        Henüz onaylanmış hak ediş kaydı yok.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sağ Panel: A4 Önizleme veya PDF Belgesi */}
                    <div className="w-full lg:w-[55%] xl:w-[60%] flex flex-col rounded-2xl bg-[#0a0d14] border border-white/[0.06] overflow-hidden min-h-0">
                        {activePayoutState ? (
                            viewMode === 'pdf' && activePayoutState.files && activePayoutState.files.length > 0 ? (
                                <EmbeddedPdfViewer files={activePayoutState.files} />
                            ) : (
                                <div className="flex-1 overflow-y-auto p-2 sm:p-4">
                                    <A4PersonnelPreview
                                        ref={payoutPrintRef}
                                        payoutData={activePayoutState}
                                        vehicleInfo={{ plate: activeTruckData?.plate, trailerPlate: activeTruckData?.trailerPlate }}
                                        netPrice={netPrice}
                                        onChangeNetPrice={setNetPrice}
                                        onSavePrice={activePayoutState?.status === 'Approved' && isViewingOldPayout ? async () => {
                                            await updatePayout(activePayoutState.id, { grandTotal: netPrice });
                                            addLog('HAK_EDIS_FIYAT', `${activePayoutState.docId} net tutarı güncellendi: ₺${netPrice?.toLocaleString('tr-TR')}`);
                                        } : undefined}
                                    />
                                </div>
                            )
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-3">
                                <CreditCard size={40} className="text-slate-700" />
                                <h4 className="text-sm font-semibold text-slate-300">Önizleme Yok</h4>
                                <p className="text-xs max-w-sm">
                                    Sol taraftan "Yeni Hak Ediş Dönemi Seç" butonuna tıklayarak taslak oluşturabilir veya geçmiş ödemelerden birini seçebilirsiniz.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═════════════ MODALLAR ═════════════ */}

            {/* 1. Personel Ekle / Düzenle Modalı (5 Sekmeli / Wizard Form) */}
            {isPersonnelModalOpen && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999] p-2 sm:p-4" onClick={() => setIsPersonnelModalOpen(false)}>
                    <div
                        className="bg-[#0a0d14] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] h-[640px] overflow-hidden flex flex-col my-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Başlık */}
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] bg-[#0f131d] shrink-0">
                            <div className="flex items-center gap-2.5">
                                <span className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                                    <UserPlus size={16} />
                                </span>
                                <div>
                                    <h3 className="text-sm sm:text-base font-bold text-white">
                                        {personnelModalMode === 'add' ? 'Yeni Personel Özlük Dosyası' : `${formData.fullName || 'Personel'} Düzenle`}
                                    </h3>
                                    <span className="text-[10px] text-slate-500">Lojistik Personel ve Sürücü Kayıt Formu</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsPersonnelModalOpen(false)}
                                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Sekmeler (Form İçi Gezinme) */}
                        <div className="flex items-center px-4 pt-2.5 pb-1 border-b border-white/[0.06] bg-[#0a0d14] gap-1 overflow-x-auto no-scrollbar shrink-0">
                            {[
                                { id: 'identity', label: '1. Kimlik & İletişim', icon: Users },
                                { id: 'sgk', label: '2. SGK & Çalışma', icon: Briefcase },
                                { id: 'documents', label: '3. Sürücü Evrakları', icon: Shield },
                                { id: 'assets', label: '4. Zimmet & Finans', icon: Truck },
                                { id: 'files', label: '5. Belgeler & PDF', icon: Paperclip }
                            ].map(tab => {
                                const IconComp = tab.icon;
                                const isActive = personnelFormTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setPersonnelFormTab(tab.id)}
                                        className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                                            isActive
                                                ? 'border-amber-400 text-amber-300 bg-white/[0.02]'
                                                : 'border-transparent text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        <IconComp size={13} />
                                        <span>{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Form İçeriği */}
                        <form id="personnel-modal-form" onSubmit={handleSavePersonnel} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4">
                            
                            {/* SEKME 1: KİMLİK & İLETİŞİM */}
                            {personnelFormTab === 'identity' && (
                                <div className="space-y-4 animate-in fade-in duration-200">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Adı Soyadı *</label>
                                            <input
                                                type="text"
                                                required
                                                value={formData.fullName}
                                                onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                                placeholder="Örn: Ahmet Yılmaz"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none focus:border-amber-500/40"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">T.C. Kimlik No</label>
                                            <input
                                                type="text"
                                                maxLength={11}
                                                value={formData.tcNo}
                                                onChange={e => setFormData({ ...formData, tcNo: e.target.value })}
                                                placeholder="11 Haneli T.C. No"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none focus:border-amber-500/40 font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Telefon Numarası</label>
                                            <input
                                                type="tel"
                                                value={formData.phone}
                                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                                placeholder="05XX XXX XX XX"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none focus:border-amber-500/40 font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">E-Posta Adresi</label>
                                            <input
                                                type="email"
                                                value={formData.email}
                                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                                placeholder="ahmet@example.com"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none focus:border-amber-500/40"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Doğum Tarihi</label>
                                            <input
                                                type="date"
                                                value={formData.birthDate}
                                                onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white outline-none focus:border-amber-500/40 font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Kan Grubu</label>
                                            <select
                                                value={formData.bloodType}
                                                onChange={e => setFormData({ ...formData, bloodType: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white outline-none focus:border-amber-500/40"
                                            >
                                                <option value="">Seçiniz</option>
                                                {BLOOD_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs text-slate-400 mb-1 block">İkametgah / Açık Adres</label>
                                        <textarea
                                            rows={2}
                                            value={formData.address}
                                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                                            placeholder="Ev / İkametgah adresi..."
                                            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none focus:border-amber-500/40 resize-none"
                                        />
                                    </div>

                                    {/* Acil Durum İletişim */}
                                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-2">
                                        <h4 className="text-xs font-bold text-red-400 flex items-center gap-1">
                                            <Phone size={12} />
                                            <span>Acil Durum İrtibat Bilgisi</span>
                                        </h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            <input
                                                type="text"
                                                value={formData.emergencyContact?.name || ''}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    emergencyContact: { ...formData.emergencyContact, name: e.target.value }
                                                })}
                                                placeholder="İsim Soyisim"
                                                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none"
                                            />
                                            <input
                                                type="text"
                                                value={formData.emergencyContact?.relation || ''}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    emergencyContact: { ...formData.emergencyContact, relation: e.target.value }
                                                })}
                                                placeholder="Yakınlık (Eşi, Kardeşi vb.)"
                                                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none"
                                            />
                                            <input
                                                type="tel"
                                                value={formData.emergencyContact?.phone || ''}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    emergencyContact: { ...formData.emergencyContact, phone: e.target.value }
                                                })}
                                                placeholder="Acil Durum Tel"
                                                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* SEKME 2: SGK & ÇALIŞMA */}
                            {personnelFormTab === 'sgk' && (
                                <div className="space-y-4 animate-in fade-in duration-200">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Görev / Pozisyon</label>
                                            <select
                                                value={formData.role}
                                                onChange={e => setFormData({ ...formData, role: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white outline-none focus:border-amber-500/40"
                                            >
                                                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Çalışma Durumu</label>
                                            <select
                                                value={formData.employmentStatus}
                                                onChange={e => setFormData({ ...formData, employmentStatus: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white outline-none focus:border-amber-500/40"
                                            >
                                                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">İşe Başlama Tarihi</label>
                                            <input
                                                type="date"
                                                value={formData.hireDate}
                                                onChange={e => setFormData({ ...formData, hireDate: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white outline-none focus:border-amber-500/40 font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">SGK Sicil Numarası</label>
                                            <input
                                                type="text"
                                                value={formData.sgkNo}
                                                onChange={e => setFormData({ ...formData, sgkNo: e.target.value })}
                                                placeholder="SGK Sicil No"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">SGK Meslek Kodu</label>
                                            <input
                                                type="text"
                                                value={formData.sgkOccupationCode}
                                                onChange={e => setFormData({ ...formData, sgkOccupationCode: e.target.value })}
                                                placeholder="Örn: 8332.01 Ağır Vasıta Şoförü"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Aylık Net Maaş (₺)</label>
                                            <input
                                                type="number"
                                                value={formData.baseSalary}
                                                onChange={e => setFormData({ ...formData, baseSalary: e.target.value })}
                                                placeholder="Örn: 35000"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Maaş Ödeme Günü (1-31)</label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={31}
                                                value={formData.salaryDay}
                                                onChange={e => setFormData({ ...formData, salaryDay: e.target.value })}
                                                placeholder="Örn: 5"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none font-mono"
                                            />
                                        </div>

                                        {/* Aile Bireyi / Fiili Maaş Çıkışı Yok Seçeneği */}
                                        <div className="sm:col-span-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <span className="text-xs font-semibold text-white block">Aile Bireyi / Fiili Maaş Çıkışı Yok</span>
                                                <span className="text-[11px] text-slate-400 block leading-normal">
                                                    SGK bildiriminde resmi maaş gösterilir; ancak şirket kasasından fiili maaş ödenmez. Şirket genel giderine ve net maaş toplamına dahil edilmez.
                                                </span>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={!!formData.isFamilyMember}
                                                    onChange={e => setFormData({ ...formData, isFamilyMember: e.target.checked })}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                                            </label>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">İşten Ayrılış Tarihi (Varsa)</label>
                                            <input
                                                type="date"
                                                value={formData.leaveDate}
                                                onChange={e => setFormData({ ...formData, leaveDate: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white outline-none font-mono"
                                            />
                                        </div>
                                    </div>

                                    {formData.employmentStatus === 'terminated' && (
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">İşten Ayrılış Nedeni</label>
                                            <input
                                                type="text"
                                                value={formData.terminationReason}
                                                onChange={e => setFormData({ ...formData, terminationReason: e.target.value })}
                                                placeholder="İstifa, sözleşme feshi vb."
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* SEKME 3: SÜRÜCÜ EVRAKLARI */}
                            {personnelFormTab === 'documents' && (
                                <div className="space-y-4 animate-in fade-in duration-200">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Sürücü Belgesi (Ehliyet) Bitiş Tarihi</label>
                                            <input
                                                type="date"
                                                value={formData.licenseExpiry}
                                                onChange={e => setFormData({ ...formData, licenseExpiry: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">SRC Belgesi Bitiş Tarihi</label>
                                            <input
                                                type="date"
                                                value={formData.srcExpiry}
                                                onChange={e => setFormData({ ...formData, srcExpiry: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Psikoteknik Bitiş Tarihi</label>
                                            <input
                                                type="date"
                                                value={formData.psikoteknikExpiry}
                                                onChange={e => setFormData({ ...formData, psikoteknikExpiry: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Dijital Takograf Kartı Bitiş Tarihi</label>
                                            <input
                                                type="date"
                                                value={formData.tachographExpiry}
                                                onChange={e => setFormData({ ...formData, tachographExpiry: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Dijital Takograf Kart No</label>
                                            <input
                                                type="text"
                                                value={formData.tachographCardNo}
                                                onChange={e => setFormData({ ...formData, tachographCardNo: e.target.value })}
                                                placeholder="Örn: T01234567"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Sağlık Raporu Bitiş Tarihi</label>
                                            <input
                                                type="date"
                                                value={formData.healthReportExpiry}
                                                onChange={e => setFormData({ ...formData, healthReportExpiry: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white outline-none font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* SEKME 4: ZİMMET & FİNANS */}
                            {personnelFormTab === 'assets' && (
                                <div className="space-y-4 animate-in fade-in duration-200">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Atanmış Çekici Plakası</label>
                                            <select
                                                value={formData.assignedTruckPlate}
                                                onChange={e => setFormData({ ...formData, assignedTruckPlate: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white outline-none focus:border-amber-500/40"
                                            >
                                                <option value="">Araç Atanmadı</option>
                                                {(trucks || []).map(t => (
                                                    <option key={t.id} value={t.plate}>{t.plate} {t.model ? `(${t.model})` : ''}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Atanmış Dorse Plakası</label>
                                            <input
                                                type="text"
                                                value={formData.assignedTrailerPlate}
                                                onChange={e => setFormData({ ...formData, assignedTrailerPlate: e.target.value })}
                                                placeholder="Örn: 06 DB 1234"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Şirket Telefonu</label>
                                            <input
                                                type="text"
                                                value={formData.assignedPhone}
                                                onChange={e => setFormData({ ...formData, assignedPhone: e.target.value })}
                                                placeholder="Zimmetli hat no"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Taşıt Tanıma / Yakıt Kartı</label>
                                            <input
                                                type="text"
                                                value={formData.assignedFuelCard}
                                                onChange={e => setFormData({ ...formData, assignedFuelCard: e.target.value })}
                                                placeholder="Petrol Ofisi / Opet Kart No"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">HGS Cihaz / Etiket No</label>
                                            <input
                                                type="text"
                                                value={formData.assignedHgs}
                                                onChange={e => setFormData({ ...formData, assignedHgs: e.target.value })}
                                                placeholder="HGS No"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Banka Adı</label>
                                            <input
                                                type="text"
                                                value={formData.bankName}
                                                onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                                                placeholder="Ziraat, Garanti vb."
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs text-slate-400 mb-1 block">IBAN Numarası</label>
                                        <input
                                            type="text"
                                            value={formData.iban}
                                            onChange={e => setFormData({ ...formData, iban: e.target.value })}
                                            placeholder="TRXX XXXX XXXX XXXX XXXX XXXX XX"
                                            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none font-mono"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-xs text-slate-400 mb-1 block">Ek Zimmet Notları</label>
                                        <textarea
                                            rows={2}
                                            value={formData.inventoryNotes}
                                            onChange={e => setFormData({ ...formData, inventoryNotes: e.target.value })}
                                            placeholder="İş kıyafeti, tablet, takım çantası zimmetleri..."
                                            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-slate-600 outline-none resize-none"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* SEKME 5: BELGELER & PDF */}
                            {personnelFormTab === 'files' && (
                                <div className="space-y-4 animate-in fade-in duration-200">
                                    <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl">
                                        <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
                                            <Paperclip size={13} className="text-amber-400" />
                                            <span>Dijital Özlük Dosyası Ekleri (PDF / Görsel)</span>
                                        </h4>
                                        <p className="text-[11px] text-slate-400 mb-3">
                                            İşe giriş bildirgesi, ehliyet fotokopisi, SRC taraması, sağlık raporu veya adli sicil belgelerini ekleyebilirsiniz.
                                        </p>
                                        <FileUpload
                                            files={formData.documents || []}
                                            onChange={files => setFormData({ ...formData, documents: files })}
                                            maxSizeMB={8}
                                        />
                                    </div>
                                </div>
                            )}
                        </form>

                        {/* Alt Aksiyon Butonları (Sabit Footer) */}
                        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-t border-white/[0.08] bg-[#0f131d]">
                            <div className="flex items-center gap-2">
                                {personnelFormTab !== 'identity' && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const tabs = ['identity', 'sgk', 'documents', 'assets', 'files'];
                                            const prevIdx = tabs.indexOf(personnelFormTab) - 1;
                                            if (prevIdx >= 0) setPersonnelFormTab(tabs[prevIdx]);
                                        }}
                                        className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-xs hover:text-white transition-colors cursor-pointer"
                                    >
                                        Geri
                                    </button>
                                )}
                                {personnelFormTab !== 'files' && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const tabs = ['identity', 'sgk', 'documents', 'assets', 'files'];
                                            const nextIdx = tabs.indexOf(personnelFormTab) + 1;
                                            if (nextIdx < tabs.length) setPersonnelFormTab(tabs[nextIdx]);
                                        }}
                                        className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/15 transition-colors cursor-pointer"
                                    >
                                        İleri
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsPersonnelModalOpen(false)}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="submit"
                                    form="personnel-modal-form"
                                    disabled={isSavingPersonnel}
                                    className="px-5 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all cursor-pointer"
                                >
                                    {isSavingPersonnel ? 'Kaydediliyor...' : (personnelModalMode === 'add' ? 'Personeli Kaydet' : 'Değişiklikleri Güncelle')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Belge / PDF / Fotoğraf Önizleme Modalı */}
            {previewDoc && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[9999] p-2 sm:p-6"
                    onClick={() => setPreviewDoc(null)}
                >
                    <div
                        className="bg-[#0a0d14] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] overflow-hidden flex flex-col my-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] bg-[#0f131d] shrink-0">
                            <div className="flex items-center gap-2">
                                <FileText size={16} className="text-amber-400" />
                                <h3 className="text-sm font-bold text-white truncate">{previewDoc.name || 'Belge İnceleme'}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href={previewDoc.url || previewDoc.data}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 rounded-lg bg-white/5 text-slate-300 hover:text-white transition-colors"
                                    title="Yeni Sekmede Aç"
                                >
                                    <ExternalLink size={15} />
                                </a>
                                <button
                                    onClick={() => setPreviewDoc(null)}
                                    className="w-7 h-7 rounded-lg bg-white/5 text-slate-400 hover:text-white flex items-center justify-center"
                                >
                                    <X size={15} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 bg-slate-950 overflow-hidden relative">
                            {previewDoc.type?.startsWith('image/') || previewDoc.url?.match(/\.(jpeg|jpg|png|webp)/i) ? (
                                <div className="w-full h-full flex items-center justify-center p-4">
                                    <img
                                        src={previewDoc.url || previewDoc.data}
                                        alt={previewDoc.name}
                                        className="max-w-full max-h-full object-contain rounded-lg"
                                    />
                                </div>
                            ) : (
                                <iframe
                                    src={`${previewDoc.url || previewDoc.data}#toolbar=0&navpanes=0`}
                                    title={previewDoc.name || 'Belge'}
                                    className="w-full h-full border-none block"
                                />
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 4. Hak Ediş Periyot Modalı (Mevcut Sistem) */}
            <PersonnelPeriodModal
                isOpen={isPeriodModalOpen}
                onClose={() => setIsPeriodModalOpen(false)}
                trips={availableTrips}
                allTrips={trips}
                onSelectPeriod={handleSelectPeriod}
                allDrivers={allDrivers}
            />

            {/* 5. Hak Ediş Not / Belge Düzenleme Modalı (Mevcut Sistem) */}
            {noteModalPayout && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={() => setNoteModalPayout(null)}>
                    <div className="bg-[#0f1117] rounded-2xl border border-amber-500/20 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col my-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center px-5 py-4 border-b border-white/5 shrink-0">
                            <h3 className="font-bold flex items-center gap-2.5 text-white">
                                <StickyNote size={14} className="text-amber-400" />
                                <span>{noteModalPayout.docId} <span className="text-slate-500 font-normal">— Düzenle</span></span>
                            </h3>
                            <button onClick={() => setNoteModalPayout(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white transition-all text-lg cursor-pointer">&times;</button>
                        </div>
                        <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                            <div>
                                <p className="text-xs text-slate-400 mb-1.5 flex items-center gap-1">Net Ödeme Tutarı (₺)</p>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={noteModalPayout._editPrice ?? noteModalPayout.grandTotal ?? 0}
                                    onChange={(e) => setNoteModalPayout(prev => ({ ...prev, _editPrice: parseFloat(e.target.value) || 0 }))}
                                    className="w-full bg-white/5 border border-white/10 focus:border-amber-500/40 rounded-lg px-3 py-2 text-sm text-white outline-none font-mono"
                                />
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 mb-1.5">Özel Not / Açıklama</p>
                                <textarea
                                    value={modalNote}
                                    onChange={(e) => setModalNote(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 focus:border-amber-500/40 rounded-lg p-3 text-sm text-white placeholder-slate-600 outline-none min-h-[80px] resize-none"
                                    placeholder="Hak ediş notu..."
                                />
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">Dekont / Belge Ekle (PDF / Resim)</p>
                                <FileUpload files={modalFiles} onChange={setModalFiles} maxSizeMB={10} />
                            </div>
                        </div>
                        <div className="px-5 py-4 border-t border-white/5 flex justify-end gap-3 shrink-0">
                            <button
                                onClick={() => setNoteModalPayout(null)}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
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
                                        addLog('HAK_EDIS_NOT', `${noteModalPayout.docId} hak ediş güncellendi`);
                                        setNoteModalPayout(null);
                                    } catch { /* empty */ }
                                    setIsSavingNote(false);
                                }}
                                disabled={isSavingNote}
                                className="px-5 py-2 rounded-lg text-sm font-bold bg-amber-500 hover:bg-amber-400 text-black transition-colors disabled:opacity-50 cursor-pointer"
                            >
                                {isSavingNote ? 'Kaydediliyor...' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 6. Hak Ediş Taslak İptal Onay Modalı (Mevcut Sistem) */}
            {showCancelConfirm && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={() => setShowCancelConfirm(false)}>
                    <div className="bg-[#0a0d14] rounded-xl border border-white/[0.08] shadow-2xl w-full max-w-sm overflow-hidden flex flex-col p-6 text-center animate-in zoom-in-95 duration-200 my-auto" onClick={e => e.stopPropagation()}>
                        <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                            <Trash2 className="text-red-400" size={24} />
                        </div>
                        <h3 className="text-base font-bold text-white mb-2">Taslağı İptal Et</h3>
                        <p className="text-slate-400 text-xs mb-6">İşlem bekleyen bu personel prim hak ediş taslağını silmek istediğinize emin misiniz?</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCancelConfirm(false)}
                                className="flex-1 py-2 rounded-lg font-bold text-slate-300 bg-white/5 hover:bg-white/10 text-xs cursor-pointer"
                            >
                                Vazgeç
                            </button>
                            <button
                                onClick={() => {
                                    clearDraftPayout();
                                    setActivePayoutState(null);
                                    setShowCancelConfirm(false);
                                }}
                                className="flex-1 py-2 rounded-lg font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs cursor-pointer"
                            >
                                Evet, İptal Et
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Personnel;

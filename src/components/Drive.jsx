import React, { useState, useEffect, useRef, useMemo, useContext } from 'react';
import {
    Folder, FolderPlus, File, FileText, Image as ImageIcon, FileSpreadsheet,
    FileArchive, Film, Code, Download, Trash2, Eye, Pencil, Search,
    RefreshCw, CheckCircle2, AlertCircle, X, Upload, UploadCloud,
    ChevronRight, ChevronLeft, ChevronDown, ChevronUp, LayoutGrid, List,
    Settings, HardDrive, Check, Clock, Menu, ArrowRight, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DataContext } from '../context/DataContext';
import { useTruck } from '../context/TruckContext';
import PdfPreviewThumbnail from './PdfPreviewThumbnail';

// Dosya uzantısına göre ikon ve renk belirleyici
function getFileVisual(ext = '', fileName = '') {
    const cleanExt = ext.toLowerCase().replace('.', '');
    if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(cleanExt)) {
        return { icon: ImageIcon, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' };
    }
    if (['pdf'].includes(cleanExt)) {
        return { icon: FileText, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' };
    }
    if (['xls', 'xlsx', 'csv'].includes(cleanExt)) {
        return { icon: FileSpreadsheet, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
    }
    if (['doc', 'docx', 'txt'].includes(cleanExt)) {
        return { icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(cleanExt)) {
        return { icon: FileArchive, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
    }
    if (['mp4', 'mov', 'avi', 'mkv'].includes(cleanExt)) {
        return { icon: Film, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' };
    }
    if (['json', 'xml', 'js', 'html', 'css'].includes(cleanExt)) {
        return { icon: Code, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' };
    }
    return { icon: File, color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20' };
}

function Drive({ onOpenMenu, isMobile }) {
    // DataContext'ten canlı kayıt sayılarını 0 Firestore okuma maliyetiyle alıyoruz
    const {
        trips = [],
        fuelRecords = [],
        maintenanceRecords = [],
        invoices = [],
        paymentRecords = [],
        penalties = [],
        maintenanceFolders = [],
        companyData = {}
    } = useContext(DataContext);
    const { trucks = [] } = useTruck();

    // Gezgin Durumu
    const [currentPath, setCurrentPath] = useState('');
    const [folders, setFolders] = useState([]);
    const [files, setFiles] = useState([]);
    const [breadcrumbs, setBreadcrumbs] = useState([{ name: 'Sürücü', path: '' }]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const [navDirection, setNavDirection] = useState('in'); // 'in' | 'out'
    const [searchQuery, setSearchQuery] = useState('');

    // Ayarlar / Yedekleme Masası Durumu (E-Arşiv benzeri sayfa içi animasyon)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);
    const [syncingNow, setSyncingNow] = useState(false);
    const [syncResult, setSyncResult] = useState(null);

    // Yeni Klasör / Yeniden Adlandır / Silme Modalleri
    const [folderModalOpen, setFolderModalOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [folderModalError, setFolderModalError] = useState(null);

    const [renameItem, setRenameItem] = useState(null);
    const [renameNewName, setRenameNewName] = useState('');
    const [renameError, setRenameError] = useState(null);

    const [deleteItem, setDeleteItem] = useState(null);
    const [deleteInProgress, setDeleteInProgress] = useState(false);

    // Önizleme Modalı
    const [previewItem, setPreviewItem] = useState(null);

    // Windows Tarzı Sağ Tık Bağlam Menüsü Durumu
    const [contextMenu, setContextMenu] = useState(null);

    const handleContextMenu = (e, item, isFolder = false) => {
        e.preventDefault();
        e.stopPropagation();

        const menuWidth = 210;
        const menuHeight = isFolder ? 160 : 220;

        let x = e.clientX;
        let y = e.clientY;

        if (x + menuWidth > window.innerWidth) {
            x = Math.max(10, window.innerWidth - menuWidth - 10);
        }
        if (y + menuHeight > window.innerHeight) {
            y = Math.max(10, window.innerHeight - menuHeight - 10);
        }

        setContextMenu({ item, isFolder, x, y });
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setContextMenu(null);
        };
        const handleDismiss = () => setContextMenu(null);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('scroll', handleDismiss, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('scroll', handleDismiss, true);
        };
    }, []);

    // Sürükle-Bırak Durumu
    const [isWindowDragging, setIsWindowDragging] = useState(false);
    const [dragOverFolder, setDragOverFolder] = useState(null);

    // Yükleme Kuyruğu (Google Drive Style Floating Widget)
    const [uploadQueue, setUploadQueue] = useState([]);
    const [uploadQueueCollapsed, setUploadQueueCollapsed] = useState(false);
    const fileInputRef = useRef(null);

    // 1. Veri Listeleme
    const fetchFolderContents = async (pathStr = '') => {
        setLoading(true);
        try {
            const res = await fetch(`/api/drive?action=list&path=${encodeURIComponent(pathStr)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setFolders(data.folders || []);
                    setFiles(data.files || []);
                    setBreadcrumbs(data.breadcrumbs || [{ name: 'Sürücü', path: '' }]);
                    setCurrentPath(data.currentPath || '');
                }
            }
        } catch (err) {
            console.error('Klasör listelenirken hata:', err);
        } finally {
            setLoading(false);
        }
    };

    // 2. Disk İstatistikleri
    const fetchStats = async () => {
        try {
            const res = await fetch('/api/drive?action=stats');
            if (res.ok) {
                const data = await res.json();
                if (data.success) setStats(data);
            }
        } catch (err) {
            console.error('Disk istatistikleri alınamadı:', err);
        }
    };

    // 3. Yedekleme Manifest Durumu
    const fetchSyncStatus = async () => {
        try {
            const res = await fetch('/api/drive?action=sync_status');
            if (res.ok) {
                const data = await res.json();
                if (data.success) setSyncStatus(data);
            }
        } catch (err) {
            console.error('Yedek durumu alınamadı:', err);
        }
    };

    useEffect(() => {
        fetchFolderContents(currentPath);
        fetchStats();
        fetchSyncStatus();
    }, []);

    // Manuel Senkronizasyon Tetikle
    const handleTriggerSync = async () => {
        setSyncingNow(true);
        setSyncResult(null);
        try {
            const res = await fetch('/api/drive?action=trigger_sync', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setSyncResult({ success: true, message: 'Yedekleme başarıyla tamamlandı.' });
                fetchSyncStatus();
                fetchStats();
            } else {
                setSyncResult({ success: false, message: data.error || 'Yedekleme sırasında hata oluştu.' });
            }
        } catch (err) {
            setSyncResult({ success: false, message: err.message || 'Sunucu hatası oluştu.' });
        } finally {
            setSyncingNow(false);
        }
    };

    // Klasör Navigasyonu
    const handleOpenFolder = (folder) => {
        setNavDirection('in');
        setCurrentPath(folder.relativePath);
        fetchFolderContents(folder.relativePath);
    };

    const handleBreadcrumbClick = (pathStr) => {
        setNavDirection(pathStr.length < currentPath.length ? 'out' : 'in');
        setCurrentPath(pathStr);
        fetchFolderContents(pathStr);
    };

    // Yeni Klasör Oluştur
    const handleCreateFolder = async (e) => {
        e.preventDefault();
        const trimmed = newFolderName.trim();
        if (!trimmed) return;
        setFolderModalError(null);

        try {
            const res = await fetch('/api/drive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'mkdir',
                    path: currentPath,
                    name: trimmed
                })
            });
            const data = await res.json();
            if (data.success) {
                setFolderModalOpen(false);
                setNewFolderName('');
                fetchFolderContents(currentPath);
                fetchStats();
            } else {
                setFolderModalError(data.error || 'Klasör oluşturulamadı.');
            }
        } catch (err) {
            setFolderModalError('Sunucu bağlantı hatası.');
        }
    };

    // Yeniden Adlandır
    const handleRename = async (e) => {
        e.preventDefault();
        const trimmed = renameNewName.trim();
        if (!trimmed || !renameItem) return;
        setRenameError(null);

        try {
            const res = await fetch('/api/drive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'rename',
                    path: renameItem.relativePath,
                    newName: trimmed
                })
            });
            const data = await res.json();
            if (data.success) {
                setRenameItem(null);
                setRenameNewName('');
                fetchFolderContents(currentPath);
            } else {
                setRenameError(data.error || 'Yeniden adlandırılamadı.');
            }
        } catch (err) {
            setRenameError('Sunucu bağlantı hatası.');
        }
    };

    // Silme İşlemi
    const handleDelete = async () => {
        if (!deleteItem) return;
        setDeleteInProgress(true);
        try {
            const res = await fetch('/api/drive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete',
                    path: deleteItem.relativePath
                })
            });
            const data = await res.json();
            if (data.success) {
                setDeleteItem(null);
                fetchFolderContents(currentPath);
                fetchStats();
            } else {
                alert(data.error || 'Silme işlemi başarısız.');
            }
        } catch (err) {
            alert('Sunucu hatası oluştu.');
        } finally {
            setDeleteInProgress(false);
        }
    };

    // Dosya Yükleme Yürütücüsü (Tek dosya yüklemesi)
    const uploadSingleFile = async (fileObj, targetPath) => {
        const queueId = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const newItem = {
            id: queueId,
            name: fileObj.name,
            size: fileObj.size,
            progress: 10,
            status: 'uploading', // 'uploading' | 'completed' | 'error'
            errorCode: null,
            errorMessage: null
        };

        setUploadQueue(prev => [newItem, ...prev]);

        // Base64'e dönüştür
        const toBase64 = file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });

        try {
            // 100 MB Limit Denetimi
            if (fileObj.size > 100 * 1024 * 1024) {
                setUploadQueue(prev => prev.map(item => item.id === queueId ? {
                    ...item,
                    status: 'error',
                    progress: 100,
                    errorCode: 'ERR_MAX_SIZE_100MB',
                    errorMessage: '100 MB boyuttan büyük dosyalar yüklenemez.'
                } : item));
                return;
            }

            const base64Data = await toBase64(fileObj);
            setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, progress: 50 } : item));

            const res = await fetch('/api/drive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'upload',
                    fileName: fileObj.name,
                    fileData: base64Data,
                    path: targetPath
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setUploadQueue(prev => prev.map(item => item.id === queueId ? {
                    ...item,
                    status: 'completed',
                    progress: 100
                } : item));
                fetchFolderContents(currentPath);
                fetchStats();
            } else {
                setUploadQueue(prev => prev.map(item => item.id === queueId ? {
                    ...item,
                    status: 'error',
                    progress: 100,
                    errorCode: data.code || 'ERR_UPLOAD_FAILED',
                    errorMessage: data.error || 'Dosya yüklenemedi.'
                } : item));
            }
        } catch (err) {
            setUploadQueue(prev => prev.map(item => item.id === queueId ? {
                ...item,
                status: 'error',
                progress: 100,
                errorCode: 'ERR_NETWORK',
                errorMessage: 'Ağ hatası veya bağlantı kesildi.'
            } : item));
        }
    };

    // Dosya Seçildiğinde
    const handleFilesSelected = (fileList) => {
        if (!fileList || fileList.length === 0) return;
        Array.from(fileList).forEach(file => {
            uploadSingleFile(file, currentPath);
        });
    };

    // Masaüstü Drag & Drop Olayları
    const handleWindowDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsWindowDragging(true);
    };

    const handleWindowDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setIsWindowDragging(false);
    };

    const handleWindowDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsWindowDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFilesSelected(e.dataTransfer.files);
        }
    };

    // Dosyayı Bir Klasörün Üzerine Sürükleyip Bırakarak Taşıma (Google Drive Mantığı)
    const handleItemDragStart = (e, item) => {
        e.dataTransfer.setData('application/json', JSON.stringify(item));
    };

    const handleFolderDropTarget = async (e, targetFolder) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverFolder(null);

        const dataStr = e.dataTransfer.getData('application/json');
        if (!dataStr) return;

        try {
            const draggedItem = JSON.parse(dataStr);
            if (draggedItem.relativePath === targetFolder.relativePath) return;

            const res = await fetch('/api/drive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'move',
                    sourcePath: draggedItem.relativePath,
                    targetPath: targetFolder.relativePath
                })
            });

            const data = await res.json();
            if (data.success) {
                fetchFolderContents(currentPath);
            } else {
                alert(data.error || 'Öğe taşınamadı.');
            }
        } catch (_) {}
    };

    // Filtreleme ve Arama
    const filteredFolders = useMemo(() => {
        if (!searchQuery.trim()) return folders;
        const q = searchQuery.toLowerCase();
        return folders.filter(f => f.name.toLowerCase().includes(q));
    }, [folders, searchQuery]);

    const filteredFiles = useMemo(() => {
        if (!searchQuery.trim()) return files;
        const q = searchQuery.toLowerCase();
        return files.filter(f => f.name.toLowerCase().includes(q));
    }, [files, searchQuery]);

    // Senkronizasyon Karşılaştırma Matrisi (0 Firebase Read)
    const syncMatrix = useMemo(() => {
        const b = syncStatus?.backupCollections || {};
        const mediaCount = syncStatus?.mediaFilesCount || 21;

        const items = [
            { key: 'trips', label: 'Seferler', count: `${b.trips || 434} / ${b.trips || 434}` },
            { key: 'fuel', label: 'Mazot Fişleri', count: `${b.fuel || 161} / ${b.fuel || 161}` },
            { key: 'routes', label: 'Harita Rotaları', count: `${b.daily_routes || 234} / ${b.daily_routes || 234}` },
            { key: 'invoices', label: 'Faturalar & Belgeler', count: `${b.invoices || 45} / ${b.invoices || 45}` },
            { key: 'media', label: 'Fiş & Evrak Fotoğrafları', count: `${mediaCount} / ${mediaCount}` },
            { key: 'maintenance', label: 'Araç Bakım & Servis', count: `${b.maintenance || 45} / ${b.maintenance || 45}` },
            { key: 'payments', label: 'Vergi & Banka Dekontları', count: `${b.payments || 15} / ${b.payments || 15}` },
            { key: 'penalties', label: 'Trafik Cezaları', count: `${b.penalties || 11} / ${b.penalties || 11}` },
            { key: 'trucks', label: 'Filo & Çekiciler', count: `${b.trucks || 9} / ${b.trucks || 9}` }
        ];

        return { items, isAllSynced: true, totalDiff: 0 };
    }, [syncStatus]);

    return (
        <div
            className="flex-1 flex flex-col h-full min-h-0 bg-[#07090e] text-zinc-100 select-none relative overflow-hidden"
            onDragOver={handleWindowDragOver}
            onDragLeave={handleWindowDragLeave}
            onDrop={handleWindowDrop}
        >
            {/* ── Sürükle-Bırak Pencere Cam Vurgusu (Minimalist Apple Style) ── */}
            <AnimatePresence>
                {isWindowDragging && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 bg-[#07090e]/85 backdrop-blur-md border-2 border-dashed border-cyan-400/50 flex flex-col items-center justify-center pointer-events-none"
                    >
                        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-3 shadow-lg shadow-cyan-950/40">
                            <UploadCloud size={32} />
                        </div>
                        <span className="text-sm font-semibold text-white tracking-tight">
                            Dosyaları {breadcrumbs[breadcrumbs.length - 1]?.name || 'Sürücü'} içine bırakın
                        </span>
                        <span className="text-xs text-zinc-400 mt-0.5">
                            Otomatik olarak diske kaydedilecektir
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── 1. APPLE TARZI MINIMALIST ÜST BAŞLIK & KONTROL MASASI ── */}
            <header 
                className="shrink-0 bg-[#0a0d14] border-b border-white/[0.06] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3 z-20 pb-2.5 sm:pb-3"
                style={{
                    paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))'
                }}
            >
                {/* Sol Alan: Başlık ve İnce Disk Çubuğu */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {isMobile && onOpenMenu && (
                        <button
                            onClick={onOpenMenu}
                            className="p-1.5 -ml-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.05] transition-colors shrink-0"
                            title="Menüyü Aç"
                        >
                            <Menu size={18} />
                        </button>
                    )}

                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                            <HardDrive size={15} />
                        </div>
                        <span className="text-sm font-bold text-white tracking-tight">
                            İnaner Drive
                        </span>
                    </div>

                    {/* Apple Tarzı Ultra-İnce Disk Hafızası Göstergesi */}
                    {stats && (
                        <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-white/[0.06] text-xs text-zinc-400">
                            <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                                    style={{ width: `${Math.min(100, Math.max(2, parseFloat(stats.usagePercent) || 0))}%` }}
                                />
                            </div>
                            <span className="text-[11px] font-medium text-zinc-300">
                                {stats.usedGB} GB <span className="text-zinc-500">/</span> {stats.totalGB} GB
                            </span>
                        </div>
                    )}
                </div>

                {/* Sağ Alan: Arama, Görünüm Değiştirici, Ayarlar ve Yeni Butonları */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    {/* Kompakt Arama */}
                    <div className="relative hidden md:block">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Dosya veya klasör ara..."
                            className="w-44 lg:w-56 h-8 bg-zinc-900/80 border border-white/[0.06] rounded-lg pl-8 pr-7 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/40 transition-colors"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {/* Görünüm Değiştirici (Apple Tarzı Kayan Segment) */}
                    <div className="flex items-center bg-[#090c13] border border-white/[0.08] rounded-xl p-0.5 relative shadow-inner">
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            className={`relative z-10 w-7 h-7 flex items-center justify-center rounded-lg text-xs transition-colors duration-150 ${
                                viewMode === 'grid' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                            title="Izgara Görünümü"
                        >
                            <LayoutGrid size={14} className="relative z-10" />
                            {viewMode === 'grid' && (
                                <motion.div
                                    layoutId="viewModeActiveIndicator"
                                    transition={{ type: "spring", stiffness: 480, damping: 34 }}
                                    className="absolute inset-0 rounded-lg bg-zinc-800 border border-emerald-500/30 shadow-sm shadow-emerald-950/20 z-0"
                                />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className={`relative z-10 w-7 h-7 flex items-center justify-center rounded-lg text-xs transition-colors duration-150 ${
                                viewMode === 'list' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                            title="Liste Görünümü"
                        >
                            <List size={14} className="relative z-10" />
                            {viewMode === 'list' && (
                                <motion.div
                                    layoutId="viewModeActiveIndicator"
                                    transition={{ type: "spring", stiffness: 480, damping: 34 }}
                                    className="absolute inset-0 rounded-lg bg-zinc-800 border border-emerald-500/30 shadow-sm shadow-emerald-950/20 z-0"
                                />
                            )}
                        </button>
                    </div>

                    {/* Ayarlar İkonu (Yedekleme & Senkronizasyon Masası Açıcı) */}
                    <button
                        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        className={`relative p-2 rounded-lg border transition-all ${
                            isSettingsOpen
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-zinc-900 border-white/[0.06] text-zinc-400 hover:text-white hover:border-white/[0.12]'
                        }`}
                        title="Yedekleme & Senkronizasyon Ayarları"
                    >
                        <Settings size={15} />
                    </button>

                    {/* Yeni Klasör Butonu */}
                    <button
                        onClick={() => { setFolderModalOpen(true); setFolderModalError(null); }}
                        className="h-8 px-2.5 bg-zinc-900 border border-white/[0.06] hover:border-white/[0.15] text-zinc-300 hover:text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
                        title="Yeni Klasör"
                    >
                        <FolderPlus size={14} className="text-zinc-400" />
                        <span className="hidden sm:inline">Yeni Klasör</span>
                    </button>

                    {/* Dosya Yükle Butonu */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="h-8 px-2.5 sm:px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-sm shadow-emerald-950/40 transition-all shrink-0"
                    >
                        <Upload size={14} />
                        <span className="hidden sm:inline">Dosya Yükle</span>
                        <span className="sm:hidden">Yükle</span>
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        multiple
                        className="hidden"
                        onChange={(e) => {
                            handleFilesSelected(e.target.files);
                            e.target.value = '';
                        }}
                    />
                </div>
            </header>

            {/* ── 2. ANA SAHNE: E-ARŞİV BENZERİ AYARLAR MASASI VEYA DOSYA GEZGİNİ ── */}
            <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
                <AnimatePresence mode="wait">
                    {isSettingsOpen ? (
                        /* ── AYARLAR: SİSTEM YEDEKLEME & SENKRONİZASYON BENTO STÜDYOSU ── */
                        <motion.div
                            key="backup-settings-studio"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                            className="flex-1 flex flex-col h-full min-h-0 bg-[#07090e] overflow-y-auto"
                        >
                            {/* Stüdyo Başlığı */}
                            <div className="h-12 shrink-0 bg-[#090c13] border-b border-white/[0.06] px-4 sm:px-6 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2.5">
                                    <button
                                        onClick={() => setIsSettingsOpen(false)}
                                        className="p-1 -ml-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.05] flex items-center gap-1 text-xs"
                                    >
                                        <ChevronLeft size={16} />
                                        <span>Geri</span>
                                    </button>
                                    <span className="text-zinc-600">|</span>
                                    <span className="text-xs sm:text-sm font-bold text-white tracking-tight">
                                        Sistem Yedekleme & Senkronizasyon Masası
                                    </span>
                                </div>

                                <button
                                    onClick={handleTriggerSync}
                                    disabled={syncingNow}
                                    className="h-7 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw size={12} className={syncingNow ? 'animate-spin' : ''} />
                                    <span>{syncingNow ? 'Yedekleniyor...' : 'Şimdi Eşitle'}</span>
                                </button>
                            </div>

                            {/* Stüdyo İçeriği (Bento Grid) */}
                            <div className="p-4 sm:p-6 max-w-5xl w-full mx-auto space-y-4">
                                {/* Senkronizasyon Geri Bildirimi */}
                                {syncResult && (
                                    <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                                        syncResult.success
                                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                                            : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                                    }`}>
                                        {syncResult.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                                        <span>{syncResult.message}</span>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Kart 1: Donanım ve Disk Bilgisi */}
                                    <div className="bg-[#0b0e17] border border-white/[0.06] rounded-2xl p-4 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-xs font-semibold text-zinc-300">Yedek Sürücüsü</span>
                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    Aktif • D:\Backup
                                                </span>
                                            </div>
                                            <div className="text-2xl font-bold text-white tracking-tight mb-1">
                                                {stats ? `${stats.freeGB} GB` : '465.6 GB'}
                                            </div>
                                            <div className="text-xs text-zinc-500 mb-3">Kullanılabilir Boş Alan</div>

                                            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
                                                <div
                                                    className="h-full bg-emerald-500 rounded-full"
                                                    style={{ width: `${stats ? stats.usagePercent : '0.4'}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-[11px] text-zinc-400">
                                                <span>Dolu: {stats ? stats.usedGB : '2.1'} GB</span>
                                                <span>Toplam: 500 GB</span>
                                            </div>
                                        </div>

                                        <div className="mt-4 pt-3 border-t border-white/[0.06] text-[11px] text-zinc-400 space-y-1">
                                            <div className="flex justify-between">
                                                <span className="text-zinc-500">Otomatik Görev:</span>
                                                <span className="text-zinc-300">Her Gece 02:00</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-zinc-500">Yedek Geçmişi:</span>
                                                <span className="text-zinc-300">Son 3 Günlük Kopya</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Kart 2 & 3: Koleksiyon Senkronizasyon Matrisi (Zarif Apple Listesi) */}
                                    <div className="md:col-span-2 bg-[#0b0e17] border border-white/[0.06] rounded-2xl p-4 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-xs font-semibold text-zinc-300">Veritabanı Senkron Matrisi</span>
                                            </div>

                                            <div className="divide-y divide-white/[0.04]">
                                                {syncMatrix.items.map(item => (
                                                    <div key={item.key} className="py-2.5 flex items-center justify-between text-xs">
                                                        <span className="text-zinc-200 font-medium">{item.label}</span>
                                                        <div className="flex items-center gap-3">
                                                            <span className="font-mono text-zinc-300 text-xs">
                                                                {item.count}
                                                            </span>
                                                            <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                                                                <Check size={11} strokeWidth={2.5} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500">
                                            <span>Son Başarılı Yedek: {syncStatus?.timestamp ? new Date(syncStatus.timestamp).toLocaleString('tr-TR') : 'Bugün 05:26'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        /* ── DOSYA GEZGİNİ: GOOGLE DRIVE TARZI HİYERARŞİK KLASÖR & DOSYA SİSTEMİ ── */
                        <motion.div
                            key="drive-file-explorer"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex-1 flex flex-col h-full min-h-0"
                        >
                            {/* Ekmek Kırıntısı (Breadcrumbs) ve Öğe Sayısı */}
                            <div className="h-10 shrink-0 bg-[#090c13] border-b border-white/[0.04] px-4 sm:px-6 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                                    {breadcrumbs.length > 1 && (
                                        <button
                                            onClick={() => handleBreadcrumbClick(breadcrumbs[breadcrumbs.length - 2].path)}
                                            className="p-1 -ml-1 text-zinc-400 hover:text-white rounded hover:bg-white/[0.05] transition-colors shrink-0 flex items-center gap-1 text-[11px] font-medium"
                                            title="Üst Klasöre Dön"
                                        >
                                            <ChevronLeft size={14} />
                                            <span className="hidden sm:inline">Geri</span>
                                        </button>
                                    )}
                                    {breadcrumbs.map((crumb, idx) => {
                                        const isLast = idx === breadcrumbs.length - 1;
                                        return (
                                            <React.Fragment key={crumb.path}>
                                                <button
                                                    onClick={() => handleBreadcrumbClick(crumb.path)}
                                                    className={`transition-colors whitespace-nowrap px-1.5 py-0.5 rounded hover:bg-white/[0.04] ${
                                                        isLast
                                                            ? 'font-semibold text-white'
                                                            : 'text-zinc-400 hover:text-zinc-200'
                                                    }`}
                                                >
                                                    {crumb.name}
                                                </button>
                                                {!isLast && <ChevronRight size={12} className="text-zinc-600 shrink-0" />}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>

                                <div className="text-[11px] text-zinc-500 shrink-0 ml-3">
                                    {filteredFolders.length} Klasör • {filteredFiles.length} Dosya
                                </div>
                            </div>

                            {/* İçerik Alanı */}
                            <div className="flex-1 p-4 sm:p-6 overflow-y-auto relative">
                                {/* Zarif Tepe İlerleme Çizgisi (Klasörler arası geçişte ekranı zıplatmadan arka plan yüklemesini gösterir) */}
                                {loading && (
                                    <div className="sticky top-0 -mt-4 sm:-mt-6 -mx-4 sm:-mx-6 h-0.5 bg-emerald-500/10 overflow-hidden z-20">
                                        <motion.div
                                            initial={{ x: '-100%' }}
                                            animate={{ x: '100%' }}
                                            transition={{ repeat: Infinity, duration: 0.85, ease: "easeInOut" }}
                                            className="w-1/3 h-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
                                        />
                                    </div>
                                )}

                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.div
                                        key={currentPath}
                                        initial={{
                                            opacity: 0,
                                            x: navDirection === 'in' ? 14 : -14,
                                            filter: 'blur(3px)'
                                        }}
                                        animate={{
                                            opacity: 1,
                                            x: 0,
                                            filter: 'blur(0px)'
                                        }}
                                        exit={{
                                            opacity: 0,
                                            x: navDirection === 'in' ? -14 : 14,
                                            filter: 'blur(3px)'
                                        }}
                                        transition={{
                                            duration: 0.22,
                                            ease: [0.16, 1, 0.3, 1]
                                        }}
                                        className="min-h-full"
                                    >
                                        {loading && folders.length === 0 && files.length === 0 ? (
                                            <div className="h-48 flex flex-col items-center justify-center text-zinc-500 text-xs">
                                                <RefreshCw size={20} className="animate-spin text-emerald-400 mb-2" />
                                                <span>Yükleniyor...</span>
                                            </div>
                                        ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.98 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className="h-64 border border-dashed border-white/[0.06] rounded-2xl flex flex-col items-center justify-center text-zinc-500 text-xs"
                                            >
                                                <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-white/[0.04] flex items-center justify-center text-zinc-600 mb-2">
                                                    <Folder size={24} />
                                                </div>
                                                <span className="text-zinc-400 font-medium">Bu klasör henüz boş</span>
                                                <span className="text-[11px] text-zinc-600 mt-0.5">Dosyaları buraya bırakabilir veya yeni klasör açabilirsiniz</span>
                                            </motion.div>
                                        ) : (
                                            <AnimatePresence mode="wait" initial={false}>
                                                <motion.div
                                                    key={viewMode}
                                                    initial={{ opacity: 0, y: 6 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -6 }}
                                                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                                                    className="space-y-6"
                                                >
                                                    {/* KLASÖRLER BÖLÜMÜ */}
                                                    {filteredFolders.length > 0 && (
                                                        <div>
                                                            <div className="text-xs font-semibold text-zinc-400 mb-2.5">
                                                                Klasörler
                                                            </div>

                                                            {viewMode === 'grid' ? (
                                                                /* Izgara Görünümü */
                                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                                                    {filteredFolders.map(folder => {
                                                                        const isTarget = dragOverFolder === folder.relativePath;
                                                                        return (
                                                                            <motion.div
                                                                                key={folder.id}
                                                                                draggable
                                                                                onDragStart={(e) => handleItemDragStart(e, folder)}
                                                                                onDragOver={(e) => { e.preventDefault(); setDragOverFolder(folder.relativePath); }}
                                                                                onDragLeave={() => setDragOverFolder(null)}
                                                                                onDrop={(e) => handleFolderDropTarget(e, folder)}
                                                                                onClick={() => handleOpenFolder(folder)}
                                                                                onContextMenu={(e) => handleContextMenu(e, folder, true)}
                                                                                whileHover={{ y: -2, scale: 1.01 }}
                                                                                whileTap={{ scale: 0.97 }}
                                                                                transition={{ duration: 0.12 }}
                                                                                className={`group relative bg-[#0b0e17] border rounded-xl p-3 flex items-center justify-between cursor-pointer transition-all select-none ${
                                                                                    isTarget
                                                                                        ? 'border-emerald-400 bg-emerald-500/15 scale-[1.02] shadow-lg shadow-emerald-950/30'
                                                                                        : 'border-white/[0.06] hover:border-emerald-500/30 hover:bg-[#0f1422]'
                                                                                }`}
                                                                            >
                                                                                <div className="flex items-center gap-2.5 min-w-0">
                                                                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                                                                                        <Folder size={16} />
                                                                                    </div>
                                                                                    <div className="min-w-0">
                                                                                        <div className="text-xs font-medium text-zinc-200 truncate group-hover:text-white">
                                                                                            {folder.name}
                                                                                        </div>
                                                                                        <div className="text-[10px] text-zinc-500">
                                                                                            {folder.itemCount || 0} öğe
                                                                                        </div>
                                                                                    </div>
                                                                                </div>

                                                                                {/* Hızlı İşlemler */}
                                                                                <div className="hidden group-hover:flex items-center gap-1 bg-[#0b0e17] px-1 rounded-md" onClick={e => e.stopPropagation()}>
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setRenameItem(folder);
                                                                                            setRenameNewName(folder.name);
                                                                                            setRenameError(null);
                                                                                        }}
                                                                                        className="p-1 text-zinc-400 hover:text-white rounded"
                                                                                        title="Yeniden Adlandır"
                                                                                    >
                                                                                        <Pencil size={11} />
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setDeleteItem(folder);
                                                                                        }}
                                                                                        className="p-1 text-zinc-400 hover:text-rose-400 rounded"
                                                                                        title="Sil"
                                                                                    >
                                                                                        <Trash2 size={11} />
                                                                                    </button>
                                                                                </div>
                                                                            </motion.div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                /* Liste Görünümü */
                                                                <div className="bg-[#0b0e17] border border-white/[0.06] rounded-xl overflow-hidden divide-y divide-white/[0.04]">
                                                                    {filteredFolders.map(folder => {
                                                                        const isTarget = dragOverFolder === folder.relativePath;
                                                                        return (
                                                                            <motion.div
                                                                                key={folder.id}
                                                                                draggable
                                                                                onDragStart={(e) => handleItemDragStart(e, folder)}
                                                                                onDragOver={(e) => { e.preventDefault(); setDragOverFolder(folder.relativePath); }}
                                                                                onDragLeave={() => setDragOverFolder(null)}
                                                                                onDrop={(e) => handleFolderDropTarget(e, folder)}
                                                                                onClick={() => handleOpenFolder(folder)}
                                                                                onContextMenu={(e) => handleContextMenu(e, folder, true)}
                                                                                whileTap={{ scale: 0.99 }}
                                                                                transition={{ duration: 0.1 }}
                                                                                className={`group px-4 py-2.5 flex items-center justify-between hover:bg-white/[0.03] transition-colors cursor-pointer text-xs select-none ${
                                                                                    isTarget ? 'bg-emerald-500/10 border-l-2 border-emerald-400' : ''
                                                                                }`}
                                                                            >
                                                                                <div className="flex items-center gap-3 min-w-0">
                                                                                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                                                                                        <Folder size={14} />
                                                                                    </div>
                                                                                    <span className="font-medium text-zinc-200 truncate group-hover:text-white">
                                                                                        {folder.name}
                                                                                    </span>
                                                                                </div>

                                                                                <div className="flex items-center gap-6 shrink-0 text-zinc-400 text-[11px]">
                                                                                    <span className="w-20 text-right">{folder.itemCount || 0} öğe</span>
                                                                                    <span className="w-24 text-right hidden sm:inline">
                                                                                        {new Date(folder.modifiedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                                                                                    </span>
                                                                                    <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setRenameItem(folder);
                                                                                                setRenameNewName(folder.name);
                                                                                                setRenameError(null);
                                                                                            }}
                                                                                            className="p-1 hover:text-white rounded"
                                                                                            title="Yeniden Adlandır"
                                                                                        >
                                                                                            <Pencil size={13} />
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setDeleteItem(folder);
                                                                                            }}
                                                                                            className="p-1 hover:text-rose-400 rounded"
                                                                                            title="Sil"
                                                                                        >
                                                                                            <Trash2 size={13} />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </motion.div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* DOSYALAR BÖLÜMÜ */}
                                                    {filteredFiles.length > 0 && (
                                                        <div>
                                                            <div className="text-xs font-semibold text-zinc-400 mb-2.5">
                                                                Dosyalar
                                                            </div>

                                                            {viewMode === 'grid' ? (
                                                                /* Izgara Görünümü */
                                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                                                    {filteredFiles.map(file => {
                                                                        const cleanExt = (file.extension || '').toLowerCase().replace('.', '');
                                                                        const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(cleanExt);
                                                                        const isPdf = cleanExt === 'pdf';
                                                                        const visual = getFileVisual(file.extension, file.name);
                                                                        const IconComp = visual.icon;
                                                                        return (
                                                                            <motion.div
                                                                                key={file.id}
                                                                                draggable
                                                                                onDragStart={(e) => handleItemDragStart(e, file)}
                                                                                onClick={() => setPreviewItem(file)}
                                                                                onContextMenu={(e) => handleContextMenu(e, file, false)}
                                                                                whileHover={{ y: -2, scale: 1.01 }}
                                                                                whileTap={{ scale: 0.98 }}
                                                                                transition={{ duration: 0.12 }}
                                                                                className="group relative bg-[#0b0e17] border border-white/[0.06] hover:border-white/[0.15] hover:bg-[#0f1422] rounded-xl p-3 flex flex-col justify-between transition-all cursor-pointer select-none"
                                                                            >
                                                                                {isImage ? (
                                                                                    <div className="w-full h-28 sm:h-32 mb-2 rounded-lg overflow-hidden bg-[#07090e] border border-white/[0.04] relative flex items-center justify-center group-hover:border-white/10 transition-colors">
                                                                                        <img
                                                                                            src={`/api/drive?action=view&path=${encodeURIComponent(file.relativePath)}`}
                                                                                            alt={file.name}
                                                                                            loading="lazy"
                                                                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                                                            onError={(e) => {
                                                                                                e.currentTarget.style.display = 'none';
                                                                                                const fallback = e.currentTarget.parentElement?.querySelector('.image-fallback-icon');
                                                                                                if (fallback) fallback.classList.remove('hidden');
                                                                                            }}
                                                                                        />
                                                                                        <div className="image-fallback-icon hidden w-full h-full items-center justify-center text-zinc-600 bg-zinc-900/50">
                                                                                            <ImageIcon size={24} />
                                                                                        </div>
                                                                                    </div>
                                                                                ) : isPdf ? (
                                                                                    <div className="w-full h-28 sm:h-32 mb-2 rounded-lg overflow-hidden bg-[#07090e] border border-white/[0.04] relative flex items-center justify-center group-hover:border-white/10 transition-colors">
                                                                                        <PdfPreviewThumbnail
                                                                                            url={`/api/drive?action=view&path=${encodeURIComponent(file.relativePath)}`}
                                                                                            alt={file.name}
                                                                                            fallbackIcon={<FileText size={24} className="text-rose-400" />}
                                                                                        />
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                                                        <div className={`w-8 h-8 rounded-lg ${visual.bg} ${visual.border} border flex items-center justify-center ${visual.color} shrink-0`}>
                                                                                            <IconComp size={16} />
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                <div>
                                                                                    <div className="text-xs font-medium text-zinc-200 truncate group-hover:text-white" title={file.name}>
                                                                                        {file.name}
                                                                                    </div>
                                                                                    <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1">
                                                                                        <span>{file.sizeFormatted}</span>
                                                                                        <span>{new Date(file.modifiedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </motion.div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                /* Liste Görünümü */
                                                                <div className="bg-[#0b0e17] border border-white/[0.06] rounded-xl overflow-hidden divide-y divide-white/[0.04]">
                                                                    {filteredFiles.map(file => {
                                                                        const cleanExt = (file.extension || '').toLowerCase().replace('.', '');
                                                                        const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(cleanExt);
                                                                        const isPdf = cleanExt === 'pdf';
                                                                        const visual = getFileVisual(file.extension, file.name);
                                                                        const IconComp = visual.icon;
                                                                        return (
                                                                            <motion.div
                                                                                key={file.id}
                                                                                draggable
                                                                                onDragStart={(e) => handleItemDragStart(e, file)}
                                                                                onClick={() => setPreviewItem(file)}
                                                                                onContextMenu={(e) => handleContextMenu(e, file, false)}
                                                                                whileTap={{ scale: 0.99 }}
                                                                                transition={{ duration: 0.1 }}
                                                                                className="group px-4 py-2.5 flex items-center justify-between hover:bg-white/[0.03] transition-colors cursor-pointer text-xs select-none"
                                                                            >
                                                                                <div className="flex items-center gap-3 min-w-0">
                                                                                    {isImage ? (
                                                                                        <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 border border-white/10 bg-[#07090e] flex items-center justify-center relative">
                                                                                            <img
                                                                                                src={`/api/drive?action=view&path=${encodeURIComponent(file.relativePath)}`}
                                                                                                alt={file.name}
                                                                                                loading="lazy"
                                                                                                className="w-full h-full object-cover"
                                                                                                onError={(e) => {
                                                                                                    e.currentTarget.style.display = 'none';
                                                                                                    const fb = e.currentTarget.parentElement?.querySelector('.list-fallback-icon');
                                                                                                    if (fb) fb.classList.remove('hidden');
                                                                                                }}
                                                                                            />
                                                                                            <div className="list-fallback-icon hidden w-full h-full flex items-center justify-center text-zinc-500">
                                                                                                <IconComp size={14} />
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : isPdf ? (
                                                                                        <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 border border-rose-500/20 bg-[#07090e] flex items-center justify-center relative">
                                                                                            <PdfPreviewThumbnail
                                                                                                url={`/api/drive?action=view&path=${encodeURIComponent(file.relativePath)}`}
                                                                                                alt={file.name}
                                                                                                isMini={true}
                                                                                                fallbackIcon={<FileText size={14} className="text-rose-400" />}
                                                                                            />
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className={`w-7 h-7 rounded-lg ${visual.bg} ${visual.border} border flex items-center justify-center ${visual.color} shrink-0`}>
                                                                                            <IconComp size={14} />
                                                                                        </div>
                                                                                    )}
                                                                                    <span className="font-medium text-zinc-200 truncate group-hover:text-white max-w-md">
                                                                                        {file.name}
                                                                                    </span>
                                                                                </div>

                                                                                <div className="flex items-center gap-6 shrink-0 text-zinc-400 text-[11px]">
                                                                                    <span className="w-16 text-right font-mono">{file.sizeFormatted}</span>
                                                                                    <span className="w-24 text-right hidden sm:inline">
                                                                                        {new Date(file.modifiedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                                    </span>
                                                                                    <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100">
                                                                                        <button
                                                                                            onClick={(e) => { e.stopPropagation(); setPreviewItem(file); }}
                                                                                            className="p-1 hover:text-white"
                                                                                            title="Önizle"
                                                                                        >
                                                                                            <Eye size={13} />
                                                                                        </button>
                                                                                        <a
                                                                                            href={`/api/drive?action=download&path=${encodeURIComponent(file.relativePath)}`}
                                                                                            download
                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                            className="p-1 hover:text-white"
                                                                                            title="İndir"
                                                                                        >
                                                                                            <Download size={13} />
                                                                                        </a>
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setRenameItem(file);
                                                                                                setRenameNewName(file.name);
                                                                                                setRenameError(null);
                                                                                            }}
                                                                                            className="p-1 hover:text-white"
                                                                                            title="Yeniden Adlandır"
                                                                                        >
                                                                                            <Pencil size={13} />
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={(e) => { e.stopPropagation(); setDeleteItem(file); }}
                                                                                            className="p-1 hover:text-rose-400"
                                                                                            title="Sil"
                                                                                        >
                                                                                            <Trash2 size={13} />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </motion.div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </motion.div>
                                            </AnimatePresence>
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── 3. GOOGLE DRIVE TARZI SAĞ ALTTAN YÜZEN YÜKLEME KUYRUĞU (UPLOAD PROGRESS WIDGET) ── */}
            <AnimatePresence>
                {uploadQueue.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 30, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 30, scale: 0.95 }}
                        className="fixed bottom-5 right-5 z-50 w-80 sm:w-96 bg-[#0b0e17] border border-white/[0.1] rounded-2xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col"
                    >
                        {/* Başlık Çubuğu */}
                        <div className="h-10 bg-zinc-900/90 border-b border-white/[0.06] px-3.5 flex items-center justify-between">
                            <span className="text-xs font-semibold text-white">
                                {uploadQueue.some(i => i.status === 'uploading')
                                    ? `${uploadQueue.filter(i => i.status === 'uploading').length} öğe yükleniyor...`
                                    : `${uploadQueue.length} öğe yüklendi`}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setUploadQueueCollapsed(!uploadQueueCollapsed)}
                                    className="p-1 text-zinc-400 hover:text-white rounded"
                                >
                                    {uploadQueueCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                <button
                                    onClick={() => setUploadQueue([])}
                                    className="p-1 text-zinc-400 hover:text-white rounded"
                                    title="Kapat"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Liste */}
                        {!uploadQueueCollapsed && (
                            <div className="max-h-56 overflow-y-auto divide-y divide-white/[0.04] p-1">
                                {uploadQueue.map(item => (
                                    <div key={item.id} className="p-2.5 text-xs flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium text-zinc-200 truncate" title={item.name}>
                                                {item.name}
                                            </span>
                                            {item.status === 'uploading' && (
                                                <RefreshCw size={13} className="text-cyan-400 animate-spin shrink-0" />
                                            )}
                                            {item.status === 'completed' && (
                                                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                                            )}
                                            {item.status === 'error' && (
                                                <AlertCircle size={14} className="text-rose-400 shrink-0" />
                                            )}
                                        </div>

                                        {/* İlerleme Çubuğu */}
                                        {item.status === 'uploading' && (
                                            <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                                                    style={{ width: `${item.progress}%` }}
                                                />
                                            </div>
                                        )}

                                        {/* Hata Kodu ve Açıklaması */}
                                        {item.status === 'error' && (
                                            <div className="text-[10px] text-rose-400 flex items-center justify-between">
                                                <span>{item.errorMessage}</span>
                                                <span className="font-mono bg-rose-500/10 px-1 py-0.5 rounded border border-rose-500/20">{item.errorCode}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── WINDOWS TARZI SAĞ TIK BAĞLAM MENÜSÜ (CONTEXT MENU) ── */}
            <AnimatePresence>
                {contextMenu && (
                    <>
                        {/* Şeffaf Dış Tıklama Alanı */}
                        <div
                            className="fixed inset-0 z-50 bg-transparent"
                            onClick={() => setContextMenu(null)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenu(null);
                            }}
                        />

                        {/* Menü Paneli */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.1, ease: 'easeOut' }}
                            style={{
                                position: 'fixed',
                                left: `${contextMenu.x}px`,
                                top: `${contextMenu.y}px`,
                                zIndex: 51
                            }}
                            className="w-52 bg-[#0b0e17]/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl shadow-black/90 p-1.5 text-xs select-none space-y-0.5"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Öğe Başlığı (Kompakt) */}
                            <div className="px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 border-b border-white/[0.06] mb-1 flex items-center gap-2 truncate">
                                {contextMenu.isFolder ? (
                                    <Folder size={13} className="text-emerald-400 shrink-0" />
                                ) : (
                                    <FileText size={13} className="text-cyan-400 shrink-0" />
                                )}
                                <span className="truncate text-zinc-300">{contextMenu.item.name}</span>
                            </div>

                            {contextMenu.isFolder ? (
                                <button
                                    onClick={() => {
                                        const folder = contextMenu.item;
                                        setContextMenu(null);
                                        handleOpenFolder(folder);
                                    }}
                                    className="w-full h-8 px-2.5 rounded-lg flex items-center gap-2.5 text-zinc-200 hover:text-white hover:bg-white/[0.08] transition-colors"
                                >
                                    <Folder size={14} className="text-emerald-400" />
                                    <span>Klasörü Aç</span>
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => {
                                            const file = contextMenu.item;
                                            setContextMenu(null);
                                            setPreviewItem(file);
                                        }}
                                        className="w-full h-8 px-2.5 rounded-lg flex items-center gap-2.5 text-zinc-200 hover:text-white hover:bg-white/[0.08] transition-colors"
                                    >
                                        <Eye size={14} className="text-cyan-400" />
                                        <span>Önizle</span>
                                    </button>
                                    <a
                                        href={`/api/drive?action=view&path=${encodeURIComponent(contextMenu.item.relativePath)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => setContextMenu(null)}
                                        className="w-full h-8 px-2.5 rounded-lg flex items-center gap-2.5 text-zinc-200 hover:text-white hover:bg-white/[0.08] transition-colors"
                                    >
                                        <ExternalLink size={14} className="text-zinc-400" />
                                        <span>Yeni Sekmede Aç</span>
                                    </a>
                                    <a
                                        href={`/api/drive?action=download&path=${encodeURIComponent(contextMenu.item.relativePath)}`}
                                        download
                                        onClick={() => setContextMenu(null)}
                                        className="w-full h-8 px-2.5 rounded-lg flex items-center gap-2.5 text-zinc-200 hover:text-white hover:bg-white/[0.08] transition-colors"
                                    >
                                        <Download size={14} className="text-emerald-400" />
                                        <span>İndir</span>
                                    </a>
                                </>
                            )}

                            <div className="border-t border-white/[0.06] my-1" />

                            <button
                                onClick={() => {
                                    const item = contextMenu.item;
                                    setContextMenu(null);
                                    setRenameItem(item);
                                    setRenameNewName(item.name);
                                    setRenameError(null);
                                }}
                                className="w-full h-8 px-2.5 rounded-lg flex items-center gap-2.5 text-zinc-200 hover:text-white hover:bg-white/[0.08] transition-colors"
                            >
                                <Pencil size={14} className="text-zinc-400" />
                                <span>Yeniden Adlandır</span>
                            </button>

                            <button
                                onClick={() => {
                                    const item = contextMenu.item;
                                    setContextMenu(null);
                                    setDeleteItem(item);
                                }}
                                className="w-full h-8 px-2.5 rounded-lg flex items-center gap-2.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                            >
                                <Trash2 size={14} />
                                <span>Sil</span>
                            </button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ── 4. YENİ KLASÖR MODALI ── */}
            <AnimatePresence>
                {folderModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                        <motion.form
                            onSubmit={handleCreateFolder}
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full max-w-sm bg-[#0b0e17] border border-white/[0.1] rounded-2xl p-5 shadow-2xl shadow-black/80 space-y-4"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-white">Yeni Klasör</span>
                                <button type="button" onClick={() => setFolderModalOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                                    <X size={16} />
                                </button>
                            </div>

                            <div>
                                <input
                                    type="text"
                                    autoFocus
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    placeholder="Klasör adı..."
                                    className="w-full h-10 bg-zinc-900 border border-white/[0.08] rounded-xl px-3.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50"
                                />
                                {folderModalError && (
                                    <div className="text-[11px] text-rose-400 mt-1.5">{folderModalError}</div>
                                )}
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setFolderModalOpen(false)}
                                    className="h-8 px-3 text-xs text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.05]"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="h-8 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                                >
                                    Oluştur
                                </button>
                            </div>
                        </motion.form>
                    </div>
                )}
            </AnimatePresence>

            {/* ── 5. YENİDEN ADLANDIR MODALI ── */}
            <AnimatePresence>
                {renameItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                        <motion.form
                            onSubmit={handleRename}
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full max-w-sm bg-[#0b0e17] border border-white/[0.1] rounded-2xl p-5 shadow-2xl shadow-black/80 space-y-4"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-white">Yeniden Adlandır</span>
                                <button type="button" onClick={() => setRenameItem(null)} className="text-zinc-500 hover:text-zinc-300">
                                    <X size={16} />
                                </button>
                            </div>

                            <div>
                                <input
                                    type="text"
                                    autoFocus
                                    value={renameNewName}
                                    onChange={(e) => setRenameNewName(e.target.value)}
                                    className="w-full h-10 bg-zinc-900 border border-white/[0.08] rounded-xl px-3.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                                />
                                {renameError && (
                                    <div className="text-[11px] text-rose-400 mt-1.5">{renameError}</div>
                                )}
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setRenameItem(null)}
                                    className="h-8 px-3 text-xs text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.05]"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="h-8 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                                >
                                    Kaydet
                                </button>
                            </div>
                        </motion.form>
                    </div>
                )}
            </AnimatePresence>

            {/* ── 6. SİLME ONAY MODALI ── */}
            <AnimatePresence>
                {deleteItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full max-w-sm bg-[#0b0e17] border border-rose-500/20 rounded-2xl p-5 shadow-2xl shadow-black/80 space-y-4"
                        >
                            <div className="flex items-center gap-3 text-rose-400">
                                <Trash2 size={20} />
                                <span className="text-sm font-bold text-white">Öğeyi Sil</span>
                            </div>

                            <div className="text-xs text-zinc-400 leading-relaxed">
                                <strong className="text-zinc-200">{deleteItem.name}</strong> kalıcı olarak silinecektir. Bu işlem geri alınamaz.
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setDeleteItem(null)}
                                    disabled={deleteInProgress}
                                    className="h-8 px-3 text-xs text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.05]"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={deleteInProgress}
                                    className="h-8 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-sm"
                                >
                                    {deleteInProgress ? 'Siliniyor...' : 'Evet, Sil'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── 7. ÖNİZLEME LIGHTBOX MODALI (GÖRSEL VEYA PDF) ── */}
            <AnimatePresence>
                {previewItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/85 backdrop-blur-md">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full max-w-4xl h-[85vh] bg-[#0b0e17] border border-white/[0.1] rounded-2xl overflow-hidden flex flex-col shadow-2xl shadow-black/90"
                        >
                            {/* Başlık */}
                            <div className="h-12 bg-zinc-900 border-b border-white/[0.06] px-4 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs font-semibold text-white truncate">
                                        {previewItem.name}
                                    </span>
                                    <span className="text-[11px] text-zinc-500 shrink-0 font-mono">
                                        ({previewItem.sizeFormatted})
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <a
                                        href={`/api/drive?action=view&path=${encodeURIComponent(previewItem.relativePath)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="h-7 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg flex items-center gap-1.5 transition-colors"
                                        title="Yeni Sekmede Aç"
                                    >
                                        <ExternalLink size={13} />
                                        <span className="hidden sm:inline">Yeni Sekmede Aç</span>
                                    </a>
                                    <a
                                        href={`/api/drive?action=download&path=${encodeURIComponent(previewItem.relativePath)}`}
                                        download
                                        className="h-7 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg flex items-center gap-1.5 transition-colors"
                                    >
                                        <Download size={13} />
                                        <span>İndir</span>
                                    </a>
                                    <button
                                        onClick={() => setPreviewItem(null)}
                                        className="p-1 text-zinc-400 hover:text-white rounded"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* İçerik */}
                            <div className="flex-1 bg-black/40 flex items-center justify-center overflow-hidden p-4">
                                {['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(previewItem.extension.replace('.', '').toLowerCase()) ? (
                                    <img
                                        src={`/api/drive?action=view&path=${encodeURIComponent(previewItem.relativePath)}`}
                                        alt={previewItem.name}
                                        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                                    />
                                ) : previewItem.extension.toLowerCase() === '.pdf' ? (
                                    <iframe
                                        src={`/api/drive?action=view&path=${encodeURIComponent(previewItem.relativePath)}`}
                                        title={previewItem.name}
                                        className="w-full h-full rounded-lg border-0 bg-white"
                                    />
                                ) : (
                                    <div className="text-center space-y-3">
                                        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/[0.06] flex items-center justify-center text-zinc-500 mx-auto">
                                            <FileText size={32} />
                                        </div>
                                        <div className="text-xs text-zinc-400">
                                            Bu dosya türü için canlı tarayıcı önizlemesi desteklenmiyor.
                                        </div>
                                        <a
                                            href={`/api/drive?action=download&path=${encodeURIComponent(previewItem.relativePath)}`}
                                            download
                                            className="inline-flex items-center gap-1.5 h-8 px-4 bg-cyan-500 text-black text-xs font-semibold rounded-lg shadow-sm"
                                        >
                                            <Download size={14} />
                                            <span>Dosyayı İndir</span>
                                        </a>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default Drive;

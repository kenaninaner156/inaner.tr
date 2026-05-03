import { useState, useEffect, useContext, useRef } from 'react'
import { DataContext } from './context/DataContext'
import { motion, AnimatePresence } from 'framer-motion'

import {
  Menu, X, Truck, MapPin, FileText, Droplet, Wrench,
  CreditCard, PieChart, Calendar, Settings, Shield, LogOut, Bell, AlertTriangle, Sun, Moon, Waves, ChevronDown, Building2, Server
} from 'lucide-react'
import Dashboard from './components/Dashboard'
import Trips from './components/Trips'
import Invoices from './components/Invoices'
import Fuel from './components/Fuel'
import Maintenance from './components/Maintenance'
import Payments from './components/Payments'
import SettingsPage from './components/Settings'
import Login from './components/Login'
import AdminLog from './components/AdminLog'
import Detaylar from './components/Detaylar'
import CompanyAdmin from './components/CompanyAdmin'
import SuperAdmin from './components/SuperAdmin'
import { useCompany } from './context/CompanyContext'
import { useTruck } from './context/TruckContext'
import PremiumLogo from './components/PremiumLogo'

function App() {
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('tir_active_tab')
    if (savedTab) return savedTab;
    return 'dashboard';
  })
  const [isMenuOpen, setIsMenuOpen] = useState(window.innerWidth >= 768)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [theme, setTheme] = useState(() => localStorage.getItem('tir_theme') || 'dark')
  
  // Swipe Handlers
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const touchEndX = useRef(null);
  const touchEndY = useRef(null);
  
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (!touchStartX.current || !touchStartY.current) return;
    
    touchEndX.current = e.changedTouches[0].clientX;
    touchEndY.current = e.changedTouches[0].clientY;
    
    const distanceX = touchStartX.current - touchEndX.current;
    const distanceY = Math.abs(touchStartY.current - touchEndY.current);
    
    // Eğer dikeyde (Y ekseni) kaydırma yataydan fazlaysa, bu bir aşağı/yukarı scroll'dur, menüyü açma.
    if (distanceY > Math.abs(distanceX)) {
      touchStartX.current = null;
      touchStartY.current = null;
      return;
    }
    
    // Swipe left to close (if distance is positive and > 120px)
    if (distanceX > 120 && isMenuOpen && isMobile) {
      setIsMenuOpen(false);
    }
    // Swipe right to open (if distance is negative and < -120px)
    if (distanceX < -120 && !isMenuOpen && isMobile) {
      setIsMenuOpen(true);
    }
    
    touchStartX.current = null;
    touchStartY.current = null;
    touchEndX.current = null;
    touchEndY.current = null;
  };

  useEffect(() => {
    localStorage.setItem('tir_active_tab', activeTab)
  }, [activeTab])

  // Sayfa yenilendiğinde en üste kaydır (Safari fix - timeout ile daha güvenli) ve theme-color'ı ayarla
  useEffect(() => {
    const timer = setTimeout(() => {
      window.scrollTo(0, 0);
    }, 100);
    
    // Set initial theme-color
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f8f9fa' : '#0B0E14');
    
    return () => clearTimeout(timer);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('tir_theme', next);
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', next === 'light' ? '#f8f9fa' : '#0B0E14');
  }

  const { currentSession, logoutSession, isDataLoading, dataError, docs, penalties } = useContext(DataContext)
  const { activeCompanyId, setActiveCompanyId, companyData, companies } = useCompany()
  const { activeTruckId, setActiveTruckId, activeTruckData, trucks } = useTruck()
  const currentUser = currentSession;
  const userRole = currentUser?.username === 'kenan' ? 'super_admin' : String(currentUser?.role || 'user').toLowerCase();

  const [showCompanyDrop, setShowCompanyDrop] = useState(false);
  const [showTruckDrop, setShowTruckDrop] = useState(false);
  const [showCompanyExpand, setShowCompanyExpand] = useState(false);
  const companyDropRef = useRef(null);
  const truckDropRef = useRef(null);

  const DEFAULT_PIC = '/tir-clear.png?v=8'
  const profilePic = activeTruckData?.imageUrl || DEFAULT_PIC;

  useEffect(() => {
    const handler = (e) => {
      if (companyDropRef.current && !companyDropRef.current.contains(e.target)) setShowCompanyDrop(false);
      if (truckDropRef.current && !truckDropRef.current.contains(e.target)) setShowTruckDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // Mobilde sidebar açıkken tıklanabilir sayfa alanında kapansın
  const handleOverlayClick = () => {
    if (isMobile) setIsMenuOpen(false)
  }

  const handleLogout = () => {
    logoutSession()
    localStorage.removeItem('tir_active_tab')
    setIsMenuOpen(false)
  }

  // Belge uyarısı hesapla (Detaylar sekmesi badge) - DataContext'ten gelen verilerle
  const DOC_WARNINGS = { bandrol: 30, inspection: 45, trailerInspection: 45, insurance: 30, k1: 60, l1: 60, srcBelgesi: 60, odp: 30 }

  // Sync badges across components via custom event and storage updates
  const [readDocsNotif, setReadDocsNotif] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tir_read_docs_notif')) || {}; } catch { return {}; }
  });
  const [readPenaltiesNotif, setReadPenaltiesNotif] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tir_read_penalties_notif')) || []; } catch { return []; }
  });

  useEffect(() => {
    const handleStorage = () => {
      try {
        setReadDocsNotif(JSON.parse(localStorage.getItem('tir_read_docs_notif')) || {});
        setReadPenaltiesNotif(JSON.parse(localStorage.getItem('tir_read_penalties_notif')) || []);
      } catch { /* empty */ }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('tir_notif_updated', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('tir_notif_updated', handleStorage);
    };
  }, []);

  const unreadDocsCount = Object.entries(DOC_WARNINGS).filter(([k, days]) => {
    const d = docs && docs[k]?.date ? docs[k].date : null;
    if (!d) return false;
    const diff = Math.ceil((new Date(d) - new Date()) / 86400000);
    return diff <= days && readDocsNotif[k] !== d;
  }).length;

  const unpaidPenalties = penalties ? penalties.filter(p => !p.paid) : [];
  const unreadPenaltiesCount = unpaidPenalties.filter(p => !readPenaltiesNotif.includes(p.id)).length;

  const notifCount = unreadDocsCount + unreadPenaltiesCount;

  const menuItems = [
    { id: 'dashboard', label: 'Özet', icon: <PieChart size={20} />, theme: 'from-violet-500/80 to-violet-600/80 shadow-[0_2px_12px_rgba(139,92,246,0.3)] border-violet-400/30', hoverText: 'group-hover:text-violet-400' },
    { id: 'trips', label: 'Seferler', icon: <MapPin size={20} />, theme: 'from-sky-500/80 to-sky-600/80 shadow-[0_2px_12px_rgba(14,165,233,0.3)] border-sky-400/30', hoverText: 'group-hover:text-sky-400' },
    { id: 'fuel', label: 'Mazot Fişleri', icon: <Droplet size={20} />, theme: 'from-cyan-500/80 to-cyan-600/80 shadow-[0_2px_12px_rgba(6,182,212,0.3)] border-cyan-400/30', hoverText: 'group-hover:text-cyan-400' },
    { id: 'maintenance', label: 'Araç Bakım', icon: <Wrench size={20} />, theme: 'from-amber-500/80 to-amber-600/80 shadow-[0_2px_12px_rgba(245,158,11,0.3)] border-amber-400/30', hoverText: 'group-hover:text-amber-400' },
    { id: 'detaylar', label: 'Ceza & Belgeler', icon: <AlertTriangle size={20} />, badge: notifCount, theme: 'from-red-500/80 to-red-600/80 shadow-[0_2px_12px_rgba(239,68,68,0.3)] border-red-400/30', hoverText: 'group-hover:text-red-400' },
    { id: 'invoices', label: 'Fatura Durumu', icon: <FileText size={20} />, theme: 'from-emerald-500/80 to-emerald-600/80 shadow-[0_2px_12px_rgba(16,185,129,0.3)] border-emerald-400/30', hoverText: 'group-hover:text-emerald-400' },
    { id: 'payments', label: 'Ödeme Takibi', icon: <CreditCard size={20} />, theme: 'from-green-500/80 to-green-600/80 shadow-[0_2px_12px_rgba(34,197,94,0.3)] border-green-400/30', hoverText: 'group-hover:text-green-400' },
    { id: 'company_admin', label: 'Şirket Yönetimi', icon: <Building2 size={20} />, theme: 'from-indigo-500/80 to-indigo-600/80 shadow-[0_2px_12px_rgba(99,102,241,0.3)] border-indigo-400/30', hoverText: 'group-hover:text-indigo-400' },
    { id: 'super_admin', label: 'SaaS Yönetimi', icon: <Server size={20} />, theme: 'from-fuchsia-500/80 to-fuchsia-600/80 shadow-[0_2px_12px_rgba(217,70,239,0.3)] border-fuchsia-400/30', hoverText: 'group-hover:text-fuchsia-400' },
    { id: 'adminlog', label: 'Admin Logu', icon: <Shield size={20} />, theme: 'from-slate-500/80 to-slate-600/80 shadow-[0_2px_12px_rgba(100,116,139,0.3)] border-slate-400/30', hoverText: 'group-hover:text-slate-400' },
  ]



  const filteredMenuItems = menuItems.filter(item => {
    if (userRole === 'super_admin') return true;

    if (userRole === 'company_admin') {
      return item.id !== 'super_admin';
    }

    // Default 'şoför' (Sürücü) -> Sadece operasyonel sekmeleri görür
    return !['adminlog', 'super_admin', 'company_admin'].includes(item.id);
  })

  // Login ekranı
  if (!currentUser) {
    return <Login />
  }

  if (isDataLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="w-10 h-10 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm font-medium">Veriler yükleniyor...</p>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="bg-red-500/10 p-5 rounded-full mb-2 border border-red-500/30">
          <AlertTriangle size={56} className="text-red-500" />
        </div>
        <h2 className="text-3xl font-bold text-slate-100 mb-2">Sistem Hatası</h2>
        <p className="text-red-400 font-medium max-w-lg mb-6 leading-relaxed bg-red-500/5 p-4 rounded-xl border border-red-500/10">
          {dataError}
        </p>
        <button onClick={handleLogout} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-6 py-3 rounded-lg font-medium transition-colors shadow-lg">
          <LogOut size={18} />
          Giriş Ekranına Dön
        </button>
      </div>
    );
  }

  // Askıya Alma (Suspend) Kontrolü
  if (companyData?.status === 'suspended' && userRole !== 'super_admin') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-500/10 p-4 rounded-full mb-6">
          <AlertTriangle size={48} className="text-red-500" />
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-2">Erişim Engellendi</h1>
        <p className="text-slate-400 max-w-sm mb-8">
          <b>{companyData.name}</b> sistem lisansı askıya alınmıştır. Detaylı bilgi veya sistemi tekrar aktif etmek için lütfen sistem yöneticinizle iletişime geçin.
        </p>
        <button onClick={logoutSession} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-6 py-3 rounded-lg font-medium transition-colors">
          <LogOut size={18} />
          Güvenli Çıkış Yap
        </button>
      </div>
    );
  }

  // Masaüstünde sidebar açıkken içerik kayar, mobilde overlay açılır
  const mainPaddingLeft = isMenuOpen && !isMobile ? 'pl-72' : 'pl-0'

  return (
    <div 
      className={`min-h-screen font-sans relative overflow-x-clip ${theme === 'light' ? 'light' : ''}`} 
      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >

      {/* Mobil overlay */}
      {isMenuOpen && isMobile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={handleOverlayClick} />
      )}

      {/* Sidebar - Avant Garde Minimalist Layout */}
      <aside className={`fixed top-0 left-0 h-full w-72 z-50 flex flex-col transition-transform duration-500 ease-in-out ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          background: 'var(--bg-sidebar)',
          borderRight: `1px solid var(--border-color)`,
        }}>
        {/* Header - Profile Area (Company & Truck Switcher) */}
        <div className="px-5 pb-4 flex flex-col gap-3"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>

          <PremiumLogo />

          {trucks.length <= 1 ? (
            /* Tek tır varsa: sadece bilgi kartı, dropdown yok */
            <div className="relative p-[1px] rounded-2xl bg-gradient-to-b from-white/10 via-white/5 to-transparent group hover:from-amber-500/40 hover:via-amber-500/10 hover:to-transparent transition-all duration-500 shadow-xl shadow-black/40 cursor-pointer" onClick={() => setActiveTab('settings')}>
              <div className="relative h-full w-full bg-[#0a0a0c]/90 backdrop-blur-xl rounded-[15px] p-3 flex items-center gap-3 overflow-hidden">
                {/* Ambient background glow */}
                <div className="absolute -inset-2 bg-gradient-to-r from-amber-500/0 via-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-700 pointer-events-none" />
                
                {/* Profile Pic wrapper */}
                <div className="w-12 h-12 rounded-[14px] p-[1px] bg-gradient-to-b from-white/10 to-transparent group-hover:from-amber-400/50 group-hover:to-amber-600/20 transition-all duration-500 flex-shrink-0 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                  <div className="w-full h-full rounded-[13px] overflow-hidden bg-slate-900 flex items-center justify-center relative">
                    <div className="absolute inset-0 bg-amber-500/20 mix-blend-overlay z-10 group-hover:bg-transparent transition-colors duration-500" />
                    {profilePic
                      ? <img src={profilePic} alt="Profile" className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700 ease-out" />
                      : <Truck size={22} className="text-amber-500/80 transform group-hover:scale-110 transition-transform duration-700 ease-out" />}
                  </div>
                </div>

                {/* Text Info */}
                <div className="flex-1 min-w-0 z-10">
                  <h3 className="text-[15px] font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-100 to-slate-300 group-hover:from-amber-200 group-hover:to-amber-400 tracking-tight transition-all duration-500 truncate drop-shadow-sm">
                    {trucks.length === 0 ? 'Tır Bulunmuyor' : trucks[0]?.plate}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest truncate group-hover:text-amber-100/70 transition-colors duration-500">
                      {activeTruckData?.brand || companyData?.name || 'Yükleniyor...'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div ref={truckDropRef} className="relative z-50">
              <button
                onClick={() => setShowTruckDrop(v => !v)}
                className="w-full text-left relative p-[1px] rounded-2xl bg-gradient-to-b from-white/10 via-white/5 to-transparent group hover:from-amber-500/40 hover:via-amber-500/10 hover:to-transparent transition-all duration-500 shadow-xl shadow-black/40 outline-none"
              >
                <div className="relative h-full w-full bg-[#0a0a0c]/90 backdrop-blur-xl rounded-[15px] p-3 flex items-center gap-3 overflow-hidden">
                  {/* Ambient background glow */}
                  <div className="absolute -inset-2 bg-gradient-to-r from-amber-500/0 via-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-700 pointer-events-none" />
                  
                  {/* Profile Pic wrapper */}
                  <div className="w-12 h-12 rounded-[14px] p-[1px] bg-gradient-to-b from-white/10 to-transparent group-hover:from-amber-400/50 group-hover:to-amber-600/20 transition-all duration-500 flex-shrink-0 shadow-[0_0_15px_rgba(0,0,0,0.5)]" onClick={(e) => { e.stopPropagation(); setActiveTab('settings'); }}>
                    <div className="w-full h-full rounded-[13px] overflow-hidden bg-slate-900 flex items-center justify-center relative">
                      <div className="absolute inset-0 bg-amber-500/20 mix-blend-overlay z-10 group-hover:bg-transparent transition-colors duration-500" />
                      {profilePic
                        ? <img src={profilePic} alt="Profile" className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700 ease-out" />
                        : <Truck size={22} className="text-amber-500/80 transform group-hover:scale-110 transition-transform duration-700 ease-out" />}
                    </div>
                  </div>

                  {/* Text Info */}
                  <div className="flex-1 min-w-0 z-10">
                    <h3 className="text-[15px] font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-100 to-slate-300 group-hover:from-amber-200 group-hover:to-amber-400 tracking-tight transition-all duration-500 truncate drop-shadow-sm">
                      {trucks.length === 0 ? 'Tır Bulunmuyor' : (trucks.find(t => t.id === activeTruckId)?.plate || 'Seç...')}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest truncate group-hover:text-amber-100/70 transition-colors duration-500">
                        {activeTruckData?.brand || companyData?.name || 'Yükleniyor...'}
                      </p>
                    </div>
                  </div>

                  {/* Chevron */}
                  <div className="w-6 h-6 rounded-full border border-white/5 bg-white/5 flex items-center justify-center group-hover:bg-amber-500/20 group-hover:border-amber-500/40 transition-all duration-500 flex-shrink-0 z-10">
                    <ChevronDown size={14} className={`text-slate-400 transition-transform duration-500 ${showTruckDrop ? 'rotate-180 text-amber-400' : 'group-hover:text-amber-400'}`} />
                  </div>
                </div>
              </button>

              <AnimatePresence>
                {showTruckDrop && trucks.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -10, filter: 'blur(10px)' }}
                    transition={{ duration: 0.3, type: 'spring', stiffness: 300, damping: 25 }}
                    className="absolute left-0 right-0 top-full mt-3 z-50 p-[1px] bg-gradient-to-b from-white/10 via-white/5 to-transparent rounded-2xl shadow-2xl shadow-black/80"
                  >
                    <div className="bg-[#0a0a0c]/95 backdrop-blur-2xl rounded-[15px] p-2 overflow-hidden flex flex-col gap-1">
                      {trucks.map(t => {
                        const isActive = activeTruckId === t.id;
                        return (
                          <button key={t.id} onClick={() => { setActiveTruckId(t.id); setShowTruckDrop(false); }}
                            className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 text-left group overflow-hidden outline-none ${isActive ? '' : 'hover:bg-white/5'}`}>
                            {/* Active bg sweep */}
                            {isActive && <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent" />}
                            
                            {/* Icon wrapper */}
                            <div className={`relative z-10 w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0 transition-all duration-300 border ${isActive ? 'bg-amber-500/20 border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]' : 'bg-slate-800 border-white/5 text-slate-400 group-hover:text-slate-200'}`}>
                              <Truck size={14} />
                            </div>
                            
                            {/* Text */}
                            <div className="relative z-10 flex-1 min-w-0">
                               <p className={`text-sm font-bold tracking-wide truncate transition-colors duration-300 ${isActive ? 'text-amber-400' : 'text-slate-300 group-hover:text-white'}`}>{t.plate}</p>
                               <p className={`text-[10px] uppercase tracking-wider font-medium truncate transition-colors duration-300 mt-0.5 ${isActive ? 'text-amber-500/70' : 'text-slate-500 group-hover:text-slate-400'}`}>{t.brand}</p>
                            </div>
                            
                            {/* Status indicator */}
                            {isActive && (
                               <div className="relative z-10 flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30">
                                 <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                               </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto relative">
          {filteredMenuItems.map((item) => {
            const isActive = activeTab === item.id;

            // ── SaaS Yönetimi: morph eden buton + ayrı expand ──
            if (item.id === 'super_admin') {
              const activeCompanyName = (companies || []).find(c => c.id === activeCompanyId)?.name || '—';
              const otherCompanies = (companies || []).filter(c => c.id !== activeCompanyId);
              return (
                <div key={item.id}>
                  <button onClick={() => { setActiveTab(item.id); if (isMobile) setIsMenuOpen(false); }}
                    className={`w-full relative flex items-center space-x-3 px-4 h-10 rounded-xl text-left group transition-all duration-300 outline-none ${isActive ? 'font-medium text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                    {!isActive && <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 rounded-xl transition-colors duration-300 -z-10" />}
                    {isActive && (
                      <motion.div layoutId="sidebar-active-apple"
                        className={`absolute inset-0 bg-gradient-to-b rounded-xl border ${item.theme}`}
                        style={{ zIndex: 0 }} initial={false}
                        transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}
                      />
                    )}
                    <div className={`relative z-10 flex items-center flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110 drop-shadow-md text-white/90' : `text-slate-500 group-hover:scale-110 ${item.hoverText}`}`}>
                      {item.icon}
                    </div>
                    {/* Clip container — flex-col justify-center keeps label naturally left-aligned */}
                    <div className="flex-1 self-stretch overflow-hidden relative z-10 flex flex-col justify-center">
                      {/* Label — normal flow, left-aligned, slides up slightly when active */}
                      <motion.span
                        className="text-sm tracking-wide drop-shadow-md leading-none text-left"
                        animate={{ y: isActive ? -3 : 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}>
                        {item.label}
                      </motion.span>
                      {/* Company name — absolute, slides from below clip */}
                      <motion.span
                        className="absolute left-0 right-0 text-[10px] text-fuchsia-200/75 font-medium truncate leading-none"
                        style={{ top: 0 }}
                        animate={{ y: isActive ? 27 : 50, opacity: isActive ? 1 : 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}>
                        {activeCompanyName}
                      </motion.span>
                    </div>
                    {/* Expand chevron — always in DOM, opacity only */}
                    <motion.button
                      animate={{ opacity: isActive ? 1 : 0 }}
                      transition={{ duration: 0.15 }}
                      onClick={(e) => { e.stopPropagation(); if (isActive) setShowCompanyExpand(v => !v); }}
                      className="relative z-20 p-1 rounded-md hover:bg-white/15 transition-colors flex-shrink-0"
                      style={{ pointerEvents: isActive ? 'auto' : 'none' }}>
                      <motion.div animate={{ rotate: showCompanyExpand ? 180 : 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}>
                        <ChevronDown size={12} className="text-fuchsia-300/70" />
                      </motion.div>
                    </motion.button>
                  </button>

                  {/* Şirket listesi - sadece expand açıkken ve aktifken */}
                  <AnimatePresence>
                    {isActive && showCompanyExpand && (
                      <motion.div key="saas-companies"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                        className="overflow-hidden">
                        <div className="mx-1 mt-1 mb-0.5 bg-fuchsia-500/5 border border-fuchsia-500/15 rounded-xl overflow-hidden">
                          {/* Aktif şirket */}
                          <div className="flex items-center gap-2.5 px-3 py-2.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 flex-shrink-0 shadow-[0_0_6px_rgba(217,70,239,0.5)]" />
                            <span className="text-xs font-semibold text-fuchsia-200 flex-1 truncate">{activeCompanyName}</span>
                            <span className="text-[8px] bg-fuchsia-500/20 text-fuchsia-400 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">Aktif</span>
                          </div>
                          {/* Diğer şirketler */}
                          {otherCompanies.map((c, i) => (
                            <div key={c.id}>
                              {i === 0 && <div className="h-px bg-fuchsia-500/10 mx-3" />}
                              <button onClick={() => { setActiveCompanyId(c.id); localStorage.setItem('tir_current_company', c.id); setShowCompanyExpand(false); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-fuchsia-500/10 transition-colors group/co">
                                <Building2 size={11} className="text-slate-600 group-hover/co:text-fuchsia-400 transition-colors flex-shrink-0" />
                                <span className="text-xs text-slate-400 group-hover/co:text-white transition-colors truncate">{c.name}</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }

            // ── Normal nav itemları ──
            return (
              <button key={item.id} onClick={() => { setActiveTab(item.id); if (isMobile) setIsMenuOpen(false); }}
                className={`w-full relative flex items-center space-x-3 px-4 py-2.5 rounded-xl group transition-all duration-300 outline-none ${isActive ? 'font-medium text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {!isActive && <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 rounded-xl transition-colors duration-300 -z-10" />}
                {isActive && (
                  <motion.div layoutId="sidebar-active-apple"
                    className={`absolute inset-0 bg-gradient-to-b rounded-xl border ${item.theme}`}
                    style={{ zIndex: 0 }} initial={false}
                    transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}
                  />
                )}
                <div className={`relative z-10 flex items-center transition-transform duration-300 ${isActive ? 'scale-110 drop-shadow-md text-white/90' : `text-slate-500 group-hover:scale-110 ${item.hoverText}`}`}>
                  {item.icon}
                </div>
                <span className="flex-1 text-left text-sm tracking-wide relative z-10 drop-shadow-md">{item.label}</span>
                {item.badge > 0 && (
                  <span className="relative z-10 bg-red-500/20 border border-red-500/30 text-red-100 drop-shadow-md text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center justify-center flex-shrink-0">{item.badge}</span>
                )}
              </button>
            );
          })}

          <div className="pt-6 pb-2">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-700/30 to-transparent"></div>
          </div>

        </nav>

        {/* Footer: User & Theme */}
        <div className="p-4 pl-10 pr-6 pb-5 flex items-center justify-between"
          style={{ 
            paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))'
          }}>
          <span className="text-xs text-slate-500 font-medium truncate max-w-[120px]" title={currentUser.username}>
            {currentUser.username}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme}
              title={theme === 'dark' ? 'Aydınlık Tema' : 'Karanlık Tema'}
              className="p-2 rounded-full transition-all duration-300 hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button onClick={handleLogout} title="Oturumu Kapat" className="p-2 rounded-full text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`min-h-screen ${mainPaddingLeft}`}>
        <div className="flex flex-col min-h-screen w-full">

          {/* Header - Simple & Clean (sticky) */}
          <div className={`sticky top-0 z-30 px-6 pb-4 flex items-center justify-between bg-[var(--bg-base)] border-b border-[var(--border-color)] transition-all duration-300 ${['invoices', 'fuel'].includes(activeTab) ? 'md:hidden' : ''}`}
            style={{
              paddingTop: 'calc(0.5rem + env(safe-area-inset-top))'
            }}
          >
            <div className="flex items-center space-x-4">
              {isMobile && (
                <button onClick={() => setIsMenuOpen(true)} className="p-2 -ml-2 text-slate-400 hover:text-slate-100 transition-colors">
                  <Menu size={24} />
                </button>
              )}
              <h2 className="text-xl font-medium tracking-tight text-slate-100">
                {menuItems.find(i => i.id === activeTab)?.label || 'Bilinmeyen'}
              </h2>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 p-4 md:p-6 xl:p-8">
            <div key={activeTab} className="page-transition">
            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'trips' && <Trips />}
            {activeTab === 'fuel' && <Fuel />}
            {activeTab === 'maintenance' && <Maintenance />}
            {activeTab === 'detaylar' && <Detaylar />}
            {activeTab === 'invoices' && <Invoices />}
            {activeTab === 'payments' && <Payments />}
            {activeTab === 'settings' && <SettingsPage />}
            {activeTab === 'company_admin' && <CompanyAdmin />}
            {activeTab === 'super_admin' && <SuperAdmin />}
            {activeTab === 'adminlog' && (userRole === 'super_admin' || userRole === 'company_admin') && <AdminLog />}
            </div>
          </div>
        </div>
      </main>

    </div>
  )
}

export default App

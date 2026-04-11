import { useState, useEffect, useContext, useRef } from 'react'
import { DataContext } from './context/DataContext'

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
    { id: 'dashboard', label: 'Özet', icon: <PieChart size={20} /> },
    { id: 'trips', label: 'Seferler', icon: <MapPin size={20} /> },
    { id: 'fuel', label: 'Mazot Fişleri', icon: <Droplet size={20} /> },
    { id: 'maintenance', label: 'Araç Bakım', icon: <Wrench size={20} /> },
    { id: 'detaylar', label: 'Ceza & Belgeler', icon: <AlertTriangle size={20} />, badge: notifCount },
    { id: 'invoices', label: 'Fatura Durumu', icon: <FileText size={20} /> },
    { id: 'payments', label: 'Ödeme Takibi', icon: <CreditCard size={20} /> },
    { id: 'company_admin', label: 'Şirket Yönetimi', icon: <Building2 size={20} /> },
    { id: 'super_admin', label: 'SaaS Yönetimi', icon: <Server size={20} /> },
    { id: 'adminlog', label: 'Admin Logu', icon: <Shield size={20} /> },
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

          {userRole === 'super_admin' && (companies || []).length > 1 && (
            <div ref={companyDropRef} className="relative">
              <button
                onClick={() => setShowCompanyDrop(v => !v)}
                className="w-full bg-indigo-500/10 rounded-xl p-3 border border-indigo-500/30 hover:border-indigo-500/60 transition-all shadow-inner shadow-indigo-500/5 flex flex-col text-left"
              >
                <span className="text-[10px] text-indigo-400 font-bold tracking-widest uppercase mb-1">Müşteri Seçimi (SaaS)</span>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-indigo-400 flex-shrink-0" />
                    <span className="text-sm font-bold text-slate-100 truncate">{(companies || []).find(c => c.id === activeCompanyId)?.name || 'Seç...'}</span>
                  </div>
                  <ChevronDown size={14} className={`text-indigo-400/60 transition-transform duration-200 ${showCompanyDrop ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {showCompanyDrop && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-slate-900 border border-indigo-500/30 rounded-xl overflow-hidden shadow-2xl shadow-black/50 backdrop-blur-xl">
                  {(companies || []).map(c => (
                    <button key={c.id} onClick={() => { setActiveCompanyId(c.id); localStorage.setItem('tir_current_company', c.id); setShowCompanyDrop(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left ${activeCompanyId === c.id ? 'bg-indigo-500/20 text-indigo-300 font-semibold' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
                      <Building2 size={13} className={activeCompanyId === c.id ? 'text-indigo-400' : 'text-slate-500'} />
                      {c.name}
                      {activeCompanyId === c.id && <span className="ml-auto text-[9px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {trucks.length <= 1 ? (
            /* Tek tır varsa: sadece bilgi kartı, dropdown yok */
            <div className="glass-panel !bg-orange-500/10 rounded-xl p-3 border border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.15)] dark:shadow-none flex items-center gap-3 transition-colors duration-300">
              <div className="w-11 h-11 rounded-lg overflow-hidden glass-panel border border-orange-500/30 flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={() => setActiveTab('settings')}>
                {profilePic
                  ? <img src={profilePic} alt="Profile" className="w-full h-full object-cover bg-[var(--bg-base)]" />
                  : <div className="w-full h-full flex items-center justify-center"><Truck size={20} className="text-orange-500" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-orange-500 drop-shadow-sm truncate leading-tight">
                  {trucks.length === 0 ? 'Tır Bulunmuyor' : trucks[0]?.plate}
                </p>
                <p className="text-[11px] text-orange-400 font-medium tracking-wide truncate mt-0.5">
                  {activeTruckData?.brand || companyData?.name || 'Yükleniyor...'}
                </p>
              </div>
            </div>
          ) : (
            <div ref={truckDropRef} className="relative">
              <button
                onClick={() => setShowTruckDrop(v => !v)}
                className="w-full glass-panel !bg-orange-500/10 rounded-xl p-3 border border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.15)] hover:shadow-[0_0_20px_rgba(249,115,22,0.25)] dark:shadow-none dark:hover:shadow-none transition-all duration-300 flex items-center gap-3 text-left"
              >
                <div className="w-11 h-11 rounded-lg overflow-hidden glass-panel border border-orange-500/30 flex items-center justify-center flex-shrink-0" onClick={(e) => { e.stopPropagation(); setActiveTab('settings'); }}>
                  {profilePic
                    ? <img src={profilePic} alt="Profile" className="w-full h-full object-cover bg-[var(--bg-base)]" />
                    : <div className="w-full h-full flex items-center justify-center"><Truck size={20} className="text-orange-500" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-orange-500 drop-shadow-sm truncate leading-tight">
                    {trucks.length === 0 ? 'Tır Bulunmuyor' : (trucks.find(t => t.id === activeTruckId)?.plate || 'Seç...')}
                  </p>
                  <p className="text-[11px] text-orange-400 font-medium tracking-wide truncate mt-0.5">
                    {activeTruckData?.brand || companyData?.name || 'Yükleniyor...'}
                  </p>
                </div>
                <ChevronDown size={15} className={`text-orange-500 transition-transform duration-200 flex-shrink-0 ${showTruckDrop ? 'rotate-180 drop-shadow-[0_0_5px_rgba(249,115,22,0.5)] dark:drop-shadow-none' : ''}`} />
              </button>

              {showTruckDrop && trucks.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-slate-900 border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl shadow-black/60">
                  {trucks.map(t => (
                    <button key={t.id} onClick={() => { setActiveTruckId(t.id); setShowTruckDrop(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left ${activeTruckId === t.id ? 'bg-brand-500/15 text-brand-300' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${activeTruckId === t.id ? 'bg-brand-500/20' : 'bg-slate-800'}`}>
                        <Truck size={13} className={activeTruckId === t.id ? 'text-brand-400' : 'text-slate-500'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{t.plate}</p>
                        <p className="text-[10px] text-slate-500 truncate">{t.brand}</p>
                      </div>
                      {activeTruckId === t.id && <span className="text-[9px] bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-full font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {filteredMenuItems.map((item) => (
            <button key={item.id} onClick={() => { setActiveTab(item.id); if (isMobile) setIsMenuOpen(false); }}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg group ${activeTab === item.id
                ? 'bg-transparent text-orange-500 border border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.2)] dark:shadow-none font-medium'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-hover)]'}`}>
              <div className={`${activeTab === item.id ? 'scale-110 drop-shadow-[0_0_5px_rgba(249,115,22,0.5)] dark:drop-shadow-none' : 'group-hover:scale-110'}`}>
                {item.icon}
              </div>
              <span className="flex-1 text-left text-sm tracking-wide">{item.label}</span>
              {item.badge > 0 && (
                <span className="bg-red-500/10 text-red-500 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center justify-center flex-shrink-0">{item.badge}</span>
              )}
            </button>
          ))}

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
          <div className={`sticky top-0 z-30 px-6 pb-4 flex items-center justify-between bg-[var(--bg-base)] border-b border-[var(--border-color)] transition-all duration-300 ${activeTab === 'invoices' ? 'md:hidden' : ''}`}
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
      </main>

    </div>
  )
}

export default App

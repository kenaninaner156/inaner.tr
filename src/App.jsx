import { useState, useEffect, useContext, useRef } from 'react'
import { DataContext } from './context/DataContext'
import { motion, AnimatePresence } from 'framer-motion'

import {
  Menu, X, Truck, MapPin, FileText, Droplet, Wrench,
  CreditCard, PieChart, Calendar, Settings, Shield, LogOut, Bell, AlertTriangle, Sun, Moon, Waves, ChevronDown, Building2, Server, Users, Receipt
} from 'lucide-react'
import Dashboard from './components/Dashboard'
import Trips from './components/Trips'
import Invoices from './components/Invoices'
import Fuel from './components/Fuel'
import Maintenance from './components/Maintenance'
import Payments from './components/Payments'
import SettingsPage from './components/Settings'
import Login from './components/Login'
import Detaylar from './components/Detaylar'
import CompanyAdmin from './components/CompanyAdmin'
import SuperAdmin from './components/SuperAdmin'
import { useCompany } from './context/CompanyContext'
import { useTruck } from './context/TruckContext'
import PremiumLogo from './components/PremiumLogo'
import MapPage from './components/MapPage'
import Personnel from './components/Personnel'
import EArsiv from './components/EArsiv'
import { sendDiscordAlert } from './services/discordWebhook'
import { db, messaging } from './services/firebaseConfig'
import { onMessage } from 'firebase/messaging'
import { doc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore'
import { requestAndSaveNotificationToken } from './services/notificationService'
import PushNotificationToast from './components/PushNotificationToast'

function App() {
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('tir_active_tab')
    if (savedTab) return savedTab;
    return 'dashboard';
  })
  const [isMenuOpen, setIsMenuOpen] = useState(window.innerWidth >= 768)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [theme, setTheme] = useState('dark')
  const [activeNotification, setActiveNotification] = useState(null)
  const [bomPhase, setBomPhase] = useState(null); // null | 'fall' | 'recover'
  const bomSequence = useRef([]);
  const BOM_KEYS = ['b', 'o', 'm'];
  
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
    if (touchStartX.current === null || touchStartY.current === null) return;
    
    touchEndX.current = e.changedTouches[0].clientX;
    touchEndY.current = e.changedTouches[0].clientY;
    
    const distanceX = touchStartX.current - touchEndX.current;
    const distanceY = Math.abs(touchStartY.current - touchEndY.current);
    const startX = touchStartX.current;
    
    // Değerleri sıfırla
    touchStartX.current = null;
    touchStartY.current = null;
    touchEndX.current = null;
    touchEndY.current = null;
    
    // Eğer dikey kaydırma yataya yakınsa veya fazlaysa, bu scroll hareketidir; menüyü tetikleme
    if (distanceY > Math.abs(distanceX) * 0.7) {
      return;
    }
    
    // Swipe left to close (Menü açıkken sola doğru en az 100px kaydırma)
    if (distanceX > 100 && isMenuOpen && isMobile) {
      setIsMenuOpen(false);
    }
    // Swipe right to open:
    // Sadece ekranın en sol kenarından (ilk 45px) başlayıp en az 140px sağa kaydırıldığında açılsın
    if (distanceX < -140 && !isMenuOpen && isMobile && startX <= 45) {
      setIsMenuOpen(true);
    }
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
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f8f9fa' : '#07090E');
    
    return () => clearTimeout(timer);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('tir_theme', next);
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', next === 'light' ? '#f8f9fa' : '#07090E');
  }

  const { currentSession, logoutSession, isDataLoading, dataError, docs, penalties, companyNotifications, acknowledgeNotification, markNotificationAsRead } = useContext(DataContext)
  const { activeCompanyId, setActiveCompanyId, companyData, companies } = useCompany()
  const { activeTruckId, setActiveTruckId, activeTruckData, trucks } = useTruck()
  const currentUser = currentSession;
  const userRole = currentUser?.username === 'kenan' ? 'super_admin' : String(currentUser?.role || 'user').toLowerCase();

  const [showTruckExpand, setShowTruckExpand] = useState(false);

  const DEFAULT_PIC = '/tir-clear.png?v=8'
  const profilePic = activeTruckData?.imageUrl || DEFAULT_PIC;



  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)

    // Sekme yönlendirme olaylarını dinle
    const handleSwitchTab = (e) => {
      if (e.detail) setActiveTab(e.detail);
    };
    window.addEventListener('tir_switch_tab', handleSwitchTab);

    // Service worker bildirim tıklama mesajlarını dinle
    const handleSwMessage = (event) => {
      if (event.data?.type === 'SWITCH_TAB' && event.data.tab) {
        setActiveTab(event.data.tab);
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    // URL Hash kontrolü (#tab=trips gibi)
    if (window.location.hash.startsWith('#tab=')) {
      const hashTab = window.location.hash.replace('#tab=', '');
      if (hashTab) setActiveTab(hashTab);
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('tir_switch_tab', handleSwitchTab)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage)
      }
    }
  }, [])

  // iPhone & Tarayıcı Otomatik Canlı Sürüm Denetleyicisi
  useEffect(() => {
    let lastVersion = sessionStorage.getItem('app_loaded_version');

    const checkVersion = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.version) {
            if (lastVersion && lastVersion !== data.version) {
              console.log('[AutoUpdate] Yeni sürüm yayında, otomatik tazeleniyor:', data.version);
              sessionStorage.setItem('app_loaded_version', data.version);
              window.location.reload();
            } else if (!lastVersion) {
              sessionStorage.setItem('app_loaded_version', data.version);
            }
          }
        }
      } catch {
        // Ağ hatası durumunda sessizce geç
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 60000);
    const handleVis = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, []);

  // PWA Bildirim Kaydı ve İzin Yönetimi
  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;

    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        requestAndSaveNotificationToken(currentUser.uid);
      } else if (Notification.permission === 'default') {
        // Girişten 3 saniye sonra izin isteyelim
        const timer = setTimeout(() => {
          requestAndSaveNotificationToken(currentUser.uid);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [currentUser]);

  // Ön Plan Bildirim Dinleyicisi
  useEffect(() => {
    if (!messaging) return;
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Ön planda yeni bildirim alındı:', payload);
      setActiveNotification({
        title: payload.notification?.title || payload.data?.title || 'İnaner Lojistik Duyuru',
        body: payload.notification?.body || payload.data?.body || '',
        data: payload.data || {}
      });
    });
    return () => unsubscribe();
  }, []);

  // BOM Easter Egg: B → O → M sırasıyla basılınca her şey yerçekimiyle düşer
  useEffect(() => {
    const handleBomKey = (e) => {
      const key = e.key.toLowerCase();
      const expected = BOM_KEYS[bomSequence.current.length];
      if (key === expected) {
        bomSequence.current = [...bomSequence.current, key];
        if (bomSequence.current.length === BOM_KEYS.length) {
          bomSequence.current = [];
          setBomPhase('fall');
          // Emoji patlamaları oluştur
          const emojis = ['💥', '🔥', '💣', '⚡', '🌪️', '☄️'];
          for (let i = 0; i < 18; i++) {
            const el = document.createElement('div');
            el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            el.style.cssText = `
              position: fixed;
              font-size: ${Math.random() * 40 + 20}px;
              left: ${Math.random() * 100}vw;
              top: ${Math.random() * 40 + 10}vh;
              z-index: 99999;
              pointer-events: none;
              animation: bomEmoji ${Math.random() * 1 + 1.5}s ease-in forwards;
              animation-delay: ${Math.random() * 0.5}s;
            `;
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 3000);
          }
          // 1.5s sonra geri dön
          setTimeout(() => setBomPhase('recover'), 1500);
          setTimeout(() => setBomPhase(null), 2500);
        }
      } else {
        bomSequence.current = key === BOM_KEYS[0] ? [key] : [];
      }
    };
    window.addEventListener('keydown', handleBomKey);
    return () => window.removeEventListener('keydown', handleBomKey);
  }, []);

  // Mobilde sidebar açıkken tıklanabilir sayfa alanında kapansın
  const handleOverlayClick = () => {
    if (isMobile) setIsMenuOpen(false)
  }

  const handleLogout = () => {
    // G8: Çıkış bildirimi
    sendDiscordAlert({
      type: 'info',
      title: '🚪 Kullanıcı Çıkış Yaptı',
      description: `**${currentUser?.username || '?'}** oturumu kapattı.`,
    });
    logoutSession()
    localStorage.removeItem('tir_active_tab')
    setIsMenuOpen(false)
  }

  // Belge uyarısı hesapla (Detaylar sekmesi badge) - DataContext'ten gelen verilerle
  const DOC_WARNINGS = { bandrol: 30, inspection: 45, trailerInspection: 45, insurance: 30, k1: 60, l1: 60, srcBelgesi: 60, odp: 30 }

  // D1-D8: Belge uyarıları — günde 1 kez Discord'a gönder
  useEffect(() => {
    if (!docs || !currentUser) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    const sentKey = 'tir_discord_doc_alert_' + todayKey;
    if (localStorage.getItem(sentKey)) return; // Bugün zaten gönderildi

    const DOC_LABELS = {
      bandrol: 'Bandrol',
      inspection: 'Çekici Muayene',
      trailerInspection: 'Dorse Muayene',
      insurance: 'Sigorta',
      k1: 'K1 Belgesi',
      l1: 'L1 Belgesi',
      srcBelgesi: 'SRC Belgesi',
      odp: 'ODP Sigortası',
    };

    const warnings = [];
    const expired = [];

    Object.entries(DOC_WARNINGS).forEach(([key, days]) => {
      const d = docs[key]?.date;
      if (!d) return;
      const diff = Math.ceil((new Date(d) - new Date()) / 86400000);
      if (diff <= 0) {
        expired.push(`🚫 **${DOC_LABELS[key]}** — SÜRESİ DOLDU! (${d})`);
      } else if (diff <= days) {
        warnings.push(`⚠️ **${DOC_LABELS[key]}** — ${diff} gün kaldı (${d})`);
      }
    });

    if (expired.length > 0) {
      sendDiscordAlert({
        type: 'danger',
        title: '🚫 ARAÇ BELGESİ SÜRESİ DOLDU!',
        description: expired.join('\n'),
        fields: [{ name: '🚛 Araç', value: activeTruckData?.plate || activeTruckId || '—', inline: true }]
      });
    }

    if (warnings.length > 0) {
      sendDiscordAlert({
        type: 'warning',
        title: '📋 Araç Belgesi Uyarısı',
        description: warnings.join('\n'),
        fields: [{ name: '🚛 Araç', value: activeTruckData?.plate || activeTruckId || '—', inline: true }]
      });
    }

    if (expired.length > 0 || warnings.length > 0) {
      localStorage.setItem(sentKey, '1');
    }
  }, [docs, currentUser, activeTruckId, activeTruckData]);

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
    { id: 'dashboard', label: 'Özet', icon: <PieChart size={20} />, theme: 'bg-gradient-to-r from-violet-600 to-purple-500 border-violet-400/40 shadow-[0_0_20px_rgba(139,92,246,0.35)] text-white', hoverText: 'group-hover:text-violet-400' },
    { id: 'trips', label: 'Seferler', icon: <MapPin size={20} />, theme: 'bg-gradient-to-r from-sky-600 to-blue-500 border-sky-400/40 shadow-[0_0_20px_rgba(14,165,233,0.35)] text-white', hoverText: 'group-hover:text-sky-400' },
    { id: 'fuel', label: 'Mazot Fişleri', icon: <Droplet size={20} />, theme: 'bg-gradient-to-r from-cyan-600 to-teal-500 border-cyan-400/40 shadow-[0_0_20px_rgba(6,182,212,0.35)] text-white', hoverText: 'group-hover:text-cyan-400' },
    { id: 'maintenance', label: 'Araç Bakım', icon: <Wrench size={20} />, theme: 'bg-gradient-to-r from-amber-600 to-orange-500 border-amber-400/40 shadow-[0_0_20px_rgba(245,158,11,0.35)] text-white', hoverText: 'group-hover:text-amber-400' },
    { id: 'detaylar', label: 'Ceza & Belgeler', icon: <AlertTriangle size={20} />, badge: notifCount, theme: 'bg-gradient-to-r from-red-600 to-rose-500 border-red-400/40 shadow-[0_0_20px_rgba(239,68,68,0.35)] text-white', hoverText: 'group-hover:text-red-400' },
    { id: 'invoices', label: 'Fatura Durumu', icon: <FileText size={20} />, theme: 'bg-gradient-to-r from-indigo-600 to-sky-400 border-indigo-400/40 shadow-[0_0_20px_rgba(99,102,241,0.35)] text-white', hoverText: 'group-hover:text-sky-400' },
    { id: 'earsiv', label: 'E-Arşiv Fatura', icon: <Receipt size={20} />, theme: 'bg-gradient-to-r from-orange-600 to-amber-500 border-orange-400/40 shadow-[0_0_20px_rgba(249,115,22,0.35)] text-white', hoverText: 'group-hover:text-orange-400' },
    { id: 'payments', label: 'Ödeme Takibi', icon: <CreditCard size={20} />, theme: 'bg-gradient-to-r from-emerald-600 to-teal-500 border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.35)] text-white', hoverText: 'group-hover:text-emerald-400' },
    { id: 'personel', label: 'Personel', icon: <Users size={20} />, theme: 'bg-gradient-to-r from-orange-600 to-amber-500 border-orange-400/40 shadow-[0_0_20px_rgba(249,115,22,0.35)] text-white', hoverText: 'group-hover:text-orange-400' },
    { id: 'map', label: 'Harita', icon: <MapPin size={20} />, theme: 'bg-gradient-to-r from-blue-600 to-indigo-500 border-blue-400/40 shadow-[0_0_20px_rgba(37,99,235,0.35)] text-white', hoverText: 'group-hover:text-blue-400' },
    { id: 'company_admin', label: 'Şirket Yönetimi', icon: <Building2 size={20} />, theme: 'bg-gradient-to-r from-indigo-600 to-violet-500 border-indigo-400/40 shadow-[0_0_20px_rgba(99,102,241,0.35)] text-white', hoverText: 'group-hover:text-indigo-400' },
    { id: 'super_admin', label: 'SaaS Yönetimi', icon: <Server size={20} />, theme: 'bg-gradient-to-r from-fuchsia-600 to-pink-500 border-fuchsia-400/40 shadow-[0_0_20px_rgba(217,70,239,0.35)] text-white', hoverText: 'group-hover:text-fuchsia-400' },
  ]



  const filteredMenuItems = menuItems.filter(item => {
    if (item.id === 'personel' && !companyData?.personnelEnabled) return false;
    if (item.id === 'map' && !companyData?.mapEnabled) return false;
    if (item.id === 'earsiv' && !companyData?.earsivEnabled) return false;

    if (userRole === 'super_admin') return true;

    if (userRole === 'company_admin') {
      return item.id !== 'super_admin';
    }

    // Default 'şoför' (Sürücü) -> Sadece operasyonel sekmeleri görür
    return !['super_admin', 'company_admin', 'map', 'personel', 'earsiv'].includes(item.id);
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
      className={`min-h-screen font-sans relative overflow-x-clip ${theme === 'light' ? 'light' : ''} ${bomPhase === 'fall' ? 'bom-active' : ''} ${bomPhase === 'recover' ? 'bom-recover' : ''}`} 
      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >

      {/* 💣 BOM Easter Egg Bildirimi */}
      {bomPhase === 'fall' && (
        <div className="bom-notification">💣 B O M !</div>
      )}
      {isMenuOpen && isMobile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={handleOverlayClick} />
      )}

      {/* Sidebar - Avant Garde Minimalist Layout */}
      <aside className={`fixed top-0 left-0 h-full w-72 z-50 flex flex-col transition-transform duration-500 ease-in-out ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          background: 'var(--bg-sidebar)',
          borderRight: `1px solid var(--border-color)`,
        }}>
        {/* Header - Premium Logo */}
        <div className="pb-2 flex flex-col"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>

          <PremiumLogo />

        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-4 pt-3 sm:pt-6 pb-6 space-y-1.5 overflow-y-auto relative custom-scrollbar">
          {filteredMenuItems.map((item) => {
            const isActive = activeTab === item.id;

            // ── Şirket Yönetimi: morph eden buton + ayrı expand (Tır seçimi için) ──
            if (item.id === 'company_admin') {
              const activeTruckPlate = trucks.find(t => t.id === activeTruckId)?.plate || 'Tır Seçin';
              const otherTrucks = trucks.filter(t => t.id !== activeTruckId);
              
              return (
                <div key={item.id}>
                  <button onClick={() => { setActiveTab(item.id); if (isMobile) setIsMenuOpen(false); }}
                    className={`w-full relative flex items-center space-x-3 px-4 h-10 rounded-xl text-left group transition-all duration-300 outline-none ${isActive ? 'font-medium text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                    {!isActive && <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 rounded-xl transition-colors duration-300 -z-10" />}
                    {isActive && (
                      <motion.div layoutId="sidebar-active-apple"
                        className={`absolute inset-0 rounded-xl border ${item.theme}`}
                        style={{ zIndex: 0 }} initial={false}
                        transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}
                      />
                    )}
                    <div className={`relative z-10 flex items-center flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110 drop-shadow-md text-white/90' : `text-slate-500 group-hover:scale-110 ${item.hoverText}`}`}>
                      {item.icon}
                    </div>
                    <div className="flex-1 self-stretch overflow-hidden relative z-10 flex flex-col justify-center">
                      <motion.span
                        className="text-sm tracking-wide drop-shadow-md leading-none text-left"
                        animate={{ y: isActive ? -3 : 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}>
                        {item.label}
                      </motion.span>
                      <motion.span
                        className="absolute left-0 right-0 text-[10px] text-indigo-200/75 font-medium truncate leading-none"
                        style={{ top: 0 }}
                        animate={{ y: isActive ? 27 : 50, opacity: isActive ? 1 : 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}>
                        {activeTruckPlate}
                      </motion.span>
                    </div>
                    {/* Expand chevron */}
                    <motion.div
                      animate={{ opacity: isActive ? 1 : 0 }}
                      transition={{ duration: 0.15 }}
                      onClick={(e) => { e.stopPropagation(); if (isActive) setShowTruckExpand(v => !v); }}
                      className="relative z-20 p-1 rounded-md hover:bg-white/15 transition-colors flex-shrink-0 cursor-pointer"
                      style={{ pointerEvents: isActive ? 'auto' : 'none' }}>
                      <motion.div animate={{ rotate: showTruckExpand ? 180 : 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}>
                        <ChevronDown size={12} className="text-indigo-300/70" />
                      </motion.div>
                    </motion.div>
                  </button>

                  {/* Tır listesi - sadece expand açıkken ve aktifken */}
                  <AnimatePresence>
                    {isActive && showTruckExpand && (
                      <motion.div key="company-trucks"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                        className="overflow-hidden">
                        <div className="mx-1 mt-1 mb-0.5 bg-indigo-500/5 border border-indigo-500/15 rounded-xl overflow-hidden">
                          {/* Aktif Tır */}
                          <div className="flex items-center gap-2.5 px-3 py-2.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0 shadow-[0_0_6px_rgba(99,102,241,0.5)]" />
                            <span className="text-xs font-semibold text-indigo-200 flex-1 truncate">{activeTruckPlate}</span>
                            <span className="text-[8px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">Aktif</span>
                          </div>
                          {/* Diğer Tırlar */}
                          {otherTrucks.map((t, i) => (
                            <div key={t.id}>
                              {i === 0 && <div className="h-px bg-indigo-500/10 mx-3" />}
                              <button onClick={() => { setActiveTruckId(t.id); setShowTruckExpand(false); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-indigo-500/10 transition-colors group/co">
                                <Truck size={11} className="text-slate-600 group-hover/co:text-indigo-400 transition-colors flex-shrink-0" />
                                <span className="text-xs text-slate-400 group-hover/co:text-white transition-colors truncate">{t.plate}</span>
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
                    className={`absolute inset-0 rounded-xl border ${item.theme}`}
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
                {item.badge_beta && (
                  <span className="relative z-10 bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 tracking-wide">🧪 BETA</span>
                )}
              </button>
            );
          })}

        </nav>

        {/* Footer: User & Theme */}
        <div className="p-4 pl-10 pr-6 pb-6 flex items-center justify-between"
          style={{ 
            paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))'
          }}>
          <button 
            onClick={() => setActiveTab('settings')}
            className="text-xs text-slate-500 font-medium truncate max-w-[120px] hover:text-slate-200 transition-colors cursor-pointer outline-none text-left" 
            title="Sistem Ayarları"
          >
            {currentUser.username}
          </button>
          <div className="flex items-center gap-2">
            <button onClick={handleLogout} title="Oturumu Kapat" className="p-2 rounded-full text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`${['dashboard', 'map', 'invoices', 'earsiv'].includes(activeTab) ? 'h-[100dvh] md:h-screen overflow-hidden' : 'min-h-screen'} ${mainPaddingLeft}`}>
        <div className={`flex flex-col w-full ${['dashboard', 'map', 'invoices', 'earsiv'].includes(activeTab) ? 'h-full overflow-hidden' : 'min-h-screen'}`}>

          {/* Header - Simple & Clean (sticky) */}
          <div className={`sticky top-0 z-30 px-6 pb-4 flex items-center justify-between bg-[var(--bg-base)] border-b border-[var(--border-color)] transition-all duration-300 ${['fuel', 'map', 'trips', 'dashboard', 'maintenance', 'detaylar', 'invoices', 'earsiv', 'payments', 'personel', 'settings', 'company_admin', 'super_admin'].includes(activeTab) ? 'hidden' : ''}`}
            style={{
              paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))'
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
          <div className={`flex-1 ${
            activeTab === 'map' 
              ? 'p-0 h-full overflow-hidden' 
              : activeTab === 'dashboard'
                ? 'pt-1 sm:pt-4 md:pt-5 pb-3 sm:pb-4 px-3 sm:px-5 md:px-6 h-full overflow-hidden flex flex-col' 
                : ['invoices', 'earsiv'].includes(activeTab)
                  ? 'p-3 sm:p-4 md:p-5 h-full overflow-hidden flex flex-col'
                  : 'p-3 sm:p-4 md:p-6 xl:p-8'
          }`}>
            <div key={activeTab} className={['dashboard', 'invoices', 'earsiv'].includes(activeTab) ? 'page-transition h-full flex flex-col overflow-hidden' : 'page-transition'}>
              {activeTab === 'dashboard' && <Dashboard onOpenMenu={() => setIsMenuOpen(true)} isMobile={isMobile} />}
              {activeTab === 'trips' && <Trips onOpenMenu={() => setIsMenuOpen(true)} isMobile={isMobile} />}
              {activeTab === 'fuel' && <Fuel onOpenMenu={() => setIsMenuOpen(true)} isMobile={isMobile} />}
              {activeTab === 'maintenance' && <Maintenance onOpenMenu={() => setIsMenuOpen(true)} isMobile={isMobile} />}
              {activeTab === 'detaylar' && <Detaylar onOpenMenu={() => setIsMenuOpen(true)} isMobile={isMobile} />}
              {activeTab === 'invoices' && <Invoices onOpenMenu={() => setIsMenuOpen(true)} isMobile={isMobile} />}
              {activeTab === 'earsiv' && <EArsiv onOpenMenu={() => setIsMenuOpen(true)} isMobile={isMobile} />}
              {activeTab === 'payments' && <Payments onOpenMenu={() => setIsMenuOpen(true)} isMobile={isMobile} />}
              {activeTab === 'personel' && <Personnel onOpenMenu={() => setIsMenuOpen(true)} isMobile={isMobile} />}
              {activeTab === 'settings' && <SettingsPage onOpenMenu={() => setIsMenuOpen(true)} isMobile={isMobile} />}
              {activeTab === 'company_admin' && <CompanyAdmin onOpenMenu={() => setIsMenuOpen(true)} isMobile={isMobile} />}
              {activeTab === 'super_admin' && <SuperAdmin onOpenMenu={() => setIsMenuOpen(true)} isMobile={isMobile} />}
              {activeTab === 'map' && userRole === 'super_admin' && <MapPage onOpenMenu={() => setIsMenuOpen(true)} isMobile={isMobile} />}
            </div>
          </div>
        </div>
      </main>

      {/* Şık Ön Plan Push Bildirim Toast Kartı */}
      <PushNotificationToast
        notification={activeNotification}
        onClose={() => setActiveNotification(null)}
        onAction={(tab) => {
          if (tab) {
            setActiveTab(tab);
          } else if (activeNotification?.data?.targetTab) {
            setActiveTab(activeNotification.data.targetTab);
          }
        }}
        onAcknowledge={async (notifId, status) => {
          if (acknowledgeNotification && notifId) {
            await acknowledgeNotification(notifId, status);
          }
        }}
      />

    </div>
  )
}

export default App

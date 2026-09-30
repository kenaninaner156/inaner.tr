import { useState, useEffect, useContext, useRef, useMemo, useCallback } from 'react'
import { DataContext } from './context/DataContext'
import { motion, AnimatePresence } from 'framer-motion'

import {
  Menu, X, Truck, MapPin, FileText, Droplet, Wrench,
  CreditCard, PieChart, Calendar, Settings, Shield, LogOut, Bell, AlertTriangle, Sun, Moon, Waves, ChevronDown, ChevronUp, User, Building2, Server, Users, Receipt, Landmark, Scale, HardDrive
} from 'lucide-react'
import Dashboard from './components/Dashboard'
import Trips from './components/Trips'
import Invoices from './components/Invoices'
import Fuel from './components/Fuel'
import Maintenance from './components/Maintenance'
import Payments from './components/Payments'
import CompanyDebts from './components/CompanyDebts'
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
import Drive from './components/Drive'
import { sendDiscordAlert } from './services/discordWebhook'
import { auth, db, messaging } from './services/firebaseConfig'
import { onMessage } from 'firebase/messaging'
import { doc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore'
import { requestAndSaveNotificationToken } from './services/notificationService'
import PushNotificationToast from './components/PushNotificationToast'
import { lockPinSession } from './utils/pinSession'

function App() {
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('tir_active_tab')
    if (savedTab) return savedTab;
    return 'dashboard';
  })
  const [isMenuOpen, setIsMenuOpen] = useState(window.innerWidth >= 1024)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)
  const [theme, setTheme] = useState('dark')
  const [activeNotification, setActiveNotification] = useState(null)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)
  const navRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    };
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isUserMenuOpen]);

  const prevScrollTopRef = useRef(0);

  // Alt kullanıcı menüsü açıldığında üstteki menü butonlarının aynı anda yukarı yükselmesi için senkronize kaydırma
  useEffect(() => {
    if (isUserMenuOpen) {
      if (navRef.current) {
        prevScrollTopRef.current = navRef.current.scrollTop;
      }
    } else {
      if (navRef.current && prevScrollTopRef.current !== undefined) {
        navRef.current.scrollTo({
          top: prevScrollTopRef.current,
          behavior: 'smooth'
        });
      }
    }
  }, [isUserMenuOpen]);

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
    // Sadece ekranın en sol kenarından (ilk 30px) başlayıp en az 140px sağa kaydırıldığında açılsın
    if (distanceX < -140 && !isMenuOpen && isMobile && startX <= 30) {
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

  const { currentSession, logoutSession, isDataLoading, dataError, docs, penalties, companyNotifications, acknowledgeNotification, markNotificationAsRead, personnel, approvedUsers } = useContext(DataContext)
  const { activeCompanyId, setActiveCompanyId, companyData, companies } = useCompany()
  const { activeTruckId, setActiveTruckId, activeTruckData, trucks } = useTruck()
  const currentUser = currentSession;
  const userRole = (currentUser?.username === 'kenan' || (typeof window !== 'undefined' && localStorage.getItem('tir_current_user') === 'kenan'))
    ? 'super_admin'
    : String(currentUser?.role || (typeof window !== 'undefined' && localStorage.getItem('tir_current_role')) || 'user').toLowerCase();

  // Kullanıcı Profil Fotoğrafı (Google Hesabı, Ayarlar Araç Resmi, Personel Avatarı veya Kullanıcı Profili)
  const matchedPersonAvatar = useMemo(() => {
    if (!currentUser?.username) return null;
    const lower = currentUser.username.toLowerCase().trim();
    if (personnel?.length) {
      const foundPerson = personnel.find(p => 
        p.name?.toLowerCase().trim() === lower || 
        p.username?.toLowerCase().trim() === lower ||
        p.id?.toLowerCase().trim() === lower
      );
      if (foundPerson?.avatarUrl) return foundPerson.avatarUrl;
    }
    if (approvedUsers && typeof approvedUsers === 'object') {
      const usersList = Array.isArray(approvedUsers) ? approvedUsers : Object.values(approvedUsers);
      const foundUser = usersList.find(u => u.username?.toLowerCase().trim() === lower);
      if (foundUser?.photoURL || foundUser?.avatarUrl || foundUser?.imageUrl) {
        return foundUser.photoURL || foundUser.avatarUrl || foundUser.imageUrl;
      }
    }
    return null;
  }, [currentUser?.username, personnel, approvedUsers]);

  // Profil Fotoğrafı (Öncelik: Ayarlar'daki Profil Resmi: activeTruckData?.imageUrl veya araç resmi)
  const truckProfilePic = activeTruckData?.imageUrl || trucks?.find(t => t?.imageUrl)?.imageUrl || null;
  const [photoError, setPhotoError] = useState(false);

  const userPhoto = useMemo(() => {
    if (photoError) return null;
    return truckProfilePic || matchedPersonAvatar || null;
  }, [photoError, truckProfilePic, matchedPersonAvatar]);



  const [showTruckExpand, setShowTruckExpand] = useState(false);

  // ─── GİZLİ KISAYOL: AKTİF MENÜ İKONUNA ÇİFT TIKLAYARAK ARAÇ DEĞİŞTİRME ───
  const TRUCK_SCOPED_TABS = ['trips', 'fuel', 'maintenance', 'detaylar'];
  const [activeSwitchTab, setActiveSwitchTab] = useState(null);
  const [activeSwitchPlate, setActiveSwitchPlate] = useState(null);
  const switchTimerRef = useRef(null);
  const lastTapTimeRef = useRef(0);
  const lastTapTabRef = useRef(null);
  const lastSwitchTimeRef = useRef(0);

  const handleQuickTruckSwitch = (tabId) => {
    const now = Date.now();
    // En az 450ms içinde çift tetiklemeyi kesinlikle engelle
    if (now - lastSwitchTimeRef.current < 450) {
      return;
    }
    lastSwitchTimeRef.current = now;

    if (!TRUCK_SCOPED_TABS.includes(tabId)) return;
    if (userRole === 'şoför') return;
    if (!trucks || trucks.length <= 1) return;

    // Aktif tırı bul ve bir sonrakine geç
    const currentIndex = trucks.findIndex(t => t.id === activeTruckId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % trucks.length;
    const nextTruck = trucks[nextIndex];
    if (!nextTruck) return;

    setActiveTruckId(nextTruck.id);

    // Tıklanan butonun içine doğrudan geçilen yeni aracın plakasını yerleştir
    setActiveSwitchTab(tabId);
    setActiveSwitchPlate(nextTruck.plate || 'Bilinmeyen Plaka');

    if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    switchTimerRef.current = setTimeout(() => {
      setActiveSwitchTab(null);
      setActiveSwitchPlate(null);
    }, 1800);
  };

  const DEFAULT_PIC = '/tir-clear.png?v=8'
  const profilePic = activeTruckData?.imageUrl || DEFAULT_PIC;



  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMenuOpen(true);
      } else {
        setIsMenuOpen(false);
      }
    };
    // iOS Standalone (PWA) tespiti
    try {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      if (isIos && isStandalone) {
        document.documentElement.classList.add('ios-pwa');
        document.body.classList.add('ios-pwa');
      }
    } catch (_) {}

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

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
      window.removeEventListener('orientationchange', handleResize)
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
    lockPinSession();
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

  const ALL_PAGE_TITLES = {
    dashboard: 'Özet',
    trips: 'Seferler',
    fuel: 'Mazot Fişleri',
    maintenance: 'Araç Bakım',
    detaylar: 'Ceza & Belgeler',
    invoices: 'Fatura Durumu',
    drive: 'İnaner Drive',
    earsiv: 'E-Arşiv Fatura',
    payments: 'Vergi & SGK',
    company_debts: 'Borç & Kredi',
    personel: 'Personel',
    map: 'Harita',
    company_admin: 'Şirket Yönetimi',
    super_admin: 'SaaS Yönetimi',
    settings: 'Sistem Ayarları'
  };

  const menuItems = [
    { id: 'dashboard', label: 'Özet', icon: <PieChart size={20} />, theme: 'bg-gradient-to-r from-violet-600 to-purple-600 border-violet-400/30 text-white shadow-sm', hoverText: 'group-hover:text-violet-400' },
    { id: 'trips', label: 'Seferler', icon: <MapPin size={20} />, theme: 'bg-gradient-to-r from-sky-600 to-blue-600 border-sky-400/30 text-white shadow-sm', hoverText: 'group-hover:text-sky-400' },
    { id: 'fuel', label: 'Mazot Fişleri', icon: <Droplet size={20} />, theme: 'bg-gradient-to-r from-cyan-600 to-teal-600 border-cyan-400/30 text-white shadow-sm', hoverText: 'group-hover:text-cyan-400' },
    { id: 'map', label: 'Harita', icon: <MapPin size={20} />, theme: 'bg-gradient-to-r from-blue-600 to-indigo-600 border-blue-400/30 text-white shadow-sm', hoverText: 'group-hover:text-blue-400' },
    { id: 'maintenance', label: 'Araç Bakım', icon: <Wrench size={20} />, theme: 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400/30 text-white shadow-sm', hoverText: 'group-hover:text-amber-400' },
    { id: 'detaylar', label: 'Ceza & Belgeler', icon: <AlertTriangle size={20} />, badge: notifCount, theme: 'bg-gradient-to-r from-red-600 to-rose-600 border-red-400/30 text-white shadow-sm', hoverText: 'group-hover:text-red-400' },
    { id: 'invoices', label: 'Fatura Durumu', icon: <FileText size={20} />, theme: 'bg-gradient-to-r from-indigo-600 to-sky-500 border-indigo-400/30 text-white shadow-sm', hoverText: 'group-hover:text-sky-400' },
    { id: 'earsiv', label: 'E-Arşiv Fatura', icon: <Receipt size={20} />, theme: 'bg-gradient-to-r from-orange-600 to-amber-600 border-orange-400/30 text-white shadow-sm', hoverText: 'group-hover:text-orange-400' },
    { id: 'drive', label: 'İnaner Drive', icon: <HardDrive size={20} />, theme: 'bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-400/30 text-white shadow-sm', hoverText: 'group-hover:text-emerald-400' },
    { id: 'company_debts', label: 'Borç & Kredi', icon: <Landmark size={20} />, theme: 'bg-gradient-to-r from-amber-600 to-yellow-600 border-amber-400/30 text-white shadow-sm', hoverText: 'group-hover:text-amber-400' },
    { id: 'payments', label: 'Vergi & SGK', icon: <Scale size={20} />, theme: 'bg-gradient-to-r from-amber-600 to-yellow-600 border-amber-400/30 text-white shadow-sm', hoverText: 'group-hover:text-amber-400' },
    { id: 'personel', label: 'Personel', icon: <Users size={20} />, theme: 'bg-gradient-to-r from-orange-600 to-amber-600 border-orange-400/30 text-white shadow-sm', hoverText: 'group-hover:text-orange-400' },
  ]

  const filteredMenuItems = menuItems.filter(item => {
    if (item.id === 'personel' && !companyData?.personnelEnabled) return false;
    if (item.id === 'map' && !companyData?.mapEnabled) return false;
    if (item.id === 'earsiv' && !companyData?.earsivEnabled) return false;

    if (userRole === 'super_admin') return true;

    if (userRole === 'company_admin') return true;

    // Default 'şoför' -> Sadece operasyonel sekmeleri görür
    return !['map', 'personel', 'earsiv', 'company_debts', 'invoices', 'payments', 'drive'].includes(item.id);
  })


  // Sürücü rolü için kısıtlı sayfalara erişim engeli
  useEffect(() => {
    if (userRole === 'şoför' && ['super_admin', 'company_admin', 'map', 'personel', 'earsiv', 'company_debts', 'invoices', 'payments', 'drive'].includes(activeTab)) {
      setActiveTab('trips');
    }
  }, [userRole, activeTab]);

  const handleOpenMenu = () => setIsMenuOpen(true);
  const handleNavigate = (tab) => setActiveTab(tab);

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
        <div className="fixed inset-0 bg-black/75 z-[9990]" onClick={handleOverlayClick} />
      )}

      {/* Sidebar - Avant Garde Minimalist Layout */}
      <aside className={`fixed top-0 left-0 h-full z-[9995] flex flex-col transition-transform duration-500 ease-in-out ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          background: 'var(--bg-sidebar)',
          borderRight: `1px solid var(--border-color)`,
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          width: 'calc(18rem + env(safe-area-inset-left, 0px))',
        }}>
        {/* Header - Premium Logo */}
        <div className="pb-2 flex flex-col"
          style={{ paddingTop: 'calc(1.25rem + var(--safe-top))' }}>

          <PremiumLogo />

        </div>

        {/* Nav Links */}
        <nav 
          ref={navRef}
          className="flex-1 px-4 pt-3 sm:pt-6 pb-6 space-y-1.5 overflow-y-auto relative custom-scrollbar"
        >
            {filteredMenuItems.map((item) => {
              const isActive = activeTab === item.id;
              const isTruckScoped = TRUCK_SCOPED_TABS.includes(item.id);

              const handleItemClick = () => {
                if (isActive && isTruckScoped) {
                  const now = Date.now();
                  if (lastTapTabRef.current === item.id && (now - lastTapTimeRef.current) < 380) {
                    handleQuickTruckSwitch(item.id);
                    lastTapTimeRef.current = 0;
                    lastTapTabRef.current = null;
                    return;
                  }
                  lastTapTimeRef.current = now;
                  lastTapTabRef.current = item.id;
                } else {
                  setActiveTab(item.id);
                  if (isMobile) setIsMenuOpen(false);
                }
              };

              return (
                <button 
                  key={item.id} 
                  onClick={handleItemClick}
                  onDoubleClick={(e) => {
                    if (isActive && isTruckScoped) {
                      e.preventDefault();
                      handleQuickTruckSwitch(item.id);
                    }
                  }}
                  className={`w-full relative flex items-center space-x-3 px-4 py-2.5 rounded-xl group transition-colors duration-150 outline-none select-none ${isActive ? 'font-medium text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {!isActive && <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 rounded-xl transition-colors duration-150 -z-10 pointer-events-none" />}
                  {isActive && (
                    <motion.div 
                      layoutId="sidebar-active-apple"
                      className={`absolute inset-0 rounded-xl border ${item.theme}`}
                      style={{ zIndex: 0 }} 
                      initial={false}
                      transition={{ type: 'spring', stiffness: 450, damping: 35, mass: 0.6 }}
                    />
                  )}
                  <div 
                    onDoubleClick={(e) => {
                      if (isActive && isTruckScoped) {
                        e.stopPropagation();
                        e.preventDefault();
                        handleQuickTruckSwitch(item.id);
                      }
                    }}
                    className={`relative z-10 flex items-center transition-colors duration-150 ${isActive ? 'text-white' : `text-slate-500 group-hover:text-slate-300 ${item.hoverText}`}`}
                    title={isActive && isTruckScoped && userRole !== 'şoför' && trucks.length > 1 ? 'Çift tıklayarak aracı değiştirin' : undefined}
                  >
                    {item.icon}
                  </div>

                  {/* Buton içi odaklı plaka bildirimi veya etiket */}
                  <div className="flex-1 text-left relative overflow-hidden h-5 flex items-center z-10">
                    {activeSwitchTab === item.id && activeSwitchPlate ? (
                      <motion.span
                        key="switch-plate"
                        initial={{ y: 16, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -16, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 650, damping: 32, mass: 0.5 }}
                        className="absolute inset-x-0 flex items-center font-mono font-bold tracking-widest text-xs sm:text-sm text-white select-none whitespace-nowrap"
                      >
                        {activeSwitchPlate}
                      </motion.span>
                    ) : (
                      <span className="text-sm font-medium tracking-wide text-white select-none truncate">
                        {item.label}
                      </span>
                    )}
                  </div>
                  {item.badge > 0 && (
                    <span className="relative z-10 bg-red-500/20 border border-red-500/30 text-red-100 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center justify-center flex-shrink-0">{item.badge}</span>
                  )}
                  {item.badge_beta && (
                    <span className="relative z-10 bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 tracking-wide">BETA</span>
                  )}
                </button>
              );
            })}
          </nav>

        {/* Footer: Kullanıcı Profili ve Bar İçi Menü */}
        <div ref={userMenuRef} className="p-3 border-t border-white/[0.06] bg-[#0a0d14] shrink-0 z-20 relative"
          style={{ 
            paddingBottom: 'calc(1.2rem + env(safe-area-inset-bottom, 0px))'
          }}>

          {/* Barın İçerisinde Açılan Menü (Kullanıcı Butonunun Üzerinde Akıcı Yükselir) */}
          <AnimatePresence initial={false}>
            {isUserMenuOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                onUpdate={() => {
                  if (navRef.current) {
                    navRef.current.scrollTop = navRef.current.scrollHeight;
                  }
                }}
                className="overflow-hidden mb-2"
              >
                <div className="space-y-1 pb-1">
                  {/* 1. Şirket Yönetimi */}
                  <button
                    onClick={() => {
                      setActiveTab('company_admin');
                      setIsUserMenuOpen(false);
                      if (isMobile) setIsMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                      activeTab === 'company_admin'
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                      activeTab === 'company_admin' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.04] text-zinc-400'
                    }`}>
                      <Building2 size={13} />
                    </div>
                    <span className="flex-1 text-left truncate">Şirket Yönetimi</span>
                  </button>

                  {/* 2. SaaS Yönetimi (Super Admin için) */}
                  {userRole === 'super_admin' && (
                    <button
                      onClick={() => {
                        setActiveTab('super_admin');
                        setIsUserMenuOpen(false);
                        if (isMobile) setIsMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                        activeTab === 'super_admin'
                          ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold'
                          : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                        activeTab === 'super_admin' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.04] text-zinc-400'
                      }`}>
                        <Server size={13} />
                      </div>
                      <span className="flex-1 text-left truncate">SaaS Yönetimi</span>
                    </button>
                  )}

                  {/* 3. Ayarlar */}
                  <button
                    onClick={() => {
                      setActiveTab('settings');
                      setIsUserMenuOpen(false);
                      if (isMobile) setIsMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                      activeTab === 'settings'
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                      activeTab === 'settings' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.04] text-zinc-400'
                    }`}>
                      <Settings size={13} />
                    </div>
                    <span className="flex-1 text-left truncate">Ayarlar</span>
                  </button>

                  {/* Çıkış Yap */}
                  <div className="pt-1 mt-1 border-t border-white/[0.04]">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
                    >
                      <div className="w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0 text-rose-400">
                        <LogOut size={13} />
                      </div>
                      <span className="flex-1 text-left truncate">Çıkış Yap</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Kullanıcı Butonu (Çerçevesiz, Oksuz, Sade, Profil Fotoğraflı) */}
          <button
            onClick={() => setIsUserMenuOpen(prev => !prev)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors select-none group ${
              isUserMenuOpen || ['company_admin', 'super_admin', 'settings'].includes(activeTab)
                ? 'bg-white/[0.05] text-white'
                : 'hover:bg-white/[0.03] text-zinc-300 hover:text-white'
            }`}
          >
            {userPhoto ? (
              <img
                src={userPhoto}
                alt={currentUser?.username || 'Kullanıcı'}
                className="w-7 h-7 rounded-full object-cover ring-1 ring-white/10 shrink-0"
                onError={() => setPhotoError(true)}
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0 uppercase">
                {currentUser?.username ? currentUser.username[0] : 'K'}
              </div>
            )}
            <span className="text-xs font-semibold truncate capitalize">
              {currentUser?.username || 'Kullanıcı'}
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`${['dashboard', 'map', 'invoices', 'earsiv', 'company_debts', 'personel', 'payments', 'drive'].includes(activeTab) ? 'h-[100dvh] lg:h-screen overflow-hidden' : 'min-h-screen'} ${mainPaddingLeft}`}>
        <div className={`flex flex-col w-full ${['dashboard', 'map', 'invoices', 'earsiv', 'company_debts', 'personel', 'payments', 'drive'].includes(activeTab) ? 'h-full overflow-hidden' : 'min-h-screen'}`}>

          {/* Header - Simple & Clean (sticky) */}
          <div className={`sticky top-0 z-30 px-6 pb-4 flex items-center justify-between bg-[var(--bg-base)] border-b border-[var(--border-color)] transition-all duration-300 ${['fuel', 'map', 'trips', 'dashboard', 'maintenance', 'detaylar', 'invoices', 'earsiv', 'payments', 'personel', 'settings', 'company_admin', 'super_admin', 'company_debts', 'drive'].includes(activeTab) ? 'hidden' : ''}`}
            style={{
              paddingTop: 'calc(0.75rem + var(--safe-top))'
            }}
          >
            <div className="flex items-center space-x-4">
              {isMobile && (
                <button onClick={() => setIsMenuOpen(true)} className="p-2 -ml-2 text-slate-400 hover:text-slate-100 transition-colors">
                  <Menu size={24} />
                </button>
              )}
              <h2 className="text-xl font-medium tracking-tight text-slate-100">
                {ALL_PAGE_TITLES[activeTab] || menuItems.find(i => i.id === activeTab)?.label || 'Yönetim Paneli'}
              </h2>
            </div>
          </div>

          {/* Content Area */}
          <div 
            className={`flex-1 ${
              activeTab === 'map' 
                ? 'p-0 h-full overflow-hidden' 
                : activeTab === 'dashboard'
                  ? 'pb-3 sm:pb-4 px-3 sm:px-5 md:px-6 h-full overflow-hidden flex flex-col' 
                  : ['invoices', 'earsiv', 'company_debts', 'personel', 'payments', 'drive'].includes(activeTab)
                    ? 'p-2.5 sm:p-4 md:p-5 h-full overflow-hidden flex flex-col'
                    : 'p-3 sm:p-4 md:p-6 xl:p-8'
            }`}
            style={activeTab === 'dashboard' ? {
              paddingTop: isMobile ? '0' : 'calc(1.35rem + var(--safe-top))',
              paddingRight: 'calc(1.25rem + env(safe-area-inset-right, 0px))',
              paddingLeft: 'calc(1.25rem + env(safe-area-inset-left, 0px))'
            } : undefined}
          >
            <div key={activeTab} className={activeTab === 'map' ? 'h-full w-full overflow-hidden' : ['invoices', 'earsiv', 'company_debts', 'personel', 'payments', 'drive', 'dashboard'].includes(activeTab) ? 'page-transition h-full flex flex-col overflow-hidden' : 'page-transition'}>
              {activeTab === 'dashboard' && <Dashboard onOpenMenu={handleOpenMenu} onNavigate={handleNavigate} isMobile={isMobile} />}
              {activeTab === 'trips' && <Trips onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
              {activeTab === 'fuel' && <Fuel onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
              {activeTab === 'maintenance' && <Maintenance onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
              {activeTab === 'detaylar' && <Detaylar onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
              {activeTab === 'invoices' && <Invoices onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
              {activeTab === 'drive' && <Drive onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
              {activeTab === 'earsiv' && <EArsiv onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
              {activeTab === 'payments' && <Payments onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
              {activeTab === 'company_debts' && <CompanyDebts onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
              {activeTab === 'personel' && <Personnel onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
              {activeTab === 'settings' && <SettingsPage onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
              {activeTab === 'company_admin' && <CompanyAdmin onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
              {activeTab === 'super_admin' && <SuperAdmin onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
              {activeTab === 'map' && userRole === 'super_admin' && <MapPage onOpenMenu={handleOpenMenu} isMobile={isMobile} />}
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

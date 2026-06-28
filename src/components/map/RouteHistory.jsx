import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Polyline, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { ChevronLeft, ChevronRight, ChevronDown, Play, Pause, X, Smartphone, BookmarkPlus, Scissors, Edit2, Check, Loader2, Clock } from 'lucide-react';
import { calcStats, getInterpolatedPointLinear, haversineKm, groupIntoSessions, filterSessionPoints } from '../../utils/mapUtils';
import { DataContext } from '../../context/DataContext';
import { db } from '../../services/firebaseConfig';
import { collection, query, where, orderBy, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
function getSpeedColor(speedMs) {
  const kmh = (speedMs || 0) * 3.6;
  if (kmh < 5)  return '#ef4444';  // kırmızı
  if (kmh < 30) return '#f97316';  // turuncu
  if (kmh < 70) return '#6366f1';  // orange
  if (kmh < 90) return '#38bdf8';  // cyan
  return '#22c55e';                // yeşil
}

function formatDuration(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h > 0) return `${h} sa ${m} dk`;
  return `${m} dk`;
}

const SpeedPolylines = React.memo(({ session }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  if (!session || session.length < 2) return null;
  const segments = [];
  for (let i = 0; i < session.length - 1; i++) {
    const a = session[i], b = session[i + 1];
    if (isNaN(a.lat) || isNaN(b.lat)) continue;
    const color = getSpeedColor(a.speed);
    const last = segments[segments.length - 1];
    if (last && last.color === color) {
      last.positions.push([b.lat, b.lon]);
    } else {
      segments.push({ color, positions: [[a.lat, a.lon], [b.lat, b.lon]] });
    }
  }

  // Dinamik çizgi kalınlığı: Uzaktayken ince, yakındayken kalın (kesintisiz/smooth geçiş)
  const base = Math.max(1, (zoom - 7) * 0.35 + 1.2);
  const lineWeight = Math.min(5.0, Math.max(1.2, base));
  const shadowWeight = lineWeight + 2.5;

  return (
    <>
      {/* ── Alt Gölge (Yumuşak Dış Hat) ── */}
      <Polyline
        positions={session.filter(p => !isNaN(p.lat)).map(p => [p.lat, p.lon])}
        color="#000"
        weight={shadowWeight}
        opacity={0.3}
        smoothFactor={1.5}
      />
      {/* ── Renkli Hız Çizgileri ── */}
      {segments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg.positions}
          color={seg.color}
          weight={lineWeight}
          opacity={0.9}
          smoothFactor={1}
        />
      ))}
    </>
  );
});


const truckPlayIcon = new L.Icon({
  iconUrl: '/tir-clear.png?v=8',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  className: 'bg-white rounded-full border-2 border-orange-500 shadow-lg object-contain',
});

const DATE_FILTERS = [
  { label: 'Bugün',  days: 1 },
  { label: '7 Gün',  days: 7 },
  { label: '30 Gün', days: 30 },
  { label: 'Tümü',   days: 0 },
];

export default function RouteHistory({
  isVisible,
  onClose,
  deviceMappings,
  trucks,
  historyDate, setHistoryDate,
  activeCompanyId,
  liveLocations = [],
  selectedDriver,
  setSelectedDriver,
}) {
  const map = useMap();
  const { addManualSplit, customRouteNames, setCustomRouteName, geofences, manualSplits, manualMerges, addManualMerge, manualDeletes, addManualDelete } = useContext(DataContext);

  const liveLocationsRef = useRef(liveLocations);
  useEffect(() => {
    liveLocationsRef.current = liveLocations;
  }, [liveLocations]);

  const [selectedSession, setSelectedSession] = useState(null);
  const [isVehicleDropdownOpen, setIsVehicleDropdownOpen] = useState(false);
  const [cachedDates, setCachedDates] = useState([]); // Hangi günlerin Firebase'de verili cache'i var?
  const [emptyCachedDates, setEmptyCachedDates] = useState([]); // Hangi günlerin "Boş" olduğu Firebase'e işlendi?
  const [showSidebar, setShowSidebar]         = useState(true);
  const [calendarMode, setCalendarMode]       = useState('closed'); // 'closed', '7', '21', 'month'
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());
  
  const [editingSessionKey, setEditingSessionKey] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [userInteracted, setUserInteracted] = useState(false);

  // ── On-Demand Caching State ─────────────────────────────────────────
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sessionsByDriver, setSessionsByDriver] = useState({});
  const [fetchError, setFetchError] = useState(null);
  const historyFetchRef = useRef(null);

  // Takvim uzun basma ref'i
  const calendarTimerRef = useRef(null);

  // İlk açılışta veya deviceMappings yüklendiğinde ilk aracı otomatik seç
  useEffect(() => {
    const drivers = Object.keys(deviceMappings);
    if (!selectedDriver && drivers.length > 0) {
      setSelectedDriver(drivers[0]);
    }
  }, [deviceMappings, selectedDriver]);

  // Seçili driver veya tarih değiştiğinde veriyi çek (Önbellekten veya Firebase'den)
  // Hangi günlerin cachelendiğini periyodik olarak veya araç değişince çek
  useEffect(() => {
    if (!isVisible || !selectedDriver || !activeCompanyId) return;
    const q = query(
      collection(db, 'vehicle_daily_stats'),
      where('deviceId', '==', selectedDriver),
      where('companyId', '==', activeCompanyId)
    );
    getDocs(q).then(snap => {
      const full = [];
      const empty = [];
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.sessionsJson === '[]') empty.push(data.date);
        else full.push(data.date);
      });
      setCachedDates([...new Set(full)]);
      setEmptyCachedDates([...new Set(empty)]);
    }).catch(err => console.error("Cache listesi çekilemedi:", err));
  }, [selectedDriver, activeCompanyId, isVisible]);

  useEffect(() => {
    if (!isVisible || !selectedDriver || !historyDate) return;

    if (historyFetchRef.current) historyFetchRef.current = false;
    const fetchId = {};
    historyFetchRef.current = fetchId;
    setHistoryLoading(true);
    setFetchError(null);

    const doFetch = async () => {
      try {
        const snapId = `${activeCompanyId || 'default'}_${selectedDriver}_${historyDate}_v7_${manualSplits?.length || 0}_${manualMerges?.length || 0}_${manualDeletes?.length || 0}`; // _v7 cache
        const cacheRef = doc(db, 'vehicle_daily_stats', snapId);
        
        // 1. ÖNCE ÖNBELLEĞE (CACHE) BAK (Maliyet: 1 Read)
        const cached = await getDoc(cacheRef);
        if (cached.exists() && cached.data().sessionsJson) {
          if (historyFetchRef.current === fetchId) {
            try {
              setSessionsByDriver({ [selectedDriver]: JSON.parse(cached.data().sessionsJson) });
            } catch (e) {
              console.error('Cache parse error:', e);
              setSessionsByDriver({ [selectedDriver]: [] });
            }
            setSelectedSession(null); // Yeni veride seçimi sıfırla
          }
          return;
        }

        // 2. CACHE YOKSA HAM VERİYİ ÇEK VEYA CANLI TAKİPTEN AL
        const todayStr = new Date().toISOString().slice(0, 10);
        const isToday = historyDate === todayStr;
        let points = [];

        // Eğer bugün seçiliyse ve MapLayout'tan liveLocations geldiyse:
        const currentLive = liveLocationsRef.current;
        if (isToday && currentLive && currentLive.length > 0) {
          points = currentLive.filter(loc => 
            (loc.driverId === selectedDriver || loc.deviceId === selectedDriver) &&
            loc.timestamp && loc.timestamp.startsWith(todayStr)
          );
        }

        // Eğer MapLayout'ta veri yoksa veya bugün değilse mecburen Firebase'den çekeceğiz
        if (points.length === 0) {
          // Gece yarısını geçen seferlerin bölünmemesi için zaman penceresini genişletiyoruz:
          // Önceki gün 20:00'den, Ertesi gün 12:00'ye kadar (Toplam 40 Saat)
          const [y, m, d] = historyDate.split('-').map(Number);
          const dayStart = new Date(y, m - 1, d, -4, 0, 0, 0); // Önceki gün 20:00
          const dayEnd   = new Date(y, m - 1, d, 36, 0, 0, 0); // Ertesi gün 12:00

          const buildQuery = (field) => query(
            collection(db, 'truck_routes'),
            where(field, '==', selectedDriver),
            where('timestamp', '>=', dayStart.toISOString()),
            where('timestamp', '<=', dayEnd.toISOString()),
            orderBy('timestamp', 'asc')
          );

          let snap;
          try {
            snap = await getDocs(buildQuery('driverId'));
            if (snap.docs.length === 0) {
              snap = await getDocs(buildQuery('deviceId'));
            }
            if (historyFetchRef.current !== fetchId) return;
            points = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          } catch (e) {
            console.error('Veri çekme hatası (Index eksik olabilir):', e);
            if (e.message?.includes('index')) {
              setFetchError('Firebase Composite Index eksik. Konsoldaki linke tıklayıp oluşturun.');
            } else {
              setFetchError('Veri alınamadı.');
            }
            if (historyFetchRef.current === fetchId) setSessionsByDriver({ [selectedDriver]: [] });
            return;
          }
        }
        
        // 3. VERİYİ SIKIŞTIR VE SEFERLERE BÖL
        // Tolerans tekrar 30 dakikaya çekildi, ancak manuel birleştirmeler eklendi.
        const rawSessions = groupIntoSessions(points, 30, geofences, manualSplits || [], manualMerges || []);
        
        // SADECE BAŞLANGIÇ TARİHİ SEÇİLİ GÜN OLANLARI FİLTRELE VE SİLİNENLERİ ÇIKAR
        // Böylece 12'sinde gece başlayıp 13'ünde biten sefer sadece 12'sine ait olur.
        const pad = n => n.toString().padStart(2, '0');
        const getLocalYYYYMMDD = (dateObj) => `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
        
        const validSessions = rawSessions.filter(session => {
          if (!session || session.length === 0) return false;
          
          // Silinmiş mi kontrol et
          if (manualDeletes?.includes(session[0].timestamp)) return false;

          const sessionStartDate = getLocalYYYYMMDD(new Date(session[0].timestamp));
          return sessionStartDate === historyDate;
        });

        // 1MB Firestore sınırını aşmamak için "Dinamik Sıkıştırma Algoritması"

        let lightweightSessions = [];
        let jsonString = "";

        if (isToday) {
          // Bugünün verisi cache'lenmeyeceği için ağır sıkıştırma ve döngüye gerek yok!
          const optimized = validSessions.map(session => filterSessionPoints(session, 0.05));
          lightweightSessions = optimized.map(session => 
            session.map(pt => ({
              lat: Number(Number(pt.lat).toFixed(5)), // 1 metre hassasiyet
              lon: Number(Number(pt.lon).toFixed(5)),
              timestamp: pt.timestamp,
              speed: pt.speed || 0
            }))
          );
        } else {
          let currentCompression = 0.05; // 50 metreden başla (En Yüksek Kalite)
          
          // Veri 900 KB'ın altına inene kadar sıkıştırma toleransını artır
          while (currentCompression <= 0.5) {
             const optimized = validSessions.map(session => filterSessionPoints(session, currentCompression));
             
             lightweightSessions = optimized.map(session => 
               session.map(pt => ({
                 lat: Number(Number(pt.lat).toFixed(5)),
                 lon: Number(Number(pt.lon).toFixed(5)),
                 timestamp: pt.timestamp,
                 speed: pt.speed || 0
               }))
             );
             
             jsonString = JSON.stringify(lightweightSessions);
             
             if (jsonString.length < 900000) { 
                 break;
             }
             // Sığmadıysa kaliteyi 50 metre daha düşür ve tekrar dene
             currentCompression += 0.05; 
          }
        }

        setSessionsByDriver({ [selectedDriver]: lightweightSessions });
        setSelectedSession(null);

        // 4. SONUÇLARI ÖNBELLEĞE KAYDET
        // Boş günleri de kaydediyoruz (length >= 0) ki her seferinde tekrar hesaplamasın.
        if (!isToday) {
           await setDoc(cacheRef, {
             deviceId: selectedDriver,
             date: historyDate,
             companyId: activeCompanyId || 'default',
             sessionsJson: jsonString, // Garantili boyuttaki JSON
             calculatedAt: new Date().toISOString()
           }, { merge: true });
        }

      } catch (err) {
        console.error('Genel fetch hatası:', err);
        if (historyFetchRef.current === fetchId) setFetchError('Bir hata oluştu.');
      } finally {
        if (historyFetchRef.current === fetchId) setHistoryLoading(false);
      }
    };
    
    doFetch();
  }, [isVisible, selectedDriver, historyDate, activeCompanyId, geofences, manualSplits?.length, manualMerges?.length, manualDeletes?.length]);

  // Yeni veri gelince en güncel seferi otomatik seç veya seçili oturumu güncelle (ezmeden)
  useEffect(() => {
    if (!selectedDriver) return;
    const driverSessions = sessionsByDriver[selectedDriver] || [];
    if (driverSessions.length === 0) {
      setSelectedSession(null);
      return;
    }

    if (selectedSession) {
      // Halihazırda bir oturum seçili. Yeni veri gelince bu oturumun güncel halini bulalım (timestamp ile eşleştirerek)
      const currentStartTs = selectedSession[0]?.timestamp;
      const updated = driverSessions.find(s => s[0]?.timestamp === currentStartTs);
      if (updated) {
        // Oturumu güncelle ama progress/isPlaying durumuna dokunma!
        setSelectedSession(updated);
      } else {
        // Eğer seçili oturum artık yoksa (silinmiş veya başka bir gün), son oturumu seç
        setSelectedSession(driverSessions[driverSessions.length - 1]);
        setProgress(0);
        setIsPlaying(false);
      }
    } else {
      // İlk defa veri yükleniyor, son oturumu otomatik seç
      setSelectedSession(driverSessions[driverSessions.length - 1]);
      setProgress(0);
      setIsPlaying(false);
    }
  }, [sessionsByDriver, selectedDriver, selectedSession]);

  // Harita ile kullanıcı etkileşimini dinle
  useEffect(() => {
    if (!map) return;
    const handleInteract = () => setUserInteracted(true);
    map.on('dragstart', handleInteract);
    map.on('zoomstart', handleInteract);
    return () => {
      map.off('dragstart', handleInteract);
      map.off('zoomstart', handleInteract);
    };
  }, [map]);



  // Harita etkileşimini sidebar üzerinde engelle
  const sidebarCallbackRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  // Oynatıcı çubuğu için koruma
  const playerCallbackRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  // Liste scroll — callback ref: element mount olunca event listener ekle
  const listCallbackRef = useCallback((el) => {
    if (!el) return;
    // Smooth scroll
    el.style.scrollBehavior = 'smooth';
    const onWheel = (e) => {
      e.stopPropagation();
      e.preventDefault();
      el.scrollBy({ top: e.deltaY, behavior: 'smooth' });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
  }, []);



  // Save modal için tıklama ve scroll engelleme (Leaflet sızıntılarını engeller)
  const saveModalRef = useCallback((el) => {
    if (el) {
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
    }
  }, []);


  // Oynatma
  const [progress, setProgress]               = useState(0);
  const [isPlaying, setIsPlaying]             = useState(false);
  const [playbackSpeed, setPlaybackSpeed]     = useState(1);
  
  // Play'e basılınca auto-pan tekrar aktif olsun
  useEffect(() => {
    if (isPlaying) setUserInteracted(false);
  }, [isPlaying]);
  
  const [interpolatedData, setInterpolatedData] = useState(null);
  const playIntervalRef = useRef(null);

  // Kaydetme
  const { addSavedTrackingRoute, trips, savedTrackingRoutes, routes } = React.useContext(DataContext);
  const [savingSession, setSavingSession] = useState(null);
  const [saveFrom, setSaveFrom]           = useState('');
  const [saveTo, setSaveTo]               = useState('');
  const [saveName, setSaveName]           = useState('');
  const [saveTripId, setSaveTripId]       = useState('');
  const [saveDropdownOpen, setSaveDropdownOpen] = useState(false);

  const openSaveModal = (session) => {
    const startPt = session[0];
    const endPt = session[session.length - 1];
    const startG = geofences?.find(g => haversineKm(startPt.lat, startPt.lon, g.lat, g.lon) <= (g.radiusKm || 1.0));
    const endG = geofences?.find(g => haversineKm(endPt.lat, endPt.lon, g.lat, g.lon) <= (g.radiusKm || 1.0));
    setSaveFrom(startG ? startG.name : '');
    setSaveTo(endG ? endG.name : '');
    setSaveName(customRouteNames[session[0].timestamp] || '');
    setSaveTripId('');
    setSaveDropdownOpen(false);
    setSavingSession({ session, driver: selectedDriver });
  };

  const getDisplayName = (deviceId) => {
    const m = deviceMappings[deviceId];
    if (!m) return deviceId;
    const truck = trucks.find(t => t.id === m.truckId);
    return [m.driverName, truck?.plate].filter(Boolean).join(' - ') || deviceId;
  };

  // Rota seçilince haritayı sığdır — animasyonla
  useEffect(() => {
    if (!isVisible) return;
    if (selectedSession && selectedSession.length > 0 && map) {
      const validPoints = selectedSession.filter(p => !isNaN(p.lat) && !isNaN(p.lon));
      if (validPoints.length === 0) return;
      const bounds = L.latLngBounds(validPoints.map(p => [p.lat, p.lon]));
      map.fitBounds(bounds, { 
        paddingTopLeft: [380, 60], 
        paddingBottomRight: [60, 60], 
        maxZoom: 14 
      });
      setProgress(0);
      setIsPlaying(false);
      setInterpolatedData(getInterpolatedPointLinear(selectedSession, 0));
    } else {
      setInterpolatedData(null);
      setIsPlaying(false);
    }
  }, [selectedSession, map, isVisible]);

  const lastPanRef = useRef(0);

  // İnterpolasyon güncelle & Auto-Pan (Sınır bazlı pürüzsüz takip)
  useEffect(() => {
    if (selectedSession) {
      const point = getInterpolatedPointLinear(selectedSession, progress);
      setInterpolatedData(point);
      
      if (isPlaying && point && map && !userInteracted) {
        const now = Date.now();
        if (now - lastPanRef.current > 500) { // Her 500ms'de bir kontrol et
          const pt = map.latLngToContainerPoint([point.lat, point.lon]);
          const size = map.getSize();
          // Ekranın %30 - %70 sınırlarının dışına çıkarsa kamerayı araca kaydır
          if (pt.x < size.x * 0.3 || pt.x > size.x * 0.7 || pt.y < size.y * 0.3 || pt.y > size.y * 0.7) {
            map.panTo([point.lat, point.lon], { animate: true, duration: 0.6 });
            lastPanRef.current = now;
          }
        }
      }
    }
  }, [progress, selectedSession, isPlaying, userInteracted, map]);

  // Oynatıcı tamamlanma eylemini ayrı bir useEffect ile takip ediyoruz
  useEffect(() => {
    if (progress >= 100 && isPlaying) {
      setIsPlaying(false);
    }
  }, [progress, isPlaying]);

  // Oynat / Durdur
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) return 100;
          return prev + 0.005 * playbackSpeed;
        });
      }, 50);
    } else {
      clearInterval(playIntervalRef.current);
    }
    return () => clearInterval(playIntervalRef.current);
  }, [isPlaying, playbackSpeed]);

  const handleSaveRoute = async () => {
    if (!savingSession) return;
    const from = saveFrom.trim();
    const to   = saveTo.trim();
    if (!from || !to) {
      alert('Lütfen Nereden ve Nereye alanlarını doldurun.');
      return;
    }
    const { km } = calcStats(savingSession.session);
    const finalName = saveName.trim() || `${from} → ${to}`;
    try {
      await addSavedTrackingRoute({
        name: finalName,
        from,
        to,
        km,
        startPoint: { lat: savingSession.session[0].lat, lon: savingSession.session[0].lon },
        endPoint: { lat: savingSession.session[savingSession.session.length - 1].lat, lon: savingSession.session[savingSession.session.length - 1].lon },
        path: savingSession.session.filter(p => !isNaN(p.lat)).map(p => ({ lat: p.lat, lon: p.lon })),
      });
      setSavingSession(null);
      setSaveFrom('');
      setSaveTo('');
      setSaveName('');
      setSaveTripId('');
      setSaveDropdownOpen(false);
    } catch (err) {
      console.error('Rota kaydetme hatası:', err);
      alert('Kaydetme sırasında hata oluştu: ' + err.message);
    }
  };

  // if (!isVisible) return null; // ARTIK UNMOUNT ETMİYORUZ

  return (
    <>
      {/* ── Harita Katmanları ── */}
      {isVisible && selectedSession && (
        <>
          <SpeedPolylines session={selectedSession} />
          {interpolatedData && (
            <Marker position={[interpolatedData.lat, interpolatedData.lon]} icon={truckPlayIcon} zIndexOffset={1000}>
              <Tooltip permanent direction="top" className="play-tooltip" offset={[0, -35]}>
                <div className="text-center">
                  <div className="text-sm font-bold text-sky-400">{Math.round((interpolatedData.speed || 0) * 3.6)} km/h</div>
                  <div className="text-[10px] text-slate-400 font-medium">{new Date(interpolatedData.timestamp).toLocaleTimeString('tr-TR')}</div>
                </div>
              </Tooltip>
            </Marker>
          )}
        </>
      )}

      {/* ── Sidebar ── */}
      <AnimatePresence>
        {isVisible && showSidebar && (
          <motion.div
            ref={sidebarCallbackRef}
            initial={{ x: -10, opacity: 0, scale: 0.99, filter: 'blur(4px)' }}
            animate={{ x: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ x: -10, opacity: 0, scale: 0.99, filter: 'blur(4px)' }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="absolute top-[76px] left-4 bottom-4 w-[300px] z-[1500] flex flex-col rounded-3xl"
            style={{
              background: 'rgba(13,18,25,0.97)',
              border: '1px solid rgba(255,255,255,0.04)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.03)',
              backdropFilter: 'blur(24px)',
            }}
          >
        {/* Başlık */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-white/[0.05]">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock size={15} className="text-orange-400" />
            Rota Geçmişi
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-xl transition-all"
          >
            <X size={13} />
          </button>
        </div>

        {/* ── Yeni Akıllı Tarih Filtresi ──────────────────────────────────── */}
        <div className="px-4 py-3 border-b border-white/[0.05] space-y-2">

          {/* Ana iki buton satırı (Bugün & Geçmiş) */}
          <div className="flex backdrop-blur-xl p-1 rounded-xl items-center gap-0.5" style={{ background: 'rgba(13,18,25,0.6)', border: '1px solid rgba(255,255,255,0.05)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
            
            {/* Bugün */}
            {(() => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const isActive = historyDate === todayStr && calendarMode === 'closed';
              return (
                <button
                  onClick={() => { setHistoryDate(todayStr); setCalendarMode('closed'); }}
                  className={`relative flex-1 flex items-center justify-center py-1.5 px-2 rounded-xl text-[11px] font-medium transition-colors duration-300 outline-none group ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {!isActive && (
                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.04] rounded-xl transition-colors duration-300" />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="history-tab-pill"
                      className="absolute inset-0 bg-gradient-to-b from-orange-500 to-orange-600 rounded-xl border border-orange-400/30 shadow-[0_2px_12px_rgba(245,158,11,0.35)]"
                      style={{ zIndex: 0 }}
                      initial={false}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10 drop-shadow-sm">Bugün</span>
                </button>
              );
            })()}

            {/* Geçmiş */}
            {(() => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const isPanelOpen = calendarMode !== 'closed';
              const isActive = historyDate !== todayStr || isPanelOpen;
              
              const label = (historyDate !== todayStr && !isPanelOpen)
                ? new Date(historyDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
                : 'Geçmiş';

              // Chevron logic
              let showChevron = isActive; // Aktif değilse (sadece bugün seçiliyse) gösterme
              let chevronDirection = '';
              if (calendarMode === '7') {
                chevronDirection = ''; // aşağı (genişleme simgesi)
              } else if (calendarMode === '21') {
                chevronDirection = 'rotate-180'; // yukarı (küçültme simgesi)
              } else if (calendarMode === 'month') {
                chevronDirection = 'rotate-180'; 
              } else if (historyDate !== todayStr) {
                chevronDirection = ''; // geçmişten biri seçili, basınca 7 gün açılacak
              }

              // Uzun basma (Long Press) mantığı
              const handlePointerDown = () => {
                calendarTimerRef.current = setTimeout(() => {
                  setCalendarMode('month');
                  calendarTimerRef.current = null;
                }, 3000);
              };
              const handlePointerUp = () => {
                if (calendarTimerRef.current) {
                  clearTimeout(calendarTimerRef.current);
                  calendarTimerRef.current = null;
                  // Kısa tıklama mantığı:
                  if (calendarMode === 'closed') setCalendarMode('7');
                  else if (calendarMode === '7') setCalendarMode('21'); // Genişlet
                  else if (calendarMode === '21') setCalendarMode('7'); // Küçült
                  else setCalendarMode('closed');
                }
              };
              const handlePointerLeave = () => {
                if (calendarTimerRef.current) {
                  clearTimeout(calendarTimerRef.current);
                  calendarTimerRef.current = null;
                }
              };

              return (
                <button
                  onPointerDown={handlePointerDown}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerLeave}
                  className={`relative flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11px] font-medium transition-colors duration-300 outline-none group select-none ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {!isActive && (
                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.04] rounded-xl transition-colors duration-300" />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="history-tab-pill"
                      className="absolute inset-0 bg-gradient-to-b from-orange-500 to-orange-600 rounded-xl border border-orange-400/30 shadow-[0_2px_12px_rgba(245,158,11,0.35)]"
                      style={{ zIndex: 0 }}
                      initial={false}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  {isPanelOpen && (
                    <div className="absolute inset-0 bg-white/[0.06] rounded-xl -z-10" />
                  )}
                  <span className="relative z-10 drop-shadow-sm flex items-center justify-center gap-1">
                    {label}
                    {showChevron && (
                      <ChevronDown size={12} className={`transition-transform duration-300 ${chevronDirection}`} />
                    )}
                  </span>
                </button>
              );
            })()}
          </div>

          {/* ─── BİRLEŞTİRİLMİŞ TAKVİM PANELİ ─── */}
          <AnimatePresence>
            {calendarMode !== 'closed' && (
              <motion.div
                layout
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.7 }}
                className="overflow-hidden bg-[#0F1219] border border-white/[0.08] rounded-2xl shadow-2xl mt-2 relative z-50"
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {calendarMode === '7' || calendarMode === '21' ? (
                    // --- 7 veya 21 GÜNLÜK GÖRÜNÜM ---
                    <motion.div 
                      key="grid-view"
                      initial={{ opacity: 0, filter: 'blur(4px)' }} 
                      animate={{ opacity: 1, filter: 'blur(0px)' }} 
                      exit={{ opacity: 0, filter: 'blur(4px)' }}
                      transition={{ duration: 0.2 }}
                      className="p-1.5"
                    >
                      <div className="grid grid-cols-7 gap-0.5">
                        {Array.from({ length: calendarMode === '7' ? 7 : 21 }, (_, i) => {
                          const max = calendarMode === '7' ? 6 : 20;
                          const d = new Date();
                          d.setDate(d.getDate() - (max - i)); // Geçmişe dönük
                          const dateStr = d.toISOString().slice(0, 10);
                          const isSelected = historyDate === dateStr;
                          const dayNames = ['Pz', 'Pt', 'Sa', 'Çr', 'Pe', 'Cu', 'Ct'];
                          const dayName = dayNames[d.getDay()];
                          const dayNum = d.getDate();
                          const isFullCached = cachedDates.includes(dateStr);
                          const isEmptyCached = emptyCachedDates.includes(dateStr);
                          return (
                            <button
                              key={dateStr}
                              onClick={() => {
                                setHistoryDate(dateStr);
                                setCalendarMode('closed');
                              }}
                              className={`relative flex flex-col items-center py-1.5 rounded-xl transition-all duration-150 border border-transparent ${
                                isSelected
                                  ? 'bg-orange-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.4)]'
                                  : 'hover:bg-white/[0.06] text-slate-400 hover:text-white'
                              } ${isFullCached && !isSelected ? 'bg-orange-500/10 shadow-[inset_0_0_8px_rgba(245,158,11,0.1)]' : ''} ${isEmptyCached && !isSelected ? 'bg-orange-500/15 shadow-[inset_0_0_8px_rgba(249,115,22,0.1)]' : ''}`}
                            >
                              <span className="text-[9px] font-medium opacity-70">{dayName}</span>
                              <span className="text-[13px] font-bold mt-0.5">{dayNum}</span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : calendarMode === 'month' ? (
                    // --- TÜM AY GÖRÜNÜMÜ ---
                    <motion.div 
                      key="month"
                      initial={{ opacity: 0, filter: 'blur(4px)' }} 
                      animate={{ opacity: 1, filter: 'blur(0px)' }} 
                      exit={{ opacity: 0, filter: 'blur(4px)' }}
                      transition={{ duration: 0.2 }}
                      className="p-1.5 pt-2"
                    >
                      <div className="flex items-center justify-between mb-2 px-2">
                        <button onClick={() => setCalendarViewDate(new Date(calendarViewDate.setMonth(calendarViewDate.getMonth() - 1)))} className="p-1 hover:bg-white/5 rounded-lg transition-colors"><ChevronLeft size={16} className="text-slate-400"/></button>
                        <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
                          {calendarViewDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                        </span>
                        <button onClick={() => setCalendarViewDate(new Date(calendarViewDate.setMonth(calendarViewDate.getMonth() + 1)))} className="p-1 hover:bg-white/5 rounded-lg transition-colors"><ChevronRight size={16} className="text-slate-400"/></button>
                      </div>

                      <div className="grid grid-cols-7 gap-0.5">
                        {(() => {
                          const year = calendarViewDate.getFullYear();
                          const month = calendarViewDate.getMonth();
                          const firstDay = new Date(year, month, 1).getDay();
                          const adjFirstDay = firstDay === 0 ? 6 : firstDay - 1;
                          const daysInMonth = new Date(year, month + 1, 0).getDate();
                          
                          const days = [];
                          for(let i=0; i<adjFirstDay; i++) days.push(<div key={`pad-${i}`} />);
                          
                          for(let day=1; day<=daysInMonth; day++) {
                            const dObj = new Date(year, month, day);
                            const dStr = dObj.toISOString().slice(0, 10);
                            const isSelected = historyDate === dStr;
                            const dayNames = ['Pz', 'Pt', 'Sa', 'Çr', 'Pe', 'Cu', 'Ct'];
                            const dayName = dayNames[dObj.getDay()];
                            const isFullCached = cachedDates.includes(dStr);
                            const isEmptyCached = emptyCachedDates.includes(dStr);
                            
                            days.push(
                              <button
                                key={day}
                                onClick={() => { setHistoryDate(dStr); setCalendarMode('closed'); }}
                                className={`relative flex flex-col items-center py-1.5 rounded-xl transition-all duration-150 border border-transparent ${
                                  isSelected
                                    ? 'bg-orange-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.4)]'
                                    : 'hover:bg-white/[0.06] text-slate-400 hover:text-white'
                                } ${isFullCached && !isSelected ? 'bg-orange-500/10 shadow-[inset_0_0_8px_rgba(245,158,11,0.1)]' : ''} ${isEmptyCached && !isSelected ? 'bg-orange-500/15 shadow-[inset_0_0_8px_rgba(249,115,22,0.1)]' : ''}`}
                              >
                                <span className="text-[9px] font-medium opacity-70">{dayName}</span>
                                <span className="text-[13px] font-bold mt-0.5">{day}</span>
                              </button>
                            );
                          }
                          return days;
                        })()}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>


        {/* Araç Seçici (Dropdown) */}
        <div className="px-3 pb-3">
          <button 
            onClick={() => setIsVehicleDropdownOpen(!isVehicleDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.07] transition-all duration-200"
          >
            <span className="text-[11.5px] font-semibold text-slate-300 truncate">
              {selectedDriver ? getDisplayName(selectedDriver) : 'Yükleniyor...'}
            </span>
            <motion.div
              animate={{ rotate: isVehicleDropdownOpen ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="flex-shrink-0 ml-2"
            >
              <ChevronDown size={13} className="text-slate-500" />
            </motion.div>
          </button>

          {/* Açılır Menü */}
          <AnimatePresence>
            {isVehicleDropdownOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0, y: -4 }}
                animate={{ height: 'auto', opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
                className="overflow-hidden mt-1"
              >
                <div className="rounded-xl overflow-hidden border border-white/[0.04] bg-white/[0.02]">
                  {Object.keys(deviceMappings).map((driver) => {
                    return (
                      <button
                        key={driver}
                        onClick={() => { 
                          setSelectedDriver(driver); 
                          setIsVehicleDropdownOpen(false); 
                        }}
                        className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between border-b border-white/[0.04] last:border-0 transition-all duration-150 ${
                          selectedDriver === driver
                            ? 'bg-orange-500/[0.12]'
                            : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className={`text-[11px] font-semibold ${
                          selectedDriver === driver ? 'text-orange-300' : 'text-slate-400'
                        }`}>
                          {getDisplayName(driver)}
                        </span>
                      </button>
                    );
                  })}
                  {Object.keys(deviceMappings).length === 0 && (
                    <div className="px-4 py-3 text-[11px] text-slate-600">Araç bulunamadı</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Seçili Aracın Rotaları */}
        <div ref={listCallbackRef} className="flex-1 overflow-y-auto px-3 pb-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', minHeight: '300px' }}>

          {/* Yükleniyor */}
          {historyLoading && (
            <div className="flex flex-col items-center justify-center mt-12 gap-3">
              <Loader2 size={22} className="text-orange-400 animate-spin" />
              <p className="text-xs text-slate-500">Önbellek kontrol ediliyor...</p>
            </div>
          )}

          {/* Hata Durumu */}
          {fetchError && !historyLoading && (
            <div className="mx-2 mt-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
              <p className="text-[11px] text-rose-400 leading-relaxed text-center">{fetchError}</p>
            </div>
          )}

          {/* Araç seçilmedi veya veri yok */}
          {!historyLoading && !fetchError && selectedDriver && (!sessionsByDriver[selectedDriver] || sessionsByDriver[selectedDriver].length === 0) && (
            <div className="flex flex-col items-center justify-center mt-12 gap-2">
              <p className="text-xs text-slate-600 text-center px-4">Bu tarih aralığında kayıtlı veri bulunamadı.</p>
            </div>
          )}

          {/* Rota listesi */}
          {!historyLoading && selectedDriver && sessionsByDriver[selectedDriver]?.length > 0 && (
            <div className="space-y-1.5">
              {[...sessionsByDriver[selectedDriver]].reverse().map((session, i) => {
                const totalSessions = sessionsByDriver[selectedDriver].length;
                const start = new Date(session[0]?.timestamp);
                const isSelected = selectedSession === session;
                const { km, durationMin } = calcStats(session);

                // Kısa rotaları gizle kuralı (5 km altı veya 5 dk altı)
                if (parseFloat(km) < 5 || parseInt(durationMin) < 5) return null;

                return (
                  <React.Fragment key={i}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedSession(isSelected ? null : session)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedSession(isSelected ? null : session) }}
                      className={`w-full text-left px-3 py-3 rounded-xl border transition-all duration-200 relative overflow-hidden cursor-pointer outline-none ${
                        isSelected
                          ? 'bg-orange-500/10 border-orange-500/25 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.2)]'
                          : 'bg-white/[0.02] border-white/[0.04] hover:border-white/[0.09] hover:bg-white/[0.04]'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-orange-500 rounded-full" />
                      )}
                      <div className="flex justify-between items-center mb-2.5 pl-2">
                        {/* Sol: sefer adı + tarih */}
                        <div className="flex items-center gap-2 flex-1">
                          {editingSessionKey === session[0].timestamp ? (
                            <motion.div
                              key="edit-row"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                              className="flex items-center justify-between gap-1 w-full"
                              onClick={e => e.stopPropagation()}
                            >
                              <input 
                                autoFocus
                                value={editNameValue}
                                onChange={e => setEditNameValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { setCustomRouteName(session[0].timestamp, editNameValue); setEditingSessionKey(null); } }}
                                className="bg-[#0B0E14] border border-orange-500/50 rounded-md px-1.5 py-1 text-[11px] text-white outline-none w-[70px] min-w-[70px]"
                                placeholder={`Sefer ${totalSessions - i}`}
                              />
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const ts = interpolatedData?.timestamp ?? session[Math.floor(session.length / 2)]?.timestamp;
                                    if (ts) addManualSplit(ts, selectedDriver);
                                    setEditingSessionKey(null);
                                  }}
                                  className="text-rose-400 p-1 hover:bg-rose-400/10 rounded-md transition-colors"
                                  title="Rotayı Buradan Böl"
                                >
                                  <Scissors size={13} />
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (session[0]?.timestamp) addManualMerge(session[0].timestamp, selectedDriver);
                                    setEditingSessionKey(null);
                                  }}
                                  className="text-orange-400 p-1 hover:bg-orange-400/10 rounded-md transition-colors"
                                  title="Önceki Seferle Birleştir"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (session[0]?.timestamp) addManualDelete(session[0].timestamp, selectedDriver);
                                    setEditingSessionKey(null);
                                  }}
                                  className="text-red-500 p-1 hover:bg-red-500/10 rounded-md transition-colors"
                                  title="Seferi Sil (Gizle)"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                </button>
                                <button 
                                  onClick={async (e) => { e.stopPropagation(); await setCustomRouteName(session[0].timestamp, editNameValue); setEditingSessionKey(null); }}
                                  className="text-emerald-400 p-1 hover:bg-emerald-400/10 rounded-md transition-colors"
                                  title="İsmi Kaydet"
                                >
                                  <Check size={13} />
                                </button>
                              </div>
                            </motion.div>
                          ) : (
                            <>
                              <span className={`text-xs font-bold ${isSelected ? 'text-orange-400' : 'text-slate-300'}`}>
                                {customRouteNames[session[0].timestamp] || `Sefer ${totalSessions - i}`}
                              </span>
                              <span className="text-[10px] text-slate-600 font-medium">
                                {start.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                              </span>
                            </>
                          )}
                        </div>
                        {/* Sağ: kaydet ve kalem ikonu (sadece seçiliyken) */}
                        {isSelected && editingSessionKey !== session[0].timestamp && (
                          <div className="flex items-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); openSaveModal(session); }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-orange-400 hover:bg-orange-500/10 transition-all flex-shrink-0"
                              title="Rotayı Kaydet"
                            >
                              <BookmarkPlus size={14} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditNameValue(customRouteNames[session[0].timestamp] || `Sefer ${totalSessions - i}`); setEditingSessionKey(session[0].timestamp); }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-orange-400 hover:bg-white/[0.05] transition-all flex-shrink-0"
                              title="İsmi Düzenle"
                            >
                              <Edit2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1.5 pl-2">
                        <span className="px-2 py-0.5 bg-white/[0.05] rounded-lg text-[10px] text-slate-400 font-semibold border border-white/[0.05]">
                          {km} km
                        </span>
                        <span className="px-2 py-0.5 bg-white/[0.05] rounded-lg text-[10px] text-slate-400 font-semibold border border-white/[0.05]">
                          {formatDuration(durationMin)}
                        </span>
                        <span className="px-2 py-0.5 bg-white/[0.05] rounded-lg text-[10px] text-slate-500 font-medium border border-white/[0.05]">
                          {start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>


                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Sidebar kapalıyken aç butonu */}
      <AnimatePresence>
        {isVisible && !showSidebar && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setShowSidebar(true)}
            className="absolute left-4 top-[76px] z-[1500] p-3.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-2xl border border-orange-500/20 transition-all backdrop-blur-md"
          >
            <Clock size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Alt Oynatma Çubuğu ── */}
      <AnimatePresence>
        {isVisible && selectedSession && (
          <motion.div 
            ref={playerCallbackRef}
            initial={{ y: 20, opacity: 0, x: '-50%', scale: 0.96, filter: 'blur(8px)' }}
            animate={{ y: 0, opacity: 1, x: '-50%', scale: 1, filter: 'blur(0px)' }}
            exit={{ y: 20, opacity: 0, x: '-50%', scale: 0.96, filter: 'blur(8px)' }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="absolute bottom-6 z-[2000] w-11/12 max-w-[420px] pointer-events-auto transition-all duration-300 ease-out"
            style={{ left: showSidebar ? 'calc(50% + 158px)' : '50%' }}
          >
          <div
            className="px-4 py-3 rounded-3xl flex items-center gap-4"
            style={{ background: 'rgba(13,18,25,0.97)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 12px 40px rgba(0,0,0,0.8)', backdropFilter: 'blur(24px)' }}
          >
            {/* Play / Pause */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-11 h-11 rounded-full bg-orange-500 flex items-center justify-center text-white hover:bg-orange-600 active:scale-95 transition-all flex-shrink-0"
            >
              {isPlaying
                ? <Pause fill="currentColor" size={18} />
                : <Play fill="currentColor" className="ml-0.5" size={18} />}
            </button>

            {/* Hız Çarpanı */}
            <button
              onClick={() => {
                setPlaybackSpeed(prev => {
                  if (prev === 1) return 2;
                  if (prev === 2) return 5;
                  if (prev === 5) return 10;
                  return 1;
                });
              }}
              className="px-2.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.06] text-[10px] font-extrabold text-orange-400 transition-all flex-shrink-0 cursor-pointer animate-none"
              title="Oynatma Hızı"
            >
              {playbackSpeed}x
            </button>

            {/* Slider */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-[10px] font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                <span>{new Date(selectedSession[0].timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                {interpolatedData && (
                  <span className="text-orange-400 px-2 py-0.5 bg-orange-500/10 rounded-full border border-orange-500/15">
                    {Math.round((interpolatedData.speed || 0) * 3.6)} km/h
                  </span>
                )}
                <span>{new Date(selectedSession[selectedSession.length - 1].timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>

              <div className="relative">
                <input
                  type="range"
                  min="0" max="100" step="0.1"
                  value={progress}
                  onInput={e => { setIsPlaying(false); setProgress(parseFloat(e.target.value)); }}
                  onChange={e => { setIsPlaying(false); setProgress(parseFloat(e.target.value)); }}
                  className="w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #f97316 ${progress}%, rgba(255,255,255,0.08) ${progress}%)`,
                  }}
                />
                <style>{`
                  input[type='range']::-webkit-slider-thumb {
                    -webkit-appearance: none; appearance: none;
                    width: 16px; height: 16px; border-radius: 50%;
                    background: #fff; border: 2.5px solid #f97316;
                    cursor: pointer; transition: transform 0.15s;
                  }
                  input[type='range']::-webkit-slider-thumb:hover { transform: scale(1.25); }
                  
                  .play-tooltip {
                    background: rgba(13, 18, 25, 0.95) !important;
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                    border-radius: 12px !important;
                    padding: 6px 12px !important;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
                    backdrop-filter: blur(8px) !important;
                  }
                  .play-tooltip::before {
                    border-top-color: rgba(13, 18, 25, 0.95) !important;
                  }
                `}</style>
              </div>
            </div>

            {/* Kapat */}
            <button
              onClick={() => setSelectedSession(null)}
              className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/[0.12] transition-all flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── Kaydetme Modalı ── */}
      {savingSession && (
        <div
          ref={saveModalRef}
          className="fixed inset-0 z-[3500] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
          onClick={() => setSaveDropdownOpen(false)}>
          <div
            className="rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            style={{ background: 'rgba(13,18,25,0.98)', border: '1px solid rgba(255,255,255,0.06)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Başlık */}
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-base flex items-center gap-2">
                <BookmarkPlus size={17} className="text-orange-400" /> Rotayı Kaydet
              </h3>
              <button
                onClick={() => { setSavingSession(null); setSaveDropdownOpen(false); }}
                className="text-slate-600 hover:text-white p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Kayıtlı Rota Dropdown */}
              <div className="relative">
                <label className="text-[11px] text-slate-500 mb-1.5 block font-semibold uppercase tracking-wider">Rotadan Doldur (Opsiyonel)</label>
                <button
                  type="button"
                  onClick={() => setSaveDropdownOpen(v => !v)}
                  className="w-full flex items-center justify-between bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2.5 text-sm hover:border-orange-500/40 transition-colors"
                >
                  <span className={saveTripId ? 'text-white' : 'text-slate-500'}>
                    {saveTripId
                      ? (() => {
                          const all = [...(routes||[]), ...(savedTrackingRoutes||[]), ...(trips||[])];
                          const r = all.find(x => String(x.id) === saveTripId);
                          return r ? `${r.from} → ${r.to}` : '— Seç —';
                        })()
                      : '— Seçmeden Devam Et —'}
                  </span>
                  <ChevronDown size={14} className={`text-slate-500 transition-transform ${saveDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {saveDropdownOpen && (
                  <div
                    className="absolute left-0 right-0 top-full mt-1 z-20 rounded-2xl overflow-hidden shadow-2xl"
                    style={{ background: 'rgba(13,18,25,0.99)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <div className="max-h-56 overflow-y-auto" onWheel={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => { setSaveTripId(''); setSaveDropdownOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-xs text-slate-500 hover:bg-white/[0.06] hover:text-white transition-colors border-b border-white/[0.04]"
                      >
                        — Seçmeden Devam Et —
                      </button>
                      {[...(routes||[]), ...(savedTrackingRoutes||[]), ...(trips||[])]
                        .filter(r => r.from && r.to)
                        .map(r => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setSaveTripId(String(r.id));
                              setSaveFrom(r.from || '');
                              setSaveTo(r.to || '');
                              setSaveName(r.name || `${r.from} → ${r.to}`);
                              setSaveDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-xs transition-colors hover:bg-white/[0.06] border-b border-white/[0.03] ${
                              saveTripId === String(r.id) ? 'bg-orange-500/15 text-orange-400' : 'text-slate-300'
                            }`}
                          >
                            <span className="font-semibold">{r.from} → {r.to}</span>
                            {r.km && <span className="text-slate-600 ml-2">{r.km} km</span>}
                            {r.date && <span className="text-slate-700 ml-2">{r.date}</span>}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Rota Adı */}
              <div>
                <label className="text-[11px] text-slate-500 mb-1.5 block font-semibold uppercase tracking-wider">Rota Adı</label>
                <input
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="Örn: Çayırhan → Baştaş"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                />
              </div>

              {/* Nereden / Nereye */}
              {[
                { label: 'Nereden', value: saveFrom, set: setSaveFrom, placeholder: 'Örn: Ankara' },
                { label: 'Nereye',  value: saveTo,   set: setSaveTo,   placeholder: 'Örn: İstanbul' },
              ].map(field => (
                <div key={field.label}>
                  <label className="text-[11px] text-slate-500 mb-1.5 block font-semibold uppercase tracking-wider">{field.label}</label>
                  <input
                    value={field.value}
                    onChange={e => field.set(e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                  />
                </div>
              ))}

              <button
                onClick={handleSaveRoute}
                className="w-full py-3 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-500/20 mt-1"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Polyline, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ChevronRight, ChevronDown, Play, Pause, X, CalendarDays, Smartphone, BookmarkPlus, Scissors, Edit2, Check } from 'lucide-react';
import { calcStats, getInterpolatedPoint, getInterpolatedPointLinear, haversineKm } from '../../utils/mapUtils';
import { DataContext } from '../../context/DataContext';
function getSpeedColor(speedMs) {
  const kmh = (speedMs || 0) * 3.6;
  if (kmh < 5)  return '#ef4444';  // kırmızı
  if (kmh < 30) return '#f97316';  // turuncu
  if (kmh < 70) return '#6366f1';  // indigo
  if (kmh < 90) return '#38bdf8';  // cyan
  return '#22c55e';                // yeşil
}

function SpeedPolylines({ session }) {
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
  return (
    <>
      {/* ── İnce Gölge (Haritada kaybolmayı önlemek için) ── */}
      <Polyline
        positions={session.filter(p => !isNaN(p.lat)).map(p => [p.lat, p.lon])}
        color="#000000"
        weight={8}
        opacity={0.4}
      />
      {/* ── Renkli Hız Çizgileri ── */}
      {segments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg.positions}
          color={seg.color}
          weight={6}
          opacity={0.9}
        />
      ))}
    </>
  );
}


const truckPlayIcon = new L.Icon({
  iconUrl: '/tir-clear.png?v=8',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  className: 'bg-white rounded-full border-2 border-indigo-500 shadow-lg object-contain',
});

const DATE_FILTERS = [
  { label: 'Bugün',  days: 1 },
  { label: '7 Gün',  days: 7 },
  { label: '30 Gün', days: 30 },
  { label: 'Tümü',   days: 0 },
];

export default function RouteHistory({
  isVisible,
  sessionsByDriver, deviceMappings, trucks,
  dateFilterDays, setDateFilterDays,
  customDate, setCustomDate,
}) {
  const map = useMap();
  const { addManualSplit, customRouteNames, setCustomRouteName, geofences } = useContext(DataContext);

  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedDriver, setSelectedDriver]   = useState(null);
  const [isVehicleDropdownOpen, setIsVehicleDropdownOpen] = useState(false);
  const [showSidebar, setShowSidebar]         = useState(true);
  
  const [editingSessionKey, setEditingSessionKey] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [openMenuKey, setOpenMenuKey] = useState(null);
  const [userInteracted, setUserInteracted] = useState(false);

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



  // Sidebar — click propagation
  const sidebarRef = useRef(null);
  useEffect(() => {
    if (sidebarRef.current) L.DomEvent.disableClickPropagation(sidebarRef.current);
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

  // Alt oynatma çubuğu için click ve scroll izolasyonu
  const playerCallbackRef = useCallback((el) => {
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    const onWheel = (e) => {
      e.stopPropagation();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
  }, []);

  // Save modal için native wheel bloklama (Leaflet'in kendi listener'ını bypass etmek için)
  const saveModalRef = useCallback((el) => {
    if (!el) return;
    const onWheel = (e) => {
      e.stopPropagation();
    };
    el.addEventListener('wheel', onWheel, { passive: true });
  }, []);;

  // Otomatik olarak ilk aracı seç
  useEffect(() => {
    const drivers = Object.keys(sessionsByDriver).filter(d => sessionsByDriver[d].length > 0);
    if (drivers.length > 0 && !selectedDriver) {
      setSelectedDriver(drivers[0]);
    } else if (drivers.length === 0 && selectedDriver) {
      setSelectedDriver(null);
    }
  }, [sessionsByDriver, selectedDriver]);

  // Araç veya tarih filtresi değiştiğinde ilk seferi otomatik seç
  useEffect(() => {
    if (selectedDriver && sessionsByDriver[selectedDriver]) {
      const visibleSessions = [...sessionsByDriver[selectedDriver]].reverse().filter(session => {
        if (dateFilterDays === 0) return true;
        const stats = calcStats(session);
        return parseFloat(stats.km) >= 10 && parseInt(stats.durationMin) >= 20;
      });
      if (visibleSessions.length > 0) {
        setSelectedSession(visibleSessions[0]);
      } else {
        setSelectedSession(null);
      }
    } else {
      setSelectedSession(null);
    }
  }, [selectedDriver, sessionsByDriver, dateFilterDays]);

  // Oynatma
  const [progress, setProgress]               = useState(0);
  const [isPlaying, setIsPlaying]             = useState(false);
  
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

  // Oynat / Durdur
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) { setIsPlaying(false); return 100; }
          return prev + 0.05;
        });
      }, 50);
    } else {
      clearInterval(playIntervalRef.current);
    }
    return () => clearInterval(playIntervalRef.current);
  }, [isPlaying]);

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

  if (!isVisible) return null;

  return (
    <>
      {/* ── Harita Katmanları ── */}
      {selectedSession && (
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
      <div
        ref={sidebarRef}
        className={`
          absolute top-[76px] left-4 bottom-4 w-[300px]
          z-[1500]
          flex flex-col rounded-3xl
          transition-transform duration-300 ease-out
          ${showSidebar ? 'translate-x-0' : '-translate-x-[110%]'}
        `}
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
            <CalendarDays size={15} className="text-indigo-400" />
            Rota Geçmişi
          </h2>
          <button
            onClick={() => setShowSidebar(false)}
            className="p-1.5 text-slate-500 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-xl transition-all"
          >
            <X size={13} />
          </button>
        </div>

        {/* Filtreler */}
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <div className="flex bg-white/[0.03] border border-white/[0.05] p-0.5 rounded-xl items-center">
            {DATE_FILTERS.map(f => {
              const isActive = dateFilterDays === f.days && !customDate;
              return (
                <button
                  key={f.days}
                  onClick={() => { setDateFilterDays(f.days); setCustomDate(''); }}
                  className={`flex-1 py-1.5 text-[11px] rounded-[10px] font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-md'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
            
            <div className="w-px h-4 bg-white/10 mx-1 flex-shrink-0" />
            
            <div className="relative flex items-center justify-center px-2 w-8 h-8 rounded-[10px] transition-colors hover:bg-white/[0.04]">
              <input
                type="date"
                value={customDate}
                onChange={e => { 
                  if (e.target.value) {
                    setCustomDate(e.target.value); 
                    setDateFilterDays(0); 
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                title="Özel Tarih Seç"
              />
              <CalendarDays 
                size={14} 
                className={`transition-colors pointer-events-none ${customDate ? 'text-indigo-400' : 'text-slate-500'}`} 
              />
            </div>
          </div>
          
          {/* Özel tarih seçildiyse ufak bilgi */}
          {customDate && (
            <div className="flex items-center justify-center gap-2 mt-2.5">
              <span className="text-[10px] font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                {new Date(customDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <button 
                onClick={() => { setCustomDate(''); setDateFilterDays(1); }} 
                className="text-[10px] text-slate-500 hover:text-slate-300 underline transition-colors"
              >
                Temizle
              </button>
            </div>
          )}
        </div>

        {/* Araç Seçici (Dropdown) */}
        <div className="px-3 pb-3">
          <button 
            onClick={() => setIsVehicleDropdownOpen(!isVehicleDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.07] transition-all duration-200"
          >
            <span className="text-[11.5px] font-semibold text-slate-300 truncate">
              {selectedDriver ? getDisplayName(selectedDriver) : 'Araç seç...'}
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
                  {Object.entries(sessionsByDriver).filter(([_, sessions]) => sessions.length > 0).map(([driver, sessions]) => {
                    const visibleCount = dateFilterDays === 0
                      ? sessions.length
                      : sessions.filter(s => {
                          const stats = calcStats(s);
                          return parseFloat(stats.km) >= 10 && parseInt(stats.durationMin) >= 20;
                        }).length;
                    if (visibleCount === 0) return null;
                    return (
                      <button
                        key={driver}
                        onClick={() => { 
                          setSelectedDriver(driver); 
                          setIsVehicleDropdownOpen(false); 
                          setSelectedSession(null); 
                        }}
                        className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between border-b border-white/[0.04] last:border-0 transition-all duration-150 ${
                          selectedDriver === driver
                            ? 'bg-indigo-500/[0.12]'
                            : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className={`text-[11px] font-semibold ${
                          selectedDriver === driver ? 'text-indigo-300' : 'text-slate-400'
                        }`}>
                          {getDisplayName(driver)}
                        </span>
                        <span className="text-[9.5px] text-slate-600 font-medium px-1.5 py-0.5 bg-white/[0.04] rounded-md ml-2 flex-shrink-0">
                          {visibleCount} rota
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Seçili Aracın Rotası */}
        <div ref={listCallbackRef} className="flex-1 overflow-y-auto px-3 pb-3 space-y-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {selectedDriver && sessionsByDriver[selectedDriver] && (
            <div className="space-y-1.5">
              {[...sessionsByDriver[selectedDriver]].reverse().map((session, i) => {
                const totalSessions = sessionsByDriver[selectedDriver].length;
                const start = new Date(session[0]?.timestamp);
                const end   = new Date(session[session.length - 1]?.timestamp);
                const isSelected = selectedSession === session;
                const { km, durationMin } = calcStats(session);

                // "Tümü" seçili değilse 10 km altı ve 20 dk altı rotaları gizle
                if (dateFilterDays !== 0 && (parseFloat(km) < 10 || parseInt(durationMin) < 20)) return null;

                return (
                  <React.Fragment key={i}>
                    <button
                      onClick={() => setSelectedSession(isSelected ? null : session)}
                      className={`w-full text-left px-3 py-3 rounded-xl border transition-all duration-200 relative overflow-hidden ${
                        isSelected
                          ? 'bg-indigo-500/10 border-indigo-500/25 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.2)]'
                          : 'bg-white/[0.02] border-white/[0.04] hover:border-white/[0.09] hover:bg-white/[0.04]'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-indigo-500 rounded-full" />
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
                              className="flex items-center gap-2 w-full"
                              onClick={e => e.stopPropagation()}
                            >
                              <input 
                                autoFocus
                                value={editNameValue}
                                onChange={e => setEditNameValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { setCustomRouteName(session[0].timestamp, editNameValue); setEditingSessionKey(null); } }}
                                className="bg-[#0B0E14] border border-indigo-500/50 rounded-lg px-2 py-1 text-xs text-white outline-none flex-1 min-w-0"
                                placeholder={`Sefer ${totalSessions - i}`}
                              />
                              {/* ✂ Böl — önce */}
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const ts = interpolatedData?.timestamp ?? session[Math.floor(session.length / 2)]?.timestamp;
                                  if (ts) addManualSplit(ts, selectedDriver);
                                  setEditingSessionKey(null);
                                }}
                                className="text-rose-400 p-1.5 hover:bg-rose-400/10 rounded-lg flex-shrink-0 transition-colors"
                                title="Rotayı Buradan Böl"
                              >
                                <Scissors size={14} />
                              </button>
                              {/* ✔ Kaydet — sonra */}
                              <button 
                                onClick={async (e) => { e.stopPropagation(); await setCustomRouteName(session[0].timestamp, editNameValue); setEditingSessionKey(null); }}
                                className="text-emerald-400 p-1.5 hover:bg-emerald-400/10 rounded-lg flex-shrink-0 transition-colors"
                                title="İsmi Kaydet"
                              >
                                <Check size={14} />
                              </button>
                            </motion.div>
                          ) : (
                            <>
                              <span className={`text-xs font-bold ${isSelected ? 'text-indigo-400' : 'text-slate-300'}`}>
                                {customRouteNames[session[0].timestamp] || `Sefer ${totalSessions - i}`}
                              </span>
                              <span className="text-[10px] text-slate-600 font-medium">
                                {start.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                              </span>
                            </>
                          )}
                        </div>
                        {/* Sağ: kalem ikonu */}
                        {editingSessionKey !== session[0].timestamp && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditNameValue(customRouteNames[session[0].timestamp] || `Sefer ${totalSessions - i}`); setEditingSessionKey(session[0].timestamp); }}
                            className="p-1.5 rounded-lg text-slate-700 hover:text-indigo-400 hover:bg-white/[0.05] transition-all flex-shrink-0"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1.5 pl-2">
                        <span className="px-2 py-0.5 bg-white/[0.05] rounded-lg text-[10px] text-slate-400 font-semibold border border-white/[0.05]">
                          {km} km
                        </span>
                        <span className="px-2 py-0.5 bg-white/[0.05] rounded-lg text-[10px] text-slate-400 font-semibold border border-white/[0.05]">
                          {durationMin} dk
                        </span>
                      </div>
                    </button>

                    {isSelected && (
                      <div className="flex gap-1.5 mt-1.5" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={e => { e.stopPropagation(); openSaveModal(session); }}
                          className="flex-1 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 text-[11px] font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                        >
                          <BookmarkPlus size={13} /> Rotayı Kaydet
                        </button>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar kapalıyken aç butonu */}
      {!showSidebar && (
        <button
          onClick={() => setShowSidebar(true)}
          className="absolute left-4 z-[1500]"
          style={{
            top: '76px',
            padding: '10px 14px',
            background: 'rgba(13, 18, 25, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: 14,
            color: '#818cf8',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <CalendarDays size={15} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>Geçmiş</span>
        </button>
      )}

      {/* ── Alt Oynatma Çubuğu ── */}
      {selectedSession && (
        <div 
          ref={playerCallbackRef}
          className="absolute bottom-6 -translate-x-1/2 z-[2000] w-11/12 max-w-[420px] pointer-events-auto transition-all duration-300 ease-out"
          style={{ left: showSidebar ? 'calc(50% + 158px)' : '50%' }}
        >
          <div
            className="px-4 py-3 rounded-3xl flex items-center gap-4"
            style={{ background: 'rgba(13,18,25,0.97)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 12px 40px rgba(0,0,0,0.8)', backdropFilter: 'blur(24px)' }}
          >
            {/* Play / Pause */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-11 h-11 rounded-full bg-indigo-500 flex items-center justify-center text-white hover:bg-indigo-600 active:scale-95 transition-all shadow-lg shadow-indigo-500/30 flex-shrink-0"
            >
              {isPlaying
                ? <Pause fill="currentColor" size={18} />
                : <Play fill="currentColor" className="ml-0.5" size={18} />}
            </button>

            {/* Slider */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-[10px] font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                <span>{new Date(selectedSession[0].timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                {interpolatedData && (
                  <span className="text-indigo-400 px-2 py-0.5 bg-indigo-500/10 rounded-full border border-indigo-500/15">
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
                    background: `linear-gradient(to right, #6366f1 ${progress}%, rgba(255,255,255,0.08) ${progress}%)`,
                  }}
                />
                <style>{`
                  input[type='range']::-webkit-slider-thumb {
                    -webkit-appearance: none; appearance: none;
                    width: 16px; height: 16px; border-radius: 50%;
                    background: #fff; border: 2.5px solid #6366f1;
                    box-shadow: 0 0 12px rgba(99,102,241,0.7);
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
        </div>
      )}

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
                <BookmarkPlus size={17} className="text-indigo-400" /> Rotayı Kaydet
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
                  className="w-full flex items-center justify-between bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2.5 text-sm hover:border-indigo-500/40 transition-colors"
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
                              saveTripId === String(r.id) ? 'bg-indigo-500/15 text-indigo-400' : 'text-slate-300'
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
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
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
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                </div>
              ))}

              <button
                onClick={handleSaveRoute}
                className="w-full py-3 bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-indigo-500/20 mt-1"
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

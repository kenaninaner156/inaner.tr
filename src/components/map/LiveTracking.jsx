import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { calcStats } from '../../utils/mapUtils';
import { Activity, WifiOff, X, Search, ShieldAlert, Navigation, Compass } from 'lucide-react';

// ── Tema renkleri — site ile tam uyumlu ──────────────────────────────────
const PANEL_BG     = 'rgba(13, 18, 25, 0.96)';
const PANEL_BORDER = '1px solid rgba(255, 255, 255, 0.05)';

// ── Leaflet Dinamik İkon Oluşturucu (Yön değiştirmez, sabit durur) ───────
const createVehicleIcon = (isOnline, isMapped) => {
  const borderColor = isMapped
    ? (isOnline ? '#10b981' : '#475569')
    : '#f59e0b';
  const bgColor = isOnline ? '#ffffff' : '#1e2533';
  const grayscaleClass = isOnline ? '' : 'grayscale opacity-60';
  const pulseClass = isOnline ? (isMapped ? 'pulse-active' : 'pulse-unmapped') : '';

  const html = `
    <div style="position: relative; width: 38px; height: 38px;">
      <div class="${grayscaleClass} ${pulseClass}" style="
        width: 38px;
        height: 38px;
        background: ${bgColor};
        border: 2.5px solid ${borderColor};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        cursor: pointer;
      ">
        <img src="/tir-clear.png?v=8" style="
          width: 80%;
          height: 80%;
          object-fit: contain;
        " />
      </div>
    </div>
  `;

  return L.divIcon({
    html: html,
    className: 'custom-vehicle-marker-div',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20],
  });
};

// ── Hıza göre renk ─────────────────────────────────────────────────────────
function getSpeedColor(speedMs) {
  const kmh = (speedMs || 0) * 3.6;
  if (kmh < 5)  return '#ef4444';
  if (kmh < 30) return '#f97316';
  if (kmh < 70) return '#6366f1';
  if (kmh < 90) return '#38bdf8';
  return '#22c55e';
}

function SpeedPolylines({ session, isFollowed, isOffline, zoom }) {
  if (!session || session.length < 2) return null;
  const segments = [];
  
  const shouldDash = isOffline && zoom >= 12;
  const dashArray = shouldDash ? "10, 15" : null;
  const opacity = isOffline ? (zoom < 12 ? 0.3 : 0.45) : (isFollowed ? 0.9 : 0.6);
  
  // Dinamik ve akıcı çizgi kalınlığı formülü (zoom derecesine göre kesintisiz ölçeklenir)
  const baseWeight = Math.max(1, (zoom - 7) * 0.35 + 1.2);
  const weight = Math.min(5.0, Math.max(1.2, isFollowed ? baseWeight * 1.35 : baseWeight));

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
      {segments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg.positions}
          color={seg.color}
          weight={weight}
          opacity={opacity}
          dashArray={dashArray}
          smoothFactor={2}
        />
      ))}
    </>
  );
}

function MapController({ 
  sessionsByDriver, 
  followedDriverId, 
  isCameraFollowActive, 
  setIsCameraFollowActive, 
  didInitRef, 
  setZoom, 
  isVisible 
}) {
  const map = useMap();
  const prevCoordsRef = useRef(null);
  const prevDriverIdRef = useRef(null);
  
  useMapEvents({ 
    dragstart: () => setIsCameraFollowActive(false),
    zoomend: () => setZoom(map.getZoom())
  });

  // 1. İLK AÇILIŞTA TÜM ARAÇLARI GÖRÜNTÜLE
  useEffect(() => {
    if (!isVisible || didInitRef.current || !map) return;
    const pts = [];
    Object.values(sessionsByDriver).forEach(sessions => {
      if (!sessions.length) return;
      const last = sessions[sessions.length - 1];
      if (!last.length) return;
      const p = last[last.length - 1];
      if (!isNaN(p.lat) && !isNaN(p.lon)) pts.push([p.lat, p.lon]);
    });
    if (pts.length === 1) {
      map.setView(pts[0], 11, { animate: true, duration: 1 }); 
      didInitRef.current = true;
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [80, 80], maxZoom: 11, animate: true, duration: 1 }); 
      didInitRef.current = true;
    }
  }, [sessionsByDriver, map, didInitRef, isVisible]);

  // 2. TAKİP MODUNDA ARACI ORTALA (YALNIZCA LİVE TAB AKTİFKEN VE CİHAZ TAKİBİ ETKİNKEN)
  useEffect(() => {
    if (!isVisible || !followedDriverId || !map || !isCameraFollowActive) {
      prevCoordsRef.current = null;
      prevDriverIdRef.current = null;
      return;
    }
    const sessions = sessionsByDriver[followedDriverId];
    if (!sessions?.length) return;
    const last = sessions[sessions.length - 1];
    if (!last.length) return;
    const p = last[last.length - 1];
    if (isNaN(p.lat) || isNaN(p.lon)) return;

    const coordsKey = `${p.lat},${p.lon}`;

    // Yeni bir araç seçildiyse tıklama olayındaki setView animasyonu çalışsın, panTo yapma
    if (prevDriverIdRef.current !== followedDriverId) {
      prevDriverIdRef.current = followedDriverId;
      prevCoordsRef.current = coordsKey;
      return;
    }

    // Araç zaten seçiliyse ve yeni konum geldiyse (canlı takip) pürüzsüz kaydır
    if (prevCoordsRef.current !== coordsKey) {
      prevCoordsRef.current = coordsKey;
      map.panTo([p.lat, p.lon], { animate: true, duration: 0.8 });
    }
  }, [sessionsByDriver, followedDriverId, map, isVisible, isCameraFollowActive]);

  return null;
}

function VehicleMarker({ driverId, lastPoint, isOnline, isFollowed, speedKmh, name, isMapped, setFollowedDriverId, setIsCameraFollowActive }) {
  const map = useMap();
  const markerRef = useRef(null);

  const handleClick = () => {
    setFollowedDriverId(driverId);
    setIsCameraFollowActive(true);
    setTimeout(() => {
      map.setView([lastPoint.lat, lastPoint.lon], 15, { animate: true, duration: 1 });
    }, 20);
  };

  return (
    <Marker
      ref={markerRef}
      position={[lastPoint.lat, lastPoint.lon]}
      icon={createVehicleIcon(isOnline, isMapped)}
      zIndexOffset={isFollowed ? 1000 : 0}
      eventHandlers={{ click: handleClick }}
    >
      <Popup className="vehicle-popup" autoPan={false}>
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontWeight: 700, color: '#f1f3f5', fontSize: 11, lineHeight: 1.2 }}>{name}</div>
          <div style={{ fontSize: 9, color: isOnline ? '#10b981' : '#64748b', fontWeight: 600 }}>
            {isOnline ? `Çevrimiçi (${speedKmh} km/h)` : 'Çevrimdışı'}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

function SidebarItem({ 
  vehicle, 
  isFollowed, 
  setFollowedDriverId,
  setIsCameraFollowActive,
  setActiveTab,
  setSelectedHistoryDriver
}) {
  const map = useMap();
  const { driverId, name, isOnline, speedKmh, km, lastPoint, isMapped, isDelayed, durationMin } = vehicle;
  
  const borderClass = isFollowed 
    ? (isMapped ? 'border-emerald-500/30' : 'border-amber-500/30') 
    : 'border-white/[0.03] hover:border-white/[0.08]';
    
  const bgClass = isFollowed 
    ? (isMapped ? 'bg-emerald-500/[0.04]' : 'bg-amber-500/[0.04]') 
    : 'bg-[#121821]/40 hover:bg-[#121821]/70';

  const handleHeaderClick = () => {
    if (isFollowed) {
      setFollowedDriverId(null);
    } else {
      map.setView([lastPoint.lat, lastPoint.lon], 15, { animate: true, duration: 1 });
      setFollowedDriverId(driverId);
      setIsCameraFollowActive(true);
    }
  };

  const handleCenter = (e) => {
    e.stopPropagation();
    map.setView([lastPoint.lat, lastPoint.lon], 16, { animate: true, duration: 1 });
    setIsCameraFollowActive(true);
  };

  const handleShowHistory = (e) => {
    e.stopPropagation();
    if (setSelectedHistoryDriver) {
      setSelectedHistoryDriver(driverId);
    }
    if (setActiveTab) {
      setActiveTab('history');
    }
  };

  const gpsTime = new Date(lastPoint.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const recTime = lastPoint.recordedAt 
    ? new Date(lastPoint.recordedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) 
    : null;

  return (
    <div className={`w-full rounded-2xl border transition-all overflow-hidden ${borderClass} ${bgClass}`}>
      {/* Header (Click to toggle expand) */}
      <div 
        onClick={handleHeaderClick}
        className="w-full flex items-center gap-3 p-3 cursor-pointer select-none"
      >
        {/* Avatar/Status */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
          isOnline 
            ? (isMapped ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400')
            : 'bg-slate-800/50 border-white/[0.03] text-slate-500'
        }`}>
          {isMapped ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          ) : (
            <span className="font-black text-sm">!</span>
          )}
        </div>

        {/* Labels */}
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-bold truncate ${isFollowed ? 'text-white' : 'text-slate-200'}`}>{name}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-[9px] font-bold ${
              isOnline 
                ? (isMapped ? 'text-emerald-400' : 'text-amber-400') 
                : 'text-slate-500'
            }`}>
              {isOnline 
                ? (isMapped ? '● Çevrimiçi' : '● Eşleşmemiş') 
                : '○ Çevrimdışı'}
            </span>
            {speedKmh > 0 && (
              <span className="text-[9px] font-extrabold text-sky-400">{speedKmh} km/h</span>
            )}
            {isDelayed && (
              <span className="text-[8px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded-md">
                Gecikmeli
              </span>
            )}
          </div>
        </div>

        {/* Distance */}
        <div className="text-[10px] font-extrabold text-indigo-300 shrink-0 pr-1">{km} km</div>
      </div>

      {/* Expanded Telemetry Section */}
      <AnimatePresence>
        {isFollowed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="border-t border-white/[0.04] bg-black/15 overflow-hidden"
          >
            <div className="p-3.5 flex flex-col gap-3">
              {/* Delayed warning */}
              {isDelayed && (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl p-2 text-[9px] leading-relaxed">
                  <ShieldAlert size={13} className="shrink-0 mt-0.5" />
                  <div>
                    <strong>Konum Güncel Değil:</strong> Cihazın saati veya GPS uydusu senkronize değil. Konum zamanı ile alım zamanı farklı.
                  </div>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#121821]/30 border border-white/[0.02] rounded-xl p-2">
                  <div className="text-[8px] font-bold text-slate-500 uppercase">HIZ</div>
                  <div className="text-xs font-black text-white mt-0.5">{speedKmh} <span className="text-[8px] font-normal text-slate-500">km/h</span></div>
                </div>
                <div className="bg-[#121821]/30 border border-white/[0.02] rounded-xl p-2">
                  <div className="text-[8px] font-bold text-slate-500 uppercase">AKTİF SÜRE</div>
                  <div className="text-xs font-black text-white mt-0.5">{durationMin} <span className="text-[8px] font-normal text-slate-500">dk</span></div>
                </div>
                <div className="bg-[#121821]/30 border border-white/[0.02] rounded-xl p-2 col-span-2">
                  <div className="text-[8px] font-bold text-slate-500 uppercase">ZAMANLAR (GPS / ALIM)</div>
                  <div className="flex justify-between items-center mt-1 text-[9px] text-slate-300">
                    <span>GPS: <strong>{gpsTime}</strong></span>
                    {recTime && <span>Alım: <strong>{recTime}</strong></span>}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleCenter}
                  className="flex items-center justify-center gap-1.5 py-2 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.03] hover:border-white/[0.08] rounded-xl text-[9px] font-bold text-slate-300 transition-all hover:text-white pointer-events-auto"
                >
                  <Navigation size={11} className="text-slate-400" />
                  Odakla
                </button>
                <button
                  onClick={handleShowHistory}
                  className="flex items-center justify-center gap-1.5 py-2 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.03] hover:border-white/[0.08] rounded-xl text-[9px] font-bold text-slate-300 transition-all hover:text-white pointer-events-auto"
                >
                  <Compass size={11} className="text-slate-400" />
                  Geçmişi Gör
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LiveTracking({ isVisible, sessionsByDriver, deviceMappings, trucks, setActiveTab, setSelectedHistoryDriver }) {
  const [followedDriverId, setFollowedDriverId] = useState(null);
  const [isCameraFollowActive, setIsCameraFollowActive] = useState(true);
  const [showSidebar, setShowSidebar]           = useState(true);
  const [zoom, setZoom] = useState(13);
  const didInitRef = useRef(false);
  const autoSelectRef = useRef(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const sidebarCallbackRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) { 
      didInitRef.current = false; 
      autoSelectRef.current = false;
      setFollowedDriverId(null); 
    }
  }, [isVisible]);

  const listCallbackRef = useCallback((el) => {
    if (!el) return;
    const onWheel = (e) => { e.stopPropagation(); e.preventDefault(); el.scrollTop += e.deltaY; };
    el.addEventListener('wheel', onWheel, { passive: false });
  }, []);

  const getDisplayName = (deviceId) => {
    const m = deviceMappings[deviceId];
    if (!m) return deviceId;
    const truck = (trucks||[]).find(t => t.id === m.truckId);
    return [m.driverName, truck?.plate].filter(Boolean).join(' - ') || deviceId;
  };

  const vehicleList = Object.entries(sessionsByDriver)
    .map(([driverId, sessions]) => {
      if (!sessions.length) return null;
      const latestSession = sessions[sessions.length - 1];
      const lastPoint = latestSession[latestSession.length - 1];
      if (!lastPoint || isNaN(lastPoint.lat)) return null;
      
      const isOnline  = (Date.now() - new Date(lastPoint.timestamp).getTime()) < 15 * 60 * 1000;
      const speedKmh  = isOnline ? Math.round((lastPoint.speed || 0) * 3.6) : 0;
      const { km, durationMin } = calcStats(latestSession);
      const isMapped  = !!deviceMappings[driverId];
      
      // Delay (latency) calculation
      const delayMs = lastPoint.recordedAt ? (new Date(lastPoint.recordedAt).getTime() - new Date(lastPoint.timestamp).getTime()) : 0;
      const isDelayed = delayMs > 5 * 60 * 1000; // > 5 minutes
      
      return { 
        driverId, 
        latestSession, 
        lastPoint, 
        isOnline, 
        speedKmh, 
        km, 
        durationMin, 
        name: isMapped ? getDisplayName(driverId) : `Eşleştirilmemiş Cihaz (${driverId})`,
        isMapped,
        isDelayed
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.isMapped && !b.isMapped) return -1;
      if (!a.isMapped && b.isMapped) return 1;
      return b.isOnline - a.isOnline;
    });

  // Filtered List
  const filteredVehicles = vehicleList.filter(v => {
    const q = searchQuery.toLowerCase().trim();
    if (q && !v.name.toLowerCase().includes(q) && !v.driverId.toLowerCase().includes(q)) {
      return false;
    }
    
    if (statusFilter === 'active') {
      return v.isOnline && v.speedKmh > 5;
    }
    if (statusFilter === 'stopped') {
      return !v.isOnline || v.speedKmh <= 5;
    }
    if (statusFilter === 'unmapped') {
      return !v.isMapped;
    }
    return true;
  });

  useEffect(() => {
    if (isVisible && vehicleList.length === 1 && !autoSelectRef.current) {
      setFollowedDriverId(vehicleList[0].driverId);
      autoSelectRef.current = true;
    }
  }, [isVisible, vehicleList.length]);

  const onlineCount = vehicleList.filter(v => v.isOnline).length;

  return (
    <>
      <style>{`
        .vehicle-popup .leaflet-popup-content-wrapper {
          border-radius: 12px; padding: 0; overflow: hidden;
          background: ${PANEL_BG}; border: ${PANEL_BORDER};
          box-shadow: 0 12px 24px rgba(0,0,0,0.6);
        }
        .vehicle-popup .leaflet-popup-tip-container { display: none; }
        .vehicle-popup .leaflet-popup-content { margin: 0; width: 160px !important; }
        .vehicle-popup .leaflet-popup-close-button { display: none !important; }
        
        /* Pulse animations for vehicles on the map */
        @keyframes markerPulseActive {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
          70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        @keyframes markerPulseUnmapped {
          0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6); }
          70% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
          100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
        }
        .pulse-active {
          animation: markerPulseActive 2s infinite;
        }
        .pulse-unmapped {
          animation: markerPulseUnmapped 2s infinite;
        }
      `}</style>

      <MapController 
        sessionsByDriver={sessionsByDriver} 
        followedDriverId={followedDriverId} 
        setFollowedDriverId={setFollowedDriverId} 
        isCameraFollowActive={isCameraFollowActive}
        setIsCameraFollowActive={setIsCameraFollowActive}
        didInitRef={didInitRef} 
        setZoom={setZoom} 
        isVisible={isVisible}
      />

      {/* Harita Katmanları — isVisible ise göster */}
      {isVisible && vehicleList.map(v => {
        return (
          <React.Fragment key={`live-${v.driverId}`}>
            {v.latestSession.length > 1 && (
              <SpeedPolylines 
                session={v.latestSession} 
                isFollowed={followedDriverId === v.driverId} 
                isOffline={!v.isOnline}
                zoom={zoom}
              />
            )}
            <VehicleMarker 
              driverId={v.driverId} 
              lastPoint={v.lastPoint} 
              isOnline={v.isOnline} 
              isFollowed={followedDriverId === v.driverId} 
              speedKmh={v.speedKmh} 
              name={v.name} 
              isMapped={v.isMapped}
              setFollowedDriverId={setFollowedDriverId} 
              setIsCameraFollowActive={setIsCameraFollowActive}
            />
          </React.Fragment>
        );
      })}

      {/* Sidebar — Framer Motion ile Akışkan Geçiş */}
      <AnimatePresence>
        {isVisible && showSidebar && (
            <motion.div 
            ref={sidebarCallbackRef}
            initial={{ x: -10, opacity: 0, scale: 0.99, filter: 'blur(4px)' }}
            animate={{ x: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ x: -10, opacity: 0, scale: 0.99, filter: 'blur(4px)' }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="absolute top-[76px] left-4 w-[300px] z-[1500] flex flex-col rounded-3xl" 
            style={{
              background: 'rgba(13,18,25,0.96)',
              border: PANEL_BORDER,
              boxShadow: '0 8px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.03)',
              backdropFilter: 'blur(24px)',
              overflow: 'hidden'
            }}
          >
            {/* Başlık */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-white/[0.05] shrink-0">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity size={15} className="text-emerald-400" />
                Canlı Araçlar
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/20">
                  {onlineCount} Aktif
                </span>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="p-1.5 text-slate-500 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-xl transition-all"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Arama Kutusu */}
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Araç, plaka veya sürücü..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#121821]/60 border border-white/[0.04] rounded-xl px-9 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                />
                <Search size={13} className="absolute left-3 top-2.5 text-slate-500" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-slate-500 hover:text-white">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* Filtre Pill Butonları - 2x2 Izgara Düzeni ile Kusursuz Hizalama */}
            <div className="px-4 pb-4 grid grid-cols-2 gap-2 shrink-0">
              {[
                { 
                  id: 'all', 
                  label: 'Tümü', 
                  count: vehicleList.length,
                  dotColor: 'bg-slate-400',
                  activeStyle: 'bg-white/[0.08] text-white border-white/[0.15] shadow-[0_2px_12px_rgba(255,255,255,0.03)]',
                  inactiveStyle: 'bg-white/[0.02] text-slate-400 border-white/[0.03] hover:text-slate-200 hover:bg-white/[0.04]',
                  badgeActive: 'bg-white/10 text-white',
                  badgeInactive: 'bg-white/[0.05] text-slate-500'
                },
                { 
                  id: 'active', 
                  label: 'Aktif', 
                  count: vehicleList.filter(v => v.isOnline && v.speedKmh > 5).length,
                  dotColor: 'bg-emerald-500 shadow-[0_0_6px_#10b981]',
                  activeStyle: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_2px_12px_rgba(16,185,129,0.06)]',
                  inactiveStyle: 'bg-white/[0.02] text-slate-400 border-white/[0.03] hover:text-emerald-400 hover:bg-emerald-500/[0.02] hover:border-emerald-500/10',
                  badgeActive: 'bg-emerald-500/20 text-emerald-400',
                  badgeInactive: 'bg-white/[0.05] text-slate-500'
                },
                { 
                  id: 'stopped', 
                  label: 'Duran', 
                  count: vehicleList.filter(v => !v.isOnline || v.speedKmh <= 5).length,
                  dotColor: 'bg-orange-500 shadow-[0_0_6px_#f97316]',
                  activeStyle: 'bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-[0_2px_12px_rgba(249,115,22,0.06)]',
                  inactiveStyle: 'bg-white/[0.02] text-slate-400 border-white/[0.03] hover:text-orange-400 hover:bg-orange-500/[0.02] hover:border-orange-500/10',
                  badgeActive: 'bg-orange-500/20 text-orange-400',
                  badgeInactive: 'bg-white/[0.05] text-slate-500'
                },
                { 
                  id: 'unmapped', 
                  label: 'Eşleşmemiş', 
                  count: vehicleList.filter(v => !v.isMapped).length,
                  dotColor: 'bg-amber-500 shadow-[0_0_6px_#f59e0b]',
                  activeStyle: 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_2px_12px_rgba(245,158,11,0.06)]',
                  inactiveStyle: 'bg-white/[0.02] text-slate-400 border-white/[0.03] hover:text-amber-400 hover:bg-amber-500/[0.02] hover:border-amber-500/10',
                  badgeActive: 'bg-amber-500/20 text-amber-400',
                  badgeInactive: 'bg-white/[0.05] text-slate-500'
                },
              ].map(f => {
                const isActive = statusFilter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setStatusFilter(f.id)}
                    className={`w-full px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-all duration-300 flex items-center justify-between select-none outline-none ${
                      isActive ? f.activeStyle : f.inactiveStyle
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.dotColor} ${isActive ? 'animate-pulse' : 'opacity-40'}`} />
                      <span className="truncate">{f.label}</span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-extrabold ml-auto shrink-0 transition-all duration-300 ${isActive ? f.badgeActive : f.badgeInactive}`}>
                      {f.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Liste */}
            <div ref={listCallbackRef} className="p-3 flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-250px)]" style={{ scrollbarWidth: 'none' }}>
              {filteredVehicles.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 8 }}>
                  <WifiOff size={22} color="#334155" />
                  <span style={{ fontSize: 10, color: '#475569' }}>Sonuç bulunamadı</span>
                </div>
              ) : (
                filteredVehicles.map(v => (
                  <SidebarItem 
                    key={v.driverId} 
                    vehicle={v}
                    isFollowed={followedDriverId === v.driverId}
                    setFollowedDriverId={setFollowedDriverId} 
                    setIsCameraFollowActive={setIsCameraFollowActive}
                    setActiveTab={setActiveTab}
                    setSelectedHistoryDriver={setSelectedHistoryDriver}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isVisible && !showSidebar && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setShowSidebar(true)}
            className="absolute left-4 top-[76px] z-[1500] p-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/20 transition-all backdrop-blur-md"
          >
            <Activity size={16} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}

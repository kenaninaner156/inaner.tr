import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { calcStats } from '../../utils/mapUtils';
import { Activity, WifiOff, X } from 'lucide-react';

// ── Tema renkleri — site ile tam uyumlu ──────────────────────────────────
const PANEL_BG     = 'rgba(13, 18, 25, 0.95)';
const PANEL_BORDER = '1px solid rgba(255, 255, 255, 0.05)';
const CARD_BG      = 'rgba(255, 255, 255, 0.03)';
const CARD_BORDER  = '1px solid rgba(255, 255, 255, 0.05)';
const ACTIVE_BG    = 'rgba(16, 185, 129, 0.1)';
const ACTIVE_BORDER= '1px solid rgba(16, 185, 129, 0.22)';

// ── Leaflet ikonları ─────────────────────────────────────────────────────
const onlineIcon = new L.Icon({
  iconUrl: '/tir-clear.png?v=8',
  iconSize: [38, 38], iconAnchor: [19, 19],
  popupAnchor: [130, -10],
  className: 'bg-white rounded-full border-[2.5px] border-emerald-500 shadow-[0_0_16px_rgba(16,185,129,0.55)] object-contain cursor-pointer',
});
const offlineIcon = new L.Icon({
  iconUrl: '/tir-clear.png?v=8',
  iconSize: [32, 32], iconAnchor: [16, 16],
  popupAnchor: [130, -10],
  className: 'rounded-full border-2 border-slate-600 shadow-sm object-contain grayscale opacity-55 cursor-pointer',
  style: 'background: #1e2533',
});

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
  
  // Uzak mesafelerde kesik çizgi çok gürültülü durduğu için zoom bazlı mantık:
  const shouldDash = isOffline && zoom >= 12;
  const dashArray = shouldDash ? "10, 15" : null;
  const opacity = isOffline ? (zoom < 12 ? 0.3 : 0.45) : (isFollowed ? 0.9 : 0.6);
  const weight = isFollowed ? (zoom < 12 ? 3 : 5) : (zoom < 12 ? 1.5 : 3.5);

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

function MapController({ sessionsByDriver, followedDriverId, setFollowedDriverId, didInitRef, setZoom }) {
  const map = useMap();
  
  useMapEvents({ 
    dragstart: () => setFollowedDriverId(null),
    zoomend: () => setZoom(map.getZoom())
  });

  // 1. İLK AÇILIŞTA TÜM ARAÇLARI GÖRÜNTÜLE
  useEffect(() => {
    if (didInitRef.current || !map) return;
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
  }, [sessionsByDriver, map, didInitRef]);

  // 2. TAKİP MODUNDA ARACI ORTALA
  useEffect(() => {
    if (!followedDriverId || !map) return;
    const sessions = sessionsByDriver[followedDriverId];
    if (!sessions?.length) return;
    const last = sessions[sessions.length - 1];
    if (!last.length) return;
    const p = last[last.length - 1];
    if (!isNaN(p.lat) && !isNaN(p.lon)) {
      // Sadece çok ufak kaymalar yap (smooth panning)
      map.panTo([p.lat, p.lon], { animate: true, duration: 0.8 });
    }
  }, [sessionsByDriver, followedDriverId, map]);

  return null;
}

function VehicleMarker({ driverId, lastPoint, isOnline, isFollowed, speedKmh, km, durationMin, name, setFollowedDriverId }) {
  const map = useMap();
  const markerRef = useRef(null);

  const handleClick = () => {
    if (isFollowed) {
      setTimeout(() => { markerRef.current?.openPopup(); }, 50);
    } else {
      setFollowedDriverId(driverId);
      // Daha geniş bir bakış açısı için zoom 11 (13 hala yakındı)
      // 'flyTo' yerine 'setView' kullanıyoruz çünkü flyTo animasyonunda canvas bulanıklaşıyor
      setTimeout(() => {
        map.setView([lastPoint.lat, lastPoint.lon], 11, { animate: true, duration: 1.2 });
      }, 20);
    }
  };

  return (
    <Marker
      ref={markerRef}
      position={[lastPoint.lat, lastPoint.lon]}
      icon={isOnline ? onlineIcon : offlineIcon}
      zIndexOffset={isFollowed ? 1000 : 0}
      eventHandlers={{ click: handleClick }}
    >
      <Popup className="vehicle-popup" autoPan={false}>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '12px', borderBottom: CARD_BORDER }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: isOnline ? '#22c55e' : '#475569',
              boxShadow: isOnline ? '0 0 8px rgba(34,197,94,0.7)' : 'none',
            }} />
            <div>
              <div style={{ fontWeight: 700, color: '#f1f3f5', fontSize: 13, lineHeight: 1.2 }}>{name}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{isOnline ? 'Çevrimiçi' : 'Bağlantı kesildi'}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { lbl: 'HIZ',        val: speedKmh,             unit: 'km/h', col: speedKmh > 0 ? '#38bdf8' : '#475569' },
              { lbl: 'DURUM',      val: isOnline ? 'Aktif' : 'Bekliyor', unit: '', col: isOnline ? '#22c55e' : '#475569' },
              { lbl: 'KAT EDİLEN', val: km,                   unit: 'km',   col: '#a5b4fc' },
              { lbl: 'SÜRE',       val: durationMin,           unit: 'dk',   col: '#94a3b8' },
            ].map(s => (
              <div key={s.lbl} style={{ background: CARD_BG, border: CARD_BORDER, borderRadius: 12, padding: '8px 10px' }}>
                <div style={{ fontSize: 9, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.lbl}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.col, lineHeight: 1 }}>
                  {s.val}<span style={{ fontSize: 10, fontWeight: 400, color: '#475569', marginLeft: 2 }}>{s.unit}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: 9, color: '#334155' }}>
            Son sinyal: {new Date(lastPoint.timestamp).toLocaleTimeString('tr-TR')}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

function SidebarItem({ driverId, name, isOnline, speedKmh, km, lastPoint, isFollowed, setFollowedDriverId }) {
  const map = useMap();
  return (
    <button
      onClick={() => {
        map.setView([lastPoint.lat, lastPoint.lon], 11, { animate: true, duration: 1.2 });
        setFollowedDriverId(driverId);
      }}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14,
        border: isFollowed ? ACTIVE_BORDER : CARD_BORDER,
        background: isFollowed ? ACTIVE_BG : CARD_BG,
        cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s ease',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isOnline ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
        border: isOnline ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(255,255,255,0.05)',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isOnline ? '#34d399' : '#475569'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: isFollowed ? '#34d399' : '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span style={{ fontSize: 10, color: isOnline ? '#22c55e' : '#475569', fontWeight: 500 }}>
            {isOnline ? '● Çevrimiçi' : '○ Çevrimdışı'}
          </span>
          {speedKmh > 0 && <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 700 }}>{speedKmh} km/h</span>}
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', flexShrink: 0 }}>{km} km</div>
    </button>
  );
}

export default function LiveTracking({ isVisible, sessionsByDriver, deviceMappings, trucks }) {
  const [followedDriverId, setFollowedDriverId] = useState(null);
  const [showSidebar, setShowSidebar]           = useState(true);
  const [zoom, setZoom] = useState(13);
  const didInitRef = useRef(false);
  const autoSelectRef = useRef(false);

  // Harita etkileşimini sidebar üzerinde engelle
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
    .filter(([driverId]) => !!deviceMappings[driverId])
    .map(([driverId, sessions]) => {
      if (!sessions.length) return null;
      const latestSession = sessions[sessions.length - 1];
      const lastPoint = latestSession[latestSession.length - 1];
      if (!lastPoint || isNaN(lastPoint.lat)) return null;
      const isOnline  = (Date.now() - new Date(lastPoint.timestamp).getTime()) < 15 * 60 * 1000;
      const speedKmh  = isOnline ? Math.round((lastPoint.speed || 0) * 3.6) : 0;
      const { km, durationMin } = calcStats(latestSession);
      return { driverId, latestSession, lastPoint, isOnline, speedKmh, km, durationMin, name: getDisplayName(driverId) };
    }).filter(Boolean);

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
          border-radius: 20px; padding: 0; overflow: hidden;
          background: ${PANEL_BG}; border: ${PANEL_BORDER};
          box-shadow: 0 24px 48px -8px rgba(0,0,0,0.8);
        }
        .vehicle-popup .leaflet-popup-tip-container { display: none; }
        .vehicle-popup .leaflet-popup-content { margin: 0; width: 210px !important; }
        .vehicle-popup .leaflet-popup-close-button { color: #475569 !important; top: 8px !important; right: 10px !important; font-size: 20px !important; }
      `}</style>

      <MapController sessionsByDriver={sessionsByDriver} followedDriverId={followedDriverId} setFollowedDriverId={setFollowedDriverId} didInitRef={didInitRef} setZoom={setZoom} />

      {/* Harita Katmanları — isVisible ise göster */}
      {isVisible && vehicleList.map(v => (
        <React.Fragment key={`live-${v.driverId}`}>
          {v.latestSession.length > 1 && (
            <SpeedPolylines 
              session={v.latestSession} 
              isFollowed={followedDriverId === v.driverId} 
              isOffline={!v.isOnline}
              zoom={zoom}
            />
          )}
          <VehicleMarker driverId={v.driverId} lastPoint={v.lastPoint} isOnline={v.isOnline} isFollowed={followedDriverId === v.driverId} speedKmh={v.speedKmh} km={v.km} durationMin={v.durationMin} name={v.name} setFollowedDriverId={setFollowedDriverId} />
        </React.Fragment>
      ))}

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
              background: 'rgba(13,18,25,0.97)',
              border: '1px solid rgba(255,255,255,0.04)',
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

            {/* Liste */}
            <div ref={listCallbackRef} className="p-3 flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-180px)]" style={{ scrollbarWidth: 'none' }}>
              {vehicleList.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 8 }}><WifiOff size={24} color="#334155" /><span style={{ fontSize: 11, color: '#334155' }}>Aktif araç yok</span></div>
              ) : (
                vehicleList.map(v => <SidebarItem key={v.driverId} driverId={v.driverId} name={v.name} isOnline={v.isOnline} speedKmh={v.speedKmh} km={v.km} lastPoint={v.lastPoint} isFollowed={followedDriverId === v.driverId} setFollowedDriverId={setFollowedDriverId} />)
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

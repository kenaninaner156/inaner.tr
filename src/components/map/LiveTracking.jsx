import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { calcStats, cleanGpsSpikes } from '../../utils/mapUtils';
import { Activity, WifiOff, X, Search, ShieldAlert, Navigation, Compass, Crosshair, ChevronRight, ChevronDown, Check } from 'lucide-react';

// ── Tema renkleri — site ile tam uyumlu ──────────────────────────────────
const PANEL_BG     = 'rgba(13, 18, 25, 0.96)';
const PANEL_BORDER = '1px solid rgba(255, 255, 255, 0.05)';

// ── Leaflet Dinamik İkon Oluşturucu (Obsidiyen & Elegant Çerçeve) ────────
const createVehicleIcon = (isOnline, isMapped, speedKmh = 0, isFollowed = false) => {
  const isMoving = isOnline && speedKmh > 7;
  
  let borderColor = 'rgba(255, 255, 255, 0.12)';
  let shadow = '0 4px 14px rgba(0,0,0,0.7)';
  
  if (isFollowed) {
    borderColor = '#34d399';
    shadow = '0 4px 20px rgba(0,0,0,0.85), 0 0 12px rgba(52, 211, 153, 0.45), inset 0 1px 0 rgba(255,255,255,0.2)';
  } else if (isOnline) {
    if (isMoving) {
      borderColor = 'rgba(52, 211, 153, 0.8)';
      shadow = '0 4px 16px rgba(0,0,0,0.75), 0 0 10px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255,255,255,0.15)';
    } else {
      borderColor = 'rgba(245, 158, 11, 0.7)';
      shadow = '0 4px 16px rgba(0,0,0,0.75), 0 0 8px rgba(245, 158, 11, 0.25), inset 0 1px 0 rgba(255,255,255,0.15)';
    }
  }

  const imgFilter = isOnline 
    ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' 
    : 'grayscale(1) opacity(0.4)';

  const html = `
    <div style="position: relative; width: 38px; height: 38px;">
      <div style="
        width: 38px;
        height: 38px;
        background: #0c1018;
        border: 1.5px solid ${borderColor};
        border-radius: 50%;
        box-shadow: ${shadow};
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        cursor: pointer;
        transition: all 0.25s ease;
      ">
        <img src="/tir-clear.png?v=8" style="
          width: 72%;
          height: 72%;
          object-fit: contain;
          filter: ${imgFilter};
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

// ── Hıza göre renk (Traccar GPS hız verisi knot cinsindedir: 1 knot = 1.852 km/h) ───
function getSpeedColor(speedKnots) {
  const kmh = (speedKnots || 0) * 1.852;
  if (kmh < 5)  return '#ef4444';
  if (kmh < 30) return '#f97316';
  if (kmh < 70) return '#6366f1';
  if (kmh < 90) return '#38bdf8';
  return '#22c55e';
}

function SpeedPolylines({ session, isFollowed, zoom }) {
  if (!session || session.length < 2) return null;
  
  // Kronolojik sıraya diz ve sıçramaları/mükerrer noktaları temizle
  const cleaned = useMemo(() => {
    return cleanGpsSpikes(session);
  }, [session]);

  if (!cleaned || cleaned.length < 2) return null;

  const segments = [];
  
  // Dinamik ve akıcı çizgi kalınlığı formülü (zoom derecesine göre kesintisiz ölçeklenir)
  const baseWeight = Math.max(1.5, (zoom - 7) * 0.35 + 1.2);
  const weight = Math.min(5.5, Math.max(1.5, isFollowed ? baseWeight * 1.35 : baseWeight));
  const shadowWeight = weight + 2.5;

  for (let i = 0; i < cleaned.length - 1; i++) {
    const a = cleaned[i], b = cleaned[i + 1];
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
      {/* ── Alt Gölge (Yumuşak Dış Hat) ── */}
      <Polyline
        positions={cleaned.filter(p => !isNaN(p.lat)).map(p => [p.lat, p.lon])}
        color="#000"
        weight={shadowWeight}
        opacity={0.35}
        smoothFactor={1}
      />
      {/* ── Renkli Hız Çizgileri (Daima Kesintisiz Düz Çizgi) ── */}
      {segments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg.positions}
          color={seg.color}
          weight={weight}
          opacity={isFollowed ? 0.95 : 0.8}
          smoothFactor={1}
        />
      ))}
    </>
  );
}

function MapController({ 
  vehicleList,
  followedDriverId, 
  setFollowedDriverId,
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

  // 1. İLK AÇILIŞTA: 1 aktif araç varsa direkt ona odaklan (zoom 15), birden fazlaysa hepsini ekrana sığdır
  useEffect(() => {
    if (!isVisible || didInitRef.current || !map || !vehicleList || !vehicleList.length) return;
    
    // Aktif (online) araçları kontrol et
    const activeVehicles = vehicleList.filter(v => v.isOnline && v.lastPoint && !isNaN(v.lastPoint.lat));
    
    if (activeVehicles.length === 1) {
      // Sadece 1 aktif araç varsa: Doğrudan o araca zoom 15 ile odaklan
      const pt = activeVehicles[0].lastPoint;
      map.setView([pt.lat, pt.lon], 15, { animate: true, duration: 0.8 });
      setFollowedDriverId(activeVehicles[0].driverId);
      setIsCameraFollowActive(true);
      didInitRef.current = true;
    } else if (activeVehicles.length > 1) {
      // Birden fazla aktif araç varsa: Hepsini ekrana sığdır
      const pts = activeVehicles.map(v => [v.lastPoint.lat, v.lastPoint.lon]);
      map.fitBounds(L.latLngBounds(pts), { padding: [100, 100], maxZoom: 14, animate: true, duration: 0.8 });
      didInitRef.current = true;
    } else {
      // Aktif araç yoksa: Son konumu olan tüm araçları sığdır veya ilkine odaklan
      const allPts = vehicleList.map(v => [v.lastPoint.lat, v.lastPoint.lon]).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
      if (allPts.length === 1) {
        map.setView(allPts[0], 12, { animate: true, duration: 0.8 });
        didInitRef.current = true;
      } else if (allPts.length > 1) {
        map.fitBounds(L.latLngBounds(allPts), { padding: [100, 100], maxZoom: 12, animate: true, duration: 0.8 });
        didInitRef.current = true;
      }
    }
  }, [vehicleList, map, didInitRef, isVisible, setFollowedDriverId, setIsCameraFollowActive]);

  // 2. TAKİP MODUNDA ARACI ORTALA (KULLANICI TIKLAYINCA VEYA CANLI HAREKETTE)
  useEffect(() => {
    if (!isVisible || !followedDriverId || !map || !isCameraFollowActive) {
      prevCoordsRef.current = null;
      prevDriverIdRef.current = null;
      return;
    }
    const veh = vehicleList.find(v => v.driverId === followedDriverId);
    if (!veh || !veh.lastPoint || isNaN(veh.lastPoint.lat)) return;

    const p = veh.lastPoint;
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
  }, [vehicleList, followedDriverId, map, isVisible, isCameraFollowActive]);

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
      icon={createVehicleIcon(isOnline, isMapped, speedKmh, isFollowed)}
      zIndexOffset={isFollowed ? 1000 : 0}
      eventHandlers={{ click: handleClick }}
    >
      <Popup className="vehicle-popup" autoPan={false}>
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontWeight: 700, color: '#f1f3f5', fontSize: 11, lineHeight: 1.2 }}>{name}</div>
          <div style={{ fontSize: 9, color: isOnline ? '#10b981' : '#64748b', fontWeight: 600 }}>
            {isOnline ? (speedKmh > 7 ? `Yolda (${speedKmh} km/h)` : 'Park Halinde') : 'Çevrimdışı'}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

// ── Yardımcı Süre Formatlayıcı (Kompakt & İnsan Okumasına Uygun) ──────────
const formatDuration = (minutes) => {
  if (!minutes || isNaN(minutes) || minutes <= 0) return '0d';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}d`;
  return `${hrs}s ${mins.toString().padStart(2, '0')}d`;
};

function SidebarItem({ 
  vehicle, 
  isFollowed, 
  setFollowedDriverId,
  setIsCameraFollowActive
}) {
  const map = useMap();
  const { driverId, driverName, plate, name, isOnline, speedKmh, km, lastPoint, topSpeedKmh, avgSpeedKmh } = vehicle;

  const borderClass = isFollowed 
    ? 'border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.6)]' 
    : 'border-white/[0.05] hover:border-white/10';
    
  const bgClass = isFollowed 
    ? 'bg-[#111622]/95' 
    : 'bg-[#0f141d]/70 hover:bg-[#111622]/80';

  const handleHeaderClick = () => {
    map.setView([lastPoint.lat, lastPoint.lon], 15, { animate: true, duration: 0.8 });
    setFollowedDriverId(driverId);
    setIsCameraFollowActive(true);
  };

  // Sadece plaka veya çevrimdışı
  const subtitleText = !isOnline 
    ? (plate ? `${plate} • Çevrimdışı` : 'Çevrimdışı') 
    : (plate || '');

  return (
    <div className={`w-full rounded-2xl border transition-all duration-200 overflow-hidden ${borderClass} ${bgClass}`}>
      {/* Header */}
      <div 
        onClick={handleHeaderClick}
        className="w-full flex items-center justify-between p-3.5 cursor-pointer select-none gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-bold tracking-tight truncate ${isFollowed ? 'text-white' : 'text-slate-200'}`}>
            {driverName || name}
          </div>
          {subtitleText && (
            <div className="text-xs font-mono text-slate-400 font-medium tracking-tight mt-0.5 truncate">
              {subtitleText}
            </div>
          )}
        </div>

        {/* Günlük KM */}
        <div className="shrink-0 text-right">
          <span className="text-sm font-mono font-bold text-white tracking-tight">{km}</span>
          <span className="text-[11px] text-slate-400 font-sans font-medium ml-1">km</span>
        </div>
      </div>

      {/* Expanded Telemetry Section (Clean 3-Column Strip) */}
      <AnimatePresence>
        {isFollowed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="border-t border-white/[0.06] bg-[#0b0e15]/80 overflow-hidden"
          >
            <div className="grid grid-cols-3 divide-x divide-white/[0.05] p-3 text-center">
              {/* 1. ANLIK HIZ / PARK */}
              <div className="px-1.5">
                <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">ANLIK HIZ</div>
                <div className="text-sm font-mono font-bold text-slate-100 mt-1">
                  {!isOnline ? (
                    <span className="text-slate-500 font-sans text-xs">Çevrimdışı</span>
                  ) : speedKmh <= 7 ? (
                    <span className="text-slate-300 font-sans text-xs font-semibold">Park</span>
                  ) : (
                    <>
                      {speedKmh} <span className="text-[9px] font-sans font-normal text-slate-400">km/h</span>
                    </>
                  )}
                </div>
              </div>

              {/* 2. MAX HIZ */}
              <div className="px-1.5">
                <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">MAX HIZ</div>
                <div className="text-sm font-mono font-bold text-slate-100 mt-1">
                  {topSpeedKmh || speedKmh} <span className="text-[9px] font-sans font-normal text-slate-400">km/h</span>
                </div>
              </div>

              {/* 3. ORTALAMA HIZ */}
              <div className="px-1.5">
                <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">ORT. HIZ</div>
                <div className="text-sm font-mono font-bold text-slate-100 mt-1">
                  {avgSpeedKmh || speedKmh} <span className="text-[9px] font-sans font-normal text-slate-400">km/h</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Mobile Map Floating Actions (Fit All & Focus Followed) ──────────────
function MobileMapActions({ vehicleList, followedVehicle, setFollowedDriverId, setIsCameraFollowActive }) {
  const map = useMap();
  
  const handleFitAll = (e) => {
    e.stopPropagation();
    const pts = vehicleList.map(v => [v.lastPoint.lat, v.lastPoint.lon]).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
    if (pts.length === 1) {
      map.setView(pts[0], 12, { animate: true, duration: 0.8 });
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [70, 70], maxZoom: 12, animate: true, duration: 0.8 });
    }
  };

  const handleCenterFollowed = (e) => {
    e.stopPropagation();
    const target = followedVehicle || vehicleList[0];
    if (target?.lastPoint) {
      if (setFollowedDriverId) setFollowedDriverId(target.driverId);
      setIsCameraFollowActive(true);
      map.setView([target.lastPoint.lat, target.lastPoint.lon], 16, { animate: true, duration: 0.8 });
    }
  };

  return (
    <div 
      className="absolute right-3.5 z-[1500] flex flex-col gap-2.5 pointer-events-auto md:hidden"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 78px)'
      }}
    >
      {/* 1. Üçgen: Seçili Aracı Ortala */}
      <button
        onClick={handleCenterFollowed}
        className="w-11 h-11 bg-[#0d1219] border border-emerald-500/40 text-emerald-400 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.75)] active:scale-90 transition-all flex items-center justify-center"
        title="Seçili Aracı Ortala"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-400 transform -rotate-45 translate-x-0.5">
          <path d="M12 2L19 21L12 17L5 21L12 2Z" />
        </svg>
      </button>

      {/* 2. 3 Tane Yuvarlak: Bütün Araçları Göster */}
      <button
        onClick={handleFitAll}
        className="w-11 h-11 bg-[#0d1219] border border-white/15 text-slate-200 hover:text-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.75)] active:scale-90 transition-all flex items-center justify-center"
        title="Bütün Araçları Göster"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-slate-200">
          <circle cx="12" cy="5.5" r="2.8" />
          <circle cx="6" cy="17" r="2.8" />
          <circle cx="18" cy="17" r="2.8" />
        </svg>
      </button>
    </div>
  );
}

// ── Mobile Followed Vehicle Telemetry Card (Smooth CSS Grid Accordion) ────
function MobileFollowedCard({ 
  vehicle,
  vehicleList,
  onSelectVehicle
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { driverName, plate, name, isOnline, speedKmh, km, topSpeedKmh, avgSpeedKmh } = vehicle;

  const cardRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  const subtitleText = !isOnline 
    ? (plate ? `${plate} • Çevrimdışı` : 'Çevrimdışı') 
    : (plate || '');

  return (
    <div
      ref={cardRef}
      className="absolute bottom-3 left-3 right-3 z-[1500] pointer-events-auto rounded-[28px] p-3.5 flex flex-col gap-2.5 shadow-[0_16px_50px_rgba(0,0,0,0.85)] border border-white/10 md:hidden overflow-hidden transition-all duration-200 bg-[#0d1219]"
      style={{
        marginBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      {/* Üst Başlık */}
      <div 
        onClick={() => setIsExpanded(prev => !prev)}
        className="flex items-center justify-between cursor-pointer select-none group active:opacity-75 transition-opacity"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-white truncate">
              {driverName || name}
            </span>
            <ChevronDown 
              size={14} 
              className={`text-slate-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-white' : ''}`}
            />
          </div>
          {subtitleText && (
            <div className="text-xs font-mono text-slate-400 font-medium tracking-tight mt-0.5 truncate">
              {subtitleText}
            </div>
          )}
        </div>

        {/* Günlük KM */}
        <div className="shrink-0 text-right">
          <span className="text-sm font-mono font-bold text-white tracking-tight">{km}</span>
          <span className="text-[11px] text-slate-400 font-sans font-medium ml-1">km</span>
        </div>
      </div>

      {/* Kart İçi Akıcı CSS Grid Genişleyen Araç Seçim Listesi */}
      <div 
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          isExpanded 
            ? 'grid-rows-[1fr] opacity-100 border-t border-white/[0.06] pt-2' 
            : 'grid-rows-[0fr] opacity-0 border-t-0 pt-0 pointer-events-none'
        }`}
      >
        <div className="overflow-hidden flex flex-col gap-1.5 max-h-52 overflow-y-auto custom-scrollbar">
          <div className="text-[9px] font-semibold text-slate-400 px-1 uppercase tracking-wider">Tüm Araçlar</div>
          {vehicleList.map(v => {
            const isSelected = v.driverId === vehicle.driverId;
            return (
              <div
                key={v.driverId}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectVehicle(v.driverId);
                  setIsExpanded(false);
                }}
                className={`flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer select-none active:scale-[0.98] ${
                  isSelected 
                    ? 'bg-white/[0.08] border border-white/10' 
                    : 'bg-[#121821]/70 border border-white/[0.03] hover:bg-white/[0.05]'
                }`}
              >
                <div className="min-w-0">
                  <div className={`text-xs font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                    {v.driverName || v.name}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {v.plate ? `${v.plate} • ` : ''}{v.km} km
                  </div>
                </div>

                {isSelected ? (
                  <Check size={13} className="text-emerald-400 shrink-0" />
                ) : (
                  <ChevronRight size={13} className="text-slate-600 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3 Kolonlu Telemetri İstatistikleri */}
      <div className="grid grid-cols-3 divide-x divide-white/[0.05] p-2 bg-[#0b0e15]/80 rounded-2xl border border-white/[0.04] text-center">
        <div className="px-1">
          <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">ANLIK HIZ</div>
          <div className="text-xs font-mono font-bold text-slate-100 mt-0.5">
            {!isOnline ? (
              <span className="text-slate-500 font-sans text-[10px]">Çevrimdışı</span>
            ) : speedKmh <= 7 ? (
              <span className="text-slate-300 font-sans text-[11px] font-semibold">Park</span>
            ) : (
              <>
                {speedKmh} <span className="text-[8px] font-sans font-normal text-slate-400">km/h</span>
              </>
            )}
          </div>
        </div>
        <div className="px-1">
          <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">MAX HIZ</div>
          <div className="text-xs font-mono font-bold text-slate-100 mt-0.5">{topSpeedKmh || speedKmh} <span className="text-[8px] font-sans font-normal text-slate-400">km/h</span></div>
        </div>
        <div className="px-1">
          <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">ORT. HIZ</div>
          <div className="text-xs font-mono font-bold text-slate-100 mt-0.5">{avgSpeedKmh || speedKmh} <span className="text-[8px] font-sans font-normal text-slate-400">km/h</span></div>
        </div>
      </div>
    </div>
  );
}

export default function LiveTracking({
  isVisible,
  sessionsByDriver,
  deviceMappings,
  trucks = [],
  setActiveTab,
  setSelectedHistoryDriver,
  isMobile,
  hidePolylines = false,
}) {
  const [followedDriverId, setFollowedDriverId] = useState(null);
  const [isCameraFollowActive, setIsCameraFollowActive] = useState(true);
  const [showSidebar, setShowSidebar]           = useState(true);
  const [zoom, setZoom] = useState(13);
  const didInitRef = useRef(false);

  const sidebarCallbackRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) { 
      didInitRef.current = false; 
      setFollowedDriverId(null); 
    }
  }, [isVisible]);

  const listCallbackRef = useCallback((el) => {
    if (!el) return;
    const onWheel = (e) => { e.stopPropagation(); e.preventDefault(); el.scrollTop += e.deltaY; };
    el.addEventListener('wheel', onWheel, { passive: false });
  }, []);

  const getVehicleInfo = (deviceId) => {
    const m = deviceMappings[deviceId];
    if (!m) return { driverName: `Cihaz (${deviceId})`, plate: '' };
    const truck = (trucks || []).find(t => t.id === m.truckId);
    return {
      driverName: m.driverName || deviceId,
      plate: truck?.plate || ''
    };
  };

  const vehicleList = Object.entries(sessionsByDriver)
    .map(([driverId, sessions]) => {
      if (!sessions.length) return null;
      const latestSession = sessions[sessions.length - 1];
      const lastPoint = latestSession[latestSession.length - 1];
      if (!lastPoint || isNaN(lastPoint.lat)) return null;
      
      const isOnline  = (Date.now() - new Date(lastPoint.timestamp).getTime()) < 15 * 60 * 1000;
      const speedKmh  = isOnline ? Math.round((lastPoint.speed || 0) * 1.852) : 0;
      const { km, durationMin, topSpeedKmh, avgSpeedKmh } = calcStats(latestSession);
      const isMapped  = !!deviceMappings[driverId];
      const info = getVehicleInfo(driverId);
      
      return { 
        driverId, 
        latestSession, 
        lastPoint, 
        isOnline, 
        speedKmh, 
        km, 
        durationMin, 
        topSpeedKmh,
        avgSpeedKmh,
        driverName: info.driverName,
        plate: info.plate,
        name: info.plate ? `${info.driverName} - ${info.plate}` : info.driverName,
        isMapped
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.isMapped && !b.isMapped) return -1;
      if (!a.isMapped && b.isMapped) return 1;
      return b.isOnline - a.isOnline;
    });

  const onlineCount = vehicleList.filter(v => v.isOnline).length;
  const followedVehicle = vehicleList.find(v => v.driverId === followedDriverId) || vehicleList[0];

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
        vehicleList={vehicleList}
        followedDriverId={followedDriverId} 
        setFollowedDriverId={setFollowedDriverId} 
        isCameraFollowActive={isCameraFollowActive}
        setIsCameraFollowActive={setIsCameraFollowActive}
        didInitRef={didInitRef} 
        setZoom={setZoom} 
        isVisible={isVisible}
      />

      {isVisible && vehicleList.map(v => {
        return (
          <React.Fragment key={`live-${v.driverId}`}>
            {v.latestSession.length > 1 && !hidePolylines && (
              <SpeedPolylines 
                session={v.latestSession} 
                isFollowed={followedDriverId === v.driverId} 
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

      {isVisible && (
        <>
          <MobileMapActions 
            vehicleList={vehicleList}
            followedVehicle={followedVehicle}
            setFollowedDriverId={setFollowedDriverId}
            setIsCameraFollowActive={setIsCameraFollowActive}
          />

          {followedVehicle && (
            <MobileFollowedCard
              vehicle={followedVehicle}
              vehicleList={vehicleList}
              onSelectVehicle={(driverId) => {
                setFollowedDriverId(driverId);
                setIsCameraFollowActive(true);
              }}
              onShowHistory={(driverId) => {
                if (setSelectedHistoryDriver) setSelectedHistoryDriver(driverId);
                if (setActiveTab) setActiveTab('history');
              }}
            />
          )}
        </>
      )}

      <AnimatePresence>
        {isVisible && showSidebar && (
            <motion.div 
            ref={sidebarCallbackRef}
            initial={{ x: -10, opacity: 0, scale: 0.99 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: -10, opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="hidden md:flex absolute top-[76px] left-4 w-[300px] z-[1500] flex-col rounded-3xl" 
            style={{
              background: 'rgba(13,18,25,0.96)',
              border: PANEL_BORDER,
              boxShadow: '0 8px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.03)',
              backdropFilter: 'blur(24px)',
              overflow: 'hidden'
            }}
          >
            <div className="flex justify-between items-center px-5 py-4 border-b border-white/[0.05] shrink-0">
              <h2 className="text-sm font-bold text-white tracking-tight">
                Canlı Araçlar
              </h2>
              <button
                onClick={() => setShowSidebar(false)}
                className="p-1.5 text-slate-500 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-xl transition-all"
              >
                <X size={13} />
              </button>
            </div>

            <div ref={listCallbackRef} className="p-3 flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-160px)]" style={{ scrollbarWidth: 'none' }}>
              {vehicleList.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 8 }}>
                  <WifiOff size={22} color="#334155" />
                  <span style={{ fontSize: 10, color: '#475569' }}>Kayıtlı araç bulunamadı</span>
                </div>
              ) : (
                vehicleList.map(v => (
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
            className="hidden md:flex absolute left-4 top-[76px] z-[1500] p-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/20 transition-all backdrop-blur-md"
          >
            <Activity size={16} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}

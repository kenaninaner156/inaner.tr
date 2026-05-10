import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { calcStats } from '../../utils/mapUtils';
import { Activity, WifiOff, X } from 'lucide-react';

// ── Tema renkleri — site ile tam uyumlu ──────────────────────────────────
// bg-base:    #0B0E14
// bg-sidebar: #0D1219
// bg-panel:   rgba(18, 24, 33, 0.45)
// border:     rgba(255, 255, 255, 0.04)

const PANEL_BG     = 'rgba(13, 18, 25, 0.95)';
const PANEL_BORDER = '1px solid rgba(255, 255, 255, 0.05)';
const CARD_BG      = 'rgba(255, 255, 255, 0.03)';
const CARD_BORDER  = '1px solid rgba(255, 255, 255, 0.05)';
const ACTIVE_BG    = 'rgba(99, 102, 241, 0.1)';
const ACTIVE_BORDER= '1px solid rgba(99, 102, 241, 0.22)';

// ── Leaflet ikonları ─────────────────────────────────────────────────────
const onlineIcon = new L.Icon({
  iconUrl: '/tir-clear.png?v=8',
  iconSize: [38, 38], iconAnchor: [19, 19],
  // Popup offset: sidebar 300px wide on left, push popup to the right of marker
  popupAnchor: [130, -10],
  className: 'bg-white rounded-full border-[2.5px] border-indigo-500 shadow-[0_0_16px_rgba(99,102,241,0.55)] object-contain cursor-pointer',
});
const offlineIcon = new L.Icon({
  iconUrl: '/tir-clear.png?v=8',
  iconSize: [32, 32], iconAnchor: [16, 16],
  popupAnchor: [130, -10],
  className: 'rounded-full border-2 border-slate-600 shadow-sm object-contain grayscale opacity-55 cursor-pointer',
  style: 'background: #1e2533',
});

// ── Hıza göre renk ─────────────────────────────────────────────────────────
// < 5 km/h   : kırmızı (trafik/duragan)
// 5-30 km/h  : turuncu (yavaş)
// 30-70 km/h : mor/indigo (normal)
// 70-90 km/h : açık mavi (hızlı)
// > 90 km/h  : yeşil (çok hızlı)
function getSpeedColor(speedMs) {
  const kmh = (speedMs || 0) * 3.6;
  if (kmh < 5)  return '#ef4444';  // kırmızı
  if (kmh < 30) return '#f97316';  // turuncu
  if (kmh < 70) return '#6366f1';  // indigo
  if (kmh < 90) return '#38bdf8';  // cyan
  return '#22c55e';                // yeşil
}

// Hıza göre renklendirilmiş polyline segment'ları
function SpeedPolylines({ session, isFollowed }) {
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
      {segments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg.positions}
          color={seg.color}
          weight={isFollowed ? 5 : 3.5}
          opacity={isFollowed ? 0.9 : 0.6}
        />
      ))}
    </>
  );
}

// ── Harita davranışı (useMap burada — MapContainer içinde) ───────────────
function MapController({ sessionsByDriver, followedDriverId, setFollowedDriverId, didInitRef }) {
  const map = useMap();

  useMapEvents({
    dragstart: () => setFollowedDriverId(null),
  });

  // İlk yükleme → tüm araçları kapsayan view
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
      map.setView(pts[0], 13, { animate: true }); didInitRef.current = true;
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [80, 80], maxZoom: 13, animate: true }); didInitRef.current = true;
    }
  }, [sessionsByDriver, map, didInitRef]);

  // Takip → panTo (zoom değişmez)
  useEffect(() => {
    if (!followedDriverId || !map) return;
    const sessions = sessionsByDriver[followedDriverId];
    if (!sessions?.length) return;
    const last = sessions[sessions.length - 1];
    if (!last.length) return;
    const p = last[last.length - 1];
    if (!isNaN(p.lat) && !isNaN(p.lon)) map.panTo([p.lat, p.lon], { animate: true, duration: 0.5 });
  }, [sessionsByDriver, followedDriverId, map]);

  return null;
}

// ── Marker bileşeni (useMap burada) ────────────────────────────────────
function VehicleMarker({ driverId, lastPoint, isOnline, isFollowed, speedKmh, km, durationMin, name, setFollowedDriverId }) {
  const map = useMap();
  const markerRef = useRef(null);

  const handleClick = () => {
    if (isFollowed) {
      // Zaten takip var → popup ac (kisa gecikme ile, setView animasyonuyla cakismasin)
      setTimeout(() => {
        markerRef.current?.openPopup();
      }, 50);
    } else {
      // Takip yok → once takibe al, sonra zoom
      setFollowedDriverId(driverId);
      setTimeout(() => {
        map.flyTo([lastPoint.lat, lastPoint.lon], 16, { duration: 1.5, easeLinearity: 0.25 });
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
          {/* Başlık */}
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

          {/* Stats grid */}
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

// ── Sidebar araç satırı (useMap burada) ────────────────────────────────
function SidebarItem({ driverId, name, isOnline, speedKmh, km, lastPoint, isFollowed, setFollowedDriverId }) {
  const map = useMap();

  return (
    <button
      onClick={() => {
        map.flyTo([lastPoint.lat, lastPoint.lon], 16, { duration: 1.5, easeLinearity: 0.25 });
        setFollowedDriverId(driverId);
      }}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        borderRadius: 14,
        border: isFollowed ? ACTIVE_BORDER : CARD_BORDER,
        background: isFollowed ? ACTIVE_BG : CARD_BG,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.18s ease',
      }}
    >
      {/* İkon */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isOnline ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
        border: isOnline ? '1px solid rgba(99,102,241,0.2)' : '1px solid rgba(255,255,255,0.05)',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isOnline ? '#818cf8' : '#475569'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
        </svg>
      </div>

      {/* Bilgi — yatay, kompakt */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: isFollowed ? '#a5b4fc' : '#e2e8f0',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.2,
        }}>{name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span style={{ fontSize: 10, color: isOnline ? '#22c55e' : '#475569', fontWeight: 500 }}>
            {isOnline ? '● Çevrimiçi' : '○ Çevrimdışı'}
          </span>
          {speedKmh > 0 && (
            <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 700 }}>{speedKmh} km/h</span>
          )}
        </div>
      </div>

      {/* Km — sağda */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', flexShrink: 0 }}>{km} km</div>
    </button>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────
export default function LiveTracking({ isVisible, sessionsByDriver, deviceMappings, trucks }) {
  const [followedDriverId, setFollowedDriverId] = useState(null);
  const [showSidebar, setShowSidebar]           = useState(true);
  const didInitRef = useRef(false);

  useEffect(() => {
    if (!isVisible) { didInitRef.current = false; setFollowedDriverId(null); }
  }, [isVisible]);

  // Liste scroll — callback ref
  const listCallbackRef = useCallback((el) => {
    if (!el) return;
    const onWheel = (e) => {
      e.stopPropagation();
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
  }, []);



  const getDisplayName = (deviceId) => {
    const m = deviceMappings[deviceId];
    if (!m) return deviceId;
    const truck = trucks.find(t => t.id === m.truckId);
    return [m.driverName, truck?.plate].filter(Boolean).join(' - ') || deviceId;
  };

  const vehicleList = Object.entries(sessionsByDriver).map(([driverId, sessions]) => {
    if (!sessions.length) return null;
    const latestSession = sessions[sessions.length - 1];
    const lastPoint = latestSession[latestSession.length - 1];
    if (!lastPoint || isNaN(lastPoint.lat)) return null;
    const isOnline  = (Date.now() - new Date(lastPoint.timestamp).getTime()) < 15 * 60 * 1000;
    const speedKmh  = isOnline ? Math.round((lastPoint.speed || 0) * 3.6) : 0;
    const { km, durationMin } = calcStats(latestSession);
    return { driverId, latestSession, lastPoint, isOnline, speedKmh, km, durationMin, name: getDisplayName(driverId) };
  }).filter(Boolean);

  if (!isVisible) return null;

  const onlineCount = vehicleList.filter(v => v.isOnline).length;

  return (
    <>
      {/* Popup stili — site temasıyla birebir */}
      <style>{`
        .vehicle-popup .leaflet-popup-content-wrapper {
          border-radius: 20px; padding: 0; overflow: hidden;
          background: ${PANEL_BG};
          border: ${PANEL_BORDER};
          box-shadow: 0 24px 48px -8px rgba(0,0,0,0.8);
        }
        .vehicle-popup .leaflet-popup-tip-container { display: none; }
        .vehicle-popup .leaflet-popup-content { margin: 0; width: 210px !important; }
        .vehicle-popup .leaflet-popup-close-button {
          color: #475569 !important; top: 8px !important; right: 10px !important;
          font-size: 20px !important; line-height: 1 !important;
          background: none !important;
        }
        .vehicle-popup .leaflet-popup-close-button:hover { color: #f1f3f5 !important; }
      `}</style>

      <MapController
        sessionsByDriver={sessionsByDriver}
        followedDriverId={followedDriverId}
        setFollowedDriverId={setFollowedDriverId}
        didInitRef={didInitRef}
      />

      {/* Araç Markerları */}
      {vehicleList.map(v => (
        <React.Fragment key={`live-${v.driverId}`}>
          {v.latestSession.length > 1 && (
            v.isOnline
              ? <SpeedPolylines session={v.latestSession} isFollowed={followedDriverId === v.driverId} />
              : <Polyline
                  positions={v.latestSession.filter(p => !isNaN(p.lat)).map(p => [p.lat, p.lon])}
                  color="#334155"
                  weight={2.5}
                  opacity={0.4}
                  dashArray="6,10"
                />
          )}
          <VehicleMarker
            driverId={v.driverId}
            lastPoint={v.lastPoint}
            isOnline={v.isOnline}
            isFollowed={followedDriverId === v.driverId}
            speedKmh={v.speedKmh}
            km={v.km}
            durationMin={v.durationMin}
            name={v.name}
            setFollowedDriverId={setFollowedDriverId}
          />
        </React.Fragment>
      ))}

      {/* ── Sidebar — kompakt, yatay ─────────────────────────────────── */}
      {showSidebar && (
        <div
          className="absolute left-4 z-[1500]"
          style={{
            top: '76px',
            width: 280,
            background: PANEL_BG,
            border: PANEL_BORDER,
            borderRadius: 20,
            boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
            overflow: 'hidden',
          }}
        >
          {/* Başlık */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px 10px',
            borderBottom: CARD_BORDER,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={14} color="#818cf8" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Canlı Araçlar</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Aktif sayacı */}
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#22c55e',
                padding: '2px 7px', borderRadius: 20,
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.2)',
              }}>{onlineCount} Aktif</span>
              {/* Kapat */}
              <button
                onClick={() => setShowSidebar(false)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: 8, border: 'none',
                  background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
                  color: '#475569',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#f1f3f5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#475569'; }}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Araç listesi */}
          <div ref={listCallbackRef} style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {vehicleList.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 8 }}>
                <WifiOff size={24} color="#334155" />
                <span style={{ fontSize: 11, color: '#334155', textAlign: 'center' }}>Aktif araç yok</span>
              </div>
            ) : (
              vehicleList.map(v => (
                <SidebarItem
                  key={v.driverId}
                  driverId={v.driverId}
                  name={v.name}
                  isOnline={v.isOnline}
                  speedKmh={v.speedKmh}
                  km={v.km}
                  lastPoint={v.lastPoint}
                  isFollowed={followedDriverId === v.driverId}
                  setFollowedDriverId={setFollowedDriverId}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Sidebar kapalıyken: ikon buton */}
      {!showSidebar && (
        <button
          onClick={() => setShowSidebar(true)}
          className="absolute left-4 z-[1500]"
          style={{
            top: '76px',
            padding: '10px 14px',
            background: PANEL_BG,
            border: PANEL_BORDER,
            borderRadius: 14,
            color: '#818cf8',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Activity size={15} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>Araçlar</span>
        </button>
      )}
    </>
  );
}

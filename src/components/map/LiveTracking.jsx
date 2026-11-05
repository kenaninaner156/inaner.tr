import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { calcStats, cleanGpsSpikes, haversineKm, getPointTime } from '../../utils/mapUtils';
import { Activity, WifiOff, X, Search, ShieldAlert, Navigation, Compass, Crosshair, ChevronRight, ChevronDown, Check, Maximize2, Video, Power, Loader2, Key, Battery, Wifi } from 'lucide-react';
import CameraModal from './CameraModal';
import { getCameraConfig, fetchLiveStreamUrl, attachStreamToVideo, wakeUpCamera, fetchCameraTelemetry } from '../../services/cameraService';

// ── Tema renkleri — site ile tam uyumlu ──────────────────────────────────
const PANEL_BG     = 'rgba(13, 18, 25, 0.96)';
const PANEL_BORDER = '1px solid rgba(255, 255, 255, 0.05)';

// ── Leaflet Dinamik İkon Oluşturucu (Obsidiyen Çerçeveli Tır İkonu) ────────
const vehicleIconCache = new Map();

const createVehicleIcon = (isOnline, isMapped, speedKmh = 0, isFollowed = false) => {
  const isMoving = isOnline && speedKmh > 7;
  const cacheKey = `${isOnline ? 1 : 0}_${isMoving ? 1 : 0}_${isFollowed ? 1 : 0}_${isMapped ? 1 : 0}`;
  if (vehicleIconCache.has(cacheKey)) {
    return vehicleIconCache.get(cacheKey);
  }

  let borderColor = 'rgba(255, 255, 255, 0.2)';
  let shadow = '0 4px 14px rgba(0,0,0,0.7)';
  
  if (isFollowed) {
    borderColor = '#34d399';
    shadow = '0 4px 20px rgba(0,0,0,0.85), 0 0 12px rgba(52, 211, 153, 0.45)';
  } else if (isOnline) {
    if (isMoving) {
      borderColor = '#10b981';
      shadow = '0 4px 16px rgba(0,0,0,0.75), 0 0 10px rgba(16, 185, 129, 0.35)';
    } else {
      borderColor = '#f59e0b';
      shadow = '0 4px 16px rgba(0,0,0,0.75), 0 0 8px rgba(245, 158, 11, 0.3)';
    }
  }

  const imgFilter = isOnline 
    ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' 
    : 'grayscale(0.6) opacity(0.65)';

  const html = `
    <div style="position: relative; width: 40px; height: 40px; pointer-events: auto;">
      <div style="
        width: 40px;
        height: 40px;
        background: #0c1018;
        border: 2px solid ${borderColor};
        border-radius: 50%;
        box-shadow: ${shadow};
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        cursor: var(--map-pointer-cursor, url('/middle-finger.cur'), pointer);
        box-sizing: border-box;
      ">
        <img 
          src="/tir-clear.png" 
          alt="Tır" 
          style="
            width: 28px !important;
            height: 28px !important;
            max-width: 28px !important;
            max-height: 28px !important;
            object-fit: contain !important;
            filter: ${imgFilter};
            display: block !important;
            pointer-events: none;
          " 
        />
      </div>
    </div>
  `;

  const icon = L.divIcon({
    html: html,
    className: 'custom-vehicle-marker-div',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

  vehicleIconCache.set(cacheKey, icon);
  return icon;
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

// ── Harita Görsel Merkezleme Yardımcıları (Sidebar 300px Ofset Desteği) ────
const centerVehicleOnMap = (map, lat, lon, zoom = 15, hasSidebar = true) => {
  if (!map || isNaN(lat) || isNaN(lon)) return;
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
  const targetZoom = zoom || (typeof map.getZoom === 'function' ? map.getZoom() : 15);
  
  try {
    if (isDesktop && hasSidebar && typeof map.project === 'function' && typeof map.unproject === 'function') {
      const point = map.project([lat, lon], targetZoom);
      if (point && !isNaN(point.x) && !isNaN(point.y)) {
        const offsetPoint = L.point(point.x - 150, point.y);
        const targetLatLng = map.unproject(offsetPoint, targetZoom);
        map.setView(targetLatLng, targetZoom, { animate: true, duration: 0.8 });
        return;
      }
    }
  } catch (e) {
    console.warn('Center offset error:', e);
  }
  map.setView([lat, lon], targetZoom, { animate: true, duration: 0.8 });
};

const panVehicleOnMap = (map, lat, lon, hasSidebar = true) => {
  if (!map || isNaN(lat) || isNaN(lon)) return;
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
  try {
    const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : 15;
    if (isDesktop && hasSidebar && typeof map.project === 'function' && typeof map.unproject === 'function') {
      const point = map.project([lat, lon], currentZoom);
      if (point && !isNaN(point.x) && !isNaN(point.y)) {
        const offsetPoint = L.point(point.x - 150, point.y);
        const targetLatLng = map.unproject(offsetPoint, currentZoom);
        map.panTo(targetLatLng, { animate: true, duration: 0.8 });
        return;
      }
    }
  } catch (e) {
    console.warn('Pan offset error:', e);
  }
  map.panTo([lat, lon], { animate: true, duration: 0.8 });
};

const fitVehiclesBounds = (map, points, hasSidebar = true) => {
  if (!map || !points || points.length === 0) return;
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
  try {
    const bounds = L.latLngBounds(points);
    if (!bounds.isValid()) return;
    if (isDesktop && hasSidebar) {
      map.fitBounds(bounds, {
        paddingTopLeft: [100, 340],
        paddingBottomRight: [80, 80],
        maxZoom: 14,
        animate: true,
        duration: 0.8
      });
    } else {
      map.fitBounds(bounds, {
        padding: [80, 80],
        maxZoom: 14,
        animate: true,
        duration: 0.8
      });
    }
  } catch (e) {
    console.warn('Fit bounds error:', e);
  }
};

function SpeedPolylines({ session, isFollowed, zoom }) {
  if (!session || session.length < 2) return null;
  
  // Kronolojik sıraya diz ve sıçramaları/mükerrer noktaları temizle
  const cleaned = useMemo(() => {
    return cleanGpsSpikes(session);
  }, [session]);

  if (!cleaned || cleaned.length < 2) return null;

  const rawSegments = [];
  
  // Dinamik ve akıcı çizgi kalınlığı formülü (zoom derecesine göre kesintisiz ölçeklenir)
  const baseWeight = Math.max(1.5, (zoom - 7) * 0.35 + 1.2);
  const weight = Math.min(5.5, Math.max(1.5, isFollowed ? baseWeight * 1.35 : baseWeight));
  const shadowWeight = weight + 2.5;

  for (let i = 0; i < cleaned.length - 1; i++) {
    const a = cleaned[i], b = cleaned[i + 1];
    if (isNaN(a.lat) || isNaN(b.lat)) continue;

    // Kopukluk ve imkansız ışınlanma kontrolü (arazi/şehir üzerinden düz hat çekmesini önler)
    const distKm = haversineKm(a.lat, a.lon, b.lat, b.lon);
    const tA = getPointTime(a);
    const tB = getPointTime(b);
    const timeDiffMin = tA && tB ? Math.abs(tB - tA) / 60000 : 0;
    const impliedSpeed = timeDiffMin > 0 ? (distKm / (timeDiffMin / 60)) : 0;

    if (distKm > 1.8 && (impliedSpeed > 130 || timeDiffMin > 15)) {
      continue; // Bu iki nokta arasına çizgi çekme, yeni segmente geç
    }

    const color = getSpeedColor(a.speed);
    const last = rawSegments[rawSegments.length - 1];
    if (last && last.color === color) {
      last.positions.push([b.lat, b.lon]);
    } else {
      rawSegments.push({ color, positions: [[a.lat, a.lon], [b.lat, b.lon]] });
    }
  }

  const rawPositions = cleaned.filter(p => !isNaN(p.lat)).map(p => [p.lat, p.lon]);

  // 1. SEÇİLİ OLMAYAN DİĞER ARAÇLAR: Silik gölge hat (karışmayı tamamen önler)
  if (!isFollowed) {
    const faintWeight = Math.max(1.5, (zoom - 7) * 0.25 + 1.2);
    return (
      <Polyline
        positions={rawPositions}
        color="#64748b"
        weight={faintWeight}
        opacity={0.25}
        dashArray="4, 4"
        smoothFactor={1.2}
      />
    );
  }

  // 2. SEÇİLİ ARAÇ: Canlı, parlak, renkli hız segmentleri ve derin alt gölge
  return (
    <>
      {/* ── Alt Gölge (Derin Dış Hat) ── */}
      <Polyline
        positions={rawPositions}
        color="#000000"
        weight={shadowWeight}
        opacity={0.45}
        smoothFactor={1}
      />
      {/* ── Renkli Gerçek GPS Hız Çizgileri ── */}
      {rawSegments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg.positions}
          color={seg.color}
          weight={weight}
          opacity={0.95}
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
  isVisible,
  showSidebar
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
      centerVehicleOnMap(map, pt.lat, pt.lon, 15, showSidebar);
      setFollowedDriverId(activeVehicles[0].driverId);
      setIsCameraFollowActive(true);
      didInitRef.current = true;
    } else if (activeVehicles.length > 1) {
      // Birden fazla aktif araç varsa: Hepsini ekrana sığdır
      const pts = activeVehicles.map(v => [v.lastPoint.lat, v.lastPoint.lon]);
      fitVehiclesBounds(map, pts, showSidebar);
      didInitRef.current = true;
    } else {
      // Aktif araç yoksa: Son konumu olan tüm araçları sığdır veya ilkine odaklan
      const allPts = vehicleList.map(v => [v.lastPoint.lat, v.lastPoint.lon]).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
      if (allPts.length === 1) {
        centerVehicleOnMap(map, allPts[0][0], allPts[0][1], 12, showSidebar);
        didInitRef.current = true;
      } else if (allPts.length > 1) {
        fitVehiclesBounds(map, allPts, showSidebar);
        didInitRef.current = true;
      }
    }
  }, [vehicleList, map, didInitRef, isVisible, setFollowedDriverId, setIsCameraFollowActive, showSidebar]);

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
      panVehicleOnMap(map, p.lat, p.lon, showSidebar);
    }
  }, [vehicleList, followedDriverId, map, isVisible, isCameraFollowActive, showSidebar]);

  return null;
}

function VehicleMarker({ driverId, lastPoint, isOnline, isFollowed, speedKmh, name, isMapped, parkDurationText, setFollowedDriverId, setIsCameraFollowActive, showSidebar }) {
  const map = useMap();
  const markerRef = useRef(null);

  if (!lastPoint || isNaN(lastPoint.lat)) return null;

  const handleClick = () => {
    setFollowedDriverId(driverId);
    setIsCameraFollowActive(true);
    centerVehicleOnMap(map, lastPoint.lat, lastPoint.lon, 15, showSidebar);
  };

  const icon = createVehicleIcon(isOnline, isMapped, speedKmh, isFollowed);

  return (
    <Marker
      ref={markerRef}
      position={[lastPoint.lat, lastPoint.lon]}
      icon={icon}
      zIndexOffset={isFollowed ? 1000 : 0}
      eventHandlers={{ click: handleClick }}
    />
  );
}

// ── Yardımcı Park Süresi Formatlayıcı ────────────────────────────────────
const formatParkDuration = (minutes) => {
  if (minutes === null || minutes === undefined || isNaN(minutes) || minutes < 0) return '';
  if (minutes < 1) return 'Park <1dk';
  if (minutes < 60) return `Park ${minutes}dk`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `Park ${hrs}s`;
  return `Park ${hrs}s ${mins}dk`;
};

// ── Yardımcı Süre Formatlayıcı (Kompakt & İnsan Okumasına Uygun) ──────────
const formatDuration = (minutes) => {
  if (!minutes || isNaN(minutes) || minutes <= 0) return '0d';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}d`;
  return `${hrs}s ${mins.toString().padStart(2, '0')}d`;
};

// ── Seçili Araç Kartı Altında Canlı Kamera Önizlemesi ────────────────────
function InlineCameraPreview({ driverId, quality = 'sd', onOpenCamera }) {
  const camConfig = getCameraConfig(driverId);
  const [streamUrl, setStreamUrl] = useState(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [wakeFeedback, setWakeFeedback] = useState('');
  const [telemetry, setTelemetry] = useState(null);
  const videoRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!camConfig) return;
    let cancelled = false;
    fetchCameraTelemetry(driverId).then((t) => {
      if (!cancelled && t) setTelemetry(t);
    });
    return () => {
      cancelled = true;
    };
  }, [driverId, camConfig]);

  const handleInlineWakeUp = async (e) => {
    e.stopPropagation();
    if (isWakingUp) return;
    setIsWakingUp(true);
    setWakeFeedback('Uyandırılıyor...');
    try {
      const res = await wakeUpCamera(driverId);
      if (res.success) {
        setWakeFeedback('Sinyal iletildi');
      } else {
        setWakeFeedback(res.message || 'Hata');
      }
    } catch {
      setWakeFeedback('Hata');
    }
    setTimeout(() => {
      fetchLiveStreamUrl(driverId, quality).then((info) => {
        if (info?.url) setStreamUrl(info.url);
      });
      setIsWakingUp(false);
      setTimeout(() => setWakeFeedback(''), 3500);
    }, 2500);
  };

  useEffect(() => {
    if (!camConfig) return;
    let cancelled = false;

    fetchLiveStreamUrl(driverId, quality).then((info) => {
      if (cancelled) return;
      if (info?.url) {
        setStreamUrl(info.url);
      } else {
        setStreamUrl(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [driverId, quality, camConfig]);

  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;
    let cancelled = false;

    const connect = async () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      const cleanup = await attachStreamToVideo(videoRef.current, streamUrl);
      if (cancelled) {
        if (cleanup) cleanup();
        return;
      }
      cleanupRef.current = cleanup;
    };

    connect();
    return () => {
      cancelled = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [streamUrl]);

  if (!camConfig) return null;

  return (
    <div className="px-2.5 pb-2.5 pt-1">
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (onOpenCamera) onOpenCamera(driverId);
        }}
        className="relative w-full h-[126px] rounded-xl overflow-hidden border border-white/[0.08] bg-[#080b11] cursor-pointer group shadow-[0_8px_24px_rgba(0,0,0,0.65)] select-none flex flex-col justify-between p-2.5"
      >
        {/* Canlı Video Elemanı (Görüntü aktığı an görünür) */}
        {streamUrl && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            
            onLoadedData={() => setIsVideoReady(true)}
            onPlaying={() => setIsVideoReady(true)}
            onError={() => setIsVideoReady(false)}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 group-hover:scale-[1.03] ${
              isVideoReady ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
            }`}
          />
        )}

        {/* Video henüz akmıyorken veya araç beklemedeyken arkadaki zarif Obsidian kart */}
        {!isVideoReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-gradient-to-b from-[#0d1219] to-[#07090e] z-0 gap-1.5">
            <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-emerald-400 shadow-md">
              <Video size={16} />
            </div>
            <div className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors">
              Araç Kamerası (JC182)
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {wakeFeedback ||
              (streamUrl
                ? 'Canlı Akış Hazırlanıyor...'
                : telemetry?.statusStr
                  ? `${telemetry.statusStr} • Kontak Kapalı`
                  : 'Park Modu / Kontak Kapalı')}
            </div>
          </div>
        )}

        {/* Üst Durum Rozeti ve Uyandırma / Büyütme Butonları */}
        <div className="relative z-20 flex items-center justify-between pointer-events-none w-full">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/[0.08]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isVideoReady
                  ? 'bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse'
                  : 'bg-amber-400'
              }`}
            />
            <span className="text-[9px] font-mono font-bold text-white tracking-wider">
              {isVideoReady ? 'CANLI' : 'BEKLEMEDE'}
            </span>
          </div>

          <div className="flex items-center gap-1 pointer-events-auto">
            <button
              type="button"
              onClick={handleInlineWakeUp}
              disabled={isWakingUp}
              title="Kamerayı 4G üzerinden uyandır"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 active:scale-95 text-white text-[10px] font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-sm border border-emerald-400/30"
            >
              {isWakingUp ? (
                <Loader2 size={10} className="animate-spin text-white" />
              ) : (
                <Power size={10} className="text-white" />
              )}
              <span>{isWakingUp ? 'Uyandırılıyor...' : 'Uyandır'}</span>
            </button>

            <div
              className="w-6 h-6 rounded-lg bg-black/60 backdrop-blur-md border border-white/[0.08] flex items-center justify-center text-white/80 group-hover:text-white group-hover:bg-black/80 transition-all"
              title="Tam Ekran Aç"
            >
              <Maximize2 size={11} />
            </div>
          </div>
        </div>

        {/* Alt Bilgi İpucu */}
        <div className="relative z-20 text-[9px] text-slate-400 font-mono pointer-events-none flex items-center justify-between">
          <span>Tam ekran izlemek için tıklayın</span>
          {telemetry?.voltage && (
            <span className="text-slate-300 font-medium">
              Akü: {telemetry.voltage} • {telemetry.satellites || 19} Uydu
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ 
  vehicle, 
  isFollowed, 
  setFollowedDriverId,
  setIsCameraFollowActive,
  cameraQuality,
  onOpenCamera
}) {
  const map = useMap();
  const { driverId, driverName, plate, name, isOnline, speedKmh, km, lastPoint, topSpeedKmh, avgSpeedKmh, parkDurationText } = vehicle;
  const hasCamera = Boolean(getCameraConfig(driverId));

  const borderClass = isFollowed 
    ? 'border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.6)]' 
    : 'border-white/[0.05] hover:border-white/10';
    
  const bgClass = isFollowed 
    ? 'bg-[#111622]/95' 
    : 'bg-[#0f141d]/70 hover:bg-[#111622]/80';

  const handleHeaderClick = () => {
    centerVehicleOnMap(map, lastPoint.lat, lastPoint.lon, 15, true);
    setFollowedDriverId(driverId);
    setIsCameraFollowActive(true);
  };

  const pointTime = vehicle.pointTime || getPointTime(lastPoint);
  const diffSec = Math.max(0, Math.floor((Date.now() - pointTime) / 1000));
  const livePingText = diffSec < 60 ? `${diffSec} sn önce` : `${Math.floor(diffSec / 60)} dk önce`;

  // Sadece çevrimdışı ve park durumu; yoldaysa bir bilgiye gerek yok (sinyal dahil)
  const subtitleText = !isOnline 
    ? 'Çevrimdışı' 
    : (speedKmh <= 7
        ? (parkDurationText || 'Park')
        : null);

  return (
    <div className={`w-full rounded-2xl border transition-all duration-200 overflow-hidden ${borderClass} ${bgClass}`}>
      {/* Header */}
      <div 
        onClick={handleHeaderClick}
        className="w-full flex items-center justify-between p-3.5 cursor-pointer select-none gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold tracking-tight truncate ${isFollowed ? 'text-white' : 'text-slate-200'}`}>
              {driverName || name}
            </span>
            {hasCamera && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenCamera) onOpenCamera(driverId);
                  }}
                  title="Kamera ve Canlı Yayını Aç"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold transition-all shrink-0 cursor-pointer shadow-sm"
                >
                  <Video size={10} />
                  <span>Kamera</span>
                </button>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border shrink-0 ${
                    vehicle.ignition || vehicle.acc === 1 || speedKmh > 7
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                      : "bg-amber-500/15 border-amber-500/30 text-amber-400"
                  }`}
                  title={vehicle.ignition || vehicle.acc === 1 || speedKmh > 7 ? "Kontak Açık" : "Kontak Kapalı"}
                >
                  <Key size={10} />
                  <span>{vehicle.ignition || vehicle.acc === 1 || speedKmh > 7 ? "Kontak Açık" : "Kontak Kapalı"}</span>
                </span>
              </>
            )}
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

      {/* Expanded Telemetry Section (Clean 3-Column Strip + Inline Live Camera if stream available) */}
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
                    <span className="text-slate-300 font-sans text-xs font-semibold leading-tight">
                      {parkDurationText || 'Park'}
                    </span>
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

            <InlineCameraPreview
              driverId={driverId}
              quality={cameraQuality}
              onOpenCamera={onOpenCamera}
            />
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
        top: 'calc(var(--safe-top) + 78px)'
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
  onSelectVehicle,
  cameraQuality,
  onOpenCamera
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { driverId, driverName, plate, name, isOnline, speedKmh, km, topSpeedKmh, avgSpeedKmh, parkDurationText } = vehicle;
  const hasCamera = Boolean(getCameraConfig(driverId));

  const cardRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  const subtitleText = !isOnline 
    ? 'Çevrimdışı' 
    : (speedKmh <= 7
        ? (parkDurationText || 'Park')
        : null);

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
            {hasCamera && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenCamera) onOpenCamera(driverId);
                  }}
                  title="Kamera ve Canlı Yayını Aç"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold transition-all shrink-0 cursor-pointer shadow-sm"
                >
                  <Video size={10} />
                  <span>Kamera</span>
                </button>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border shrink-0 ${
                    vehicle.ignition || vehicle.acc === 1 || speedKmh > 7
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                      : "bg-amber-500/15 border-amber-500/30 text-amber-400"
                  }`}
                  title={vehicle.ignition || vehicle.acc === 1 || speedKmh > 7 ? "Kontak Açık" : "Kontak Kapalı"}
                >
                  <Key size={10} />
                  <span>{vehicle.ignition || vehicle.acc === 1 || speedKmh > 7 ? "Kontak Açık" : "Kontak Kapalı"}</span>
                </span>
              </>
            )}
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
                    {v.km} km
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

      {/* 3 Kolonlu Telemetri İstatistikleri + Canlı Kamera (Görüntü Varsa) */}
      <div className="bg-[#0b0e15]/80 rounded-2xl border border-white/[0.04] overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-white/[0.05] p-2 text-center">
          <div className="px-1">
            <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">ANLIK HIZ</div>
            <div className="text-xs font-mono font-bold text-slate-100 mt-0.5">
              {!isOnline ? (
                <span className="text-slate-500 font-sans text-[10px]">Çevrimdışı</span>
              ) : speedKmh <= 7 ? (
                <span className="text-slate-300 font-sans text-[11px] font-semibold leading-tight">
                  {parkDurationText || 'Park'}
                </span>
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

        <InlineCameraPreview
          driverId={driverId}
          quality={cameraQuality}
          onOpenCamera={onOpenCamera}
        />
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
  const [activeCameraDriverId, setActiveCameraDriverId] = useState(null);
  const [cameraQuality, setCameraQuality] = useState('sd');
  const didInitRef = useRef(false);

  // Canlı park süresi sayacı ve saniyelik sinyal akışı için periyodik güncelleme (1 saniyede bir)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  const DEFAULT_MAPPINGS = {
    Mert: { driverName: 'Mert', plate: '06 FTN 692' },
    Goksel: { driverName: 'Göksel', plate: '06 FTN 692' },
    'Göksel': { driverName: 'Göksel', plate: '06 FTN 692' },
  };

  const getVehicleInfo = (deviceId) => {
    const normalized = deviceId === 'Goksel' ? 'Göksel' : deviceId;
    const def = DEFAULT_MAPPINGS[normalized] || DEFAULT_MAPPINGS[deviceId] || {};
    const m = deviceMappings?.[normalized] || deviceMappings?.[deviceId];
    const truck = (trucks || []).find(t => t.id === m?.truckId);
    const driverName = m?.driverName || def.driverName || (deviceId ? `Cihaz (${deviceId})` : 'Bilinmeyen');
    const plate = truck?.plate || m?.plate || def.plate || '';
    return {
      driverName,
      plate
    };
  };

  const effectiveSessionsByDriver = useMemo(() => {
    return sessionsByDriver || {};
  }, [sessionsByDriver]);

  const vehicleList = Object.entries(effectiveSessionsByDriver)
    .map(([driverId, sessions]) => {
      if (!sessions.length) return null;
      const latestSession = sessions[sessions.length - 1];
      const lastPoint = latestSession[latestSession.length - 1];
      if (!lastPoint || isNaN(lastPoint.lat)) return null;
      
      const pointTime = getPointTime(lastPoint);
      const isOnline  = pointTime > 0 && (now - pointTime) < 30 * 60 * 1000;
      const speedKmh  = isOnline ? Math.round((lastPoint.speed || 0) * 1.852) : 0;
      // 1 Günlük KM Sayacı (Gece 00:00'dan 00:00'a kadar)
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const midnightTime = todayMidnight.getTime();

      let dailyKmVal = 0;
      if (lastPoint && typeof lastPoint.dailyKm === 'number' && lastPoint.dailyKm > 0) {
        dailyKmVal = lastPoint.dailyKm;
      } else {
        const allDriverPoints = sessions.flat();
        const todayPoints = allDriverPoints.filter(p => getPointTime(p) >= midnightTime);
        const stats = calcStats(todayPoints.length >= 2 ? todayPoints : latestSession);
        dailyKmVal = stats.km;
      }

      const { durationMin, topSpeedKmh, avgSpeedKmh } = calcStats(latestSession);
      const km = dailyKmVal;
      const isMapped  = !!deviceMappings?.[driverId] || !!DEFAULT_MAPPINGS[driverId];
      const info = getVehicleInfo(driverId);
      
      const isParked = isOnline && speedKmh <= 7;
      let parkDurationMin = 0;
      let parkDurationText = '';

      if (isParked) {
        const allPoints = sessions.flat();
        let parkStartTime = pointTime;

        for (let i = allPoints.length - 1; i >= 0; i--) {
          const pt = allPoints[i];
          const ptSpeedKmh = Math.round((pt.speed || 0) * 1.852);
          if (ptSpeedKmh > 7) {
            const stopPt = allPoints[i + 1] || pt;
            parkStartTime = getPointTime(stopPt);
            break;
          }
          parkStartTime = getPointTime(pt);
        }

        const diffMs = Math.max(0, now - parkStartTime);
        parkDurationMin = Math.floor(diffMs / 60000);
        parkDurationText = formatParkDuration(parkDurationMin);
      }

      return { 
        driverId, 
        latestSession, 
        lastPoint, 
        pointTime,
        isOnline, 
        speedKmh, 
        km, 
        durationMin, 
        topSpeedKmh,
        avgSpeedKmh,
        driverName: info.driverName,
        plate: info.plate,
        name: info.driverName,
        heading: lastPoint.heading || 0,
        isMapped,
        parkDurationMin,
        parkDurationText
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
        .custom-vehicle-marker-div {
          background: transparent !important;
          border: none !important;
        }
        .custom-vehicle-marker-div img {
          width: 28px !important;
          height: 28px !important;
          max-width: 28px !important;
          max-height: 28px !important;
          object-fit: contain !important;
          display: block !important;
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
        showSidebar={showSidebar}
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
              parkDurationText={v.parkDurationText}
              setFollowedDriverId={setFollowedDriverId} 
              setIsCameraFollowActive={setIsCameraFollowActive}
              showSidebar={showSidebar}
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
              cameraQuality={cameraQuality}
              onOpenCamera={(driverId) => setActiveCameraDriverId(driverId)}
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
            className="hidden md:flex absolute left-4 w-[300px] z-[1500] flex-col rounded-3xl" 
            style={{
              top: 'calc(5.25rem + var(--safe-top))',
              maxHeight: 'calc(100vh - 6.5rem - var(--safe-top))',
              background: '#0D1219',
              border: PANEL_BORDER,
              boxShadow: '0 8px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.03)',
              overflow: 'hidden'
            }}
          >
            <div className="flex justify-between items-center px-5 py-4 border-b border-white/[0.05] shrink-0">
              <h2 className="text-sm font-bold text-white tracking-tight">
                Canlı Araçlar
              </h2>
              <button
                onClick={() => setShowSidebar(false)}
                className="p-1.5 text-slate-500 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-xl transition-all cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>

            <div ref={listCallbackRef} className="p-3 flex flex-col gap-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
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
                    cameraQuality={cameraQuality}
                    onOpenCamera={(driverId) => setActiveCameraDriverId(driverId)}
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
            className="hidden md:flex absolute left-4 z-[1500] p-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/20 transition-all cursor-pointer"
            style={{
              top: 'calc(5.25rem + var(--safe-top))'
            }}
          >
            <Activity size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      <CameraModal
        isOpen={Boolean(activeCameraDriverId)}
        onClose={() => setActiveCameraDriverId(null)}
        deviceId={activeCameraDriverId}
        initialQuality={cameraQuality}
        onQualityChange={setCameraQuality}
      />
    </>
  );
}

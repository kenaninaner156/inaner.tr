import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { calcStats, cleanGpsSpikes, haversineKm, getPointTime } from '../../utils/mapUtils';
import { Activity, WifiOff, X, ChevronRight, ChevronDown, Check, Maximize2, Clock, Video } from 'lucide-react';
import CameraModal from './CameraModal';
import {
  getCameraConfig,
  fetchLiveStreamUrl,
  attachStreamToVideo,
  fetchCameraTelemetry,
  closeCameraStream,
} from '../../services/cameraService';

// ── Tema renkleri — site ile tam uyumlu ──────────────────────────────────
const PANEL_BORDER = '1px solid rgba(255, 255, 255, 0.05)';

// ── Leaflet Dinamik İkon Oluşturucu (Obsidiyen Çerçeveli Tır İkonu) ────────
const vehicleIconCache = new Map();

const createVehicleIcon = (isOnline, isMapped, isMoving = false, isFollowed = false) => {
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
  const cleaned = useMemo(() => {
    if (!session || session.length < 2) return [];
    return cleanGpsSpikes(session);
  }, [session]);

  if (!cleaned || cleaned.length < 2) return null;

  const rawSegments = [];

  const baseWeight = Math.max(1.5, (zoom - 7) * 0.35 + 1.2);
  const weight = Math.min(5.5, Math.max(1.5, isFollowed ? baseWeight * 1.35 : baseWeight));
  const shadowWeight = weight + 2.5;

  for (let i = 0; i < cleaned.length - 1; i++) {
    const a = cleaned[i], b = cleaned[i + 1];
    if (isNaN(a.lat) || isNaN(b.lat)) continue;

    const distKm = haversineKm(a.lat, a.lon, b.lat, b.lon);
    const tA = getPointTime(a);
    const tB = getPointTime(b);
    const timeDiffMin = tA && tB ? Math.abs(tB - tA) / 60000 : 0;
    const impliedSpeed = timeDiffMin > 0 ? (distKm / (timeDiffMin / 60)) : 0;

    if (distKm > 1.8 && (impliedSpeed > 130 || timeDiffMin > 15)) {
      continue;
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

  return (
    <>
      <Polyline
        positions={rawPositions}
        color="#000000"
        weight={shadowWeight}
        opacity={0.45}
        smoothFactor={1}
      />
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

  useEffect(() => {
    if (!isVisible || didInitRef.current || !map || !vehicleList || !vehicleList.length) return;

    const activeVehicles = vehicleList.filter(v => v.isOnline && v.lastPoint && !isNaN(v.lastPoint.lat));

    if (activeVehicles.length === 1) {
      const pt = activeVehicles[0].lastPoint;
      centerVehicleOnMap(map, pt.lat, pt.lon, 15, showSidebar);
      setFollowedDriverId(activeVehicles[0].driverId);
      setIsCameraFollowActive(true);
      didInitRef.current = true;
    } else if (activeVehicles.length > 1) {
      const pts = activeVehicles.map(v => [v.lastPoint.lat, v.lastPoint.lon]);
      fitVehiclesBounds(map, pts, showSidebar);
      didInitRef.current = true;
    } else {
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

    if (prevDriverIdRef.current !== followedDriverId) {
      prevDriverIdRef.current = followedDriverId;
      prevCoordsRef.current = coordsKey;
      return;
    }

    if (prevCoordsRef.current !== coordsKey) {
      prevCoordsRef.current = coordsKey;
      panVehicleOnMap(map, p.lat, p.lon, showSidebar);
    }
  }, [vehicleList, followedDriverId, map, isVisible, isCameraFollowActive, showSidebar]);

  return null;
}

function VehicleMarker({ driverId, lastPoint, isOnline, isFollowed, isMoving, isMapped, setFollowedDriverId, setIsCameraFollowActive, showSidebar }) {
  const map = useMap();
  const markerRef = useRef(null);
  const animFrameRef = useRef(null);
  const displayPosRef = useRef(
    lastPoint && !isNaN(lastPoint.lat) ? [Number(lastPoint.lat), Number(lastPoint.lon)] : null
  );
  const [initialPos] = useState(() =>
    lastPoint && !isNaN(lastPoint.lat) ? [Number(lastPoint.lat), Number(lastPoint.lon)] : [39.92, 32.85]
  );

  const targetLat = lastPoint ? Number(lastPoint.lat) : NaN;
  const targetLon = lastPoint ? Number(lastPoint.lon) : NaN;

  // Yeni GPS konumu geldiğinde simgeyi sıçratmak yerine pürüzsüzce kaydır
  useEffect(() => {
    if (isNaN(targetLat) || isNaN(targetLon)) return;
    const marker = markerRef.current;
    if (!marker) {
      displayPosRef.current = [targetLat, targetLon];
      return;
    }

    const prev = displayPosRef.current;
    if (!prev) {
      displayPosRef.current = [targetLat, targetLon];
      marker.setLatLng([targetLat, targetLon]);
      return;
    }

    const [startLat, startLon] = prev;
    if (Math.abs(targetLat - startLat) < 0.000002 && Math.abs(targetLon - startLon) < 0.000002) {
      return;
    }

    const distDeg = Math.hypot(targetLat - startLat, targetLon - startLon);
    // > ~600m sıçramalarda doğrudan taşı, normal seyirde 900ms pürüzsüz süzülme uygula
    if (distDeg > 0.006) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      displayPosRef.current = [targetLat, targetLon];
      marker.setLatLng([targetLat, targetLon]);
      return;
    }

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const startTime = performance.now();
    const durationMs = 900;

    const step = (now) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      const curLat = startLat + (targetLat - startLat) * eased;
      const curLon = startLon + (targetLon - startLon) * eased;
      displayPosRef.current = [curLat, curLon];
      if (markerRef.current) {
        markerRef.current.setLatLng([curLat, curLon]);
      }
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [targetLat, targetLon]);

  if (!lastPoint || isNaN(lastPoint.lat)) return null;

  const handleClick = () => {
    setFollowedDriverId(driverId);
    setIsCameraFollowActive(true);
    centerVehicleOnMap(map, lastPoint.lat, lastPoint.lon, 15, showSidebar);
  };

  const icon = createVehicleIcon(isOnline, isMapped, isMoving, isFollowed);

  return (
    <Marker
      ref={markerRef}
      position={initialPos}
      icon={icon}
      zIndexOffset={isFollowed ? 1000 : 0}
      eventHandlers={{ click: handleClick }}
    />
  );
}

// ── Yardımcı Rölanti / Park Süresi Formatlayıcı ──────────────────────────
const formatStationaryStatus = (minutes, isIdling = false) => {
  const prefix = isIdling ? 'Rölanti' : 'Park';
  if (minutes === null || minutes === undefined || isNaN(minutes) || minutes < 0) return prefix;
  if (minutes < 1) return `${prefix} <1 dk`;
  if (minutes < 60) return `${prefix} ${minutes} dk`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs >= 24) {
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return remHrs > 0 ? `${prefix} ${days} g ${remHrs} s` : `${prefix} ${days} g`;
  }
  if (mins === 0) return `${prefix} ${hrs} s`;
  return `${prefix} ${hrs} s ${mins} dk`;
};

// ── Seçili Araç Kartı Altında Otomatik Katlanan Obsidian Kamera Önizlemesi ──
function InlineCameraPreview({
  driverId,
  quality = 'sd',
  isActiveViewport = true,
  isModalOpen = false,
  onOpenCamera,
}) {
  const camConfig = getCameraConfig(driverId);
  const [streamInfo, setStreamInfo] = useState(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [telemetry, setTelemetry] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [quotaPaused, setQuotaPaused] = useState(false);
  const [isTabHidden, setIsTabHidden] = useState(() =>
    typeof document !== 'undefined' ? document.hidden : false
  );

  const videoRef = useRef(null);
  const cleanupRef = useRef(null);
  const videoReadyRef = useRef(false);
  const isModalOpenRef = useRef(isModalOpen);
  const hadStreamRef = useRef(false);

  useEffect(() => {
    isModalOpenRef.current = isModalOpen;
    if (!isModalOpen) {
      Promise.resolve().then(() => setQuotaPaused(false));
    }
  }, [isModalOpen]);

  // Sekme gizlendiğinde 4G yayınını anında kapatıp SIM kotasını sessizce koru; geri dönüldüğünde yokla
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      const hidden = document.hidden;
      setIsTabHidden(hidden);
      if (hidden) {
        if (cleanupRef.current) {
          cleanupRef.current();
          cleanupRef.current = null;
        }
        if (hadStreamRef.current) {
          closeCameraStream(driverId, 'live');
          hadStreamRef.current = false;
        }
        videoReadyRef.current = false;
        setIsVideoReady(false);
        setStreamInfo(null);
      } else {
        setQuotaPaused(false);
        setRetryCount((c) => c + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [driverId]);

  // 75 Saniyelik Görünmez SIM Kota Koruması (kullanıcıya uyarı göstermeden yumuşakça katlanır)
  useEffect(() => {
    if (!isVideoReady) return;
    const guardTimer = setTimeout(() => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (hadStreamRef.current) {
        closeCameraStream(driverId, 'live');
        hadStreamRef.current = false;
      }
      videoReadyRef.current = false;
      setIsVideoReady(false);
      setStreamInfo(null);
      setQuotaPaused(true);
    }, 75000);
    return () => clearTimeout(guardTimer);
  }, [isVideoReady, driverId]);

  // Araç kartından çıkıldığında (tam ekran modal açılmadıysa) 4G yayınını kapatıp 50 GB SIM kotasını koru
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (hadStreamRef.current && !isModalOpenRef.current) {
        closeCameraStream(driverId, 'live');
      }
    };
  }, [driverId]);

  useEffect(() => {
    if (!camConfig || !isActiveViewport || isTabHidden) return;
    let cancelled = false;
    fetchCameraTelemetry(driverId).then((t) => {
      if (!cancelled && t) setTelemetry(t);
    });
    return () => {
      cancelled = true;
    };
  }, [driverId, camConfig, isActiveViewport, isTabHidden]);

  // Canlı yayın adresini yalnızca aktif ekranda, sekme görünürken ve modal kapalıyken al
  useEffect(() => {
    if (!camConfig || !isActiveViewport || isModalOpen || isTabHidden || quotaPaused) {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      Promise.resolve().then(() => {
        setStreamInfo(null);
        setIsVideoReady(false);
        videoReadyRef.current = false;
      });
      return;
    }

    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setIsVideoReady(false);
      videoReadyRef.current = false;
    });

    fetchLiveStreamUrl(driverId, quality).then((info) => {
      if (cancelled) return;
      if (info?.url) {
        hadStreamRef.current = true;
        setStreamInfo(info);
      } else {
        setStreamInfo(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [driverId, quality, camConfig, isActiveViewport, isModalOpen, isTabHidden, quotaPaused, retryCount]);

  // WSS-FLV akışını sessiz video katmanına bağla (hasAudio: false ile anında ilk kare çözümü)
  useEffect(() => {
    if (!streamInfo?.url || !videoRef.current || !isActiveViewport || isModalOpen || isTabHidden) return;
    let cancelled = false;

    const connectTimer = setTimeout(() => {
      if (!cancelled && !videoReadyRef.current) {
        if (cleanupRef.current) {
          cleanupRef.current();
          cleanupRef.current = null;
        }
        if (hadStreamRef.current) {
          closeCameraStream(driverId, 'live');
          hadStreamRef.current = false;
        }
        setStreamInfo(null);
      }
    }, 10000);

    const connect = async () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      const cleanup = await attachStreamToVideo(videoRef.current, streamInfo.url, {
        hasAudio: false,
        isLive: true,
        fallbackUrl: streamInfo.fallbackUrl || null,
        onError: () => {
          if (!cancelled && !videoReadyRef.current) {
            clearTimeout(connectTimer);
            setStreamInfo(null);
          }
        },
      });
      if (cancelled) {
        if (cleanup) cleanup();
        return;
      }
      cleanupRef.current = cleanup;
    };

    connect();
    return () => {
      cancelled = true;
      clearTimeout(connectTimer);
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [streamInfo, isActiveViewport, isModalOpen, isTabHidden, driverId]);

  if (!camConfig) return null;

  const markVideoPlaying = () => {
    videoReadyRef.current = true;
    setIsVideoReady(true);
  };

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
        isVideoReady ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
      }`}
    >
      <div className="overflow-hidden min-h-0">
        <div className="px-2.5 pb-2.5 pt-0.5">
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenCamera) onOpenCamera(driverId, 'live');
            }}
            className="relative w-full h-[136px] rounded-xl overflow-hidden border border-white/[0.06] hover:border-white/[0.14] bg-[#0a0d14] cursor-pointer group transition-colors select-none flex flex-col justify-between"
          >
            {/* Canlı Video Katmanı */}
            {streamInfo?.url && (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                disableRemotePlayback
                x-webkit-airplay="deny"
                onLoadedData={markVideoPlaying}
                onCanPlay={markVideoPlaying}
                onPlaying={markVideoPlaying}
                onError={() => {
                  videoReadyRef.current = false;
                  setIsVideoReady(false);
                }}
                className="absolute inset-0 w-full h-full object-cover z-10"
              />
            )}

            {/* Üst ve Alt Kontrast Geçişleri */}
            <div className="absolute inset-x-0 top-0 h-11 bg-gradient-to-b from-black/75 to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-black/80 to-transparent z-10 pointer-events-none" />

            {/* Üst HUD Kontrolleri */}
            <div className="relative z-20 flex items-center justify-between p-2 pointer-events-none">
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#0a0d14]/80 backdrop-blur-md border border-white/[0.07]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.85)]" />
                <span className="text-[9px] font-mono font-semibold tracking-[0.12em] text-slate-200 uppercase">
                  CANLI
                </span>
              </div>

              <div className="flex items-center gap-1 pointer-events-auto">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenCamera) onOpenCamera(driverId, 'history');
                  }}
                  title="Geçmiş Kayıtlar"
                  className="w-7 h-7 rounded-lg bg-[#0a0d14]/80 hover:bg-white/[0.12] backdrop-blur-md border border-white/[0.08] flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all cursor-pointer"
                >
                  <Clock size={12} />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenCamera) onOpenCamera(driverId, 'live');
                  }}
                  title="Tam Ekran Aç"
                  className="w-7 h-7 rounded-lg bg-[#0a0d14]/80 hover:bg-white/[0.12] backdrop-blur-md border border-white/[0.08] flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all cursor-pointer"
                >
                  <Maximize2 size={12} />
                </button>
              </div>
            </div>

            {/* Alt Optik Telemetri Satırı */}
            <div className="relative z-20 flex items-center justify-between px-2.5 pb-2 pointer-events-none">
              <span className="text-[9px] font-mono font-medium tracking-wider text-slate-300/85 uppercase">
                ÖN KAMERA
              </span>
              <span className="text-[9px] font-mono text-slate-400 tracking-tight">
                {telemetry?.satellites ? `${telemetry.satellites} GPS · 4G` : '4G'}
              </span>
            </div>
          </div>
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
  isActiveViewport,
  isModalOpen,
  onOpenCamera
}) {
  const map = useMap();
  const { driverId, driverName, name, speedKmh, km, lastPoint, topSpeedKmh, avgSpeedKmh, isMoving, isIdling, parkDurationText } = vehicle;

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

  // Tüm filoda tek tip durum satırı: duruyorsa Rölanti/Park süresi, hareket halindeyse boş
  const subtitleText = !isMoving ? (parkDurationText || (isIdling ? 'Rölanti' : 'Park')) : null;

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
          </div>
          {subtitleText && (
            <div className="text-xs font-mono text-slate-400 font-medium tracking-tight mt-0.5 truncate">
              {subtitleText}
            </div>
          )}
        </div>

        {/* Kamera Kısayolu + Günlük KM */}
        <div className="shrink-0 flex items-center gap-2.5">
          {Boolean(getCameraConfig(driverId)) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCamera) onOpenCamera(driverId, 'live');
              }}
              title="Araç Kamerası"
              className="w-7 h-7 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <Video size={13} strokeWidth={1.75} />
            </button>
          )}
          <div className="text-right">
            <span className="text-sm font-mono font-bold text-white tracking-tight">{km}</span>
            <span className="text-[11px] text-slate-400 font-sans font-medium ml-1">km</span>
          </div>
        </div>
      </div>

      {/* Expanded Telemetry Section */}
      <AnimatePresence>
        {isFollowed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="border-t border-white/[0.06] bg-[#0b0e15]/80 overflow-hidden"
          >
            <div className="grid grid-cols-3 divide-x divide-white/[0.05] p-3 text-center">
              {/* 1. ANLIK HIZ / DURUM */}
              <div className="px-1.5">
                <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">ANLIK HIZ</div>
                <div className="text-sm font-mono font-bold text-slate-100 mt-1">
                  {!isMoving ? (
                    <span className="text-slate-300 font-sans text-xs font-semibold leading-tight">
                      {parkDurationText || (isIdling ? 'Rölanti' : 'Park')}
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
              isActiveViewport={isActiveViewport}
              isModalOpen={isModalOpen}
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
      <button
        onClick={handleCenterFollowed}
        className="w-11 h-11 bg-[#0d1219] border border-emerald-500/40 text-emerald-400 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.75)] active:scale-90 transition-all flex items-center justify-center"
        title="Seçili Aracı Ortala"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-400 transform -rotate-45 translate-x-0.5">
          <path d="M12 2L19 21L12 17L5 21L12 2Z" />
        </svg>
      </button>

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

// ── Mobile Followed Vehicle Telemetry Card ────────────────────────────────
function MobileFollowedCard({
  vehicle,
  vehicleList,
  onSelectVehicle,
  cameraQuality,
  isActiveViewport,
  isModalOpen,
  onOpenCamera
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { driverId, driverName, name, speedKmh, km, topSpeedKmh, avgSpeedKmh, isMoving, isIdling, parkDurationText } = vehicle;

  const cardRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  const subtitleText = !isMoving ? (parkDurationText || (isIdling ? 'Rölanti' : 'Park')) : null;

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

        {/* Kamera Kısayolu + Günlük KM */}
        <div className="shrink-0 flex items-center gap-2.5">
          {Boolean(getCameraConfig(driverId)) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCamera) onOpenCamera(driverId, 'live');
              }}
              title="Araç Kamerası"
              className="w-7 h-7 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <Video size={13} strokeWidth={1.75} />
            </button>
          )}
          <div className="text-right">
            <span className="text-sm font-mono font-bold text-white tracking-tight">{km}</span>
            <span className="text-[11px] text-slate-400 font-sans font-medium ml-1">km</span>
          </div>
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

      {/* 3 Kolonlu Telemetri İstatistikleri + Canlı Kamera */}
      <div className="bg-[#0b0e15]/80 rounded-2xl border border-white/[0.04] overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-white/[0.05] p-2 text-center">
          <div className="px-1">
            <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">ANLIK HIZ</div>
            <div className="text-xs font-mono font-bold text-slate-100 mt-0.5">
              {!isMoving ? (
                <span className="text-slate-300 font-sans text-[11px] font-semibold leading-tight">
                  {parkDurationText || (isIdling ? 'Rölanti' : 'Park')}
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
          isActiveViewport={isActiveViewport}
          isModalOpen={isModalOpen}
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
  hidePolylines = false,
}) {
  const [followedDriverId, setFollowedDriverId] = useState(null);
  const [isCameraFollowActive, setIsCameraFollowActive] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [zoom, setZoom] = useState(13);
  const [activeCameraDriverId, setActiveCameraDriverId] = useState(null);
  const [activeCameraInitialMode, setActiveCameraInitialMode] = useState('live');
  const [cameraQuality, setCameraQuality] = useState('sd');
  const didInitRef = useRef(false);

  // Tailwind md (768px) kırılımını birebir izleyerek mobil ve masaüstü kamera önizlemelerinin çakışmasını engeller
  const [isBelowMd, setIsBelowMd] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(max-width: 767px)');
    const onChange = (e) => setIsBelowMd(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const handleOpenCamera = (driverId, targetMode = 'live') => {
    setActiveCameraInitialMode(targetMode);
    setActiveCameraDriverId(driverId);
  };

  // Canlı park süresi sayacı (1 saniyede bir)
  const [now, setNow] = useState(() => Date.now());
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
      Promise.resolve().then(() => setFollowedDriverId(null));
    }
  }, [isVisible]);

  const listCallbackRef = useCallback((el) => {
    if (!el) return;
    const onWheel = (e) => { e.stopPropagation(); e.preventDefault(); el.scrollTop += e.deltaY; };
    el.addEventListener('wheel', onWheel, { passive: false });
  }, []);

  const DEFAULT_MAPPINGS = {
    Mert: { driverName: 'Mert', plate: '06 CVA 609' },
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
      const isRecentPing = pointTime > 0 && (now - pointTime) < 30 * 60 * 1000;
      const isOnline = pointTime > 0;
      const speedKmh = isRecentPing ? Math.round((lastPoint.speed || 0) * 1.852) : 0;

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
      const isMapped = !!deviceMappings?.[driverId] || !!DEFAULT_MAPPINGS[driverId];
      const info = getVehicleInfo(driverId);

      // Kameralı (ACC/Rölanti/MOVE destekli) ve kamerasız tüm araçlar için ortak hareket & durum hesabı
      const hasHwTelemetry =
        Boolean(lastPoint.hwStatus) ||
        (lastPoint.acc !== undefined && lastPoint.acc !== null);
      const isMoving =
        isRecentPing &&
        (hasHwTelemetry
          ? lastPoint.hwStatus === 'MOVE' || Boolean(lastPoint.isMovingHw) || speedKmh >= 2
          : speedKmh > 4);
      const isStationary = pointTime > 0 && !isMoving;
      const isIdling = isStationary && Boolean(lastPoint.isIdling || lastPoint.acc === 1);
      let parkDurationMin = 0;
      let parkDurationText = '';

      if (isStationary) {
        if (
          lastPoint.stationaryMinutes !== null &&
          lastPoint.stationaryMinutes !== undefined &&
          Number.isFinite(Number(lastPoint.stationaryMinutes))
        ) {
          parkDurationMin = Math.max(0, Math.round(Number(lastPoint.stationaryMinutes)));
        } else {
          const allPoints = sessions.flat();
          let stationaryStart = pointTime;
          const moveThreshold = hasHwTelemetry ? 2 : 4;

          for (let i = allPoints.length - 1; i >= 0; i--) {
            const pt = allPoints[i];
            const ptSpeedKmh = Math.round((pt.speed || 0) * 1.852);
            const ptAccChanged =
              pt.acc !== undefined &&
              pt.acc !== null &&
              lastPoint.acc !== undefined &&
              lastPoint.acc !== null &&
              pt.acc !== lastPoint.acc;
            if (ptSpeedKmh > moveThreshold || pt.hwStatus === 'MOVE' || ptAccChanged) {
              const stopPt = allPoints[i + 1] || pt;
              stationaryStart = getPointTime(stopPt);
              break;
            }
            stationaryStart = getPointTime(pt);
          }

          const diffMs = Math.max(0, now - stationaryStart);
          parkDurationMin = Math.floor(diffMs / 60000);
        }
        parkDurationText = formatStationaryStatus(parkDurationMin, isIdling);
      }

      return {
        driverId,
        latestSession,
        lastPoint,
        pointTime,
        isOnline,
        isMoving,
        isIdling,
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
      return (b.isMoving ? 1 : 0) - (a.isMoving ? 1 : 0);
    });

  const followedVehicle = vehicleList.find(v => v.driverId === followedDriverId) || vehicleList[0];
  const isModalOpen = Boolean(activeCameraDriverId);

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
              isMoving={v.isMoving}
              isMapped={v.isMapped}
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

          {followedVehicle && isBelowMd && (
            <MobileFollowedCard
              key={followedVehicle.driverId}
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
              isActiveViewport={isBelowMd && isVisible}
              isModalOpen={isModalOpen}
              onOpenCamera={handleOpenCamera}
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
                    cameraQuality={cameraQuality}
                    isActiveViewport={!isBelowMd && isVisible}
                    isModalOpen={isModalOpen}
                    onOpenCamera={handleOpenCamera}
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
        isOpen={isModalOpen}
        onClose={() => setActiveCameraDriverId(null)}
        deviceId={activeCameraDriverId}
        initialMode={activeCameraInitialMode}
        initialQuality={cameraQuality}
        onQualityChange={setCameraQuality}
      />
    </>
  );
}

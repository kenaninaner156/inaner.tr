import React, { useState, useEffect, useMemo, useRef, useContext, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, onSnapshot, query, orderBy, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { MapPin, History, Bookmark, Layers, Settings, Menu, CloudRain } from 'lucide-react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import L from 'leaflet';

import { useTruck } from '../../context/TruckContext';
import { useCompany } from '../../context/CompanyContext';
import { DataContext } from '../../context/DataContext';
import { groupIntoSessions, getPointTime } from '../../utils/mapUtils';

import LiveTracking from './LiveTracking';
import RouteHistory from './RouteHistory';
import SavedRoutes from './SavedRoutes';
import MapSettingsModal from './MapSettingsModal';
import { InteractiveGeofenceMapLayer, InteractiveGeofencePanel } from './InteractiveGeofence';

// ── Canlı Yağış Radarı Hook ──
function useRainViewerRadar() {
  const [radarPath, setRadarPath] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchRadar = async () => {
      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        if (!res.ok) return;
        const data = await res.json();
        const past = data?.radar?.past;
        if (past && past.length > 0 && isMounted) {
          setRadarPath(past[past.length - 1].path);
        }
      } catch (err) {
        console.warn('Yağış radarı yüklenemedi:', err);
      }
    };

    fetchRadar();
    const interval = setInterval(fetchRadar, 5 * 60 * 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return radarPath;
}

// Map ref setter - MapContainer içinde çalışır
function MapRefSetter({ mapRef }) {
  const map = useMap();
  useEffect(() => { 
    mapRef.current = map; 
    // Harita ilk yüklendiğinde ve container scale animasyonu bittiğinde boyutu düzgün hesaplasın
    const timer = setTimeout(() => {
      map.invalidateSize({ animate: true });
    }, 1000);
    return () => clearTimeout(timer);
  }, [map, mapRef]);
  return null;
}

function MapClickHandler({ pickingLocation, onLocationPicked }) {
  useMapEvents({
    click(e) {
      if (pickingLocation) {
        onLocationPicked(e.latlng);
      }
    }
  });
  return null;
}

// Sekme geçişlerinde haritayı pürüzsüzce odaklayan bileşen
function MapCameraSync({ activeTab, sessionsByDriver, deviceMappings }) {
  const map = useMap();
  const prevTabRef = useRef(activeTab);

  useEffect(() => {
    if (prevTabRef.current === activeTab) return;
    
    if (activeTab === 'live') {
      const activeLocations = Object.entries(sessionsByDriver)
        .filter(([driverId]) => !!deviceMappings[driverId] && sessionsByDriver[driverId].length > 0)
        .map(([, sessions]) => {
          const lp = sessions[sessions.length - 1];
          const lastPoint = lp[lp.length - 1];
          return lastPoint ? [lastPoint.lat, lastPoint.lon] : null;
        }).filter(p => p && !isNaN(p[0]));

      if (activeLocations.length === 1) {
        // Tek araç varsa dibine kadar (zoom 18 vs) girmemesi için 11'de bırakıyoruz
        // Ayrıca flyTo değil setView kullanıyoruz ki canvas bulanıklaşmasın
        map.setView(activeLocations[0], 11, { animate: true, duration: 1 });
      } else if (activeLocations.length > 1) {
        map.fitBounds(L.latLngBounds(activeLocations), { padding: [80, 80], maxZoom: 11, animate: true, duration: 1 });
      }
    }
    prevTabRef.current = activeTab;
  }, [activeTab, sessionsByDriver, deviceMappings, map]);

  return null;
}

const getTurkeyTodayStr = () => {
  const now = new Date();
  const trTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
  return trTime.toISOString().slice(0, 10);
};

let globalLocations = [];
let globalUnsubscribe = null;
const globalListeners = new Set();
let globalLoading = true;
let lastCompanyId = null;
let cleanupTimeout = null;

const subscribeToLiveLocations = (companyId, onUpdate, onError) => {
  if (cleanupTimeout) {
    clearTimeout(cleanupTimeout);
    cleanupTimeout = null;
  }

  // Şirket değiştiyse aboneliği sıfırla
  if (lastCompanyId !== companyId) {
    if (globalUnsubscribe) {
      globalUnsubscribe();
      globalUnsubscribe = null;
    }
    globalLocations = [];
    globalLoading = true;
    lastCompanyId = companyId;
  }

  const listener = { onUpdate, onError };
  globalListeners.add(listener);

  // Önbellekteki verileri anında gönder (yükleme gecikmesini sıfırlar)
  onUpdate(globalLocations, globalLoading);

  if (!globalUnsubscribe) {
    globalLoading = true;
    const q = collection(db, 'live_positions');
    const todayStr = getTurkeyTodayStr();

    globalUnsubscribe = onSnapshot(q, async (snap) => {
      const allVehicles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = companyId
        ? allVehicles.filter(d => !d.companyId || d.companyId === companyId)
        : allVehicles;

      // Her aktif araç için bugünün tam rotasını daily_routes dökümanından çek (1 okuma / araç)
      const dailyRoutePromises = filtered.map(async (veh) => {
        const dId = veh.deviceId || veh.driverId || veh.id;
        try {
          const dailySnap = await getDoc(doc(db, 'daily_routes', `${dId}_${todayStr}`));
          if (dailySnap.exists() && Array.isArray(dailySnap.data().points) && dailySnap.data().points.length > 0) {
            return { dId, veh, points: dailySnap.data().points };
          }
        } catch (e) {
          console.warn(`daily_routes okuma atlandı (${dId}):`, e);
        }
        return { dId, veh, points: null };
      });

      const dailyResults = await Promise.all(dailyRoutePromises);

      const unrolledLocations = [];
      dailyResults.forEach(({ dId, veh, points }) => {
        // Eğer bugünün tam rotası varsa eksiksiz tüm günün rotasını kullan (Örn: 90.9 km)
        if (Array.isArray(points) && points.length > 0) {
          points.forEach(pt => {
            unrolledLocations.push({
              driverId: dId,
              deviceId: dId,
              companyId: veh.companyId || companyId,
              lat: pt.lat,
              lon: pt.lon,
              speed: pt.speed || 0,
              timestamp: pt.timestamp || pt.time || veh.updatedAt || veh.timestamp,
              createdAt: pt.timestamp || pt.time || veh.updatedAt || veh.timestamp,
              ignition: pt.ignition !== undefined ? pt.ignition : (veh.ignition || false)
            });
          });
        } else if (veh.lat && veh.lon) {
          // Eğer daily_routes henüz oluşmadıysa en azından anlık tek noktayı göster
          unrolledLocations.push({
            driverId: dId,
            deviceId: dId,
            companyId: veh.companyId || companyId,
            lat: veh.lat,
            lon: veh.lon,
            speed: veh.speed || 0,
            timestamp: veh.updatedAt || veh.timestamp || Date.now(),
            createdAt: veh.updatedAt || veh.timestamp || Date.now(),
            ignition: veh.ignition || false
          });
        }
      });

      globalLocations = unrolledLocations;
      globalLoading = false;

      // Tüm dinleyicileri güncelle
      globalListeners.forEach(l => l.onUpdate(unrolledLocations, false));
    }, (error) => {
      console.error('live_positions verisi çekme hatası:', error);
      globalLoading = false;
      globalListeners.forEach(l => l.onError(error));
    });
  }

  return () => {
    globalListeners.delete(listener);
    // Haritadan tamamen çıkıldığında kota tasarrufu için 5 dakikalık bekleme süresi
    if (globalListeners.size === 0) {
      cleanupTimeout = setTimeout(() => {
        if (globalListeners.size === 0 && globalUnsubscribe) {
          globalUnsubscribe();
          globalUnsubscribe = null;
          globalLoading = true;
          globalLocations = [];
          lastCompanyId = null;
          console.log("Firestore live_positions aboneliği inaktivite nedeniyle kapatıldı.");
        }
      }, 5 * 60 * 1000); // 5 dakika
    }
  };
};

export default function MapLayout({ onReady, onOpenMenu, isMobile }) {
  const { trucks } = useTruck();
  const { activeCompanyId } = useCompany();
  const { geofences, manualSplits, addGeofence, updateGeofence } = useContext(DataContext);
  
  const [activeTab, setActiveTab] = useState('live');
  const [mapStyle, setMapStyle] = useState(() => {
    return localStorage.getItem('mapStyle') || 'voyager';
  });

  // ── Canlı Yağış Katmanı State ──
  const [showWeather, setShowWeather] = useState(() => localStorage.getItem('map_show_weather') === 'true');
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const radarPath = useRainViewerRadar();

  useEffect(() => {
    localStorage.setItem('mapStyle', mapStyle);
  }, [mapStyle]);

  useEffect(() => {
    localStorage.setItem('map_show_weather', showWeather);
  }, [showWeather]);
  
  const [locations, setLocations] = useState([]);
  const [, setLoading] = useState(true);
  const [deviceMappings, setDeviceMappings] = useState({});
  // Her zaman tek bir günü yükle: kota tasarrufu için en iyi yaklaşım
  const todayStr = new Date().toISOString().slice(0, 10);
  const [historyDate, setHistoryDate] = useState(todayStr); // "YYYY-MM-DD"
  const [showMapSettings, setShowMapSettings] = useState(false);
  const [selectedHistoryDriver, setSelectedHistoryDriver] = useState(null);
  
  const [isEditingGeofence, setIsEditingGeofence] = useState(false);
  const [draftZone, setDraftZone] = useState({ id: null, polygon: [], name: '' });

  const mapRef = useRef(null);

  // Harita butona tıklandıktan sonra yükleniyor, animasyonun başlaması için 50ms yeterli
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleSaveGeofence = async (zone) => {
    const name = (zone.name || '').trim();
    const rawPolygon = zone.polygon || [];
    if (!name || rawPolygon.length < 3) return;

    // Firestore uyumlu { lat, lon } array'ine dönüştür (nested array hatasını önler)
    const formattedPolygon = rawPolygon.map(p => ({
      lat: Number(p.lat !== undefined ? p.lat : p[0]),
      lon: Number(p.lon !== undefined ? p.lon : p[1])
    }));

    const avgLat = formattedPolygon.reduce((acc, p) => acc + p.lat, 0) / formattedPolygon.length;
    const avgLon = formattedPolygon.reduce((acc, p) => acc + p.lon, 0) / formattedPolygon.length;

    const payload = {
      name,
      polygon: formattedPolygon,
      lat: avgLat,
      lon: avgLon,
      radiusKm: 1
    };

    if (zone.id) {
      await updateGeofence(zone.id, payload);
    } else {
      await addGeofence(payload);
    }
    setIsEditingGeofence(false);
    setShowMapSettings(true);
  };

  useEffect(() => {
    const unsubscribe = subscribeToLiveLocations(
      activeCompanyId,
      (data, isLoading) => {
        setLocations(data);
        setLoading(isLoading);
        if (!isLoading) {
          onReady?.();
        }
      },
      (error) => {
        console.error('Harita verisi yüklenirken hata:', error);
        alert('Harita verisi yüklenemedi. Yetki veya bağlantı hatası: ' + error.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [activeCompanyId]);

  useEffect(() => {
    const mappingsDocId = `device_mappings_${activeCompanyId || 'default'}`;
    const unsubscribe = onSnapshot(doc(db, 'company_data', mappingsDocId), (s) => {
      if (s.exists()) {
        setDeviceMappings(s.data());
      } else {
        setDeviceMappings({});
      }
    });
    return () => unsubscribe();
  }, [activeCompanyId]);

  // ── sessionsByDriver (Canlı Takip) ─────────────────────────────────────
  const sessionsByDriver = useMemo(() => {
    const byDriver = {};
    locations.forEach(loc => {
      const dId = loc.driverId || loc.deviceId || 'Bilinmeyen';
      if (!byDriver[dId]) byDriver[dId] = [];
      byDriver[dId].push(loc);
    });

    const result = {};
    Object.keys(byDriver).forEach(dId => {
      const driverPoints = byDriver[dId];
      driverPoints.sort((a, b) => getPointTime(a) - getPointTime(b));
      result[dId] = groupIntoSessions(driverPoints, 30, geofences, manualSplits[dId]);
    });

    return result;
  }, [locations, geofences, manualSplits]);

  const unmappedActiveDeviceIds = useMemo(() => {
    return Object.keys(sessionsByDriver).filter(id => !deviceMappings[id] && id !== 'Bilinmeyen');
  }, [sessionsByDriver, deviceMappings]);

  // ── Harita Tabanları (Orijinal ESRI Uydu Korunmuş + Canlı Trafik Eklenmiş) ──
  const mapUrls = {
    voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    darkmatter: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    traffic: 'https://mt{s}.google.com/vt/lyrs=y,traffic&hl=tr&x={x}&y={y}&z={z}',
  };

  const tabs = [
    { id: 'live',     label: 'Canlı Takip',     icon: MapPin, theme: 'bg-gradient-to-r from-emerald-600 to-emerald-500 border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.35)]', hoverText: 'group-hover:text-emerald-400' },
    { id: 'history',  label: 'Rota Takibi',      icon: History, theme: 'bg-gradient-to-r from-orange-600 to-amber-500 border-orange-400/40 shadow-[0_0_20px_rgba(249,115,22,0.35)]', hoverText: 'group-hover:text-orange-400' },
    { id: 'saved',    label: 'Kayıtlı Rotalar',  icon: Bookmark, theme: 'bg-gradient-to-r from-indigo-600 to-violet-500 border-indigo-400/40 shadow-[0_0_20px_rgba(99,102,241,0.35)]', hoverText: 'group-hover:text-indigo-400' },
  ];

  const navBarCallbackRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  return (
    <div 
      data-map-module 
      className="relative w-full h-[100dvh] md:h-screen overflow-hidden flex flex-col select-none bg-[#07090e]"
    >
      {/* ── ÜST YÜZEN KONTROL PANELİ (ORİJİNAL MERKEZLİ TASARIM) ── */}
      <div 
        ref={navBarCallbackRef} 
        className="absolute left-1/2 -translate-x-1/2 z-[2000] pointer-events-auto w-[96%] sm:w-11/12 max-w-2xl"
        style={{
          top: 'calc(0.75rem + env(safe-area-inset-top, 0px))'
        }}
      >
        <div className="flex bg-[#0D1219]/96 backdrop-blur-2xl p-1 sm:p-1.5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] w-full border border-white/10 items-center select-none gap-0.5 sm:gap-1 ring-1 ring-black/40">
          {/* Mobile & iPad Menu Button (Hamburger) */}
          {onOpenMenu && (
            <button
              onClick={onOpenMenu}
              className="p-2 lg:hidden rounded-xl text-slate-300 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all duration-200 flex items-center justify-center shrink-0 cursor-pointer"
              title="Menüyü Aç"
            >
              <Menu size={18} />
            </button>
          )}

          <div className="flex flex-1 gap-0.5 sm:gap-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-1 sm:px-2 rounded-xl text-xs transition-all duration-300 group outline-none ${
                    isActive ? 'text-white font-semibold' : 'text-slate-400 font-medium hover:text-slate-200'
                  }`}
                >
                  {!isActive && (
                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.04] rounded-xl transition-colors duration-300" />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="map-active-pill"
                      className={`absolute inset-0 rounded-xl border ${tab.theme}`}
                      style={{ zIndex: 0 }}
                      initial={false}
                      transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}
                    />
                  )}
                  <Icon
                    size={14}
                    className={`relative z-10 transition-colors duration-300 shrink-0 ${
                      isActive ? 'text-white' : `text-slate-400 ${tab.hoverText}`
                    }`}
                  />
                  <span className={`relative z-10 text-[11px] sm:text-xs truncate ${isActive ? 'inline' : 'hidden sm:inline'}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="w-px h-5 bg-white/10 mx-0.5 sm:mx-1 flex-shrink-0" />
          <div className="flex items-center gap-0.5 pr-0.5 shrink-0">
            <button
              onClick={() => setShowMapSettings(true)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all duration-200"
              title="Harita Ayarları"
            >
              <Settings size={16} />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowLayerMenu(v => !v)}
                className={`p-2 rounded-xl transition-all duration-200 ${showLayerMenu || showWeather ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'}`}
                title="Katmanlar"
              >
                <Layers size={16} />
              </button>
              {showLayerMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowLayerMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-40 bg-[#0D1219]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] z-20 flex flex-col gap-1">
                    {[
                      { id: 'voyager',    name: 'Açık Harita' },
                      { id: 'darkmatter', name: 'Koyu Harita' },
                      { id: 'satellite',  name: 'Uydu' },
                      { id: 'traffic',    name: 'Canlı Trafik' },
                    ].map(s => (
                      <button
                        key={s.id}
                        onClick={() => { setMapStyle(s.id); }}
                        className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-colors ${
                          mapStyle === s.id
                            ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                            : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}

                    <div className="w-full h-px bg-white/[0.06] my-0.5" />

                    {/* Canlı Yağış Katmanı Toggle Switch */}
                    <div 
                      onClick={() => setShowWeather(v => !v)}
                      className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/[0.06] cursor-pointer transition-colors select-none"
                    >
                      <div className="flex items-center gap-2">
                        <CloudRain size={14} className={showWeather ? 'text-sky-400' : 'text-slate-500'} />
                        <span className={`text-xs font-medium ${showWeather ? 'text-slate-100' : 'text-slate-400'}`}>
                          Yağış
                        </span>
                      </div>
                      
                      <div className={`w-8 h-4 rounded-full transition-colors relative p-0.5 ${showWeather ? 'bg-sky-500' : 'bg-slate-800'}`}>
                        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${showWeather ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── HARİTA ALANI ── */}
      <div className="flex-1 relative bg-[#07090e]">
        {isMounted ? (
          <MapContainer 
            center={[39.9334, 32.8597]} 
            zoom={6} 
            className="w-full h-full z-0" 
            zoomControl={false}
            attributionControl={false}
            preferCanvas={true}
          >
            <MapRefSetter mapRef={mapRef} />
            <MapClickHandler pickingLocation={draftZone.lat === null} onLocationPicked={(ll) => setDraftZone(prev => ({ ...prev, lat: ll.lat, lon: ll.lng }))} />
            <MapCameraSync activeTab={activeTab} sessionsByDriver={sessionsByDriver} deviceMappings={deviceMappings} />

            {/* Temel Harita Tabanı (Açık, Koyu, Orijinal ESRI Uydu, veya Canlı Trafik) */}
            <TileLayer
              key={mapStyle}
              url={mapUrls[mapStyle] || mapUrls.voyager}
              subdomains={mapStyle === 'traffic' ? ['0', '1', '2', '3'] : ['a', 'b', 'c', 'd']}
              maxZoom={20}
              maxNativeZoom={mapStyle === 'satellite' ? 18 : 19}
              keepBuffer={4}
            />

            {/* Canlı Yağış Radarı */}
            {showWeather && radarPath && (
              <TileLayer
                key={radarPath}
                url={`https://tilecache.rainviewer.com${radarPath}/256/{z}/{x}/{y}/2/1_1.png`}
                opacity={0.65}
                zIndex={450}
                maxZoom={20}
                maxNativeZoom={7}
                keepBuffer={4}
              />
            )}

            <LiveTracking
              isVisible={activeTab === 'live' && !isEditingGeofence}
              sessionsByDriver={sessionsByDriver}
              deviceMappings={deviceMappings}
              trucks={trucks}
              setActiveTab={setActiveTab}
              setSelectedHistoryDriver={setSelectedHistoryDriver}
              isMobile={isMobile}
              hidePolylines={mapStyle === 'traffic'}
            />
            <RouteHistory
              isVisible={activeTab === 'history'}
              onClose={() => setActiveTab('live')}
              deviceMappings={deviceMappings}
              trucks={trucks}
              historyDate={historyDate}
              setHistoryDate={setHistoryDate}
              liveLocations={locations}
              activeCompanyId={activeCompanyId}
              selectedDriver={selectedHistoryDriver}
              setSelectedDriver={setSelectedHistoryDriver}
              isMobile={isMobile}
            />
            <SavedRoutes
              isVisible={activeTab === 'saved'}
            />

            {isEditingGeofence && (
              <InteractiveGeofenceMapLayer draftZone={draftZone} setDraftZone={setDraftZone} />
            )}
          </MapContainer>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0B0E14]">
             <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isEditingGeofence && (
        <InteractiveGeofencePanel 
          draftZone={draftZone} 
          setDraftZone={setDraftZone} 
          onSave={handleSaveGeofence} 
          onCancel={() => { setIsEditingGeofence(false); setShowMapSettings(true); }}
        />
      )}

      {showMapSettings && !isEditingGeofence && (
        <MapSettingsModal 
          onClose={() => setShowMapSettings(false)}
          onStartAddGeofence={() => {
            setShowMapSettings(false);
            setDraftZone({ id: null, polygon: [], name: '' });
            setIsEditingGeofence(true);
          }}
          onStartEditGeofence={(zone) => {
            setShowMapSettings(false);
            const polygon = Array.isArray(zone.polygon) && zone.polygon.length >= 3
              ? zone.polygon.map(p => ({
                  lat: Number(p.lat !== undefined ? p.lat : p[0]),
                  lon: Number(p.lon !== undefined ? p.lon : p[1])
                }))
              : (zone.lat && zone.lon ? [
                  { lat: zone.lat + 0.003, lon: zone.lon - 0.003 },
                  { lat: zone.lat + 0.003, lon: zone.lon + 0.003 },
                  { lat: zone.lat - 0.003, lon: zone.lon + 0.003 },
                  { lat: zone.lat - 0.003, lon: zone.lon - 0.003 }
                ] : []);
            setDraftZone({
              id: zone.id,
              name: zone.name,
              polygon
            });
            setIsEditingGeofence(true);
          }}
          unmappedActiveDeviceIds={unmappedActiveDeviceIds}
        />
      )}
    </div>
  );
}

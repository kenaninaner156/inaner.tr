import React, { useState, useEffect, useMemo, useRef, useContext, useCallback } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, onSnapshot, query, orderBy, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { MapPin, History, Bookmark, Layers, Settings, Menu } from 'lucide-react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import L from 'leaflet';

import { useTruck } from '../../context/TruckContext';
import { useCompany } from '../../context/CompanyContext';
import { DataContext } from '../../context/DataContext';
import { groupIntoSessions } from '../../utils/mapUtils';

import LiveTracking from './LiveTracking';
import RouteHistory from './RouteHistory';
import SavedRoutes from './SavedRoutes';
import VehicleAnalysis from './VehicleAnalysis';
import MapSettingsModal from './MapSettingsModal';
import { InteractiveGeofenceMapLayer, InteractiveGeofencePanel } from './InteractiveGeofence';

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
  }, [activeTab, map, sessionsByDriver, deviceMappings]);

  return null;
}

// Turkey Local Time Helper (UTC+3)
function getTurkeyTodayStr() {
  try {
    const formatter = new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(new Date());
    const day = parts.find(p => p.type === 'day')?.value || '01';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const year = parts.find(p => p.type === 'year')?.value || '2026';
    return `${year}-${month}-${day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ── Modül Düzeyinde Canlı Konum Önbelleği (live_positions + daily_routes) ──
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
              id: `${dId}_${pt.timestamp}`,
              driverId: dId,
              deviceId: dId,
              companyId: veh.companyId,
              lat: pt.lat,
              lon: pt.lon,
              speed: pt.speed || 0,
              altitude: pt.altitude || 0,
              timestamp: pt.timestamp
            });
          });

          // Canlı son nokta ve recentTrail'deki ara noktalar daily_routes'a henüz yazılmamışsa ekle
          const lastDailyPt = points[points.length - 1];
          const lastDailyTime = lastDailyPt ? new Date(lastDailyPt.timestamp).getTime() : 0;
          
          if (Array.isArray(veh.recentTrail) && veh.recentTrail.length > 0) {
            veh.recentTrail.forEach(trailPt => {
              if (trailPt && trailPt.lat && trailPt.lon && new Date(trailPt.timestamp).getTime() > lastDailyTime) {
                unrolledLocations.push({
                  id: `${dId}_${trailPt.timestamp}`,
                  driverId: dId,
                  deviceId: dId,
                  companyId: veh.companyId,
                  lat: trailPt.lat,
                  lon: trailPt.lon,
                  speed: trailPt.speed || 0,
                  altitude: trailPt.altitude || 0,
                  timestamp: trailPt.timestamp
                });
              }
            });
          } else if (veh.lat && veh.lon && new Date(veh.timestamp).getTime() > lastDailyTime) {
            unrolledLocations.push({
              id: `${dId}_${veh.timestamp}`,
              driverId: dId,
              deviceId: dId,
              companyId: veh.companyId,
              lat: veh.lat,
              lon: veh.lon,
              speed: veh.speed || 0,
              altitude: veh.altitude || 0,
              timestamp: veh.timestamp
            });
          }
        } 
        // Bugün rota yoksa (araç bugün çalışmamışsa), son bilinen konumunu kullan
        else if (Array.isArray(veh.recentTrail) && veh.recentTrail.length > 0) {
          veh.recentTrail.forEach(pt => {
            unrolledLocations.push({
              id: `${dId}_${pt.timestamp}`,
              driverId: dId,
              deviceId: dId,
              companyId: veh.companyId,
              lat: pt.lat,
              lon: pt.lon,
              speed: pt.speed || 0,
              altitude: pt.altitude || 0,
              timestamp: pt.timestamp
            });
          });
        } else if (veh.lat && veh.lon) {
          unrolledLocations.push({
            id: `${dId}_${veh.timestamp}`,
            driverId: dId,
            deviceId: dId,
            companyId: veh.companyId,
            lat: veh.lat,
            lon: veh.lon,
            speed: veh.speed || 0,
            altitude: veh.altitude || 0,
            timestamp: veh.timestamp
          });
        }
      });

      unrolledLocations.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

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
  const { geofences, manualSplits, addGeofence } = useContext(DataContext);
  
  const [activeTab, setActiveTab] = useState('live');
  const [mapStyle, setMapStyle] = useState(() => {
    return localStorage.getItem('mapStyle') || 'voyager';
  });
  const [showLayerMenu, setShowLayerMenu] = useState(false);

  useEffect(() => {
    localStorage.setItem('mapStyle', mapStyle);
  }, [mapStyle]);
  
  const [locations, setLocations] = useState([]);
  const [, setLoading] = useState(true);
  const [deviceMappings, setDeviceMappings] = useState({});
  // Her zaman tek bir günü yükle: kota tasarrufu için en iyi yaklaşım
  const todayStr = new Date().toISOString().slice(0, 10);
  const [historyDate, setHistoryDate] = useState(todayStr); // "YYYY-MM-DD"
  const [showMapSettings, setShowMapSettings] = useState(false);
  const [selectedHistoryDriver, setSelectedHistoryDriver] = useState(null);
  
  const [isEditingGeofence, setIsEditingGeofence] = useState(false);
  const [draftZone, setDraftZone] = useState({ lat: null, lon: null, radiusKm: 1, name: '' });

  const mapRef = useRef(null);

  // Harita butona tıklandıktan sonra yükleniyor, animasyonun başlaması için 50ms yeterli
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleSaveGeofence = async (zone) => {
    if (!zone.name || !zone.lat || !zone.lon) return;
    await addGeofence({
      name: zone.name,
      lat: parseFloat(zone.lat),
      lon: parseFloat(zone.lon),
      radiusKm: parseFloat(zone.radiusKm)
    });
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
    const grouped = locations.reduce((acc, loc) => {
      const k = loc.driverId || loc.deviceId || 'Bilinmeyen';
      if (!acc[k]) acc[k] = [];
      acc[k].push(loc);
      return acc;
    }, {});
    const res = {};
    Object.keys(grouped).forEach(d => {
      const rawSessions = groupIntoSessions(grouped[d], 30, geofences, manualSplits);
      // Sadece en son seferi tut (Son 30dk molasından sonraki kesintisiz hareket)
      if (rawSessions.length > 0) {
        res[d] = [rawSessions[rawSessions.length - 1]];
      } else {
        res[d] = [];
      }
    });
    return res;
  }, [locations, geofences, manualSplits]);

  const unmappedActiveDeviceIds = useMemo(() => {
    return Object.keys(sessionsByDriver).filter(id => !deviceMappings[id] && id !== 'Bilinmeyen');
  }, [sessionsByDriver, deviceMappings]);

  const mapUrls = {
    voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    darkmatter: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
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
      className="flex flex-col w-full h-screen relative overflow-hidden bg-[#07090e] select-none" 
    >
      <div
        ref={navBarCallbackRef}
        className="absolute top-3 sm:top-5 left-1/2 -translate-x-1/2 z-[2000] pointer-events-auto w-[96%] sm:w-11/12 max-w-2xl"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)'
        }}
      >
        <div className="flex bg-[#0B0F17]/80 backdrop-blur-2xl p-1 sm:p-1.5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] w-full border border-white/10 items-center select-none gap-0.5 sm:gap-1 ring-1 ring-black/40">
          {/* Mobile Menu Button (Hamburger) */}
          {onOpenMenu && (
            <button
              onClick={onOpenMenu}
              className="p-2 sm:hidden rounded-xl text-slate-300 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all duration-200 flex items-center justify-center shrink-0"
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
                className={`p-2 rounded-xl transition-all duration-200 ${showLayerMenu ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'}`}
                title="Katmanlar"
              >
                <Layers size={16} />
              </button>
              {showLayerMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowLayerMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-36 bg-[#0D1219]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] z-20">
                    {[
                      { id: 'voyager',    name: 'Açık Harita' },
                      { id: 'darkmatter', name: 'Koyu Harita' },
                      { id: 'satellite',  name: 'Uydu' },
                    ].map(s => (
                      <button
                        key={s.id}
                        onClick={() => { setMapStyle(s.id); setShowLayerMenu(false); }}
                        className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-colors ${
                          mapStyle === s.id
                            ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                            : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

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

            <TileLayer
              url={mapUrls[mapStyle]}
              maxZoom={20}
              maxNativeZoom={mapStyle === 'satellite' ? 18 : 19}
              keepBuffer={4}
            />
            <LiveTracking
              isVisible={activeTab === 'live'}
              sessionsByDriver={sessionsByDriver}
              deviceMappings={deviceMappings}
              trucks={trucks}
              setActiveTab={setActiveTab}
              setSelectedHistoryDriver={setSelectedHistoryDriver}
              isMobile={isMobile}
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
            setIsEditingGeofence(true);
            setDraftZone({ lat: null, lon: null, radiusKm: 0.5, name: '' });
          }}
          unmappedActiveDeviceIds={unmappedActiveDeviceIds}
        />
      )}
    </div>
  );
}

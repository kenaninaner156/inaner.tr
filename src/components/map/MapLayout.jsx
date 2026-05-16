import React, { useState, useEffect, useMemo, useRef, useContext, useCallback } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, onSnapshot, query, orderBy, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { MapPin, History, Bookmark, BarChart3, Layers, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import L from 'leaflet';

import { useTruck } from '../../context/TruckContext';
import { useCompany } from '../../context/CompanyContext';
import { DataContext } from '../../context/DataContext';
import { groupIntoSessions, filterSessionPoints } from '../../utils/mapUtils';

import LiveTracking from './LiveTracking';
import RouteHistory from './RouteHistory';
import SavedRoutes from './SavedRoutes';
import VehicleAnalysis from './VehicleAnalysis';
import MapSettingsModal from './MapSettingsModal';
import { InteractiveGeofenceMapLayer, InteractiveGeofencePanel } from './InteractiveGeofence';

// Map ref setter - MapContainer içinde çalışır
function MapRefSetter({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
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
    
    const flyOptions = { 
      padding: [80, 80], 
      duration: 1.5,
      easeLinearity: 0.25 
    };

    if (activeTab === 'live') {
      const activeLocations = Object.entries(sessionsByDriver)
        .filter(([driverId]) => !!deviceMappings[driverId] && sessionsByDriver[driverId].length > 0)
        .map(([driverId, sessions]) => {
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

export default function MapLayout({ onReady }) {
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
  const [loading, setLoading] = useState(true);
  const [deviceMappings, setDeviceMappings] = useState({});
  // Her zaman tek bir günü yükle: kota tasarrufu için en iyi yaklaşım
  const todayStr = new Date().toISOString().slice(0, 10);
  const [historyDate, setHistoryDate] = useState(todayStr); // "YYYY-MM-DD"
  const [showMapSettings, setShowMapSettings] = useState(false);
  
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
    setLoading(true);
    // Canlı Takip için son 24 saatin tüm verisini getiriyoruz (Son molayı yakalamak için)
    const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const q = query(
      collection(db, 'truck_routes'),
      where('timestamp', '>=', past24h),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      // Veri zaten asc (eskiden yeniye) geliyor, ters çevirmeye gerek yok
      const allData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = activeCompanyId
        ? allData.filter(d => !d.companyId || d.companyId === activeCompanyId)
        : allData;
      setLocations(filtered);
      setLoading(false);
      onReady?.();
    }, (error) => {
      console.error('Harita verisi çekme hatası:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeCompanyId]); // dateFilterDays ve customDate bağımlılıklarını çıkardık

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

  // Rota Geçmişi fetch işlemi artık RouteHistory içinde (per-vehicle ve cache destekli) yapılacak.

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
      // GPU'yu yormamak için Douglas-Peucker sıkıştırmasını (filterSessionPoints) DEVRE DIŞI bırakıyoruz.
      if (rawSessions.length > 0) {
        res[d] = [rawSessions[rawSessions.length - 1]];
      } else {
        res[d] = [];
      }
    });
    return res;
  }, [locations, geofences, manualSplits]);

  // historySessionsByDriver kaldırıldı, RouteHistory kendi yönetecek.

  const mapUrls = {
    voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    darkmatter: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  };

  const tabs = [
    { id: 'live',     label: 'Canlı Takip',     icon: MapPin, theme: 'bg-emerald-500 border-emerald-400/30', hoverText: 'group-hover:text-emerald-400' },
    { id: 'history',  label: 'Rota Takibi',      icon: History, theme: 'bg-orange-500 border-orange-400/30', hoverText: 'group-hover:text-orange-400' },
    { id: 'saved',    label: 'Kayıtlı Rotalar',  icon: Bookmark, theme: 'bg-indigo-500 border-indigo-400/30', hoverText: 'group-hover:text-indigo-400' },
  ];

  const navBarCallbackRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  // (early return kaldırıldı, yükleme ekranı artık MapPage.jsx içindeki butonda gösteriliyor)

  return (
    <div data-map-module className="flex flex-col h-[calc(100vh-8rem)] relative rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#0B0E14', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div
        ref={navBarCallbackRef}
        className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] pointer-events-auto w-11/12 max-w-2xl"
      >
        <div className="flex bg-[#111113]/80 backdrop-blur-xl p-1.5 rounded-2xl shadow-inner ring-1 ring-black/20 w-full border border-white/5 items-center">
          <div className="flex flex-1 gap-0.5">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-sm transition-all duration-300 group outline-none ${
                    isActive ? 'text-white font-medium' : 'text-slate-400 font-medium hover:text-slate-200'
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
                    size={15}
                    className={`relative z-10 transition-colors duration-300 ${
                      isActive ? 'text-white/90' : `text-slate-500 ${tab.hoverText}`
                    }`}
                  />
                  <span className="relative z-10 hidden sm:inline text-xs">{tab.label}</span>
                </button>
              );
            })}
          </div>
          <div className="w-px h-5 bg-white/10 mx-1.5 flex-shrink-0" />
          <div className="flex items-center gap-0.5 pr-0.5">
            <button
              onClick={() => setShowMapSettings(true)}
              className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/[0.08] transition-all duration-200"
              title="Harita Ayarları"
            >
              <Settings size={16} />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowLayerMenu(v => !v)}
                className={`p-2 rounded-xl transition-all duration-200 ${showLayerMenu ? 'text-white bg-white/10' : 'text-slate-500 hover:text-white hover:bg-white/[0.08]'}`}
              >
                <Layers size={16} />
              </button>
              {showLayerMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowLayerMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-32 bg-[#111113] border border-white/10 rounded-2xl p-1.5 shadow-2xl z-20">
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
                            ? 'bg-indigo-500/20 text-indigo-400 font-semibold'
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

      <div className="flex-1 relative bg-[#0B0E14]">
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
              maxZoom={19}
              keepBuffer={4}
            />
            <LiveTracking
              isVisible={activeTab === 'live'}
              sessionsByDriver={sessionsByDriver}
              deviceMappings={deviceMappings}
              trucks={trucks}
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
        />
      )}
    </div>
  );
}

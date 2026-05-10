import React, { useState, useEffect, useMemo, useRef, useContext, useCallback } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
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

      if (activeLocations.length > 0) {
        map.flyToBounds(L.latLngBounds(activeLocations), flyOptions);
      }
    }
    
    prevTabRef.current = activeTab;
  }, [activeTab, map, sessionsByDriver, deviceMappings]);

  return null;
}

export default function MapLayout() {
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
  const [dateFilterDays, setDateFilterDays] = useState(1);
  const [customDate, setCustomDate] = useState('');
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
    let startIso, endIso;
    if (customDate) {
      const start = new Date(customDate);
      start.setHours(0, 0, 0, 0);
      startIso = start.toISOString();
      const end = new Date(customDate);
      end.setHours(23, 59, 59, 999);
      endIso = end.toISOString();
    } else if (dateFilterDays === 0) {
      startIso = new Date('2020-01-01').toISOString();
      endIso = new Date().toISOString();
    } else {
      startIso = new Date(Date.now() - dateFilterDays * 86400000).toISOString();
      endIso = new Date().toISOString();
    }
    
    const q = query(
      collection(db, 'truck_routes'),
      where('timestamp', '>=', startIso),
      where('timestamp', '<=', endIso),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const allData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = activeCompanyId
        ? allData.filter(d => !d.companyId || d.companyId === activeCompanyId)
        : allData;
      setLocations(filtered);
      setLoading(false);
    }, (error) => {
      console.error('Harita verisi çekme hatası:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dateFilterDays, customDate, activeCompanyId]);

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

  const sessionsByDriver = useMemo(() => {
    const grouped = locations.reduce((acc, loc) => {
      const k = loc.driverId || 'Bilinmeyen';
      if (!acc[k]) acc[k] = [];
      acc[k].push(loc);
      return acc;
    }, {});

    const res = {};
    Object.keys(grouped).forEach(d => {
      const rawSessions = groupIntoSessions(grouped[d], 30, geofences, manualSplits);
      // Performans için nokta sayısını azalt (0.3km = 300m hassasiyet)
      res[d] = rawSessions.map(session => filterSessionPoints(session, 0.3));
    });
    return res;
  }, [locations, geofences, manualSplits]);

  const mapUrls = {
    voyager: 'https://mt0.google.com/vt/lyrs=m&hl=tr&x={x}&y={y}&z={z}',
    darkmatter: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  };

  const tabs = [
    { id: 'live',     label: 'Canlı Takip',     icon: MapPin },
    { id: 'history',  label: 'Rota Takibi',      icon: History },
    { id: 'saved',    label: 'Kayıtlı Rotalar',  icon: Bookmark },
  ];

  const navBarCallbackRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  return (
    <div data-map-module className="flex flex-col h-[calc(100vh-8rem)] relative rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#0B0E14', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div
        ref={navBarCallbackRef}
        className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] pointer-events-auto w-11/12 max-w-2xl"
      >
        <div className="flex backdrop-blur-xl p-1.5 rounded-2xl items-center" style={{ background: 'rgba(13,18,25,0.92)', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)' }}>
          <div className="flex flex-1 gap-0.5">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-sm transition-all duration-300 group outline-none ${
                    isActive ? 'text-white font-medium' : 'text-slate-500 font-medium hover:text-slate-300'
                  }`}
                >
                  {!isActive && (
                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.04] rounded-xl transition-colors duration-300" />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="map-active-pill"
                      className="absolute inset-0 bg-gradient-to-b from-indigo-500 to-indigo-600 rounded-xl border border-indigo-400/30 shadow-[0_2px_12px_rgba(99,102,241,0.35)]"
                      style={{ zIndex: 0 }}
                      initial={false}
                      transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}
                    />
                  )}
                  <Icon
                    size={15}
                    className={`relative z-10 transition-colors duration-300 ${
                      isActive ? 'text-white/90' : 'text-slate-600 group-hover:text-indigo-400'
                    }`}
                  />
                  <span className="relative z-10 drop-shadow-sm hidden sm:inline text-xs">{tab.label}</span>
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
              keepBuffer={24}
              updateWhenIdle={false}
              updateWhenZooming={false}
              updateInterval={50}
              tileSize={256}
            />
            <LiveTracking
              isVisible={activeTab === 'live'}
              sessionsByDriver={sessionsByDriver}
              deviceMappings={deviceMappings}
              trucks={trucks}
            />
            <RouteHistory
              isVisible={activeTab === 'history'}
              sessionsByDriver={sessionsByDriver}
              deviceMappings={deviceMappings}
              trucks={trucks}
              dateFilterDays={dateFilterDays}
              setDateFilterDays={setDateFilterDays}
              customDate={customDate}
              setCustomDate={setCustomDate}
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

      {/* Yükleniyor — Smooth ve Arka Planda (z-[1400]) */}
      <AnimatePresence>
        {loading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.4 }} // 400ms'den kısa süren yüklemelerde hiç gözükmez (flicker önleme)
            className="absolute inset-0 bg-[#0a0c10]/40 backdrop-blur-[2px] z-[1400] flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin shadow-[0_0_15px_rgba(99,102,241,0.2)]" />
              <span className="text-xs text-slate-400 font-medium tracking-wide">
                {locations.length === 0 ? 'Veriler Yükleniyor…' : 'Güncelleniyor…'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

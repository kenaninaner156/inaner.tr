import React, { useState, useEffect, useMemo, useRef, useContext } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { MapPin, History, Bookmark, BarChart3, Layers, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';

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
  
  // Veri Stateleri
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deviceMappings, setDeviceMappings] = useState({});
  const [dateFilterDays, setDateFilterDays] = useState(1);
  const [customDate, setCustomDate] = useState('');
  const [showMapSettings, setShowMapSettings] = useState(false);
  
  const [isEditingGeofence, setIsEditingGeofence] = useState(false);
  const [draftZone, setDraftZone] = useState({ lat: null, lon: null, radiusKm: 1, name: '' });

  const mapRef = useRef(null);

  const handleSaveGeofence = async (zone) => {
    if (!zone.name || !zone.lat || !zone.lon) return;
    await addGeofence({
      name: zone.name,
      lat: parseFloat(zone.lat),
      lon: parseFloat(zone.lon),
      radiusKm: parseFloat(zone.radiusKm)
    });
    setIsEditingGeofence(false);
    setShowMapSettings(true); // Geri listeye dön
  };

  // Veri Çekme — dateFilterDays=0 (Tümü) ise çok eski bir tarih kullan
  useEffect(() => {
    let startIso, endIso;
    
    if (customDate) {
      const start = new Date(customDate);
      start.setHours(0, 0, 0, 0);
      startIso = start.toISOString();
      const end = new Date(customDate);
      end.setHours(23, 59, 59, 999);
      endIso = end.toISOString();
    } else if (dateFilterDays === 0) {
      // "Tümü" — 5 yıl öncesinden bugüne kadar
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
      // Client-side şirket izolasyonu (eski kayıtlarda companyId yok → İnaner kabul edilir)
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

  // Cihaz Eşleştirmelerini Çek (Canlı Senkronizasyon)
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

  // 200m filtresiyle oturumlara grupla
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
      res[d] = rawSessions.map(session => filterSessionPoints(session, 0.2));
    });
    return res;
  }, [locations, geofences, manualSplits]);

  // Harita tile URL'leri
  const mapUrls = {
    voyager: 'https://mt0.google.com/vt/lyrs=m&hl=tr&x={x}&y={y}&z={z}', // Google Maps Standart
    darkmatter: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  };

  const tabs = [
    { id: 'live',     label: 'Canlı Takip',     icon: MapPin },
    { id: 'history',  label: 'Rota Takibi',      icon: History },
    { id: 'saved',    label: 'Kayıtlı Rotalar',  icon: Bookmark },
  ];

  return (
    // data-map-module → CSS isolation (light tema override'larından korur)
    <div data-map-module className="flex flex-col h-[calc(100vh-8rem)] relative rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#0B0E14', border: '1px solid rgba(255,255,255,0.04)' }}>
      
      {/* ── Navigasyon Barı (Araç Bakım ile aynı stil) ── */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] pointer-events-auto w-11/12 max-w-2xl"
        onWheelCapture={e => e.stopPropagation()}
        onPointerDownCapture={e => e.stopPropagation()}
        onPointerMoveCapture={e => e.stopPropagation()}
        onDoubleClickCapture={e => e.stopPropagation()}
        onTouchStartCapture={e => e.stopPropagation()}
      >
        <div className="flex backdrop-blur-xl p-1.5 rounded-2xl items-center" style={{ background: 'rgba(13,18,25,0.92)', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)' }}>
          {/* Sekmeler */}
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
                  {/* Hover arka planı */}
                  {!isActive && (
                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.04] rounded-xl transition-colors duration-300" />
                  )}
                  {/* Aktif pill (spring animasyonlu) */}
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

          {/* Ayırıcı */}
          <div className="w-px h-5 bg-white/10 mx-1.5 flex-shrink-0" />

          {/* Sağ butonlar */}
          <div className="flex items-center gap-0.5 pr-0.5">
            <button
              onClick={() => setShowMapSettings(true)}
              className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/[0.08] transition-all duration-200"
              title="Harita Ayarları"
            >
              <Settings size={16} />
            </button>

            {/* Harita Stili */}
            <div className="relative">
              <button
                onClick={() => setShowLayerMenu(v => !v)}
                className={`p-2 rounded-xl transition-all duration-200 ${showLayerMenu ? 'text-white bg-white/10' : 'text-slate-500 hover:text-white hover:bg-white/[0.08]'}`}
              >
                <Layers size={16} />
              </button>
              {showLayerMenu && (
                <>
                  {/* Backdrop */}
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

      {/* ── Harita Alanı ── */}
      <div className="flex-1 relative">
        <MapContainer
          center={[39.5, 33.5]}
          zoom={6}
          className="w-full h-full"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url={mapUrls[mapStyle]}
            maxZoom={19}
            // Performans: kara kare önleme ve hızlı yükleme
            keepBuffer={24}
            updateWhenIdle={false}
            updateWhenZooming={false}
            updateInterval={50}
            tileSize={256}
          />
          <MapRefSetter mapRef={mapRef} />

          {/*
            KRİTİK: AnimatePresence KALDIRILDI.
            Leaflet bileşenleri her zaman mount'ta kalır; sadece görsel olarak gösterilip gizlenir.
            Bu, useMap() hook hataları ve geçişlerde takılmayı önler.
          */}

          {/* Canlı Takip — her zaman mount'ta, sadece aktif sekmede görünür */}
          <LiveTracking
            isVisible={activeTab === 'live'}
            sessionsByDriver={sessionsByDriver}
            deviceMappings={deviceMappings}
            trucks={trucks}
          />

          {/* Rota Takibi */}
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

          {/* Kayıtlı Rotalar */}
          <SavedRoutes
            isVisible={activeTab === 'saved'}
          />

          {isEditingGeofence && (
            <InteractiveGeofenceMapLayer draftZone={draftZone} setDraftZone={setDraftZone} />
          )}
        </MapContainer>

      </div>

      {/* Yükleniyor */}
      {loading && (
        <div className="absolute inset-0 bg-[#0a0c10]/70 backdrop-blur-sm z-[3000] flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-xs text-slate-500 font-medium">Veriler yükleniyor…</span>
          </div>
        </div>
      )}

      {isEditingGeofence && (
        <InteractiveGeofencePanel 
          draftZone={draftZone} 
          setDraftZone={setDraftZone} 
          onSave={handleSaveGeofence} 
          onCancel={() => { setIsEditingGeofence(false); setShowMapSettings(true); }}
        />
      )}

      {/* Modals */}
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

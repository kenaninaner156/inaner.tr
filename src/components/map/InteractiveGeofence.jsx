import React, { useEffect } from 'react';
import { Circle, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { haversineKm } from '../../utils/mapUtils';
import { X, Check, Navigation } from 'lucide-react';
import { motion } from 'framer-motion';

// Harita üzerinde Daire ve İkonları çizen kısım (MapContainer içinde render edilmeli)
export function InteractiveGeofenceMapLayer({ draftZone, setDraftZone }) {
  const map = useMap();
  
  const circleRef = React.useRef(null);
  const centerMarkerRef = React.useRef(null);
  const handleMarkerRef = React.useRef(null);

  // İlk açılışta haritanın ortasına al (eğer lat/lon yoksa)
  useEffect(() => {
    if (!draftZone.lat || !draftZone.lon) {
      const center = map.getCenter();
      setDraftZone(prev => ({ ...prev, lat: center.lat, lon: center.lng, radiusKm: 1 }));
    }
  }, [map, draftZone.lat, draftZone.lon, setDraftZone]);

  if (!draftZone.lat || !draftZone.lon) return null;

  // Özel ikonlar
  const centerIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  const handleIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [20, 32],
    iconAnchor: [10, 32],
    shadowSize: [32, 32]
  });

  const getHandlePosition = (lat, lng, radiusKm) => {
    const offsetLng = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));
    return [lat, lng + offsetLng];
  };

  const handleDragCenter = (e) => {
    const latlng = e.target.getLatLng();
    // React state'i anlık güncellemek yerine doğrudan Leaflet objelerini güncelliyoruz (60 FPS için)
    if (circleRef.current) circleRef.current.setLatLng(latlng);
    if (handleMarkerRef.current) {
        // Mevcut yarıçapı Leaflet objesinden al (metre cinsinden olduğu için 1000'e böl)
        const currentRadiusKm = circleRef.current.getRadius() / 1000;
        const newHandlePos = getHandlePosition(latlng.lat, latlng.lng, currentRadiusKm);
        handleMarkerRef.current.setLatLng(newHandlePos);
    }
  };

  const handleDragResize = (e) => {
    const latlng = e.target.getLatLng();
    if (centerMarkerRef.current && circleRef.current) {
        const centerLatLng = centerMarkerRef.current.getLatLng();
        const dist = haversineKm(centerLatLng.lat, centerLatLng.lng, latlng.lat, latlng.lng);
        const newRadius = Math.max(0.1, dist);
        circleRef.current.setRadius(newRadius * 1000);
    }
  };

  const handleDragEnd = () => {
    if (centerMarkerRef.current && circleRef.current) {
        const centerLatLng = centerMarkerRef.current.getLatLng();
        const radiusKm = circleRef.current.getRadius() / 1000;
        setDraftZone(prev => ({ ...prev, lat: centerLatLng.lat, lon: centerLatLng.lng, radiusKm }));
    }
  };

  return (
    <>
      <Circle
        ref={circleRef}
        center={[draftZone.lat, draftZone.lon]}
        radius={draftZone.radiusKm * 1000}
        pathOptions={{ color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.2, weight: 3 }}
      />
      
      {/* Merkez Sürükleme İkonu */}
      <Marker 
        ref={centerMarkerRef}
        position={[draftZone.lat, draftZone.lon]} 
        icon={centerIcon} 
        draggable={true}
        eventHandlers={{ drag: handleDragCenter, dragend: handleDragEnd }}
      />
      
      {/* Boyutlandırma İkonu */}
      <Marker 
        ref={handleMarkerRef}
        position={getHandlePosition(draftZone.lat, draftZone.lon, draftZone.radiusKm)} 
        icon={handleIcon} 
        draggable={true}
        eventHandlers={{ drag: handleDragResize, dragend: handleDragEnd }}
      />
    </>
  );
}

// Haritanın dışında (ekranın altında) duran şık cam panel
export function InteractiveGeofencePanel({ draftZone, setDraftZone, onSave, onCancel }) {
  return (
    <motion.div 
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[2000] w-[90%] max-w-sm pointer-events-auto"
    >
      <div className="glass-panel p-4 border border-indigo-500/30 rounded-2xl shadow-2xl flex flex-col gap-3" style={{ background: 'rgba(13, 18, 25, 0.95)' }}>
        
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Navigation size={16} className="text-indigo-400" />
            Yeni Bölge Seçimi
          </h3>
          <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full font-mono border border-indigo-500/20">
            {draftZone.radiusKm.toFixed(2)} KM ÇAP
          </span>
        </div>
        
        <p className="text-[10px] text-slate-400 leading-tight">
          Haritadaki mor pini sürükleyerek bölgeyi taşıyın, sarı pini sürükleyerek çapını büyütüp küçültün.
        </p>
        
        <input
          type="text"
          placeholder="Bölge Adı (Örn: Çayırhan Tesis)"
          value={draftZone.name}
          onChange={e => setDraftZone({ ...draftZone, name: e.target.value })}
          className="w-full bg-[#0a0c10] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors"
        />

        <div className="flex gap-2 mt-1">
          <button 
            onClick={onCancel}
            className="flex-1 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-xs font-semibold transition-colors flex justify-center items-center gap-1"
          >
            <X size={14} /> İptal
          </button>
          <button 
            onClick={() => onSave(draftZone)}
            disabled={!draftZone.name}
            className="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-500/50 rounded-xl text-white text-xs font-semibold transition-all shadow-lg shadow-indigo-500/20 flex justify-center items-center gap-1"
          >
            <Check size={14} /> Bölgeyi Kaydet
          </button>
        </div>

      </div>
    </motion.div>
  );
}

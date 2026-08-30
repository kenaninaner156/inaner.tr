import React, { useEffect, useCallback, useState, useRef } from 'react';
import { Polygon, Polyline, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { X, Check, Undo2, RotateCcw, PenTool, Edit3, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars

// ── Modern Apple / Linear Tarzı Köşe Tutamaç İkonu ──
const createVertexIcon = (index, isFirst = false) => {
  const size = isFirst ? 26 : 22;
  const bg = isFirst ? '#a855f7' : '#8b5cf6';
  const html = `
    <div style="
      width: ${size}px;
      height: ${size}px;
      background: ${bg};
      border: 2.5px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 16px rgba(139, 92, 246, 0.95), 0 3px 10px rgba(0,0,0,0.8);
      cursor: grab;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 11px;
      font-weight: 800;
      user-select: none;
      transition: transform 0.1s ease;
    ">
      ${index + 1}
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-vertex-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// ── Harita Üzerinde Çokgen (Poligon) Çizen ve Düzenleyen Katman ──
export function InteractiveGeofenceMapLayer({ draftZone, setDraftZone }) {
  const map = useMap();
  const polygon = draftZone.polygon || [];
  const polygonRef = useRef(null);

  // Çizim esnasında harita imlecini hassas artı (crosshair) yap
  useEffect(() => {
    const container = map.getContainer();
    if (container) {
      container.style.cursor = 'crosshair';
    }
    return () => {
      if (container) {
        container.style.cursor = '';
      }
    };
  }, [map]);

  // Haritaya tıklayarak yeni köşe noktası ekleme
  useMapEvents({
    click(e) {
      setDraftZone(prev => ({
        ...prev,
        polygon: [...(prev.polygon || []), { lat: e.latlng.lat, lon: e.latlng.lng }],
      }));
    }
  });

  // Eğer mevcut bir bölge düzenleniyorsa haritayı o bölgenin merkezine odakla
  useEffect(() => {
    if (polygon.length >= 2) {
      try {
        const latLngs = polygon.map(p => [p.lat !== undefined ? p.lat : p[0], p.lon !== undefined ? p.lon : p[1]]);
        const bounds = L.latLngBounds(latLngs);
        map.fitBounds(bounds, { padding: [100, 100], maxZoom: 16, animate: true, duration: 0.8 });
      } catch (err) {
        console.warn('Bounds odaklanamadı:', err);
      }
    }
  }, []); // Sadece mount anında 1 kez odaklan

  // Sürükleme anında (drag): Doğrudan Leaflet Polygon çizgisini güncelle (React re-render yapmadan 60 FPS akıcı)
  const handleVertexDrag = (index, e) => {
    if (polygonRef.current) {
      const latlng = e.target.getLatLng();
      const currentLatLngs = polygonRef.current.getLatLngs();
      const ring = Array.isArray(currentLatLngs[0]) ? currentLatLngs[0] : currentLatLngs;
      if (ring && ring[index]) {
        ring[index] = latlng;
        polygonRef.current.setLatLngs([ring]);
      }
    }
  };

  // Sürükleme bittiğinde (dragend): React state'ine tek seferde yaz
  const handleVertexDragEnd = (index, e) => {
    const latlng = e.target.getLatLng();
    setDraftZone(prev => {
      const nextPolygon = [...(prev.polygon || [])];
      nextPolygon[index] = { lat: latlng.lat, lon: latlng.lng };
      return { ...prev, polygon: nextPolygon };
    });
  };

  const latLngPositions = polygon.map(p => [
    p.lat !== undefined ? p.lat : p[0],
    p.lon !== undefined ? p.lon : p[1]
  ]);

  return (
    <>
      {/* 3 veya daha fazla nokta varsa kapalı Çokgen çiz */}
      {latLngPositions.length >= 3 && (
        <Polygon
          ref={polygonRef}
          positions={latLngPositions}
          pathOptions={{
            color: '#8b5cf6',
            fillColor: '#8b5cf6',
            fillOpacity: 0.28,
            weight: 2.5,
            dashArray: '6, 6',
          }}
        />
      )}

      {/* 2 nokta varsa ara çizgi çiz */}
      {latLngPositions.length === 2 && (
        <Polyline
          positions={latLngPositions}
          pathOptions={{
            color: '#8b5cf6',
            weight: 2.5,
            dashArray: '6, 6',
          }}
        />
      )}

      {/* Köşe Noktası Tutamaçları (Sürüklenebilir) */}
      {polygon.map((point, index) => {
        const pos = [
          point.lat !== undefined ? point.lat : point[0],
          point.lon !== undefined ? point.lon : point[1]
        ];
        return (
          <Marker
            key={`vertex-${index}`}
            position={pos}
            icon={createVertexIcon(index, index === 0)}
            draggable={true}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
              },
              drag: (e) => handleVertexDrag(index, e),
              dragend: (e) => handleVertexDragEnd(index, e),
            }}
          />
        );
      })}
    </>
  );
}

// ── Ekranın Altında Duran Modern Cam Kontrol Paneli ──
export function InteractiveGeofencePanel({ draftZone, setDraftZone, onSave, onCancel }) {
  const polygon = draftZone.polygon || [];
  const pointCount = polygon.length;
  const isEditing = !!draftZone.id;
  const [isSaving, setIsSaving] = useState(false);

  // Tıklamaların haritaya sızmasını önleme
  const panelRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  const handleUndo = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDraftZone(prev => {
      const current = prev.polygon || [];
      if (current.length === 0) return prev;
      return {
        ...prev,
        polygon: current.slice(0, current.length - 1),
      };
    });
  }, [setDraftZone]);

  const handleClear = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDraftZone(prev => ({
      ...prev,
      polygon: [],
    }));
  }, [setDraftZone]);

  const handleSaveClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (pointCount < 3 || !(draftZone.name || '').trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(draftZone);
    } catch (err) {
      console.error('Bölge kaydedilirken hata:', err);
      alert('Kaydedilirken hata oluştu: ' + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div 
      ref={panelRef}
      initial={{ y: 80, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 80, opacity: 0, scale: 0.95 }}
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[2500] w-[94%] max-w-md pointer-events-auto select-none"
    >
      <div className="bg-[#090d14] p-4 sm:p-5 border border-white/10 rounded-2xl shadow-2xl flex flex-col gap-3.5 ring-1 ring-black/40">
        
        {/* Başlık & Nokta Sayacı */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
              {isEditing ? <Edit3 size={16} /> : <PenTool size={16} />}
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                {isEditing ? 'Özel Bölgeyi Düzenle' : 'Yeni Özel Bölge (Poligon)'}
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                {pointCount < 3 
                  ? 'Haritada tesisin köşelerine tıklayarak sınırları çizin (en az 3 nokta)'
                  : 'Noktaları basılı tutup sürükleyerek sınırları serbestçe ayarlayın'}
              </p>
            </div>
          </div>

          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
            pointCount >= 3 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
              : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
          }`}>
            {pointCount} Köşe
          </span>
        </div>
        
        {/* Bölge Adı Inputu */}
        <input
          type="text"
          placeholder="Tesis / Bölge Adı (Örn: Çayırhan Maden Sahası)"
          value={draftZone.name || ''}
          onChange={e => setDraftZone(prev => ({ ...prev, name: e.target.value }))}
          className="w-full bg-[#0d1219] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
        />

        {/* Eylem Butonları */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleUndo}
              disabled={pointCount === 0 || isSaving}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Son Noktayı Geri Al"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={handleClear}
              disabled={pointCount === 0 || isSaving}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Çizimi Temizle"
            >
              <RotateCcw size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel(); }}
              disabled={isSaving}
              className="px-3.5 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <X size={14} /> İptal
            </button>
            <button 
              onClick={handleSaveClick}
              disabled={pointCount < 3 || !(draftZone.name || '').trim() || isSaving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:border-transparent text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 border border-indigo-400/30 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {isEditing ? 'Güncelle' : 'Kaydet'}
            </button>
          </div>
        </div>

      </div>
    </motion.div>
  );
}

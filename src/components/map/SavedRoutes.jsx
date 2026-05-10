import React, { useContext, useState, useEffect, useRef, useCallback } from 'react';
import { DataContext } from '../../context/DataContext';
import { Bookmark, Search, Trash2, MapPin } from 'lucide-react';
import { Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

const startIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconSize: [16, 26], iconAnchor: [8, 26],
});

const endIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconSize: [16, 26], iconAnchor: [8, 26],
  className: 'hue-rotate-[120deg]',
});

export default function SavedRoutes({ isVisible }) {
  const { savedTrackingRoutes, deleteSavedTrackingRoute } = useContext(DataContext);
  const [searchTerm, setSearchTerm]     = useState('');
  const [selectedRoute, setSelectedRoute] = useState(null);
  const map = useMap();

  const filteredRoutes = (savedTrackingRoutes || []).filter(r =>
    (r.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.from?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.to?.toLowerCase()   || '').includes(searchTerm.toLowerCase())
  );

  // Callback ref — liste mount olunca wheel listener ekle
  const listCallbackRef = useCallback((el) => {
    if (!el) return;
    const onWheel = (e) => {
      e.stopPropagation();
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    if (selectedRoute?.startPoint && selectedRoute?.endPoint && map) {
      const bounds = L.latLngBounds([
        [selectedRoute.startPoint.lat, selectedRoute.startPoint.lon],
        [selectedRoute.endPoint.lat,   selectedRoute.endPoint.lon],
      ]);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 12 });
    }
  }, [selectedRoute, map, isVisible]);



  if (!isVisible) return null;

  return (
    <>
      {/* ── Harita Katmanları ── */}
      {selectedRoute?.startPoint && selectedRoute?.endPoint && (
        <>
          <Marker position={[selectedRoute.startPoint.lat, selectedRoute.startPoint.lon]} icon={startIcon}>
            <Popup><div className="p-1 text-xs font-semibold text-emerald-600">Başlangıç: {selectedRoute.from}</div></Popup>
          </Marker>
          <Marker position={[selectedRoute.endPoint.lat, selectedRoute.endPoint.lon]} icon={endIcon}>
            <Popup><div className="p-1 text-xs font-semibold text-rose-600">Bitiş: {selectedRoute.to}</div></Popup>
          </Marker>
          <Polyline
            positions={
              selectedRoute.path
                ? selectedRoute.path
                : [
                    [selectedRoute.startPoint.lat, selectedRoute.startPoint.lon],
                    [selectedRoute.endPoint.lat,   selectedRoute.endPoint.lon],
                  ]
            }
            color="#a78bfa"
            weight={4}
            opacity={0.85}
            dashArray={selectedRoute.path ? null : '10, 10'}
          />
        </>
      )}

      {/* ── Sidebar ── */}
      <div
        className="absolute top-[76px] left-4 bottom-4 w-[300px] z-[1500] flex flex-col rounded-3xl"
        style={{
          background: 'rgba(13,18,25,0.95)',
          border: '1px solid rgba(255,255,255,0.05)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* Başlık */}
        <div className="px-5 py-4 border-b border-white/[0.05]">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
            <Bookmark size={15} className="text-violet-400" />
            Kayıtlı Rotalar
          </h2>
          {/* Arama */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
            <input
              type="text"
              placeholder="Rota ara..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/40 transition-colors"
            />
          </div>
        </div>

        {/* Liste */}
        <div ref={listCallbackRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {filteredRoutes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Bookmark size={32} className="text-slate-700" />
              <p className="text-xs text-slate-600 text-center">
                {savedTrackingRoutes?.length === 0
                  ? 'Henüz kayıtlı rota yok.\nRota Takibi\'nden rotaları kaydedebilirsiniz.'
                  : 'Arama sonucu bulunamadı.'}
              </p>
            </div>
          ) : (
            filteredRoutes.map(route => {
              const isSelected  = selectedRoute?.id === route.id;
              const hasCoords   = route.startPoint && route.endPoint;

              return (
                <div
                  key={route.id}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isSelected
                      ? 'bg-violet-500/8 border-violet-500/20'
                      : 'bg-white/[0.015] border-white/[0.04] hover:border-white/[0.09]'
                  }`}
                >
                  <button
                    onClick={() =>
                      hasCoords
                        ? setSelectedRoute(isSelected ? null : route)
                        : alert('Bu eski rotanın koordinat verisi yok.')
                    }
                    className="w-full text-left px-4 py-3.5 flex gap-3"
                  >
                    {/* Rota göstergesi (nokta-çizgi-nokta) */}
                    <div className="flex flex-col items-center justify-center pt-0.5 flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                      <div className="w-px flex-1 bg-slate-700/60 my-1" />
                      <div className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.6)]" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {route.name && (
                        <div className="text-[10px] text-slate-600 font-medium mb-1 truncate">{route.name}</div>
                      )}
                      <div className="text-sm font-bold text-slate-200 truncate leading-tight">{route.from || '—'}</div>
                      <div className="text-sm font-semibold text-slate-400 truncate leading-tight mt-0.5">{route.to || '—'}</div>
                      <div className="flex items-center gap-2 mt-2">
                        {route.km && (
                          <span className="px-2 py-0.5 bg-white/[0.05] rounded-lg text-[10px] text-slate-500 font-semibold border border-white/[0.05]">
                            {route.km} km
                          </span>
                        )}
                        {!hasCoords && (
                          <span className="text-[10px] text-amber-500/70">Koordinatsız</span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Sil butonu */}
                  <div className="px-4 pb-3 flex justify-end">
                    <button
                      onClick={() => {
                        if (window.confirm('Bu rotayı silmek istediğinize emin misiniz?')) {
                          deleteSavedTrackingRoute(route.id);
                          if (isSelected) setSelectedRoute(null);
                        }
                      }}
                      className="p-1.5 text-slate-700 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all"
                      title="Sil"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

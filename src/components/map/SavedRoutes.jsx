import React, { useContext, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { DataContext } from '../../context/DataContext';
import { Bookmark, Search, Trash2, Edit2, Check, X } from 'lucide-react';
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
  const { savedTrackingRoutes, deleteSavedTrackingRoute, updateSavedTrackingRoute } = useContext(DataContext);
  const [showSidebar, setShowSidebar]     = useState(true);
  const [searchTerm, setSearchTerm]     = useState('');
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null); // custom confirm
  const [editingId, setEditingId]       = useState(null);
  const [editName, setEditName]         = useState('');
  const [editFrom, setEditFrom]         = useState('');
  const [editTo, setEditTo]             = useState('');
  const map = useMap();
  const [zoom, setZoom] = useState(map ? map.getZoom() : 13);

  useEffect(() => {
    if (!map) return;
    const onZoom = () => setZoom(map.getZoom());
    map.on('zoomend', onZoom);
    return () => {
      map.off('zoomend', onZoom);
    };
  }, [map]);

  // Harita etkileşimini sidebar üzerinde engelle
  const sidebarCallbackRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  const filteredRoutes = (savedTrackingRoutes || []).filter(r =>
    (r.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.from?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.to?.toLowerCase()   || '').includes(searchTerm.toLowerCase())
  );

  // Callback ref — wheel izolasyonu
  const listCallbackRef = useCallback((el) => {
    if (!el) return;
    const onWheel = (e) => { e.stopPropagation(); e.preventDefault(); el.scrollTop += e.deltaY; };
    el.addEventListener('wheel', onWheel, { passive: false });
  }, []);

  // Confirm modal tıklama ve scroll engelleme (Leaflet sızıntılarını engeller)
  const confirmModalRef = useCallback((el) => {
    if (el) {
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    if (selectedRoute?.startPoint && selectedRoute?.endPoint && map) {
      const bounds = L.latLngBounds([
        [selectedRoute.startPoint.lat, selectedRoute.startPoint.lon],
        [selectedRoute.endPoint.lat,   selectedRoute.endPoint.lon],
      ]);
      map.fitBounds(bounds, { paddingTopLeft: [380, 60], paddingBottomRight: [60, 60], maxZoom: 12 });
    }
  }, [selectedRoute, map, isVisible]);

  const handleDelete = (id) => {
    deleteSavedTrackingRoute(id);
    if (selectedRoute?.id === id) setSelectedRoute(null);
    setConfirmDeleteId(null);
  };

  const startEdit = (route, e) => {
    e.stopPropagation();
    setEditingId(route.id);
    setEditName(route.name || '');
    setEditFrom(route.from || '');
    setEditTo(route.to || '');
  };

  const saveEdit = async (route, e) => {
    e.stopPropagation();
    await updateSavedTrackingRoute(route.id, {
      name: editName.trim() || `${editFrom} → ${editTo}`,
      from: editFrom.trim(),
      to:   editTo.trim(),
    });
    setEditingId(null);
  };

  return (
    <>
      {/* ── Harita Katmanları ── */}
      {isVisible && selectedRoute?.startPoint && selectedRoute?.endPoint && (
        <>
          <Marker position={[selectedRoute.startPoint.lat, selectedRoute.startPoint.lon]} icon={startIcon}>
            <Popup><div className="p-1 text-xs font-semibold text-emerald-600">Başlangıç: {selectedRoute.from}</div></Popup>
          </Marker>
          <Marker position={[selectedRoute.endPoint.lat, selectedRoute.endPoint.lon]} icon={endIcon}>
            <Popup><div className="p-1 text-xs font-semibold text-rose-600">Bitiş: {selectedRoute.to}</div></Popup>
          </Marker>
          {/* ── İnce Gölge & Ana Çizgi (Dinamik Kalınlık) ── */}
          {(() => {
            const base = Math.max(1, (zoom - 7) * 0.35 + 1.2);
            const routeWeight = Math.min(5.0, Math.max(1.2, base));
            const shadowWeight = routeWeight + 2.5;
            const positions = selectedRoute.path
              ? selectedRoute.path.map(p => p.lat != null ? [p.lat, p.lon] : p)
              : [[selectedRoute.startPoint.lat, selectedRoute.startPoint.lon], [selectedRoute.endPoint.lat, selectedRoute.endPoint.lon]];
            return (
              <>
                <Polyline
                  positions={positions}
                  color="#000" weight={shadowWeight} opacity={0.3} />
                <Polyline
                  positions={positions}
                  color="#8b5cf6" weight={routeWeight} opacity={0.8} />
              </>
            );
          })()}
        </>
      )}

      {/* ── Sidebar ── */}
      <AnimatePresence>
        {isVisible && showSidebar && (
          <motion.div
            ref={sidebarCallbackRef}
            initial={{ x: -20, opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
            animate={{ x: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ x: -20, opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="absolute top-[76px] left-4 bottom-4 w-[300px] z-[1500] flex flex-col rounded-3xl"
            style={{
              background: 'rgba(13,18,25,0.97)',
              border: '1px solid rgba(255,255,255,0.04)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.03)',
              backdropFilter: 'blur(24px)',
            }}
          >
            {/* Başlık */}
            <div className="px-5 py-4 border-b border-white/[0.05]">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Bookmark size={15} className="text-violet-400" /> Kayıtlı Rotalar
                </h2>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="p-1.5 text-slate-500 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-xl transition-all"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                <input
                  type="text" placeholder="Rota ara..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
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
              const isSelected = selectedRoute?.id === route.id;
              const hasCoords  = route.startPoint && route.endPoint;
              const isEditing  = editingId === route.id;

              return (
                <div
                  key={route.id}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isSelected ? 'bg-violet-500/8 border-violet-500/20' : 'bg-white/[0.015] border-white/[0.04] hover:border-white/[0.09]'
                  }`}
                >
                  {/* Rota içeriği */}
                  <button
                    onClick={() => !isEditing && (hasCoords ? setSelectedRoute(isSelected ? null : route) : null)}
                    className="w-full text-left px-4 py-3.5 flex gap-3"
                  >
                    <div className="flex flex-col items-center justify-center pt-0.5 flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                      <div className="w-px flex-1 bg-slate-700/60 my-1" />
                      <div className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.6)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {route.name && <div className="text-[10px] text-slate-600 font-medium mb-1 truncate">{route.name}</div>}
                      <div className="text-sm font-bold text-slate-200 truncate leading-tight">{route.from || '—'}</div>
                      <div className="text-sm font-semibold text-slate-400 truncate leading-tight mt-0.5">{route.to || '—'}</div>
                      <div className="flex items-center gap-2 mt-2">
                        {route.km && <span className="px-2 py-0.5 bg-white/[0.05] rounded-lg text-[10px] text-slate-500 font-semibold border border-white/[0.05]">{route.km} km</span>}
                        {!hasCoords && <span className="text-[10px] text-amber-500/70">Koordinatsız</span>}
                      </div>
                    </div>
                  </button>

                  {/* Düzenleme formu */}
                  {isEditing && (
                    <div className="px-4 pb-3 space-y-2" onClick={e => e.stopPropagation()}>
                      <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Rota adı"
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors" />
                      <input value={editFrom} onChange={e => setEditFrom(e.target.value)} placeholder="Nereden"
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors" />
                      <input value={editTo}   onChange={e => setEditTo(e.target.value)}   placeholder="Nereye"
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors" />
                    </div>
                  )}

                  {/* Aksiyon butonları */}
                  <div className="px-4 pb-3 flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                    {isEditing ? (
                      <>
                        <button onClick={e => saveEdit(route, e)}
                          className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all" title="Kaydet">
                          <Check size={13} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setEditingId(null); }}
                          className="p-1.5 text-slate-600 hover:text-white hover:bg-white/[0.06] rounded-xl transition-all" title="İptal">
                          <X size={13} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={e => startEdit(route, e)}
                          className="p-1.5 text-slate-700 hover:text-violet-400 hover:bg-violet-500/10 rounded-xl transition-all" title="Düzenle">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(route.id); }}
                          className="p-1.5 text-slate-700 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all" title="Sil">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    )}
    </AnimatePresence>

      {/* Sidebar kapalıyken aç butonu */}
      <AnimatePresence>
        {isVisible && !showSidebar && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setShowSidebar(true)}
            className="absolute left-4 top-[76px] z-[1500] p-3.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/20 transition-all backdrop-blur-md"
          >
            <Bookmark size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Silme Onay Modalı (custom) ── */}
      {confirmDeleteId && (
        <div
          ref={confirmModalRef}
          className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="rounded-3xl p-6 w-full max-w-xs shadow-2xl"
            style={{ background: 'rgba(13,18,25,0.98)', border: '1px solid rgba(255,255,255,0.07)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-rose-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">Rotayı Sil</h3>
                <p className="text-slate-500 text-xs mt-0.5">Bu işlem geri alınamaz.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] text-slate-300 text-sm font-semibold transition-all"
              >
                İptal
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="flex-1 py-2.5 rounded-2xl bg-rose-500/80 hover:bg-rose-500 text-white text-sm font-bold transition-all"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

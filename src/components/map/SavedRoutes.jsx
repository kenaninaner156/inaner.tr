import React, { useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DataContext } from '../../context/DataContext';
import { 
  Bookmark, Search, Trash2, Edit2, Check, X, ChevronDown, 
  Sparkles, Route, Plus
} from 'lucide-react';
import { Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { mineCommercialTripCorridors } from '../../utils/routeMiningUtils';
import { fetchRoadGeometry } from '../../utils/roadRoutingUtils';

// ── Vektör Başlangıç & Bitiş Pin İkonları ──
const createPinIcon = (colorHex, label) => L.divIcon({
  className: 'custom-pin-icon',
  html: `
    <div style="
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #090d14;
      border: 2px solid ${colorHex};
      box-shadow: 0 0 12px ${colorHex}80, 0 4px 10px rgba(0,0,0,0.8);
      color: ${colorHex};
      font-weight: 800;
      font-size: 11px;
    ">
      ${label}
    </div>
  `,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const startPinIcon = createPinIcon('#10b981', '🟢');
const endPinIcon   = createPinIcon('#f43f5e', '🏁');

// ── MOBİL ALT KART KOMPONENTİ ──
function MobileSavedRoutesCard({
  savedRoutes,
  discoveredRoutes,
  activeTab,
  setActiveTab,
  selectedRoute,
  setSelectedRoute,
  searchTerm,
  setSearchTerm,
  editingId,
  setEditingId,
  editName,
  setEditName,
  editFrom,
  setEditFrom,
  editTo,
  setEditTo,
  saveEdit,
  startEdit,
  setConfirmDeleteId,
  handleSaveDiscovered
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const cardRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  const currentList = activeTab === 'saved' ? savedRoutes : discoveredRoutes;
  const filteredList = (currentList || []).filter(r =>
    (r.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.from?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.to?.toLowerCase()   || '').includes(searchTerm.toLowerCase())
  );

  return (
    <div
      ref={cardRef}
      className="absolute bottom-3 left-3 right-3 z-[1500] pointer-events-auto rounded-[24px] p-3 flex flex-col gap-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.9)] border border-white/10 bg-[#0a0e16] md:hidden overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      style={{
        marginBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      {/* ── ÜST BAŞLIK ── */}
      <div 
        onClick={() => setIsExpanded(prev => !prev)}
        className="flex items-center justify-between cursor-pointer select-none group active:opacity-75 transition-opacity"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border bg-indigo-500/10 border-indigo-500/30 text-indigo-400">
            {activeTab === 'saved' ? <Bookmark size={15} /> : <Sparkles size={15} />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white truncate group-hover:text-indigo-300 transition-colors">
                {selectedRoute ? (selectedRoute.name || `${selectedRoute.from} ➔ ${selectedRoute.to}`) : (activeTab === 'saved' ? 'Kayıtlı Rotalar' : 'Sefer Keşfi')}
              </span>
              <ChevronDown 
                size={14} 
                className={`text-slate-400 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${isExpanded ? 'rotate-180 text-indigo-400' : ''}`}
              />
            </div>
            {selectedRoute && (
              <div className="text-[10px] font-mono text-indigo-400 mt-0.5">
                {selectedRoute.km ? `${selectedRoute.km} km` : ''}
              </div>
            )}
          </div>
        </div>

        <div className="px-2 py-0.5 bg-white/[0.04] text-slate-400 rounded-lg text-[10px] font-medium border border-white/[0.04]">
          {filteredList.length} Rota
        </div>
      </div>

      {/* ── İÇERİK PANELİ ── */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isExpanded 
            ? 'grid-rows-[1fr] opacity-100 border-t border-white/[0.06] pt-2.5' 
            : 'grid-rows-[0fr] opacity-0 border-t-0 pt-0 pointer-events-none'
        }`}
      >
        <div className="overflow-hidden flex flex-col gap-2.5 max-h-[65vh] overflow-y-auto custom-scrollbar">
          {/* Sekme Değiştirici (Sade) */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-black/40 border border-white/[0.06] rounded-xl">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setActiveTab('saved'); }}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'saved'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bookmark size={13} />
              <span>Kayıtlı</span>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setActiveTab('discover'); }}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'discover'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles size={13} />
              <span>Sefer Keşfi</span>
            </button>
          </div>

          {/* Arama Kutusu */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Hat veya tesis ara..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/40 transition-colors"
            />
          </div>

          {/* Rota Listesi */}
          <div className="flex flex-col gap-2">
            {filteredList.length === 0 ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-center text-slate-500">
                <Route size={24} className="opacity-30" />
                <span className="text-xs">Kayıt bulunamadı.</span>
              </div>
            ) : (
              filteredList.map((route, idx) => {
                const isSelected = selectedRoute?.id === route.id;
                const isEditing = editingId === route.id;
                const isAlreadySaved = savedRoutes?.some(s => s.name === route.name || (s.from === route.from && s.to === route.to));
                const tripTotal = route.tripCount || route.individualTrips?.length || 1;

                return (
                  <div
                    key={route.id || idx}
                    onClick={() => {
                      if (!isEditing) {
                        setSelectedRoute(isSelected ? null : route);
                      }
                    }}
                    className={`rounded-2xl border transition-all cursor-pointer select-none overflow-hidden ${
                      isSelected 
                        ? 'bg-[#121724]/95 border-indigo-500/40 shadow-lg' 
                        : 'bg-[#0f141e]/70 border-white/[0.04] hover:bg-white/[0.05]'
                    }`}
                  >
                    {/* Üst Satır: Rota Başlığı ve İnce Rozet / Aksiyonlar */}
                    <div className="p-3 pb-2 flex items-center justify-between gap-2 border-b border-white/[0.04]">
                      <div className="min-w-0 flex-1">
                        <span className={`text-xs font-bold truncate block ${isSelected ? 'text-indigo-300' : 'text-white'}`}>
                          {route.name || `${route.from} ➔ ${route.to}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                        {route.tripCount ? (
                          <div className="px-2 py-0.5 bg-white/[0.04] text-slate-400 border border-white/[0.06] rounded-md text-[10px] font-mono">
                            {route.tripCount} Sefer
                          </div>
                        ) : null}

                        {activeTab === 'saved' && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => startEdit(route, e)}
                              className="p-1 rounded-md text-slate-400 hover:text-indigo-300 hover:bg-white/[0.06] transition-all"
                              title="Düzenle"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(route.id); }}
                              className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-white/[0.06] transition-all"
                              title="Sil"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3 Kolonlu Telemetri */}
                    <div className="grid grid-cols-3 divide-x divide-white/[0.04] p-1.5 bg-[#090d14]/70 text-center">
                      <div className="px-1">
                        <div className="text-[7.5px] font-semibold text-slate-400 uppercase">ORT. MESAFE</div>
                        <div className="text-[11px] font-mono font-bold text-white mt-0.5">{route.km || '—'} <span className="text-[8px] font-sans font-normal text-slate-400">km</span></div>
                      </div>
                      <div className="px-1">
                        <div className="text-[7.5px] font-semibold text-slate-400 uppercase">TAHMİNİ SÜRE</div>
                        <div className="text-[11px] font-mono font-bold text-indigo-300 mt-0.5">
                          {route.durationMin ? `${Math.floor(route.durationMin/60)}s ${route.durationMin%60}d` : '—'}
                        </div>
                      </div>
                      <div className="px-1">
                        <div className="text-[7.5px] font-semibold text-slate-400 uppercase">SEFER SAYISI</div>
                        <div className="text-[11px] font-mono font-bold text-slate-300 mt-0.5">
                          {tripTotal} <span className="text-[8px] font-sans font-normal text-slate-400">Adet</span>
                        </div>
                      </div>
                    </div>

                    {/* Keşif Sekmesinde Kaydet Butonu */}
                    {activeTab === 'discover' && (
                      <div className="p-2 border-t border-white/[0.04] bg-[#0a0e16]/60 flex items-center justify-end" onClick={e => e.stopPropagation()}>
                        {isAlreadySaved ? (
                          <div className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold flex items-center gap-1">
                            <Check size={11} />
                            <span>Kayıtlı</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSaveDiscovered(route)}
                            className="px-2.5 py-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-md active:scale-95 transition-all"
                          >
                            <Plus size={11} />
                            <span>Kütüphaneye Kaydet</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ANA KAYITLI ROTALAR KOMPONENTİ ──
export default function SavedRoutes({ isVisible }) {
  const { trips, savedTrackingRoutes, addSavedTrackingRoute, deleteSavedTrackingRoute, updateSavedTrackingRoute, geofences } = useContext(DataContext);
  const [showSidebar, setShowSidebar]         = useState(true);
  const [activeTab, setActiveTab]             = useState('saved'); // 'saved' | 'discover'
  const [searchTerm, setSearchTerm]           = useState('');
  const [selectedRoute, setSelectedRoute]     = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingId, setEditingId]             = useState(null);
  const [editName, setEditName]               = useState('');
  const [editFrom, setEditFrom]               = useState('');
  const [editTo, setEditTo]                   = useState('');
  const [roadGeometries, setRoadGeometries]   = useState({});

  const map = useMap();
  const [zoom, setZoom] = useState(map ? map.getZoom() : 13);

  useEffect(() => {
    if (!map) return;
    const onZoom = () => setZoom(map.getZoom());
    map.on('zoomend', onZoom);
    return () => map.off('zoomend', onZoom);
  }, [map]);

  // 1. SIFIR GECİKME & SIFIR YÜK: Hafızadaki veriden anında hesaplama (0ms)
  const discoveredRoutes = useMemo(() => {
    return mineCommercialTripCorridors(trips || [], [], geofences || []);
  }, [trips, geofences]);

  const sidebarCallbackRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  // 2. KAYITLI ROTALAR SENKRONİZASYONU
  const enrichedSavedRoutes = useMemo(() => {
    return (savedTrackingRoutes || []).map(saved => {
      const normSavedFrom = (saved.from || '').toLowerCase().replace(/[-_]/g, ' ').trim();
      const normSavedTo   = (saved.to || '').toLowerCase().replace(/[-_]/g, ' ').trim();
      const normSavedName = (saved.name || '').toLowerCase().replace(/[-_]/g, ' ').trim();

      const matched = (discoveredRoutes || []).find(d => {
        const normDFrom = (d.from || '').toLowerCase().replace(/[-_]/g, ' ').trim();
        const normDTo   = (d.to || '').toLowerCase().replace(/[-_]/g, ' ').trim();
        const normDName = (d.name || '').toLowerCase().replace(/[-_]/g, ' ').trim();
        return (normDFrom === normSavedFrom && normDTo === normSavedTo) ||
               normDName === normSavedName ||
               (normDTo.includes('bastas') && normSavedTo.includes('bastas')) ||
               (normDTo.includes('ferpa') && normSavedTo.includes('ferpa')) ||
               (normDTo.includes('limmer') && normSavedTo.includes('limmer'));
      });

      return {
        ...saved,
        id: saved.id || saved.name,
        tripCount: matched ? matched.tripCount : (saved.tripCount || 1),
        durationMin: matched?.durationMin || saved.durationMin || (saved.km ? Math.round((saved.km / 50) * 60) : null),
        km: matched?.km || saved.km,
        avgSpeedKmh: matched?.avgSpeedKmh || saved.avgSpeedKmh || 50,
        individualTrips: matched?.individualTrips || saved.individualTrips || [],
        path: (saved.path && saved.path.length > 0) ? saved.path : (matched?.path || []),
        startPoint: saved.startPoint || matched?.startPoint,
        endPoint: saved.endPoint || matched?.endPoint
      };
    });
  }, [savedTrackingRoutes, discoveredRoutes]);

  const currentList = activeTab === 'saved' ? enrichedSavedRoutes : discoveredRoutes;
  const filteredRoutes = currentList.filter(r =>
    (r.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.from?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.to?.toLowerCase()   || '').includes(searchTerm.toLowerCase())
  );

  // 3. KARAYOLU GERÇEK ROTA GEOMETRİSİNİ (OSRM & Virajlar) OTOMATİK ÇEKME
  useEffect(() => {
    if (!isVisible || !selectedRoute) return;
    const routeId = selectedRoute.id || selectedRoute.name;

    const hasRichPath = selectedRoute.path && selectedRoute.path.length > 5;
    if (hasRichPath || roadGeometries[routeId]) return;

    let isMounted = true;
    const loadGeometry = async () => {
      const startPt = selectedRoute.startPoint;
      const endPt   = selectedRoute.endPoint;
      if (startPt && endPt) {
        const roadResult = await fetchRoadGeometry(startPt, endPt);
        if (roadResult && roadResult.coordinates && isMounted) {
          setRoadGeometries(prev => ({
            ...prev,
            [routeId]: roadResult.coordinates
          }));
        }
      }
    };
    loadGeometry();
    return () => { isMounted = false; };
  }, [selectedRoute, isVisible, roadGeometries]);

  // Arka planda ilk 6 rotanın karayolu geometrisini sessizce önceden hazırla (0ms gecikme)
  useEffect(() => {
    if (!isVisible || !discoveredRoutes || discoveredRoutes.length === 0) return;
    let isMounted = true;
    const prefetchRoutes = async () => {
      const topRoutes = discoveredRoutes.slice(0, 6);
      for (const route of topRoutes) {
        const routeId = route.id || route.name;
        if (!roadGeometries[routeId] && (!route.path || route.path.length <= 2)) {
          if (route.startPoint && route.endPoint) {
            const res = await fetchRoadGeometry(route.startPoint, route.endPoint);
            if (res && res.coordinates && isMounted) {
              setRoadGeometries(prev => ({ ...prev, [routeId]: res.coordinates }));
            }
          }
        }
      }
    };
    prefetchRoutes();
    return () => { isMounted = false; };
  }, [discoveredRoutes, isVisible]);

  // Haritayı seçili rotanın karayolu koordinatlarına göre tam odakla
  useEffect(() => {
    if (!isVisible || !selectedRoute || !map) return;
    const routeId = selectedRoute.id || selectedRoute.name;
    const activeRoadCoords = roadGeometries[routeId] || (selectedRoute.path && selectedRoute.path.length > 5 ? selectedRoute.path.map(p => p.lat != null ? [p.lat, p.lon] : p) : null);

    const isMobile = window.innerWidth < 768;

    if (activeRoadCoords && activeRoadCoords.length > 2) {
      const bounds = L.latLngBounds(activeRoadCoords);
      map.fitBounds(bounds, {
        paddingTopLeft: isMobile ? [20, 20] : [380, 60],
        paddingBottomRight: isMobile ? [20, 180] : [60, 60],
        maxZoom: 13
      });
    } else if (selectedRoute.startPoint && selectedRoute.endPoint) {
      const bounds = L.latLngBounds([
        [selectedRoute.startPoint.lat, selectedRoute.startPoint.lon],
        [selectedRoute.endPoint.lat,   selectedRoute.endPoint.lon],
      ]);
      map.fitBounds(bounds, {
        paddingTopLeft: isMobile ? [20, 20] : [380, 60],
        paddingBottomRight: isMobile ? [20, 180] : [60, 60],
        maxZoom: 12
      });
    }
  }, [selectedRoute, map, isVisible, roadGeometries]);

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
      name: editName.trim() || `${editFrom} ➔ ${editTo}`,
      from: editFrom.trim(),
      to:   editTo.trim(),
    });
    setEditingId(null);
  };

  const handleSaveDiscovered = async (corridor) => {
    try {
      const routeId = corridor.id || corridor.name;
      const roadPath = roadGeometries[routeId] || corridor.path || [];
      await addSavedTrackingRoute({
        name: corridor.name,
        from: corridor.from,
        to: corridor.to,
        km: corridor.km,
        durationMin: corridor.durationMin,
        avgSpeedKmh: corridor.avgSpeedKmh,
        startPoint: corridor.startPoint,
        endPoint: corridor.endPoint,
        path: roadPath.map(p => Array.isArray(p) ? { lat: p[0], lon: p[1] } : p),
      });
    } catch (err) {
      console.error('Keşfedilen rota kaydedilemedi:', err);
    }
  };

  return (
    <>
      {/* ── Harita Katmanları ── */}
      {isVisible && selectedRoute && (() => {
        const routeId = selectedRoute.id || selectedRoute.name;
        const activeRoadPath = (selectedRoute.path && selectedRoute.path.length > 5)
          ? selectedRoute.path.map(p => (p.lat != null ? [p.lat, p.lon] : p))
          : (roadGeometries[routeId] || null);

        const hasPath = activeRoadPath && activeRoadPath.length > 0;
        const startPt = hasPath ? activeRoadPath[0] : selectedRoute.startPoint;
        const endPt   = hasPath ? activeRoadPath[activeRoadPath.length - 1] : selectedRoute.endPoint;
        const startLatLon = startPt?.lat != null ? [startPt.lat, startPt.lon] : (Array.isArray(startPt) ? startPt : null);
        const endLatLon   = endPt?.lat != null ? [endPt.lat, endPt.lon] : (Array.isArray(endPt) ? endPt : null);
        const positions = hasPath
          ? activeRoadPath.map(p => (p.lat != null ? [p.lat, p.lon] : p))
          : (startLatLon && endLatLon ? [startLatLon, endLatLon] : []);

        const base = Math.max(1, (zoom - 7) * 0.35 + 1.2);
        const routeWeight = Math.min(5.0, Math.max(1.8, base));
        const shadowWeight = routeWeight + 3.0;

        return (
          <>
            {startLatLon && (
              <Marker position={startLatLon} icon={startPinIcon}>
                <Popup>
                  <div className="p-1.5 text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">BAŞLANGIÇ TESİSİ</div>
                    <div className="text-xs font-bold text-emerald-400">{selectedRoute.from}</div>
                  </div>
                </Popup>
              </Marker>
            )}
            {endLatLon && (
              <Marker position={endLatLon} icon={endPinIcon}>
                <Popup>
                  <div className="p-1.5 text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">VARIŞ TESİSİ</div>
                    <div className="text-xs font-bold text-rose-400">{selectedRoute.to}</div>
                  </div>
                </Popup>
              </Marker>
            )}
            {positions.length > 0 && (
              <>
                <Polyline positions={positions} color="#000" weight={shadowWeight} opacity={0.4} />
                <Polyline positions={positions} color="#6366f1" weight={routeWeight} opacity={0.9} />
              </>
            )}
          </>
        );
      })()}

      {/* ── MOBİL GÖRÜNÜM ── */}
      {isVisible && (
        <MobileSavedRoutesCard
          savedRoutes={enrichedSavedRoutes}
          discoveredRoutes={discoveredRoutes}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          selectedRoute={selectedRoute}
          setSelectedRoute={setSelectedRoute}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          editingId={editingId}
          setEditingId={setEditingId}
          editName={editName}
          setEditName={setEditName}
          editFrom={editFrom}
          setEditFrom={setEditFrom}
          editTo={editTo}
          setEditTo={setEditTo}
          saveEdit={saveEdit}
          startEdit={startEdit}
          setConfirmDeleteId={setConfirmDeleteId}
          handleSaveDiscovered={handleSaveDiscovered}
        />
      )}

      {/* ── MASAÜSTÜ SIDEBAR ── */}
      <AnimatePresence>
        {isVisible && showSidebar && (
          <motion.div
            ref={sidebarCallbackRef}
            initial={{ x: -15, opacity: 0, scale: 0.99 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: -15, opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="hidden md:flex absolute left-4 w-[335px] z-[1500] flex-col rounded-3xl overflow-hidden border border-white/10 shadow-[0_16px_50px_rgba(0,0,0,0.85)]"
            style={{
              top: 'calc(5.25rem + var(--safe-top))',
              maxHeight: 'calc(100vh - 6.5rem - var(--safe-top))',
              background: '#0a0e16',
            }}
          >
            {/* Üst Başlık & Sekmeler */}
            <div className="p-3.5 border-b border-white/[0.05] flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.2)]">
                    <Bookmark size={15} />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-white">Tır Rota Kütüphanesi</h2>
                    <p className="text-[10px] text-slate-400">Şirket Sefer & Hat Keşfi</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowSidebar(false)}
                  className="p-1.5 text-slate-500 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-xl transition-all"
                  title="Gizle"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Sekmeler: Kayıtlı vs Sefer Keşfi (Sade) */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-black/40 border border-white/[0.06] rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveTab('saved')}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'saved'
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Bookmark size={12} />
                  <span>Kayıtlı</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('discover')}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'discover'
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles size={12} />
                  <span>Sefer Keşfi</span>
                </button>
              </div>

              {/* Arama Kutusu */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type="text" 
                  placeholder="Hat veya tesis ara..."
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/40 transition-colors"
                />
              </div>
            </div>

            {/* Rota Listesi */}
            <div className="overflow-y-auto p-3 space-y-2 max-h-[calc(100vh-250px)] custom-scrollbar">
              {filteredRoutes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-center text-slate-500">
                  <Route size={28} className="opacity-30" />
                  <p className="text-xs">Kayıt bulunamadı.</p>
                </div>
              ) : (
                filteredRoutes.map((route, idx) => {
                  const isSelected = selectedRoute?.id === route.id;
                  const isEditing  = editingId === route.id;
                  const isAlreadySaved = savedTrackingRoutes?.some(s => s.name === route.name || (s.from === route.from && s.to === route.to));
                  const tripTotal = route.tripCount || route.individualTrips?.length || 1;

                  return (
                    <div
                      key={route.id || idx}
                      role="button"
                      tabIndex={0}
                      onClick={() => !isEditing && setSelectedRoute(isSelected ? null : route)}
                      className={`w-full rounded-2xl border transition-all duration-200 overflow-hidden text-left cursor-pointer outline-none ${
                        isSelected
                          ? 'bg-[#121724]/95 border-indigo-500/40 shadow-lg ring-1 ring-indigo-500/20'
                          : 'bg-[#0e131c]/70 border-white/[0.05] hover:bg-[#121724]/80 hover:border-white/10'
                      }`}
                    >
                      {/* Üst Satır: Rota Başlığı, Sade Rozet ve İnce Aksiyon Butonları */}
                      <div className="p-3 pb-2.5 flex flex-col gap-1 border-b border-white/[0.04]">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold truncate block ${isSelected ? 'text-indigo-300' : 'text-slate-100'}`}>
                            {route.name || `${route.from} ➔ ${route.to}`}
                          </span>

                          {/* Sağ Taraf: Muted Sefer Rozeti + Düzenle / Sil */}
                          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            {route.tripCount ? (
                              <div className="px-2 py-0.5 bg-white/[0.04] text-slate-400 border border-white/[0.06] rounded-md text-[10px] font-mono">
                                {route.tripCount} Sefer
                              </div>
                            ) : null}

                            {activeTab === 'saved' && (
                              <div className="flex items-center gap-0.5 ml-0.5">
                                <button
                                  onClick={(e) => startEdit(route, e)}
                                  className="p-1 rounded-md text-slate-400 hover:text-indigo-300 hover:bg-white/[0.06] transition-all"
                                  title="Düzenle"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(route.id); }}
                                  className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-white/[0.06] transition-all"
                                  title="Sil"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Düzenleme Formu (Inline) */}
                      {isEditing && (
                        <div className="p-3 bg-[#080b10]/95 border-b border-white/[0.06] flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                          <input 
                            value={editName} 
                            onChange={e => setEditName(e.target.value)} 
                            placeholder="Rota Adı"
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50" 
                          />
                          <div className="flex gap-1.5">
                            <input 
                              value={editFrom} 
                              onChange={e => setEditFrom(e.target.value)} 
                              placeholder="Nereden"
                              className="w-1/2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50" 
                            />
                            <input 
                              value={editTo} 
                              onChange={e => setEditTo(e.target.value)} 
                              placeholder="Nereye"
                              className="w-1/2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50" 
                            />
                          </div>
                          <div className="flex justify-end gap-1.5 mt-1">
                            <button
                              onClick={(e) => saveEdit(route, e)}
                              className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold hover:bg-emerald-500/30 transition-all flex items-center gap-1"
                            >
                              <Check size={11} /> Kaydet
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                              className="px-3 py-1 rounded-xl bg-white/[0.04] text-slate-400 text-[10px] font-bold hover:bg-white/[0.08] transition-all"
                            >
                              İptal
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 3 Kolonlu Telemetri Şeridi */}
                      <div className="grid grid-cols-3 divide-x divide-white/[0.05] p-2 bg-[#090d14]/70 text-center">
                        <div className="px-1">
                          <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">ORT. MESAFE</div>
                          <div className="text-xs font-mono font-bold text-white mt-0.5">
                            {route.km || '—'} <span className="text-[9px] font-sans font-normal text-slate-400">km</span>
                          </div>
                        </div>
                        <div className="px-1 flex flex-col justify-center">
                          <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">TAHMİNİ SÜRE</div>
                          <div className="text-xs font-mono font-bold text-indigo-300 mt-0.5">
                            {route.durationMin ? `${Math.floor(route.durationMin/60)}s ${route.durationMin%60}d` : '—'}
                          </div>
                        </div>
                        <div className="px-1 flex flex-col justify-center">
                          <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">SEFER SAYISI</div>
                          <div className="text-xs font-mono font-bold text-slate-300 mt-0.5">
                            {tripTotal} <span className="text-[9px] font-sans font-normal text-slate-400">Adet</span>
                          </div>
                        </div>
                      </div>

                      {/* Keşif Sekmesinde Sade Kütüphaneye Ekle Butonu */}
                      {activeTab === 'discover' && (
                        <div className="p-2 border-t border-white/[0.04] bg-[#0a0e16]/60 flex items-center justify-end" onClick={e => e.stopPropagation()}>
                          {isAlreadySaved ? (
                            <div className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold flex items-center gap-1">
                              <Check size={11} />
                              <span>Kütüphanede Kayıtlı</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSaveDiscovered(route)}
                              className="px-2.5 py-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-md active:scale-95 transition-all"
                            >
                              <Plus size={11} />
                              <span>Kütüphaneye Kaydet</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Masaüstü Sidebar Kapalıyken Aç Butonu */}
      <AnimatePresence>
        {isVisible && !showSidebar && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setShowSidebar(true)}
            className="hidden md:block absolute left-4 z-[1500] p-3.5 bg-[#0a0e16] hover:bg-[#0f1420] text-indigo-400 rounded-2xl border border-indigo-500/20 transition-all shadow-xl cursor-pointer"
            style={{
              top: 'calc(5.25rem + var(--safe-top))'
            }}
            title="Kayıtlı Rotaları Aç"
          >
            <Bookmark size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Silme Onay Modalı ── */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-black/70"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="rounded-3xl p-5 w-full max-w-xs shadow-2xl border border-white/10"
            style={{ background: 'rgba(10, 14, 22, 0.98)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-rose-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-xs">Rotayı Sil</h3>
                <p className="text-slate-400 text-[10.5px] mt-0.5">Bu kayıt kütüphaneden silinecektir.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-slate-300 text-xs font-bold transition-all"
              >
                İptal
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-[0_2px_10px_rgba(244,63,94,0.3)]"
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

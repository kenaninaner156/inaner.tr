import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ChevronRight, ChevronDown, Play, Pause, X, CalendarDays, Smartphone, BookmarkPlus } from 'lucide-react';
import { calcStats, getInterpolatedPoint } from '../../utils/mapUtils';
import { DataContext } from '../../context/DataContext';

const startIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconSize: [16, 26], iconAnchor: [8, 26],
});

const truckPlayIcon = new L.Icon({
  iconUrl: '/tir-clear.png?v=8',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  className: 'bg-white rounded-full border-2 border-indigo-500 shadow-lg object-contain',
});

const DATE_FILTERS = [
  { label: 'Bugün',  days: 1 },
  { label: '7 Gün',  days: 7 },
  { label: '30 Gün', days: 30 },
  { label: 'Tümü',   days: 0 },
];

export default function RouteHistory({
  isVisible,
  sessionsByDriver, deviceMappings, trucks,
  dateFilterDays, setDateFilterDays,
  customDate, setCustomDate,
}) {
  const map = useMap();

  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedDriver, setSelectedDriver]   = useState(null);
  const [isVehicleDropdownOpen, setIsVehicleDropdownOpen] = useState(false);
  const [showSidebar, setShowSidebar]         = useState(true);

  // Sidebar — click propagation
  const sidebarRef = useRef(null);
  useEffect(() => {
    if (sidebarRef.current) L.DomEvent.disableClickPropagation(sidebarRef.current);
  }, []);

  // Liste scroll — callback ref: element mount olunca event listener ekle
  const listCallbackRef = useCallback((el) => {
    if (!el) return;
    // Smooth scroll
    el.style.scrollBehavior = 'smooth';
    const onWheel = (e) => {
      e.stopPropagation();
      e.preventDefault();
      el.scrollBy({ top: e.deltaY, behavior: 'smooth' });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
  }, []);

  // Otomatik olarak ilk aracı seç
  useEffect(() => {
    const drivers = Object.keys(sessionsByDriver).filter(d => sessionsByDriver[d].length > 0);
    if (drivers.length > 0 && !selectedDriver) {
      setSelectedDriver(drivers[0]);
    } else if (drivers.length === 0 && selectedDriver) {
      setSelectedDriver(null);
    }
  }, [sessionsByDriver, selectedDriver]);

  // Oynatma
  const [progress, setProgress]               = useState(0);
  const [isPlaying, setIsPlaying]             = useState(false);
  const [interpolatedData, setInterpolatedData] = useState(null);
  const playIntervalRef = useRef(null);

  // Kaydetme
  const { addSavedTrackingRoute, trips } = React.useContext(DataContext);
  const [savingSession, setSavingSession] = useState(null);
  const [saveFrom, setSaveFrom]           = useState('');
  const [saveTo, setSaveTo]               = useState('');
  const [saveName, setSaveName]           = useState('');
  const [saveTripId, setSaveTripId]       = useState('');

  const getDisplayName = (deviceId) => {
    const m = deviceMappings[deviceId];
    if (!m) return deviceId;
    const truck = trucks.find(t => t.id === m.truckId);
    return [m.driverName, truck?.plate].filter(Boolean).join(' - ') || deviceId;
  };

  // Rota seçilince haritayı sığdır
  useEffect(() => {
    if (!isVisible) return;
    if (selectedSession && selectedSession.length > 0 && map) {
      const bounds = L.latLngBounds(
        selectedSession.filter(p => !isNaN(p.lat)).map(p => [p.lat, p.lon])
      );
      map.fitBounds(bounds, { 
        paddingTopLeft: [380, 60], 
        paddingBottomRight: [60, 60], 
        maxZoom: 14 
      });
      setProgress(0);
      setIsPlaying(false);
      setInterpolatedData(getInterpolatedPoint(selectedSession, 0));
    } else {
      setInterpolatedData(null);
      setIsPlaying(false);
    }
  }, [selectedSession, map, isVisible]);

  // İnterpolasyon güncelle
  useEffect(() => {
    if (selectedSession) {
      setInterpolatedData(getInterpolatedPoint(selectedSession, progress));
    }
  }, [progress, selectedSession]);

  // Oynat / Durdur
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) { setIsPlaying(false); return 100; }
          return prev + 0.5;
        });
      }, 50);
    } else {
      clearInterval(playIntervalRef.current);
    }
    return () => clearInterval(playIntervalRef.current);
  }, [isPlaying]);

  const handleSaveRoute = async () => {
    if (!saveFrom || !saveTo || !savingSession) return;
    const { km } = calcStats(savingSession.session);
    let finalName = saveName || `${saveFrom} - ${saveTo}`;
    if (saveTripId) {
      const t = trips.find(trip => trip.id === saveTripId);
      if (t) finalName = `${t.from} - ${t.to} (${t.date})`;
    }
    await addSavedTrackingRoute({
      name: finalName,
      from: saveFrom,
      to: saveTo,
      km,
      startPoint: { lat: savingSession.session[0].lat, lon: savingSession.session[0].lon },
      endPoint:   { lat: savingSession.session[savingSession.session.length - 1].lat, lon: savingSession.session[savingSession.session.length - 1].lon },
      path: savingSession.session.filter(p => !isNaN(p.lat)).map(p => [p.lat, p.lon]),
    });
    setSavingSession(null); setSaveFrom(''); setSaveTo(''); setSaveName(''); setSaveTripId('');
  };

  if (!isVisible) return null;

  return (
    <>
      {/* ── Harita Katmanları ── */}
      {selectedSession && (
        <>
          <Polyline
            positions={selectedSession.filter(p => !isNaN(p.lat)).map(p => [p.lat, p.lon])}
            color="#818cf8"
            weight={5}
            opacity={0.85}
          />
          <Marker position={[selectedSession[0].lat, selectedSession[0].lon]} icon={startIcon}>
            <Popup><div className="p-1 text-xs font-semibold">Başlangıç</div></Popup>
          </Marker>
          {interpolatedData && (
            <Marker position={[interpolatedData.lat, interpolatedData.lon]} icon={truckPlayIcon} zIndexOffset={1000}>
              <Popup autoPan={false}>
                <div className="p-2 text-center">
                  <div className="text-base font-bold text-sky-600">{Math.round((interpolatedData.speed || 0) * 3.6)} km/h</div>
                  <div className="text-xs text-slate-500">{new Date(interpolatedData.timestamp).toLocaleTimeString('tr-TR')}</div>
                </div>
              </Popup>
            </Marker>
          )}
        </>
      )}

      {/* ── Sidebar ── */}
      <div
        ref={sidebarRef}
        className={`
          absolute top-[76px] left-4 bottom-4 w-[300px]
          z-[1500]
          flex flex-col rounded-3xl
          transition-transform duration-300 ease-out
          ${showSidebar ? 'translate-x-0' : '-translate-x-[110%]'}
        `}
        style={{
          background: 'rgba(13,18,25,0.97)',
          border: '1px solid rgba(255,255,255,0.04)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.03)',
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* Başlık */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-white/[0.05]">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <CalendarDays size={15} className="text-indigo-400" />
            Rota Geçmişi
          </h2>
          <button
            onClick={() => setShowSidebar(false)}
            className="p-1.5 text-slate-500 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-xl transition-all"
          >
            <X size={13} />
          </button>
        </div>

        {/* Filtreler */}
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <div className="flex bg-white/[0.03] border border-white/[0.05] p-0.5 rounded-xl items-center">
            {DATE_FILTERS.map(f => {
              const isActive = dateFilterDays === f.days && !customDate;
              return (
                <button
                  key={f.days}
                  onClick={() => { setDateFilterDays(f.days); setCustomDate(''); }}
                  className={`flex-1 py-1.5 text-[11px] rounded-[10px] font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-md'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
            
            <div className="w-px h-4 bg-white/10 mx-1 flex-shrink-0" />
            
            <div className="relative flex items-center justify-center px-2 w-8 h-8 rounded-[10px] transition-colors hover:bg-white/[0.04]">
              <input
                type="date"
                value={customDate}
                onChange={e => { 
                  if (e.target.value) {
                    setCustomDate(e.target.value); 
                    setDateFilterDays(0); 
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                title="Özel Tarih Seç"
              />
              <CalendarDays 
                size={14} 
                className={`transition-colors pointer-events-none ${customDate ? 'text-indigo-400' : 'text-slate-500'}`} 
              />
            </div>
          </div>
          
          {/* Özel tarih seçildiyse ufak bilgi */}
          {customDate && (
            <div className="flex items-center justify-center gap-2 mt-2.5">
              <span className="text-[10px] font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                {new Date(customDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <button 
                onClick={() => { setCustomDate(''); setDateFilterDays(1); }} 
                className="text-[10px] text-slate-500 hover:text-slate-300 underline transition-colors"
              >
                Temizle
              </button>
            </div>
          )}
        </div>

        {/* Araç Seçici (Dropdown) */}
        <div className="px-3 pb-3">
          <button 
            onClick={() => setIsVehicleDropdownOpen(!isVehicleDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.07] transition-all duration-200"
          >
            <span className="text-[11.5px] font-semibold text-slate-300 truncate">
              {selectedDriver ? getDisplayName(selectedDriver) : 'Araç seç...'}
            </span>
            <motion.div
              animate={{ rotate: isVehicleDropdownOpen ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="flex-shrink-0 ml-2"
            >
              <ChevronDown size={13} className="text-slate-500" />
            </motion.div>
          </button>

          {/* Açılır Menü */}
          <AnimatePresence>
            {isVehicleDropdownOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0, y: -4 }}
                animate={{ height: 'auto', opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
                className="overflow-hidden mt-1"
              >
                <div className="rounded-xl overflow-hidden border border-white/[0.04] bg-white/[0.02]">
                  {Object.entries(sessionsByDriver).filter(([_, sessions]) => sessions.length > 0).map(([driver, sessions]) => {
                    const visibleCount = dateFilterDays === 0
                      ? sessions.length
                      : sessions.filter(s => {
                          const stats = calcStats(s);
                          return parseFloat(stats.km) >= 10 && parseInt(stats.durationMin) >= 20;
                        }).length;
                    if (visibleCount === 0) return null;
                    return (
                      <button
                        key={driver}
                        onClick={() => { 
                          setSelectedDriver(driver); 
                          setIsVehicleDropdownOpen(false); 
                          setSelectedSession(null); 
                        }}
                        className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between border-b border-white/[0.04] last:border-0 transition-all duration-150 ${
                          selectedDriver === driver
                            ? 'bg-indigo-500/[0.12]'
                            : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className={`text-[11px] font-semibold ${
                          selectedDriver === driver ? 'text-indigo-300' : 'text-slate-400'
                        }`}>
                          {getDisplayName(driver)}
                        </span>
                        <span className="text-[9.5px] text-slate-600 font-medium px-1.5 py-0.5 bg-white/[0.04] rounded-md ml-2 flex-shrink-0">
                          {visibleCount} rota
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Seçili Aracın Rotası */}
        <div ref={listCallbackRef} className="flex-1 overflow-y-auto px-3 pb-3 space-y-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {selectedDriver && sessionsByDriver[selectedDriver] && (
            <div className="space-y-1.5">
              {[...sessionsByDriver[selectedDriver]].reverse().map((session, i) => {
                const totalSessions = sessionsByDriver[selectedDriver].length;
                const start = new Date(session[0]?.timestamp);
                const end   = new Date(session[session.length - 1]?.timestamp);
                const isSelected = selectedSession === session;
                const { km, durationMin } = calcStats(session);

                // "Tümü" seçili değilse 10 km altı ve 20 dk altı rotaları gizle
                if (dateFilterDays !== 0 && (parseFloat(km) < 10 || parseInt(durationMin) < 20)) return null;

                return (
                  <React.Fragment key={i}>
                    <button
                      onClick={() => setSelectedSession(isSelected ? null : session)}
                      className={`w-full text-left px-3 py-3 rounded-xl border transition-all duration-200 relative overflow-hidden ${
                        isSelected
                          ? 'bg-indigo-500/10 border-indigo-500/25 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.2)]'
                          : 'bg-white/[0.02] border-white/[0.04] hover:border-white/[0.09] hover:bg-white/[0.04]'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-indigo-500 rounded-full" />
                      )}
                      <div className="flex justify-between items-start mb-2 pl-2">
                        <span className={`text-xs font-bold ${isSelected ? 'text-indigo-400' : 'text-slate-300'}`}>
                          Rota {totalSessions - i}
                        </span>
                        <span className="text-[10px] text-slate-600 font-medium">
                          {start.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 pl-2 mb-2.5 flex items-center gap-1.5">
                        <span>{start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-slate-700">→</span>
                        <span>{end.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex gap-1.5 pl-2">
                        <span className="px-2 py-0.5 bg-white/[0.05] rounded-lg text-[10px] text-slate-400 font-semibold border border-white/[0.05]">
                          {km} km
                        </span>
                        <span className="px-2 py-0.5 bg-white/[0.05] rounded-lg text-[10px] text-slate-400 font-semibold border border-white/[0.05]">
                          {durationMin} dk
                        </span>
                      </div>
                    </button>

                    {isSelected && (
                      <button
                        onClick={e => { e.stopPropagation(); setSavingSession({ session, driver: selectedDriver }); }}
                        className="w-full py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 text-[11px] font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                      >
                        <BookmarkPlus size={13} /> Rotayı Kaydet
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar kapalıyken aç butonu */}
      {!showSidebar && (
        <button
          onClick={() => setShowSidebar(true)}
          className="absolute left-4 z-[1500]"
          style={{
            top: '76px',
            padding: '10px 14px',
            background: 'rgba(13, 18, 25, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: 14,
            color: '#818cf8',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <CalendarDays size={15} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>Geçmiş</span>
        </button>
      )}

      {/* ── Alt Oynatma Çubuğu ── */}
      {selectedSession && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[2000] w-11/12 max-w-xl pointer-events-auto">
          <div
            className="px-4 py-4 rounded-3xl flex items-center gap-4"
            style={{ background: 'rgba(13,18,25,0.97)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(24px)' }}
          >
            {/* Play / Pause */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-11 h-11 rounded-full bg-indigo-500 flex items-center justify-center text-white hover:bg-indigo-600 active:scale-95 transition-all shadow-lg shadow-indigo-500/30 flex-shrink-0"
            >
              {isPlaying
                ? <Pause fill="currentColor" size={18} />
                : <Play fill="currentColor" className="ml-0.5" size={18} />}
            </button>

            {/* Slider */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-[10px] font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                <span>{new Date(selectedSession[0].timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                {interpolatedData && (
                  <span className="text-indigo-400 px-2 py-0.5 bg-indigo-500/10 rounded-full border border-indigo-500/15">
                    {Math.round((interpolatedData.speed || 0) * 3.6)} km/h
                  </span>
                )}
                <span>{new Date(selectedSession[selectedSession.length - 1].timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>

              <div className="relative">
                <input
                  type="range"
                  min="0" max="100" step="0.1"
                  value={progress}
                  onChange={e => { setIsPlaying(false); setProgress(parseFloat(e.target.value)); }}
                  className="w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #6366f1 ${progress}%, rgba(255,255,255,0.08) ${progress}%)`,
                  }}
                />
                <style>{`
                  input[type='range']::-webkit-slider-thumb {
                    -webkit-appearance: none; appearance: none;
                    width: 16px; height: 16px; border-radius: 50%;
                    background: #fff; border: 2.5px solid #6366f1;
                    box-shadow: 0 0 12px rgba(99,102,241,0.7);
                    cursor: pointer; transition: transform 0.15s;
                  }
                  input[type='range']::-webkit-slider-thumb:hover { transform: scale(1.25); }
                `}</style>
              </div>
            </div>

            {/* Kapat */}
            <button
              onClick={() => setSelectedSession(null)}
              className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/[0.12] transition-all flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Kaydetme Modalı ── */}
      {savingSession && (
        <div className="fixed inset-0 z-[3500] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div
            className="rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            style={{ background: 'rgba(13,18,25,0.98)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-base flex items-center gap-2">
                <BookmarkPlus size={17} className="text-indigo-400" /> Rotayı Kaydet
              </h3>
              <button onClick={() => setSavingSession(null)} className="text-slate-600 hover:text-white p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Sefer seç */}
              <div>
                <label className="text-[11px] text-slate-500 mb-1.5 block font-semibold uppercase tracking-wider">Seferden İsim Al (Opsiyonel)</label>
                <select
                  value={saveTripId}
                  onChange={e => {
                    setSaveTripId(e.target.value);
                    if (e.target.value) {
                      const t = trips.find(trip => trip.id === e.target.value);
                      if (t) { setSaveFrom(t.from || ''); setSaveTo(t.to || ''); }
                    }
                  }}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-colors"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="">— Seçmeden Devam Et —</option>
                  {trips.map(t => (
                    <option key={t.id} value={t.id}>{t.from} → {t.to} ({t.date})</option>
                  ))}
                </select>
              </div>

              {!saveTripId && (
                <div>
                  <label className="text-[11px] text-slate-500 mb-1.5 block font-semibold uppercase tracking-wider">Özel Ad</label>
                  <input
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    placeholder="Örn: Ankara - İstanbul"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                </div>
              )}

              {[
                { label: 'Nereden', value: saveFrom, set: setSaveFrom, placeholder: 'Örn: Ankara' },
                { label: 'Nereye',  value: saveTo,   set: setSaveTo,   placeholder: 'Örn: İstanbul' },
              ].map(field => (
                <div key={field.label}>
                  <label className="text-[11px] text-slate-500 mb-1.5 block font-semibold uppercase tracking-wider">{field.label}</label>
                  <input
                    value={field.value}
                    onChange={e => field.set(e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                </div>
              ))}

              <button
                onClick={handleSaveRoute}
                disabled={!saveFrom || !saveTo}
                className="w-full py-3 bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white font-bold rounded-2xl transition-all shadow-lg shadow-indigo-500/20 mt-1"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

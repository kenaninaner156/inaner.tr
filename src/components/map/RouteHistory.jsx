import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Polyline, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, Play, Pause, X, Smartphone, BookmarkPlus, Scissors, Edit2, Check, Loader2, Clock } from 'lucide-react';
import { calcStats, getInterpolatedPointLinear, haversineKm, groupIntoSessions, filterSessionPoints } from '../../utils/mapUtils';
import { DataContext } from '../../context/DataContext';
import { db } from '../../services/firebaseConfig';
import { collection, query, where, orderBy, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
function getSpeedColor(speedKnots) {
  const kmh = (speedKnots || 0) * 1.852;
  if (kmh < 5)  return '#ef4444';  // kırmızı
  if (kmh < 30) return '#f97316';  // turuncu
  if (kmh < 70) return '#6366f1';  // orange
  if (kmh < 90) return '#38bdf8';  // cyan
  return '#22c55e';                // yeşil
}

function formatDuration(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h > 0) return `${h} sa ${m} dk`;
  return `${m} dk`;
}

const SpeedPolylines = React.memo(({ session }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  if (!session || session.length < 2) return null;
  const segments = [];
  for (let i = 0; i < session.length - 1; i++) {
    const a = session[i], b = session[i + 1];
    if (isNaN(a.lat) || isNaN(b.lat)) continue;
    const color = getSpeedColor(a.speed);
    const last = segments[segments.length - 1];
    if (last && last.color === color) {
      last.positions.push([b.lat, b.lon]);
    } else {
      segments.push({ color, positions: [[a.lat, a.lon], [b.lat, b.lon]] });
    }
  }

  // Dinamik çizgi kalınlığı: Uzaktayken ince, yakındayken kalın (kesintisiz/smooth geçiş)
  const base = Math.max(1, (zoom - 7) * 0.35 + 1.2);
  const lineWeight = Math.min(5.0, Math.max(1.2, base));
  const shadowWeight = lineWeight + 2.5;

  return (
    <>
      {/* ── Alt Gölge (Yumuşak Dış Hat) ── */}
      <Polyline
        positions={session.filter(p => !isNaN(p.lat)).map(p => [p.lat, p.lon])}
        color="#000"
        weight={shadowWeight}
        opacity={0.3}
        smoothFactor={1.5}
      />
      {/* ── Renkli Hız Çizgileri ── */}
      {segments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg.positions}
          color={seg.color}
          weight={lineWeight}
          opacity={0.9}
          smoothFactor={1}
        />
      ))}
    </>
  );
});


const truckPlayIcon = L.divIcon({
  html: `
    <div style="
      width: 36px;
      height: 36px;
      background: #0c1018;
      border: 1.5px solid rgba(245, 158, 11, 0.85);
      border-radius: 50%;
      box-shadow: 0 4px 16px rgba(0,0,0,0.8), 0 0 10px rgba(245, 158, 11, 0.35), inset 0 1px 0 rgba(255,255,255,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    ">
      <img src="/tir-clear.png?v=8" style="
        width: 72%;
        height: 72%;
        object-fit: contain;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
      " />
    </div>
  `,
  className: 'custom-playback-marker-div',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// ── Mobile Route History Card (Integrated Navigation & Playback) ─────────
function MobileRouteHistoryCard({
  selectedDriver,
  setSelectedDriver,
  deviceMappings,
  trucks,
  getDisplayName,
  historyDate,
  setHistoryDate,
  sessions,
  selectedSession,
  setSelectedSession,
  isPlaying,
  setIsPlaying,
  playbackSpeed,
  setPlaybackSpeed,
  progress,
  setProgress,
  interpolatedData,
  historyLoading,
  customRouteNames
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());

  const touchStartRef = useRef(null);
  const touchEndRef = useRef(null);

  const handleTouchStart = (e) => {
    touchEndRef.current = null;
    touchStartRef.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e) => {
    touchEndRef.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current || !touchEndRef.current) return;
    const distance = touchStartRef.current - touchEndRef.current;
    if (distance > 40) {
      // Swiped Left -> Next Month
      const nextM = new Date(calendarViewDate);
      nextM.setMonth(nextM.getMonth() + 1);
      setCalendarViewDate(nextM);
    } else if (distance < -40) {
      // Swiped Right -> Previous Month
      const prevM = new Date(calendarViewDate);
      prevM.setMonth(prevM.getMonth() - 1);
      setCalendarViewDate(prevM);
    }
  };

  const cardRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  // Filter valid sessions (>= 5 km or >= 5 min)
  const validSessions = (sessions || []).filter(s => {
    const { km, durationMin } = calcStats(s);
    return parseFloat(km) >= 5 && parseInt(durationMin) >= 5;
  });

  const currentStats = selectedSession ? calcStats(selectedSession) : null;
  const currentSpeed = interpolatedData ? Math.round((interpolatedData.speed || 0) * 1.852) : 0;
  const startTime = selectedSession && selectedSession[0] ? new Date(selectedSession[0].timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
  const endTime = selectedSession && selectedSession.length > 0 ? new Date(selectedSession[selectedSession.length - 1].timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';

  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

  // Generate 5 quick date items (Bugün, Dün, vb.)
  const quickDates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    const isToday = i === 0;
    const isYesterday = i === 1;
    const label = isToday ? 'Bugün' : isYesterday ? 'Dün' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    return { dateStr: dStr, label };
  });

  const isCustomDate = !quickDates.some(q => q.dateStr === historyDate);

  return (
    <div
      ref={cardRef}
      className="absolute bottom-3 left-3 right-3 z-[1500] pointer-events-auto rounded-[28px] p-3.5 flex flex-col gap-2.5 shadow-[0_16px_50px_rgba(0,0,0,0.85)] border border-white/10 bg-[#0d1219] md:hidden overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      style={{
        marginBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      {/* ── ÜST BAŞLIK — Tıklayınca Sefer / Tarih Değiştirme Menüsü Genişler ── */}
      <div 
        onClick={() => setIsExpanded(prev => !prev)}
        className="flex items-center justify-between cursor-pointer select-none group active:opacity-75 transition-opacity"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
            <Clock size={16} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition-colors">
                {selectedSession 
                  ? (customRouteNames[selectedSession[0]?.timestamp] || 'Seçili Sefer')
                  : (selectedDriver ? getDisplayName(selectedDriver) : 'Rota Geçmişi')
                }
              </span>
              <ChevronDown 
                size={14} 
                className={`text-slate-400 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${isExpanded ? 'rotate-180 text-amber-400' : ''}`}
              />
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {selectedSession && currentStats ? (
                <span className="text-[10px] font-bold text-amber-400">
                  {currentStats.km} km • {formatDuration(currentStats.durationMin)} • {startTime} ➔ {endTime}
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-400">
                  {historyDate === todayStr ? 'Bugün' : new Date(historyDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} • {validSessions.length} Sefer
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="px-2.5 py-1 bg-white/[0.04] text-slate-400 rounded-xl text-[10px] font-bold border border-white/[0.04] flex items-center gap-1 shrink-0">
          <span>{validSessions.length} Sefer</span>
        </div>
      </div>

      {/* ── SEFER / TARİH SEÇİM MENÜSÜ (CSS Grid Accordion) ── */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isExpanded 
            ? 'grid-rows-[1fr] opacity-100 border-t border-white/[0.06] pt-2.5' 
            : 'grid-rows-[0fr] opacity-0 border-t-0 pt-0 pointer-events-none'
        }`}
      >
        <div className="overflow-hidden flex flex-col gap-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* ── 1. ARAÇ SEÇİMİ (MOBİL) ── */}
          <div>
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-0.5 mb-1.5 flex items-center justify-between">
              <span>Araç Seç</span>
              <span className="text-[9px] font-semibold text-amber-400 truncate max-w-[140px]">
                {selectedDriver ? getDisplayName(selectedDriver) : ''}
              </span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
              {Object.keys(deviceMappings).map(driver => {
                const isSelected = selectedDriver === driver;
                return (
                  <button
                    key={driver}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDriver(driver);
                      setSelectedSession(null);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all active:scale-95 flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-gradient-to-r from-amber-600 to-orange-500 text-white border-amber-400/40 shadow-[0_2px_10px_rgba(245,158,11,0.3)]'
                        : 'bg-white/[0.04] text-slate-300 border-white/[0.06] hover:bg-white/[0.08]'
                    }`}
                  >
                    <span>{getDisplayName(driver)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 2. TARİH SEÇİMİ ── */}
          <div>
            <div className="flex items-center justify-between px-0.5 mb-1.5">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tarih Seç</div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCalendar(prev => !prev);
                }}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-xl border transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                  showCalendar || isCustomDate
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-[0_2px_8px_rgba(245,158,11,0.2)]'
                    : 'bg-white/[0.04] text-slate-400 border-white/[0.06] hover:text-white'
                }`}
              >
                <Calendar size={11} className={showCalendar || isCustomDate ? 'text-amber-400' : 'text-slate-400'} />
                <span>{isCustomDate ? new Date(historyDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : 'Diğer'}</span>
              </button>
            </div>

            {/* İnce ve Şık 5 Hızlı Tarih Butonu */}
            <div className="grid grid-cols-5 gap-1 w-full">
              {quickDates.map(p => {
                const isSelected = historyDate === p.dateStr && !showCalendar;
                return (
                  <button
                    key={p.dateStr}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHistoryDate(p.dateStr);
                      setSelectedSession(null);
                      setShowCalendar(false);
                    }}
                    className={`py-1.5 px-0.5 rounded-xl text-[10.5px] font-bold text-center border transition-all active:scale-95 flex flex-col items-center justify-center ${
                      isSelected 
                        ? 'bg-gradient-to-r from-amber-600 to-orange-500 text-white border-amber-400/40 shadow-[0_2px_8px_rgba(245,158,11,0.3)]' 
                        : 'bg-white/[0.04] text-slate-400 border-white/[0.04] hover:bg-white/[0.08]'
                    }`}
                  >
                    <span className="truncate w-full">{p.label}</span>
                  </button>
                );
              })}
            </div>

            {/* ── DİĞER'E BASILINCA AÇILAN TAM BOYUT AY TAKVİMİ ── */}
            {showCalendar && (
              <div className="mt-2.5 rounded-2xl bg-[#090d14] border border-white/[0.08] p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const prevM = new Date(calendarViewDate);
                      prevM.setMonth(prevM.getMonth() - 1);
                      setCalendarViewDate(prevM);
                    }} 
                    className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white active:scale-95"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    {calendarViewDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                  </span>

                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const nextM = new Date(calendarViewDate);
                      nextM.setMonth(nextM.getMonth() + 1);
                      setCalendarViewDate(nextM);
                    }} 
                    className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white active:scale-95"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Gün İsimleri */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(d => (
                    <div key={d} className="text-[10px] font-bold text-slate-500 py-0.5">{d}</div>
                  ))}
                </div>

                {/* Günler Izgarası */}
                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    const year = calendarViewDate.getFullYear();
                    const month = calendarViewDate.getMonth();
                    const firstDay = new Date(year, month, 1).getDay();
                    const adjFirstDay = firstDay === 0 ? 6 : firstDay - 1;
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    
                    const days = [];
                    for (let i = 0; i < adjFirstDay; i++) {
                      days.push(<div key={`pad-${i}`} />);
                    }
                    
                    for (let day = 1; day <= daysInMonth; day++) {
                      const dObj = new Date(year, month, day);
                      const dStr = dObj.toISOString().slice(0, 10);
                      const isSelected = historyDate === dStr;
                      const isToday = dStr === todayStr;
                      const isFuture = dStr > todayStr;
                      
                      days.push(
                        <button
                          key={day}
                          type="button"
                          disabled={isFuture}
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryDate(dStr);
                            setSelectedSession(null);
                            setShowCalendar(false);
                          }}
                          className={`h-9 w-full rounded-xl text-xs font-bold transition-all active:scale-95 flex flex-col items-center justify-center relative ${
                            isSelected
                              ? 'bg-gradient-to-b from-amber-500 to-orange-600 text-white shadow-[0_2px_12px_rgba(245,158,11,0.45)]'
                              : isToday
                              ? 'bg-white/[0.08] text-amber-400 border border-amber-500/30'
                              : isFuture
                              ? 'text-slate-700 cursor-not-allowed opacity-30'
                              : 'text-slate-300 hover:bg-white/[0.08] active:bg-white/10'
                          }`}
                        >
                          <span>{day}</span>
                          {isToday && !isSelected && (
                            <span className="w-1 h-1 rounded-full bg-amber-400 absolute bottom-1" />
                          )}
                        </button>
                      );
                    }
                    return days;
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Seferler Listesi */}
          <div>
            <div className="text-[9px] font-bold text-slate-400 px-1 mb-1.5 uppercase tracking-wider">Seferler</div>
            {historyLoading ? (
              <div className="py-6 flex items-center justify-center gap-2 text-slate-500">
                <Loader2 size={16} className="animate-spin text-amber-400" />
                <span className="text-xs">Yükleniyor...</span>
              </div>
            ) : validSessions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                Bu tarihte kayıtlı sefer bulunamadı.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {[...validSessions].reverse().map((session, idx) => {
                  const isSelected = selectedSession === session;
                  const { km, durationMin, topSpeedKmh, avgSpeedKmh } = calcStats(session);
                  const start = new Date(session[0]?.timestamp);
                  const end = new Date(session[session.length - 1]?.timestamp);
                  const title = customRouteNames[session[0]?.timestamp] || `Sefer ${validSessions.length - idx}`;
                  return (
                    <div
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSession(session);
                        setIsExpanded(false);
                      }}
                      className={`rounded-2xl border transition-all cursor-pointer select-none active:scale-[0.98] overflow-hidden ${
                        isSelected 
                          ? 'bg-[#121722]/95 border-amber-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.6)]' 
                          : 'bg-[#0f141d]/70 border-white/[0.04] hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="p-3 pb-2 flex items-center justify-between gap-2 border-b border-white/[0.04]">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-xs font-bold truncate ${isSelected ? 'text-amber-300' : 'text-white'}`}>
                              {title}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 font-medium shrink-0">
                              {start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} ➔ {end.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 ml-1">
                            <Check size={12} />
                          </div>
                        ) : (
                          <ChevronRight size={13} className="text-slate-600 shrink-0 ml-1" />
                        )}
                      </div>

                      {/* 3 Kolonlu Mobil Telemetri */}
                      <div className="grid grid-cols-3 divide-x divide-white/[0.04] p-1.5 bg-[#090d14]/70 text-center">
                        <div className="px-1">
                          <div className="text-[7.5px] font-semibold text-slate-400 uppercase">MESAFE</div>
                          <div className="text-[11px] font-mono font-bold text-white mt-0.5">{km} <span className="text-[8px] font-sans font-normal text-slate-400">km</span></div>
                        </div>
                        <div className="px-1">
                          <div className="text-[7.5px] font-semibold text-slate-400 uppercase">MAX HIZ</div>
                          <div className="text-[11px] font-mono font-bold text-amber-300 mt-0.5">{topSpeedKmh} <span className="text-[8px] font-sans font-normal text-slate-400">km/h</span></div>
                        </div>
                        <div className="px-1">
                          <div className="text-[7.5px] font-semibold text-slate-400 uppercase">ORT. HIZ</div>
                          <div className="text-[11px] font-mono font-bold text-slate-200 mt-0.5">{avgSpeedKmh} <span className="text-[8px] font-sans font-normal text-slate-400">km/h</span></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SEÇİLİ SEFER ENTEGRE OYNATMA KONTROLLERİ ── */}
      {selectedSession && (
        <div className="border-t border-white/[0.06] pt-2 flex flex-col gap-2">
          {/* Üst Bar: Play/Pause, Hız Butonu, Anlık Hız Rozeti */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlaying(!isPlaying);
                }}
                className="w-9 h-9 rounded-full bg-gradient-to-r from-amber-600 to-orange-500 flex items-center justify-center text-white active:scale-95 shadow-[0_2px_12px_rgba(245,158,11,0.35)] transition-all shrink-0"
              >
                {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPlaybackSpeed(prev => (prev === 1 ? 2 : prev === 2 ? 5 : prev === 5 ? 10 : 1));
                }}
                className="px-2.5 py-1 rounded-xl bg-white/[0.05] border border-white/[0.06] text-[10px] font-bold text-amber-400 active:scale-95 transition-all"
              >
                {playbackSpeed}x
              </button>
            </div>

            {/* Anlık Simülasyon Hızı */}
            <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] font-black text-amber-400">{currentSpeed} km/h</span>
            </div>
          </div>

          {/* İlerleme Çubuğu ve Saatler */}
          <div className="flex flex-col gap-1">
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={progress}
              onInput={e => { setIsPlaying(false); setProgress(parseFloat(e.target.value)); }}
              onChange={e => { setIsPlaying(false); setProgress(parseFloat(e.target.value)); }}
              className="w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #f59e0b ${progress}%, rgba(255,255,255,0.08) ${progress}%)`,
              }}
            />
            <div className="flex justify-between text-[9px] font-semibold text-slate-500">
              <span>{startTime}</span>
              <span>{endTime}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const DATE_FILTERS = [
  { label: 'Bugün',  days: 1 },
  { label: '7 Gün',  days: 7 },
  { label: '30 Gün', days: 30 },
  { label: 'Tümü',   days: 0 },
];

export default function RouteHistory({
  isVisible,
  onClose,
  deviceMappings,
  trucks,
  historyDate, setHistoryDate,
  activeCompanyId,
  liveLocations = [],
  selectedDriver,
  setSelectedDriver,
}) {
  const map = useMap();
  const { addManualSplit, customRouteNames, setCustomRouteName, geofences, manualSplits, manualMerges, addManualMerge, manualDeletes, addManualDelete } = useContext(DataContext);

  const liveLocationsRef = useRef(liveLocations);
  useEffect(() => {
    liveLocationsRef.current = liveLocations;
  }, [liveLocations]);

  const [selectedSession, setSelectedSession] = useState(null);
  const [showPlayer, setShowPlayer]           = useState(false);
  const [isVehicleDropdownOpen, setIsVehicleDropdownOpen] = useState(false);
  const [cachedDates, setCachedDates] = useState([]); // Hangi günlerin Firebase'de verili cache'i var?
  const [emptyCachedDates, setEmptyCachedDates] = useState([]); // Hangi günlerin "Boş" olduğu Firebase'e işlendi?
  const [showSidebar, setShowSidebar]         = useState(true);
  const [calendarMode, setCalendarMode]       = useState('closed'); // 'closed', '7', '21', 'month'
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());
  
  const [editingSessionKey, setEditingSessionKey] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [userInteracted, setUserInteracted] = useState(false);

  // ── On-Demand Caching State ─────────────────────────────────────────
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sessionsByDriver, setSessionsByDriver] = useState({});
  const [fetchError, setFetchError] = useState(null);
  const historyFetchRef = useRef(null);

  // Takvim uzun basma ref'i
  const calendarTimerRef = useRef(null);

  // Tarih değiştiğinde veya modül açıldığında: O GÜN en çok kilometre / hareket yapan aracı otomatik seç
  useEffect(() => {
    if (!isVisible) return;
    const drivers = Object.keys(deviceMappings);
    if (drivers.length === 0) return;
    if (drivers.length === 1) {
      if (selectedDriver !== drivers[0]) setSelectedDriver(drivers[0]);
      return;
    }

    const todayStr = (() => {
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
    })();

    const isToday = historyDate === todayStr;

    // 1. Bugün ise: liveLocations içerisindeki nokta sayısına göre lider aracı bul
    if (isToday) {
      let topDriver = drivers[0];
      let maxPoints = -1;
      drivers.forEach(d => {
        const pts = (liveLocations || []).filter(l => l.driverId === d || l.deviceId === d || l.driver === d).length;
        if (pts > maxPoints) {
          maxPoints = pts;
          topDriver = d;
        }
      });
      const currentPts = selectedDriver ? (liveLocations || []).filter(l => l.driverId === selectedDriver || l.deviceId === selectedDriver || l.driver === selectedDriver).length : 0;
      if (!selectedDriver || (currentPts === 0 && maxPoints > 0)) {
        setSelectedDriver(topDriver);
      }
      return;
    }

    // 2. Geçmiş bir gün ise: daily_routes koleksiyonundan o günün en çok noktasına sahip aracını bul
    let isCancelled = false;
    Promise.all(
      drivers.map(async (d) => {
        try {
          const dailySnap = await getDoc(doc(db, 'daily_routes', `${d}_${historyDate}`));
          const ptsCount = dailySnap.exists() && Array.isArray(dailySnap.data().points) ? dailySnap.data().points.length : 0;
          return { driver: d, ptsCount };
        } catch {
          return { driver: d, ptsCount: 0 };
        }
      })
    ).then(results => {
      if (isCancelled) return;
      results.sort((a, b) => b.ptsCount - a.ptsCount);
      const best = results[0];
      
      const currentDriverData = results.find(r => r.driver === selectedDriver);
      if (!selectedDriver || (!currentDriverData?.ptsCount && best?.ptsCount > 0)) {
        if (best?.driver) {
          setSelectedDriver(best.driver);
        }
      }
    }).catch(err => {
      console.warn('O günün lider aracını bulma hatası:', err);
    });

    return () => { isCancelled = true; };
  }, [isVisible, historyDate, deviceMappings, liveLocations]);

  // Seçili driver veya tarih değiştiğinde veriyi çek (Önbellekten veya Firebase'den)
  // Hangi günlerin cachelendiğini periyodik olarak veya araç değişince çek
  useEffect(() => {
    if (!isVisible || !selectedDriver || !activeCompanyId) return;
    const q = query(
      collection(db, 'vehicle_daily_stats'),
      where('deviceId', '==', selectedDriver),
      where('companyId', '==', activeCompanyId)
    );
    getDocs(q).then(snap => {
      const full = [];
      const empty = [];
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.sessionsJson === '[]' || Number(data.totalKm || 0) === 0) {
          empty.push(data.date);
        } else {
          full.push(data.date);
        }
      });
      setCachedDates([...new Set(full)]);
      setEmptyCachedDates([...new Set(empty)]);
    }).catch(err => console.error("Cache listesi çekilemedi:", err));
  }, [selectedDriver, activeCompanyId, isVisible]);

  useEffect(() => {
    if (!isVisible || !selectedDriver || !historyDate) return;

    if (historyFetchRef.current) historyFetchRef.current = false;
    const fetchId = {};
    historyFetchRef.current = fetchId;
    setHistoryLoading(true);
    setFetchError(null);

    const doFetch = async () => {
      try {
        const snapId = `${activeCompanyId || 'default'}_${selectedDriver}_${historyDate}_v7_${manualSplits?.length || 0}_${manualMerges?.length || 0}_${manualDeletes?.length || 0}`; // _v7 cache
        const cacheRef = doc(db, 'vehicle_daily_stats', snapId);
        
        // 1. ÖNCE ÖNBELLEĞE (CACHE) BAK (Maliyet: 1 Read)
        const cached = await getDoc(cacheRef);
        if (cached.exists() && cached.data().sessionsJson) {
          if (historyFetchRef.current === fetchId) {
            try {
              setSessionsByDriver({ [selectedDriver]: JSON.parse(cached.data().sessionsJson) });
            } catch (e) {
              console.error('Cache parse error:', e);
              setSessionsByDriver({ [selectedDriver]: [] });
            }
            setSelectedSession(null); // Yeni veride seçimi sıfırla
          }
          return;
        }

        // 2. CACHE YOKSA: ÖNCELİKLE YENİ OPTİMİZE GÜNLÜK DÖKÜMANDAN ÇEK (daily_routes)
        const todayStr = new Date().toISOString().slice(0, 10);
        const isToday = historyDate === todayStr;
        let points = [];

        // 2.1 daily_routes/{selectedDriver_YYYY-MM-DD} dökümanını tek okumada çek
        try {
          const dailyDocId = `${selectedDriver}_${historyDate}`;
          const dailySnap = await getDoc(doc(db, 'daily_routes', dailyDocId));
          if (dailySnap.exists() && Array.isArray(dailySnap.data().points) && dailySnap.data().points.length > 0) {
            points = dailySnap.data().points;
          }
        } catch (dailyErr) {
          console.warn("daily_routes okuma uyarısı (fallback deneniyor):", dailyErr);
        }

        // 2.2 Fallback: Eğer daily_routes'da yoksa veya eski kayıt ise truck_routes'dan çek
        if (points.length === 0) {
          const [y, m, d] = historyDate.split('-').map(Number);
          const dayStart = new Date(y, m - 1, d, -4, 0, 0, 0); // Önceki gün 20:00
          const dayEnd   = new Date(y, m - 1, d, 36, 0, 0, 0); // Ertesi gün 12:00

          const buildQuery = (field) => query(
            collection(db, 'truck_routes'),
            where(field, '==', selectedDriver),
            where('timestamp', '>=', dayStart.toISOString()),
            where('timestamp', '<=', dayEnd.toISOString()),
            orderBy('timestamp', 'asc')
          );

          let snap;
          try {
            snap = await getDocs(buildQuery('driverId'));
            if (snap.docs.length === 0) {
              snap = await getDocs(buildQuery('deviceId'));
            }
            if (historyFetchRef.current !== fetchId) return;
            points = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          } catch (e) {
            console.error('Veri çekme hatası (Index eksik olabilir):', e);
            if (e.message?.includes('index')) {
              setFetchError('Firebase Composite Index eksik. Konsoldaki linke tıklayıp oluşturun.');
            } else {
              setFetchError('Veri alınamadı.');
            }
            if (historyFetchRef.current === fetchId) setSessionsByDriver({ [selectedDriver]: [] });
            return;
          }
        }
        
        // 3. VERİYİ SIKIŞTIR VE SEFERLERE BÖL
        // Tolerans tekrar 30 dakikaya çekildi, ancak manuel birleştirmeler eklendi.
        const rawSessions = groupIntoSessions(points, 30, geofences, manualSplits || [], manualMerges || []);
        
        // SADECE BAŞLANGIÇ TARİHİ SEÇİLİ GÜN OLANLARI FİLTRELE VE SİLİNENLERİ ÇIKAR (Türkiye Europe/Istanbul Saat Dilimi)
        const getTurkeyDateStr = (dateOrIso) => {
          try {
            const d = new Date(dateOrIso);
            const formatter = new Intl.DateTimeFormat('tr-TR', {
              timeZone: 'Europe/Istanbul',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            const parts = formatter.formatToParts(d);
            const day = parts.find(p => p.type === 'day')?.value || '01';
            const month = parts.find(p => p.type === 'month')?.value || '01';
            const year = parts.find(p => p.type === 'year')?.value || '2026';
            return `${year}-${month}-${day}`;
          } catch {
            return new Date(dateOrIso).toISOString().slice(0, 10);
          }
        };
        
        const validSessions = rawSessions.filter(session => {
          if (!session || session.length === 0) return false;
          
          // Silinmiş mi kontrol et
          if (manualDeletes?.includes(session[0].timestamp)) return false;

          const sessionStartDate = getTurkeyDateStr(session[0].timestamp);
          return sessionStartDate === historyDate;
        });

        // 1MB Firestore sınırını aşmamak için "Dinamik Sıkıştırma Algoritması"

        let lightweightSessions = [];
        let jsonString = "";

        if (isToday) {
          // Bugünün verisi cache'lenmeyeceği için ağır sıkıştırma ve döngüye gerek yok!
          const optimized = validSessions.map(session => filterSessionPoints(session, 0.05));
          lightweightSessions = optimized.map(session => 
            session.map(pt => ({
              lat: Number(Number(pt.lat).toFixed(5)), // 1 metre hassasiyet
              lon: Number(Number(pt.lon).toFixed(5)),
              timestamp: pt.timestamp,
              speed: pt.speed || 0
            }))
          );
        } else {
          let currentCompression = 0.05; // 50 metreden başla (En Yüksek Kalite)
          
          // Veri 900 KB'ın altına inene kadar sıkıştırma toleransını artır
          while (currentCompression <= 0.5) {
             const optimized = validSessions.map(session => filterSessionPoints(session, currentCompression));
             
             lightweightSessions = optimized.map(session => 
               session.map(pt => ({
                 lat: Number(Number(pt.lat).toFixed(5)),
                 lon: Number(Number(pt.lon).toFixed(5)),
                 timestamp: pt.timestamp,
                 speed: pt.speed || 0
               }))
             );
             
             jsonString = JSON.stringify(lightweightSessions);
             
             if (jsonString.length < 900000) { 
                 break;
             }
             // Sığmadıysa kaliteyi 50 metre daha düşür ve tekrar dene
             currentCompression += 0.05; 
          }
        }

        setSessionsByDriver({ [selectedDriver]: lightweightSessions });
        setSelectedSession(null);

        // 4. SONUÇLARI ÖNBELLEĞE KAYDET
        // Boş günleri de kaydediyoruz (length >= 0) ki her seferinde tekrar hesaplamasın.
        if (!isToday) {
           await setDoc(cacheRef, {
             deviceId: selectedDriver,
             date: historyDate,
             companyId: activeCompanyId || 'default',
             sessionsJson: jsonString, // Garantili boyuttaki JSON
             calculatedAt: new Date().toISOString()
           }, { merge: true });
        }

      } catch (err) {
        console.error('Genel fetch hatası:', err);
        if (historyFetchRef.current === fetchId) setFetchError('Bir hata oluştu.');
      } finally {
        if (historyFetchRef.current === fetchId) setHistoryLoading(false);
      }
    };
    
    doFetch();
  }, [isVisible, selectedDriver, historyDate, activeCompanyId, geofences, manualSplits?.length, manualMerges?.length, manualDeletes?.length]);

  // Yeni veri gelince en güncel seferi otomatik seç veya seçili oturumu güncelle (ezmeden)
  useEffect(() => {
    if (!selectedDriver) return;
    const driverSessions = sessionsByDriver[selectedDriver] || [];
    if (driverSessions.length === 0) {
      setSelectedSession(null);
      return;
    }

    if (selectedSession) {
      // Halihazırda bir oturum seçili. Yeni veri gelince bu oturumun güncel halini bulalım (timestamp ile eşleştirerek)
      const currentStartTs = selectedSession[0]?.timestamp;
      const updated = driverSessions.find(s => s[0]?.timestamp === currentStartTs);
      if (updated) {
        // Oturumu güncelle ama progress/isPlaying durumuna dokunma!
        setSelectedSession(updated);
      } else {
        // Eğer seçili oturum artık yoksa (silinmiş veya başka bir gün), son oturumu seç
        setSelectedSession(driverSessions[driverSessions.length - 1]);
        setProgress(0);
        setIsPlaying(false);
      }
    } else {
      // İlk defa veri yükleniyor, son oturumu otomatik seç
      setSelectedSession(driverSessions[driverSessions.length - 1]);
      setProgress(0);
      setIsPlaying(false);
    }
  }, [sessionsByDriver, selectedDriver, selectedSession]);

  // Harita ile kullanıcı etkileşimini dinle
  useEffect(() => {
    if (!map) return;
    const handleInteract = () => setUserInteracted(true);
    map.on('dragstart', handleInteract);
    map.on('zoomstart', handleInteract);
    return () => {
      map.off('dragstart', handleInteract);
      map.off('zoomstart', handleInteract);
    };
  }, [map]);



  // Harita etkileşimini sidebar üzerinde engelle
  const sidebarCallbackRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  // Oynatıcı çubuğu için koruma
  const playerCallbackRef = useCallback(node => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
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



  // Save modal için tıklama ve scroll engelleme (Leaflet sızıntılarını engeller)
  const saveModalRef = useCallback((el) => {
    if (el) {
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
    }
  }, []);


  // Oynatma
  const [progress, setProgress]               = useState(0);
  const [isPlaying, setIsPlaying]             = useState(false);
  const [playbackSpeed, setPlaybackSpeed]     = useState(1);
  
  // Play'e basılınca auto-pan tekrar aktif olsun
  useEffect(() => {
    if (isPlaying) setUserInteracted(false);
  }, [isPlaying]);
  
  const [interpolatedData, setInterpolatedData] = useState(null);
  const playIntervalRef = useRef(null);

  // Kaydetme
  const { addSavedTrackingRoute, trips, savedTrackingRoutes, routes } = React.useContext(DataContext);
  const [savingSession, setSavingSession] = useState(null);
  const [saveFrom, setSaveFrom]           = useState('');
  const [saveTo, setSaveTo]               = useState('');
  const [saveName, setSaveName]           = useState('');
  const [saveTripId, setSaveTripId]       = useState('');
  const [saveDropdownOpen, setSaveDropdownOpen] = useState(false);

  const openSaveModal = (session) => {
    const startPt = session[0];
    const endPt = session[session.length - 1];
    const startG = geofences?.find(g => haversineKm(startPt.lat, startPt.lon, g.lat, g.lon) <= (g.radiusKm || 1.0));
    const endG = geofences?.find(g => haversineKm(endPt.lat, endPt.lon, g.lat, g.lon) <= (g.radiusKm || 1.0));
    setSaveFrom(startG ? startG.name : '');
    setSaveTo(endG ? endG.name : '');
    setSaveName(customRouteNames[session[0].timestamp] || '');
    setSaveTripId('');
    setSaveDropdownOpen(false);
    setSavingSession({ session, driver: selectedDriver });
  };

  const getDisplayName = (deviceId) => {
    const m = deviceMappings[deviceId];
    if (!m) return deviceId;
    const truck = trucks.find(t => t.id === m.truckId);
    return [m.driverName, truck?.plate].filter(Boolean).join(' - ') || deviceId;
  };

  // Rota seçilince haritayı sığdır — animasyonla
  useEffect(() => {
    if (!isVisible) return;
    if (selectedSession && selectedSession.length > 0 && map) {
      const validPoints = selectedSession.filter(p => !isNaN(p.lat) && !isNaN(p.lon));
      if (validPoints.length === 0) return;
      const bounds = L.latLngBounds(validPoints.map(p => [p.lat, p.lon]));
      const isMobile = window.innerWidth < 768;
      map.fitBounds(bounds, { 
        paddingTopLeft: isMobile ? [80, 20] : [380, 60], 
        paddingBottomRight: isMobile ? [20, 220] : [60, 60], 
        maxZoom: 14 
      });
      setProgress(0);
      setIsPlaying(false);
      setInterpolatedData(getInterpolatedPointLinear(selectedSession, 0));
    } else {
      setInterpolatedData(null);
      setIsPlaying(false);
    }
  }, [selectedSession, map, isVisible]);

  const lastPanRef = useRef(0);

  // İnterpolasyon güncelle & Auto-Pan (Sınır bazlı pürüzsüz takip)
  useEffect(() => {
    if (selectedSession) {
      const point = getInterpolatedPointLinear(selectedSession, progress);
      setInterpolatedData(point);
      
      if (isPlaying && point && map && !userInteracted) {
        const now = Date.now();
        if (now - lastPanRef.current > 500) { // Her 500ms'de bir kontrol et
          const pt = map.latLngToContainerPoint([point.lat, point.lon]);
          const size = map.getSize();
          // Ekranın %30 - %70 sınırlarının dışına çıkarsa kamerayı araca kaydır
          if (pt.x < size.x * 0.3 || pt.x > size.x * 0.7 || pt.y < size.y * 0.3 || pt.y > size.y * 0.7) {
            map.panTo([point.lat, point.lon], { animate: true, duration: 0.6 });
            lastPanRef.current = now;
          }
        }
      }
    }
  }, [progress, selectedSession, isPlaying, userInteracted, map]);

  // Oynatıcı tamamlanma eylemini ayrı bir useEffect ile takip ediyoruz
  useEffect(() => {
    if (progress >= 100 && isPlaying) {
      setIsPlaying(false);
    }
  }, [progress, isPlaying]);

  // Oynat / Durdur
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) return 100;
          return prev + 0.005 * playbackSpeed;
        });
      }, 50);
    } else {
      clearInterval(playIntervalRef.current);
    }
    return () => clearInterval(playIntervalRef.current);
  }, [isPlaying, playbackSpeed]);

  const handleSaveRoute = async () => {
    if (!savingSession) return;
    const from = saveFrom.trim();
    const to   = saveTo.trim();
    if (!from || !to) {
      alert('Lütfen Nereden ve Nereye alanlarını doldurun.');
      return;
    }
    const { km } = calcStats(savingSession.session);
    const finalName = saveName.trim() || `${from} → ${to}`;
    try {
      await addSavedTrackingRoute({
        name: finalName,
        from,
        to,
        km,
        startPoint: { lat: savingSession.session[0].lat, lon: savingSession.session[0].lon },
        endPoint: { lat: savingSession.session[savingSession.session.length - 1].lat, lon: savingSession.session[savingSession.session.length - 1].lon },
        path: savingSession.session.filter(p => !isNaN(p.lat)).map(p => ({ lat: p.lat, lon: p.lon })),
      });
      setSavingSession(null);
      setSaveFrom('');
      setSaveTo('');
      setSaveName('');
      setSaveTripId('');
      setSaveDropdownOpen(false);
    } catch (err) {
      console.error('Rota kaydetme hatası:', err);
      alert('Kaydetme sırasında hata oluştu: ' + err.message);
    }
  };

  // if (!isVisible) return null; // ARTIK UNMOUNT ETMİYORUZ

  return (
    <>
      {/* ── Harita Katmanları ── */}
      {isVisible && selectedSession && (
        <>
          <SpeedPolylines session={selectedSession} />
          {interpolatedData && (
            <Marker position={[interpolatedData.lat, interpolatedData.lon]} icon={truckPlayIcon} zIndexOffset={1000}>
              <Tooltip permanent direction="top" className="play-tooltip" offset={[0, -35]}>
                <div className="text-center">
                  <div className="text-sm font-bold text-sky-400">{Math.round((interpolatedData.speed || 0) * 1.852)} km/h</div>
                  <div className="text-[10px] text-slate-400 font-medium">{new Date(interpolatedData.timestamp).toLocaleTimeString('tr-TR')}</div>
                </div>
              </Tooltip>
            </Marker>
          )}
        </>
      )}

      {/* ── Sidebar (Desktop) ── */}
      <AnimatePresence>
        {isVisible && showSidebar && (
          <motion.div
            ref={sidebarCallbackRef}
            initial={{ x: -10, opacity: 0, scale: 0.99 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: -10, opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="hidden md:flex absolute left-4 w-[330px] z-[1500] flex-col rounded-3xl overflow-hidden border border-white/10 shadow-[0_16px_50px_rgba(0,0,0,0.85)]"
            style={{
              top: 'calc(4.75rem + env(safe-area-inset-top, 0px))',
              maxHeight: 'calc(100vh - 6rem - env(safe-area-inset-top, 0px))',
              background: '#0D1219',
            }}
          >
        {/* Başlık */}
        <div className="flex justify-between items-center px-4 py-3.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)] shrink-0">
              <Clock size={15} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white tracking-tight">Rota Geçmişi</h2>
              <div className="text-[10px] font-mono text-slate-400 truncate">
                {selectedDriver ? getDisplayName(selectedDriver) : ''}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.05] rounded-xl transition-all cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Akıllı Tarih Filtresi (Bugün & Geçmiş) ── */}
        <div className="px-3 py-2.5 border-b border-white/[0.06] space-y-2">
          <div className="flex p-1 rounded-xl items-center gap-1 bg-[#090d14] border border-white/[0.06]">
            {/* Bugün */}
            {(() => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const isActive = historyDate === todayStr && calendarMode === 'closed';
              return (
                <button
                  onClick={() => { setHistoryDate(todayStr); setCalendarMode('closed'); }}
                  className={`relative flex-1 flex items-center justify-center py-1.5 px-2 rounded-xl text-xs font-semibold transition-all duration-200 outline-none ${
                    isActive 
                      ? 'bg-gradient-to-r from-amber-600 to-orange-500 text-white shadow-[0_2px_10px_rgba(245,158,11,0.3)] border border-amber-400/30 font-bold' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <span>Bugün</span>
                </button>
              );
            })()}

            {/* Geçmiş */}
            {(() => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const isPanelOpen = calendarMode !== 'closed';
              const isActive = historyDate !== todayStr || isPanelOpen;
              
              const label = (historyDate !== todayStr && !isPanelOpen)
                ? new Date(historyDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
                : 'Geçmiş';

              const handleToggleCalendar = () => {
                if (calendarMode === 'closed') setCalendarMode('7');
                else if (calendarMode === '7') setCalendarMode('21');
                else if (calendarMode === '21') setCalendarMode('month');
                else setCalendarMode('closed');
              };

              return (
                <button
                  onClick={handleToggleCalendar}
                  className={`relative flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-xs font-semibold transition-all duration-200 outline-none ${
                    isActive 
                      ? 'bg-gradient-to-r from-amber-600 to-orange-500 text-white shadow-[0_2px_10px_rgba(245,158,11,0.3)] border border-amber-400/30 font-bold' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="truncate">{label}</span>
                  <ChevronDown size={12} className={`transition-transform duration-200 ${isPanelOpen ? 'rotate-180' : ''}`} />
                </button>
              );
            })()}
          </div>

          {/* ─── TAKVİM PANELİ ─── */}
          <AnimatePresence>
            {calendarMode !== 'closed' && (
              <motion.div
                layout
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden bg-[#090d14] border border-white/[0.08] rounded-2xl shadow-2xl p-2 relative z-50"
              >
                {calendarMode === '7' || calendarMode === '21' ? (
                  // --- 7 veya 21 GÜNLÜK ŞERİT ---
                  <div>
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: calendarMode === '7' ? 7 : 21 }, (_, i) => {
                        const max = calendarMode === '7' ? 6 : 20;
                        const d = new Date();
                        d.setDate(d.getDate() - (max - i));
                        const dateStr = d.toISOString().slice(0, 10);
                        const isSelected = historyDate === dateStr;
                        const dayNames = ['Pz', 'Pt', 'Sa', 'Çr', 'Pe', 'Cu', 'Ct'];
                        const dayName = dayNames[d.getDay()];
                        const dayNum = d.getDate();
                        const hasTrips = cachedDates.includes(dateStr);
                        return (
                          <button
                            key={dateStr}
                            onClick={() => {
                              setHistoryDate(dateStr);
                              setCalendarMode('closed');
                            }}
                            className={`relative flex flex-col items-center py-1.5 rounded-xl transition-all border ${
                              isSelected
                                ? 'bg-gradient-to-b from-amber-500 to-orange-600 text-white font-bold border-amber-400/40 shadow-[0_2px_8px_rgba(245,158,11,0.4)]'
                                : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.06]'
                            }`}
                          >
                            <span className="text-[9px] font-medium opacity-70">{dayName}</span>
                            <span className="text-xs font-bold mt-0.5">{dayNum}</span>
                            {hasTrips && !isSelected && (
                              <span className="w-1 h-1 rounded-full bg-amber-400 mt-0.5 shadow-[0_0_4px_rgba(251,191,36,0.8)]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : calendarMode === 'month' ? (
                  // --- TÜM AY GÖRÜNÜMÜ ---
                  <div className="pt-1">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <button onClick={() => setCalendarViewDate(new Date(calendarViewDate.setMonth(calendarViewDate.getMonth() - 1)))} className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white"><ChevronLeft size={14}/></button>
                      <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                        {calendarViewDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                      </span>
                      <button onClick={() => setCalendarViewDate(new Date(calendarViewDate.setMonth(calendarViewDate.getMonth() + 1)))} className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white"><ChevronRight size={14}/></button>
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {(() => {
                        const year = calendarViewDate.getFullYear();
                        const month = calendarViewDate.getMonth();
                        const firstDay = new Date(year, month, 1).getDay();
                        const adjFirstDay = firstDay === 0 ? 6 : firstDay - 1;
                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                        
                        const days = [];
                        for(let i=0; i<adjFirstDay; i++) days.push(<div key={`pad-${i}`} />);
                        
                        for(let day=1; day<=daysInMonth; day++) {
                          const dObj = new Date(year, month, day);
                          const dStr = dObj.toISOString().slice(0, 10);
                          const isSelected = historyDate === dStr;
                          const dayNames = ['Pz', 'Pt', 'Sa', 'Çr', 'Pe', 'Cu', 'Ct'];
                          const dayName = dayNames[dObj.getDay()];
                          const hasTrips = cachedDates.includes(dStr);
                          
                          days.push(
                            <button
                              key={day}
                              onClick={() => { setHistoryDate(dStr); setCalendarMode('closed'); }}
                              className={`relative flex flex-col items-center py-1.5 rounded-xl transition-all border ${
                                isSelected
                                  ? 'bg-gradient-to-b from-amber-500 to-orange-600 text-white font-bold border-amber-400/40 shadow-[0_2px_8px_rgba(245,158,11,0.4)]'
                                  : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.06]'
                              }`}
                            >
                              <span className="text-[8px] font-medium opacity-70">{dayName}</span>
                              <span className="text-xs font-bold mt-0.5">{day}</span>
                              {hasTrips && !isSelected && (
                                <span className="w-1 h-1 rounded-full bg-amber-400 mt-0.5 shadow-[0_0_4px_rgba(251,191,36,0.8)]" />
                              )}
                            </button>
                          );
                        }
                        return days;
                      })()}
                    </div>
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Araç Seçici (Dropdown) */}
        <div className="px-3 py-2 border-b border-white/[0.04]">
          <button 
            onClick={() => setIsVehicleDropdownOpen(!isVehicleDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-white/[0.06] bg-[#090d14]/70 hover:bg-[#101520] transition-all duration-200"
          >
            <span className="text-xs font-semibold text-slate-200 truncate">
              {selectedDriver ? getDisplayName(selectedDriver) : 'Araç Seçiliyor...'}
            </span>
            <motion.div
              animate={{ rotate: isVehicleDropdownOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="flex-shrink-0 ml-2"
            >
              <ChevronDown size={13} className="text-slate-400" />
            </motion.div>
          </button>

          {/* Açılır Menü */}
          <AnimatePresence>
            {isVehicleDropdownOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden mt-1.5"
              >
                <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-[#090d14] p-1 flex flex-col gap-0.5">
                  {Object.keys(deviceMappings).map((driver) => {
                    const isSelected = selectedDriver === driver;
                    return (
                      <button
                        key={driver}
                        onClick={() => { 
                          setSelectedDriver(driver); 
                          setIsVehicleDropdownOpen(false); 
                          setSelectedSession(null);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                            : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className="truncate">{getDisplayName(driver)}</span>
                        {isSelected && <Check size={13} className="text-amber-400 shrink-0" />}
                      </button>
                    );
                  })}
                  {Object.keys(deviceMappings).length === 0 && (
                    <div className="px-3 py-2 text-xs text-slate-600">Araç bulunamadı</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Seçili Aracın Seferleri Listesi */}
        <div ref={listCallbackRef} className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar max-h-[60vh]">
          {/* Yükleniyor */}
          {historyLoading && (
            <div className="flex flex-col items-center justify-center py-10 gap-2.5">
              <Loader2 size={20} className="text-amber-400 animate-spin" />
              <p className="text-xs text-slate-500">Seferler yükleniyor...</p>
            </div>
          )}

          {/* Hata Durumu */}
          {fetchError && !historyLoading && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
              <p className="text-xs text-rose-400 text-center">{fetchError}</p>
            </div>
          )}

          {/* Veri Yok */}
          {!historyLoading && !fetchError && selectedDriver && (!sessionsByDriver[selectedDriver] || sessionsByDriver[selectedDriver].length === 0) && (
            <div className="flex flex-col items-center justify-center py-10 gap-1 text-center">
              <p className="text-xs text-slate-400 font-medium">Bu tarihte kayıtlı sefer bulunamadı.</p>
              <p className="text-[10px] text-slate-600">Farklı bir tarih veya araç seçebilirsiniz.</p>
            </div>
          )}

          {/* Rota Listesi */}
          {!historyLoading && selectedDriver && sessionsByDriver[selectedDriver]?.length > 0 && (
            <div className="space-y-2">
              {(() => {
                const validSessions = (sessionsByDriver[selectedDriver] || []).filter(session => {
                  const { km, durationMin } = calcStats(session);
                  return parseFloat(km) >= 5 && parseInt(durationMin) >= 5;
                });

                if (validSessions.length === 0) {
                  return (
                    <div className="py-6 text-center text-xs text-slate-500">
                      Bu tarihte 5 km ve üzeri sefer bulunamadı.
                    </div>
                  );
                }

                return [...validSessions].reverse().map((session, i) => {
                  const startPt = session[0];
                  const endPt = session[session.length - 1];
                  const startTime = startPt ? new Date(startPt.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
                  const endTime = endPt ? new Date(endPt.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
                  const isSelected = selectedSession === session;
                  const { km, durationMin, topSpeedKmh, avgSpeedKmh } = calcStats(session);
                  const title = customRouteNames[session[0]?.timestamp] || `Sefer ${validSessions.length - i}`;
                  const isEditing = editingSessionKey === session[0]?.timestamp;

                return (
                  <div
                    key={session[0]?.timestamp || i}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedSession(null);
                        setShowPlayer(false);
                        setIsPlaying(false);
                      } else {
                        setSelectedSession(session);
                      }
                    }}
                    className={`w-full rounded-2xl border transition-all duration-200 overflow-hidden text-left cursor-pointer outline-none ${
                      isSelected
                        ? 'bg-[#121722]/95 border-amber-500/30 shadow-[0_4px_24px_rgba(0,0,0,0.6)] ring-1 ring-amber-500/20'
                        : 'bg-[#0e131b]/70 border-white/[0.05] hover:bg-[#121722]/80 hover:border-white/10'
                    }`}
                  >
                    {/* Üst Kısım: Başlık, Saat ve Aksiyonlar */}
                    <div className="p-3 pb-2 flex items-center justify-between gap-2 border-b border-white/[0.04]">
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <div className={`w-1 h-3.5 rounded-full transition-colors ${isSelected ? 'bg-amber-400' : 'bg-slate-600'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-bold truncate ${isSelected ? 'text-amber-300' : 'text-slate-100'}`}>
                              {title}
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                            <span className="text-emerald-400 font-semibold">{startTime}</span>
                            <span className="text-slate-600">➔</span>
                            <span className="text-sky-400 font-semibold">{endTime}</span>
                          </div>
                        </div>
                      </div>

                      {/* Sağ Aksiyon Butonları */}
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        {/* Oynat Butonu */}
                        <button
                          onClick={() => {
                            setSelectedSession(session);
                            setShowPlayer(true);
                            setIsPlaying(true);
                          }}
                          className={`p-1.5 rounded-xl transition-all ${
                            isSelected && showPlayer
                              ? 'bg-amber-500 text-white shadow-[0_0_12px_rgba(245,158,11,0.35)]'
                              : 'text-slate-400 hover:text-amber-300 hover:bg-white/[0.06]'
                          }`}
                          title="Rotayı Haritada Oynat"
                        >
                          <Play size={13} fill={isSelected && showPlayer ? "currentColor" : "none"} />
                        </button>

                        {/* Rotayı Kaydet */}
                        <button
                          onClick={() => openSaveModal(session)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-amber-300 hover:bg-white/[0.06] transition-all"
                          title="Rotayı Kaydet"
                        >
                          <BookmarkPlus size={13} />
                        </button>

                        {/* Düzenle */}
                        <button
                          onClick={() => {
                            setEditNameValue(title);
                            setEditingSessionKey(isEditing ? null : session[0]?.timestamp);
                          }}
                          className={`p-1.5 rounded-xl transition-all ${
                            isEditing 
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                              : 'text-slate-400 hover:text-amber-300 hover:bg-white/[0.06]'
                          }`}
                          title="Seferi Düzenle"
                        >
                          <Edit2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Düzenleme Paneli (İsim, Böl, Birleştir, Gizle) */}
                    <AnimatePresence>
                      {isEditing && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          onClick={e => e.stopPropagation()}
                          className="p-2.5 bg-[#080b10]/95 border-b border-white/[0.06] flex flex-col gap-2"
                        >
                          {/* İsim Düzenleme Inputu */}
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={editNameValue}
                              onChange={e => setEditNameValue(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter') {
                                  await setCustomRouteName(session[0].timestamp, editNameValue);
                                  setEditingSessionKey(null);
                                }
                              }}
                              className="flex-1 bg-[#10151f] border border-white/10 focus:border-amber-500/50 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none"
                              placeholder="Sefer İsmi Girin..."
                            />
                            <button
                              onClick={async () => {
                                await setCustomRouteName(session[0].timestamp, editNameValue);
                                setEditingSessionKey(null);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition-all flex items-center gap-1"
                            >
                              <Check size={12} />
                              <span>Kaydet</span>
                            </button>
                          </div>

                          {/* Aksiyon Butonları (Böl, Birleştir, Gizle) */}
                          <div className="grid grid-cols-3 gap-1 pt-1">
                            <button
                              onClick={() => {
                                const ts = interpolatedData?.timestamp ?? session[Math.floor(session.length / 2)]?.timestamp;
                                if (ts) addManualSplit(ts, selectedDriver);
                                setEditingSessionKey(null);
                              }}
                              className="px-2 py-1.5 rounded-xl bg-white/[0.04] hover:bg-rose-500/20 border border-white/[0.06] hover:border-rose-500/30 text-slate-300 hover:text-rose-300 text-[10px] font-semibold transition-all flex items-center justify-center gap-1"
                              title="Rotayı Seçili Noktadan Böl"
                            >
                              <Scissors size={11} className="text-rose-400" />
                              <span>Böl</span>
                            </button>

                            <button
                              onClick={() => {
                                if (session[0]?.timestamp) addManualMerge(session[0].timestamp, selectedDriver);
                                setEditingSessionKey(null);
                              }}
                              className="px-2 py-1.5 rounded-xl bg-white/[0.04] hover:bg-amber-500/20 border border-white/[0.06] hover:border-amber-500/30 text-slate-300 hover:text-amber-300 text-[10px] font-semibold transition-all flex items-center justify-center gap-1"
                              title="Önceki Seferle Birleştir"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                              <span>Birleştir</span>
                            </button>

                            <button
                              onClick={() => {
                                if (session[0]?.timestamp) addManualDelete(session[0].timestamp, selectedDriver);
                                setEditingSessionKey(null);
                              }}
                              className="px-2 py-1.5 rounded-xl bg-white/[0.04] hover:bg-red-500/20 border border-white/[0.06] hover:border-red-500/30 text-slate-300 hover:text-red-300 text-[10px] font-semibold transition-all flex items-center justify-center gap-1"
                              title="Seferi Listeden Gizle"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                              <span>Gizle</span>
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* 3 Kolonlu Temiz Telemetri Şeridi */}
                    <div className="grid grid-cols-3 divide-x divide-white/[0.05] p-2 bg-[#090d14]/70 text-center">
                      {/* 1. Mesafe & Süre */}
                      <div className="px-1">
                        <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">MESAFE / SÜRE</div>
                        <div className="text-xs font-mono font-bold text-white mt-0.5">
                          {km} <span className="text-[9px] font-sans font-normal text-slate-400">km</span>
                        </div>
                        <div className="text-[9.5px] text-slate-400 font-medium">
                          {formatDuration(durationMin)}
                        </div>
                      </div>

                      {/* 2. MAX HIZ */}
                      <div className="px-1 flex flex-col justify-center">
                        <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">MAX HIZ</div>
                        <div className="text-xs font-mono font-bold text-amber-300 mt-0.5">
                          {topSpeedKmh} <span className="text-[9px] font-sans font-normal text-slate-400">km/h</span>
                        </div>
                      </div>

                      {/* 3. ORTALAMA HIZ */}
                      <div className="px-1 flex flex-col justify-center">
                        <div className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">ORT. HIZ</div>
                        <div className="text-xs font-mono font-bold text-slate-200 mt-0.5">
                          {avgSpeedKmh} <span className="text-[9px] font-sans font-normal text-slate-400">km/h</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
            </div>
          )}
        </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Sidebar kapalıyken aç butonu (Sadece Desktop) */}
      <AnimatePresence>
        {isVisible && !showSidebar && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setShowSidebar(true)}
            className="hidden md:block absolute left-4 z-[1500] p-3.5 bg-[#0e131b] hover:bg-[#121822] text-amber-400 rounded-2xl border border-white/10 transition-all shadow-xl cursor-pointer"
            style={{
              top: 'calc(4.75rem + env(safe-area-inset-top, 0px))'
            }}
          >
            <Clock size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Alt Oynatma Çubuğu (Sadece Desktop - İstenirse Açılır) ── */}
      <AnimatePresence>
        {isVisible && selectedSession && showPlayer && (
          <motion.div 
            ref={playerCallbackRef}
            initial={{ y: 20, opacity: 0, x: '-50%', scale: 0.96 }}
            animate={{ y: 0, opacity: 1, x: '-50%', scale: 1 }}
            exit={{ y: 20, opacity: 0, x: '-50%', scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="hidden md:block absolute bottom-6 z-[2000] w-11/12 max-w-[420px] pointer-events-auto transition-all duration-300 ease-out"
            style={{ left: (showSidebar && window.innerWidth >= 768) ? 'calc(50% + 158px)' : '50%' }}
          >
          <div
            className="px-4 py-3 rounded-3xl flex items-center gap-4 border border-white/10 shadow-[0_16px_50px_rgba(0,0,0,0.85)] bg-[#0D1219]"
          >
            {/* Play / Pause */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-10 h-10 rounded-full bg-gradient-to-r from-amber-600 to-orange-500 flex items-center justify-center text-white shadow-[0_2px_12px_rgba(245,158,11,0.35)] active:scale-95 transition-all flex-shrink-0"
            >
              {isPlaying
                ? <Pause fill="currentColor" size={16} />
                : <Play fill="currentColor" className="ml-0.5" size={16} />}
            </button>

            {/* Hız Çarpanı */}
            <button
              onClick={() => {
                setPlaybackSpeed(prev => {
                  if (prev === 1) return 2;
                  if (prev === 2) return 5;
                  if (prev === 5) return 10;
                  return 1;
                });
              }}
              className="px-2.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.06] text-[10px] font-extrabold text-amber-400 transition-all flex-shrink-0 cursor-pointer"
              title="Oynatma Hızı"
            >
              {playbackSpeed}x
            </button>

            {/* Slider */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                <span>{new Date(selectedSession[0].timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                {interpolatedData && (
                  <span className="text-amber-400 px-2 py-0.5 bg-amber-500/10 rounded-full border border-amber-500/20 font-bold">
                    {Math.round((interpolatedData.speed || 0) * 1.852)} km/h
                  </span>
                )}
                <span>{new Date(selectedSession[selectedSession.length - 1].timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>

              <div className="relative">
                <input
                  type="range"
                  min="0" max="100" step="0.1"
                  value={progress}
                  onInput={e => { setIsPlaying(false); setProgress(parseFloat(e.target.value)); }}
                  onChange={e => { setIsPlaying(false); setProgress(parseFloat(e.target.value)); }}
                  className="w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #f59e0b ${progress}%, rgba(255,255,255,0.08) ${progress}%)`,
                  }}
                />
                <style>{`
                  input[type='range']::-webkit-slider-thumb {
                    -webkit-appearance: none; appearance: none;
                    width: 14px; height: 14px; border-radius: 50%;
                    background: #fff; border: 2.5px solid #f59e0b;
                    cursor: pointer; transition: transform 0.15s;
                  }
                  input[type='range']::-webkit-slider-thumb:hover { transform: scale(1.25); }
                  
                  .play-tooltip {
                    background: rgba(13, 18, 25, 0.95) !important;
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                    border-radius: 12px !important;
                    padding: 6px 12px !important;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
                    backdrop-filter: blur(8px) !important;
                  }
                  .play-tooltip::before {
                    border-top-color: rgba(13, 18, 25, 0.95) !important;
                  }
                `}</style>
              </div>
            </div>

            {/* Oynatıcıyı Kapat */}
            <button
              onClick={() => {
                setShowPlayer(false);
                setIsPlaying(false);
              }}
              className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.12] transition-all flex-shrink-0"
              title="Oynatıcıyı Kapat"
            >
              <X size={15} />
            </button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── MOBİL ROTA GEÇMİŞİ KARTI (Sadece Mobilde Görünür) ── */}
      {isVisible && (
        <MobileRouteHistoryCard
          selectedDriver={selectedDriver}
          setSelectedDriver={setSelectedDriver}
          deviceMappings={deviceMappings}
          trucks={trucks}
          getDisplayName={getDisplayName}
          historyDate={historyDate}
          setHistoryDate={setHistoryDate}
          sessions={sessionsByDriver[selectedDriver] || []}
          selectedSession={selectedSession}
          setSelectedSession={setSelectedSession}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          playbackSpeed={playbackSpeed}
          setPlaybackSpeed={setPlaybackSpeed}
          progress={progress}
          setProgress={setProgress}
          interpolatedData={interpolatedData}
          historyLoading={historyLoading}
          customRouteNames={customRouteNames}
        />
      )}

      {/* ── Kaydetme Modalı ── */}
      {savingSession && (
        <div
          ref={saveModalRef}
          className="fixed inset-0 z-[3500] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
          onClick={() => setSaveDropdownOpen(false)}>
          <div
            className="rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            style={{ background: 'rgba(13,18,25,0.98)', border: '1px solid rgba(255,255,255,0.06)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Başlık */}
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-base flex items-center gap-2">
                <BookmarkPlus size={17} className="text-orange-400" /> Rotayı Kaydet
              </h3>
              <button
                onClick={() => { setSavingSession(null); setSaveDropdownOpen(false); }}
                className="text-slate-600 hover:text-white p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Kayıtlı Rota Dropdown */}
              <div className="relative">
                <label className="text-[11px] text-slate-500 mb-1.5 block font-semibold uppercase tracking-wider">Rotadan Doldur (Opsiyonel)</label>
                <button
                  type="button"
                  onClick={() => setSaveDropdownOpen(v => !v)}
                  className="w-full flex items-center justify-between bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2.5 text-sm hover:border-orange-500/40 transition-colors"
                >
                  <span className={saveTripId ? 'text-white' : 'text-slate-500'}>
                    {saveTripId
                      ? (() => {
                          const all = [...(routes||[]), ...(savedTrackingRoutes||[]), ...(trips||[])];
                          const r = all.find(x => String(x.id) === saveTripId);
                          return r ? `${r.from} → ${r.to}` : '— Seç —';
                        })()
                      : '— Seçmeden Devam Et —'}
                  </span>
                  <ChevronDown size={14} className={`text-slate-500 transition-transform ${saveDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {saveDropdownOpen && (
                  <div
                    className="absolute left-0 right-0 top-full mt-1 z-20 rounded-2xl overflow-hidden shadow-2xl"
                    style={{ background: 'rgba(13,18,25,0.99)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <div className="max-h-56 overflow-y-auto" onWheel={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => { setSaveTripId(''); setSaveDropdownOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-xs text-slate-500 hover:bg-white/[0.06] hover:text-white transition-colors border-b border-white/[0.04]"
                      >
                        — Seçmeden Devam Et —
                      </button>
                      {[...(routes||[]), ...(savedTrackingRoutes||[]), ...(trips||[])]
                        .filter(r => r.from && r.to)
                        .map(r => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setSaveTripId(String(r.id));
                              setSaveFrom(r.from || '');
                              setSaveTo(r.to || '');
                              setSaveName(r.name || `${r.from} → ${r.to}`);
                              setSaveDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-xs transition-colors hover:bg-white/[0.06] border-b border-white/[0.03] ${
                              saveTripId === String(r.id) ? 'bg-orange-500/15 text-orange-400' : 'text-slate-300'
                            }`}
                          >
                            <span className="font-semibold">{r.from} → {r.to}</span>
                            {r.km && <span className="text-slate-600 ml-2">{r.km} km</span>}
                            {r.date && <span className="text-slate-700 ml-2">{r.date}</span>}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Rota Adı */}
              <div>
                <label className="text-[11px] text-slate-500 mb-1.5 block font-semibold uppercase tracking-wider">Rota Adı</label>
                <input
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="Örn: Çayırhan → Baştaş"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                />
              </div>

              {/* Nereden / Nereye */}
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
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                  />
                </div>
              ))}

              <button
                onClick={handleSaveRoute}
                className="w-full py-3 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-500/20 mt-1"
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

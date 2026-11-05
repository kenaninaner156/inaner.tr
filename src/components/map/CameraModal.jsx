import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import {
  Video,
  VideoOff,
  Clock,
  X,
  Volume2,
  VolumeX,
  Camera,
  Download,
  Play,
  Pause,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Power,
} from 'lucide-react';
import {
  fetchLiveStreamUrl,
  fetchCameraHistorySegments,
  resolveHistorySegmentStream,
  closeCameraStream,
  attachStreamToVideo,
  wakeUpCamera,
} from '../../services/cameraService';

function getTodayIso() {
  try {
    const formatter = new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const day = parts.find(p => p.type === 'day')?.value || '01';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const year = parts.find(p => p.type === 'year')?.value || '2026';
    return `${year}-${month}-${day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatTimeSec(sec) {
  if (!sec || isNaN(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CameraModal({
  isOpen,
  onClose,
  deviceId,
  initialQuality = 'sd',
  onQualityChange,
}) {
  const [mode, setMode] = useState('live'); // 'live' | 'history'
  const [quality, setQuality] = useState(initialQuality); // 'sd' (480p) | 'hd' (2K)
  const [isMuted, setIsMuted] = useState(true);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [streamStatus, setStreamStatus] = useState({ offline: false, message: '' });
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [wakeFeedback, setWakeFeedback] = useState('');
  const [reloadLiveTrigger, setReloadLiveTrigger] = useState(0);

  const handleWakeUp = async () => {
    if (!deviceId || isWakingUp) return;
    setIsWakingUp(true);
    setWakeFeedback('Cihaza 4G üzerinden uyandırma sinyali iletiliyor...');
    try {
      const res = await wakeUpCamera(deviceId);
      if (res.success) {
        setWakeFeedback('Uyandırma komutu iletildi. Yayın başlatılıyor...');
      } else {
        setWakeFeedback(res.message || 'Cihaz yanıt vermedi.');
      }
    } catch {
      setWakeFeedback('Uyandırma isteği iletilemedi.');
    }
    // 3.5 saniye sonra canlı yayını yeniden tetikle
    setTimeout(() => {
      setReloadLiveTrigger((c) => c + 1);
      setIsWakingUp(false);
      setTimeout(() => setWakeFeedback(''), 4500);
    }, 3500);
  };

  // Sol / Alt Geçmiş menüsü gizleme durumu
  const [showHistorySidebar, setShowHistorySidebar] = useState(true);
  const [isMobileHistoryCollapsed, setIsMobileHistoryCollapsed] = useState(false);

  // Geçmiş (History) Tarih Seçici Durumları — RouteHistory ile birebir 3 aşamalı ('closed' -> '7' -> '21' -> 'month')
  const [historyDate, setHistoryDate] = useState(getTodayIso);
  const [calendarMode, setCalendarMode] = useState('closed'); // 'closed' | '7' | '21' | 'month'
  const [calendarViewDate, setCalendarViewDate] = useState(() => new Date());
  const [recordedDates, setRecordedDates] = useState([]);
  const [segments, setSegments] = useState([]);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Geçmiş video oynatıcı kontrolleri
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const videoRef = useRef(null);
  const cleanupStreamRef = useRef(null);

  // Harita tıklama/kaydırma sızıntılarını engelle
  const modalRootRef = useCallback((node) => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  const handleClose = useCallback(() => {
    if (deviceId) {
      closeCameraStream(deviceId, mode);
    }
    onClose();
  }, [deviceId, mode, onClose]);

  const handleQualitySwitch = (newQuality) => {
    if (newQuality === quality) return;
    setQuality(newQuality);
    if (onQualityChange) onQualityChange(newQuality);
  };

  const handleModeSwitch = (newMode) => {
    if (newMode === mode) return;
    if (deviceId) {
      closeCameraStream(deviceId, mode);
    }
    setMode(newMode);
    if (newMode === 'history') {
      setShowHistorySidebar(true);
      setIsMobileHistoryCollapsed(false);
    }
  };

  // ESC tuşu ile kapatma
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, handleClose]);

  // Canlı yayın akışını yükle (4.6 jimi.device.media.live.stream)
  useEffect(() => {
    if (!isOpen || mode !== 'live' || !deviceId) return;
    let cancelled = false;
    const savedTime = videoRef.current?.currentTime || 0;

    Promise.resolve().then(() => {
      if (!cancelled) setIsLoadingStream(true);
    });

    fetchLiveStreamUrl(deviceId, quality, true).then(async (streamInfo) => {
      if (cancelled) return;
      if (!streamInfo?.url || !videoRef.current) {
        setIsLoadingStream(false);
        if (streamInfo?.offline) {
          setStreamStatus({
            offline: true,
            message: streamInfo.message || 'Kamera çevrimdışı veya araç kontağı kapalı.',
          });
        }
        return;
      }
      setStreamStatus({ offline: false, message: '' });
      if (cleanupStreamRef.current) {
        cleanupStreamRef.current();
        cleanupStreamRef.current = null;
      }
      const cleanup = await attachStreamToVideo(videoRef.current, streamInfo.url);
      if (cancelled) {
        if (cleanup) cleanup();
        return;
      }
      cleanupStreamRef.current = cleanup;
      if (savedTime > 0 && videoRef.current) {
        try {
          videoRef.current.currentTime = savedTime;
        } catch {
          // ignore seek error on live streams
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, deviceId, quality, reloadLiveTrigger]);

  // Geçmiş kayıt parçalarını yükle (4.7 cmd + 4.8 get)
  useEffect(() => {
    if (!isOpen || mode !== 'history' || !deviceId) return;
    let cancelled = false;

    Promise.resolve().then(() => {
      if (!cancelled) setHistoryLoading(true);
    });

    fetchCameraHistorySegments(deviceId, historyDate, quality).then((res) => {
      if (cancelled) return;
      setRecordedDates(res.recordedDates || []);
      const segs = res.segments || [];
      setSegments(segs);
      setSelectedSegment((prev) => {
        if (prev) {
          const match = segs.find(s => s.id === prev.id);
          if (match) return match;
        }
        return segs[0] || null;
      });
      setHistoryLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, deviceId, historyDate, quality]);

  // Seçili geçmiş segmenti videoya bağla (4.9 jimi.device.media.history.stream)
  useEffect(() => {
    if (!isOpen || mode !== 'history' || !selectedSegment || !videoRef.current) return;
    let cancelled = false;

    const attach = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setIsLoadingStream(true);
      const streamUrl = await resolveHistorySegmentStream(deviceId, selectedSegment);
      if (cancelled || !streamUrl || !videoRef.current) {
        if (!cancelled) setIsLoadingStream(false);
        return;
      }
      if (cleanupStreamRef.current) {
        cleanupStreamRef.current();
        cleanupStreamRef.current = null;
      }
      const cleanup = await attachStreamToVideo(videoRef.current, streamUrl);
      if (cancelled) {
        if (cleanup) cleanup();
        return;
      }
      cleanupStreamRef.current = cleanup;
      if (videoRef.current) {
        videoRef.current.playbackRate = playbackRate;
      }
      setIsPlaying(true);
    };

    attach();
    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, deviceId, selectedSegment, playbackRate]);

  // Unmount temizliği
  useEffect(() => {
    return () => {
      if (cleanupStreamRef.current) {
        cleanupStreamRef.current();
        cleanupStreamRef.current = null;
      }
    };
  }, []);

  // Oynatma hızı değişimi
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Anlık kare yakalama (Snapshot)
  const handleSnapshot = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth || 1920;
      canvas.height = v.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `kamera_${deviceId}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      window.open(v.currentSrc || v.src, '_blank');
    }
  }, [deviceId]);

  const togglePlayPause = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (val) => {
    const v = videoRef.current;
    setProgress(val);
    if (v && v.duration && !isNaN(v.duration)) {
      v.currentTime = (val / 100) * v.duration;
    }
  };

  if (!isOpen) return null;

  const todayStr = getTodayIso();
  const portalTarget =
    (typeof document !== 'undefined' && document.querySelector('[data-map-module]')) ||
    document.body;

  // ── Ortak 3 Aşamalı Tarih Seçici Render Fonksiyonu ────────────────────
  const renderProgressiveDatePicker = (withHideButton = false, onHide = null) => (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <div className="flex flex-1 p-1 rounded-xl items-center gap-1 bg-[#090d14] border border-white/[0.06]">
          {/* Bugün */}
          {(() => {
            const isActive = historyDate === todayStr && calendarMode === 'closed';
            return (
              <button
                onClick={() => {
                  setHistoryDate(todayStr);
                  setCalendarMode('closed');
                }}
                className={`relative flex-1 flex items-center justify-center py-1.5 px-2 rounded-xl text-xs font-semibold transition-all duration-200 outline-none cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-600 to-orange-500 text-white shadow-[0_2px_10px_rgba(245,158,11,0.3)] border border-amber-400/30 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                <span>Bugün</span>
              </button>
            );
          })()}

          {/* Geçmiş (1. tık: 7 gün, 2. tık: 3 hafta, 3. tık: aylık takvim) */}
          {(() => {
            const isPanelOpen = calendarMode !== 'closed';
            const isActive = historyDate !== todayStr || isPanelOpen;
            const label =
              historyDate !== todayStr && !isPanelOpen
                ? new Date(historyDate).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'short',
                  })
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
                className={`relative flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-xs font-semibold transition-all duration-200 outline-none cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-600 to-orange-500 text-white shadow-[0_2px_10px_rgba(245,158,11,0.3)] border border-amber-400/30 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                <span className="truncate">{label}</span>
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${
                    isPanelOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            );
          })()}
        </div>

        {/* Paneli Gizle Butonu */}
        {withHideButton && onHide && (
          <button
            onClick={onHide}
            className="p-2 text-slate-400 hover:text-white bg-[#090d14] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl transition-all cursor-pointer shrink-0"
            title="Paneli Gizle"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ─── AÇILIR TAKVİM PANELİ (7 Gün / 21 Gün / Tam Ay) ─── */}
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
              <div className="grid grid-cols-7 gap-1">
                {Array.from(
                  { length: calendarMode === '7' ? 7 : 21 },
                  (_, i) => {
                    const max = calendarMode === '7' ? 6 : 20;
                    const d = new Date();
                    d.setDate(d.getDate() - (max - i));
                    const dateStr = d.toISOString().slice(0, 10);
                    const isSelected = historyDate === dateStr;
                    const dayNames = ['Pz', 'Pt', 'Sa', 'Çr', 'Pe', 'Cu', 'Ct'];
                    const dayName = dayNames[d.getDay()];
                    const dayNum = d.getDate();
                    const hasRecord = recordedDates.includes(dateStr);

                    return (
                      <button
                        key={dateStr}
                        onClick={() => {
                          setHistoryDate(dateStr);
                          setCalendarMode('closed');
                        }}
                        className={`relative flex flex-col items-center py-1.5 rounded-xl transition-all border cursor-pointer ${
                          isSelected
                            ? 'bg-gradient-to-b from-amber-500 to-orange-600 text-white font-bold border-amber-400/40 shadow-[0_2px_8px_rgba(245,158,11,0.4)]'
                            : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="text-[9px] font-medium opacity-70">
                          {dayName}
                        </span>
                        <span className="text-xs font-bold mt-0.5">{dayNum}</span>
                        {hasRecord && !isSelected && (
                          <span className="w-1 h-1 rounded-full bg-amber-400 mt-0.5 shadow-[0_0_4px_rgba(251,191,36,0.8)]" />
                        )}
                      </button>
                    );
                  }
                )}
              </div>
            ) : calendarMode === 'month' ? (
              <div className="pt-1">
                <div className="flex items-center justify-between mb-2 px-1">
                  <button
                    onClick={() =>
                      setCalendarViewDate(
                        new Date(
                          calendarViewDate.getFullYear(),
                          calendarViewDate.getMonth() - 1,
                          1
                        )
                      )
                    }
                    className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    {calendarViewDate.toLocaleDateString('tr-TR', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <button
                    onClick={() =>
                      setCalendarViewDate(
                        new Date(
                          calendarViewDate.getFullYear(),
                          calendarViewDate.getMonth() + 1,
                          1
                        )
                      )
                    }
                    className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>

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
                      const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const isSelected = historyDate === dStr;
                      const dayNames = ['Pz', 'Pt', 'Sa', 'Çr', 'Pe', 'Cu', 'Ct'];
                      const dayName = dayNames[dObj.getDay()];
                      const hasRecord = recordedDates.includes(dStr);

                      days.push(
                        <button
                          key={day}
                          onClick={() => {
                            setHistoryDate(dStr);
                            setCalendarMode('closed');
                          }}
                          className={`relative flex flex-col items-center py-1.5 rounded-xl transition-all border cursor-pointer ${
                            isSelected
                              ? 'bg-gradient-to-b from-amber-500 to-orange-600 text-white font-bold border-amber-400/40 shadow-[0_2px_8px_rgba(245,158,11,0.4)]'
                              : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.06]'
                          }`}
                        >
                          <span className="text-[8px] font-medium opacity-70">
                            {dayName}
                          </span>
                          <span className="text-xs font-bold mt-0.5">{day}</span>
                          {hasRecord && !isSelected && (
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
  );

  // ── Ortak Kayıt Saatleri Listesi Render Fonksiyonu ─────────────────────
  const renderSegmentsList = () => {
    if (historyLoading) {
      return (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={18} className="text-amber-400 animate-spin" />
        </div>
      );
    }
    if (segments.length === 0) {
      return (
        <div className="py-6 text-center text-xs text-slate-500">
          Kayıt bulunamadı.
        </div>
      );
    }
    return segments.map((seg) => {
      const isSelected = selectedSegment?.id === seg.id;
      return (
        <div
          key={seg.id}
          onClick={() => setSelectedSegment(seg)}
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl border transition-all cursor-pointer select-none active:scale-[0.99] ${
            isSelected
              ? 'bg-[#121722] border-amber-500/35 shadow-[0_4px_20px_rgba(0,0,0,0.5)]'
              : 'bg-[#090d14]/70 border-white/[0.04] hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-1 h-3.5 rounded-full ${
                isSelected ? 'bg-amber-400' : 'bg-slate-700'
              }`}
            />
            <div className="text-xs font-mono font-bold flex items-center gap-1.5">
              <span className={isSelected ? 'text-amber-300' : 'text-slate-200'}>
                {seg.startTime}
              </span>
              <span className="text-slate-600">➔</span>
              <span className={isSelected ? 'text-amber-300' : 'text-slate-400'}>
                {seg.endTime}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <a
              href={seg.url}
              download={seg.fileName || true}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="İndir"
            >
              <Download size={13} />
            </a>
            {isSelected && (
              <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Check size={12} />
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={modalRootRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="absolute inset-0 z-[2500] bg-[#05070b] select-none overflow-hidden"
      >
        <style>{`
          .camera-range-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #ffffff;
            border: 2.5px solid #f59e0b;
            cursor: pointer;
            transition: transform 0.15s ease;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
          }
          .camera-range-slider::-webkit-slider-thumb:hover {
            transform: scale(1.2);
          }
          .camera-range-slider::-moz-range-thumb {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #ffffff;
            border: 2.5px solid #f59e0b;
            cursor: pointer;
            transition: transform 0.15s ease;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
          }
        `}</style>

        {/* ── TAM EKRAN VİDEO SAHNESİ (Kırpılma Olmadan Tam Alanı Kaplar, Menüler Üzerinde Yüzer) ── */}
        <div className="absolute inset-0 flex items-center justify-center bg-[#05070b]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            loop
            muted={isMuted}
            onLoadedData={() => setIsLoadingStream(false)}
            onWaiting={() => setIsLoadingStream(true)}
            onPlaying={() => {
              setIsLoadingStream(false);
              setIsPlaying(true);
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration && !isNaN(v.duration)) {
                setCurrentTime(v.currentTime);
                setDuration(v.duration);
                setProgress((v.currentTime / v.duration) * 100);
              }
            }}
            className="w-full h-full object-contain bg-[#05070b]"
          />

          {/* Yükleniyor Göstergesi */}
          <AnimatePresence>
            {isLoadingStream && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[2px] pointer-events-none"
              >
                <Loader2 size={28} className="text-white/80 animate-spin" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Çevrimdışı / Araç Kontağı Kapalı Durumu */}
          {mode === 'live' && streamStatus.offline && !isLoadingStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3 z-10 px-4">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center backdrop-blur-md shadow-2xl">
                <VideoOff size={24} className="text-slate-400" />
              </div>
              <div className="text-center max-w-sm">
                <p className="text-sm font-semibold text-slate-200">Kamera Çevrimdışı</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {streamStatus.message || 'Araç kontağı açıldığında canlı görüntü otomatik olarak başlayacaktır.'}
                </p>
                {wakeFeedback && (
                  <p className="text-xs text-emerald-400 mt-2.5 font-medium animate-pulse">
                    {wakeFeedback}
                  </p>
                )}
                <div className="mt-4 pointer-events-auto flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleWakeUp}
                    disabled={isWakingUp}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-semibold shadow-lg shadow-emerald-950/50 border border-emerald-400/40 active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
                  >
                    {isWakingUp ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-white" />
                        <span>Uyandırılıyor...</span>
                      </>
                    ) : (
                      <>
                        <Power size={14} className="text-white" />
                        <span>Kamerayı Uyandır</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── ÜST YÜZEN KAYAN BAR (Harita Üst Barı ile Birebir Aynı Konumda) ── */}
        <div
          className="absolute left-1/2 -translate-x-1/2 z-30 w-[94%] sm:w-auto max-w-md pointer-events-auto"
          style={{
            top: 'calc(var(--safe-top, 0px) + 1.25rem)',
          }}
        >
          <div className="flex bg-[#0D1219]/95 backdrop-blur-xl p-1 sm:p-1.5 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.85)] w-full sm:min-w-[390px] border border-white/10 items-center select-none gap-0.5 sm:gap-1 ring-1 ring-black/40">
            <div className="flex flex-1 gap-0.5 sm:gap-1">
              {[
                {
                  id: 'live',
                  label: 'Canlı',
                  icon: Video,
                  theme:
                    'bg-gradient-to-r from-emerald-600 to-emerald-500 border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.35)]',
                  hoverText: 'group-hover:text-emerald-400',
                },
                {
                  id: 'history',
                  label: 'Geçmiş',
                  icon: Clock,
                  theme:
                    'bg-gradient-to-r from-orange-600 to-amber-500 border-orange-400/40 shadow-[0_0_20px_rgba(249,115,22,0.35)]',
                  hoverText: 'group-hover:text-orange-400',
                },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleModeSwitch(tab.id)}
                    className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs transition-all duration-300 group outline-none cursor-pointer ${
                      isActive
                        ? 'text-white font-semibold'
                        : 'text-slate-400 font-medium hover:text-slate-200'
                    }`}
                  >
                    {!isActive && (
                      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.04] rounded-xl transition-colors duration-300" />
                    )}
                    {isActive && (
                      <motion.div
                        layoutId="camera-nav-pill"
                        className={`absolute inset-0 rounded-xl border ${tab.theme}`}
                        style={{ zIndex: 0 }}
                        initial={false}
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 32,
                          mass: 0.8,
                        }}
                      />
                    )}
                    <Icon
                      size={14}
                      className={`relative z-10 transition-colors duration-300 shrink-0 ${
                        isActive ? 'text-white' : `text-slate-400 ${tab.hoverText}`
                      }`}
                    />
                    <span className="relative z-10 text-xs truncate">
                      {tab.label}
                    </span>
                  </button>
                );
              })}

              {/* 3. TUŞ: KAMERAYI UYANDIR (4G Cat-1 Ping) */}
              <button
                type="button"
                onClick={handleWakeUp}
                disabled={isWakingUp}
                title="Kamerayı 4G hücresel ağ üzerinden uyandır ve akışı yenile"
                className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs transition-all duration-300 group outline-none cursor-pointer select-none active:scale-95 ${
                  isWakingUp
                    ? 'text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/10'
                }`}
              >
                {isWakingUp ? (
                  <Loader2 size={14} className="animate-spin text-emerald-400 shrink-0" />
                ) : (
                  <Power size={14} className="text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
                )}
                <span className="relative z-10 text-xs font-semibold truncate">
                  {isWakingUp ? 'Uyandırılıyor' : 'Uyandır'}
                </span>
              </button>
            </div>

            <div className="w-px h-5 bg-white/10 mx-0.5 sm:mx-1 flex-shrink-0" />

            {/* Kalite Seçici (480p SD | 2K HD) Kayan Bar */}
            <div className="flex items-center bg-[#080b10] rounded-xl p-0.5 border border-white/[0.06] shrink-0">
              {[
                { id: 'sd', label: '480p' },
                { id: 'hd', label: '2K' },
              ].map((q) => {
                const active = quality === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => handleQualitySwitch(q.id)}
                    className="relative px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-colors duration-200 cursor-pointer outline-none"
                    style={{ color: active ? '#fff' : '#64748b' }}
                  >
                    {active && (
                      <motion.div
                        layoutId="camera-quality-pill"
                        initial={false}
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 32,
                          mass: 0.8,
                        }}
                        className="absolute inset-0 rounded-lg bg-white/[0.12] border border-white/[0.18]"
                      />
                    )}
                    <span className="relative z-10">{q.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="w-px h-5 bg-white/10 mx-0.5 sm:mx-1 flex-shrink-0" />

            {/* Kapat */}
            <button
              onClick={handleClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all duration-200 cursor-pointer shrink-0"
              title="Kapat"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── SAĞ ÜST YÜZEN MİNİMAL ARAÇLAR (Kare Yakala & Ses) ── */}
        <div
          className="absolute right-4 z-20 flex items-center gap-1.5"
          style={{
            top: 'calc(var(--safe-top, 0px) + 5.25rem)',
          }}
        >
          <button
            onClick={handleSnapshot}
            className="w-10 h-10 rounded-2xl bg-[#0D1219]/90 hover:bg-[#141c27] backdrop-blur-xl border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.75)] flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all cursor-pointer"
            title="Kare Yakala"
          >
            <Camera size={16} />
          </button>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="w-10 h-10 rounded-2xl bg-[#0D1219]/90 hover:bg-[#141c27] backdrop-blur-xl border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.75)] flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all cursor-pointer"
            title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>

        {/* ── MASAÜSTÜ & iPAD YÜZEN SOL GEÇMİŞ MENÜSÜ (Görüntünün Üzerinde & Gizlenebilir) ── */}
        <AnimatePresence>
          {mode === 'history' && showHistorySidebar && (
            <motion.div
              initial={{ x: -16, opacity: 0, scale: 0.98 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: -16, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              className="hidden md:flex absolute left-4 w-[310px] z-20 flex-col rounded-3xl overflow-hidden border border-white/10 shadow-[0_16px_50px_rgba(0,0,0,0.85)] bg-[#0D1219]/95 backdrop-blur-xl"
              style={{
                top: 'calc(5.25rem + var(--safe-top, 0px))',
                maxHeight: 'calc(100vh - 6.5rem - var(--safe-top, 0px))',
              }}
            >
              <div className="p-3 border-b border-white/[0.06] shrink-0">
                {renderProgressiveDatePicker(true, () => setShowHistorySidebar(false))}
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 custom-scrollbar">
                {renderSegmentsList()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── MASAÜSTÜ & iPAD SOL MENÜ KAPALIYKEN AÇMA BUTONU (RouteHistory ile Birebir Aynı) ── */}
        <AnimatePresence>
          {mode === 'history' && !showHistorySidebar && (
            <motion.button
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={() => setShowHistorySidebar(true)}
              className="hidden md:flex absolute left-4 z-20 p-3.5 bg-[#0D1219]/95 hover:bg-[#141c27] backdrop-blur-xl text-amber-400 rounded-2xl border border-white/10 transition-all shadow-[0_12px_35px_rgba(0,0,0,0.8)] cursor-pointer"
              style={{
                top: 'calc(5.25rem + var(--safe-top, 0px))',
              }}
              title="Geçmiş Panelini Aç"
            >
              <Clock size={16} />
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── MASAÜSTÜ & iPAD ALT YÜZEN OYNATMA ÇUBUĞU ── */}
        <AnimatePresence>
          {mode === 'history' && selectedSegment && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="hidden md:flex absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[440px] px-4 py-2.5 rounded-3xl items-center gap-3.5 border border-white/10 shadow-[0_16px_50px_rgba(0,0,0,0.85)] bg-[#0D1219]/95 backdrop-blur-xl z-20"
            >
              <button
                onClick={togglePlayPause}
                className="w-9 h-9 rounded-full bg-gradient-to-r from-amber-600 to-orange-500 flex items-center justify-center text-white shadow-[0_2px_12px_rgba(245,158,11,0.35)] active:scale-95 transition-all shrink-0 cursor-pointer"
              >
                {isPlaying ? (
                  <Pause fill="currentColor" size={15} />
                ) : (
                  <Play fill="currentColor" className="ml-0.5" size={15} />
                )}
              </button>

              <button
                onClick={() =>
                  setPlaybackRate((prev) =>
                    prev === 1 ? 2 : prev === 2 ? 4 : 1
                  )
                }
                className="px-2.5 py-1 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.06] text-[10px] font-mono font-bold text-amber-400 transition-all shrink-0 cursor-pointer"
              >
                {playbackRate}x
              </button>

              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={progress}
                  onInput={(e) => handleSeek(parseFloat(e.target.value))}
                  onChange={(e) => handleSeek(parseFloat(e.target.value))}
                  className="camera-range-slider w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #f59e0b ${progress}%, rgba(255,255,255,0.08) ${progress}%)`,
                  }}
                />
                <div className="flex justify-between text-[9px] font-mono text-slate-400">
                  <span>{formatTimeSec(currentTime)}</span>
                  <span>{formatTimeSec(duration)}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── MOBİL YÜZEN ALT GEÇMİŞ KARTI (Görüntünün Üzerinde & Gizlenebilir) ── */}
        <AnimatePresence>
          {mode === 'history' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="flex md:hidden absolute bottom-3 left-3 right-3 z-20 flex-col rounded-[26px] border border-white/10 bg-[#0D1219]/95 backdrop-blur-xl p-3 gap-2.5 shadow-[0_16px_50px_rgba(0,0,0,0.85)] overflow-hidden"
              style={{
                marginBottom: 'env(safe-area-inset-bottom, 0px)',
              }}
            >
              {/* 3 Aşamalı Tarih Seçici + Gizle/Aç Butonu */}
              {!isMobileHistoryCollapsed && (
                <>
                  <div className="shrink-0">
                    {renderProgressiveDatePicker(true, () => setIsMobileHistoryCollapsed(true))}
                  </div>

                  <div className="max-h-[150px] overflow-y-auto space-y-1.5 custom-scrollbar pr-0.5">
                    {renderSegmentsList()}
                  </div>
                </>
              )}

              {/* Entegre Mobil Oynatma Kontrolleri */}
              {selectedSegment && (
                <div
                  className={`${
                    !isMobileHistoryCollapsed ? 'border-t border-white/[0.06] pt-2.5' : ''
                  } flex items-center gap-2.5 shrink-0`}
                >
                  <button
                    onClick={togglePlayPause}
                    className="w-9 h-9 rounded-full bg-gradient-to-r from-amber-600 to-orange-500 flex items-center justify-center text-white shadow-[0_2px_12px_rgba(245,158,11,0.35)] active:scale-95 transition-all shrink-0 cursor-pointer"
                  >
                    {isPlaying ? (
                      <Pause fill="currentColor" size={14} />
                    ) : (
                      <Play fill="currentColor" className="ml-0.5" size={14} />
                    )}
                  </button>

                  <button
                    onClick={() =>
                      setPlaybackRate((prev) =>
                        prev === 1 ? 2 : prev === 2 ? 4 : 1
                      )
                    }
                    className="px-2.5 py-1 rounded-xl bg-white/[0.05] border border-white/[0.06] text-[10px] font-mono font-bold text-amber-400 active:scale-95 transition-all shrink-0 cursor-pointer"
                  >
                    {playbackRate}x
                  </button>

                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.1"
                      value={progress}
                      onInput={(e) => handleSeek(parseFloat(e.target.value))}
                      onChange={(e) => handleSeek(parseFloat(e.target.value))}
                      className="camera-range-slider w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #f59e0b ${progress}%, rgba(255,255,255,0.08) ${progress}%)`,
                      }}
                    />
                    <div className="flex justify-between text-[9px] font-mono text-slate-400">
                      <span>{formatTimeSec(currentTime)}</span>
                      <span>{formatTimeSec(duration)}</span>
                    </div>
                  </div>

                  {isMobileHistoryCollapsed && (
                    <button
                      onClick={() => setIsMobileHistoryCollapsed(false)}
                      className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-amber-400 shrink-0 cursor-pointer"
                      title="Kayıt Listesini Aç"
                    >
                      <Clock size={14} />
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>,
    portalTarget
  );
}

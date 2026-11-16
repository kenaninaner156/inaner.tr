import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import {
  Video,
  VideoOff,
  Volume1,
  Clock,
  X,
  Volume2,
  VolumeX,
  Download,
  Play,
  Pause,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Power,
  RefreshCw,
} from 'lucide-react';
import {
  fetchLiveStreamUrl,
  invalidateLiveStreamCache,
  fetchCachedCameraHistorySegments,
  resolveHistorySegmentStream,
  closeCameraStream,
  attachStreamToVideo,
  wakeUpCamera,
  setCameraWatchLight,
} from '../../services/cameraService';
import { useCompany } from '../../context/CompanyContext';

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
  initialMode = 'live',
  initialQuality = 'sd',
  initialDate = null,
  onQualityChange,
  keepStreamOnClose = false,
}) {
  const [mode, setMode] = useState(initialMode); // 'live' | 'history'
  const [quality, setQuality] = useState(initialQuality); // 'sd' (480p) | 'hd' (2K)
  const [isMuted, setIsMuted] = useState(false);
  const [autoMutedByBrowser, setAutoMutedByBrowser] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const { companyData } = useCompany() || {};
  const isLiveLightEnabled = companyData?.cameraStatusLedEnabled !== false;
  const isLiveLightEnabledRef = useRef(isLiveLightEnabled);
  useEffect(() => {
    isLiveLightEnabledRef.current = isLiveLightEnabled;
  }, [isLiveLightEnabled]);

  const videoRef = useRef(null);
  const volumeControlRef = useRef(null);
  const cleanupStreamRef = useRef(null);
  const liveStartedRef = useRef(false);

  // Ses ayar yöneticisi (Kamera mikrofon ve canlı kabin sesi)
  const handleVolumeChange = (newVol) => {
    setVolume(newVol);
    setAutoMutedByBrowser(false);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      if (newVol > 0) {
        setIsMuted(false);
        videoRef.current.muted = false;
        videoRef.current.play().catch(() => {});
      } else if (newVol === 0) {
        setIsMuted(true);
        videoRef.current.muted = true;
      }
    }
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    setAutoMutedByBrowser(false);
    if (videoRef.current) {
      videoRef.current.muted = nextMute;
      if (!nextMute) {
        const targetVol = volume > 0 ? volume : 1.0;
        setVolume(targetVol);
        videoRef.current.volume = targetVol;
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [streamStatus, setStreamStatus] = useState({ offline: false, message: '' });
  const [isVideoLivePlaying, setIsVideoLivePlaying] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [wakeFeedback, setWakeFeedback] = useState('');
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [reloadLiveTrigger, setReloadLiveTrigger] = useState(0);

  // Ses paneli dışına tıklandığında animasyonla kapat
  useEffect(() => {
    if (!isVolumeOpen) return;
    const handlePointerDownOutside = (e) => {
      if (volumeControlRef.current && !volumeControlRef.current.contains(e.target)) {
        setIsVolumeOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [isVolumeOpen]);

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
  const [historyReloadNonce, setHistoryReloadNonce] = useState(0);
  const switchedFromLiveAtRef = useRef(0);

  // Modal açıldığında hedef sekmeyi senkronize et ('live' veya 'history')
  useEffect(() => {
    if (!isOpen) return;
    Promise.resolve().then(() => {
      setMode(initialMode || 'live');
      if (initialDate) {
        setHistoryDate(initialDate);
      }
      setAutoMutedByBrowser(false);
      setIsVolumeOpen(false);
    });
  }, [isOpen, initialMode, initialDate]);

  // Geçmiş video oynatıcı kontrolleri
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const handleWakeUp = async () => {
    if (!deviceId || isWakingUp) return;
    setIsWakingUp(true);
    setIsLoadingStream(true);
    setStreamStatus({ offline: false, message: '' });
    setWakeFeedback('Cihaza 4G üzerinden uyandırma sinyali iletiliyor...');
    try {
      const res = await wakeUpCamera(deviceId);
      if (res.success) {
        setWakeFeedback('Uyandırma sinyali iletildi, görüntü başlatılıyor...');
      } else {
        setWakeFeedback(res.message || 'Cihaz yanıt vermedi, bağlantı tekrar deneniyor...');
      }
    } catch {
      setWakeFeedback('Uyandırma isteği iletilemedi.');
    }
    invalidateLiveStreamCache(deviceId);
    setTimeout(() => {
      setReloadLiveTrigger((c) => c + 1);
      setIsWakingUp(false);
      setTimeout(() => setWakeFeedback(''), 3500);
    }, 350);
  };

  // Harita tıklama/kaydırma sızıntılarını engelle
  const modalRootRef = useCallback((node) => {
    if (node) {
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
    }
  }, []);

  const handleClose = useCallback(() => {
    setIsVolumeOpen(false);
    if (cleanupStreamRef.current) {
      cleanupStreamRef.current();
      cleanupStreamRef.current = null;
    }
    if (deviceId && !(mode === 'live' && keepStreamOnClose)) {
      closeCameraStream(deviceId, mode);
    }
    onClose();
  }, [deviceId, mode, keepStreamOnClose, onClose]);

  const handleQualitySwitch = (newQuality) => {
    if (newQuality === quality) return;
    setIsVideoLivePlaying(false);
    setQuality(newQuality);
    if (onQualityChange) onQualityChange(newQuality);
  };
  void handleQualitySwitch;

  const handleModeSwitch = (newMode) => {
    if (newMode === mode) return;
    if (cleanupStreamRef.current) {
      cleanupStreamRef.current();
      cleanupStreamRef.current = null;
    }
    setIsVideoLivePlaying(false);
    setStreamStatus({ offline: false, message: '' });
    if (deviceId) {
      if (mode === 'live' && newMode === 'history') {
        switchedFromLiveAtRef.current = Date.now();
      }
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

  // Görünmez SIM Kota Koruması: Sekme gizlendiğinde veya 3 dk hareketsiz canlı yayında 4G akışını sessizce durdur
  useEffect(() => {
    if (!isOpen || mode !== 'live' || !deviceId) return;

    const pauseLiveSilently = () => {
      if (cleanupStreamRef.current) {
        cleanupStreamRef.current();
        cleanupStreamRef.current = null;
      }
      closeCameraStream(deviceId, 'live');
      liveStartedRef.current = false;
      setIsVideoLivePlaying(false);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        pauseLiveSilently();
      } else {
        setReloadLiveTrigger((c) => c + 1);
      }
    };

    let idleTimer = null;
    if (isVideoLivePlaying) {
      idleTimer = setTimeout(() => {
        pauseLiveSilently();
        setStreamStatus({
          offline: true,
          message: 'Veri tasarrufu için canlı akış duraklatıldı. Devam etmek için yenileyebilirsiniz.',
        });
      }, 3 * 60 * 1000);
    }

    const onPageHide = () => {
      if (liveStartedRef.current) {
        closeCameraStream(deviceId, 'live');
        liveStartedRef.current = false;
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [isOpen, mode, deviceId, isVideoLivePlaying]);

  // Canlı yayın izlendiği sürece kamera kabin durum LED'lerini (LEDSW,ON#) aç
  useEffect(() => {
    if (!isOpen || mode !== 'live' || !isVideoLivePlaying || !deviceId || !isLiveLightEnabled) return;
    setCameraWatchLight(deviceId, 'ON');
  }, [isOpen, mode, isVideoLivePlaying, deviceId, isLiveLightEnabled]);

  // Canlı yayın akışını yükle (WSS-FLV düşük gecikmeli bağlantı + otomatik 4G uyandırma & yeniden bağlanma)
  useEffect(() => {
    if (!isOpen || mode !== 'live' || !deviceId) return;
    let cancelled = false;
    let retryDelayTimer = null;
    let didAutoWake = false;
    liveStartedRef.current = false;

    Promise.resolve().then(() => {
      if (cancelled) return;
      setIsLoadingStream(true);
      setIsVideoLivePlaying(false);
      setStreamStatus({ offline: false, message: '' });
    });

    const clearPendingTimers = () => {
      if (retryDelayTimer) {
        clearTimeout(retryDelayTimer);
        retryDelayTimer = null;
      }
    };

    // 15 saniye içinde görüntü karesi gelmezse sonsuz yükleme ekranını sonlandırıp uyku kartını göster
    const streamTimeout = setTimeout(() => {
      if (!cancelled && !liveStartedRef.current) {
        clearPendingTimers();
        if (cleanupStreamRef.current) {
          cleanupStreamRef.current();
          cleanupStreamRef.current = null;
        }
        setIsLoadingStream(false);
        setStreamStatus({
          offline: true,
          message: 'Araç park halinde. Canlı görüntü için kamerayı uyandırabilir veya geçmiş kayıtları izleyebilirsiniz.',
        });
      }
    }, 15000);

    const connectAttempt = async (attemptIndex = 0, forceFreshUrl = false) => {
      if (cancelled || liveStartedRef.current) return;
      clearPendingTimers();

      if (forceFreshUrl) {
        invalidateLiveStreamCache(deviceId);
      }

      const streamInfo = await fetchLiveStreamUrl(
        deviceId,
        quality,
        false,
        isLiveLightEnabledRef.current,
        forceFreshUrl
      );
      if (cancelled || liveStartedRef.current) return;

      if (!streamInfo?.url || !videoRef.current) {
        if (attemptIndex < 1) {
          if (!didAutoWake) {
            didAutoWake = true;
            wakeUpCamera(deviceId).catch(() => {});
          }
          retryDelayTimer = setTimeout(() => connectAttempt(attemptIndex + 1, true), 1000);
          return;
        }
        clearTimeout(streamTimeout);
        setIsLoadingStream(false);
        setStreamStatus({
          offline: true,
          message:
            streamInfo?.message ||
            'Araç park halinde. Canlı görüntü için kamerayı uyandırabilir veya geçmiş kayıtları izleyebilirsiniz.',
        });
        return;
      }

      if (cleanupStreamRef.current) {
        cleanupStreamRef.current();
        cleanupStreamRef.current = null;
      }

      const cleanup = await attachStreamToVideo(videoRef.current, streamInfo.url, {
        hasAudio: true,
        isLive: true,
        fallbackUrl: streamInfo.fallbackUrl || null,
        onFirstFrame: () => {
          if (cancelled) return;
          liveStartedRef.current = true;
          clearTimeout(streamTimeout);
          clearPendingTimers();
          setIsLoadingStream(false);
          setIsVideoLivePlaying(true);
        },
        onAutoMuted: () => {
          if (!cancelled) {
            setIsMuted(true);
            setAutoMutedByBrowser(true);
          }
        },
        onError: (_errType, errDetail) => {
          if (cancelled || liveStartedRef.current) return;
          clearPendingTimers();
          if (
            attemptIndex < 1 &&
            !(typeof errDetail === 'string' && errDetail.includes('iOS'))
          ) {
            if (!didAutoWake) {
              didAutoWake = true;
              wakeUpCamera(deviceId).catch(() => {});
            }
            retryDelayTimer = setTimeout(() => connectAttempt(attemptIndex + 1, true), 650);
            return;
          }
          clearTimeout(streamTimeout);
          setIsLoadingStream(false);
          setStreamStatus({
            offline: true,
            message:
              typeof errDetail === 'string' && errDetail.includes('iOS')
                ? errDetail
                : 'Canlı görüntü bağlantısı bekleniyor. Kamerayı uyandırarak tekrar deneyebilirsiniz.',
          });
        },
      });

      if (cancelled) {
        if (cleanup) cleanup();
        return;
      }
      cleanupStreamRef.current = cleanup;
    };

    connectAttempt(0, reloadLiveTrigger > 0);

    return () => {
      cancelled = true;
      clearTimeout(streamTimeout);
      clearPendingTimers();
      if (cleanupStreamRef.current) {
        cleanupStreamRef.current();
        cleanupStreamRef.current = null;
      }
    };
  }, [isOpen, mode, deviceId, quality, reloadLiveTrigger]);

  // Geçmiş kayıt parçalarını yükle (4.7 cmd + 4.8 get — önbellek ve 4G tekrar deneme destekli)
  useEffect(() => {
    if (!isOpen || mode !== 'history' || !deviceId) return;
    let cancelled = false;
    const forceRefresh = historyReloadNonce > 0;

    const loadSegments = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setHistoryLoading(true);

      // Canlı yayından yeni geçildiyse cihazın RTMP oturumunu kapatması için 350ms nefes payı tanı
      const sinceLiveSwitch = Date.now() - switchedFromLiveAtRef.current;
      if (sinceLiveSwitch >= 0 && sinceLiveSwitch < 350) {
        await new Promise((r) => setTimeout(r, 350 - sinceLiveSwitch));
      }
      if (cancelled) return;

      const res = await fetchCachedCameraHistorySegments(
        deviceId,
        historyDate,
        forceRefresh,
        quality
      );
      if (cancelled) return;

      if (Array.isArray(res.recordedDates) && res.recordedDates.length > 0) {
        setRecordedDates((prev) => [...new Set([...prev, ...res.recordedDates])]);
      }
      // En güncel kayıt en üstte olacak şekilde sırala
      const segs = [...(res.segments || [])].sort((a, b) =>
        String(b.beginTime || '').localeCompare(String(a.beginTime || ''))
      );
      setSegments(segs);
      setSelectedSegment((prev) => {
        if (prev) {
          const match = segs.find((s) => s.id === prev.id);
          if (match) return match;
        }
        return segs[0] || null;
      });
      setHistoryLoading(false);
    };

    loadSegments();

    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, deviceId, historyDate, quality, historyReloadNonce]);

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
      const cleanup = await attachStreamToVideo(videoRef.current, streamUrl, {
        hasAudio: true,
        isLive: false,
        onFirstFrame: () => {
          if (!cancelled) setIsLoadingStream(false);
        },
        onAutoMuted: () => {
          if (!cancelled) {
            setIsMuted(true);
            setAutoMutedByBrowser(true);
          }
        },
        onError: () => {
          if (!cancelled) setIsLoadingStream(false);
        },
      });
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
      if (cleanupStreamRef.current) {
        cleanupStreamRef.current();
        cleanupStreamRef.current = null;
      }
    };
  }, [isOpen, mode, deviceId, selectedSegment]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Ses durumu ve kontrol içeriği
  const renderVolumeIcon = (size = 15) => {
    if (isMuted || volume === 0) {
      return <VolumeX size={size} className="text-slate-400" />;
    }
    if (volume < 0.5) {
      return <Volume1 size={size} className="text-emerald-400" />;
    }
    return <Volume2 size={size} className="text-emerald-400" />;
  };

  const renderVolumeSliderBody = () => (
    <>
      <button
        type="button"
        onClick={handleToggleMute}
        className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer shrink-0"
        title={isMuted ? 'Sesi Aç' : 'Sessize Al'}
      >
        {renderVolumeIcon(15)}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={isMuted ? 0 : volume}
        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
        className="w-24 md:w-16 lg:w-20 h-1 bg-slate-700/80 rounded-lg appearance-none cursor-pointer accent-emerald-400"
        title={`Ses: %${Math.round((isMuted ? 0 : volume) * 100)}`}
      />
      <span className="text-[10px] font-mono text-slate-300 w-7 text-right font-semibold select-none shrink-0">
        {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
      </span>
    </>
  );

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
                    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
        <div className="flex flex-col items-center justify-center gap-2 py-6">
          <Loader2 size={18} className="text-amber-400 animate-spin" />
          <span className="text-[11px] text-slate-400">SD kart kayıtları sorgulanıyor...</span>
        </div>
      );
    }
    if (segments.length === 0) {
      return (
        <div className="py-5 flex flex-col items-center gap-2.5 text-center">
          <span className="text-xs text-slate-500">Kayıt bulunamadı.</span>
          <button
            type="button"
            onClick={() => setHistoryReloadNonce((n) => n + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw size={12} />
            <span>Tekrar Sorgula</span>
          </button>
        </div>
      );
    }
    return (
      <>
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-[10px] font-mono text-slate-400">
            {segments.length} kayıt parçası
          </span>
          <button
            type="button"
            onClick={() => setHistoryReloadNonce((n) => n + 1)}
            title="Listeyi Yenile"
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <RefreshCw size={11} />
          </button>
        </div>
        {segments.map((seg) => {
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
              <ChevronRight size={12} className="text-slate-600 shrink-0" />
              <span className={isSelected ? 'text-amber-300' : 'text-slate-400'}>
                {seg.endTime}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {seg.url && (
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
            )}
            {isSelected && (
              <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Check size={12} />
              </div>
            )}
          </div>
        </div>
      );
    })}
      </>
    );
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

        {/* ── TAM EKRAN VİDEO SAHNESİ ── */}
        <div className="absolute inset-0 flex items-center justify-center bg-[#05070b]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            disableRemotePlayback
            x-webkit-airplay="deny"
            muted={isMuted}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v) {
                v.volume = volume;
              }
            }}
            onCanPlay={(e) => {
              liveStartedRef.current = true;
              setIsLoadingStream(false);
              setIsVideoLivePlaying(true);
              const v = e.currentTarget;
              if (v) {
                v.volume = volume;
              }
            }}
            onLoadedData={() => {
              liveStartedRef.current = true;
              setIsLoadingStream(false);
              setIsVideoLivePlaying(true);
            }}
            onPlaying={(e) => {
              liveStartedRef.current = true;
              setIsLoadingStream(false);
              setIsPlaying(true);
              setIsVideoLivePlaying(true);
              const v = e.currentTarget;
              if (v) {
                v.volume = volume;
              }
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
                className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/40 backdrop-blur-[2px] pointer-events-none"
              >
                <Loader2 size={26} className="text-white/80 animate-spin" />
                <span className="text-xs font-medium text-slate-300 tracking-tight">
                  {mode === 'live' ? 'Canlı görüntü bağlanıyor' : 'Kayıt yükleniyor'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobil Tarayıcı Otomatik Sessize Alma Bildirimi — Tek Dokunuşla Kabin Sesini Aç */}
          {autoMutedByBrowser && isMuted && isVideoLivePlaying && (
            <button
              type="button"
              onClick={handleToggleMute}
              className="absolute bottom-5 left-4 sm:bottom-6 sm:left-6 z-20 inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-2xl bg-[#0a0d14]/90 hover:bg-[#131924] border border-white/10 text-slate-100 text-xs font-semibold backdrop-blur-xl shadow-2xl active:scale-95 transition-all cursor-pointer"
            >
              <VolumeX size={15} className="text-amber-400" />
              <span>Sesi Aç</span>
            </button>
          )}

          {/* Park / Uyku Modu Kartı */}
          {mode === 'live' && streamStatus.offline && !isLoadingStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3 z-10 px-4">
              <div className="w-12 h-12 rounded-2xl bg-[#0a0d14] border border-white/[0.08] flex items-center justify-center shadow-2xl">
                <VideoOff size={20} className="text-slate-400" />
              </div>
              <div className="text-center max-w-sm">
                <p className="text-sm font-semibold text-slate-100">
                  Kamera Uyku Modunda
                </p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {streamStatus.message || 'Canlı görüntü için cihazı uyandırabilir veya geçmiş kayıtları izleyebilirsiniz.'}
                </p>
                {wakeFeedback && (
                  <p className="text-xs text-emerald-400 mt-2.5 font-medium">
                    {wakeFeedback}
                  </p>
                )}
                <div className="mt-4 pointer-events-auto flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleWakeUp}
                    disabled={isWakingUp}
                    className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold border border-emerald-400/30 active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
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

                  <button
                    type="button"
                    onClick={() => handleModeSwitch('history')}
                    className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-[#0d1219] hover:bg-white/[0.08] text-slate-200 text-xs font-semibold border border-white/10 active:scale-95 transition-all cursor-pointer"
                  >
                    <Clock size={14} className="text-amber-400" />
                    <span>Geçmiş Kayıtlar</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sağ Alt Köşede Erişilebilir "Kamerayı Uyandır" Butonu - Yalnızca bağlantı aşamasında */}
          {mode === 'live' && !isVideoLivePlaying && !streamStatus.offline && (
            <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-20 pointer-events-auto flex">
              <button
                type="button"
                onClick={handleWakeUp}
                disabled={isWakingUp}
                className="inline-flex items-center gap-2 min-h-[40px] px-3.5 sm:px-4 py-2 rounded-2xl bg-[#0a0d14]/90 hover:bg-[#141b24] border border-white/10 hover:border-emerald-500/40 text-slate-200 hover:text-white text-xs font-semibold backdrop-blur-xl shadow-2xl transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Kamerayı 4G üzerinden uyandır"
              >
                {isWakingUp ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-emerald-400" />
                    <span>Uyandırılıyor...</span>
                  </>
                ) : (
                  <>
                    <Power size={14} className="text-emerald-400" />
                    <span>Kamerayı Uyandır</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* ── ÜST YÜZEN KAYAN BAR ── */}
        <div
          className="absolute left-1/2 -translate-x-1/2 z-30 w-auto pointer-events-auto"
          style={{
            top: 'calc(var(--safe-top, 0px) + 1.25rem)',
          }}
        >
          <div className="flex bg-[#0D1219]/95 backdrop-blur-xl p-1 sm:p-1.5 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.85)] border border-white/10 items-center select-none gap-1 sm:gap-1.5 ring-1 ring-black/40">
            <div className="flex gap-1">
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
                    className={`relative flex items-center justify-center gap-1.5 py-2 px-3 sm:px-4 rounded-xl text-xs transition-all duration-300 group outline-none cursor-pointer ${
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

        {/* ── SAĞ ÜST SES KONTROLÜ (ÜST BAR İLE AYNI HİZADA, ANİMASYONLU AÇILIR/KAPANIR) ── */}
        <div
          ref={volumeControlRef}
          className="absolute right-3 sm:right-4 z-30 pointer-events-auto"
          style={{
            top: 'calc(var(--safe-top, 0px) + 1.25rem)',
          }}
        >
          <div className="flex bg-[#0D1219]/95 backdrop-blur-xl p-1 sm:p-1.5 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.85)] border border-white/10 items-center select-none ring-1 ring-black/40 transition-colors">
            <AnimatePresence initial={false}>
              {isVolumeOpen && (
                <motion.div
                  key="desktop-volume-tray"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                  className="hidden md:flex items-center overflow-hidden"
                >
                  <div className="flex items-center gap-2 pl-0.5 pr-2 whitespace-nowrap">
                    {renderVolumeSliderBody()}
                  </div>
                  <div className="w-px h-5 bg-white/10 mr-1.5 shrink-0" />
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="button"
              onClick={() => setIsVolumeOpen((prev) => !prev)}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 ${
                isVolumeOpen
                  ? 'bg-white/[0.08] text-white'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'
              }`}
              title={
                isVolumeOpen
                  ? 'Ses Kontrolünü Kapat'
                  : isMuted || volume === 0
                    ? 'Ses Kapalı — Ayarlamak için Tıklayın'
                    : `Ses Seviyesi: %${Math.round(volume * 100)}`
              }
              aria-expanded={isVolumeOpen}
            >
              <motion.span
                key={isVolumeOpen ? 'vol-open' : 'vol-closed'}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.16 }}
                className="flex items-center justify-center"
              >
                {isVolumeOpen ? (
                  <>
                    <ChevronRight size={15} className="hidden md:block text-slate-300" />
                    <span className="md:hidden flex items-center justify-center">
                      {renderVolumeIcon(15)}
                    </span>
                  </>
                ) : (
                  renderVolumeIcon(15)
                )}
              </motion.span>
            </button>
          </div>

          <AnimatePresence>
            {isVolumeOpen && (
              <motion.div
                key="mobile-volume-popover"
                initial={{ opacity: 0, y: -8, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.94 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="md:hidden absolute right-0 top-full mt-2 flex items-center gap-2 bg-[#0D1219]/95 backdrop-blur-xl px-2 py-1.5 min-h-[44px] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.85)] border border-white/10 ring-1 ring-black/40"
              >
                {renderVolumeSliderBody()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

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

        {/* ── MASAÜSTÜ & iPAD SOL MENÜ KAPALIYKEN AÇMA BUTONU ── */}
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

        {/* ── MOBİL YÜZEN ALT GEÇMİŞ KARTI ── */}
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

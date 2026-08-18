import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, ExternalLink, ShieldCheck } from 'lucide-react';

/**
 * Tarayıcıda ses çalmak için Web Audio API ile zarif bildirim tınısı
 */
function playNotificationChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // 1. Ton (Doğal, yumuşak cam tonu)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.28); // D6

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.1);
    osc1.stop(ctx.currentTime + 0.55);
    osc2.stop(ctx.currentTime + 0.55);
  } catch {
    // Ses izni yoksa sessizce geç
  }
}

export default function PushNotificationToast({ notification, onClose, onAction }) {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!notification) return;
    playNotificationChime();
    setProgress(100);

    const DURATION = 7000; // 7 saniye
    const INTERVAL = 50;
    const step = (INTERVAL / DURATION) * 100;

    const timer = setInterval(() => {
      if (!isPaused) {
        setProgress(prev => {
          if (prev <= 0) {
            clearInterval(timer);
            onClose();
            return 0;
          }
          return prev - step;
        });
      }
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [notification, isPaused]);

  if (!notification) return null;

  const title = notification.title || 'İnaner Lojistik Duyuru';
  const body = notification.body || '';

  return (
    <AnimatePresence>
      <div className="fixed top-5 right-4 left-4 sm:left-auto sm:right-6 z-[99999] pointer-events-none flex justify-center sm:justify-end">
        <motion.div
          initial={{ y: -80, opacity: 0, scale: 0.92, filter: 'blur(8px)' }}
          animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ y: -40, opacity: 0, scale: 0.95, filter: 'blur(6px)' }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          className="pointer-events-auto w-full max-w-sm rounded-2xl overflow-hidden bg-[#0c101c]/95 border border-indigo-500/30 shadow-[0_16px_50px_rgba(0,0,0,0.85)] shadow-indigo-950/40 backdrop-blur-2xl"
        >
          {/* Üst Canlı Gradient Çizgisi */}
          <div className="h-1 bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400" />

          <div className="p-4">
            <div className="flex items-start gap-3">
              {/* İkon */}
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300">
                  <Bell size={20} className="animate-pulse" />
                </div>
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#0c101c] flex items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                </div>
              </div>

              {/* İçerik */}
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/25">
                      İnaner Lojistik
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 flex-shrink-0 font-medium">Az önce</span>
                </div>

                <h5 className="text-sm font-bold text-white mt-1.5 leading-snug tracking-tight">
                  {title}
                </h5>

                <p className="text-xs text-slate-300 mt-1 leading-relaxed whitespace-pre-wrap break-words">
                  {body}
                </p>

                {/* Aksiyon butonları */}
                <div className="mt-3 flex items-center gap-2 pt-2 border-t border-white/5">
                  <button
                    onClick={onClose}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-all"
                  >
                    Kapat
                  </button>
                  {onAction && (
                    <button
                      onClick={() => {
                        onAction();
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all flex items-center gap-1 shadow-md shadow-indigo-600/30"
                    >
                      <span>Aç</span>
                      <ExternalLink size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* X Kapat Butonu */}
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* İlerleme Çubuğu */}
          <div className="h-0.5 w-full bg-white/5">
            <motion.div
              className="h-full bg-indigo-500/60"
              style={{ width: `${progress}%` }}
              transition={{ ease: 'linear' }}
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, ExternalLink, CheckCircle, XCircle, Navigation, Radio, Activity } from 'lucide-react';

/**
 * Tarayıcıda ses çalmak için Web Audio API ile zarif bildirim tınısı
 */
function playNotificationChime(type = 'general') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 'sos') {
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2); // A5
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    } else {
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.28); // D6

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    }

    osc1.connect(gain);
    if (type !== 'sos') osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    if (type !== 'sos') osc2.start(ctx.currentTime + 0.1);
    osc1.stop(ctx.currentTime + 0.6);
    if (type !== 'sos') osc2.stop(ctx.currentTime + 0.6);
  } catch {
    // Ses izni yoksa sessizce geç
  }
}

const TAB_NAMES = {
  dashboard: '📊 Özeti Aç',
  trips: '🚚 Seferleri Gör',
  fuel: '⛽ Mazot Fişleri',
  maintenance: '🔧 Araç Bakım',
  detaylar: '⚠️ Cezalar & Belgeler',
  invoices: '📑 Faturalar',
  earsiv: '🧾 E-Arşiv',
  payments: '💳 Ödemeler',
  map: '📍 Canlı Harita',
  chat: '💬 Sohbete Git'
};

export default function PushNotificationToast({ notification, onClose, onAction, onAcknowledge }) {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const [ackState, setAckState] = useState(null); // 'approved' | 'rejected'

  useEffect(() => {
    if (!notification) {
      setAckState(null);
      return;
    }
    const vib = notification.data?.vibrationPattern || 'general';
    playNotificationChime(vib);
    setProgress(100);
    setAckState(null);

    const DURATION = 8500; // 8.5 saniye
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
  const imageUrl = notification.imageUrl || notification.data?.imageUrl || null;
  const targetTab = notification.data?.targetTab || null;
  const requireAck = notification.data?.requireAck === 'true';
  const notificationId = notification.data?.notificationId || null;
  const isSos = notification.data?.vibrationPattern === 'sos';

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
          className={`pointer-events-auto w-full max-w-sm rounded-2xl overflow-hidden bg-[#0c101c]/95 border shadow-[0_16px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl transition-all ${
            isSos ? 'border-red-500/40 shadow-red-950/40' : 'border-indigo-500/30 shadow-indigo-950/40'
          }`}
        >
          {/* Üst Canlı Gradient Çizgisi */}
          <div className={`h-1.5 bg-gradient-to-r ${
            isSos ? 'from-red-500 via-amber-400 to-red-500 animate-pulse' : 'from-indigo-500 via-sky-400 to-emerald-400'
          }`} />

          <div className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              {/* İkon */}
              <div className="relative flex-shrink-0">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                  isSos ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
                }`}>
                  {isSos ? <Radio size={20} className="animate-ping" /> : <Bell size={20} className="animate-pulse" />}
                </div>
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#0c101c] flex items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                </div>
              </div>

              {/* Başlık ve Metin */}
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md border ${
                    isSos ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/25'
                  }`}>
                    {isSos ? '🚨 ACİL BİLDİRİM' : 'İnaner Lojistik'}
                  </span>
                  <span className="text-[10px] text-slate-500 flex-shrink-0 font-medium">Az önce</span>
                </div>

                <h5 className="text-sm font-bold text-white mt-1.5 leading-snug tracking-tight">
                  {title}
                </h5>

                <p className="text-xs text-slate-300 mt-1 leading-relaxed whitespace-pre-wrap break-words">
                  {body}
                </p>
              </div>

              {/* X Kapat Butonu */}
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Ekli Görsel Önizleme */}
            {imageUrl && (
              <div className="rounded-xl overflow-hidden border border-white/10 max-h-36 bg-black/40">
                <img src={imageUrl} alt="Bildirim Görseli" className="w-full h-36 object-cover" />
              </div>
            )}

            {/* İki Yönlü Onay veya Sayfaya Git Butonları */}
            {ackState ? (
              <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center justify-center gap-1.5 animate-in fade-in">
                <CheckCircle size={15} />
                <span>Onayınız Yöneticiye İletildi!</span>
              </div>
            ) : requireAck && notificationId ? (
              <div className="pt-2 border-t border-white/10 flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setAckState('approved');
                    if (onAcknowledge) await onAcknowledge(notificationId, 'approved');
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 cursor-pointer"
                >
                  <CheckCircle size={14} />
                  <span>Onayladım</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setAckState('rejected');
                    if (onAcknowledge) await onAcknowledge(notificationId, 'rejected');
                  }}
                  className="py-2 px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-xs font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  <XCircle size={14} />
                  <span>Sorun Var</span>
                </button>
              </div>
            ) : (
              <div className="pt-2 border-t border-white/10 flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-all cursor-pointer"
                >
                  Kapat
                </button>
                {targetTab && onAction && (
                  <button
                    onClick={() => {
                      onAction(targetTab);
                      onClose();
                    }}
                    className="flex-1 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-all flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/30 cursor-pointer"
                  >
                    <span>{TAB_NAMES[targetTab] || 'Sayfayı Aç'}</span>
                    <ExternalLink size={12} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* İlerleme Çubuğu */}
          <div className="h-0.5 w-full bg-white/5">
            <motion.div
              className={`h-full ${isSos ? 'bg-red-500/80' : 'bg-indigo-500/80'}`}
              style={{ width: `${progress}%` }}
              transition={{ ease: 'linear' }}
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

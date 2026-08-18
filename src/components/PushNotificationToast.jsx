import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, ExternalLink, CheckCircle, XCircle, Navigation, Radio, Activity, Sparkles, MapPin, Truck, Fuel, FileText, Wrench, AlertTriangle, Receipt, CreditCard } from 'lucide-react';

const TAB_ICONS = {
  dashboard: Navigation,
  trips: Truck,
  fuel: Fuel,
  maintenance: Wrench,
  detaylar: AlertTriangle,
  invoices: FileText,
  earsiv: Receipt,
  payments: CreditCard,
  map: MapPin,
  chat: Sparkles
};

const TAB_NAMES = {
  dashboard: 'Özeti Aç',
  trips: 'Sefer Detayları',
  fuel: 'Mazot Fişi Yükle',
  maintenance: 'Araç Bakım',
  detaylar: 'Cezalar & Belgeler',
  invoices: 'Fatura Durumu',
  earsiv: 'E-Arşiv Fatura',
  payments: 'Ödeme Takibi',
  map: 'Canlı Harita',
  chat: 'Sohbete Git'
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
    // Sesi kapattık (kullanıcı talebi doğrultusunda sessiz bildirim)
    setProgress(100);
    setAckState(null);

    const DURATION = 9000; // 9 saniye
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
  const buttonMode = notification.data?.buttonMode || (notification.data?.requireAck === 'true' ? 'ack' : 'nav');
  const customNavLabel = notification.data?.customNavLabel || null;
  const notificationId = notification.data?.notificationId || null;
  const isSos = notification.data?.vibrationPattern === 'sos';

  const ActionIcon = (targetTab && TAB_ICONS[targetTab]) ? TAB_ICONS[targetTab] : Navigation;
  const actionLabel = customNavLabel || (targetTab && TAB_NAMES[targetTab]) || 'Sayfayı Aç';

  return (
    <AnimatePresence>
      <div className="fixed top-4 right-4 left-4 sm:left-auto sm:right-5 z-[99999] pointer-events-none flex justify-center sm:justify-end">
        <motion.div
          initial={{ y: -60, opacity: 0, scale: 0.94, filter: 'blur(10px)' }}
          animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ y: -30, opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          className={`pointer-events-auto w-full max-w-[360px] rounded-2xl overflow-hidden bg-[#0a0e17]/95 border shadow-[0_20px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl transition-all ${
            isSos ? 'border-red-500/40 shadow-red-950/40' : 'border-white/10 shadow-black/80'
          }`}
        >
          {/* Üst Zarif Neon Çizgi */}
          <div className={`h-1 bg-gradient-to-r ${
            isSos ? 'from-red-500 via-amber-400 to-red-500 animate-pulse' : 'from-indigo-500 via-sky-400 to-emerald-400'
          }`} />

          <div className="p-4 space-y-3">
            {/* Üst Başlık & İkon & Kapat */}
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${
                  isSos ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-indigo-500/15 border-indigo-500/25 text-indigo-400'
                }`}>
                  {isSos ? <Radio size={14} className="animate-ping" /> : <Bell size={14} />}
                </div>
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="text-[11px] font-bold tracking-wide uppercase text-indigo-300">
                    İnaner Lojistik
                  </span>
                  <span className="text-[10px] text-slate-500">·</span>
                  <span className="text-[10px] text-slate-400 font-medium">Şimdi</span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-1 -mr-1 -mt-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* İçerik */}
            <div>
              <h5 className="text-sm font-bold text-white leading-snug tracking-tight">
                {title}
              </h5>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed whitespace-pre-wrap break-words">
                {body}
              </p>
            </div>

            {/* Ekli Görsel */}
            {imageUrl && (
              <div className="rounded-xl overflow-hidden border border-white/10 max-h-32 bg-black/40">
                <img src={imageUrl} alt="Bildirim Görseli" className="w-full h-32 object-cover" />
              </div>
            )}

            {/* Butonlar */}
            {ackState ? (
              <div className="py-2 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 animate-in fade-in">
                <CheckCircle size={14} />
                <span>Yanıtınız İletildi!</span>
              </div>
            ) : (
              <div className="space-y-2 pt-1 border-t border-white/5">
                {/* 1. Hedef Sayfaya Gitme Butonu (Eğer seçilmişse) */}
                {(buttonMode === 'nav' || buttonMode === 'both') && targetTab && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onAction) onAction(targetTab);
                      onClose();
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <ActionIcon size={13} className="text-indigo-300" />
                    <span>{actionLabel}</span>
                    <ExternalLink size={11} className="opacity-60 ml-0.5" />
                  </button>
                )}

                {/* 2. İki Yönlü Onay Butonları (Eğer seçilmişse) */}
                {(buttonMode === 'ack' || buttonMode === 'both') && notificationId && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setAckState('approved');
                        if (onAcknowledge) await onAcknowledge(notificationId, 'approved');
                      }}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/35 text-emerald-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <CheckCircle size={13} />
                      <span>Onayladım</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setAckState('rejected');
                        if (onAcknowledge) await onAcknowledge(notificationId, 'rejected');
                      }}
                      className="py-2 px-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <XCircle size={13} />
                      <span>Sorun Var</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* İlerleme Çubuğu */}
          <div className="h-0.5 w-full bg-white/5">
            <motion.div
              className={`h-full ${isSos ? 'bg-red-500/80' : 'bg-indigo-500/60'}`}
              style={{ width: `${progress}%` }}
              transition={{ ease: 'linear' }}
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

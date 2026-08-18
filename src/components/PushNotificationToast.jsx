import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CheckCircle, XCircle, Navigation, ExternalLink,
  MapPin, Truck, Fuel, FileText, Wrench, AlertTriangle,
  Receipt, CreditCard, MessageSquare, Flame, Check, HelpCircle
} from 'lucide-react';

const ICON_MAP = {
  check: CheckCircle,
  thumbs_up: Check,
  x: XCircle,
  alert: AlertTriangle,
  map_pin: MapPin,
  truck: Truck,
  fuel: Fuel,
  file: FileText,
  wrench: Wrench,
  message: MessageSquare,
  credit_card: CreditCard,
  sos: Flame,
  default: Navigation
};

export default function PushNotificationToast({ notification, onClose, onAction, onAcknowledge }) {
  const [isPaused, setIsPaused] = useState(false);
  const [ackFeedback, setAckFeedback] = useState(null);

  useEffect(() => {
    if (!notification) {
      setAckFeedback(null);
      return;
    }
    setAckFeedback(null);

    // Otomatik kapanma: 10 saniye (Kullanıcı üzerine geldiğinde duraklar)
    const DURATION = 10000;
    const timer = setTimeout(() => {
      if (!isPaused) {
        onClose();
      }
    }, DURATION);

    return () => clearTimeout(timer);
  }, [notification, isPaused]);

  if (!notification) return null;

  const title = notification.title || 'İnaner Lojistik Duyuru';
  const body = notification.body || '';
  const imageUrl = notification.imageUrl || notification.data?.imageUrl || null;
  const notificationId = notification.data?.notificationId || null;

  // Özel dinamik butonları parse et
  let customButtons = [];
  try {
    if (notification.data?.buttons) {
      customButtons = typeof notification.data.buttons === 'string' 
        ? JSON.parse(notification.data.buttons) 
        : notification.data.buttons;
    } else if (notification.buttons) {
      customButtons = notification.buttons;
    }
  } catch {
    customButtons = [];
  }

  // Eğer legacy format varsa geriye dönük uyumluluk
  if (!customButtons || customButtons.length === 0) {
    const buttonMode = notification.data?.buttonMode;
    const targetTab = notification.data?.targetTab;
    const customNavLabel = notification.data?.customNavLabel;

    if (buttonMode === 'ack' || buttonMode === 'both' || notification.data?.requireAck === 'true') {
      customButtons.push({
        id: 'btn_ack_approved',
        label: 'Onayladım',
        icon: 'check',
        actionType: 'ack_approved',
        style: 'emerald'
      });
      customButtons.push({
        id: 'btn_ack_rejected',
        label: 'Sorun Var',
        icon: 'x',
        actionType: 'ack_rejected',
        style: 'red'
      });
    }

    if ((buttonMode === 'nav' || buttonMode === 'both') && targetTab) {
      customButtons.unshift({
        id: `btn_nav_${targetTab}`,
        label: customNavLabel || 'Sayfayı Aç',
        icon: 'map_pin',
        actionType: 'navigate',
        targetTab: targetTab,
        style: 'indigo'
      });
    }
  }

  const handleButtonClick = async (btn) => {
    if (btn.actionType === 'ack_approved' || btn.actionType === 'ack:approved') {
      setAckFeedback('Onayınız İletildi');
      if (onAcknowledge && notificationId) {
        await onAcknowledge(notificationId, 'approved');
      }
      setTimeout(() => onClose(), 1500);
    } else if (btn.actionType === 'ack_rejected' || btn.actionType === 'ack:rejected') {
      setAckFeedback('Sorun Bildirimi İletildi');
      if (onAcknowledge && notificationId) {
        const note = prompt('Karşılaştığınız sorunu kısaca yazın (Opsiyonel):') || '';
        await onAcknowledge(notificationId, 'rejected', note);
      }
      setTimeout(() => onClose(), 1500);
    } else if (btn.actionType === 'navigate' || btn.targetTab) {
      const tab = btn.targetTab || notification.data?.targetTab;
      if (onAction && tab) {
        onAction(tab);
      }
      onClose();
    } else if (btn.actionType === 'link' && btn.url) {
      window.open(btn.url, '_blank');
      onClose();
    } else {
      onClose();
    }
  };

  const getButtonStyle = (style) => {
    switch (style) {
      case 'emerald':
        return 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300';
      case 'red':
        return 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-300';
      case 'indigo':
        return 'bg-indigo-500/20 hover:bg-indigo-500/35 border-indigo-500/35 text-indigo-200';
      case 'amber':
        return 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-300';
      default:
        return 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300';
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed top-4 right-4 left-4 sm:left-auto sm:right-6 z-[99999] pointer-events-none flex justify-center sm:justify-end">
        <motion.div
          initial={{ y: -40, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -20, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          className="pointer-events-auto w-full max-w-[340px] rounded-2xl bg-[#090d16]/95 border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl p-3.5 space-y-2.5 transition-all select-none"
        >
          {/* Üst Başlık Satırı */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <img src="/tir-clear.png" alt="İnaner Logo" className="w-5 h-5 object-contain flex-shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] font-bold tracking-tight text-white/90 truncate">
                  İnaner Lojistik
                </span>
                <span className="text-[10px] text-slate-500">·</span>
                <span className="text-[10px] text-slate-400">Şimdi</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          {/* İçerik */}
          <div className="space-y-1">
            <h5 className="text-[13px] font-bold text-white leading-snug">
              {title}
            </h5>
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
              {body}
            </p>
          </div>

          {/* Ekli Görsel */}
          {imageUrl && (
            <div className="rounded-xl overflow-hidden border border-white/10 max-h-32 bg-black/40">
              <img src={imageUrl} alt="Görsel" className="w-full h-32 object-cover" />
            </div>
          )}

          {/* Geri Bildirim veya Özel Butonlar */}
          {ackFeedback ? (
            <div className="py-2 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 animate-in fade-in">
              <CheckCircle size={14} />
              <span>{ackFeedback}</span>
            </div>
          ) : customButtons.length > 0 ? (
            <div className={`pt-1.5 border-t border-white/5 grid gap-1.5 ${
              customButtons.length === 1 ? 'grid-cols-1' :
              customButtons.length === 2 ? 'grid-cols-2' :
              'grid-cols-2'
            }`}>
              {customButtons.map((btn, idx) => {
                const IconComponent = ICON_MAP[btn.icon] || ICON_MAP.default;
                return (
                  <button
                    key={btn.id || idx}
                    type="button"
                    onClick={() => handleButtonClick(btn)}
                    className={`py-1.5 px-2.5 rounded-xl border text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer ${getButtonStyle(btn.style)}`}
                  >
                    <IconComponent size={13} className="flex-shrink-0" />
                    <span className="truncate">{btn.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

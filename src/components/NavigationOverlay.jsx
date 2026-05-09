import { motion, AnimatePresence } from 'framer-motion';
import { Navigation, X, Locate, Gauge } from 'lucide-react';

export default function NavigationOverlay({ 
    activeSession, 
    userLocation, 
    isFollowing,
    totalPoints,
    coveredPoints,
    onClose,
    onRecenter
}) {
    if (!activeSession) return null;

    // FIX #1: navigator.geolocation speed is m/s → convert to km/h
    const speedKmh = userLocation ? Math.round((userLocation.speed || 0) * 3.6) : 0;

    // FIX #14: Calculate real progress
    const progress = totalPoints > 0 ? Math.round((coveredPoints / totalPoints) * 100) : 0;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ y: '120%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '120%', opacity: 0 }}
                transition={{ type: "spring", damping: 28, stiffness: 220 }}
                className="absolute bottom-5 left-4 right-4 z-[2000] sm:left-auto sm:right-5 sm:w-80 pointer-events-auto"
            >
                <div className="bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
                    <div className="h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" />

                    <div className="p-4">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-indigo-500/20 rounded-xl">
                                    <Navigation size={16} className="text-indigo-400" fill="currentColor" />
                                </div>
                                <div>
                                    <div className="text-white font-semibold text-sm leading-tight">Navigasyon Modu</div>
                                    <div className="text-slate-400 text-xs mt-0.5 truncate max-w-[140px]">
                                        {activeSession[0]?.driverId || 'Bilinmeyen'}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {/* FIX: Recenter / Snap button with visual state */}
                                <motion.button
                                    whileTap={{ scale: 0.85 }}
                                    onClick={onRecenter}
                                    title={isFollowing ? 'Takip aktif' : 'Konuma Sabitle'}
                                    className={`p-2 rounded-xl transition-all ${
                                        isFollowing 
                                        ? 'bg-indigo-500/30 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.5)]' 
                                        : 'bg-slate-700/50 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    <Locate size={16} />
                                </motion.button>
                                <button 
                                    onClick={onClose}
                                    className="p-2 text-slate-500 hover:text-red-400 bg-slate-800/50 rounded-xl transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* FIX #1: Speed display with correct km/h label */}
                        <div className="flex items-stretch gap-3">
                            <div className="flex flex-col items-center justify-center bg-slate-800/60 border border-slate-700/40 rounded-2xl px-6 py-4 flex-1">
                                <div className="flex items-end gap-1.5">
                                    <Gauge size={16} className="text-sky-400 mb-1.5" />
                                    <span className="text-white font-bold text-4xl tabular-nums leading-none">{speedKmh}</span>
                                </div>
                                {/* FIX #1: km/s → km/h */}
                                <span className="text-slate-400 text-xs mt-1.5">km/h</span>
                            </div>

                            <div className="flex flex-col items-center justify-center bg-slate-800/60 border border-slate-700/40 rounded-2xl px-4 py-4 min-w-[80px]">
                                <span className="text-2xl">{isFollowing ? '🔒' : '🔓'}</span>
                                <span className={`text-xs mt-1.5 font-medium ${isFollowing ? 'text-indigo-400' : 'text-slate-500'}`}>
                                    {isFollowing ? 'Sabitli' : 'Serbest'}
                                </span>
                            </div>
                        </div>

                        {/* FIX #14: Real progress bar */}
                        <div className="mt-4">
                            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                                <span>Rota</span>
                                <span className="text-indigo-400 font-medium">%{progress}</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.6)]"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 0.5 }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

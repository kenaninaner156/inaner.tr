import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation, X, Clock, MapPin, Zap } from 'lucide-react';

export default function NavigationOverlay({ 
    activeSession, 
    userLocation, 
    onClose 
}) {
    if (!activeSession) return null;

    // Hesaplamalar (Örnek)
    const speed = userLocation ? Math.round(userLocation.speed || 0) : 0;
    const distance = '24 km'; // Geolocation math ile eklenebilir
    const eta = '28 dk';

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="absolute bottom-4 left-4 right-4 z-[2000] sm:left-auto sm:right-4 sm:w-96"
            >
                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden relative">
                    {/* Glass gradient background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 pointer-events-none" />
                    
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div>
                            <h3 className="text-white font-bold text-xl flex items-center gap-2">
                                <span className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
                                    <Navigation size={20} fill="currentColor" />
                                </span>
                                Navigasyon
                            </h3>
                            <p className="text-slate-400 text-sm mt-1">
                                {activeSession[0]?.driverId || 'Bilinmeyen'} - Rota Takibi
                            </p>
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-red-500/20 hover:text-red-400 rounded-full transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3 relative z-10">
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-3 flex flex-col items-center justify-center">
                            <Clock size={18} className="text-sky-400 mb-1" />
                            <span className="text-white font-bold text-lg">{eta}</span>
                            <span className="text-slate-400 text-xs">Tahmini</span>
                        </div>
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-3 flex flex-col items-center justify-center">
                            <MapPin size={18} className="text-emerald-400 mb-1" />
                            <span className="text-white font-bold text-lg">{distance}</span>
                            <span className="text-slate-400 text-xs">Mesafe</span>
                        </div>
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-3 flex flex-col items-center justify-center">
                            <Zap size={18} className="text-amber-400 mb-1" />
                            <span className="text-white font-bold text-lg">{speed}</span>
                            <span className="text-slate-400 text-xs">km/s</span>
                        </div>
                    </div>
                    
                    {/* Fake Progress Bar */}
                    <div className="mt-5 relative z-10">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>İlerleme</span>
                            <span>%45</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 w-[45%] rounded-full shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

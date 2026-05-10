import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import MapLayout from './map/MapLayout';

const MapPage = () => {
    const [isMapLaunched, setIsMapLaunched] = useState(false);

    return (
        <div className="w-full h-full relative" style={{ minHeight: 'calc(100vh - 120px)' }}>
            <AnimatePresence mode="wait">
                {!isMapLaunched ? (
                    <motion.div
                        key="landing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                        transition={{ duration: 0.6 }}
                        className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-[url('/map-landing-bg.png')] bg-center bg-cover bg-no-repeat"
                    >
                        {/* Premium Overlay */}
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-0"></div>
                        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 z-0"></div>
                        
                        <div className="relative z-10 flex flex-col items-center">
                            <motion.button 
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setIsMapLaunched(true)}
                                className="group flex items-center justify-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-xl text-white border border-white/20 px-14 py-5 rounded-2xl font-bold text-xl transition-all duration-500 shadow-[0_20px_50px_rgba(0,0,0,0.3)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.5)] transform outline-none"
                            >
                                <span>Harita Uygulamasına Gir</span>
                                <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform opacity-70" />
                            </motion.button>
                        </div>

                    </motion.div>
                ) : (
                    <motion.div
                        key="map"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="w-full h-full absolute inset-0"
                    >
                        <MapLayout />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default MapPage;

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import MapLayout from './map/MapLayout';

const MapPage = () => {
    const [isMapLaunched, setIsMapLaunched] = useState(false);
    const [isMapReady, setIsMapReady] = useState(false);

    return (
        <div className="w-full h-full relative" style={{ minHeight: 'calc(100vh - 120px)' }}>
            <AnimatePresence mode="wait">
                {!isMapReady ? (
                    <motion.div
                        key="landing"
                        initial={{ opacity: 0, scale: 1.05 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.05 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="absolute -inset-x-4 -inset-y-4 md:-inset-x-6 md:-inset-y-6 xl:-inset-x-8 xl:-inset-y-8 flex flex-col items-center justify-center p-6 bg-[url('/ankara_midnight_blue_v3.png')] bg-center bg-cover bg-no-repeat z-10"
                    >
                        {/* Premium Subtle Glow with transparency to show image */}
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#c99c37]/10 via-[#0B0E14]/40 to-[#0B0E14]/90 z-0"></div>
                        
                        <div className="relative z-10 w-full flex flex-col items-center px-6 -translate-y-12">
                            {/* Full Text Logo Above Button with Icon */}
                            <motion.div
                                initial={{ opacity: 0, scale: 1.3, filter: "blur(20px) brightness(0.1)", rotate: 0 }}
                                animate={{ opacity: 1, scale: 1, filter: "blur(0px) brightness(1)", rotate: -8 }}
                                exit={{ 
                                    opacity: 0, 
                                    scale: 0.9,
                                    y: -60,
                                    filter: "blur(12px)"
                                }}
                                transition={{ 
                                    duration: 0.45, 
                                    ease: "easeOut",
                                    exit: { duration: 0.6, ease: "easeInOut" }
                                }}
                                className="mb-12 flex flex-col items-center relative"
                                style={{ 
                                    fontFamily: "'Montserrat', sans-serif"
                                }}
                            >
                                {/* Unified Ambient Shadow */}
                                <div className="absolute inset-0 -inset-x-32 -inset-y-20 bg-black/60 blur-[160px] rounded-full -z-10" />

                                {/* Circular Icon Enlarged */}
                                <div className="mb-6 w-24 h-24 md:w-32 md:h-32 relative z-10">
                                    <img 
                                        src="/yenı logo 111.png" 
                                        alt="Icon" 
                                        className="w-full h-full object-contain" 
                                    />
                                </div>

                                <div className="flex items-baseline font-bold italic tracking-tighter text-4xl md:text-6xl text-white relative z-10">
                                    <span>İNANER.</span>
                                    <span className="text-[#c99c37] ml-2">TR</span>
                                </div>
                                <div className="mt-1 relative z-10">
                                    <span className="text-[#c99c37] text-sm md:text-lg font-bold italic uppercase tracking-[0.4em] ml-2">
                                        LOJİSTİK
                                    </span>
                                </div>
                            </motion.div>

                            <motion.button 
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15, duration: 0.4, ease: "easeOut" }}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                exit={{ opacity: 0, y: 40, filter: "blur(10px)" }}
                                onClick={() => setIsMapLaunched(true)}
                                className="group flex items-center justify-center gap-4 bg-[#c99c37]/5 hover:bg-[#c99c37]/10 backdrop-blur-md text-amber-50 border border-[#c99c37]/60 px-14 py-5 rounded-2xl font-bold text-xl transition-all duration-500 shadow-[0_40px_120px_15px_rgba(0,0,0,0.8)] hover:shadow-[0_30px_100px_rgba(201,156,55,0.1)] transform outline-none"
                                disabled={isMapLaunched}
                            >
                                <div className="flex overflow-hidden">
                                    {(isMapLaunched ? 'Harita Hazırlanıyor' : 'Harita Uygulamasına Gir').split('').map((char, i) => (
                                        <motion.span
                                            key={i}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ 
                                                delay: 0.3 + (i * 0.01), 
                                                duration: 0.2,
                                                ease: "easeOut"
                                            }}
                                            className="inline-block"
                                            style={{ whiteSpace: 'pre' }}
                                        >
                                            {char}
                                        </motion.span>
                                    ))}
                                </div>
                                {isMapLaunched ? (
                                    <div className="w-5 h-5 border-2 border-[#c99c37]/30 border-t-[#c99c37] rounded-full animate-spin" />
                                ) : (
                                    <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform opacity-70" />
                                )}
                            </motion.button>
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            {isMapLaunched && (
                <motion.div
                    key="map"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: isMapReady ? 1 : 0, scale: isMapReady ? 1 : 0.98 }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full h-full absolute inset-0 z-0"
                >
                    <MapLayout onReady={() => setIsMapReady(true)} />
                </motion.div>
            )}
        </div>
    );
};

export default MapPage;

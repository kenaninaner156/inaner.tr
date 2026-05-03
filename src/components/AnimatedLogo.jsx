import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function AnimatedLogo() {
  const [key, setKey] = useState(0); // Used to re-trigger animation on click

  const containerVariants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.05, delayChildren: 0.3 }
    }
  };

  const letterVariants = {
    hidden: { y: 20, opacity: 0, scale: 0.95 },
    visible: { 
      y: 0, 
      opacity: 1,
      scale: 1,
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } 
    }
  };

  return (
    <div className="mb-2" onClick={() => setKey(prev => prev + 1)}>
      {/* Injecting Montserrat dynamically for that ultra-premium, wide tech look */}
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;900&display=swap');`}
      </style>
      
      <div className="h-16 flex items-center px-4 bg-gradient-to-r from-white/[0.03] to-transparent backdrop-blur-xl rounded-[18px] border border-white/5 hover:border-amber-500/30 transition-all duration-500 shadow-lg shadow-black/50 relative overflow-hidden group cursor-pointer" key={key}>
        
        {/* Glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        
        <div className="flex items-center gap-3 relative z-10 w-full">
          
          {/* 1. Small Iconic Logo (Geometric Logistics Box) */}
          <motion.div 
            initial={{ scale: 0, rotate: -90, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
            className="w-10 h-10 shrink-0 rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.4)] overflow-hidden relative group/icon"
          >
             {/* Flash effect on hover */}
             <div className="absolute inset-0 bg-white/30 translate-y-full group-hover/icon:translate-y-0 transition-transform duration-300" />
             
             {/* Iconic Package/Hexagon SVG */}
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px] text-[#0a0a0c] relative z-10 group-hover/icon:scale-110 group-hover/icon:rotate-3 transition-transform duration-300 drop-shadow-sm">
               <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
               <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
               <line x1="12" y1="22.08" x2="12" y2="12" />
             </svg>
          </motion.div>

          {/* 2. Sweeping line for Uber-style text reveal */}
          <motion.div
            className="absolute left-[54px] top-[75%] h-[2px] bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.8)] z-20"
            initial={{ width: 0, opacity: 0 }}
            animate={{ 
              width: ["0px", "60px", "0px"],
              opacity: [0, 1, 1, 0],
              left: ["54px", "54px", "90%"] 
            }}
            transition={{ 
              duration: 1.2, 
              times: [0, 0.4, 0.8, 1], 
              ease: [0.65, 0, 0.35, 1],
              delay: 0.2
            }}
          />

          {/* 3. Text Area with Custom Montserrat Font */}
          <div className="overflow-hidden pb-1 pt-1 relative z-10 flex-1">
            <motion.div 
              className="flex items-baseline tracking-[0.05em] uppercase"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {/* İNANER. */}
              <div className="flex text-[21px] font-[900]">
                {"İNANER.".split('').map((char, i) => (
                  <motion.span
                    key={`w-${i}`}
                    variants={letterVariants}
                    className="text-slate-100 drop-shadow-sm inline-block cursor-crosshair transition-colors duration-200"
                    whileHover={{ 
                      color: "#f59e0b", // Turns Amber on hover
                      scale: 1.15, 
                      y: -3,
                      textShadow: "0px 0px 12px rgba(245,158,11,0.6)",
                      transition: { duration: 0.1 } 
                    }}
                  >
                    {char}
                  </motion.span>
                ))}
              </div>
              
              {/* TR */}
              <div className="flex text-[21px] font-[300] ml-[2px]">
                {"TR".split('').map((char, i) => (
                  <motion.span
                    key={`o-${i}`}
                    variants={letterVariants}
                    className="text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)] inline-block cursor-crosshair transition-colors duration-200"
                    whileHover={{ 
                      color: "#ffffff", // Turns White on hover
                      scale: 1.15,
                      y: -3,
                      textShadow: "0px 0px 12px rgba(255,255,255,0.8)",
                      transition: { duration: 0.1 } 
                    }}
                  >
                    {char}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          </div>
          
        </div>
      </div>
    </div>
  );
}

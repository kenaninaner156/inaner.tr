import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Menü sekmelerinin tema renkleri sırasıyla
const THEME_COLORS = [
  "#8b5cf6", // 0: Özet (Violet)
  "#0ea5e9", // 1: Seferler (Sky)
  "#06b6d4", // 2: Mazot Fişleri (Cyan)
  "#f59e0b", // 3: Araç Bakım (Amber)
  "#ef4444", // 4: Ceza & Belgeler (Red)
  "#2563eb", // 5: Fatura Durumu (Royal Blue)
  "#d946ef", // 6: SaaS Yönetimi (Fuchsia)
  "#22c55e", // 7: Ödeme Takibi (Green)
  "#6366f1", // 8: Şirket Yönetimi (Indigo)
];

export default function PremiumLogo() {
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIntroDone(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const currentWord1 = "İNANER.";
  const currentWord2 = "TR";
  const subText = "LOJİSTİK";

  // İlk kelime harfleri için
  const letterHoverVariants = {
    initial: { y: 15, opacity: 0 },
    intro: (i) => ({
      y: [15, -10, 0],
      opacity: [0, 1, 1],
      color: ["var(--text-primary)", THEME_COLORS[i % THEME_COLORS.length], "var(--text-primary)"],
      textShadow: [
        "0px 0px 0px rgba(0,0,0,0)", 
        `0px 10px 20px ${THEME_COLORS[i % THEME_COLORS.length]}80`, 
        "0px 0px 0px rgba(0,0,0,0)"
      ],
      transition: { 
        duration: 0.8, 
        delay: i * 0.08 + 0.2, 
        ease: "easeInOut"
      }
    }),
    idle: { y: 0, opacity: 1, color: "var(--text-primary)", textShadow: "0px 0px 0px rgba(0,0,0,0)" },
    hover: (i) => ({ 
      y: -5, 
      color: THEME_COLORS[i % THEME_COLORS.length],
      textShadow: `0px 6px 10px ${THEME_COLORS[i % THEME_COLORS.length]}80`,
      transition: { type: "spring", stiffness: 500, damping: 15 } 
    })
  };
  
  // İkinci kelime (Renkli kısımlar) için
  const trHoverVariants = {
    initial: { y: 15, opacity: 0 },
    intro: (i) => ({
      y: [15, -10, 0],
      opacity: [0, 1, 1],
      color: ["#f59e0b", THEME_COLORS[i % THEME_COLORS.length], "#f59e0b"],
      textShadow: [
        "0px 0px 0px rgba(0,0,0,0)", 
        `0px 10px 20px ${THEME_COLORS[i % THEME_COLORS.length]}80`, 
        "0px 0px 0px rgba(0,0,0,0)"
      ],
      transition: { 
        duration: 0.8, 
        delay: i * 0.08 + 0.2, 
        ease: "easeInOut"
      }
    }),
    idle: { y: 0, opacity: 1, color: "#f59e0b", textShadow: "0px 0px 0px rgba(0,0,0,0)" },
    hover: (i) => ({ 
      y: -5, 
      color: THEME_COLORS[i % THEME_COLORS.length], 
      textShadow: `0px 6px 10px ${THEME_COLORS[i % THEME_COLORS.length]}80`,
      transition: { type: "spring", stiffness: 500, damping: 15 }
    })
  };

  return (
    <div 
      className="flex items-center select-none relative z-20 w-full" 
    >
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600;1,700;1,800&display=swap');`}
      </style>
      
      {/* ── Logo İkonu ── */}
      <div 
        className="absolute left-[32px] w-[38px] h-[38px] flex-shrink-0"
      >
        <img 
          src="/yenı logo 111.png" 
          alt="İnaner TR Logo" 
          className="w-full h-full object-contain"
          draggable={false}
        />
      </div>

      {/* ── Yazı Alanı ── */}
      <motion.div 
        key="normal"
        initial={{ opacity: 0, y: 15, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.3 }}
        className="flex flex-col relative z-20 pl-[82px]"
      >
        
        <div className="flex items-baseline z-20" style={{ fontFamily: "'Montserrat', sans-serif" }}>
          
          {/* Kelime 1 (İNANER) */}
          <div className="flex z-20">
            {currentWord1.split('').map((char, index) => (
              <motion.span
                key={`w1-${char}-${index}`}
                custom={index}
                variants={letterHoverVariants}
                initial="initial"
                animate={introDone ? "idle" : "intro"}
                whileHover={introDone ? "hover" : ""}
                className="text-[22px] font-bold italic tracking-tight drop-shadow-sm px-[0.5px] inline-block z-20"
                style={{ color: "var(--text-primary)" }}
              >
                {char}
              </motion.span>
            ))}
          </div>

          {/* Kelime 2 (TR) */}
          <div className="flex ml-1 z-20">
            {currentWord2.split('').map((char, index) => (
              <motion.span
                key={`w2-${char}-${index}`}
                custom={index + currentWord1.length}
                variants={trHoverVariants}
                initial="initial"
                animate={introDone ? "idle" : "intro"}
                whileHover={introDone ? "hover" : ""}
                className="text-[22px] font-bold italic tracking-tight drop-shadow-sm px-[0.5px] inline-block z-20"
                style={{ color: "#f59e0b" }}
              >
                {char}
              </motion.span>
            ))}
          </div>

        </div>
        
        {/* Zemin (LOJİSTİK) */}
        <div className="relative z-10 mt-[-10px]">
          <span className="text-[9.5px] text-amber-500 font-bold italic uppercase tracking-[0.3em] ml-1">
            {subText}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

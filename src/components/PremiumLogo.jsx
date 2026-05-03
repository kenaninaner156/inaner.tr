import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Menü sekmelerinin tema renkleri sırasıyla
const THEME_COLORS = [
  "#8b5cf6", // 0: Özet (Violet)
  "#0ea5e9", // 1: Seferler (Sky)
  "#06b6d4", // 2: Mazot Fişleri (Cyan)
  "#f59e0b", // 3: Araç Bakım (Amber)
  "#ef4444", // 4: Ceza & Belgeler (Red)
  "#10b981", // 5: Fatura Durumu (Emerald)
  "#d946ef", // 6: SaaS Yönetimi (Fuchsia)
  "#22c55e", // 7: Ödeme Takibi (Green)
  "#6366f1", // 8: Şirket Yönetimi (Indigo)
];

export default function PremiumLogo() {
  const [isDraggable, setIsDraggable] = useState(false);
  const [hoverCount, setHoverCount] = useState(0);
  const [isEasterEgg, setIsEasterEgg] = useState(false);
  const [resetClicks, setResetClicks] = useState(0);

  // Çift tıklama ile koparılabilir (draggable) modu aç/kapat
  const toggleDraggable = () => {
    setIsDraggable(!isDraggable);
  };

  const handleHover = (char) => {
    if (isEasterEgg) return;
    
    // Sadece 'A' harfi tetikler
    if (char === 'A') {
      setHoverCount(prev => {
        if (prev + 1 >= 15) { 
          setIsEasterEgg(true);
          return 0;
        }
        return prev + 1;
      });
    }
  };

  const handleLogoClick = () => {
    if (isEasterEgg) {
      setResetClicks(prev => {
        if (prev + 1 >= 2) { // 3. tıklamada (0 -> 1 -> 2 -> tetik)
          setIsEasterEgg(false);
          return 0;
        }
        return prev + 1;
      });
    }
  };

  const currentWord1 = isEasterEgg ? "TAMAM" : "İNANER.";
  const currentWord2 = isEasterEgg ? ".DA" : "TR";
  const subText = isEasterEgg ? "AMINAKOYUM" : "LOJİSTİK";

  // İlk kelime harfleri için
  const letterHoverVariants = {
    initial: { y: 0, x: 0, rotate: 0, scale: 1, color: "#f1f5f9", textShadow: "0px 0px 0px rgba(0,0,0,0)" },
    hover: (i) => ({ 
      y: -5, 
      color: THEME_COLORS[i % THEME_COLORS.length],
      textShadow: `0px 6px 10px ${THEME_COLORS[i % THEME_COLORS.length]}80`,
      transition: { type: "spring", stiffness: 500, damping: 15 } 
    }),
    dragReady: {
      scale: 1,
      color: "#f1f5f9",
      textShadow: "0px 0px 0px rgba(0,0,0,0)"
    },
    dragHover: {
      scale: 1.2,
      cursor: "grab",
      textShadow: "0px 8px 15px rgba(0,0,0,0.5)",
      transition: { type: "spring", stiffness: 400, damping: 10 }
    }
  };
  
  // İkinci kelime (Renkli kısımlar) için
  const trHoverVariants = {
    initial: { y: 0, x: 0, rotate: 0, scale: 1, color: "#f59e0b", textShadow: "0px 0px 0px rgba(0,0,0,0)" },
    hover: (i) => ({ 
      y: -5, 
      color: THEME_COLORS[i % THEME_COLORS.length], 
      textShadow: `0px 6px 10px ${THEME_COLORS[i % THEME_COLORS.length]}80`,
      transition: { type: "spring", stiffness: 500, damping: 15 }
    }),
    dragReady: {
      scale: 1,
      color: "#f59e0b",
      textShadow: "0px 0px 0px rgba(0,0,0,0)"
    },
    dragHover: {
      scale: 1.2,
      cursor: "grab",
      textShadow: "0px 8px 15px rgba(0,0,0,0.5)",
      transition: { type: "spring", stiffness: 400, damping: 10 }
    }
  };

  return (
    <div 
      className="flex items-center gap-3 select-none ml-[13px] relative z-20" 
      onDoubleClick={toggleDraggable}
      title="Harfleri koparmak/toplamak için çift tıkla"
    >
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600;1,700;1,800&display=swap');`}
      </style>
      
      {/* ── Logo İkonu ── */}
      <div 
        className="relative w-12 h-12 flex-shrink-0 cursor-pointer"
        onClick={handleLogoClick}
        title={isEasterEgg ? "Düzeltmek için tır resmine 3 kez tıkla" : ""}
      >
        <img 
          src="/yenı logo 111.png" 
          alt="İnaner TR Logo" 
          className="w-full h-full object-contain"
          draggable={false}
        />
      </div>

      {/* ── Yazı Alanı ── */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={isEasterEgg ? "easter" : "normal"}
          initial={{ opacity: 0, y: 15, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -15, filter: "blur(4px)" }}
          transition={{ duration: 0.3 }}
          className="flex flex-col relative z-20"
        >
          
          <div className="flex items-baseline z-20" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            
            {/* Kelime 1 (İNANER / TAMAM) */}
            <div className="flex z-20">
              {currentWord1.split('').map((char, index) => (
                <motion.span
                  key={`w1-${char}-${index}`}
                  custom={index}
                  variants={letterHoverVariants}
                  initial="initial"
                  animate={isDraggable ? "dragReady" : "initial"}
                  whileHover={isDraggable ? "dragHover" : "hover"}
                  onHoverStart={() => handleHover(char)}
                  // Sürükleme özellikleri
                  drag={isDraggable}
                  dragMomentum={true}
                  dragElastic={0.2}
                  whileDrag={{ cursor: "grabbing", scale: 1.3, zIndex: 50 }}
                  className="text-[22px] font-bold italic tracking-tight drop-shadow-sm px-[0.5px] inline-block z-20"
                  style={{ touchAction: isDraggable ? "none" : "auto" }}
                >
                  {char}
                </motion.span>
              ))}
            </div>

            {/* Kelime 2 (TR / .DA) */}
            <div className="flex ml-1 z-20">
              {currentWord2.split('').map((char, index) => (
                <motion.span
                  key={`w2-${char}-${index}`}
                  custom={index + currentWord1.length}
                  variants={trHoverVariants}
                  initial="initial"
                  animate={isDraggable ? "dragReady" : "initial"}
                  whileHover={isDraggable ? "dragHover" : "hover"}
                  onHoverStart={() => handleHover(char)}
                  // Sürükleme özellikleri
                  drag={isDraggable}
                  dragMomentum={true}
                  dragElastic={0.2}
                  whileDrag={{ cursor: "grabbing", scale: 1.3, zIndex: 50 }}
                  className="text-[22px] font-bold italic tracking-tight drop-shadow-sm px-[0.5px] inline-block z-20"
                  style={{ touchAction: isDraggable ? "none" : "auto" }}
                >
                  {char}
                </motion.span>
              ))}
            </div>

          </div>
          
          {/* Zemin (LOJİSTİK / AMINAKOYUM) */}
          <div className="relative z-10 mt-[-10px]">
            <span className="text-[9.5px] text-amber-500 font-bold italic uppercase tracking-[0.3em] ml-1">
              {subText}
            </span>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

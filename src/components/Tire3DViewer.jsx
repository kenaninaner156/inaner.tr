import React, { useState, useEffect, Suspense, useRef, useMemo, useContext } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, useGLTF, Environment, ContactShadows, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { db } from '../services/firebaseConfig';
import { doc, updateDoc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { useTruck } from '../context/TruckContext';
import { useCompany } from '../context/CompanyContext';
import { Disc, Calendar, AlertTriangle, CheckCircle, Save, RotateCcw, Info, Sparkles, HelpCircle, Activity, Sliders, X, History, ArrowLeftRight, Pencil, ArrowLeft, Layers, Plus, Minus, Trash2, Truck } from 'lucide-react';
import { DataContext } from '../context/DataContext';

// Error Boundary Bileşeni
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn("3D Loader Error caught by boundary:", error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallbackUI 
          error={this.state.error} 
          onReset={() => {
            this.setState({ hasError: false, error: null });
            if (this.props.onReset) this.props.onReset();
          }}
        />
      );
    }
    return this.props.children;
  }
}

// Gelişmiş Hata Arayüzü
function ErrorFallbackUI({ error, selectedTireId, onSelectTire, tiresData, onReset }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-slate-900/95 text-slate-100 text-center relative z-10 backdrop-blur-md">
      <div className="p-6 bg-red-950/45 border border-red-800/60 rounded-2xl max-w-md shadow-2xl">
        <div className="w-12 h-12 bg-red-900/30 border border-red-700/50 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
          <AlertTriangle size={24} className="text-red-400" />
        </div>
        <h3 className="text-lg font-bold text-red-400 mb-2">3D Modül Hatası</h3>
        <p className="text-sm text-slate-300 mb-4 leading-relaxed">
          3D showroom veya tır modeli yüklenirken bir grafik hatası oluştu. Tarayıcınız WebGL'i desteklemiyor veya ekran kartı sürücünüzün sıfırlanması gerekebilir.
        </p>
        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs text-left overflow-x-auto mb-5 max-h-32 text-red-300 font-mono">
          {error?.message || String(error || 'Bilinmeyen Hata')}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-red-900/20 active:scale-95"
        >
          Sayfayı Yeniden Yükle
        </button>
      </div>
    </div>
  );
}


// X ekseni boyunca hizalanmış (Tır uzunluğu X ekseninde) 12 Lastik Koordinatları
const TIRE_POSITIONS = [
  // Çekici Kafa (6 Lastik)
  { id: 'L1', label: 'Ön Sol (Direksiyon)', group: 'Çekici Kafa', side: 'left', axle: 1, type: 'single', pos3D: [-1.9, -0.15, 0.55] },
  { id: 'R1', label: 'Ön Sağ (Direksiyon)', group: 'Çekici Kafa', side: 'right', axle: 1, type: 'single', pos3D: [-1.9, -0.15, -0.55] },
  
  { id: 'L2_out', label: 'Çeker Sol Dış', group: 'Çekici Kafa', side: 'left', axle: 2, type: 'dual-out', pos3D: [-0.5, -0.15, 0.65] },
  { id: 'L2_in', label: 'Çeker Sol İç', group: 'Çekici Kafa', side: 'left', axle: 2, type: 'dual-in', pos3D: [-0.5, -0.15, 0.45] },
  { id: 'R2_in', label: 'Çeker Sağ İç', group: 'Çekici Kafa', side: 'right', axle: 2, type: 'dual-in', pos3D: [-0.5, -0.15, -0.45] },
  { id: 'R2_out', label: 'Çeker Sağ Dış', group: 'Çekici Kafa', side: 'right', axle: 2, type: 'dual-out', pos3D: [-0.5, -0.15, -0.65] },

  // Dorse / Tanker (6 Lastik)
  { id: 'TL1', label: 'Dorse Sol 1', group: 'Dorse', side: 'left', axle: 3, type: 'single', pos3D: [1.3, -0.15, 0.55] },
  { id: 'TR1', label: 'Dorse Sağ 1', group: 'Dorse', side: 'right', axle: 3, type: 'single', pos3D: [1.3, -0.15, -0.55] },

  { id: 'TL2', label: 'Dorse Sol 2', group: 'Dorse', side: 'left', axle: 4, type: 'single', pos3D: [1.9, -0.15, 0.55] },
  { id: 'TR2', label: 'Dorse Sağ 2', group: 'Dorse', side: 'right', axle: 4, type: 'single', pos3D: [1.9, -0.15, -0.55] },

  { id: 'TL3', label: 'Dorse Sol 3', group: 'Dorse', side: 'left', axle: 5, type: 'single', pos3D: [2.5, -0.15, 0.55] },
  { id: 'TR3', label: 'Dorse Sağ 3', group: 'Dorse', side: 'right', axle: 5, type: 'single', pos3D: [2.5, -0.15, -0.55] }
];

// Şirket Ortak Yedek Lastik Rafı — 2 Kat x 10 Slot = 20 Yedek Lastik Konumu
const RACK_TIRE_POSITIONS = Array.from({ length: 20 }, (_, idx) => {
  const slotNum = idx + 1;
  const isUpperShelf = idx < 10;
  const colIndex = idx % 10;
  const localX = Number(((colIndex - 4.5) * 0.42).toFixed(3));
  const localY = isUpperShelf ? 1.92 : 1.04;
  return {
    id: `SPARE_${slotNum}`,
    slotNumber: slotNum,
    shortLabel: `#${String(slotNum).padStart(2, '0')}`,
    label: `Yedek Lastik #${slotNum} (${isUpperShelf ? 'Üst Raf' : 'Orta Raf'})`,
    group: isUpperShelf ? 'Yedek Raf (Üst Kat)' : 'Yedek Raf (Orta Kat)',
    shelf: isUpperShelf ? 1 : 2,
    colIndex,
    isRack: true,
    type: 'spare',
    localPos: [localX, localY, 0.04],
    pos3D: [Number((9.2 + localX).toFixed(2)), Number((localY - 0.5).toFixed(2)), -6.81]
  };
});

const ALL_TIRE_POSITIONS = [...TIRE_POSITIONS, ...RACK_TIRE_POSITIONS];

const DEFAULT_CALIBRATION = {
  radius: 0.28,
  width: 0.18,
  offsets: {
    L1:     [-0.13, -0.04, -0.02],
    R1:     [-0.13, -0.04,  0.03],
    L2_out: [-0.03, -0.07, -0.08],
    L2_in:  [-0.03, -0.07, -0.03],
    R2_in:  [-0.04, -0.07,  0.04],
    R2_out: [-0.02, -0.05,  0.07],
    TL1:    [ 0.10, -0.07, -0.05],
    TR1:    [ 0.10, -0.07,  0.06],
    TL2:    [-0.03, -0.07, -0.05],
    TR2:    [-0.02, -0.07,  0.06],
    TL3:    [-0.15, -0.07, -0.04],
    TR3:    [-0.15, -0.07,  0.06]
  },
  sizes: {
    R2_in:  { radius: 0.22, width: 0.15 },
    R2_out: { radius: 0.23, width: 0.15 },
    R1:     { radius: 0.27, width: 0.18 },
    TR3:    { radius: 0.24, width: 0.29 },
    TR2:    { radius: 0.24, width: 0.29 },
    TR1:    { radius: 0.24, width: 0.29 },
    L2_in:  { radius: 0.24, width: 0.09 },
    L2_out: { radius: 0.24, width: 0.15 },
    TL1:    { radius: 0.23, width: 0.29 },
    TL2:    { radius: 0.23, width: 0.29 },
    TL3:    { radius: 0.23, width: 0.29 }
  }
};

// Lastik Vurgulama Bileşeni (3D Saydam Kaplama)
function TireOverlay({ tireId, tiresData, calibrationRef, isSelected, onSelectTire }) {
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);

  const tireObj = useMemo(() => TIRE_POSITIONS.find(t => t.id === tireId), [tireId]);
  if (!tireObj) return null;

  // Lastik durum rengini belirle
  const statusColors = { İyi: '#10b981', Orta: '#f59e0b', Kritik: '#ef4444' };
  const status = tiresData?.[tireId]?.status || 'İyi';
  const baseColor = statusColors[status] || '#10b981';

  // Animasyon: Pulsing, yavaş dönme ve konum/ölçek güncelleme
  useFrame((state) => {
    if (meshRef.current) {
      const cal = calibrationRef.current;
      const offsets = cal.offsets?.[tireId] || [0, 0, 0];
      
      // Konum güncellemesi (Zemin koordinatları)
      const x = tireObj.pos3D[0] + offsets[0];
      const y = tireObj.pos3D[1] + offsets[1];
      const z = tireObj.pos3D[2] + offsets[2];
      meshRef.current.position.set(x, y, z);

      // Ölçek güncellemesi (Yarıçap ve genişlik)
      const r = cal.sizes?.[tireId]?.radius ?? cal.radius;
      const w = cal.sizes?.[tireId]?.width ?? cal.width;
      meshRef.current.scale.set(r, w, r);
    }
  });

  return (
    <mesh 
      ref={meshRef}
      rotation={[Math.PI / 2, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelectTire(tireId);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
      visible={isSelected || hovered}
    >
      {/* Base radius = 1, base height = 1. Scale makes it actual radius & width */}
      <cylinderGeometry args={[1, 1, 1, 32, 1, false]} />
      <meshStandardMaterial 
        color={baseColor}
        emissive={baseColor}
        emissiveIntensity={isSelected ? 1.2 : 0.3}
        transparent={true}
        opacity={isSelected ? 0.65 : 0.25}
        depthWrite={true}
        depthTest={true}
        roughness={0.2}
        metalness={0.8}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// 3D Tır Modeli Yükleme ve Arayüz Bileşeni
function TruckModel({ selectedTireId, onSelectTire, tiresData, calibrationRef }) {
  const { scene } = useGLTF('/models/truck.glb');

  // Modeli otomatik merkezle ve 5.5 birim uzunluğa ölçekle
  const { model } = useMemo(() => {
    const cloned = scene.clone();

    // Küçük yardımcı objeleri (örneğin 169 vertexlik dev küre) sahneden temizle
    const toRemove = [];
    cloned.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // PBR Material Enhancement for Environment Harmony
        if (child.material) {
          const oldMat = child.material;

          const processMaterial = (mat) => {
            if (!mat) return mat;
            let newMat = mat.clone();
            const matName = (mat.name || child.name || '').toLowerCase();

            if (mat.isMeshBasicMaterial) {
              newMat = new THREE.MeshStandardMaterial({
                color: mat.color,
                map: mat.map,
                roughness: 0.4,
                metalness: 0.2
              });
            }

            if (matName.includes('glass') || matName.includes('cam') || matName.includes('window')) {
              newMat.roughness = 0.05;
              newMat.metalness = 0.95;
              newMat.transparent = true;
              newMat.opacity = 0.3;
            } else if (matName.includes('chrome') || matName.includes('metal') || matName.includes('rim') || matName.includes('jant') || matName.includes('steel') || matName.includes('krom')) {
              newMat.metalness = 0.95;
              newMat.roughness = 0.15;
            } else if (matName.includes('paint') || matName.includes('body') || matName.includes('gövde') || matName.includes('kabin') || matName.includes('cab') || matName.includes('carpaint') || matName.includes('red') || matName.includes('kırmızı')) {
              newMat.roughness = 0.22;
              newMat.metalness = 0.1;
            } else {
              if (newMat.roughness !== undefined) {
                newMat.roughness = Math.min(newMat.roughness, 0.35);
              }
              if (newMat.metalness !== undefined) {
                newMat.metalness = Math.max(newMat.metalness, 0.3);
              }
            }
            return newMat;
          };

          if (Array.isArray(oldMat)) {
            child.material = oldMat.map(processMaterial);
          } else {
            child.material = processMaterial(oldMat);
          }
        }

        const count = child.geometry.attributes.position.count;
        if (count < 1000) {
          toRemove.push(child);
        }
      }
    });
    toRemove.forEach((child) => {
      if (child.parent) {
        child.parent.remove(child);
      }
    });

    // Dünya matrislerini güncelle ki yerel ölçekler ve konumlar yansısın
    cloned.updateMatrixWorld(true);

    // Sınır kutusunu (Bounding Box) hesapla
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Otomatik ölçek faktörü (Genel uzunluk 5.5 birim)
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = 5.5 / (maxDim || 1);
    cloned.scale.set(scaleFactor, scaleFactor, scaleFactor);

    // Modeli merkezleme
    const posY = -0.6 - (center.y - size.y / 2) * scaleFactor + 0.15;
    cloned.position.set(-center.x * scaleFactor, posY, 0);

    return { model: cloned };
  }, [scene]);

  const [visibleSide, setVisibleSide] = useState('both');

  // O(1) Karmaşıklıkta Kamera Açısı Tabanlı Gizleme
  // Drei'ın occlude (raycast) özelliği 540k vertexli modelde saniyede 12 kez raycast attığı için
  // CPU'yu tıkıyordu. Kamera Z konumuna göre matematiksel filtreleme bu yükü sıfırladı.
  useFrame((state) => {
    const z = state.camera.position.z;
    let newSide = 'both';
    if (z > 0.25) {
      newSide = 'left';
    } else if (z < -0.25) {
      newSide = 'right';
    }
    
    if (newSide !== visibleSide) {
      setVisibleSide(newSide);
    }
  });

  // Model üzerine tıklama tespiti (Raycasting)
  const handleModelClick = (event) => {
    event.stopPropagation();
    const clickPoint = event.point;
    
    console.log("3D Click world point:", clickPoint.toArray().map(v => Number(v.toFixed(2))));

    let minDistance = Infinity;
    let nearestTireId = null;

    TIRE_POSITIONS.forEach((pos) => {
      const tireVec = new THREE.Vector3(...pos.pos3D);
      const dist = clickPoint.distanceTo(tireVec);
      if (dist < minDistance) {
        minDistance = dist;
        nearestTireId = pos.id;
      }
    });

    // Mesafe eşiği (0.65 birim)
    if (minDistance < 0.65) {
      onSelectTire(nearestTireId);
    }
  };

  // Lastik durumuna göre renk ve gölge sınıfları döner
  const getTireColors = (tireId) => {
    const tire = tiresData?.[tireId];
    if (!tire) return {
      dot: 'bg-slate-400 border-slate-350',
      ring: 'bg-slate-400/50'
    };
    if (tire.status === 'Kritik') return {
      dot: 'bg-red-500 border-red-300',
      ring: 'bg-red-500/50'
    };
    if (tire.status === 'Orta') return {
      dot: 'bg-amber-500 border-amber-300',
      ring: 'bg-amber-500/50'
    };
    return {
      dot: 'bg-emerald-500 border-emerald-300',
      ring: 'bg-emerald-500/50'
    };
  };

  return (
    <group>
      {/* 3D Tır modelini yerleştir ve tıklamaları dinle */}
      <primitive 
        object={model} 
        onClick={handleModelClick}
      />

      {/* 12 Lastik Vurgulama Kaplaması (side check ile karşı taraf gizlenir) */}
      {TIRE_POSITIONS.map((pos) => {
        const isSideVisible = visibleSide === 'both' || pos.side === visibleSide;
        if (!isSideVisible) return null;

        return (
          <TireOverlay 
            key={pos.id}
            tireId={pos.id} 
            tiresData={tiresData} 
            calibrationRef={calibrationRef}
            isSelected={selectedTireId === pos.id}
            onSelectTire={onSelectTire}
          />
        );
      })}
    </group>
  );
}

// 3D Canvas için Yükleme Ekranı
function Loader3D() {
  return (
    <Html center>
      <div className="flex flex-col items-center bg-slate-900/90 border border-slate-700 p-6 rounded-2xl shadow-2xl backdrop-blur-md min-w-[200px]">
        <div className="w-10 h-10 border-4 border-fuchsia-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-semibold text-slate-200">3D Model Yükleniyor...</p>
        <span className="text-xs text-slate-400 mt-1">Kaplama ve detaylar çözümleniyor</span>
      </div>
    </Html>
  );
}

// Kırmızı Alet Dolabı ve Diagnostik Terminal (Workshop Toolbox & Diagnostic Laptop)
// Dekoratif Süs Bitkisi
function ShowroomPlant({ position }) {
  return (
    <group position={position}>
      {/* Beyaz Seramik Saksı */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.35, 0.7, 0.35]} />
        <meshStandardMaterial color="#ffffff" roughness={0.1} metalness={0.1} />
      </mesh>
      {/* Toprak */}
      <mesh position={[0, 0.695, 0]}>
        <boxGeometry args={[0.33, 0.02, 0.33]} />
        <meshStandardMaterial color="#1c1917" roughness={0.9} />
      </mesh>
      {/* Yapraklar (Monstera / Ficus Tarzı) */}
      <group position={[0, 0.7, 0]}>
        <mesh position={[0, 0.15, 0.05]} rotation={[0.4, 0, 0.2]} castShadow>
          <boxGeometry args={[0.15, 0.35, 0.01]} />
          <meshStandardMaterial color="#166534" roughness={0.7} />
        </mesh>
        <mesh position={[0.08, 0.2, -0.05]} rotation={[-0.3, 0.5, -0.4]} castShadow>
          <boxGeometry args={[0.12, 0.32, 0.01]} />
          <meshStandardMaterial color="#15803d" roughness={0.75} />
        </mesh>
        <mesh position={[-0.08, 0.25, 0.02]} rotation={[0.2, -0.5, 0.4]} castShadow>
          <boxGeometry args={[0.14, 0.38, 0.01]} />
          <meshStandardMaterial color="#166534" roughness={0.7} />
        </mesh>
        <mesh position={[0.05, 0.3, 0.08]} rotation={[0.5, 0.2, -0.2]} castShadow>
          <boxGeometry args={[0.13, 0.34, 0.01]} />
          <meshStandardMaterial color="#14532d" roughness={0.65} />
        </mesh>
        <mesh position={[-0.05, 0.18, -0.08]} rotation={[-0.4, -0.3, 0.3]} castShadow>
          <boxGeometry args={[0.16, 0.3, 0.01]} />
          <meshStandardMaterial color="#15803d" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.35, -0.02]} rotation={[-0.1, 0, 0.1]} castShadow>
          <boxGeometry args={[0.1, 0.4, 0.01]} />
          <meshStandardMaterial color="#166534" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

// Eames Tarzı Tasarım Koltuk (Taba Deri & Ahşap)
function ShowroomArmchair({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Koltuk Krem Dış Gövde */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.52, 0.04, 0.52]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.42, -0.22]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[0.52, 0.38, 0.04]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.8} />
      </mesh>

      {/* Koltuk Deri Minderler (Taba Deri) */}
      <mesh position={[0, 0.28, -0.02]} castShadow>
        <boxGeometry args={[0.46, 0.05, 0.46]} />
        <meshStandardMaterial color="#78350f" roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.43, -0.19]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[0.46, 0.32, 0.03]} />
        <meshStandardMaterial color="#78350f" roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Kol Dayama Kolları */}
      <mesh position={[-0.27, 0.36, -0.04]} castShadow>
        <boxGeometry args={[0.03, 0.18, 0.38]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.8} />
      </mesh>
      <mesh position={[0.27, 0.36, -0.04]} castShadow>
        <boxGeometry args={[0.03, 0.18, 0.38]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.8} />
      </mesh>

      {/* Kolçak Üst Siyah Kaplaması */}
      <mesh position={[-0.27, 0.455, -0.04]}>
        <boxGeometry args={[0.04, 0.01, 0.4]} />
        <meshStandardMaterial color="#0f172a" roughness={0.7} />
      </mesh>
      <mesh position={[0.27, 0.455, -0.04]}>
        <boxGeometry args={[0.04, 0.01, 0.4]} />
        <meshStandardMaterial color="#0f172a" roughness={0.7} />
      </mesh>

      {/* Ahşap Ayaklar */}
      <mesh position={[-0.18, 0.12, 0.18]} rotation={[0.2, 0, -0.2]} castShadow>
        <cylinderGeometry args={[0.014, 0.008, 0.26, 8]} />
        <meshStandardMaterial color="#b45309" roughness={0.6} />
      </mesh>
      <mesh position={[0.18, 0.12, 0.18]} rotation={[0.2, 0, 0.2]} castShadow>
        <cylinderGeometry args={[0.014, 0.008, 0.26, 8]} />
        <meshStandardMaterial color="#b45309" roughness={0.6} />
      </mesh>
      <mesh position={[-0.18, 0.12, -0.18]} rotation={[-0.2, 0, -0.2]} castShadow>
        <cylinderGeometry args={[0.014, 0.008, 0.26, 8]} />
        <meshStandardMaterial color="#b45309" roughness={0.6} />
      </mesh>
      <mesh position={[0.18, 0.12, -0.18]} rotation={[-0.2, 0, 0.2]} castShadow>
        <cylinderGeometry args={[0.014, 0.008, 0.26, 8]} />
        <meshStandardMaterial color="#b45309" roughness={0.6} />
      </mesh>
      {/* Ayaklar Arası İnce Metal Bağlantı Çubukları */}
      <mesh position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.36, 0.006, 0.006]} />
        <meshStandardMaterial color="#292524" metalness={0.9} />
      </mesh>
      <mesh position={[0, 0.2, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[0.36, 0.006, 0.006]} />
        <meshStandardMaterial color="#292524" metalness={0.9} />
      </mesh>
    </group>
  );
}

// ── CANVAS TEXTURE CREATORS FOR ULTRA HIGH PERFORMANCE (GPU RENDERING, NO LAG, PERFECT DEPTH) ──
const createLogoSignCanvas = (logoImage) => {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  // Zemin: Tam Derin Siyah
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 2048, 512);
  
  // Logo İkonu Çiz
  if (logoImage) {
    ctx.drawImage(logoImage, 120, 56, 400, 400);
  }
  
  // "İNANER.TR" Yazısı - Metin Ölçümü İle Düzgün Yapışık Hizalama
  ctx.font = 'bold 168px Montserrat, Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('İNANER', 560, 280);
  
  const widthInaner = ctx.measureText('İNANER').width;
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('.TR', 560 + widthInaner + 20, 280);
  
  // Alt Metin
  ctx.font = 'bold 44px Montserrat, Arial, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('LOJİSTİK', 570, 390);
  
  const widthLojistik = ctx.measureText('LOJİSTİK').width;
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('telemetry', 570 + widthLojistik + 30, 390);
  
  return canvas;
};

const createPosterCanvas = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  
  // Zemin: Derin Gece Siyahı
  ctx.fillStyle = '#030307';
  ctx.fillRect(0, 0, 1024, 1440);
  
  // Neon Çerçeve
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 10;
  ctx.strokeRect(20, 20, 984, 1400);
  
  // Başlık
  ctx.font = 'bold 72px Montserrat, Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('İNANER.TR', 80, 130);
  
  ctx.font = 'bold 24px Montserrat, Arial, sans-serif';
  ctx.fillStyle = '#d946ef';
  ctx.fillText('ACTIVE FLEET DIAGNOSTICS & SYSTEM PORTAL', 80, 180);
  
  // İnce Yatay Çizgi
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 220);
  ctx.lineTo(944, 220);
  ctx.stroke();

  // Şematik Başlık
  ctx.font = 'bold 28px Montserrat, Arial, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('VEHICLE SYSTEM DIAGNOSTICS SCHEMATIC', 80, 290);

  // Modern Şematik Kasa
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.lineWidth = 4;
  ctx.strokeRect(200, 360, 624, 160);
  
  // Tekerlek Daire Sensörleri
  const drawWheelSensor = (x, y, label, statusColor) => {
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 25, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 6);
    ctx.textAlign = 'left';
  };
  
  drawWheelSensor(260, 520, 'F1', '#10b981');
  drawWheelSensor(380, 520, 'F2', '#10b981');
  drawWheelSensor(640, 520, 'R1', '#f59e0b');
  drawWheelSensor(760, 520, 'R2', '#10b981');

  // Tablo Başlığı
  ctx.font = 'bold 36px Montserrat, Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('REALTIME TELEMETRY FEED', 80, 740);
  
  // Tablo Çizimi
  const startX = 80;
  const startY = 810;
  const colWidths = [240, 200, 200, 220];
  const headers = ['POSITION', 'PRESSURE', 'TEMP', 'WEAR LEVEL'];
  
  ctx.font = 'bold 24px Montserrat, Arial, sans-serif';
  ctx.fillStyle = '#d946ef';
  headers.forEach((h, i) => {
    let xOffset = startX;
    for (let j = 0; j < i; j++) xOffset += colWidths[j];
    ctx.fillText(h, xOffset, startY);
  });
  
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(80, startY + 20);
  ctx.lineTo(944, startY + 20);
  ctx.stroke();
  
  const tableData = [
    { pos: 'Front Left (FL)', press: '120 PSI', temp: '24°C', wear: 0.88, color: '#10b981' },
    { pos: 'Front Right (FR)', press: '119 PSI', temp: '25°C', wear: 0.87, color: '#10b981' },
    { pos: 'Rear Left Out (L1)', press: '115 PSI', temp: '32°C', wear: 0.65, color: '#f59e0b' },
    { pos: 'Rear Right Out (R1)', press: '116 PSI', temp: '28°C', wear: 0.72, color: '#10b981' }
  ];
  
  ctx.font = 'bold 22px monospace';
  tableData.forEach((row, idx) => {
    const rowY = startY + 80 + idx * 70;
    
    ctx.fillStyle = idx % 2 === 0 ? 'rgba(30, 41, 59, 0.3)' : 'rgba(15, 23, 42, 0.3)';
    ctx.fillRect(80, rowY - 35, 864, 55);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillText(row.pos, startX, rowY);
    ctx.fillText(row.press, startX + colWidths[0], rowY);
    
    ctx.fillStyle = row.color;
    ctx.fillText(row.temp, startX + colWidths[0] + colWidths[1], rowY);
    
    const barWidth = 140;
    const barHeight = 16;
    const barX = startX + colWidths[0] + colWidths[1] + colWidths[2];
    const barY = rowY - 14;
    
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    ctx.fillStyle = row.color;
    ctx.fillRect(barX, barY, barWidth * row.wear, barHeight);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(`${Math.round(row.wear * 100)}%`, barX + barWidth + 15, rowY - 1);
    ctx.font = 'bold 22px monospace';
  });
  
  return canvas;
};

const createKioskCanvas = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#020205';
  ctx.fillRect(0, 0, 1024, 640);
  
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, 992, 608);
  
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.fillStyle = '#818cf8';
  ctx.fillText('INANER.TR TELEMETRI TERMINALI', 50, 90);
  
  // Left circle status
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(200, 330, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 8;
  ctx.stroke();
  
  ctx.font = 'bold 52px Arial, sans-serif';
  ctx.fillStyle = '#10b981';
  ctx.fillText('%98.4', 130, 344);
  ctx.font = '20px Arial, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('VERİM', 170, 410);
  
  // Right side bars
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Lastik Basınç Uyumu: %100', 400, 210);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(400, 230, 520, 28);
  ctx.fillStyle = '#10b981';
  ctx.fillRect(400, 230, 520, 28);
  
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Ortalama Diş Derinliği: 14.2 mm', 400, 310);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(400, 330, 520, 28);
  ctx.fillStyle = '#10b981';
  ctx.fillRect(400, 330, 456, 28);
  
  // Button
  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(400, 450, 520, 72);
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('TEŞHİSİ BAŞLAT', 540, 496);
  
  return canvas;
};

const createOfficeMonitorCanvas = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#020205';
  ctx.fillRect(0, 0, 512, 320);
  
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 304);
  
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillStyle = '#10b981';
  ctx.fillText('FLEET ALERT CENTER', 30, 48);
  
  // Alerts
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(30, 76, 452, 44);
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('● 06 FTN 692 (T3) - DÜŞÜK BASINÇ', 44, 104);
  
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(30, 136, 452, 40);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('● 34 GBL 129 - Rotasyon Planı', 44, 162);
  
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(30, 188, 452, 40);
  ctx.fillText('● 06 BCD 451 - Lastik OK', 44, 214);
  
  return canvas;
};

// Sehpa
function ShowroomCoffeeTable({ position }) {
  return (
    <group position={position}>
      {/* Sehpa Ayakları */}
      <mesh position={[-0.4, 0.22, -0.4]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.44]} />
        <meshStandardMaterial color="#1c1917" metalness={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[0.4, 0.22, -0.4]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.44]} />
        <meshStandardMaterial color="#1c1917" metalness={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[-0.4, 0.22, 0.4]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.44]} />
        <meshStandardMaterial color="#1c1917" metalness={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[0.4, 0.22, 0.4]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.44]} />
        <meshStandardMaterial color="#1c1917" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Sehpa Cam Tablası */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.0, 0.02, 1.0]} />
        <meshStandardMaterial color="#1e293b" transparent opacity={0.65} roughness={0.05} metalness={0.9} />
      </mesh>
    </group>
  );
}

// Sehpa Üstü Puf
function ShowroomOttoman({ position }) {
  return (
    <mesh position={position} castShadow>
      <cylinderGeometry args={[0.26, 0.26, 0.38, 16]} />
      <meshStandardMaterial color="#3f3f46" roughness={0.9} />
    </mesh>
  );
}

// İnteraktif Kiosk Terminali (GPU CanvasTexture)
function ShowroomKiosk({ position, rotation }) {
  const canvas = useMemo(() => createKioskCanvas(), []);

  return (
    <group position={position} rotation={rotation}>
      {/* Metal Alt Taban */}
      <mesh position={[0, 0.015, 0]} castShadow>
        <boxGeometry args={[0.5, 0.03, 0.5]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Eğimli Gövde Kolon */}
      <mesh position={[0, 0.45, -0.05]} rotation={[-0.15, 0, 0]} castShadow>
        <boxGeometry args={[0.12, 0.9, 0.16]} />
        <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Arka Kapak Detay */}
      <mesh position={[0, 0.45, -0.135]} rotation={[-0.15, 0, 0]}>
        <boxGeometry args={[0.06, 0.7, 0.01]} />
        <meshStandardMaterial color="#475569" metalness={0.7} />
      </mesh>
      {/* Eğimli Ekran Gövdesi */}
      <mesh position={[0, 0.9, 0.02]} rotation={[-0.55, 0, 0]} castShadow>
        <boxGeometry args={[0.66, 0.42, 0.04]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.1} />
      </mesh>
      {/* Parlayan Dokunmatik Ekran (CanvasTexture) */}
      <mesh position={[0, 0.915, 0.042]} rotation={[-0.55, 0, 0]}>
        <planeGeometry args={[0.6, 0.36]} />
        <meshStandardMaterial 
          roughness={0.1} 
          metalness={0.2}
          emissive="#2a2a35" 
        >
          <canvasTexture attach="map" image={canvas} anisotropy={16} />
          <canvasTexture attach="emissiveMap" image={canvas} anisotropy={16} />
        </meshStandardMaterial>
      </mesh>
    </group>
  );
}

// Şematik Motor / Dorse Posteri (Teknik Bilgi Panosu - GPU CanvasTexture)
function ShowroomPoster({ position }) {
  const canvas = useMemo(() => createPosterCanvas(), []);

  return (
    <group position={position}>
      {/* Dış Metal Çerçeve */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[1.5, 2.1, 0.04]} />
        <meshStandardMaterial color="#27272a" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* İç Şematik Levha (CanvasTexture) */}
      <mesh position={[0, 0, 0.021]}>
        <planeGeometry args={[1.42, 2.02]} />
        <meshStandardMaterial 
          roughness={0.3} 
          metalness={0.05}
          emissive="#111111" 
        >
          <canvasTexture attach="map" image={canvas} anisotropy={16} />
          <canvasTexture attach="emissiveMap" image={canvas} anisotropy={16} />
        </meshStandardMaterial>
      </mesh>
    </group>
  );
}

// Mimari Brüt Beton Duvar
function ConcreteWall({ width, height, position, rotation }) {
  const panelWidth = 4;
  const panelHeight = 2.8;
  const cols = Math.ceil(width / panelWidth);
  const rows = Math.ceil(height / panelHeight);
  
  const panels = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = (c - (cols - 1) / 2) * panelWidth;
      const py = (r - (rows - 1) / 2) * panelHeight;
      panels.push({ x: px, y: py });
    }
  }
  
  return (
    <group position={position} rotation={rotation}>
      {/* Arka Taşıyıcı Duvar Bloku */}
      <mesh receiveShadow>
        <boxGeometry args={[width, height, 0.08]} />
        <meshStandardMaterial color="#8b8580" roughness={0.65} metalness={0.15} />
      </mesh>
      
      {/* Beton Plaka Derzleri ve Delikleri */}
      {panels.map((p, idx) => (
        <group key={idx} position={[p.x, p.y, 0.042]}>
          {/* İçe Çökük Plaka */}
          <mesh receiveShadow>
            <boxGeometry args={[panelWidth - 0.04, panelHeight - 0.04, 0.005]} />
            <meshStandardMaterial color="#8b8580" roughness={0.65} metalness={0.15} />
          </mesh>
          
          {/* 4 Köşedeki Montaj Delikleri (Tie-rod Holes) */}
          {[-panelWidth / 2 + 0.3, panelWidth / 2 - 0.3].map((hx) => 
            [-panelHeight / 2 + 0.3, panelHeight / 2 - 0.3].map((hy) => (
              <mesh key={`${hx}-${hy}`} position={[hx, hy, 0.002]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.024, 0.024, 0.004, 8]} />
                <meshStandardMaterial color="#44403c" roughness={0.8} />
              </mesh>
            ))
          )}
        </group>
      ))}
    </group>
  );
}

// Ahşap Dikey Akustik Çıta Paneli
function WoodSlatPanel({ position, width, height }) {
  const slatWidth = 0.06;
  const slatSpacing = 0.14;
  const slatsCount = Math.floor(width / slatSpacing);
  
  const slats = [];
  for (let i = 0; i < slatsCount; i++) {
    slats.push((i - (slatsCount - 1) / 2) * slatSpacing);
  }
  
  return (
    <group position={position}>
      {/* Siyah Arka Fon */}
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, 0.02]} />
        <meshStandardMaterial color="#1c1917" roughness={0.9} />
      </mesh>
      
      {/* Dikey Meşe Çıtalar */}
      {slats.map((slatX, idx) => (
        <mesh key={idx} position={[slatX, height / 2, 0.02]} castShadow receiveShadow>
          <boxGeometry args={[slatWidth, height, 0.03]} />
          <meshStandardMaterial color="#a16207" roughness={0.5} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

// Endüstriyel Çelik Çatı Makası / Kirişi
function SteelTruss({ length, position, rotation }) {
  const segmentLength = 0.8;
  const segmentsCount = Math.floor(length / segmentLength);
  
  return (
    <group position={position} rotation={rotation}>
      {/* Alt Kiriş Profili */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[length, 0.08, 0.08]} />
        <meshStandardMaterial color="#292524" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Üst Kiriş Profili */}
      <mesh position={[0, 0.16, 0]} castShadow>
        <boxGeometry args={[length, 0.05, 0.05]} />
        <meshStandardMaterial color="#292524" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Çapraz Makas Çubukları */}
      {Array.from({ length: segmentsCount }).map((_, idx) => {
        const x = (idx - segmentsCount / 2) * segmentLength + segmentLength / 2;
        return (
          <group key={idx} position={[x, 0.08, 0]}>
            <mesh rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.22, 0.015, 0.015]} />
              <meshStandardMaterial color="#292524" metalness={0.85} roughness={0.25} />
            </mesh>
            <mesh rotation={[0, 0, -Math.PI / 4]}>
              <boxGeometry args={[0.22, 0.015, 0.015]} />
              <meshStandardMaterial color="#292524" metalness={0.85} roughness={0.25} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// Cam Giriş Cephesi (4. Duvar - Z = 16.5)
function GlassEntranceFacade() {
  const mullionsX = [-16, -12, -8, -4, 0, 4, 8, 12, 16];
  
  return (
    <group position={[0, 0, 16.5]}>
      {/* Şeffaf Cam Levhalar (Sol ve Sağ) */}
      <mesh position={[-9, 2.8, 0]} castShadow receiveShadow>
        <boxGeometry args={[14, 5.6, 0.04]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.05} metalness={0.95} transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[9, 2.8, 0]} castShadow receiveShadow>
        <boxGeometry args={[14, 5.6, 0.04]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.05} metalness={0.95} transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>

      {/* Giriş Kapıları (Çift Cam Sürgülü Kapı) */}
      <mesh position={[-1.0, 2.8, 0.02]} castShadow>
        <boxGeometry args={[1.96, 5.5, 0.03]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.05} metalness={0.95} transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.1, 2.0, 0.05]}>
        <cylinderGeometry args={[0.015, 0.015, 0.8, 8]} />
        <meshStandardMaterial color="#ffffff" metalness={0.95} roughness={0.05} />
      </mesh>
      <mesh position={[1.0, 2.8, 0.02]} castShadow>
        <boxGeometry args={[1.96, 5.5, 0.03]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.05} metalness={0.95} transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.1, 2.0, 0.05]}>
        <cylinderGeometry args={[0.015, 0.015, 0.8, 8]} />
        <meshStandardMaterial color="#ffffff" metalness={0.95} roughness={0.05} />
      </mesh>

      {/* Dikey Metal Çerçeveler */}
      {mullionsX.map((x, idx) => (
        <mesh key={idx} position={[x, 2.8, 0]} castShadow>
          <boxGeometry args={[0.12, 5.6, 0.12]} />
          <meshStandardMaterial color="#1c1917" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}

      {/* Yatay Metal Çerçeveler */}
      {[0.02, 2.8, 5.58].map((y, idx) => (
        <mesh key={idx} position={[0, y, 0]} castShadow>
          <boxGeometry args={[32.12, 0.08, 0.12]} />
          <meshStandardMaterial color="#1c1917" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

// Cam Bölmeli Modern Ofis Odası (Left Wall - X = 14.8)
function ShowroomOffice() {
  return (
    <group>
      {/* Cam Bölmeler */}
      <mesh position={[11.8, 2.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.04, 4.4, 7.0]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.05} metalness={0.9} transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[13.35, 2.2, -3.5]} castShadow receiveShadow>
        <boxGeometry args={[3.1, 4.4, 0.04]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.05} metalness={0.9} transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[13.35, 2.2, 3.5]} castShadow receiveShadow>
        <boxGeometry args={[3.1, 4.4, 0.04]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.05} metalness={0.9} transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>

      {/* Metal Çerçeveler */}
      {[-3.5, 0, 3.5].map((z, idx) => (
        <mesh key={idx} position={[11.8, 2.2, z]} castShadow>
          <boxGeometry args={[0.1, 4.4, 0.1]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[13.35, 4.38, 0]}>
        <boxGeometry args={[3.2, 0.04, 7.1]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Ofis İçi Mobilyalar */}
      {/* Masa */}
      <mesh position={[13.6, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.76, 1.8]} />
        <meshStandardMaterial color="#3f3f46" roughness={0.7} />
      </mesh>
      <mesh position={[13.6, 0.77, 0]} castShadow>
        <boxGeometry args={[0.84, 0.03, 1.84]} />
        <meshStandardMaterial color="#b45309" roughness={0.5} />
      </mesh>

      <OfficeMonitorWithCanvas />

      {/* Ofis Sandalyesi */}
      <group position={[12.6, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[0.38, 0.04, 0.38]} />
          <meshStandardMaterial color="#18181b" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.75, -0.18]} castShadow>
          <boxGeometry args={[0.38, 0.42, 0.04]} />
          <meshStandardMaterial color="#18181b" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.4]} />
          <meshStandardMaterial color="#27272a" metalness={0.9} />
        </mesh>
      </group>

      {/* Ofis Aydınlatması (Cozy Sıcak Işık) */}
      <pointLight position={[13.5, 3.8, 0]} intensity={0.8} distance={8} color="#fef08a" decay={1.5} />
    </group>
  );
}

// Ofis Monitör GPU Ekran Bileşeni
function OfficeMonitorWithCanvas() {
  const canvas = useMemo(() => createOfficeMonitorCanvas(), []);

  return (
    <group position={[13.5, 0.95, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.01, 0.01, 0.3]} />
        <meshStandardMaterial color="#18181b" metalness={0.8} />
      </mesh>
      <mesh position={[0, -0.15, 0]}>
        <boxGeometry args={[0.12, 0.01, 0.12]} />
        <meshStandardMaterial color="#18181b" />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <boxGeometry args={[0.42, 0.28, 0.02]} />
        <meshStandardMaterial color="#1f2937" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.15, 0.012]}>
        <planeGeometry args={[0.38, 0.24]} />
        <meshStandardMaterial 
          roughness={0.2} 
          metalness={0.1}
          emissive="#22222c" 
        >
          <canvasTexture attach="map" image={canvas} anisotropy={16} />
          <canvasTexture attach="emissiveMap" image={canvas} anisotropy={16} />
        </meshStandardMaterial>
      </mesh>
    </group>
  );
}

// Çelik Soyunma Dolapları & Alet Rafı (Right Wall - X = -14.8)
function ShowroomLockers() {
  const lockersZ = [-2.4, -1.8, -1.2, -0.6];
  
  return (
    <group position={[-14.7, 0, 0]}>
      {/* Soyunma Dolapları */}
      {lockersZ.map((z, idx) => (
        <group key={idx} position={[0, 0.9, z]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.4, 1.8, 0.58]} />
            <meshStandardMaterial color="#475569" roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[0.201, 0, 0]} castShadow>
            <boxGeometry args={[0.01, 1.76, 0.54]} />
            <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.4} />
          </mesh>
          <mesh position={[0.21, 0.05, 0.2]}>
            <boxGeometry args={[0.01, 0.15, 0.015]} />
            <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[0.206, 0.74, 0]}>
            <boxGeometry args={[0.002, 0.04, 0.38]} />
            <meshBasicMaterial color="#1e293b" />
          </mesh>
          <mesh position={[0.206, -0.74, 0]}>
            <boxGeometry args={[0.002, 0.04, 0.38]} />
            <meshBasicMaterial color="#1e293b" />
          </mesh>
        </group>
      ))}

      {/* Endüstriyel Alet Rafı */}
      <group position={[0, 0.8, -4.2]}>
        {[-0.2, 0.2].map((x) => 
          [-0.6, 0.6].map((z) => (
            <mesh key={`${x}-${z}`} position={[x, 0, z]} castShadow>
              <boxGeometry args={[0.03, 1.6, 0.03]} />
              <meshStandardMaterial color="#1e293b" metalness={0.9} />
            </mesh>
          ))
        )}
        {[-0.75, -0.25, 0.25, 0.75].map((y, idx) => (
          <mesh key={idx} position={[0, y, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.42, 0.03, 1.22]} />
            <meshStandardMaterial color="#44403c" roughness={0.6} />
          </mesh>
        ))}
        {/* Raf Üstündeki Alet Kutuları */}
        <mesh position={[0, 0.37, -0.2]} castShadow>
          <boxGeometry args={[0.3, 0.2, 0.35]} />
          <meshStandardMaterial color="#b45309" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.37, 0.2]} castShadow>
          <boxGeometry args={[0.3, 0.2, 0.35]} />
          <meshStandardMaterial color="#1e3a8a" roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.13, 0]} castShadow>
          <boxGeometry args={[0.32, 0.2, 0.6]} />
          <meshStandardMaterial color="#b91c1c" roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

// Duvar Marka Logosu ve Tabelası (İnaner TR - GPU CanvasTexture)
function ShowroomLogoSign() {
  const logoTexture = useTexture('/yenı logo 111.png');
  const logoImage = logoTexture ? logoTexture.image : null;

  const canvas = useMemo(() => {
    return createLogoSignCanvas(logoImage);
  }, [logoImage]);

  return (
    <group position={[-2.4, 2.6, -7.4]}>
      {/* Arka Çerçeve */}
      <mesh castShadow>
        <boxGeometry args={[3.8, 1.1, 0.06]} />
        <meshStandardMaterial color="#1e1b18" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Ön Tabelası (CanvasTexture) */}
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[3.7, 1.0]} />
        <meshStandardMaterial 
          roughness={0.15} 
          metalness={0.1}
          emissive="#1e1e1e" 
        >
          <canvasTexture attach="map" image={canvas} anisotropy={16} />
          <canvasTexture attach="emissiveMap" image={canvas} anisotropy={16} />
        </meshStandardMaterial>
      </mesh>
      
      {/* Neon Backlight Glow */}
      <mesh position={[0, 0, -0.01]} scale={[1.05, 1.05, 1.05]}>
        <planeGeometry args={[3.8, 1.1]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

// Prosedürel Ağır Vasıta Lastik Sırt Deseni (GPU CanvasTexture)
let sharedTreadTexture = null;
function getSharedTreadTexture() {
  if (sharedTreadTexture) return sharedTreadTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Ana kauçuk tabanı
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, 512, 256);

  // Çevresel ana su tahliye kanalları (4 derin kanal)
  const groovesY = [46, 102, 154, 210];
  ctx.fillStyle = '#050507';
  groovesY.forEach((gy) => {
    ctx.fillRect(0, gy - 6, 512, 12);
  });

  // Sırt blokları ve çapraz kılcal kanallar (Heavy-Duty Lug Pattern)
  for (let x = 0; x < 512; x += 32) {
    ctx.fillStyle = '#27272a';
    // Omuz blokları
    ctx.fillRect(x + 4, 6, 22, 32);
    ctx.fillRect(x + 4, 218, 22, 32);
    // Orta sırt blokları
    ctx.fillRect(x + 6, 54, 20, 40);
    ctx.fillRect(x + 12, 110, 20, 36);
    ctx.fillRect(x + 6, 162, 20, 40);

    // Çapraz oluk gölgeleri
    ctx.fillStyle = '#09090b';
    ctx.fillRect(x, 0, 4, 40);
    ctx.fillRect(x, 216, 4, 40);
    ctx.fillRect(x + 2, 52, 4, 44);
    ctx.fillRect(x + 8, 108, 4, 40);
    ctx.fillRect(x + 2, 160, 4, 44);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(4, 1);
  tex.needsUpdate = true;
  sharedTreadTexture = tex;
  return tex;
}

// Raf Üst Alınlık Tabelası (GPU CanvasTexture)
function createRackHeaderCanvas(filledTiresCount, rimsCount) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');

  // Metalik koyu zemin
  ctx.fillStyle = '#090b10';
  ctx.fillRect(0, 0, 2048, 192);

  // Üst ve alt kehribar/endüstriyel şerit
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 0, 2048, 8);
  ctx.fillRect(0, 184, 2048, 8);

  // Sol vurgu bloğu
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(36, 36, 14, 120);

  // Başlık
  ctx.font = 'bold 54px Montserrat, Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('YEDEK LASTİK & JANT İSTASYONU', 76, 98);

  ctx.font = 'bold 26px Montserrat, Arial, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('ŞİRKET ORTAK FİLO ENVANTERİ  //  20 LASTİK SLOTU & YATAY JANT DEPOSU', 76, 144);

  // Sağ durum rozetleri
  // 1. Yedek Lastik Sayacı
  ctx.fillStyle = '#111827';
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 4;
  ctx.strokeRect(1320, 34, 330, 124);
  ctx.fillRect(1320, 34, 330, 124);

  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('YEDEK LASTİK', 1350, 74);
  ctx.font = 'bold 46px monospace';
  ctx.fillStyle = '#10b981';
  ctx.fillText(`${filledTiresCount} / 20`, 1350, 134);

  // 2. Jant Sayacı
  ctx.fillStyle = '#111827';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4;
  ctx.strokeRect(1680, 34, 330, 124);
  ctx.fillRect(1680, 34, 330, 124);

  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('YEDEK JANT', 1710, 74);
  ctx.font = 'bold 46px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`${rimsCount} ADET`, 1710, 134);

  return canvas;
}

// 3D Yedek Lastik Bileşeni (Raftaki Her Bir Slot)
function SpareTire3D({ slotObj, tireData, isSelected, isRackFocused, onSelectTire }) {
  const groupRef = useRef();
  const [hovered, setHovered] = useState(false);
  const activeHover = hovered && isRackFocused;

  const hasTire = Boolean(tireData && (tireData.brand || tireData.size || tireData.notes || tireData.installedKm));
  const statusColors = { İyi: '#10b981', Orta: '#f59e0b', Kritik: '#ef4444' };
  const status = tireData?.status || 'İyi';
  const accentColor = hasTire ? (statusColors[status] || '#10b981') : '#64748b';

  useFrame(() => {
    if (!groupRef.current) return;
    const targetScale = (isSelected || activeHover) ? 1.06 : 1.0;
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.18);
  });

  return (
    <group position={slotObj.localPos}>
      {/* Ön Kiriş Üzerindeki Durum LED'i (Dolu slotlarda veya seçili/üzerine gelinen slotta görünür) */}
      {(hasTire || isSelected || activeHover) && (
        <mesh position={[0, -0.25, 0.21]}>
          <boxGeometry args={[0.16, 0.022, 0.015]} />
          <meshBasicMaterial
            color={isSelected ? '#d946ef' : (hasTire ? accentColor : '#f8fafc')}
          />
        </mesh>
      )}

      {/* Tıklanabilir Lastik Grubu (18 derece showroom açısıyla dikey duruş) */}
      <group
        ref={groupRef}
        rotation={[0, -0.32, Math.PI / 2]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectTire(slotObj.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        {hasTire ? (
          <>
            {/* 1. Ana Lastik Sırt Gövdesi (Tam Opak Kapalı Kauçuk Silindir) */}
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[0.298, 0.298, 0.19, 40]} />
              <meshStandardMaterial
                color="#141417"
                roughness={0.82}
                metalness={0.08}
              />
            </mesh>

            {/* 1b. 3D Kabartmalı Lastik Sırt Blokları ve Su Kanalları (Yere Temas Eden Yüzey) */}
            {[-0.072, -0.036, 0, 0.036, 0.072].map((ribY, rIdx) => (
              <mesh key={`rib-${rIdx}`} position={[0, ribY, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.312, 0.312, 0.024, 40]} />
                <meshStandardMaterial
                  color="#1e1e24"
                  roughness={0.74}
                  metalness={0.10}
                />
              </mesh>
            ))}

            {/* 2. Sol ve Sağ Bombeli Yanaklar (Sidewall Torus) */}
            {[-0.072, 0.072].map((yPos, idx) => (
              <mesh key={idx} position={[0, yPos, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.48]} castShadow receiveShadow>
                <torusGeometry args={[0.235, 0.076, 18, 40]} />
                <meshStandardMaterial color="#141417" roughness={0.62} metalness={0.12} />
              </mesh>
            ))}

            {/* 3. İç Topuk Çemberi (Bead Ring) */}
            {[-0.098, 0.098].map((yPos, idx) => (
              <mesh key={`bead-${idx}`} position={[0, yPos, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.165, 0.018, 12, 32]} />
                <meshStandardMaterial color="#27272a" roughness={0.4} metalness={0.5} />
              </mesh>
            ))}

            {/* 4. İç Karkas Karanlık Merkez */}
            <mesh>
              <cylinderGeometry args={[0.17, 0.17, 0.196, 32]} />
              <meshStandardMaterial color="#09090b" roughness={0.95} />
            </mesh>

            {/* 5. Yanak Üzeri Durum / Seçim Çemberi */}
            {[-0.108, 0.108].map((yPos, idx) => (
              <mesh key={`ring-${idx}`} position={[0, yPos, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.225, isSelected || activeHover ? 0.012 : 0.006, 10, 36]} />
                <meshBasicMaterial
                  color={isSelected ? '#d946ef' : accentColor}
                  transparent
                  opacity={isSelected || activeHover ? 0.95 : 0.65}
                />
              </mesh>
            ))}

            {/* 6. Seçildiğinde / Hover Olduğunda Dış Vurgu Zarfı */}
            {(isSelected || activeHover) && (
              <mesh>
                <cylinderGeometry args={[0.322, 0.322, 0.215, 32]} />
                <meshStandardMaterial
                  color={isSelected ? '#d946ef' : accentColor}
                  emissive={isSelected ? '#d946ef' : accentColor}
                  emissiveIntensity={isSelected ? 0.9 : 0.45}
                  transparent
                  opacity={isSelected ? 0.35 : 0.18}
                />
              </mesh>
            )}
          </>
        ) : (
          /* Boş Raf Slotu: Boşken iskelet görünmez, sadece depoya yakınken mouse üzerine gelince beyaz veya seçilince parlak önizleme yanar */
          <mesh>
            <cylinderGeometry args={[0.295, 0.295, 0.185, 32]} />
            <meshStandardMaterial
              color={isSelected ? '#d946ef' : '#f8fafc'}
              emissive={isSelected ? '#d946ef' : '#f8fafc'}
              emissiveIntensity={isSelected ? 0.85 : (activeHover ? 0.65 : 0)}
              transparent
              depthWrite={false}
              opacity={isSelected ? 0.42 : (activeHover ? 0.30 : 0)}
            />
          </mesh>
        )}
      </group>
    </group>
  );
}

// 3D Ağır Vasıta Çelik/Krom Jant Bileşeni (En Alt Katta Yatay Dizilim)
function SpareRim3D({ position, isSelected, hovered, onSelectRims, onHoverChange }) {
  // 10 Bijon deliği açıları
  const lugAngles = useMemo(() => Array.from({ length: 10 }, (_, i) => (i * Math.PI * 2) / 10), []);

  return (
    <group
      position={position}
      rotation={[0.10, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelectRims();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHoverChange(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHoverChange(false);
        document.body.style.cursor = 'auto';
      }}
    >
      {/* 1. Dış Çelik/Alüminyum Jant Gövdesi (Yatay Silindir) */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.15, 32, 1, true]} />
        <meshStandardMaterial
          color={isSelected ? '#e0f2fe' : '#d4d4d8'}
          metalness={0.92}
          roughness={0.14}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 2. Üst ve Alt Jant Flanş Dudakları (Rim Lip) */}
      {[0.075, -0.075].map((yPos, idx) => (
        <mesh key={idx} position={[0, yPos, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.184, 0.014, 12, 32]} />
          <meshStandardMaterial color="#f4f4f5" metalness={0.96} roughness={0.1} />
        </mesh>
      ))}

      {/* 3. Orta Konik Göbek Çanağı (Drop-Center Dish) */}
      <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.172, 0.135, 0.035, 32, 1, true]} />
        <meshStandardMaterial color="#a1a1aa" metalness={0.88} roughness={0.2} side={THREE.DoubleSide} />
      </mesh>

      {/* 4. Jant Göbek Aynası (Hub Mounting Disc) */}
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[0.058, 0.14, 32]} />
        <meshStandardMaterial color="#e4e4e7" metalness={0.92} roughness={0.15} side={THREE.DoubleSide} />
      </mesh>

      {/* 5. Merkez Aks Boşluğu Çemberi */}
      <mesh position={[0, 0.042, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.058, 0.008, 10, 28]} />
        <meshStandardMaterial color="#52525b" metalness={0.85} roughness={0.25} />
      </mesh>

      {/* 6. 10 Adet Bijon ve Havalandırma Deliği */}
      {lugAngles.map((ang, idx) => {
        const lx = Math.cos(ang) * 0.098;
        const lz = Math.sin(ang) * 0.098;
        return (
          <mesh key={idx} position={[lx, 0.038, lz]}>
            <cylinderGeometry args={[0.011, 0.011, 0.012, 10]} />
            <meshBasicMaterial color="#09090b" />
          </mesh>
        );
      })}

      {/* 7. Seçim / Hover Durumunda Mavi Parlama Çemberi */}
      {(isSelected || hovered) && (
        <mesh position={[0, 0.082, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.19, 0.009, 10, 32]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      )}
    </group>
  );
}

// 3 Katlı Endüstriyel Yedek Lastik & Jant Rafı (2 Kat Lastik + 1 Zemin Kat Yatay Jant)
function ShowroomTireRack({
  spareTiresData,
  spareRimsData,
  selectedTireId,
  isSwapMode,
  isRackFocused,
  onSelectTire,
  onSelectRims,
  onFocusRack
}) {
  const [rimHovered, setRimHovered] = useState(false);
  const activeRimHover = rimHovered && isRackFocused;

  const filledTiresCount = useMemo(() => {
    if (!spareTiresData) return 0;
    return RACK_TIRE_POSITIONS.filter((p) => {
      const t = spareTiresData[p.id];
      return Boolean(t && (t.brand || t.size || t.notes || t.installedKm));
    }).length;
  }, [spareTiresData]);

  const rimsCount = Math.max(0, parseInt(spareRimsData?.count) || 0);

  const headerCanvas = useMemo(
    () => createRackHeaderCanvas(filledTiresCount, rimsCount),
    [filledTiresCount, rimsCount]
  );

  // Yatay jantların 3D dizilim koordinatları (En alt rafta 10 sütun, 10'dan fazlası üst üste yatay istiflenir)
  const rimPositions = useMemo(() => {
    const count = Math.min(rimsCount, 30);
    return Array.from({ length: count }, (_, idx) => {
      const col = idx % 10;
      const stackLayer = Math.floor(idx / 10);
      const x = Number(((col - 4.5) * 0.42).toFixed(3));
      const y = 0.21 + stackLayer * 0.165;
      const z = 0.04;
      return [x, y, z];
    });
  }, [rimsCount]);

  const rackWidth = 4.46;
  const rackDepth = 0.72;
  const rackHeight = 2.68;
  const uprightsX = [-2.18, -0.73, 0.73, 2.18];
  const shelfLevelsY = [0.08, 0.76, 1.64];

  return (
    <group
      position={[9.2, 0, -6.85]}
      onClick={(e) => {
        if (!isRackFocused && onFocusRack) {
          e.stopPropagation();
          onFocusRack();
        }
      }}
      onPointerOver={(e) => {
        if (!isRackFocused) {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }
      }}
      onPointerOut={(e) => {
        if (!isRackFocused) {
          e.stopPropagation();
          document.body.style.cursor = 'auto';
        }
      }}
    >
      {/* 1. DİKEY ÇELİK TAŞIYICI KOLONLAR (Ön ve Arka) */}
      {uprightsX.map((ux, idx) => {
        const frontColHeight = (idx === 1 || idx === 2) ? 2.34 : rackHeight;
        return (
          <group key={`col-${idx}`} position={[ux, 0, 0]}>
            {/* Ön Dikme (Orta dikmeler üst tabelanın alt hizasında biter, tabelanın önüne geçmez) */}
            <mesh position={[0, frontColHeight / 2, rackDepth / 2]} castShadow receiveShadow>
              <boxGeometry args={[0.065, frontColHeight, 0.065]} />
              <meshStandardMaterial color="#18181b" metalness={0.85} roughness={0.25} />
            </mesh>
            {/* Arka Dikme */}
            <mesh position={[0, rackHeight / 2, -rackDepth / 2]} castShadow receiveShadow>
              <boxGeometry args={[0.065, rackHeight, 0.065]} />
              <meshStandardMaterial color="#18181b" metalness={0.85} roughness={0.25} />
            </mesh>
            {/* Zemin Ankraj Plakaları */}
            <mesh position={[0, 0.01, rackDepth / 2]}>
              <boxGeometry args={[0.12, 0.02, 0.12]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.01, -rackDepth / 2]}>
              <boxGeometry args={[0.12, 0.02, 0.12]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.3} />
            </mesh>
            {/* Yan Çapraz Gergi Profilleri */}
            {[0.45, 1.25, 2.05].map((braceY, bIdx) => (
              <mesh
                key={bIdx}
                position={[0, braceY, 0]}
                rotation={[bIdx % 2 === 0 ? 0.55 : -0.55, 0, 0]}
              >
                <boxGeometry args={[0.03, 0.03, rackDepth * 1.1]} />
                <meshStandardMaterial color="#27272a" metalness={0.8} roughness={0.3} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* 2. 3 KATMANLI YATAY TRAVERS KİRİŞLER (Zemin Jant Katı + Orta Lastik Katı + Üst Lastik Katı) */}
      {shelfLevelsY.map((sy, sIdx) => (
        <group key={`shelf-${sIdx}`} position={[0, sy, 0]}>
          {/* Ön Travers Kirişi */}
          <mesh position={[0, 0, rackDepth / 2 - 0.12]} castShadow receiveShadow>
            <boxGeometry args={[rackWidth, 0.055, 0.055]} />
            <meshStandardMaterial color="#27272a" metalness={0.82} roughness={0.25} />
          </mesh>
          {/* Ön Turuncu Endüstriyel Güvenlik Şeridi */}
          <mesh position={[0, 0, rackDepth / 2 - 0.091]}>
            <planeGeometry args={[rackWidth - 0.1, 0.02]} />
            <meshBasicMaterial color={sIdx === 0 ? '#38bdf8' : '#f59e0b'} />
          </mesh>
          {/* Arka Travers Kirişi */}
          <mesh position={[0, 0, -rackDepth / 2 + 0.12]} castShadow receiveShadow>
            <boxGeometry args={[rackWidth, 0.055, 0.055]} />
            <meshStandardMaterial color="#27272a" metalness={0.82} roughness={0.25} />
          </mesh>
        </group>
      ))}

      {/* 3. EN ALT KAT (ZEMİN JANT BÖLÜMÜ) ÇELİK IZGARA PLATFORMU */}
      <group
        position={[0, 0.09, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectRims();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setRimHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setRimHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <mesh receiveShadow>
          <boxGeometry args={[rackWidth - 0.12, 0.03, rackDepth - 0.16]} />
          <meshStandardMaterial
            color={selectedTireId === 'RIMS' || activeRimHover ? '#1e293b' : '#18181b'}
            metalness={0.75}
            roughness={0.35}
          />
        </mesh>
        {/* Jant Bölümü Seçim Çerçevesi */}
        {(selectedTireId === 'RIMS' || activeRimHover) && (
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[rackWidth - 0.08, 0.01, rackDepth - 0.12]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.35} />
          </mesh>
        )}
      </group>

      {/* 4. ÜST ALINLIK TABELASI VE ENTEGRE LED AYDINLATMA */}
      <group position={[0, 2.52, rackDepth / 2 + 0.03]}>
        <mesh castShadow>
          <boxGeometry args={[rackWidth, 0.36, 0.05]} />
          <meshStandardMaterial color="#09090b" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.027]}>
          <planeGeometry args={[rackWidth - 0.06, 0.32]} />
          <meshStandardMaterial roughness={0.2} metalness={0.1} emissive="#18181b">
            <canvasTexture attach="map" image={headerCanvas} anisotropy={16} />
            <canvasTexture attach="emissiveMap" image={headerCanvas} anisotropy={16} />
          </meshStandardMaterial>
        </mesh>
      </group>

      {/* Raf İçi Lokal LED Aydınlatmalar */}
      <pointLight position={[-1.2, 2.35, 0.5]} intensity={0.65} distance={4.5} color="#f8fafc" decay={1.8} />
      <pointLight position={[1.2, 2.35, 0.5]} intensity={0.65} distance={4.5} color="#f8fafc" decay={1.8} />

      {/* 5. 20 ADET YEDEK LASTİK SLOTU (Üst Kat: 1-10, Orta Kat: 11-20) */}
      {RACK_TIRE_POSITIONS.map((slotObj) => (
        <SpareTire3D
          key={slotObj.id}
          slotObj={slotObj}
          tireData={spareTiresData?.[slotObj.id]}
          isSelected={selectedTireId === slotObj.id}
          isSwapMode={isSwapMode}
          isRackFocused={isRackFocused}
          onSelectTire={onSelectTire}
        />
      ))}

      {/* 6. EN ALT KAT: YATAY DİZİLMİŞ 3D AĞIR VASITA JANTLARI */}
      {rimPositions.map((pos, idx) => (
        <SpareRim3D
          key={`rim-${idx}`}
          position={pos}
          isSelected={selectedTireId === 'RIMS'}
          hovered={activeRimHover}
          onSelectRims={onSelectRims}
          onHoverChange={setRimHovered}
        />
      ))}
    </group>
  );
}

// Ekran en-boy oranına (Mobil Dikey / Yatay / iPad / Masaüstü) göre tam sığdıran kamera pozisyonunu hesaplar
function getResponsiveCameraPreset(viewMode, aspect) {
  const safeAspect = Math.max(0.35, aspect || 1.0);
  const fov = safeAspect < 0.7 ? 56 : (safeAspect < 1.1 ? 52 : 48);
  const tanHalfFov = Math.tan((fov * Math.PI) / 360);

  if (viewMode === 'rack') {
    // 3 katlı raf genişliği 4.46m, yüksekliği 2.68m -> kenar ve üst bar payıyla 5.45m x 3.85m alan
    const reqWidth = 5.45;
    const reqHeight = 3.85;
    const distForHeight = reqHeight / (2 * tanHalfFov);
    const distForWidth = reqWidth / (2 * safeAspect * tanHalfFov);
    const dist = Math.max(5.2, distForHeight, distForWidth);

    return {
      pos: new THREE.Vector3(9.2, 1.02, -6.85 + dist),
      target: new THREE.Vector3(9.2, 0.94, -6.85),
      fov
    };
  }

  // 'truck' görünümü: Tır uzunluğu ~5.6m (X: -2.75 .. +2.85, merkez X = 0.05), ön yan yüzey Z = 0.65
  const reqWidth = 6.55;
  const reqHeight = 3.85;
  const distForHeight = reqHeight / (2 * tanHalfFov);
  const distForWidth = reqWidth / (2 * safeAspect * tanHalfFov);
  const distFromTruckSide = Math.max(5.55, distForHeight, distForWidth);
  const camZ = 0.65 + distFromTruckSide;

  return {
    pos: new THREE.Vector3(0.05, 1.45, camZ),
    target: new THREE.Vector3(0.05, 0.48, 0),
    fov
  };
}

// Kamera Odak Geçiş Kontrolcüsü (Araç <-> Depo Arasında Sinematik ve Mobil/iPad Duyarlı Geçiş)
function CameraFocusController({ controlsRef, cameraTransitionRef, cameraView }) {
  const initializedDefaultRef = useRef(false);
  const lastAspectRef = useRef(null);

  useFrame((state, delta) => {
    if (!controlsRef.current) return;

    const aspect = state.size.width / Math.max(1, state.size.height);
    const preset = getResponsiveCameraPreset(cameraView, aspect);

    // Ekran açısı değiştiğinde veya ilk açılışta FOV değerini adapte et
    if (Math.abs(state.camera.fov - preset.fov) > 0.15) {
      state.camera.fov = THREE.MathUtils.lerp(state.camera.fov, preset.fov, 0.18);
      state.camera.updateProjectionMatrix();
    }

    // İlk açılışta varsayılan araç kamera açısını (ekran boyutuna uygun) ayarla
    if (!initializedDefaultRef.current) {
      state.camera.position.copy(preset.pos);
      state.camera.fov = preset.fov;
      state.camera.updateProjectionMatrix();
      controlsRef.current.target.copy(preset.target);
      controlsRef.current.update();
      initializedDefaultRef.current = true;
      lastAspectRef.current = aspect;
    } else if (lastAspectRef.current !== null && Math.abs(lastAspectRef.current - aspect) > 0.04) {
      // Cihaz döndürüldüğünde veya ekran boyutu değiştiğinde kamerayı yeni orana yumuşakça hizala
      lastAspectRef.current = aspect;
      cameraTransitionRef.current = {
        active: true,
        initialized: false,
        progress: 0,
        duration: 0.65,
        viewMode: cameraView
      };
    }

    const trans = cameraTransitionRef.current;
    if (!trans || !trans.active) return;

    const activePreset = getResponsiveCameraPreset(trans.viewMode || cameraView, aspect);
    const desiredPos = activePreset.pos;
    const desiredTarget = activePreset.target;

    if (!trans.initialized) {
      trans.startPos = state.camera.position.clone();
      trans.startTarget = controlsRef.current.target.clone();
      trans.progress = 0;
      trans.duration = trans.duration || 1.35;
      trans.initialized = true;
    }

    const step = Math.min(delta, 0.05) / trans.duration;
    trans.progress = Math.min(1, trans.progress + step);

    // Quintic Smootherstep (Başlangıç ve bitişte sıfır ivmeli sinematik yumuşatma)
    const p = trans.progress;
    const ease = p * p * p * (p * (p * 6 - 15) + 10);

    state.camera.position.lerpVectors(trans.startPos, desiredPos, ease);
    controlsRef.current.target.lerpVectors(trans.startTarget, desiredTarget, ease);

    // Yatay geçişlerde hafif sinematik kamera yaylanması (dolly arc)
    const travelDist = trans.startPos.distanceTo(desiredPos);
    if (travelDist > 2.0) {
      const arc = Math.sin(p * Math.PI);
      state.camera.position.y += arc * 0.22;
      state.camera.position.z = Math.min(15.5, state.camera.position.z + arc * 0.55);
    }

    controlsRef.current.update();

    if (p >= 1) {
      state.camera.position.copy(desiredPos);
      controlsRef.current.target.copy(desiredTarget);
      controlsRef.current.update();
      trans.active = false;
    }
  });
  return null;
}

// 3D Showroom Ortamı (Modern Endüstriyel Pavilyon)
function ShowroomEnvironment({
  spareTiresData,
  spareRimsData,
  selectedTireId,
  isSwapMode,
  isRackFocused,
  onSelectTire,
  onSelectRims,
  onFocusRack
}) {
  return (
    <group position={[0, -0.5, 0]}>
      {/* Parlak Cilalı Epoksi Zemin (Açık Gri / Showroom Tipi) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial 
          color="#78716c" 
          roughness={0.28} 
          metalness={0.25} 
        />
      </mesh>

      {/* Büyük Showroom Karoları (İnce Derz Çizgileri) */}
      {[-16, -12, -8, -4, 0, 4, 8, 12, 16].map((coord, idx) => (
        <group key={idx}>
          <mesh position={[0, 0.001, coord]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[60, 0.012]} />
            <meshBasicMaterial color="#44403c" transparent opacity={0.35} />
          </mesh>
          <mesh position={[coord, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.012, 60]} />
            <meshBasicMaterial color="#44403c" transparent opacity={0.35} />
          </mesh>
        </group>
      ))}

      {/* BRÜT BETON DUVARLAR */}
      {/* Arka Duvar (Z = -7.5) */}
      <ConcreteWall width={32} height={5.6} position={[0, 2.2, -7.5]} />
      {/* Sol Yan Duvar (X = 15) */}
      <ConcreteWall width={24} height={5.6} position={[15, 2.2, 4.5]} rotation={[0, -Math.PI / 2, 0]} />
      {/* Sağ Yan Duvar (X = -15) */}
      <ConcreteWall width={24} height={5.6} position={[-15, 2.2, 4.5]} rotation={[0, Math.PI / 2, 0]} />

      {/* ÖN CAM CEPHE VE GİRİŞ (4. DUVAR - Z = 16.5) */}
      <GlassEntranceFacade />

      {/* SOL TARAFTA OFİSLER (X = 14.8) */}
      <ShowroomOffice />

      {/* SAĞ TARAFTA SOYUNMA DOLAPLARI VE RAFLAR (X = -14.8) */}
      <ShowroomLockers />

      {/* DİKEY AHŞAP AKUSTİK DEKOR PANELİ (Z = -7.4) */}
      <WoodSlatPanel position={[3.6, 0, -7.42]} width={6.0} height={4.8} />

      {/* 3 KATLI YEDEK LASTİK (20 SLOT) & YATAY JANT RAFI (Ahşap Panel ile Ofis Camı Arası: X = 9.2, Z = -6.85) */}
      <ShowroomTireRack
        spareTiresData={spareTiresData}
        spareRimsData={spareRimsData}
        selectedTireId={selectedTireId}
        isSwapMode={isSwapMode}
        isRackFocused={isRackFocused}
        onSelectTire={onSelectTire}
        onSelectRims={onSelectRims}
        onFocusRack={onFocusRack}
      />

      {/* DUVAR SÜSLEMELERİ & IŞIKLI EMBLAMLAR (Z = -7.4) */}
      <ShowroomLogoSign />



      {/* TAVAN YAPISI VE ÇELİK KİRİŞLER (Y = 4.2) */}
      {/* Tavan Plakası */}
      <mesh position={[0, 4.3, 4.5]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[32, 26]} />
        <meshStandardMaterial color="#57534e" roughness={0.8} />
      </mesh>

      {/* Endüstriyel Çelik Kirişler */}
      <SteelTruss length={30} position={[0, 4.0, -3.5]} />
      <SteelTruss length={30} position={[0, 4.0, 3.5]} />
      <SteelTruss length={15} position={[-10, 4.1, 0]} rotation={[0, Math.PI / 2, 0]} />
      <SteelTruss length={15} position={[10, 4.1, 0]} rotation={[0, Math.PI / 2, 0]} />

      {/* 6 Adet Dikdörtgen Gömme LED Işık Panelleri */}
      {[
        { x: -7, z: -3.5 }, { x: 0, z: -3.5 }, { x: 7, z: -3.5 },
        { x: -7, z: 3.5 }, { x: 0, z: 3.5 }, { x: 7, z: 3.5 }
      ].map((panel, idx) => (
        <group key={idx} position={[panel.x, 4.29, panel.z]}>
          <mesh castShadow>
            <boxGeometry args={[3.12, 0.04, 1.82]} />
            <meshStandardMaterial color="#292524" roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh position={[0, -0.015, 0]}>
            <boxGeometry args={[3.0, 0.02, 1.7]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          {/* Aşağı Yönlü Lokal Aydınlatma */}
          <pointLight 
            position={[0, -0.2, 0]} 
            intensity={0.35} 
            distance={5.0} 
            decay={2} 
          />
        </group>
      ))}

      {/* BEKLEME / LOBİ ALANI */}
      <ShowroomArmchair position={[3.6, 0, -4.8]} rotation={[0, -0.6, 0]} />
      <ShowroomArmchair position={[4.9, 0, -4.2]} rotation={[0, -1.0, 0]} />
      <ShowroomOttoman position={[3.0, 0, -3.8]} rotation={[0, 0.2, 0]} />
      <ShowroomCoffeeTable position={[4.1, 0, -3.3]} />

      {/* SÜS BİTKİLERİ */}
      <ShowroomPlant position={[1.8, 0, -5.2]} />
      <ShowroomPlant position={[6.0, 0, -4.8]} />
      <ShowroomPlant position={[-4.5, 0, -5.5]} />

      {/* İNTERAKTİF KİOSK */}
      <ShowroomKiosk position={[-3.6, 0, 2.2]} rotation={[0, 0.4, 0]} />
    </group>
  );
}

// Ana Lastik Yönetim Bileşeni
export default function Tire3DViewer({ currentKm, onClose }) {
  const { activeTruckId, activeTruckData } = useTruck();
  const { activeCompanyId } = useCompany();
  const { addMaintenance } = useContext(DataContext);

  const [selectedTireId, setSelectedTireId] = useState(null);
  const [isRotating, setIsRotating] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorObj, setErrorObj] = useState(null);
  const controlsRef = useRef(null);

  const [showTuning, setShowTuning] = useState(false);
  const isCalibrationMode = true; // Koordinat ince ayar aracı her zaman açık olarak istendi

  // Kamera odak görünümü: 'truck' | 'rack'
  const [cameraView, setCameraView] = useState('truck');
  const cameraTransitionRef = useRef({
    active: false,
    initialized: false,
    progress: 0,
    duration: 1.35,
    viewMode: 'truck'
  });

  const focusOnRack = () => {
    setCameraView('rack');
    cameraTransitionRef.current = {
      active: true,
      initialized: false,
      progress: 0,
      duration: 1.35,
      viewMode: 'rack'
    };
  };

  const focusOnTruck = () => {
    setCameraView('truck');
    cameraTransitionRef.current = {
      active: true,
      initialized: false,
      progress: 0,
      duration: 1.35,
      viewMode: 'truck'
    };
  };

  // Sağ panel modları: 'info' (okuma), 'edit' (güncelleme), 'replace' (yeni lastik takma), 'history' (tarihçe)
  const [panelMode, setPanelMode] = useState('info');

  // Swap / Rotasyon durumu
  const [isSwapMode, setIsSwapMode] = useState(false);
  const [swapSourceId, setSwapSourceId] = useState(null);

  // Şirket Ortak Yedek Lastik (20 Slot) ve Yatay Jant Envanteri
  const [spareTiresData, setSpareTiresData] = useState({});
  const [spareRimsData, setSpareRimsData] = useState({ count: 0, notes: '' });
  const [spareHistoryData, setSpareHistoryData] = useState([]);
  const [rimsForm, setRimsForm] = useState({ count: 0, notes: '' });
  const [savingRims, setSavingRims] = useState(false);

  const companyRackDocId = useMemo(
    () => `${activeCompanyId || 'inaner_logistics'}_tire_rack`,
    [activeCompanyId]
  );

  // Ortak Raf Verisini Firestore'dan Canlı Dinle
  useEffect(() => {
    if (!activeCompanyId) return;
    const localKey = `tir_spare_rack_${activeCompanyId}`;
    try {
      const cached = localStorage.getItem(localKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.spareTires) setSpareTiresData(parsed.spareTires);
        if (parsed.spareRims) {
          setSpareRimsData(parsed.spareRims);
          setRimsForm({ count: parsed.spareRims.count || 0, notes: parsed.spareRims.notes || '' });
        }
        if (Array.isArray(parsed.spareHistory)) setSpareHistoryData(parsed.spareHistory);
      }
    } catch (_) {}

    const rackRef = doc(db, 'company_data', companyRackDocId);
    const unsub = onSnapshot(
      rackRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const st = data.spareTires || {};
          const sr = data.spareRims || { count: 0, notes: '' };
          const sh = Array.isArray(data.spareHistory) ? data.spareHistory : [];
          setSpareTiresData(st);
          setSpareRimsData(sr);
          setSpareHistoryData(sh);
          setRimsForm({ count: sr.count || 0, notes: sr.notes || '' });
          try {
            localStorage.setItem(localKey, JSON.stringify({ spareTires: st, spareRims: sr, spareHistory: sh }));
          } catch (_) {}
        }
      },
      (err) => {
        console.warn('Ortak yedek raf verisi dinlenemedi:', err);
      }
    );

    return () => unsub();
  }, [activeCompanyId, companyRackDocId]);

  const filledSpareTiresCount = useMemo(() => {
    return RACK_TIRE_POSITIONS.filter((p) => {
      const t = spareTiresData?.[p.id];
      return Boolean(t && (t.brand || t.size || t.notes || t.installedKm));
    }).length;
  }, [spareTiresData]);
  
  // Kalibrasyon — Firestore'dan yükle
  const calibrationRef = useRef(JSON.parse(JSON.stringify(DEFAULT_CALIBRATION)));
  const [calibLoaded, setCalibLoaded] = useState(false);

  useEffect(() => {
    if (!activeTruckId) return;
    const load = async () => {
      try {
        const ref = doc(db, 'trucks', activeTruckId, 'settings', 'calibration3d');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          // Firestore'da veri var — yükle
          const data = snap.data();
          if (!data.offsets) data.offsets = {};
          if (!data.sizes) data.sizes = {};
          TIRE_POSITIONS.forEach(p => {
            if (!data.offsets[p.id]) data.offsets[p.id] = [0, 0, 0];
          });
          calibrationRef.current = data;
        } else {
          // Firestore boş — localStorage'da eski veri var mı kontrol et (migrasyon)
          try {
            const legacy = localStorage.getItem('tire-3d-calibrations');
            if (legacy) {
              const parsed = JSON.parse(legacy);
              if (!parsed.offsets) parsed.offsets = {};
              if (!parsed.sizes) parsed.sizes = {};
              TIRE_POSITIONS.forEach(p => {
                if (!parsed.offsets[p.id]) parsed.offsets[p.id] = [0, 0, 0];
              });
              calibrationRef.current = parsed;
              // Otomatik olarak Firestore'a kaydet
              await setDoc(ref, parsed);
              localStorage.removeItem('tire-3d-calibrations');
              console.log('Kalibrasyon localStorage üzerinden Firestore üzerine taşındı.');
            }
          } catch (migrErr) {
            console.warn('Migrasyon hatası:', migrErr);
          }
        }
      } catch (e) {
        console.warn('Kalibrasyon yüklenemedi:', e);
      }
      setCalibLoaded(true);
    };
    load();
  }, [activeTruckId]);

  // UI metinlerini DOM manipülasyonu ile anlık olarak güncelleyen optimize fonksiyon
  const updateTextDisplays = () => {
    const cal = calibrationRef.current;
    if (!selectedTireObj || selectedTireObj.isRack) return;

    if (!cal.offsets) cal.offsets = {};
    const offsets = cal.offsets[selectedTireId] || [0, 0, 0];

    const r = cal.sizes?.[selectedTireId]?.radius ?? cal.radius;
    const w = cal.sizes?.[selectedTireId]?.width ?? cal.width;
    const txtRadius = document.getElementById('val-radius');
    if (txtRadius) txtRadius.innerText = r.toFixed(2);

    const txtWidth = document.getElementById('val-width');
    if (txtWidth) txtWidth.innerText = w.toFixed(2);

    const txtX = document.getElementById('val-offsetX');
    if (txtX) {
      const absVal = (selectedTireObj.pos3D[0] + offsets[0]).toFixed(2);
      const offVal = offsets[0] >= 0 ? `+${offsets[0].toFixed(2)}` : offsets[0].toFixed(2);
      txtX.innerText = `${absVal} (${offVal})`;
    }

    const txtY = document.getElementById('val-offsetY');
    if (txtY) {
      const absVal = (selectedTireObj.pos3D[1] + offsets[1]).toFixed(2);
      const offVal = offsets[1] >= 0 ? `+${offsets[1].toFixed(2)}` : offsets[1].toFixed(2);
      txtY.innerText = `${absVal} (${offVal})`;
    }

    const txtZ = document.getElementById('val-offsetZ');
    if (txtZ) {
      const absVal = (selectedTireObj.pos3D[2] + offsets[2]).toFixed(2);
      const offVal = offsets[2] >= 0 ? `+${offsets[2].toFixed(2)}` : offsets[2].toFixed(2);
      txtZ.innerText = `${absVal} (${offVal})`;
    }

    const txtCopy = document.getElementById('val-copyable');
    if (txtCopy) {
      txtCopy.innerText = `pos3D: [${(selectedTireObj.pos3D[0] + offsets[0]).toFixed(2)}, ${(selectedTireObj.pos3D[1] + offsets[1]).toFixed(2)}, ${(selectedTireObj.pos3D[2] + offsets[2]).toFixed(2)}]`;
    }
  };

  // Seçili tekerlek değiştikçe kalibrasyon seçili ID'sini ve sürgü konumlarını güncelle
  useEffect(() => {
    const cal = calibrationRef.current;
    if (!cal.offsets) cal.offsets = {};
    if (selectedTireId && selectedTireId !== 'RIMS' && !selectedTireId.startsWith('SPARE_') && !cal.offsets[selectedTireId]) {
      cal.offsets[selectedTireId] = [0, 0, 0];
    }
    cal.selectedId = selectedTireId;

    const currentOffsets = (selectedTireId && cal.offsets[selectedTireId]) ? cal.offsets[selectedTireId] : [0, 0, 0];

    const sliderX = document.getElementById('slider-offsetX');
    if (sliderX) sliderX.value = currentOffsets[0];
    const sliderY = document.getElementById('slider-offsetY');
    if (sliderY) sliderY.value = currentOffsets[1];
    const sliderZ = document.getElementById('slider-offsetZ');
    if (sliderZ) sliderZ.value = currentOffsets[2];

    const r = cal.sizes?.[selectedTireId]?.radius ?? cal.radius;
    const w = cal.sizes?.[selectedTireId]?.width ?? cal.width;
    const sliderRadius = document.getElementById('slider-radius');
    if (sliderRadius) sliderRadius.value = r;
    const sliderWidth = document.getElementById('slider-width');
    if (sliderWidth) sliderWidth.value = w;

    const t = setTimeout(() => {
      updateTextDisplays();
    }, 50);

    return () => clearTimeout(t);
  }, [selectedTireId, showTuning]);

  // Tekerlek seçildiğinde sağ panel modunu varsayılan 'info' moduna çek
  useEffect(() => {
    setPanelMode('info');
  }, [selectedTireId]);

  // Firestore'dan gelen araç lastik verileri
  const tiresData = activeTruckData?.tires || {};

  const selectedTireObj = useMemo(
    () => ALL_TIRE_POSITIONS.find((t) => t.id === selectedTireId) || null,
    [selectedTireId]
  );
  const isRackSlot = Boolean(selectedTireObj?.isRack);

  // Tekerlek geçmişini filtreleyen memo (Araç veya Ortak Raf)
  const tireHistory = useMemo(() => {
    const sourceList = isRackSlot ? spareHistoryData : (activeTruckData?.tiresHistory || []);
    if (!Array.isArray(sourceList)) return [];
    return sourceList
      .filter(record => record.tireId === selectedTireId)
      .sort((a, b) => new Date(b.removedDate) - new Date(a.removedDate));
  }, [isRackSlot, spareHistoryData, activeTruckData?.tiresHistory, selectedTireId]);

  // Form durum yönetimi
  const [form, setForm] = useState({
    brand: '',
    model: '',
    size: '',
    installedKm: '',
    installedDate: '',
    threadDepth: '',
    status: 'İyi',
    tireType: 'Sıfır',
    notes: ''
  });

  const [saving, setSaving] = useState(false);

  // Seçilen lastik değiştikçe formu doldur (Araç veya Ortak Yedek Raf)
  useEffect(() => {
    if (selectedTireId && selectedTireId !== 'RIMS') {
      const isRack = selectedTireId.startsWith('SPARE_');
      const tire = isRack ? (spareTiresData[selectedTireId] || {}) : (tiresData[selectedTireId] || {});
      setForm({
        brand: tire.brand || '',
        model: tire.model || '',
        size: tire.size || '',
        installedKm: isRack ? (tire.usedKm ?? tire.installedKm ?? '') : (tire.installedKm ?? ''),
        installedDate: tire.installedDate || '',
        threadDepth: tire.threadDepth ?? '',
        status: tire.status || 'İyi',
        tireType: tire.tireType || 'Sıfır',
        notes: tire.notes || ''
      });
    }
  }, [selectedTireId, activeTruckData, spareTiresData]);

  // Lastik KM hesaplama
  const calculateTireKm = (installedKm) => {
    const km = parseInt(installedKm);
    if (isNaN(km) || km <= 0) return 0;
    const diff = currentKm - km;
    return diff > 0 ? diff : 0;
  };

  // Bilgi Düzenleme Kaydı (Araç veya Ortak Yedek Raf)
  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedTireId || !selectedTireObj) return;

    setSaving(true);
    try {
      if (isRackSlot) {
        const rackRef = doc(db, 'company_data', companyRackDocId);
        const updatedSpareTire = {
          brand: form.brand,
          model: form.model,
          size: form.size,
          usedKm: parseInt(form.installedKm) || 0,
          installedKm: parseInt(form.installedKm) || 0,
          installedDate: form.installedDate || new Date().toISOString().split('T')[0],
          threadDepth: parseFloat(form.threadDepth) || 0,
          status: form.status,
          tireType: form.tireType || 'Sıfır',
          notes: form.notes,
          lastUpdated: new Date().toISOString()
        };
        const nextSpareTires = { ...spareTiresData, [selectedTireId]: updatedSpareTire };
        setSpareTiresData(nextSpareTires);
        await setDoc(
          rackRef,
          {
            companyId: activeCompanyId || 'inaner_logistics',
            spareTires: nextSpareTires,
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );
      } else {
        if (!activeTruckId) return;
        const truckRef = doc(db, 'trucks', activeTruckId);
        const updatedTire = {
          brand: form.brand,
          model: form.model,
          size: form.size,
          installedKm: parseInt(form.installedKm) || 0,
          installedDate: form.installedDate,
          threadDepth: parseFloat(form.threadDepth) || 0,
          status: form.status,
          tireType: form.tireType || 'Sıfır',
          notes: form.notes,
          lastUpdated: new Date().toISOString()
        };

        await updateDoc(truckRef, {
          [`tires.${selectedTireId}`]: updatedTire
        });

        await addMaintenance({
          date: new Date().toISOString().split('T')[0],
          type: 'Lastik Bilgi Güncelleme',
          description: `${selectedTireObj.label} konumundaki lastik bilgileri güncellendi. Yeni: ${form.brand} ${form.model} (${form.installedKm} KM) - Tip: ${form.tireType}`,
          km: currentKm,
          cost: 0,
          files: [],
          doneItems: []
        });
      }

      setPanelMode('info');
    } catch (error) {
      alert('Lastik kaydı güncellenirken hata oluştu: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Yedek Raf Slotunu Boşaltma (Arşivleyerek Kaldırma)
  const handleClearRackSlot = async () => {
    if (!isRackSlot || !selectedTireId) return;
    const oldTire = spareTiresData[selectedTireId];
    if (!oldTire || !oldTire.brand) return;
    if (!window.confirm(`${selectedTireObj.label} slotundaki ${oldTire.brand} ${oldTire.model || ''} lastiğini raftan kaldırmak istediğinize emin misiniz?`)) {
      return;
    }

    setSaving(true);
    try {
      const rackRef = doc(db, 'company_data', companyRackDocId);
      const historyRecord = {
        tireId: selectedTireId,
        brand: oldTire.brand || 'Belirtilmedi',
        model: oldTire.model || '',
        size: oldTire.size || '',
        installedKm: 0,
        removedKm: parseInt(oldTire.usedKm ?? oldTire.installedKm) || 0,
        installedDate: oldTire.installedDate || '',
        removedDate: new Date().toISOString().split('T')[0],
        status: oldTire.status || 'İyi',
        tireType: oldTire.tireType || 'Sıfır',
        notes: oldTire.notes || ''
      };
      const nextSpareTires = { ...spareTiresData };
      delete nextSpareTires[selectedTireId];
      const nextHistory = [...spareHistoryData, historyRecord];

      setSpareTiresData(nextSpareTires);
      setSpareHistoryData(nextHistory);

      await setDoc(
        rackRef,
        {
          companyId: activeCompanyId || 'inaner_logistics',
          spareTires: nextSpareTires,
          spareHistory: nextHistory,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      setPanelMode('info');
    } catch (err) {
      alert('Raf slotu boşaltılırken hata oluştu: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Jant Envanteri Kaydetme (Adet + Genel Notlar)
  const handleUpdateRimsCountImmediate = async (nextCount) => {
    const clamped = Math.max(0, Math.min(30, parseInt(nextCount) || 0));
    const nextRims = {
      count: clamped,
      notes: rimsForm.notes,
      lastUpdated: new Date().toISOString()
    };
    setRimsForm((prev) => ({ ...prev, count: clamped }));
    setSpareRimsData(nextRims);
    try {
      const rackRef = doc(db, 'company_data', companyRackDocId);
      await setDoc(
        rackRef,
        {
          companyId: activeCompanyId || 'inaner_logistics',
          spareRims: nextRims,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Jant adedi güncellenemedi:', err);
    }
  };

  const handleSaveRims = async (e) => {
    e.preventDefault();
    setSavingRims(true);
    try {
      const rackRef = doc(db, 'company_data', companyRackDocId);
      const nextRims = {
        count: Math.max(0, Math.min(30, parseInt(rimsForm.count) || 0)),
        notes: rimsForm.notes || '',
        lastUpdated: new Date().toISOString()
      };
      setSpareRimsData(nextRims);
      await setDoc(
        rackRef,
        {
          companyId: activeCompanyId || 'inaner_logistics',
          spareRims: nextRims,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    } catch (err) {
      alert('Jant bilgileri kaydedilirken hata oluştu: ' + err.message);
    } finally {
      setSavingRims(false);
    }
  };

  // Yeni Lastik Kurulum Kaydı (Arşivleme ve Değiştirme — Araç veya Raf)
  const handleReplaceTireSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTireId || !selectedTireObj) return;

    setSaving(true);
    try {
      if (isRackSlot) {
        const rackRef = doc(db, 'company_data', companyRackDocId);
        const oldTire = spareTiresData[selectedTireId] || {};
        const nextHistory = [...spareHistoryData];
        if (oldTire.brand) {
          nextHistory.push({
            tireId: selectedTireId,
            brand: oldTire.brand || 'Belirtilmedi',
            model: oldTire.model || '',
            size: oldTire.size || '',
            installedKm: 0,
            removedKm: parseInt(oldTire.usedKm ?? oldTire.installedKm) || 0,
            installedDate: oldTire.installedDate || '',
            removedDate: new Date().toISOString().split('T')[0],
            status: oldTire.status || 'İyi',
            tireType: oldTire.tireType || 'Sıfır',
            notes: oldTire.notes || ''
          });
        }
        const newSpareTire = {
          brand: form.brand,
          model: form.model,
          size: form.size,
          usedKm: parseInt(form.installedKm) || 0,
          installedKm: parseInt(form.installedKm) || 0,
          installedDate: form.installedDate || new Date().toISOString().split('T')[0],
          threadDepth: parseFloat(form.threadDepth) || 0,
          status: form.status,
          tireType: form.tireType || 'Sıfır',
          notes: form.notes,
          lastUpdated: new Date().toISOString()
        };
        const nextSpareTires = { ...spareTiresData, [selectedTireId]: newSpareTire };
        setSpareTiresData(nextSpareTires);
        setSpareHistoryData(nextHistory);

        await setDoc(
          rackRef,
          {
            companyId: activeCompanyId || 'inaner_logistics',
            spareTires: nextSpareTires,
            spareHistory: nextHistory,
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );
      } else {
        if (!activeTruckId) return;
        const truckRef = doc(db, 'trucks', activeTruckId);
        
        // Eski lastik verilerini alıp tarihçeye ekle
        const oldTire = tiresData[selectedTireId] || {};
        const historyRecord = {
          tireId: selectedTireId,
          brand: oldTire.brand || 'Belirtilmedi',
          model: oldTire.model || '',
          size: oldTire.size || '',
          installedKm: parseInt(oldTire.installedKm) || 0,
          installedDate: oldTire.installedDate || '',
          removedKm: currentKm,
          removedDate: new Date().toISOString().split('T')[0],
          status: oldTire.status || 'Kritik',
          tireType: oldTire.tireType || 'Sıfır',
          notes: oldTire.notes || ''
        };

        const updatedHistory = [...(activeTruckData?.tiresHistory || []), historyRecord];

        // Yeni takılan lastik verisi
        const newTireData = {
          brand: form.brand,
          model: form.model,
          size: form.size,
          installedKm: parseInt(form.installedKm) || 0,
          installedDate: form.installedDate,
          threadDepth: parseFloat(form.threadDepth) || 0,
          status: form.status,
          tireType: form.tireType || 'Sıfır',
          notes: form.notes,
          lastUpdated: new Date().toISOString()
        };

        await updateDoc(truckRef, {
          [`tires.${selectedTireId}`]: newTireData,
          tiresHistory: updatedHistory
        });

        await addMaintenance({
          date: new Date().toISOString().split('T')[0],
          type: 'Lastik Değişimi',
          description: `${selectedTireObj.label} konumundaki lastik yenisiyle değiştirildi. Eski: ${oldTire.brand || 'Belirtilmedi'} ${oldTire.model || ''} (${oldTire.installedKm || 0} KM), Yeni: ${form.brand} ${form.model} (Takılan KM: ${form.installedKm} KM) - Tip: ${form.tireType}`,
          km: currentKm,
          cost: 0,
          files: [],
          doneItems: []
        });
      }

      setPanelMode('info');
    } catch (error) {
      alert('Lastik değiştirilirken hata oluştu: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Swap / Rotasyon yerleştirme tıklaması tetikleme (Araç <-> Araç, Araç <-> Ortak Raf, Raf <-> Raf)
  const handleTireClick = async (tireId) => {
    const clickedTire = ALL_TIRE_POSITIONS.find(t => t.id === tireId);

    // Eğer kamera uzaktaysa (Araç görünümündeyken) depodaki rafa tıklanırsa lastik seçmek yerine önce depoya yaklaşsın
    if (clickedTire?.isRack && cameraView !== 'rack') {
      focusOnRack();
      if (!isSwapMode) {
        setSelectedTireId(null);
      }
      return;
    }

    // Eğer kamera depodaysa ve uzaktaki araca tıklanırsa önce araca yaklaşsın
    if (clickedTire && !clickedTire.isRack && cameraView === 'rack') {
      focusOnTruck();
      if (!isSwapMode) {
        setSelectedTireId(null);
      }
      return;
    }

    if (isSwapMode) {
      if (tireId === swapSourceId) {
        setIsSwapMode(false);
        setSwapSourceId(null);
        return;
      }

      const sourceTireObj = ALL_TIRE_POSITIONS.find(t => t.id === swapSourceId);
      const targetTireObj = ALL_TIRE_POSITIONS.find(t => t.id === tireId);
      if (!sourceTireObj || !targetTireObj) return;

      const sourceIsRack = Boolean(sourceTireObj.isRack);
      const targetIsRack = Boolean(targetTireObj.isRack);

      const sourceTireData = sourceIsRack ? (spareTiresData[swapSourceId] || {}) : (tiresData[swapSourceId] || {});
      const targetTireData = targetIsRack ? (spareTiresData[tireId] || {}) : (tiresData[tireId] || {});

      const confirmText = `${sourceTireObj.label} (${sourceTireData.brand || 'Boş Slot'}) ile ${targetTireObj.label} (${targetTireData.brand || 'Boş Slot'}) konumlarındaki lastikleri yer değiştirmek (swap) istiyor musunuz?`;

      if (window.confirm(confirmText)) {
        try {
          const todayStr = new Date().toISOString().split('T')[0];

          // Araçtan rafa geçen lastiğin çalışma KM'sini dondur
          const convertTruckToRack = (tData) => {
            if (!tData || !tData.brand) return null;
            const runKm = calculateTireKm(tData.installedKm);
            return {
              ...tData,
              usedKm: runKm,
              installedKm: runKm,
              lastTruckPlate: activeTruckData?.plate || '',
              lastUpdated: new Date().toISOString()
            };
          };

          // Raftan araca geçen lastiğin takıldığı KM'yi güncel araç KM'sine göre dengele
          const convertRackToTruck = (rData) => {
            if (!rData || !rData.brand) return {};
            const priorUsedKm = parseInt(rData.usedKm ?? rData.installedKm) || 0;
            const effectiveInstalledKm = currentKm > 0 ? Math.max(0, currentKm - priorUsedKm) : priorUsedKm;
            return {
              brand: rData.brand || '',
              model: rData.model || '',
              size: rData.size || '',
              installedKm: effectiveInstalledKm,
              usedKm: priorUsedKm,
              installedDate: rData.installedDate || todayStr,
              threadDepth: parseFloat(rData.threadDepth) || 0,
              status: rData.status || 'İyi',
              tireType: rData.tireType || 'Sıfır',
              notes: rData.notes || '',
              lastUpdated: new Date().toISOString()
            };
          };

          if (!sourceIsRack && !targetIsRack) {
            // 1. Araç <-> Araç Swap
            const truckRef = doc(db, 'trucks', activeTruckId);
            await updateDoc(truckRef, {
              [`tires.${swapSourceId}`]: targetTireData,
              [`tires.${tireId}`]: sourceTireData
            });
          } else if (sourceIsRack && targetIsRack) {
            // 2. Raf <-> Raf Swap
            const rackRef = doc(db, 'company_data', companyRackDocId);
            const nextSpare = { ...spareTiresData };
            if (targetTireData && targetTireData.brand) {
              nextSpare[swapSourceId] = targetTireData;
            } else {
              delete nextSpare[swapSourceId];
            }
            if (sourceTireData && sourceTireData.brand) {
              nextSpare[tireId] = sourceTireData;
            } else {
              delete nextSpare[tireId];
            }
            setSpareTiresData(nextSpare);
            await setDoc(
              rackRef,
              {
                companyId: activeCompanyId || 'inaner_logistics',
                spareTires: nextSpare,
                updatedAt: new Date().toISOString()
              },
              { merge: true }
            );
          } else {
            // 3. Araç <-> Ortak Yedek Raf Swap
            const truckSlotId = sourceIsRack ? tireId : swapSourceId;
            const rackSlotId = sourceIsRack ? swapSourceId : tireId;
            const currentTruckTire = sourceIsRack ? targetTireData : sourceTireData;
            const currentRackTire = sourceIsRack ? sourceTireData : targetTireData;

            const newTruckTire = convertRackToTruck(currentRackTire);
            const newRackTire = convertTruckToRack(currentTruckTire);

            const truckRef = doc(db, 'trucks', activeTruckId);
            await updateDoc(truckRef, {
              [`tires.${truckSlotId}`]: newTruckTire
            });

            const rackRef = doc(db, 'company_data', companyRackDocId);
            const nextSpare = { ...spareTiresData };
            if (newRackTire && newRackTire.brand) {
              nextSpare[rackSlotId] = newRackTire;
            } else {
              delete nextSpare[rackSlotId];
            }
            setSpareTiresData(nextSpare);
            await setDoc(
              rackRef,
              {
                companyId: activeCompanyId || 'inaner_logistics',
                spareTires: nextSpare,
                updatedAt: new Date().toISOString()
              },
              { merge: true }
            );
          }

          await addMaintenance({
            date: todayStr,
            type: 'Lastik Rotasyonu',
            description: `${sourceTireObj.label} (${sourceTireData.brand || 'Boş'} ${sourceTireData.model || ''}) ile ${targetTireObj.label} (${targetTireData.brand || 'Boş'} ${targetTireData.model || ''}) lastiklerinin yerleri değiştirildi (swap).`,
            km: currentKm,
            cost: 0,
            files: [],
            doneItems: []
          });

          setSelectedTireId(tireId);
          alert('Lastik konumları başarıyla swaplandı.');
        } catch (err) {
          alert('Swap işlemi sırasında hata oluştu: ' + err.message);
        } finally {
          setIsSwapMode(false);
          setSwapSourceId(null);
        }
      } else {
        setIsSwapMode(false);
        setSwapSourceId(null);
      }
    } else {
      if (clickedTire?.isRack) {
        setSelectedTireId(tireId);
        return;
      }

      // Çift tekerlek döngüsü: aynı aks/taraftaki _out ve _in arasında geçiş
      if (clickedTire && (clickedTire.type === 'dual-out' || clickedTire.type === 'dual-in')) {
        const pairedType = clickedTire.type === 'dual-out' ? 'dual-in' : 'dual-out';
        const pairedTire = TIRE_POSITIONS.find(
          t => t.axle === clickedTire.axle && t.side === clickedTire.side && t.type === pairedType
        );
        if (pairedTire && selectedTireId === tireId) {
          setSelectedTireId(pairedTire.id);
          return;
        }
        const outerTire = TIRE_POSITIONS.find(
          t => t.axle === clickedTire.axle && t.side === clickedTire.side && t.type === 'dual-out'
        );
        if (outerTire && selectedTireId !== outerTire.id && selectedTireId !== pairedTire?.id) {
          setSelectedTireId(outerTire.id);
          return;
        }
      }
      setSelectedTireId(tireId);
    }
  };

  const handleSelectRims = () => {
    if (cameraView !== 'rack') {
      focusOnRack();
      if (!isSwapMode) {
        setSelectedTireId(null);
      }
      return;
    }
    setIsSwapMode(false);
    setSwapSourceId(null);
    setSelectedTireId('RIMS');
  };

  // Lastik Değişimi panel modu geçişi
  const handleReplaceTireClick = () => {
    const tire = isRackSlot ? (spareTiresData[selectedTireId] || {}) : (tiresData[selectedTireId] || {});
    setForm({
      brand: '',
      model: '',
      size: tire.size || '315/80 R22.5',
      installedKm: isRackSlot ? 0 : currentKm,
      installedDate: new Date().toISOString().split('T')[0],
      threadDepth: 15,
      status: 'İyi',
      tireType: 'Sıfır',
      notes: ''
    });
    setPanelMode('replace');
  };

  const currentTireKm = selectedTireId && selectedTireId !== 'RIMS'
    ? (isRackSlot ? (parseInt(form.installedKm) || 0) : calculateTireKm(form.installedKm))
    : 0;
  const hasActiveTireData = Boolean(form.brand || form.size || form.notes);



  const isPanelOpen = Boolean(selectedTireId && (selectedTireObj || selectedTireId === 'RIMS'));

  return (
    <div className="relative w-full h-full bg-[#070709] overflow-hidden font-sans select-none text-[var(--text-primary)]">
      
      {/* Floating Header (Mobil, iPad ve Masaüstünde Tek Satır Kompakt Obsidian Bar) */}
      <div className="absolute top-0 left-0 right-0 h-14 sm:h-16 bg-[#0a0d14]/80 backdrop-blur-xl border-b border-white/[0.06] px-3 sm:px-6 flex justify-between items-center gap-2 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 sm:p-2 bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 rounded-xl shadow-lg shrink-0">
            <Disc size={16} className="animate-pulse sm:w-[18px] sm:h-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                <span className="sm:hidden">Lastik & 3D</span>
                <span className="hidden sm:inline">Lastik Yönetimi & 3D Teşhis</span>
              </h2>
              {activeTruckData?.plate && (
                <span className="bg-slate-800/90 text-[10px] text-slate-200 font-extrabold px-1.5 sm:px-2 py-0.5 rounded border border-slate-700/60 uppercase shrink-0">
                  {activeTruckData.plate}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 hidden md:block truncate">
              Aracın 12 lastikli dijital ikiz simülasyonu ve ortak yedek lastik/jant istasyonu
            </p>
          </div>
        </div>

        {/* Sahne Odak Geçiş Butonları (Araç <-> Depo) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              focusOnTruck();
              if (selectedTireId === 'RIMS' || selectedTireId?.startsWith('SPARE_')) {
                setSelectedTireId(null);
              }
            }}
            className={`h-9 px-3 sm:px-3.5 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              cameraView === 'truck'
                ? 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-300 shadow-sm'
                : 'bg-slate-900/70 hover:bg-slate-800/90 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Truck size={13} />
            <span>Araç</span>
          </button>

          <button
            type="button"
            onClick={() => {
              focusOnRack();
              setSelectedTireId(null);
            }}
            className={`h-9 px-3 sm:px-3.5 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              cameraView === 'rack'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm'
                : 'bg-slate-900/70 hover:bg-slate-800/90 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Layers size={13} />
            <span>Depo</span>
          </button>

          {onClose && (
            <button 
              type="button"
              onClick={onClose} 
              className="w-9 h-9 bg-slate-900/60 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center ml-0.5"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* 3D Canvas Background Container (Tam Ekran: Mobilde çekmece açılınca yukarı, iPad/Masaüstünde sola kayar) */}
      <div className={`absolute inset-0 z-0 bg-[#09090b] transition-transform duration-500 ease-in-out w-full h-full md:w-[calc(100%+320px)] lg:w-[calc(100%+360px)] ${
        isPanelOpen
          ? '-translate-y-[18dvh] md:translate-y-0 md:-translate-x-[320px] lg:-translate-x-[360px]' 
          : 'translate-y-0 md:-translate-x-[160px] lg:-translate-x-[180px]'
      }`}>
        {hasError ? (
          <ErrorFallbackUI 
            error={errorObj} 
            selectedTireId={selectedTireId}
            onSelectTire={handleTireClick}
            tiresData={tiresData}
          />
        ) : (
          <div className="w-full h-full relative">
            <ErrorBoundary 
              onError={(error) => {
                setHasError(true);
                setErrorObj(error);
              }}
              onReset={() => {
                setHasError(false);
                setErrorObj(null);
              }}
            >
              <Canvas 
                shadows 
                gl={{ 
                  antialias: true, 
                  toneMapping: THREE.ACESFilmicToneMapping, 
                  toneMappingExposure: 1.25 
                }}
                camera={{ position: [0.2, 1.45, 6.2], fov: 48 }}
              >
                <color attach="background" args={["#09090b"]} />
                <fog attach="fog" args={["#09090b", 18, 42]} />
                <ambientLight intensity={0.4} color="#e0f2fe" />
                <directionalLight 
                  position={[10, 6, 8]} 
                  intensity={1.2} 
                  color="#fef3c7"
                  castShadow
                  shadow-mapSize-width={2048}
                  shadow-mapSize-height={2048}
                  shadow-bias={-0.0001}
                />
                <directionalLight position={[-10, 8, -8]} intensity={0.35} color="#cbd5e1" />
                <spotLight 
                  position={[0, 8, 0]} 
                  angle={0.8} 
                  penumbra={1} 
                  intensity={1.0} 
                  color="#ffffff" 
                />

                <Suspense fallback={<Loader3D />}>
                  <TruckModel 
                    selectedTireId={selectedTireId} 
                    onSelectTire={handleTireClick} 
                    tiresData={tiresData}
                    calibrationRef={calibrationRef}
                  />
                  <ShowroomEnvironment
                    spareTiresData={spareTiresData}
                    spareRimsData={spareRimsData}
                    selectedTireId={selectedTireId}
                    isSwapMode={isSwapMode}
                    isRackFocused={cameraView === 'rack'}
                    onSelectTire={handleTireClick}
                    onSelectRims={handleSelectRims}
                    onFocusRack={() => {
                      focusOnRack();
                      if (!isSwapMode) setSelectedTireId(null);
                    }}
                  />
                  <Environment preset="warehouse" />
                </Suspense>

                <CameraFocusController
                  controlsRef={controlsRef}
                  cameraTransitionRef={cameraTransitionRef}
                  cameraView={cameraView}
                />

                <ContactShadows 
                  position={[0, -0.49, 0]} 
                  opacity={0.75} 
                  scale={12} 
                  blur={2.8} 
                  far={1.2} 
                />

                {showGrid && (
                  <gridHelper 
                    args={[20, 20, '#d946ef', '#cbd5e1']} 
                    position={[0, -0.49, 0]} 
                  />
                )}

                <OrbitControls 
                  ref={controlsRef}
                  enableDamping 
                  dampingFactor={0.05}
                  minDistance={2.2} 
                  maxDistance={18.0} 
                  minPolarAngle={Math.PI / 3.8}
                  maxPolarAngle={Math.PI / 2.02}
                  autoRotate={isRotating}
                  autoRotateSpeed={0.8}
                  onStart={() => {
                    if (cameraTransitionRef.current) {
                      cameraTransitionRef.current.active = false;
                    }
                  }}
                />
              </Canvas>
            </ErrorBoundary>
          </div>
        )}
      </div>

      {/* 3D Kalibrasyon/İnce Ayar Paneli (Sadece araç üzerindeki tekerlekler seçiliyken görünür) */}
      {isCalibrationMode && !hasError && selectedTireId && selectedTireObj && !selectedTireObj.isRack && (
        <div className="absolute top-16 sm:top-20 left-3 sm:left-4 z-20 pointer-events-auto">
          {!showTuning ? (
            <button
              onClick={() => setShowTuning(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-white rounded-xl text-[11px] sm:text-xs font-semibold backdrop-blur-md transition-all shadow-lg hover:bg-slate-800"
              type="button"
            >
              <Sliders size={13} className="text-fuchsia-400" />
              <span className="hidden sm:inline">3D İnce Ayar (Kalibrasyon)</span>
              <span className="sm:hidden">Kalibrasyon</span>
            </button>
          ) : (
            <div className="w-64 bg-slate-900/95 border border-slate-850 p-4 rounded-2xl shadow-2xl backdrop-blur-md text-slate-200">
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-2 mb-3">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <Sliders size={13} className="text-fuchsia-400" />
                  <span>3D Hizalama Paneli</span>
                </span>
                <button
                  onClick={() => setShowTuning(false)}
                  className="text-[10px] text-slate-400 hover:text-white bg-slate-800 px-2 py-0.5 rounded-lg transition"
                  type="button"
                >
                  Kapat
                </button>
              </div>

              <div className="flex flex-col gap-2.5 text-[11px]">
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Yarıçap (R):</span>
                    <span id="val-radius" className="font-mono text-fuchsia-400">0.36</span>
                  </div>
                  <input
                    id="slider-radius"
                    type="range"
                    min="0.10"
                    max="0.50"
                    step="0.01"
                    defaultValue={calibrationRef.current.radius}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      const cal = calibrationRef.current;
                      if (!cal.sizes) cal.sizes = {};
                      if (!cal.sizes[selectedTireId]) cal.sizes[selectedTireId] = { radius: cal.radius, width: cal.width };
                      cal.sizes[selectedTireId].radius = val;
                      updateTextDisplays();
                    }}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Genişlik (W):</span>
                    <span id="val-width" className="font-mono text-fuchsia-400">0.24</span>
                  </div>
                  <input
                    id="slider-width"
                    type="range"
                    min="0.05"
                    max="0.40"
                    step="0.01"
                    defaultValue={calibrationRef.current.width}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      const cal = calibrationRef.current;
                      if (!cal.sizes) cal.sizes = {};
                      if (!cal.sizes[selectedTireId]) cal.sizes[selectedTireId] = { radius: cal.radius, width: cal.width };
                      cal.sizes[selectedTireId].width = val;
                      updateTextDisplays();
                    }}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                  />
                </div>

                <div className="border-t border-slate-800/85 my-1"></div>

                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Seçili Tekerlek ({selectedTireId})</span>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Konum X:</span>
                    <span id="val-offsetX" className="font-mono text-fuchsia-400">0.00</span>
                  </div>
                  <input
                    id="slider-offsetX"
                    type="range"
                    min="-0.5"
                    max="0.5"
                    step="0.01"
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (!calibrationRef.current.offsets) calibrationRef.current.offsets = {};
                      if (!calibrationRef.current.offsets[selectedTireId]) calibrationRef.current.offsets[selectedTireId] = [0, 0, 0];
                      calibrationRef.current.offsets[selectedTireId][0] = val;
                      updateTextDisplays();
                    }}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Konum Y:</span>
                    <span id="val-offsetY" className="font-mono text-fuchsia-400">0.00</span>
                  </div>
                  <input
                    id="slider-offsetY"
                    type="range"
                    min="-0.5"
                    max="0.5"
                    step="0.01"
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (!calibrationRef.current.offsets) calibrationRef.current.offsets = {};
                      if (!calibrationRef.current.offsets[selectedTireId]) calibrationRef.current.offsets[selectedTireId] = [0, 0, 0];
                      calibrationRef.current.offsets[selectedTireId][1] = val;
                      updateTextDisplays();
                    }}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Konum Z:</span>
                    <span id="val-offsetZ" className="font-mono text-fuchsia-400">0.00</span>
                  </div>
                  <input
                    id="slider-offsetZ"
                    type="range"
                    min="-0.5"
                    max="0.5"
                    step="0.01"
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (!calibrationRef.current.offsets) calibrationRef.current.offsets = {};
                      if (!calibrationRef.current.offsets[selectedTireId]) calibrationRef.current.offsets[selectedTireId] = [0, 0, 0];
                      calibrationRef.current.offsets[selectedTireId][2] = val;
                      updateTextDisplays();
                    }}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                  />
                </div>

                <div className="mt-2 bg-slate-950 p-2 rounded-lg border border-slate-800 flex flex-col gap-1.5">
                  <span className="text-[9px] text-slate-500 font-bold uppercase">Değer İşlemleri</span>
                  
                  <div id="val-copyable" className="font-mono text-[9px] text-emerald-400 select-all break-all bg-slate-900 px-1.5 py-1 rounded border border-slate-850">
                    pos3D: [0.00, 0.00, 0.00]
                  </div>

                  <div className="flex gap-1.5 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const txtCopy = document.getElementById('val-copyable');
                        if (txtCopy) {
                          navigator.clipboard.writeText(txtCopy.innerText);
                        }
                      }}
                      className="flex-1 py-1.5 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/20 rounded text-[10px] font-bold transition text-center"
                    >
                      Kopyala
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const ref = doc(db, 'trucks', activeTruckId, 'settings', 'calibration3d');
                          await setDoc(ref, calibrationRef.current);
                          alert('Kalibrasyon ayarları buluta kaydedildi! Her cihazda geçerli.');
                        } catch (e) {
                          alert('Kayıt hatası: ' + e.message);
                        }
                      }}
                      className="flex-1 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-bold transition text-center"
                    >
                      Kaydet
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm('Tüm tekerlek ince ayarlarını sıfırlamak istediğinize emin misiniz?')) {
                        calibrationRef.current = JSON.parse(JSON.stringify(DEFAULT_CALIBRATION));
                        try {
                          const ref = doc(db, 'trucks', activeTruckId, 'settings', 'calibration3d');
                          await setDoc(ref, calibrationRef.current);
                        } catch (e) {
                          console.warn('Sıfırlama kaydedilemedi:', e);
                        }
                        const sR = document.getElementById('slider-radius');
                        if (sR) sR.value = 0.36;
                        const sW = document.getElementById('slider-width');
                        if (sW) sW.value = 0.24;
                        ['offsetX', 'offsetY', 'offsetZ'].forEach(axis => {
                          const s = document.getElementById(`slider-${axis}`);
                          if (s) s.value = 0;
                        });
                        updateTextDisplays();
                        alert('Tüm kalibrasyon ayarları sıfırlandı ve buluta kaydedildi.');
                      }
                    }}
                    className="w-full py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60 rounded text-[9px] font-bold transition text-center"
                  >
                    Tümünü Sıfırla
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}



      {/* Swap Modu Uyarı Bannerı */}
      {isSwapMode && (
        <div className="absolute top-16 sm:top-20 left-1/2 transform -translate-x-1/2 z-30 bg-indigo-600/95 border border-indigo-400/60 text-white font-bold text-[11px] sm:text-xs py-2 sm:py-2.5 px-3.5 sm:px-5 rounded-2xl shadow-[0_4px_25px_rgba(99,102,241,0.5)] flex flex-wrap items-center justify-center gap-2 backdrop-blur-md w-[92vw] sm:w-auto max-w-[94vw]">
          <ArrowLeftRight size={14} className="animate-pulse text-indigo-200 shrink-0" />
          <span>Swap Modu: Hedef konumu seçin</span>
          <button
            type="button"
            onClick={() => {
              if (cameraView === 'rack') {
                focusOnTruck();
              } else {
                focusOnRack();
              }
            }}
            className="text-[10px] bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-lg border border-white/25 transition cursor-pointer flex items-center gap-1"
          >
            {cameraView === 'rack' ? <Truck size={11} /> : <Layers size={11} />}
            <span>{cameraView === 'rack' ? 'Araçtan Seç' : 'Depodan Seç'}</span>
          </button>
          <button 
            type="button"
            onClick={() => {
              setIsSwapMode(false);
              setSwapSourceId(null);
            }}
            className="text-[10px] bg-slate-950/60 hover:bg-slate-950/80 px-2.5 py-1 rounded-lg border border-white/20 transition cursor-pointer"
          >
            İptal
          </button>
        </div>
      )}

      {/* Sağ / Alt Panel - Yedek Jant Envanteri (Mobilde Bottom Sheet, iPad ve Masaüstünde Yan Çekmece) */}
      {selectedTireId === 'RIMS' && (
        <div className="fixed md:absolute bottom-0 md:bottom-auto inset-x-0 md:inset-x-auto md:top-20 md:right-4 lg:right-6 z-30 md:z-10 w-full md:w-[340px] lg:w-[390px] bg-[#0a0d14]/95 md:bg-[#0a0d14]/90 backdrop-blur-2xl border-t md:border border-white/[0.10] md:border-white/[0.08] rounded-t-3xl md:rounded-2xl p-4 sm:p-5 pb-6 md:pb-5 shadow-[0_-12px_40px_rgba(0,0,0,0.9)] md:shadow-[0_4px_30px_rgba(0,0,0,0.85)] flex flex-col gap-3.5 max-h-[56dvh] md:max-h-[calc(100dvh-100px)] overflow-y-auto overscroll-contain">
          <div className="w-10 h-1 bg-white/15 rounded-full mx-auto -mt-1 mb-0.5 md:hidden shrink-0" />
          <div className="flex justify-between items-center border-b border-white/[0.06] pb-3">
            <h3 className="text-sm font-bold text-white">Yedek Jant</h3>
            <button
              type="button"
              onClick={() => setSelectedTireId(null)}
              className="p-1.5 bg-slate-900/60 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          {/* Jant Sayısı Kontrol Kartı */}
          <div className="bg-slate-950/70 border border-slate-800/80 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Toplam Yedek Jant Adedi</span>
              <span className="text-[11px] text-slate-500 mt-0.5 block">En alt rafta yatay 3D olarak gösterilir</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleUpdateRimsCountImmediate((rimsForm.count || 0) - 1)}
                className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center transition cursor-pointer active:scale-95"
              >
                <Minus size={14} />
              </button>
              <input
                type="number"
                min="0"
                max="30"
                value={rimsForm.count}
                onChange={(e) => handleUpdateRimsCountImmediate(e.target.value)}
                className="w-14 text-center bg-slate-950 border border-sky-500/40 rounded-lg py-1 text-sm font-mono font-extrabold text-sky-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleUpdateRimsCountImmediate((rimsForm.count || 0) + 1)}
                className="w-8 h-8 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 flex items-center justify-center transition cursor-pointer active:scale-95"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Genel Jant Notları Formu */}
          <form onSubmit={handleSaveRims} className="flex flex-col gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                Genel Jant Notları
              </label>
              <textarea
                rows="5"
                value={rimsForm.notes}
                onChange={(e) => setRimsForm({ ...rimsForm, notes: e.target.value })}
                placeholder="Jant ebatları, çelik/alüminyum durumu veya genel envanter notlarını buraya yazın..."
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500 resize-none leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={savingRims}
              className="w-full py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-50 cursor-pointer"
            >
              <Save size={13} />
              <span>{savingRims ? 'Kaydediliyor...' : 'Jant Notlarını Kaydet'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Sağ / Alt Panel - Lastik Teşhis Formu / Detayları (Mobilde Bottom Sheet, iPad ve Masaüstünde Yan Çekmece) */}
      {selectedTireId && selectedTireObj && (
        <div className="fixed md:absolute bottom-0 md:bottom-auto inset-x-0 md:inset-x-auto md:top-20 md:right-4 lg:right-6 z-30 md:z-10 w-full md:w-[340px] lg:w-[390px] bg-[#0a0d14]/95 md:bg-[#0a0d14]/90 backdrop-blur-2xl border-t md:border border-white/[0.10] md:border-white/[0.08] rounded-t-3xl md:rounded-2xl p-4 sm:p-5 pb-6 md:pb-5 shadow-[0_-12px_40px_rgba(0,0,0,0.9)] md:shadow-[0_4px_30px_rgba(0,0,0,0.85)] flex flex-col max-h-[58dvh] md:max-h-[calc(100dvh-100px)] overflow-y-auto overscroll-contain">
          <div className="w-10 h-1 bg-white/15 rounded-full mx-auto -mt-1 mb-2.5 md:hidden shrink-0" />
          
          {/* INFO MODE */}
          {panelMode === 'info' && (
            <div className="flex flex-col gap-4">
              {/* Başlık Grubu */}
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  {!isRackSlot && (
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20 border text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        {selectedTireObj.group}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">{selectedTireId} Konumu</span>
                      {/* Çift tekerlek göstergesi */}
                      {(selectedTireObj.type === 'dual-out' || selectedTireObj.type === 'dual-in') && (() => {
                        const pairedType = selectedTireObj.type === 'dual-out' ? 'dual-in' : 'dual-out';
                        const pairedTire = TIRE_POSITIONS.find(
                          t => t.axle === selectedTireObj.axle && t.side === selectedTireObj.side && t.type === pairedType
                        );
                        return pairedTire ? (
                          <button
                            type="button"
                            onClick={() => setSelectedTireId(pairedTire.id)}
                            className="flex items-center gap-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 text-indigo-400 hover:text-indigo-300 text-[9px] font-bold px-2 py-0.5 rounded-full transition cursor-pointer"
                            title={`${pairedTire.label} lastiğine geç`}
                          >
                            <span>{selectedTireObj.type === 'dual-out' ? 'Dış' : 'İç'}</span>
                            <ArrowLeftRight size={9} />
                            <span>{pairedTire.type === 'dual-out' ? 'Dış' : 'İç'}</span>
                          </button>
                        ) : null;
                      })()}
                    </div>
                  )}
                  <h3 className="text-sm font-bold text-white">{isRackSlot ? 'Yedek Lastik' : selectedTireObj.label}</h3>
                </div>
                
                <button
                  type="button"
                  onClick={() => setSelectedTireId(null)}
                  className="p-1.5 bg-slate-900/60 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Eğer seçili olan bir Yedek Raf Slotu ise ve henüz lastik eklenmemişse (Boş Slot) */}
              {isRackSlot && !hasActiveTireData ? (
                <div className="bg-slate-950/70 border border-dashed border-slate-800 rounded-xl p-5 text-center flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center justify-center">
                    <Disc size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Bu Yedek Raf Slotu Boş</h4>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Bu slota yeni bir yedek lastik kaydedebilir veya araç üzerindeki bir lastiği buraya taşıyabilirsiniz.
                    </p>
                  </div>
                  <div className="w-full flex flex-col gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setForm({
                          brand: '',
                          model: '',
                          size: '315/80 R22.5',
                          installedKm: 0,
                          installedDate: new Date().toISOString().split('T')[0],
                          threadDepth: 15,
                          status: 'İyi',
                          tireType: 'Sıfır',
                          notes: ''
                        });
                        setPanelMode('edit');
                      }}
                      className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Bu Slota Yedek Lastik Ekle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsSwapMode(true);
                        setSwapSourceId(selectedTireId);
                        focusOnTruck();
                      }}
                      className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeftRight size={13} className="text-indigo-400" />
                      <span>Araçtan Bu Slota Lastik Taşı (Swap)</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Ömür Kartı */}
                  <div className="bg-slate-950/60 border border-slate-900/80 p-3 rounded-xl flex items-center justify-between shadow-inner">
                    <div>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
                        {isRackSlot ? 'Toplam Kullanılmış KM' : 'Çalışma Kilometresi'}
                      </span>
                      <span className="text-base font-black text-slate-100 mt-0.5 block font-mono">
                        {currentTireKm.toLocaleString()} KM
                      </span>
                    </div>
                    <div className={`p-1.5 rounded-lg border text-[10px] font-bold ${
                      form.status === 'Kritik' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                      form.status === 'Orta' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                      'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    }`}>
                      {form.status === 'Kritik' && 'Kritik Seviye'}
                      {form.status === 'Orta' && 'Orta Seviye'}
                      {form.status === 'İyi' && 'İyi / Sağlam'}
                    </div>
                  </div>

                  {/* Bilgi Detayları Grid */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-900/15 border border-slate-900/50 p-3 rounded-xl">
                    <div>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Marka</span>
                      <span className="text-xs text-slate-200 font-semibold mt-0.5 block">{form.brand || 'Belirtilmedi'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Model</span>
                      <span className="text-xs text-slate-200 font-semibold mt-0.5 block">{form.model || 'Belirtilmedi'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Ebat</span>
                      <span className="text-xs text-slate-200 font-semibold mt-0.5 block">{form.size || 'Belirtilmedi'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Diş Derinliği</span>
                      <span className="text-xs text-slate-200 font-semibold mt-0.5 block">{form.threadDepth ? `${form.threadDepth} mm` : 'Belirtilmedi'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
                        {isRackSlot ? 'Kullanılmış KM' : 'Takıldığı KM'}
                      </span>
                      <span className="text-xs text-slate-200 font-semibold mt-0.5 block">
                        {form.installedKm !== '' && form.installedKm !== undefined ? `${parseInt(form.installedKm).toLocaleString()} KM` : 'Belirtilmedi'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
                        {isRackSlot ? 'Kayıt Tarihi' : 'Takıldığı Tarih'}
                      </span>
                      <span className="text-xs text-slate-200 font-semibold mt-0.5 block">{form.installedDate || 'Belirtilmedi'}</span>
                    </div>
                    <div className="col-span-2 border-t border-slate-800/80 pt-2">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Kaplama / Sıfır</span>
                      <span className="text-xs text-slate-200 font-semibold mt-0.5 block">{form.tireType || 'Sıfır'}</span>
                    </div>
                    {form.notes && (
                      <div className="col-span-2 border-t border-slate-800/80 pt-2">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Notlar</span>
                        <span className="text-xs text-slate-300 mt-0.5 block break-words">{form.notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Hızlı Aksiyon & Düzenleme Butonları */}
                  <div className="mt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSwapMode(true);
                        setSwapSourceId(selectedTireId);
                        if (isRackSlot) {
                          focusOnTruck();
                        }
                      }}
                      className="w-full py-2.5 px-4 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ArrowLeftRight size={13} />
                      <span>{isRackSlot ? 'Bu Yedek Lastiği Araca Swapla' : 'Başka Lastikle / Yedek Rafıyla Swapla'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPanelMode('edit')}
                      className="w-full py-2.5 px-4 bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-600 hover:to-indigo-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg cursor-pointer border-none"
                    >
                      <Pencil size={13} />
                      <span>Bilgileri & Lastiği Düzenle</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* EDIT MODE */}
          {panelMode === 'edit' && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-wider block">
                    Bilgi Güncelleme
                  </span>
                  <h3 className="text-sm font-bold text-white">{isRackSlot ? 'Yedek Lastik' : selectedTireObj.label}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPanelMode('info')}
                  className="p-1.5 bg-slate-900/60 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              {/* İşlemler Alt-Menüsü */}
              <div className="bg-slate-950/80 border border-slate-900 p-2.5 rounded-xl flex justify-between gap-1.5 shadow-inner">
                <button
                  type="button"
                  onClick={handleReplaceTireClick}
                  className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[10px] font-bold text-slate-200 hover:text-white rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <RotateCcw size={11} className="text-indigo-400" />
                  <span>Değiştir</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setIsSwapMode(true);
                    setSwapSourceId(selectedTireId);
                  }}
                  className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[10px] font-bold text-slate-200 hover:text-white rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ArrowLeftRight size={11} className="text-emerald-400" />
                  <span>Swapla</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPanelMode('history')}
                  className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[10px] font-bold text-slate-200 hover:text-white rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <History size={11} className="text-amber-400" />
                  <span>Geçmiş</span>
                </button>

                {isRackSlot && hasActiveTireData && (
                  <button
                    type="button"
                    onClick={handleClearRackSlot}
                    className="py-1.5 px-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-[10px] font-bold text-red-400 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                    title="Bu raf slotunu boşalt"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>

              <form onSubmit={handleSave} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Marka</label>
                    <input
                      type="text"
                      required
                      value={form.brand}
                      onChange={e => setForm({ ...form, brand: e.target.value })}
                      className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                      placeholder="Örn: Michelin"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Model</label>
                    <input
                      type="text"
                      value={form.model}
                      onChange={e => setForm({ ...form, model: e.target.value })}
                      className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                      placeholder="Örn: X Multi Z"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Ebat</label>
                    <input
                      type="text"
                      value={form.size}
                      onChange={e => setForm({ ...form, size: e.target.value })}
                      className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                      placeholder="Örn: 385/65 R22.5"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                      {isRackSlot ? 'Kullanılmış KM' : 'Takıldığı KM'}
                    </label>
                    <input
                      type="number"
                      required
                      value={form.installedKm}
                      onChange={e => setForm({ ...form, installedKm: e.target.value })}
                      className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                      {isRackSlot ? 'Kayıt Tarihi' : 'Takıldığı Tarih'}
                    </label>
                    <input
                      type="date"
                      required
                      value={form.installedDate}
                      onChange={e => setForm({ ...form, installedDate: e.target.value })}
                      className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Diş Derinliği (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="20"
                      value={form.threadDepth}
                      onChange={e => setForm({ ...form, threadDepth: e.target.value })}
                      className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                      placeholder="Örn: 12.5"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Durum Seviyesi</label>
                    <select
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                    >
                      <option value="İyi">İyi (Sağlam / Yeni)</option>
                      <option value="Orta">Orta (Aşınma Başlamış)</option>
                      <option value="Kritik">Kritik (Acil Değişmeli)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Lastik Tipi</label>
                    <select
                      value={form.tireType}
                      onChange={e => setForm({ ...form, tireType: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                    >
                      <option value="Sıfır">Sıfır (Yeni)</option>
                      <option value="Kaplama">Kaplama</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Notlar</label>
                  <textarea
                    rows="2"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500 resize-none"
                    placeholder="Lastik notları..."
                  />
                </div>

                <div className="flex gap-2.5 mt-2 border-t border-slate-900 pt-3">
                  <button
                    type="button"
                    onClick={() => setPanelMode('info')}
                    className="flex-1 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-2 bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-600 hover:to-indigo-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-50 cursor-pointer border-none"
                  >
                    {saving ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <Save size={12} />
                        <span>Değişiklikleri Kaydet</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* REPLACE MODE */}
          {panelMode === 'replace' && (
            <form onSubmit={handleReplaceTireSubmit} className="flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider block">
                    Yeni Lastik Kaydı
                  </span>
                  <h3 className="text-sm font-bold text-white">{isRackSlot ? 'Yedek Lastik' : selectedTireObj.label}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPanelMode('info')}
                  className="p-1.5 bg-slate-900/60 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Marka</label>
                  <input
                    type="text"
                    required
                    value={form.brand}
                    onChange={e => setForm({ ...form, brand: e.target.value })}
                    className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                    placeholder="Örn: Bridgestone"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Model</label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={e => setForm({ ...form, model: e.target.value })}
                    className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                    placeholder="Örn: Ecopia"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Ebat</label>
                  <input
                    type="text"
                    value={form.size}
                    onChange={e => setForm({ ...form, size: e.target.value })}
                    className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                    placeholder="Örn: 385/65 R22.5"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                    {isRackSlot ? 'Kullanılmış KM' : 'Takıldığı KM'}
                  </label>
                  <input
                    type="number"
                    required
                    value={form.installedKm}
                    onChange={e => setForm({ ...form, installedKm: e.target.value })}
                    className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                    {isRackSlot ? 'Kayıt Tarihi' : 'Takıldığı Tarih'}
                  </label>
                  <input
                    type="date"
                    required
                    value={form.installedDate}
                    onChange={e => setForm({ ...form, installedDate: e.target.value })}
                    className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Diş Derinliği (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="20"
                    value={form.threadDepth}
                    onChange={e => setForm({ ...form, threadDepth: e.target.value })}
                    className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                    placeholder="Örn: 16.0"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Durum Seviyesi</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                  >
                    <option value="İyi">İyi (Sağlam / Yeni)</option>
                    <option value="Orta">Orta (Aşınma Başlamış)</option>
                    <option value="Kritik">Kritik (Acil Değişmeli)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Lastik Tipi</label>
                  <select
                    value={form.tireType}
                    onChange={e => setForm({ ...form, tireType: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                  >
                    <option value="Sıfır">Sıfır (Yeni)</option>
                    <option value="Kaplama">Kaplama</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Notlar</label>
                <textarea
                  rows="2"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500 resize-none"
                  placeholder="Değişimle ilgili notlar..."
                />
              </div>

              <div className="flex gap-2.5 mt-2 border-t border-slate-900 pt-3">
                <button
                  type="button"
                  onClick={() => setPanelMode('info')}
                  className="flex-1 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-600 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-50 cursor-pointer border-none"
                >
                  {saving ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Save size={12} />
                      <span>{isRackSlot ? 'Rafa Kaydet' : 'Yeni Lastik Tak'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* HISTORY MODE */}
          {panelMode === 'history' && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPanelMode('info')}
                    className="p-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
                  >
                    <ArrowLeft size={13} />
                  </button>
                  <h3 className="text-xs font-bold text-white">Lastik Geçmişi ({isRackSlot ? 'Yedek Lastik' : selectedTireObj.label})</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTireId(null)}
                  className="p-1.5 bg-slate-900/60 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              {tireHistory.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-xs">
                  Bu konum için eski lastik kaydı bulunamadı.
                </div>
              ) : (
                <div className="flex flex-col gap-3 overflow-y-auto max-h-[350px] pr-1.5">
                  {tireHistory.map((hist, idx) => (
                    <div key={idx} className="bg-slate-950/80 border border-slate-900/50 p-3.5 rounded-xl flex flex-col gap-2.5 shadow-inner">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-bold text-slate-200">{hist.brand} {hist.model}</span>
                          <span className="text-[9px] text-slate-400 block mt-0.5">{hist.size} ({hist.tireType || 'Sıfır'})</span>
                        </div>
                        <span className="bg-slate-900 border border-slate-800/80 text-[9px] text-slate-400 px-1.5 py-0.5 rounded font-mono">
                          {hist.removedDate}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-900/30 p-2 rounded-lg border border-slate-900/40">
                        <div>
                          <span className="text-slate-500 block">Takılan KM:</span>
                          <span className="text-slate-300 font-semibold">{hist.installedKm?.toLocaleString()} KM</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Sökülen KM:</span>
                          <span className="text-slate-300 font-semibold">{hist.removedKm?.toLocaleString()} KM</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Ömür:</span>
                          <span className="text-fuchsia-400 font-semibold font-mono">
                            {((hist.removedKm || 0) - (hist.installedKm || 0)).toLocaleString()} KM
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block font-sans">Takılma Tarihi:</span>
                          <span className="text-slate-300 font-sans">{hist.installedDate || '-'}</span>
                        </div>
                      </div>

                      {hist.notes && (
                        <p className="text-[10px] text-slate-400 italic bg-slate-900/20 p-2 rounded border border-slate-900/30">
                          {hist.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setPanelMode('info')}
                className="w-full mt-2 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Bilgilere Geri Dön
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

useGLTF.preload('/models/truck.glb');

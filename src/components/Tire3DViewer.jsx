import React, { useState, useEffect, Suspense, useRef, useMemo, useContext } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, useGLTF, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { db } from '../services/firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';
import { useTruck } from '../context/TruckContext';
import { Disc, Calendar, AlertTriangle, CheckCircle, Save, RotateCcw, Info, Sparkles, HelpCircle, Activity, Sliders, X, History, ArrowLeftRight, Pencil, ArrowLeft } from 'lucide-react';
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
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback(this.state.error);
    }
    return this.props.children;
  }
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

const DEFAULT_CALIBRATION = {
  radius: 0.36,
  width: 0.24,
  offsets: {
    L1: [0, 0, 0], R1: [0, 0, 0],
    L2_out: [0, 0, 0], L2_in: [0, 0, 0], R2_in: [0, 0, 0], R2_out: [0, 0, 0],
    TL1: [0, 0, 0], TR1: [0, 0, 0],
    TL2: [0, 0, 0], TR2: [0, 0, 0],
    TL3: [0, 0, 0], TR3: [0, 0, 0]
  },
  sizes: {}
};

// Lastik Vurgulama Bileşeni (3D Saydam Kaplama)
function TireOverlay({ tireId, tiresData, calibrationRef, isSelected, onSelectTire }) {
  const meshRef = useRef();

  const tireObj = useMemo(() => TIRE_POSITIONS.find(t => t.id === tireId), [tireId]);
  if (!tireObj) return null;

  // Lastik durum rengini belirle
  const statusColors = { İyi: '#10b981', Orta: '#f59e0b', Kritik: '#ef4444' };
  const status = tiresData?.[tireId]?.status || 'İyi';
  const baseColor = statusColors[status] || '#10b981';

  // Animasyon: Pulsing, yavaş dönme ve konum/ölçek güncelleme (sadece seçili tekerlek için aktif)
  useFrame((state) => {
    if (meshRef.current) {
      const cal = calibrationRef.current;
      const offsets = cal.offsets?.[tireId] || [0, 0, 0];
      
      // Konum güncellemesi (Zemin koordinatları)
      const x = tireObj.pos3D[0] + offsets[0];
      const y = tireObj.pos3D[1] + offsets[1];
      const z = tireObj.pos3D[2] + offsets[2];
      meshRef.current.position.set(x, y, z);

      // Ölçek güncellemesi (Yarıçap ve genişlik + pulsing)
      const r = cal.sizes?.[tireId]?.radius ?? cal.radius;
      const w = cal.sizes?.[tireId]?.width ?? cal.width;
      if (isSelected) {
        const pulse = 1 + Math.sin(state.clock.getElapsedTime() * 4.5) * 0.03;
        meshRef.current.scale.set(r * pulse, w, r * pulse);
        
        // Z ekseninde (tekerleğin dönüş yönünde) yavaş dönüş
        meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
      } else {
        meshRef.current.scale.set(r, w, r);
        meshRef.current.rotation.y = 0;
      }
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
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'auto';
      }}
    >
      {/* Base radius = 1, base height = 1. Scale makes it actual radius & width */}
      <cylinderGeometry args={[1, 1, 1, 32, 1, false]} />
      <meshStandardMaterial 
        color={baseColor}
        emissive={baseColor}
        emissiveIntensity={isSelected ? 1.2 : 0.4}
        transparent={true}
        opacity={isSelected ? 0.6 : 0.3}
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
function WorkshopToolbox({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Tekerlekler (Wheels/Casters) - Y=0.04 tekerlek merkezidir, böylece taban Y=0'a teğettir */}
      <mesh position={[-0.22, 0.04, 0.12]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.03, 8]} />
        <meshStandardMaterial color="#27272a" roughness={0.8} />
      </mesh>
      <mesh position={[0.22, 0.04, 0.12]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.03, 8]} />
        <meshStandardMaterial color="#27272a" roughness={0.8} />
      </mesh>
      <mesh position={[-0.22, 0.04, -0.12]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.03, 8]} />
        <meshStandardMaterial color="#27272a" roughness={0.8} />
      </mesh>
      <mesh position={[0.22, 0.04, -0.12]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.03, 8]} />
        <meshStandardMaterial color="#27272a" roughness={0.8} />
      </mesh>

      {/* Ana kırmızı gövde - Yükseklik 0.7 birim, Y=0.08'den başlar */}
      <mesh castShadow receiveShadow position={[0, 0.43, 0]}>
        <boxGeometry args={[0.6, 0.7, 0.4]} />
        <meshStandardMaterial color="#b91c1c" roughness={0.3} metalness={0.5} />
      </mesh>
      
      {/* Siyah üst kauçuk mat */}
      <mesh castShadow position={[0, 0.79, 0]}>
        <boxGeometry args={[0.62, 0.02, 0.42]} />
        <meshStandardMaterial color="#18181b" roughness={0.9} />
      </mesh>

      {/* Çekmeceler (Drawers) */}
      {[0.7, 0.59, 0.48, 0.37, 0.26, 0.15].map((yOffset, i) => (
        <group key={i} position={[0, yOffset, 0.201]}>
          {/* Çekmece çizgisi */}
          <mesh>
            <boxGeometry args={[0.54, 0.01, 0.005]} />
            <meshStandardMaterial color="#111113" />
          </mesh>
          {/* Gümüş Kulp (Handle) */}
          <mesh position={[0, 0.03, 0.005]}>
            <boxGeometry args={[0.3, 0.015, 0.015]} />
            <meshStandardMaterial color="#d1d5db" metalness={0.95} roughness={0.05} />
          </mesh>
        </group>
      ))}

      {/* Alet Asma Panosu (Pegboard Backing) */}
      {/* Yan Taşıyıcı Miller */}
      <mesh position={[-0.28, 1.1, -0.19]} castShadow>
        <boxGeometry args={[0.02, 0.6, 0.02]} />
        <meshStandardMaterial color="#4b5563" metalness={0.8} />
      </mesh>
      <mesh position={[0.28, 1.1, -0.19]} castShadow>
        <boxGeometry args={[0.02, 0.6, 0.02]} />
        <meshStandardMaterial color="#4b5563" metalness={0.8} />
      </mesh>
      {/* Pano Levhası */}
      <mesh position={[0, 1.1, -0.18]} castShadow>
        <boxGeometry args={[0.54, 0.6, 0.015]} />
        <meshStandardMaterial color="#374151" roughness={0.7} />
      </mesh>

      {/* Pano Üzerindeki Asılı Aletler */}
      {/* İngiliz Anahtarı (Wrench) */}
      <group position={[-0.12, 1.2, -0.17]} rotation={[0, 0, -Math.PI / 4]}>
        <mesh castShadow>
          <boxGeometry args={[0.02, 0.12, 0.008]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.008, 6]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>
      {/* Tornavida (Screwdriver) */}
      <group position={[0.08, 1.15, -0.17]}>
        {/* Sap */}
        <mesh position={[0, 0.04, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.05, 8]} />
          <meshStandardMaterial color="#dc2626" roughness={0.4} />
        </mesh>
        {/* Metal Mil */}
        <mesh position={[0, -0.03, 0]} castShadow>
          <cylinderGeometry args={[0.004, 0.004, 0.08, 8]} />
          <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.1} />
        </mesh>
      </group>

      {/* Diagnostik Laptop (Diagnostic Terminal) */}
      <group position={[0, 0.8, -0.05]}>
        {/* Laptop Alt Gövde */}
        <mesh position={[0, 0.0075, 0]} castShadow>
          <boxGeometry args={[0.22, 0.015, 0.16]} />
          <meshStandardMaterial color="#1f2937" roughness={0.5} />
        </mesh>
        {/* Laptop Ekran Kapağı */}
        <group position={[0, 0.015, -0.075]} rotation={[-Math.PI / 3, 0, 0]}>
          {/* Ekran Dış Çerçevesi */}
          <mesh position={[0, 0.075, 0]} castShadow>
            <boxGeometry args={[0.22, 0.15, 0.01]} />
            <meshStandardMaterial color="#1f2937" roughness={0.5} />
          </mesh>
          {/* Işıklı Ekran Paneli */}
          <mesh position={[0, 0.075, 0.006]}>
            <boxGeometry args={[0.2, 0.13, 0.002]} />
            <meshBasicMaterial color="#0284c7" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// Yedek Lastik Rafı (Tire Rack)
function TireRack({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      {/* 4 Dikey Demir Direk */}
      <mesh position={[-0.4, 0.4, -0.2]} castShadow>
        <boxGeometry args={[0.03, 0.8, 0.03]} />
        <meshStandardMaterial color="#4b5563" roughness={0.6} metalness={0.8} />
      </mesh>
      <mesh position={[0.4, 0.4, -0.2]} castShadow>
        <boxGeometry args={[0.03, 0.8, 0.03]} />
        <meshStandardMaterial color="#4b5563" roughness={0.6} metalness={0.8} />
      </mesh>
      <mesh position={[-0.4, 0.4, 0.2]} castShadow>
        <boxGeometry args={[0.03, 0.8, 0.03]} />
        <meshStandardMaterial color="#4b5563" roughness={0.6} metalness={0.8} />
      </mesh>
      <mesh position={[0.4, 0.4, 0.2]} castShadow>
        <boxGeometry args={[0.03, 0.8, 0.03]} />
        <meshStandardMaterial color="#4b5563" roughness={0.6} metalness={0.8} />
      </mesh>

      {/* Yatay Raf Rayları */}
      <mesh position={[0, 0.15, 0.19]} castShadow>
        <boxGeometry args={[0.8, 0.02, 0.02]} />
        <meshStandardMaterial color="#374151" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.15, -0.19]} castShadow>
        <boxGeometry args={[0.8, 0.02, 0.02]} />
        <meshStandardMaterial color="#374151" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.78, 0.19]} castShadow>
        <boxGeometry args={[0.8, 0.02, 0.02]} />
        <meshStandardMaterial color="#374151" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.78, -0.19]} castShadow>
        <boxGeometry args={[0.8, 0.02, 0.02]} />
        <meshStandardMaterial color="#374151" roughness={0.5} />
      </mesh>
      {/* Yan Kirişler */}
      <mesh position={[-0.4, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.02, 0.4, 0.02]} />
        <meshStandardMaterial color="#374151" roughness={0.5} />
      </mesh>
      <mesh position={[0.4, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.02, 0.4, 0.02]} />
        <meshStandardMaterial color="#374151" roughness={0.5} />
      </mesh>

      {/* Raftaki 3 Yedek Lastik */}
      {[-0.22, 0, 0.22].map((xOffset, i) => (
        <group key={i} position={[xOffset, 0.36, 0]} rotation={[0, Math.PI / 2, 0]}>
          {/* Lastik Dış Gövde */}
          <mesh castShadow>
            <torusGeometry args={[0.2, 0.07, 12, 24]} />
            <meshStandardMaterial color="#1e1e20" roughness={0.9} />
          </mesh>
          {/* Lastik İç Jant */}
          <mesh castShadow>
            <cylinderGeometry args={[0.13, 0.13, 0.1, 12]} />
            <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.4} />
          </mesh>
          {/* Jant Göbeği Siyah */}
          <mesh position={[0, 0, 0.051]}>
            <cylinderGeometry args={[0.05, 0.05, 0.01, 8]} />
            <meshStandardMaterial color="#111113" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Mekanik Tamirhane Zemin ve Lift Bileşeni
function MechanicGarage() {
  return (
    <group position={[0, -0.6, 0]}>
      {/* Genişletilmiş Koyu Beton Zemin */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial 
          color="#121216" 
          roughness={0.65} 
          metalness={0.15} 
        />
      </mesh>

      {/* Zemin Derz Çizgileri (Gri Karolar oluşturmak için çok ince çizgiler) */}
      {[-15, -10, -5, 0, 5, 10, 15].map((coord, idx) => (
        <group key={idx}>
          {/* X Eksenine paralel derzler */}
          <mesh position={[0, 0.001, coord]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[100, 0.015]} />
            <meshBasicMaterial color="#0c0c0f" transparent opacity={0.6} />
          </mesh>
          {/* Z Eksenine paralel derzler */}
          <mesh position={[coord, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.015, 100]} />
            <meshBasicMaterial color="#0c0c0f" transparent opacity={0.6} />
          </mesh>
        </group>
      ))}

      {/* Lift Etrafındaki Sarı-Siyah Güvenlik Sınır Çizgileri */}
      {/* Ön Sınır */}
      <mesh position={[-2.7, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.04, 2.0]} />
        <meshBasicMaterial color="#eab308" />
      </mesh>
      {/* Arka Sınır */}
      <mesh position={[3.3, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.04, 2.0]} />
        <meshBasicMaterial color="#eab308" />
      </mesh>
      {/* Sol Sınır */}
      <mesh position={[0.3, 0.002, 1.0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.0, 0.04]} />
        <meshBasicMaterial color="#eab308" />
      </mesh>
      {/* Sağ Sınır */}
      <mesh position={[0.3, 0.002, -1.0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.0, 0.04]} />
        <meshBasicMaterial color="#eab308" />
      </mesh>

      {/* Lift Rayları / Platformları (Tekerleklerin tam altına hizalanmış) */}
      {/* Sol rampa */}
      <mesh position={[0.3, 0.1, 0.55]} castShadow receiveShadow>
        <boxGeometry args={[5.6, 0.1, 0.4]} />
        <meshStandardMaterial color="#2d2d34" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Sağ rampa */}
      <mesh position={[0.3, 0.1, -0.55]} castShadow receiveShadow>
        <boxGeometry args={[5.6, 0.1, 0.4]} />
        <meshStandardMaterial color="#2d2d34" roughness={0.5} metalness={0.7} />
      </mesh>

      {/* Rampaların İniş/Biniş Eğimleri */}
      {/* Sol Rampa Ön Eğim */}
      <mesh position={[-2.65, 0.05, 0.55]} rotation={[0, 0, 0.15]} castShadow>
        <boxGeometry args={[0.3, 0.1, 0.4]} />
        <meshStandardMaterial color="#2d2d34" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Sol Rampa Arka Eğim */}
      <mesh position={[3.25, 0.05, 0.55]} rotation={[0, 0, -0.15]} castShadow>
        <boxGeometry args={[0.3, 0.1, 0.4]} />
        <meshStandardMaterial color="#2d2d34" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Sağ Rampa Ön Eğim */}
      <mesh position={[-2.65, 0.05, -0.55]} rotation={[0, 0, 0.15]} castShadow>
        <boxGeometry args={[0.3, 0.1, 0.4]} />
        <meshStandardMaterial color="#2d2d34" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Sağ Rampa Arka Eğim */}
      <mesh position={[3.25, 0.05, -0.55]} rotation={[0, 0, -0.15]} castShadow>
        <boxGeometry args={[0.3, 0.1, 0.4]} />
        <meshStandardMaterial color="#2d2d34" roughness={0.5} metalness={0.7} />
      </mesh>

      {/* Rampa Bağlantı Kirişleri */}
      <mesh position={[-1.8, 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 0.06, 1.1]} />
        <meshStandardMaterial color="#202024" roughness={0.6} metalness={0.7} />
      </mesh>
      <mesh position={[1.4, 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 0.06, 1.1]} />
        <meshStandardMaterial color="#202024" roughness={0.6} metalness={0.7} />
      </mesh>

      {/* Düşük Profilli Arka Plan Ekipmanları */}
      {/* Alet Dolabı - Yolcu Tarafı Arka Köşe */}
      <WorkshopToolbox position={[3.4, 0, -2.0]} rotation={[0, -Math.PI / 4, 0]} />

      {/* Lastik Rafı - Yolcu Tarafı Ön Köşe */}
      <TireRack position={[-3.4, 0, -2.0]} rotation={[0, Math.PI / 4, 0]} />
    </group>
  );
}

// Ana Lastik Yönetim Bileşeni
export default function Tire3DViewer({ currentKm, onClose }) {
  const { activeTruckId, activeTruckData } = useTruck();
  const { addMaintenance } = useContext(DataContext);

  const [selectedTireId, setSelectedTireId] = useState(null);
  const [isRotating, setIsRotating] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorObj, setErrorObj] = useState(null);
  const controlsRef = useRef(null);

  const [showTuning, setShowTuning] = useState(false);
  const isCalibrationMode = true; // Koordinat ince ayar aracı her zaman açık olarak istendi

  // Sağ panel modları: 'info' (okuma), 'edit' (güncelleme), 'replace' (yeni lastik takma), 'history' (tarihçe)
  const [panelMode, setPanelMode] = useState('info');

  // Swap / Rotasyon durumu
  const [isSwapMode, setIsSwapMode] = useState(false);
  const [swapSourceId, setSwapSourceId] = useState(null);
  
  // Kalibrasyon değerlerini localStorage'dan yükle veya varsayılanı kullan
  const calibrationRef = useRef(useMemo(() => {
    try {
      const saved = localStorage.getItem('tire-3d-calibrations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.offsets) parsed.offsets = {};
        if (!parsed.sizes) parsed.sizes = {};
        TIRE_POSITIONS.forEach(p => {
          if (!parsed.offsets[p.id]) parsed.offsets[p.id] = [0, 0, 0];
        });
        return parsed;
      }
    } catch (e) {
      console.warn("Failed to load calibrations:", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CALIBRATION));
  }, []));

  // UI metinlerini DOM manipülasyonu ile anlık olarak güncelleyen optimize fonksiyon
  const updateTextDisplays = () => {
    const cal = calibrationRef.current;
    if (!selectedTireObj) return;

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
    if (selectedTireId && !cal.offsets[selectedTireId]) {
      cal.offsets[selectedTireId] = [0, 0, 0];
    }
    cal.selectedId = selectedTireId;

    const currentOffsets = selectedTireId ? cal.offsets[selectedTireId] : [0, 0, 0];

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

  // Firestore'dan gelen lastik verileri
  const tiresData = activeTruckData?.tires || {};

  // Tekerlek geçmişini filtreleyen memo
  const tireHistory = useMemo(() => {
    if (!activeTruckData?.tiresHistory) return [];
    return activeTruckData.tiresHistory
      .filter(record => record.tireId === selectedTireId)
      .sort((a, b) => new Date(b.removedDate) - new Date(a.removedDate));
  }, [activeTruckData?.tiresHistory, selectedTireId]);

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

  // Seçilen lastik değiştikçe formu doldur
  useEffect(() => {
    if (selectedTireId) {
      const tire = tiresData[selectedTireId] || {};
      setForm({
        brand: tire.brand || '',
        model: tire.model || '',
        size: tire.size || '',
        installedKm: tire.installedKm || '',
        installedDate: tire.installedDate || '',
        threadDepth: tire.threadDepth || '',
        status: tire.status || 'İyi',
        tireType: tire.tireType || 'Sıfır',
        notes: tire.notes || ''
      });
    }
  }, [selectedTireId, activeTruckData]);

  // Bilgi Düzenleme Kaydı (Okuma modundaki editör)
  const handleSave = async (e) => {
    e.preventDefault();
    if (!activeTruckId || !selectedTireId) return;

    setSaving(true);
    try {
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

      // Log in maintenance records
      await addMaintenance({
        date: new Date().toISOString().split('T')[0],
        type: 'Lastik Bilgi Güncelleme',
        description: `${selectedTireObj.label} konumundaki lastik bilgileri güncellendi. Yeni: ${form.brand} ${form.model} (${form.installedKm} KM) - Tip: ${form.tireType}`,
        km: currentKm,
        cost: 0,
        files: [],
        doneItems: []
      });

      setPanelMode('info');
    } catch (error) {
      alert('Lastik kaydı güncellenirken hata oluştu: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Yeni Lastik Kurulum Kaydı (Arşivleme ve Değiştirme)
  const handleReplaceTireSubmit = async (e) => {
    e.preventDefault();
    if (!activeTruckId || !selectedTireId) return;

    setSaving(true);
    try {
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

      // Log in maintenance records
      await addMaintenance({
        date: new Date().toISOString().split('T')[0],
        type: 'Lastik Değişimi',
        description: `${selectedTireObj.label} konumundaki lastik yenisiyle değiştirildi. Eski: ${oldTire.brand || 'Belirtilmedi'} ${oldTire.model || ''} (${oldTire.installedKm || 0} KM), Yeni: ${form.brand} ${form.model} (Takılan KM: ${form.installedKm} KM) - Tip: ${form.tireType}`,
        km: currentKm,
        cost: 0,
        files: [],
        doneItems: []
      });

      setPanelMode('info');
    } catch (error) {
      alert('Lastik değiştirilirken hata oluştu: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Swap / Rotasyon yerleştirme tıklaması tetikleme
  const handleTireClick = async (tireId) => {
    if (isSwapMode) {
      if (tireId === swapSourceId) {
        setIsSwapMode(false);
        setSwapSourceId(null);
        return;
      }
      
      const sourceTireObj = TIRE_POSITIONS.find(t => t.id === swapSourceId);
      const targetTireObj = TIRE_POSITIONS.find(t => t.id === tireId);
      const sourceTireData = tiresData[swapSourceId] || {};
      const targetTireData = tiresData[tireId] || {};
      
      const confirmText = `${sourceTireObj.label} (${sourceTireData.brand || 'Boş'}) ile ${targetTireObj.label} (${targetTireData.brand || 'Boş'}) lastiklerinin yerlerini (konumlarını) ve tüm verilerini değiştirmek istiyor musunuz?`;
      
      if (window.confirm(confirmText)) {
        try {
          const truckRef = doc(db, 'trucks', activeTruckId);
          
          await updateDoc(truckRef, {
            [`tires.${swapSourceId}`]: targetTireData,
            [`tires.${tireId}`]: sourceTireData
          });
          
          await addMaintenance({
            date: new Date().toISOString().split('T')[0],
            type: 'Lastik Rotasyonu',
            description: `${sourceTireObj.label} (${sourceTireData.brand || 'Belirtilmedi'} ${sourceTireData.model || ''}) ile ${targetTireObj.label} (${targetTireData.brand || 'Belirtilmedi'} ${targetTireData.model || ''}) lastiklerinin yerleri değiştirildi (swap).`,
            km: currentKm,
            cost: 0,
            files: [],
            doneItems: []
          });
          
          alert('Lastik konumları başarıyla swaplandı (yer değiştirildi).');
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
      setSelectedTireId(tireId);
    }
  };

  // Lastik Değişimi panel modu geçişi
  const handleReplaceTireClick = () => {
    const tire = tiresData[selectedTireId] || {};
    setForm({
      brand: '',
      model: '',
      size: tire.size || '',
      installedKm: currentKm,
      installedDate: new Date().toISOString().split('T')[0],
      threadDepth: 15,
      status: 'İyi',
      tireType: 'Sıfır',
      notes: ''
    });
    setPanelMode('replace');
  };

  // Kamerayı Sıfırla
  const handleResetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  // Lastik KM hesaplama
  const calculateTireKm = (installedKm) => {
    const km = parseInt(installedKm);
    if (isNaN(km) || km <= 0) return 0;
    const diff = currentKm - km;
    return diff > 0 ? diff : 0;
  };

  const selectedTireObj = TIRE_POSITIONS.find(t => t.id === selectedTireId);
  const currentTireKm = selectedTireId ? calculateTireKm(form.installedKm) : 0;



  return (
    <div className="relative w-full h-full min-h-screen lg:h-screen bg-[#070709] overflow-hidden flex flex-col lg:block font-sans select-none text-[var(--text-primary)]">
      
      {/* Floating Header */}
      <div className="w-full h-16 bg-[#0c0c0f]/40 backdrop-blur-md border-b border-slate-800/40 px-6 flex justify-between items-center z-20 flex-shrink-0 lg:absolute lg:top-0 lg:left-0 lg:right-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 rounded-xl shadow-lg">
            <Disc size={18} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide">Lastik Yönetimi & 3D Teşhis</h2>
              {activeTruckData?.plate && (
                <span className="bg-slate-800 text-[10px] text-slate-300 font-extrabold px-2 py-0.5 rounded border border-slate-700/60 uppercase">
                  {activeTruckData.plate}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400">Aracın 12 lastikli dijital ikiz simülasyonu ve aktif durum paneli</p>
          </div>
        </div>
        
        {onClose && (
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 bg-slate-900/60 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* 3D Canvas Background Container */}
      <div className={`h-[45vh] lg:h-full lg:absolute lg:inset-0 lg:z-0 bg-[#070709] transition-transform duration-500 ease-in-out w-full lg:w-[calc(100%+360px)] ${
        selectedTireId && selectedTireObj 
          ? 'lg:-translate-x-[360px]' 
          : 'lg:-translate-x-[180px]'
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
              fallback={(error) => {
                setHasError(true);
                setErrorObj(error);
                return null;
              }}
            >
              <Canvas camera={{ position: [5, 3, 6], fov: 50 }}>
                <color attach="background" args={["#0c0c0f"]} />
                <fog attach="fog" args={["#0c0c0f", 8, 22]} />
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 5]} intensity={1.2} />
                <directionalLight position={[-10, 5, -5]} intensity={0.3} />
                <pointLight position={[0, 4, 0]} intensity={0.5} />
                <spotLight 
                  position={[0, 8, 0]} 
                  angle={0.6} 
                  penumbra={1} 
                  intensity={2.5} 
                  castShadow 
                  color="#fef08a" 
                />

                <Suspense fallback={<Loader3D />}>
                  <TruckModel 
                    selectedTireId={selectedTireId} 
                    onSelectTire={handleTireClick} 
                    tiresData={tiresData}
                    calibrationRef={calibrationRef}
                  />
                  <MechanicGarage />
                  <Environment preset="city" />
                </Suspense>

                <ContactShadows 
                  position={[0, -0.6, 0]} 
                  opacity={0.8} 
                  scale={12} 
                  blur={2.4} 
                  far={1.2} 
                />

                {showGrid && (
                  <gridHelper 
                    args={[20, 20, '#d946ef', '#1e293b']} 
                    position={[0, -0.61, 0]} 
                  />
                )}

                <OrbitControls 
                  ref={controlsRef}
                  enableDamping 
                  dampingFactor={0.05}
                  minDistance={3} 
                  maxDistance={12} 
                  maxPolarAngle={Math.PI / 2}
                  autoRotate={isRotating}
                  autoRotateSpeed={0.8}
                />
              </Canvas>
            </ErrorBoundary>
          </div>
        )}
      </div>

      {/* 3D Kalibrasyon/İnce Ayar Paneli (Şshifted out of translated container to prevent clipping) */}
      {isCalibrationMode && !hasError && selectedTireId && selectedTireObj && (
        <div className="absolute top-20 left-4 z-20 pointer-events-auto">
          {!showTuning ? (
            <button
              onClick={() => setShowTuning(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-white rounded-xl text-xs font-semibold backdrop-blur-md transition-all shadow-lg hover:bg-slate-800"
              type="button"
            >
              <Sliders size={13} className="text-fuchsia-400" />
              <span>3D İnce Ayar (Kalibrasyon)</span>
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
                      onClick={() => {
                        localStorage.setItem('tire-3d-calibrations', JSON.stringify(calibrationRef.current));
                        alert('Kalibrasyon ayarları tarayıcı belleğine kaydedildi!');
                      }}
                      className="flex-1 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-bold transition text-center"
                    >
                      Kaydet
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Tüm tekerlek ince ayarlarını sıfırlamak istediğinize emin misiniz?')) {
                        localStorage.removeItem('tire-3d-calibrations');
                        calibrationRef.current = JSON.parse(JSON.stringify(DEFAULT_CALIBRATION));
                        
                        const sR = document.getElementById('slider-radius');
                        if (sR) sR.value = 0.36;
                        const sW = document.getElementById('slider-width');
                        if (sW) sW.value = 0.24;
                        ['offsetX', 'offsetY', 'offsetZ'].forEach(axis => {
                          const s = document.getElementById(`slider-${axis}`);
                          if (s) s.value = 0;
                        });
                        
                        updateTextDisplays();
                        alert('Tüm kalibrasyon ayarları sıfırlandı.');
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
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-30 bg-indigo-600/90 border border-indigo-500 text-white font-bold text-xs py-2.5 px-5 rounded-2xl shadow-[0_4px_25px_rgba(99,102,241,0.5)] flex items-center gap-2 animate-bounce backdrop-blur-md">
          <ArrowLeftRight size={14} className="animate-pulse text-indigo-200" />
          <span>Lastik Swap Modu: Yerini değiştirmek istediğiniz diğer lastiği seçin...</span>
          <button 
            type="button"
            onClick={() => {
              setIsSwapMode(false);
              setSwapSourceId(null);
            }}
            className="ml-4 text-[10px] bg-slate-950/60 hover:bg-slate-950/80 px-2 py-0.5 rounded border border-white/20 transition cursor-pointer"
          >
            İptal
          </button>
        </div>
      )}

      {/* Sağ Panel - Lastik Teşhis Formu / Detayları */}
      {selectedTireId && selectedTireObj && (
        <div className="w-full lg:w-[380px] lg:absolute lg:top-20 lg:right-6 lg:z-10 bg-slate-950/65 backdrop-blur-lg border border-slate-800/80 rounded-2xl p-5 shadow-[0_4px_30px_rgba(0,0,0,0.8)] flex flex-col max-h-[calc(100vh-120px)] overflow-y-auto">
          
          {/* INFO MODE */}
          {panelMode === 'info' && (
            <div className="flex flex-col gap-4">
              {/* Başlık Grubu */}
              <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {selectedTireObj.group}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">{selectedTireId} Konumu</span>
                  </div>
                  <h3 className="text-sm font-bold text-white mt-1">{selectedTireObj.label}</h3>
                </div>
                
                <button
                  type="button"
                  onClick={() => setSelectedTireId(null)}
                  className="p-1.5 bg-slate-900/60 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Ömür Kartı */}
              <div className="bg-slate-950/60 border border-slate-900/80 p-3 rounded-xl flex items-center justify-between shadow-inner">
                <div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Çalışma Kilometresi</span>
                  <span className="text-base font-black text-slate-100 mt-0.5 block">
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
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Takıldığı KM</span>
                  <span className="text-xs text-slate-200 font-semibold mt-0.5 block">{form.installedKm ? `${parseInt(form.installedKm).toLocaleString()} KM` : 'Belirtilmedi'}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Takıldığı Tarih</span>
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

              {/* Buton Grubu (Apple/Minimal Reorganizasyonu!) */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setPanelMode('edit')}
                  className="w-full py-3 px-4 bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-600 hover:to-indigo-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg cursor-pointer border-none"
                >
                  <Pencil size={13} />
                  <span>Bilgileri & Lastiği Düzenle</span>
                </button>
              </div>
            </div>
          )}

          {/* EDIT MODE */}
          {panelMode === 'edit' && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-wider block">Bilgi Güncelleme</span>
                  <h3 className="text-sm font-bold text-white">{selectedTireObj.label}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPanelMode('info')}
                  className="p-1.5 bg-slate-900/60 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              {/* İşlemler Alt-Menüsü (Yeni Reorganizasyon!) */}
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
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Takıldığı KM</label>
                    <input
                      type="number"
                      required
                      value={form.installedKm}
                      onChange={e => setForm({ ...form, installedKm: e.target.value })}
                      className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Takıldığı Tarih</label>
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
                  <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider block">Yeni Lastik Takma</span>
                  <h3 className="text-sm font-bold text-white">{selectedTireObj.label}</h3>
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
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Takıldığı KM</label>
                  <input
                    type="number"
                    required
                    value={form.installedKm}
                    onChange={e => setForm({ ...form, installedKm: e.target.value })}
                    className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Takıldığı Tarih</label>
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
                      <span>Yeni Lastik Tak</span>
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
                  <h3 className="text-xs font-bold text-white">Lastik Geçmişi ({selectedTireObj.label})</h3>
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
                  Bu tekerlek konumu için eski lastik kaydı bulunamadı.
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

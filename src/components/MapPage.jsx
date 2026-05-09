import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import L from 'leaflet';
import { Navigation, Menu, History, Smartphone, ChevronRight, X } from 'lucide-react';
import NavigationOverlay from './NavigationOverlay';

// İkonlar
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const truckIcon = new L.Icon({
    iconUrl: '/tir-clear.png?v=8',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
    className: 'bg-white rounded-full p-1 border-2 border-indigo-500 shadow-[0_4px_12px_rgba(99,102,241,0.5)] object-contain'
});

const userIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/3603/3603850.png', // Mavi nokta
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    className: 'animate-pulse'
});

// Kamera Takibi Componenti
function CameraTracker({ location, isFollowing }) {
    const map = useMap();
    useEffect(() => {
        if (isFollowing && location) {
            map.flyTo([location.lat, location.lng], 15, { animate: true, duration: 1 });
        }
    }, [location, isFollowing, map]);
    return null;
}

export default function MapPage() {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // UI States
    const [showSidebar, setShowSidebar] = useState(false);
    const [sidebarTab, setSidebarTab] = useState('history'); // 'history' | 'devices'
    
    // Navigasyon States
    const [selectedSession, setSelectedSession] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [isFollowing, setIsFollowing] = useState(false);
    const watchIdRef = useRef(null);

    useEffect(() => {
        // Son 1000 konumu getir
        const q = query(
            collection(db, "truck_routes"),
            orderBy("timestamp", "asc"),
            limit(1000)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const locs = [];
            snapshot.forEach((doc) => {
                locs.push({ id: doc.id, ...doc.data() });
            });
            setLocations(locs);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Rotalari cihazlara (driverId) gore grupla ve 30 dk mantigi ile sessionlara ayir
    const sessionsByDriver = {};
    const groupedByDriver = locations.reduce((acc, loc) => {
        const driver = loc.driverId || 'Bilinmeyen_Sofor';
        if (!acc[driver]) acc[driver] = [];
        acc[driver].push(loc);
        return acc;
    }, {});

    Object.keys(groupedByDriver).forEach(driver => {
        const points = groupedByDriver[driver];
        const sessions = [];
        let currentSession = [];
        
        for (let i = 0; i < points.length; i++) {
            if (currentSession.length === 0) {
                currentSession.push(points[i]);
                continue;
            }
            const lastPointTime = new Date(currentSession[currentSession.length - 1].timestamp).getTime();
            const currentPointTime = new Date(points[i].timestamp).getTime();
            
            // 30 dk = 1800000 ms -> Eger iki nokta arasi 30 dk varsa, yeni bir sefer (session) baslamistir
            if (currentPointTime - lastPointTime > 1800000) {
                sessions.push(currentSession);
                currentSession = [points[i]];
            } else {
                currentSession.push(points[i]);
            }
        }
        if (currentSession.length > 0) {
            sessions.push(currentSession);
        }
        sessionsByDriver[driver] = sessions;
    });

    // Navigasyon Baslat / Durdur
    const startNavigation = (session) => {
        setSelectedSession({
            ...session,
            driverId: session[0].driverId
        });
        setIsFollowing(true);
        setShowSidebar(false);

        // Tarayici GPS'ini ac
        if (navigator.geolocation) {
            watchIdRef.current = navigator.geolocation.watchPosition(
                (pos) => {
                    setUserLocation({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        speed: pos.coords.speed * 3.6, // m/s to km/h
                        heading: pos.coords.heading
                    });
                },
                (err) => console.error("GPS Hatasi:", err),
                { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
            );
        }
    };

    const stopNavigation = () => {
        setSelectedSession(null);
        setIsFollowing(false);
        setUserLocation(null);
        if (watchIdRef.current) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }
    };

    const defaultCenter = [39.0, 35.0];

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] relative bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
            
            {/* Ust Bar */}
            <div className="absolute top-0 left-0 right-0 z-[1000] p-4 flex justify-between pointer-events-none">
                <div className="bg-slate-900/80 backdrop-blur-md p-3 rounded-2xl border border-slate-700/50 shadow-lg pointer-events-auto flex items-center gap-3">
                    <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-300">
                        <Menu size={20} />
                    </button>
                    <div>
                        <h2 className="text-white font-semibold leading-tight">Filo İzleme</h2>
                        <p className="text-slate-400 text-xs">
                            {Object.keys(groupedByDriver).length} Cihaz
                        </p>
                    </div>
                </div>
            </div>

            {/* Yan Panel (Sidebar) */}
            <div className={`absolute top-0 left-0 bottom-0 w-80 bg-slate-900/95 backdrop-blur-xl border-r border-slate-700/50 z-[2000] shadow-2xl transition-transform duration-300 flex flex-col ${showSidebar ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-4 border-b border-slate-700/50 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white">Yönetim Paneli</h2>
                    <button onClick={() => setShowSidebar(false)} className="text-slate-400 hover:text-white p-1">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="flex border-b border-slate-700/50">
                    <button 
                        onClick={() => setSidebarTab('history')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${sidebarTab === 'history' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                    >
                        <History size={16} className="inline mr-2" /> Rotalar
                    </button>
                    <button 
                        onClick={() => setSidebarTab('devices')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${sidebarTab === 'devices' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                    >
                        <Smartphone size={16} className="inline mr-2" /> Cihazlar
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {sidebarTab === 'history' ? (
                        <div className="space-y-4">
                            {Object.entries(sessionsByDriver).map(([driver, sessions]) => (
                                <div key={driver} className="mb-4">
                                    <h3 className="text-slate-300 font-semibold mb-2 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        {driver}
                                    </h3>
                                    <div className="space-y-2">
                                        {sessions.map((session, i) => {
                                            const start = new Date(session[0].timestamp).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'});
                                            const end = new Date(session[session.length-1].timestamp).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'});
                                            const date = new Date(session[0].timestamp).toLocaleDateString('tr-TR');
                                            
                                            return (
                                                <button 
                                                    key={i} 
                                                    onClick={() => startNavigation(session)}
                                                    className="w-full text-left p-3 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 transition-colors group"
                                                >
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-white text-sm font-medium">Oturum {sessions.length - i}</span>
                                                        <ChevronRight size={16} className="text-slate-500 group-hover:text-indigo-400" />
                                                    </div>
                                                    <div className="text-xs text-slate-400">
                                                        {date} • {start} - {end}
                                                    </div>
                                                    <div className="text-xs text-indigo-400 mt-1">
                                                        {session.length} veri noktası
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-xs text-slate-400 mb-3">Sisteme konum gönderen tüm cihazlar aşağıda listelenmiştir. Buradan cihazları şoförlere atayabilirsiniz.</p>
                            {Object.keys(groupedByDriver).map((driver) => (
                                <div key={driver} className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-slate-700/50 rounded-lg">
                                            <Smartphone size={20} className="text-indigo-400" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-white">{driver}</div>
                                            <div className="text-xs text-emerald-400">Sinyal Alınıyor</div>
                                        </div>
                                    </div>
                                    <button className="mt-3 w-full py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-lg transition-colors border border-indigo-500/20">
                                        Şoför/Tır Eşleştir
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Apple Navigasyon Alt Panel */}
            <NavigationOverlay 
                activeSession={selectedSession} 
                userLocation={userLocation}
                onClose={stopNavigation} 
            />

            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                </div>
            ) : (
                <MapContainer center={defaultCenter} zoom={6} className="w-full h-full z-10" zoomControl={false}>
                    <TileLayer
                        attribution='&copy; OSM'
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    />

                    <CameraTracker location={userLocation} isFollowing={isFollowing} />

                    {/* Navigasyon Modu */}
                    {selectedSession ? (
                        <>
                            {/* Secilen rotayi kalin mor ciz */}
                            <Polyline 
                                positions={selectedSession.filter(p=>!isNaN(p.lat)).map(p => [p.lat, p.lon])} 
                                color="#8b5cf6" 
                                weight={6} 
                                opacity={0.9} 
                            />
                            {/* Hedef Noktasi */}
                            <Marker 
                                position={[selectedSession[selectedSession.length-1].lat, selectedSession[selectedSession.length-1].lon]}
                                icon={truckIcon}
                            />
                            {/* Canli Kullanici Noktasi */}
                            {userLocation && (
                                <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} />
                            )}
                        </>
                    ) : (
                        /* Normal Filo Izleme Modu */
                        Object.entries(sessionsByDriver).map(([driverId, sessions]) => {
                            if (sessions.length === 0) return null;
                            // En son aktif session
                            const latestSession = sessions[sessions.length - 1];
                            const polylinePositions = latestSession.filter(p => !isNaN(p.lat)).map(p => [p.lat, p.lon]);
                            const lastPoint = latestSession[latestSession.length - 1];

                            return (
                                <React.Fragment key={driverId}>
                                    {polylinePositions.length > 1 && (
                                        <Polyline positions={polylinePositions} color="#6366f1" weight={4} opacity={0.7} />
                                    )}
                                    {lastPoint && !isNaN(lastPoint.lat) && (
                                        <Marker position={[lastPoint.lat, lastPoint.lon]} icon={truckIcon}>
                                            <Popup className="custom-popup">
                                                <div className="p-2">
                                                    <h3 className="font-bold text-slate-800 text-sm mb-1 border-b pb-1">{driverId}</h3>
                                                    <div className="text-xs text-slate-600 flex flex-col gap-1 mt-1">
                                                        <span className="flex justify-between"><b>Hız:</b> {Math.round(lastPoint.speed || 0)} km/h</span>
                                                        <span className="flex justify-between text-slate-400 mt-1">
                                                            {new Date(lastPoint.timestamp).toLocaleTimeString('tr-TR')}
                                                        </span>
                                                    </div>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    )}
                                </React.Fragment>
                            );
                        })
                    )}
                </MapContainer>
            )}

            <style>{`
                .leaflet-control-attribution {
                    background-color: rgba(15, 23, 42, 0.7) !important;
                    color: rgba(148, 163, 184, 0.8) !important;
                }
                .custom-popup .leaflet-popup-content-wrapper {
                    border-radius: 12px;
                    padding: 0;
                    overflow: hidden;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(71, 85, 105, 0.5);
                    border-radius: 10px;
                }
            `}</style>
        </div>
    );
}

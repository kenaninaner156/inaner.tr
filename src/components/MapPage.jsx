import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, onSnapshot, query, orderBy, limit, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import L from 'leaflet';
import { Navigation, Menu, History, Smartphone, ChevronRight, X, Check, Truck, User } from 'lucide-react';
import NavigationOverlay from './NavigationOverlay';
import { useTruck } from '../context/TruckContext';

// Default icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const truckIcon = new L.Icon({
    iconUrl: '/tir-clear.png?v=8',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20],
    className: 'bg-white rounded-full border-2 border-indigo-500 shadow-lg object-contain'
});

// Apple Maps tarzı pulsating mavi nokta
const createUserIcon = () => L.divIcon({
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `
        <div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
            <div style="position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(59,130,246,0.2);transform:translate(-12px,-12px);animation:pulse-ring 2s ease-out infinite;"></div>
            <div style="position:absolute;width:32px;height:32px;border-radius:50%;background:rgba(59,130,246,0.15);transform:translate(-4px,-4px);animation:pulse-ring 2s ease-out 0.5s infinite;"></div>
            <div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 8px rgba(59,130,246,0.6);z-index:2;"></div>
        </div>
        <style>@keyframes pulse-ring{0%{opacity:0.8;transform:translate(-12px,-12px) scale(1);}100%{opacity:0;transform:translate(-12px,-12px) scale(1.8);}}</style>
    `
});

// Harita drag olduğunda following'i kapat
function MapDragWatcher({ onDrag }) {
    useMapEvents({ dragstart: onDrag });
    return null;
}

// Kamera takip
function CameraTracker({ location, isFollowing }) {
    const map = useMap();
    useEffect(() => {
        if (isFollowing && location) {
            map.flyTo([location.lat, location.lng], map.getZoom(), { animate: true, duration: 0.8 });
        }
    }, [location, isFollowing, map]);
    return null;
}

// 30 dk session mantığı
function groupIntoSessions(points) {
    if (!points.length) return [];
    const sessions = [];
    let current = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const prev = new Date(points[i-1].timestamp).getTime();
        const curr = new Date(points[i].timestamp).getTime();
        if (curr - prev > 30 * 60 * 1000) {
            sessions.push(current);
            current = [points[i]];
        } else {
            current.push(points[i]);
        }
    }
    sessions.push(current);
    return sessions;
}

export default function MapPage() {
    const { trucks } = useTruck();
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showSidebar, setShowSidebar] = useState(false);
    const [sidebarTab, setSidebarTab] = useState('history');
    const [selectedSession, setSelectedSession] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [isFollowing, setIsFollowing] = useState(false);
    const [deviceMappings, setDeviceMappings] = useState({});
    const [mappingDevice, setMappingDevice] = useState(null); // deviceId being mapped
    const [mappingTruckId, setMappingTruckId] = useState('');
    const [mappingDriverName, setMappingDriverName] = useState('');
    const [savingMapping, setSavingMapping] = useState(false);
    const watchIdRef = useRef(null);

    // Load locations
    useEffect(() => {
        const q = query(collection(db, "truck_routes"), orderBy("timestamp", "asc"), limit(2000));
        return onSnapshot(q, (snap) => {
            setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
    }, []);

    // Load device mappings
    useEffect(() => {
        getDoc(doc(db, 'company_data', 'device_mappings')).then(snap => {
            if (snap.exists()) setDeviceMappings(snap.data());
        });
    }, []);

    // Group locations by device
    const groupedByDriver = locations.reduce((acc, loc) => {
        const key = loc.driverId || 'Bilinmeyen';
        if (!acc[key]) acc[key] = [];
        acc[key].push(loc);
        return acc;
    }, {});

    const sessionsByDriver = {};
    Object.keys(groupedByDriver).forEach(driver => {
        sessionsByDriver[driver] = groupIntoSessions(groupedByDriver[driver]);
    });

    const startNavigation = (session) => {
        setSelectedSession(session);
        setIsFollowing(true);
        setShowSidebar(false);
        if (navigator.geolocation) {
            watchIdRef.current = navigator.geolocation.watchPosition(
                pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, speed: pos.coords.speed }),
                err => console.error(err),
                { enableHighAccuracy: true, maximumAge: 0 }
            );
        }
    };

    const stopNavigation = () => {
        setSelectedSession(null);
        setIsFollowing(false);
        setUserLocation(null);
        if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };

    const handleRecenter = () => setIsFollowing(true);
    const handleDrag = useCallback(() => setIsFollowing(false), []);

    const saveMapping = async (deviceId) => {
        setSavingMapping(true);
        const updated = { ...deviceMappings, [deviceId]: { truckId: mappingTruckId, driverName: mappingDriverName } };
        await setDoc(doc(db, 'company_data', 'device_mappings'), updated);
        setDeviceMappings(updated);
        setMappingDevice(null);
        setMappingTruckId('');
        setMappingDriverName('');
        setSavingMapping(false);
    };

    const getDisplayName = (deviceId) => {
        const m = deviceMappings[deviceId];
        if (!m) return deviceId;
        const truck = trucks.find(t => t.id === m.truckId);
        return m.driverName ? `${m.driverName}${truck ? ` - ${truck.plate}` : ''}` : deviceId;
    };

    const defaultCenter = [39.5, 33.5];

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] relative bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">

            {/* Top bar */}
            <div className="absolute top-4 left-4 z-[1100] pointer-events-auto">
                <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-700/50 shadow-lg flex items-center gap-3">
                    <button onClick={() => setShowSidebar(!showSidebar)} className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors text-slate-300">
                        <Menu size={20} />
                    </button>
                    <div>
                        <h2 className="text-white font-semibold text-sm leading-tight">Filo İzleme</h2>
                        <p className="text-slate-400 text-xs">{Object.keys(groupedByDriver).length} Cihaz</p>
                    </div>
                </div>
            </div>

            {/* Sidebar overlay */}
            {showSidebar && <div className="absolute inset-0 bg-black/40 z-[1500]" onClick={() => setShowSidebar(false)} />}

            {/* Sidebar */}
            <div className={`absolute top-0 left-0 bottom-0 w-80 bg-slate-900/98 backdrop-blur-xl border-r border-slate-700/50 z-[1600] shadow-2xl flex flex-col transition-transform duration-300 ${showSidebar ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-4 border-b border-slate-700/50 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white">Yönetim Paneli</h2>
                    <button onClick={() => setShowSidebar(false)} className="text-slate-400 hover:text-white p-1 rounded-lg"><X size={18} /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-700/50">
                    {[['history','Rotalar',History], ['devices','Cihazlar',Smartphone]].map(([tab, label, Icon]) => (
                        <button key={tab} onClick={() => setSidebarTab(tab)}
                            className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${sidebarTab === tab ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                            <Icon size={14} />{label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{scrollbarWidth:'thin',scrollbarColor:'#334155 transparent'}}>
                    {sidebarTab === 'history' ? (
                        Object.entries(sessionsByDriver).map(([driver, sessions]) => (
                            <div key={driver} className="mb-2">
                                <div className="flex items-center gap-2 mb-2 px-1">
                                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                                    <span className="text-slate-200 font-semibold text-sm">{getDisplayName(driver)}</span>
                                </div>
                                <div className="space-y-2">
                                    {[...sessions].reverse().map((session, i) => {
                                        const start = new Date(session[0]?.timestamp);
                                        const end = new Date(session[session.length-1]?.timestamp);
                                        const isSelected = selectedSession === session;
                                        return (
                                            <button key={i} onClick={() => startNavigation(session)}
                                                className={`w-full text-left p-3 rounded-xl border transition-all group ${isSelected ? 'bg-indigo-500/20 border-indigo-500/50' : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50'}`}>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className={`text-sm font-semibold ${isSelected ? 'text-indigo-300' : 'text-white'}`}>
                                                        Oturum {sessions.length - i}
                                                    </span>
                                                    <ChevronRight size={14} className={`${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                                                </div>
                                                <div className="text-xs text-slate-400">
                                                    {start.toLocaleDateString('tr-TR')} • {start.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} – {end.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}
                                                </div>
                                                <div className="text-xs text-indigo-400 mt-1">{session.length} nokta</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="space-y-3">
                            <p className="text-xs text-slate-500 px-1">Cihazları şoför ve tıra bağlayın. Haritada görünen isimler güncellenecek.</p>
                            {Object.keys(groupedByDriver).map(deviceId => {
                                const mapped = deviceMappings[deviceId];
                                const isEditing = mappingDevice === deviceId;
                                const truck = mapped && trucks.find(t => t.id === mapped.truckId);
                                return (
                                    <div key={deviceId} className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
                                        {/* Header */}
                                        <div className="p-3 flex items-center gap-3">
                                            <div className="p-2 bg-slate-700/60 rounded-lg">
                                                <Smartphone size={18} className="text-indigo-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-white truncate">{deviceId}</div>
                                                {mapped ? (
                                                    <div className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                                                        <Check size={10} /> Eşleştirildi
                                                        {mapped.driverName && <span className="text-slate-400 ml-1">• {mapped.driverName}</span>}
                                                        {truck && <span className="text-slate-400">• {truck.plate}</span>}
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-amber-400 mt-0.5">Eşleştirilmedi</div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (isEditing) { setMappingDevice(null); return; }
                                                    setMappingDevice(deviceId);
                                                    setMappingTruckId(mapped?.truckId || '');
                                                    setMappingDriverName(mapped?.driverName || '');
                                                }}
                                                className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg transition-colors"
                                            >
                                                {isEditing ? 'İptal' : 'Düzenle'}
                                            </button>
                                        </div>

                                        {/* Editing form */}
                                        {isEditing && (
                                            <div className="px-3 pb-3 border-t border-slate-700/50 pt-3 space-y-2">
                                                <div>
                                                    <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1"><User size={11} /> Şoför Adı</label>
                                                    <input
                                                        value={mappingDriverName}
                                                        onChange={e => setMappingDriverName(e.target.value)}
                                                        placeholder="Örn: Kenan İnaner"
                                                        className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/70"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1"><Truck size={11} /> Tır Seç</label>
                                                    <select
                                                        value={mappingTruckId}
                                                        onChange={e => setMappingTruckId(e.target.value)}
                                                        className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/70"
                                                    >
                                                        <option value="">-- Tır Seç --</option>
                                                        {trucks.map(t => (
                                                            <option key={t.id} value={t.id}>{t.plate} {t.model ? `- ${t.model}` : ''}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <button
                                                    onClick={() => saveMapping(deviceId)}
                                                    disabled={savingMapping}
                                                    className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                                                >
                                                    {savingMapping ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={14} />}
                                                    Kaydet
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation Overlay */}
            <NavigationOverlay
                activeSession={selectedSession}
                userLocation={userLocation}
                isFollowing={isFollowing}
                onClose={stopNavigation}
                onRecenter={handleRecenter}
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
                    <MapDragWatcher onDrag={handleDrag} />
                    <CameraTracker location={userLocation} isFollowing={isFollowing} />

                    {selectedSession ? (
                        /* ===== NAVİGASYON MODU: Sadece seçili rota ===== */
                        <>
                            {/* Geçilen rota (koyu gri) */}
                            <Polyline
                                positions={selectedSession.filter(p => !isNaN(p.lat)).map(p => [p.lat, p.lon])}
                                color="#818cf8"
                                weight={7}
                                opacity={0.9}
                            />
                            {/* Canlı kullanıcı noktası */}
                            {userLocation && (
                                <Marker position={[userLocation.lat, userLocation.lng]} icon={createUserIcon()} />
                            )}
                            {/* Hedef marker */}
                            <Marker
                                position={[selectedSession[selectedSession.length-1].lat, selectedSession[selectedSession.length-1].lon]}
                                icon={truckIcon}
                            >
                                <Popup><div className="text-sm font-semibold p-1">Son Konum</div></Popup>
                            </Marker>
                        </>
                    ) : (
                        /* ===== NORMAL MOD: Sadece son konum ikonları, rota çizgisi yok ===== */
                        Object.entries(sessionsByDriver).map(([driverId, sessions]) => {
                            if (!sessions.length) return null;
                            const latestSession = sessions[sessions.length - 1];
                            const lastPoint = latestSession[latestSession.length - 1];
                            if (!lastPoint || isNaN(lastPoint.lat)) return null;
                            return (
                                <Marker key={driverId} position={[lastPoint.lat, lastPoint.lon]} icon={truckIcon}>
                                    <Popup className="custom-popup">
                                        <div className="p-2.5">
                                            <h3 className="font-bold text-slate-800 text-sm border-b pb-1 mb-2">{getDisplayName(driverId)}</h3>
                                            <div className="text-xs text-slate-600 space-y-1">
                                                <div className="flex justify-between"><b>Hız:</b> {Math.round(lastPoint.speed || 0)} km/h</div>
                                                <div className="flex justify-between"><b>Son Görülme:</b> {new Date(lastPoint.timestamp).toLocaleTimeString('tr-TR')}</div>
                                                <div className="flex justify-between"><b>Toplam Oturum:</b> {sessions.length}</div>
                                            </div>
                                            <button
                                                onClick={() => { startNavigation(latestSession); }}
                                                className="mt-2 w-full text-center text-xs py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-semibold rounded-lg transition-colors"
                                            >
                                                Son Rotayı İzle
                                            </button>
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })
                    )}
                </MapContainer>
            )}

            <style>{`
                .leaflet-control-attribution {
                    background: rgba(15,23,42,0.7) !important;
                    color: rgba(148,163,184,0.8) !important;
                    font-size: 10px !important;
                }
                .custom-popup .leaflet-popup-content-wrapper {
                    border-radius: 14px;
                    padding: 0;
                    overflow: hidden;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
                }
                .custom-popup .leaflet-popup-tip {
                    background: white;
                }
            `}</style>
        </div>
    );
}

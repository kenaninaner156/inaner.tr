import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import L from 'leaflet';
import { Navigation } from 'lucide-react';

// Leaflet default icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Kamyon ikonu
const truckIcon = new L.Icon({
    iconUrl: '/tir-clear.png?v=8',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
    className: 'bg-white rounded-full p-1 border-2 border-indigo-500 shadow-[0_4px_12px_rgba(99,102,241,0.5)] object-contain'
});

export default function MapPage() {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Son 500 konumu getir ve zaman sırasına diz (rota cizmek icin)
        const q = query(
            collection(db, "truck_routes"),
            orderBy("timestamp", "asc"),
            limit(500)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const locs = [];
            snapshot.forEach((doc) => {
                locs.push({ id: doc.id, ...doc.data() });
            });
            setLocations(locs);
            setLoading(false);
        }, (error) => {
            console.error("Harita verisi cekilirken hata:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Rotalari soforlere gore grupla
    const groupedByDriver = locations.reduce((acc, loc) => {
        const driver = loc.driverId || 'Bilinmeyen_Sofor';
        if (!acc[driver]) acc[driver] = [];
        acc[driver].push(loc);
        return acc;
    }, {});

    // Turkiye merkez
    const defaultCenter = [39.0, 35.0];

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] relative bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
            
            {/* Ust Bilgi Kutusu (Floating) */}
            <div className="absolute top-0 left-0 right-0 z-[1000] p-4 pointer-events-none">
                <div className="bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700/50 shadow-lg pointer-events-auto inline-block">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                            <Navigation size={24} />
                        </div>
                        <div>
                            <h2 className="text-white font-semibold text-lg leading-tight">Canlı Filo Takibi</h2>
                            <p className="text-slate-400 text-xs mt-0.5">
                                {Object.keys(groupedByDriver).length} Aktif Cihaz
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                </div>
            ) : (
                <MapContainer center={defaultCenter} zoom={6} className="w-full h-full z-10" zoomControl={false}>
                    {/* Temiz bir harita temasi (CartoDB Voyager) */}
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    />

                    {Object.entries(groupedByDriver).map(([driverId, routePoints]) => {
                        if (routePoints.length === 0) return null;

                        // Rota Cizgisi Icin Koordinatlar
                        const polylinePositions = routePoints
                            .filter(p => !isNaN(p.lat) && !isNaN(p.lon))
                            .map(p => [p.lat, p.lon]);

                        // En Son Konum
                        const lastPoint = routePoints[routePoints.length - 1];

                        return (
                            <React.Fragment key={driverId}>
                                {/* Gecmisten Guncel Konuma Cizgi Rota */}
                                {polylinePositions.length > 1 && (
                                    <Polyline 
                                        positions={polylinePositions} 
                                        color="#6366f1" 
                                        weight={4} 
                                        opacity={0.8} 
                                    />
                                )}

                                {/* Son Konum Isareti (Tir Logosu) */}
                                {lastPoint && !isNaN(lastPoint.lat) && !isNaN(lastPoint.lon) && (
                                    <Marker 
                                        position={[lastPoint.lat, lastPoint.lon]}
                                        icon={truckIcon}
                                    >
                                        <Popup className="custom-popup">
                                            <div className="p-2">
                                                <h3 className="font-bold text-slate-800 text-sm mb-1 border-b pb-1">{driverId}</h3>
                                                <div className="text-xs text-slate-600 flex flex-col gap-1 mt-1">
                                                    <span className="flex justify-between"><b>Hız:</b> {Math.round(lastPoint.speed || 0)} knot</span>
                                                    {lastPoint.timestamp && (
                                                        <span className="flex justify-between mt-1 pt-1 border-t border-slate-100 text-slate-400">
                                                            {new Date(lastPoint.timestamp).toLocaleTimeString('tr-TR')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </Popup>
                                    </Marker>
                                )}
                            </React.Fragment>
                        );
                    })}
                </MapContainer>
            )}

            <style>{`
                .leaflet-control-attribution {
                    background-color: rgba(15, 23, 42, 0.7) !important;
                    color: rgba(148, 163, 184, 0.8) !important;
                }
                .leaflet-control-attribution a {
                    color: rgba(148, 163, 184, 1) !important;
                }
                .custom-popup .leaflet-popup-content-wrapper {
                    border-radius: 12px;
                    padding: 0;
                    overflow: hidden;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                }
            `}</style>
        </div>
    );
}

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, onSnapshot, query, orderBy, where, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import L from 'leaflet';
import { Navigation, Menu, History, Smartphone, ChevronRight, X, Check, Truck, User, Trash2, Filter } from 'lucide-react';
import NavigationOverlay from './NavigationOverlay';
import { useTruck } from '../context/TruckContext';
import { useCompany } from '../context/CompanyContext';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const truckIcon = new L.Icon({ iconUrl: '/tir-clear.png?v=8', iconSize:[38,38], iconAnchor:[19,19], popupAnchor:[0,-20], className:'bg-white rounded-full border-2 border-indigo-500 shadow-lg object-contain' });
const startIcon = new L.Icon({ iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png', iconSize:[20,33], iconAnchor:[10,33] });

// FIX #2: Static divIcon — no inline <style> injection per render
const userDivIcon = L.divIcon({
  className: 'user-location-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  html: '<div class="uloc-outer"><div class="uloc-mid"></div><div class="uloc-dot"></div></div>'
});

function MapDragWatcher({ onDrag }) {
  useMapEvents({ dragstart: onDrag });
  return null;
}

function CameraTracker({ location, isFollowing }) {
  const map = useMap();
  useEffect(() => {
    if (isFollowing && location) map.flyTo([location.lat, location.lng], Math.max(map.getZoom(), 14), { animate: true, duration: 0.8 });
  }, [location, isFollowing, map]);
  return null;
}

// FIX #11: MapRef for closing popups
function MapRefSetter({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function groupIntoSessions(points) {
  if (!points.length) return [];
  const sessions = []; let current = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (new Date(points[i].timestamp) - new Date(points[i-1].timestamp) > 30*60*1000) { sessions.push(current); current = [points[i]]; }
    else current.push(points[i]);
  }
  sessions.push(current);
  return sessions;
}

function calcSessionStats(session) {
  if (session.length < 2) return { km: 0, durationMin: 0 };
  let km = 0;
  for (let i = 1; i < session.length; i++) km += haversineKm(session[i-1].lat, session[i-1].lon, session[i].lat, session[i].lon);
  const durationMin = Math.round((new Date(session[session.length-1].timestamp) - new Date(session[0].timestamp)) / 60000);
  return { km: Math.round(km), durationMin };
}

// FIX #4: unique key from first timestamp
function sessionKey(s) { return s[0]?.timestamp || ''; }

const DATE_FILTERS = [
  { label: 'Bugün', days: 1 },
  { label: '7 Gün', days: 7 },
  { label: '30 Gün', days: 30 },
  { label: 'Tümü', days: 0 },
];

export default function MapPage() {
  const { trucks } = useTruck();
  const { activeCompanyId } = useCompany();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('history');
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [deviceMappings, setDeviceMappings] = useState({});
  const [mappingDevice, setMappingDevice] = useState(null);
  const [mappingTruckId, setMappingTruckId] = useState('');
  const [mappingDriverName, setMappingDriverName] = useState('');
  const [savingMapping, setSavingMapping] = useState(false);
  const [dateFilterDays, setDateFilterDays] = useState(7);
  const watchIdRef = useRef(null);
  const mapRef = useRef(null);

  // FIX #8: date-based query
  useEffect(() => {
    let q;
    if (dateFilterDays > 0) {
      const since = new Date(Date.now() - dateFilterDays * 86400000).toISOString();
      q = query(collection(db, 'truck_routes'), where('timestamp', '>=', since), orderBy('timestamp', 'asc'));
    } else {
      q = query(collection(db, 'truck_routes'), orderBy('timestamp', 'asc'));
    }
    return onSnapshot(q, snap => {
      setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [dateFilterDays]);

  // FIX #5 & #17: companyId in device_mappings key
  const mappingsDocId = `device_mappings_${activeCompanyId || 'default'}`;
  useEffect(() => {
    getDoc(doc(db, 'company_data', mappingsDocId)).then(s => { if (s.exists()) setDeviceMappings(s.data()); });
  }, [mappingsDocId]);

  const groupedByDriver = useMemo(() => locations.reduce((acc, loc) => {
    const key = loc.driverId || 'Bilinmeyen';
    if (!acc[key]) acc[key] = [];
    acc[key].push(loc);
    return acc;
  }, {}), [locations]);

  const sessionsByDriver = useMemo(() => {
    const res = {};
    Object.keys(groupedByDriver).forEach(d => { res[d] = groupIntoSessions(groupedByDriver[d]); });
    return res;
  }, [groupedByDriver]);

  // FIX #3: cleanup previous watchPosition before starting new one
  const startNavigation = useCallback((session) => {
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    setSelectedSession(session);
    setSelectedKey(sessionKey(session));
    setIsFollowing(true);
    setShowSidebar(false);
    if (mapRef.current) mapRef.current.closePopup();
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, speed: pos.coords.speed }),
        err => console.error(err),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    }
  }, []);

  const stopNavigation = useCallback(() => {
    setSelectedSession(null);
    setSelectedKey(null);
    setIsFollowing(false);
    setUserLocation(null);
    if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
  }, []);

  const handleDrag = useCallback(() => setIsFollowing(false), []);

  // FIX #5 & #17: save with companyId doc
  const saveMapping = async (deviceId) => {
    setSavingMapping(true);
    const updated = { ...deviceMappings, [deviceId]: { truckId: mappingTruckId, driverName: mappingDriverName } };
    await setDoc(doc(db, 'company_data', mappingsDocId), updated);
    setDeviceMappings(updated);
    setMappingDevice(null); setMappingTruckId(''); setMappingDriverName('');
    setSavingMapping(false);
  };

  const getDisplayName = useCallback((deviceId) => {
    const m = deviceMappings[deviceId];
    if (!m) return deviceId;
    const truck = trucks.find(t => t.id === m.truckId);
    return [m.driverName, truck?.plate].filter(Boolean).join(' - ') || deviceId;
  }, [deviceMappings, trucks]);

  // Progress for NavigationOverlay #14
  const { totalPoints, coveredPoints } = useMemo(() => {
    if (!selectedSession || !userLocation) return { totalPoints: 0, coveredPoints: 0 };
    const total = selectedSession.length;
    // Find closest point to user
    let minDist = Infinity, idx = 0;
    selectedSession.forEach((p, i) => {
      const d = haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lon);
      if (d < minDist) { minDist = d; idx = i; }
    });
    return { totalPoints: total, coveredPoints: idx };
  }, [selectedSession, userLocation]);

  const allDevices = Object.keys(groupedByDriver);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] relative bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
      
      {/* FIX #2: Static CSS for pulsing dot — no per-render injection */}
      <style>{`
        .user-location-icon { background: none !important; border: none !important; }
        .uloc-outer { position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center; }
        .uloc-outer::before,.uloc-outer::after { content:'';position:absolute;border-radius:50%;background:rgba(59,130,246,0.2);animation:uloc-pulse 2s ease-out infinite; }
        .uloc-outer::before { width:48px;height:48px;margin:-12px; }
        .uloc-outer::after { width:32px;height:32px;margin:-4px;animation-delay:0.4s; }
        .uloc-dot { width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 8px rgba(59,130,246,0.6);z-index:2; }
        @keyframes uloc-pulse { 0%{opacity:0.7;transform:scale(1);} 100%{opacity:0;transform:scale(1.8);} }
        .leaflet-control-attribution { background:rgba(15,23,42,0.7)!important;color:rgba(148,163,184,0.8)!important;font-size:10px!important; }
        .custom-popup .leaflet-popup-content-wrapper { border-radius:14px;padding:0;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.15); }
        .custom-popup .leaflet-popup-tip { background:white; }
      `}</style>

      {/* Top bar */}
      <div className="absolute top-4 left-4 z-[1100] pointer-events-auto">
        <div className="bg-slate-900/85 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-700/50 shadow-lg flex items-center gap-3">
          <button onClick={() => setShowSidebar(v => !v)} className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors text-slate-300"><Menu size={20}/></button>
          <div>
            <h2 className="text-white font-semibold text-sm leading-tight">Filo İzleme</h2>
            <p className="text-slate-400 text-xs">{allDevices.length} Cihaz</p>
          </div>
        </div>
      </div>

      {/* Overlay */}
      {showSidebar && <div className="absolute inset-0 bg-black/40 z-[1500]" onClick={() => setShowSidebar(false)} />}

      {/* Sidebar */}
      <div className={`absolute top-0 left-0 bottom-0 w-80 bg-slate-900/98 backdrop-blur-xl border-r border-slate-700/50 z-[1600] shadow-2xl flex flex-col transition-transform duration-300 ${showSidebar ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-slate-700/50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-white">Yönetim Paneli</h2>
          <button onClick={() => setShowSidebar(false)} className="text-slate-400 hover:text-white p-1 rounded-lg"><X size={18}/></button>
        </div>
        <div className="flex border-b border-slate-700/50">
          {[['history','Rotalar',History],['devices','Cihazlar',Smartphone]].map(([tab,label,Icon]) => (
            <button key={tab} onClick={() => setSidebarTab(tab)}
              className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${sidebarTab===tab?'border-indigo-500 text-indigo-400':'border-transparent text-slate-400 hover:text-slate-200'}`}>
              <Icon size={14}/>{label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3" style={{scrollbarWidth:'thin',scrollbarColor:'#334155 transparent'}}>
          {sidebarTab === 'history' ? (
            <>
              {/* FIX #7: Date filter */}
              <div className="flex gap-1 mb-3 flex-wrap">
                {DATE_FILTERS.map(f => (
                  <button key={f.days} onClick={() => setDateFilterDays(f.days)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${dateFilterDays===f.days?'bg-indigo-500 text-white':'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                    <Filter size={10} className="inline mr-1"/>{f.label}
                  </button>
                ))}
              </div>

              {allDevices.length === 0 && (
                <div className="text-center text-slate-500 text-xs py-10">Bu dönemde kayıt yok</div>
              )}

              {Object.entries(sessionsByDriver).map(([driver, sessions]) => (
                <div key={driver} className="mb-4">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"/>
                    <span className="text-slate-200 font-semibold text-sm">{getDisplayName(driver)}</span>
                  </div>
                  <div className="space-y-2">
                    {[...sessions].reverse().map((session, i) => {
                      const start = new Date(session[0]?.timestamp);
                      const end = new Date(session[session.length-1]?.timestamp);
                      // FIX #4: compare by timestamp key, not reference
                      const isSelected = sessionKey(session) === selectedKey;
                      // FIX #18: km + duration
                      const { km, durationMin } = calcSessionStats(session);
                      return (
                        <button key={i} onClick={() => startNavigation(session)}
                          className={`w-full text-left p-3 rounded-xl border transition-all ${isSelected?'bg-indigo-500/20 border-indigo-500/50':'bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50'}`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className={`text-sm font-semibold ${isSelected?'text-indigo-300':'text-white'}`}>Oturum {sessions.length - i}</span>
                            <ChevronRight size={14} className={isSelected?'text-indigo-400':'text-slate-500'}/>
                          </div>
                          <div className="text-xs text-slate-400">
                            {start.toLocaleDateString('tr-TR')} • {start.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} – {end.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}
                          </div>
                          {/* FIX #18: Show km and duration */}
                          <div className="flex gap-3 mt-1.5">
                            <span className="text-xs text-indigo-400">{km} km</span>
                            <span className="text-xs text-slate-500">{durationMin} dk</span>
                            <span className="text-xs text-slate-600">{session.length} pt</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 px-1">Cihazları şoför ve tıra bağlayın.</p>
              {/* FIX #12: Empty state */}
              {allDevices.length === 0 && (
                <div className="text-center text-slate-500 text-xs py-10 bg-slate-800/30 rounded-xl border border-slate-700/30">
                  Henüz sinyal gönderen cihaz yok.<br/>
                  <span className="text-slate-600">Traccar Client'ı başlatın.</span>
                </div>
              )}
              {allDevices.map(deviceId => {
                const mapped = deviceMappings[deviceId];
                const isEditing = mappingDevice === deviceId;
                const truck = mapped && trucks.find(t => t.id === mapped.truckId);
                const lastLoc = groupedByDriver[deviceId]?.slice(-1)[0];
                const lastSeen = lastLoc ? new Date(lastLoc.timestamp).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '–';
                // FIX #13: Identify test/fake devices
                const isTestDevice = deviceId.includes('Test') || deviceId.includes('AI_') || deviceId.includes('Tir') || deviceId.includes('Giden') || deviceId.includes('Donus');
                return (
                  <div key={deviceId} className={`border rounded-xl overflow-hidden ${isTestDevice ? 'bg-amber-900/10 border-amber-700/30' : 'bg-slate-800/60 border-slate-700/50'}`}>
                    <div className="p-3 flex items-center gap-3">
                      <div className="p-2 bg-slate-700/60 rounded-lg">
                        <Smartphone size={18} className={isTestDevice ? 'text-amber-400' : 'text-indigo-400'}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                          {deviceId}
                          {isTestDevice && <span className="text-xs text-amber-500 font-normal">(test)</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {mapped ? (
                            <span className="text-xs text-emerald-400 flex items-center gap-1"><Check size={10}/>{mapped.driverName}{truck && ` - ${truck.plate}`}</span>
                          ) : (
                            <span className="text-xs text-amber-400">Eşleştirilmedi</span>
                          )}
                          <span className="text-xs text-slate-600">• {lastSeen}</span>
                        </div>
                      </div>
                      <button onClick={() => { if(isEditing){setMappingDevice(null);return;} setMappingDevice(deviceId); setMappingTruckId(mapped?.truckId||''); setMappingDriverName(mapped?.driverName||''); }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg transition-colors shrink-0">
                        {isEditing ? 'İptal' : 'Düzenle'}
                      </button>
                    </div>
                    {isEditing && (
                      <div className="px-3 pb-3 border-t border-slate-700/50 pt-3 space-y-2">
                        <div>
                          <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1"><User size={11}/> Şoför Adı</label>
                          <input value={mappingDriverName} onChange={e => setMappingDriverName(e.target.value)} placeholder="Örn: Kenan İnaner"
                            className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/70"/>
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1"><Truck size={11}/> Tır Seç</label>
                          <select value={mappingTruckId} onChange={e => setMappingTruckId(e.target.value)}
                            className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/70">
                            <option value="">-- Tır Seç --</option>
                            {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}{t.model ? ` - ${t.model}` : ''}</option>)}
                          </select>
                        </div>
                        <button onClick={() => saveMapping(deviceId)} disabled={savingMapping}
                          className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2">
                          {savingMapping ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Check size={14}/>}
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

      <NavigationOverlay
        activeSession={selectedSession}
        userLocation={userLocation}
        isFollowing={isFollowing}
        totalPoints={totalPoints}
        coveredPoints={coveredPoints}
        onClose={stopNavigation}
        onRecenter={() => setIsFollowing(true)}
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"/>
        </div>
      ) : (
        <MapContainer center={[39.5, 33.5]} zoom={6} className="w-full h-full z-10" zoomControl={false}>
          <TileLayer attribution='&copy; OSM' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"/>
          <MapRefSetter mapRef={mapRef}/>
          <MapDragWatcher onDrag={handleDrag}/>
          <CameraTracker location={userLocation} isFollowing={isFollowing}/>

          {selectedSession ? (
            <>
              <Polyline positions={selectedSession.filter(p=>!isNaN(p.lat)).map(p=>[p.lat,p.lon])} color="#818cf8" weight={7} opacity={0.9}/>
              {/* FIX #9: Start marker */}
              <Marker position={[selectedSession[0].lat, selectedSession[0].lon]} icon={startIcon}>
                <Popup><div className="p-2 text-sm font-semibold text-green-700">🟢 Başlangıç</div></Popup>
              </Marker>
              <Marker position={[selectedSession[selectedSession.length-1].lat, selectedSession[selectedSession.length-1].lon]} icon={truckIcon}>
                <Popup><div className="p-2 text-sm font-semibold">🏁 Son Konum</div></Popup>
              </Marker>
              {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userDivIcon}/>}
            </>
          ) : (
            Object.entries(sessionsByDriver).map(([driverId, sessions]) => {
              if (!sessions.length) return null;
              const latest = sessions[sessions.length-1];
              const last = latest[latest.length-1];
              if (!last || isNaN(last.lat)) return null;
              // FIX #19: speed stored from Traccar iOS in m/s → display as km/h
              const speedKmh = Math.round((last.speed || 0) * 3.6);
              return (
                <Marker key={driverId} position={[last.lat, last.lon]} icon={truckIcon}>
                  <Popup className="custom-popup">
                    <div className="p-3">
                      <h3 className="font-bold text-slate-800 text-sm border-b pb-1.5 mb-2">{getDisplayName(driverId)}</h3>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div className="flex justify-between"><b>Hız:</b> {speedKmh} km/h</div>
                        <div className="flex justify-between"><b>Son Görülme:</b> {new Date(last.timestamp).toLocaleTimeString('tr-TR')}</div>
                        <div className="flex justify-between"><b>Toplam Oturum:</b> {sessions.length}</div>
                      </div>
                      {/* FIX #11: mapRef.current.closePopup() on click */}
                      <button onClick={() => startNavigation(latest)}
                        className="mt-2.5 w-full text-center text-xs py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-semibold rounded-lg transition-colors">
                        Son Rotayı İzle →
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })
          )}
        </MapContainer>
      )}
    </div>
  );
}

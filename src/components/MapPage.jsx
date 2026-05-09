import React, { useEffect, useState, useRef, useCallback, useMemo, useContext } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, onSnapshot, query, orderBy, where, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import L from 'leaflet';
import { Menu, History, Smartphone, ChevronRight, X, Check, Truck, User, Filter, BookmarkPlus } from 'lucide-react';
import { useTruck } from '../context/TruckContext';
import { useCompany } from '../context/CompanyContext';
import { DataContext } from '../context/DataContext';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const truckIcon = new L.Icon({ iconUrl: '/tir-clear.png?v=8', iconSize:[38,38], iconAnchor:[19,19], popupAnchor:[0,-20], className:'bg-white rounded-full border-2 border-indigo-500 shadow-lg object-contain' });
const startIcon = new L.Icon({ iconUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png', iconSize:[16,26], iconAnchor:[8,26] });

function MapRefSetter({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

function haversineKm(lat1,lon1,lat2,lon2) {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function groupIntoSessions(points) {
  if (!points.length) return [];
  const sessions=[]; let cur=[points[0]];
  for (let i=1;i<points.length;i++) {
    if (new Date(points[i].timestamp)-new Date(points[i-1].timestamp)>30*60*1000) { sessions.push(cur); cur=[points[i]]; }
    else cur.push(points[i]);
  }
  sessions.push(cur);
  return sessions;
}

function calcStats(s) {
  if (s.length<2) return { km:0, durationMin:0 };
  let km=0;
  for (let i=1;i<s.length;i++) km+=haversineKm(s[i-1].lat,s[i-1].lon,s[i].lat,s[i].lon);
  return { km:Math.round(km), durationMin:Math.round((new Date(s[s.length-1].timestamp)-new Date(s[0].timestamp))/60000) };
}

const DATE_FILTERS=[{label:'Bugün',days:1},{label:'7 Gün',days:7},{label:'30 Gün',days:30},{label:'Tümü',days:0}];

// Rota Kaydet Modal
function SaveRouteModal({ session, deviceName, onSave, onClose }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [saving, setSaving] = useState(false);
  const { km } = calcStats(session);

  const handleSave = async () => {
    if (!from || !to) return;
    setSaving(true);
    await onSave({ from, to, km });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-3xl p-5 w-full max-w-sm shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2" style={{color:'var(--text-primary)'}}>
              <BookmarkPlus size={18} style={{color:'var(--accent)'}}/> Rotayı Kaydet
            </h3>
            <p className="text-xs mt-0.5" style={{color:'var(--text-secondary)'}}>{deviceName} • {km} km</p>
          </div>
          <button onClick={onClose} className="p-1 transition-colors hover:text-[var(--text-primary)]" style={{color:'var(--text-muted)'}}><X size={18}/></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs mb-1 block" style={{color:'var(--text-secondary)'}}>Nereden (Başlangıç)</label>
            <input value={from} onChange={e=>setFrom(e.target.value)} placeholder="Örn: Ankara / Baştaş"
              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)]" style={{color:'var(--text-primary)'}}/>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{color:'var(--text-secondary)'}}>Nereye (Bitiş)</label>
            <input value={to} onChange={e=>setTo(e.target.value)} placeholder="Örn: Çayırhan / Termik"
              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)]" style={{color:'var(--text-primary)'}}/>
          </div>
          <p className="text-xs bg-[var(--bg-input)] rounded-xl p-2.5" style={{color:'var(--text-secondary)'}}>
            💡 Bu rota <b style={{color:'var(--text-primary)'}}>Seferler → Rotalarım</b> listesine eklenecek ve sefer oluştururken seçilebilir olacak.
          </p>
          <button onClick={handleSave} disabled={saving||!from||!to}
            className="w-full py-2.5 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 hover:opacity-90 shadow-sm"
            style={{backgroundColor:'var(--accent)'}}>
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Check size={16}/>}
            Seferler'e Ekle
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MapPage() {
  const { trucks } = useTruck();
  const { activeCompanyId } = useCompany();
  const { addRoute } = useContext(DataContext);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('history');
  const [selectedSession, setSelectedSession] = useState(null);
  const [deviceMappings, setDeviceMappings] = useState({});
  const [mappingDevice, setMappingDevice] = useState(null);
  const [mappingTruckId, setMappingTruckId] = useState('');
  const [mappingDriverName, setMappingDriverName] = useState('');
  const [savingMapping, setSavingMapping] = useState(false);
  const [dateFilterDays, setDateFilterDays] = useState(7);
  const [saveModalSession, setSaveModalSession] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let q;
    if (dateFilterDays > 0) {
      const since = new Date(Date.now()-dateFilterDays*86400000).toISOString();
      q = query(collection(db,'truck_routes'), where('timestamp','>=',since), orderBy('timestamp','asc'));
    } else {
      q = query(collection(db,'truck_routes'), orderBy('timestamp','asc'));
    }
    return onSnapshot(q, snap => {
      setLocations(snap.docs.map(d=>({id:d.id,...d.data()})));
      setLoading(false);
    });
  }, [dateFilterDays]);

  const mappingsDocId = `device_mappings_${activeCompanyId||'default'}`;
  useEffect(() => {
    getDoc(doc(db,'company_data',mappingsDocId)).then(s=>{ if(s.exists()) setDeviceMappings(s.data()); });
  }, [mappingsDocId]);

  const groupedByDriver = useMemo(()=>locations.reduce((acc,loc)=>{
    const k=loc.driverId||'Bilinmeyen';
    if(!acc[k]) acc[k]=[];
    acc[k].push(loc);
    return acc;
  },{}), [locations]);

  const sessionsByDriver = useMemo(()=>{
    const res={};
    Object.keys(groupedByDriver).forEach(d=>{ res[d]=groupIntoSessions(groupedByDriver[d]); });
    return res;
  }, [groupedByDriver]);

  const saveMapping = async (deviceId) => {
    setSavingMapping(true);
    const updated = {...deviceMappings,[deviceId]:{truckId:mappingTruckId,driverName:mappingDriverName}};
    await setDoc(doc(db,'company_data',mappingsDocId), updated);
    setDeviceMappings(updated);
    setMappingDevice(null); setMappingTruckId(''); setMappingDriverName('');
    setSavingMapping(false);
  };

  const getDisplayName = useCallback((deviceId)=>{
    const m=deviceMappings[deviceId];
    if(!m) return deviceId;
    const truck=trucks.find(t=>t.id===m.truckId);
    return [m.driverName,truck?.plate].filter(Boolean).join(' - ')||deviceId;
  },[deviceMappings,trucks]);

  const allDevices = Object.keys(groupedByDriver);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] relative bg-[var(--bg-panel)] rounded-2xl overflow-hidden shadow-2xl border border-[var(--border-color)] isolate [transform:translateZ(0)]">
      <style>{`
        .leaflet-control-attribution{background:rgba(15,23,42,0.7)!important;color:rgba(148,163,184,0.8)!important;font-size:10px!important;}
        .cpopup .leaflet-popup-content-wrapper{border-radius:14px;padding:0;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.15);}
        .cpopup .leaflet-popup-tip{background:white;}
      `}</style>

      {/* Top bar */}
      <div className="absolute top-4 left-4 z-[1100] pointer-events-auto">
        <div className="bg-[var(--bg-panel)]/90 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-[var(--border-color)] shadow-lg flex items-center gap-3">
          <button onClick={()=>setShowSidebar(v=>!v)} className="p-1.5 hover:bg-[var(--bg-hover)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"><Menu size={20}/></button>
          <div>
            <h2 className="font-semibold text-sm" style={{color:'var(--text-primary)'}}>Canlı Filo Takibi</h2>
            <p className="text-xs" style={{color:'var(--text-secondary)'}}>{allDevices.length} Aktif Cihaz</p>
          </div>
        </div>
      </div>

      {showSidebar && <div className="absolute inset-0 bg-black/40 z-[1500]" onClick={()=>setShowSidebar(false)}/>}

      {/* Sidebar */}
      <div className={`absolute top-0 left-0 bottom-0 w-80 bg-[var(--bg-sidebar)] backdrop-blur-xl border-r border-[var(--border-color)] z-[1600] shadow-2xl flex flex-col transition-transform duration-300 ${showSidebar?'translate-x-0':'-translate-x-full'}`}>
        <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center">
          <h2 className="text-lg font-bold" style={{color:'var(--text-primary)'}}>Yönetim Paneli</h2>
          <button onClick={()=>setShowSidebar(false)} className="p-1 rounded-lg hover:bg-[var(--bg-hover)] transition-colors" style={{color:'var(--text-secondary)'}}><X size={18}/></button>
        </div>
        <div className="flex border-b border-[var(--border-color)]">
          {[['history','Rotalar',History],['devices','Cihazlar',Smartphone]].map(([tab,label,Icon])=>(
            <button key={tab} onClick={()=>setSidebarTab(tab)}
              className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${sidebarTab===tab?'border-[var(--accent)] text-[var(--accent)]':'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
              <Icon size={14}/>{label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3" style={{scrollbarWidth:'thin',scrollbarColor:'var(--border-color) transparent'}}>
          {sidebarTab==='history' ? (
            <>
              <div className="flex gap-1 mb-3 flex-wrap">
                {DATE_FILTERS.map(f=>(
                  <button key={f.days} onClick={()=>setDateFilterDays(f.days)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1 ${dateFilterDays===f.days?'text-white shadow-sm':'bg-[var(--bg-input)] hover:bg-[var(--bg-hover)]'}`}
                    style={dateFilterDays===f.days ? {backgroundColor:'var(--accent)'} : {color:'var(--text-secondary)'}}>
                    <Filter size={9}/>{f.label}
                  </button>
                ))}
              </div>
              {allDevices.length===0 && <div className="text-center text-xs py-10" style={{color:'var(--text-secondary)'}}>Bu dönemde kayıt yok</div>}
              {Object.entries(sessionsByDriver).map(([driver,sessions])=>(
                <div key={driver} className="mb-4">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"/>
                    <span className="font-semibold text-sm" style={{color:'var(--text-primary)'}}>{getDisplayName(driver)}</span>
                  </div>
                  <div className="space-y-2">
                    {[...sessions].reverse().map((session,i)=>{
                      const start=new Date(session[0]?.timestamp);
                      const end=new Date(session[session.length-1]?.timestamp);
                      const isSelected=selectedSession===session;
                      const {km,durationMin}=calcStats(session);
                      return (
                        <div key={i} className={`rounded-xl border overflow-hidden transition-all ${isSelected?'border-[var(--accent)] bg-[var(--bg-hover)]':'border-[var(--border-color)] bg-[var(--bg-input)]'}`}>
                          <button onClick={()=>{ setSelectedSession(isSelected?null:session); if(mapRef.current)mapRef.current.closePopup(); }}
                            className="w-full text-left p-3">
                            <div className="flex justify-between items-center mb-1">
                              <span className={`text-sm font-semibold`} style={{color: isSelected?'var(--accent)':'var(--text-primary)'}}>Oturum {sessions.length-i}</span>
                              <ChevronRight size={14} className={isSelected?'rotate-90':''} style={{color: isSelected?'var(--accent)':'var(--text-muted)'}}/>
                            </div>
                            <div className="text-xs" style={{color:'var(--text-secondary)'}}>
                              {start.toLocaleDateString('tr-TR')} • {start.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} – {end.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}
                            </div>
                            <div className="flex gap-3 mt-1.5">
                              <span className="text-xs font-medium" style={{color:'var(--accent)'}}>{km} km</span>
                              <span className="text-xs" style={{color:'var(--text-secondary)'}}>{durationMin} dk</span>
                              <span className="text-xs" style={{color:'var(--text-muted)'}}>{session.length} pt</span>
                            </div>
                          </button>
                          {/* Seferlere Ekle butonu */}
                          <div className="px-3 pb-3 pt-0">
                            <button onClick={()=>setSaveModalSession({session,deviceName:getDisplayName(driver)})}
                              className="w-full py-1.5 border text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 hover:opacity-80"
                              style={{borderColor:'var(--accent)', color:'var(--accent)', backgroundColor:'var(--accent-glow)'}}>
                              <BookmarkPlus size={12}/> Seferlere Ekle
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs px-1" style={{color:'var(--text-secondary)'}}>Cihazları şoför ve tıra bağlayın.</p>
              {allDevices.length===0 && (
                <div className="text-center text-xs py-10 bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)]" style={{color:'var(--text-secondary)'}}>
                  Henüz sinyal gönderen cihaz yok.
                </div>
              )}
              {allDevices.map(deviceId=>{
                const mapped=deviceMappings[deviceId];
                const isEditing=mappingDevice===deviceId;
                const truck=mapped&&trucks.find(t=>t.id===mapped.truckId);
                const lastLoc=groupedByDriver[deviceId]?.slice(-1)[0];
                const lastSeen=lastLoc?new Date(lastLoc.timestamp).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}):'–';
                const speedKmh=Math.round((lastLoc?.speed||0)*3.6);
                return (
                  <div key={deviceId} className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl overflow-hidden transition-colors">
                    <div className="p-3 flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{backgroundColor:'var(--bg-hover)', color:'var(--accent)'}}>
                        <Smartphone size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate" style={{color:'var(--text-primary)'}}>{deviceId}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {mapped ? (
                            <span className="text-xs text-emerald-500 flex items-center gap-1 font-medium"><Check size={10}/>{mapped.driverName}{truck&&` - ${truck.plate}`}</span>
                          ) : (
                            <span className="text-xs text-amber-500 font-medium">Eşleştirilmedi</span>
                          )}
                          <span className="text-xs" style={{color:'var(--text-muted)'}}>• {lastSeen}</span>
                          {speedKmh > 0 && <span className="text-xs text-sky-500 font-medium">{speedKmh} km/h</span>}
                        </div>
                      </div>
                      <button onClick={()=>{ if(isEditing){setMappingDevice(null);return;} setMappingDevice(deviceId); setMappingTruckId(mapped?.truckId||''); setMappingDriverName(mapped?.driverName||''); }}
                        className="text-xs px-2 py-1 rounded-lg transition-colors shrink-0 font-medium hover:opacity-80"
                        style={{backgroundColor:'var(--accent-glow)', color:'var(--accent)'}}>
                        {isEditing?'İptal':'Düzenle'}
                      </button>
                    </div>
                    {isEditing && (
                      <div className="px-3 pb-3 border-t border-[var(--border-color)] pt-3 space-y-2 bg-[var(--bg-sidebar)]">
                        <div>
                          <label className="text-xs mb-1 block flex items-center gap-1" style={{color:'var(--text-secondary)'}}><User size={11}/> Şoför Adı</label>
                          <input value={mappingDriverName} onChange={e=>setMappingDriverName(e.target.value)} placeholder="Örn: Kenan İnaner"
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]" style={{color:'var(--text-primary)'}}/>
                        </div>
                        <div>
                          <label className="text-xs mb-1 block flex items-center gap-1" style={{color:'var(--text-secondary)'}}><Truck size={11}/> Tır Seç</label>
                          <select value={mappingTruckId} onChange={e=>setMappingTruckId(e.target.value)}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]" style={{color:'var(--text-primary)'}}>
                            <option value="">-- Tır Seç --</option>
                            {trucks.map(t=><option key={t.id} value={t.id}>{t.plate}{t.model?` - ${t.model}`:''}</option>)}
                          </select>
                        </div>
                        <button onClick={()=>saveMapping(deviceId)} disabled={savingMapping}
                          className="w-full py-2 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 hover:opacity-90 shadow-sm"
                          style={{backgroundColor:'var(--accent)'}}>
                          {savingMapping?<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<Check size={14}/>}
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

      {/* Save Route Modal */}
      {saveModalSession && (
        <SaveRouteModal
          session={saveModalSession.session}
          deviceName={saveModalSession.deviceName}
          onSave={addRoute}
          onClose={()=>setSaveModalSession(null)}
        />
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"/>
        </div>
      ) : (
        <MapContainer center={[39.5,33.5]} zoom={6} className="w-full h-full z-10" zoomControl={false}>
          <TileLayer attribution='&copy; OSM' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"/>
          <MapRefSetter mapRef={mapRef}/>

          {/* Seçili rota çizgisi */}
          {selectedSession && (
            <>
              <Polyline positions={selectedSession.filter(p=>!isNaN(p.lat)).map(p=>[p.lat,p.lon])} color="#818cf8" weight={6} opacity={0.9}/>
              <Marker position={[selectedSession[0].lat,selectedSession[0].lon]} icon={startIcon}>
                <Popup><div className="p-2 text-xs font-semibold text-green-700">🟢 Başlangıç</div></Popup>
              </Marker>
            </>
          )}

          {/* Canlı cihaz konumları — her zaman göster */}
          {Object.entries(sessionsByDriver).map(([driverId,sessions])=>{
            if (!sessions.length) return null;
            const latest=sessions[sessions.length-1];
            const last=latest[latest.length-1];
            if (!last||isNaN(last.lat)) return null;
            const speedKmh=Math.round((last.speed||0)*3.6);
            const isOnline=(Date.now()-new Date(last.timestamp).getTime())<15*60*1000;
            return (
              <Marker key={driverId} position={[last.lat,last.lon]} icon={truckIcon}>
                <Popup className="cpopup">
                  <div className="p-3">
                    <h3 className="font-bold text-slate-800 text-sm border-b pb-1.5 mb-2 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isOnline?'bg-emerald-500':'bg-slate-400'}`}/>
                      {getDisplayName(driverId)}
                    </h3>
                    <div className="text-xs text-slate-600 space-y-1">
                      <div className="flex justify-between"><b>Hız:</b> {speedKmh} km/h</div>
                      <div className="flex justify-between"><b>Son görülme:</b> {new Date(last.timestamp).toLocaleTimeString('tr-TR')}</div>
                      <div className="flex justify-between"><b>Toplam oturum:</b> {sessions.length}</div>
                      <div className="flex justify-between"><b>Durum:</b> <span className={isOnline?'text-emerald-600':'text-slate-400'}>{isOnline?'Çevrimiçi':'Çevrimdışı'}</span></div>
                    </div>
                    <button onClick={()=>{ setSelectedSession(selectedSession===latest?null:latest); setShowSidebar(false); }}
                      className="mt-2.5 w-full text-center text-xs py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-semibold rounded-lg transition-colors">
                      {selectedSession===latest?'Rotayı Gizle':'Son Rotayı Göster →'}
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      )}
    </div>
  );
}

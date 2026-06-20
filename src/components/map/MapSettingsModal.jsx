import React, { useState, useContext, useEffect } from 'react';
import { X, Smartphone, MapPin, Trash2, Plus, Check, User, Truck, Settings } from 'lucide-react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { useCompany } from '../../context/CompanyContext';
import { useTruck } from '../../context/TruckContext';
import { DataContext } from '../../context/DataContext';

export default function MapSettingsModal({ onClose, onStartAddGeofence, unmappedActiveDeviceIds }) {
  const [activeTab, setActiveTab] = useState('devices'); // 'devices' or 'geofences'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Arka plan bulanıklığı */}
      <div className="absolute inset-0 bg-[#0a0c10]/70 backdrop-blur-md" onClick={onClose}></div>
      
      {/* Modal Kartı */}
      <div className="relative w-full max-w-md animate-in zoom-in-95 duration-300">
        <div className="glass-panel overflow-hidden flex flex-col max-h-[85vh] border border-white/5 shadow-2xl shadow-indigo-500/10">
          
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-r from-indigo-500/10 to-transparent border-b border-white/5">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
                <div className="p-2 bg-indigo-500/20 rounded-lg">
                  <Settings className="text-indigo-400" size={18} />
                </div>
                Harita Ayarları
              </h2>
              <p className="text-xs text-slate-400 mt-1.5 font-medium">Harita davranışlarını ve veri bağlantılarını yönetin.</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all">
              <X size={20} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/5 px-4 pt-2">
            <button
              onClick={() => setActiveTab('devices')}
              className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all flex items-center justify-center gap-2 ${activeTab === 'devices' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
              <Smartphone size={16} /> Cihaz Eşleştirmeleri
            </button>
            <button
              onClick={() => setActiveTab('geofences')}
              className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all flex items-center justify-center gap-2 ${activeTab === 'geofences' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
              <MapPin size={16} /> Özel Bölgeler
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 pt-8 custom-scrollbar">
            {activeTab === 'devices' ? <DeviceTab unmappedActiveDeviceIds={unmappedActiveDeviceIds} /> : <GeofenceTab onClose={onClose} onStartAddGeofence={onStartAddGeofence} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// TAB 1: CİHAZ EŞLEŞTİRMELERİ
// ==========================================
function DeviceTab({ unmappedActiveDeviceIds }) {
  const { activeCompanyId } = useCompany();
  const { trucks } = useTruck();
  const [deviceMappings, setDeviceMappings] = useState({});
  const [loading, setLoading] = useState(true);
  
  const [mappingDevice, setMappingDevice] = useState(null);
  const [mappingTruckId, setMappingTruckId] = useState('');
  const [mappingDriverName, setMappingDriverName] = useState('');
  const [savingMapping, setSavingMapping] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState('');

  const mappingsDocId = `device_mappings_${activeCompanyId || 'default'}`;

  useEffect(() => {
    getDoc(doc(db, 'company_data', mappingsDocId)).then(s => { 
      if(s.exists()) setDeviceMappings(s.data()); 
      setLoading(false);
    });
  }, [mappingsDocId]);

  const saveMapping = async (deviceId) => {
    if (!deviceId) return;
    setSavingMapping(true);
    const updated = { ...deviceMappings, [deviceId]: { truckId: mappingTruckId, driverName: mappingDriverName } };
    
    // Eğer ikisi de boşsa eşleştirmeyi sil
    if (!mappingTruckId && !mappingDriverName) {
      delete updated[deviceId];
    }

    await setDoc(doc(db, 'company_data', mappingsDocId), updated);
    setDeviceMappings(updated);
    setMappingDevice(null);
    setMappingTruckId('');
    setMappingDriverName('');
    setNewDeviceId('');
    setSavingMapping(false);
  };

  const deleteMapping = async (deviceId) => {
    if (!window.confirm(`${deviceId} cihazının eşleştirmesini silmek istediğinize emin misiniz?`)) return;
    setSavingMapping(true);
    const updated = { ...deviceMappings };
    delete updated[deviceId];
    await setDoc(doc(db, 'company_data', mappingsDocId), updated);
    setDeviceMappings(updated);
    setSavingMapping(false);
  };

  const devices = Object.keys(deviceMappings);

  if (loading) {
    return <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300 pt-1">
      
      {/* Keşfedilen Eşleştirilmemiş Cihazlar */}
      {unmappedActiveDeviceIds && unmappedActiveDeviceIds.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              ⚠️ Keşfedilen Cihazlar
            </h4>
            <span className="bg-amber-500/20 text-amber-300 text-[9px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
              {unmappedActiveDeviceIds.length} Aktif
            </span>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed">
            Son 24 saat içinde sinyal gönderen ama eşleştirilmemiş cihazlar tespit edildi. Hemen atama yapabilirsiniz:
          </p>
          <div className="space-y-2 pt-1">
            {unmappedActiveDeviceIds.map(id => (
              <div key={id} className="flex justify-between items-center bg-[#0a0c10]/40 rounded-xl px-3 py-2 border border-white/5">
                <span className="text-xs font-mono text-slate-300 font-bold">{id}</span>
                <button
                  onClick={() => {
                    setMappingDevice(id);
                    setMappingTruckId('');
                    setMappingDriverName('');
                    setNewDeviceId(id);
                  }}
                  className="text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 transition-all cursor-pointer"
                >
                  Eşleştir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mevcut Eşleştirmeler Başlık */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-300">Aktif Cihazlar</h3>
        <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-500/20">
          {devices.length} Cihaz
        </span>
      </div>

      {/* Mevcut Eşleştirmeler */}
      {devices.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
          <div className="w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center mb-3">
            <Smartphone size={20} className="text-slate-500" />
          </div>
          <p className="text-slate-400 text-sm font-medium">Kayıtlı cihaz eşleştirmesi yok.</p>
        </div>
      )}
      
      {devices.map(deviceId => {
        const mapped = deviceMappings[deviceId];
        const isEditing = mappingDevice === deviceId;
        const truck = trucks.find(t => t.id === mapped.truckId);

        return (
          <div key={deviceId} className="group bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] hover:border-indigo-500/30 rounded-2xl p-4 transition-all">
            <div className="flex justify-between items-start mb-2">
              <div className="font-bold text-slate-200 text-sm group-hover:text-indigo-100 transition-colors flex items-center gap-2">
                <Smartphone size={14} className="text-indigo-400/70" /> {deviceId}
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    if (isEditing) { setMappingDevice(null); return; }
                    setMappingDevice(deviceId);
                    setMappingTruckId(mapped?.truckId || '');
                    setMappingDriverName(mapped?.driverName || '');
                  }}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded-lg transition-colors"
                >
                  {isEditing ? 'İptal' : 'Düzenle'}
                </button>
                {!isEditing && (
                  <button onClick={() => deleteMapping(deviceId)} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all" title="Eşleştirmeyi Sil">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            
            {isEditing ? (
              <div className="space-y-3 mt-4 pt-4 border-t border-white/5">
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5"><User size={12}/> Şoför Adı</label>
                  <input value={mappingDriverName} onChange={e=>setMappingDriverName(e.target.value)} placeholder="Örn: Kenan İnaner"
                    className="w-full bg-[#0a0c10] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5"><Truck size={12}/> Tır Seç</label>
                  <select value={mappingTruckId} onChange={e=>setMappingTruckId(e.target.value)}
                    className="w-full bg-[#0a0c10] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors">
                    <option value="">-- Tır Seç --</option>
                    {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
                  </select>
                </div>
                <button onClick={() => saveMapping(deviceId)} disabled={savingMapping}
                  className="w-full py-2.5 mt-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2">
                  {savingMapping ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Check size={14}/>}
                  Kaydet
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 mt-3">
                <span className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                  <User size={12} className="text-slate-500"/> {mapped.driverName || <span className="text-slate-600 italic">Belirtilmedi</span>}
                </span>
                <span className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                  <Truck size={12} className="text-slate-500"/> {truck?.plate || <span className="text-slate-600 italic">Belirtilmedi</span>}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* Yeni Cihaz Ekleme */}
      <div className="mt-6 border-t border-white/5 pt-6">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Plus size={14} className="text-indigo-400" /> Yeni Cihaz Manuel Eşleştir
        </h4>
        <div className="space-y-3">
          <input 
            value={newDeviceId} 
            onChange={e => setNewDeviceId(e.target.value)} 
            placeholder="Cihaz ID (Örn: device_123)"
            className="w-full bg-[#0a0c10] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500 outline-none transition-colors"
          />
          {newDeviceId && mappingDevice !== newDeviceId && (
            <button 
              onClick={() => {
                setMappingDevice(newDeviceId);
                setMappingTruckId('');
                setMappingDriverName('');
              }}
              className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 text-xs font-bold transition-all"
            >
              Eşleştirme Ayarlarını Aç
            </button>
          )}
          {mappingDevice === newDeviceId && (
            <div className="space-y-3 p-4 bg-white/[0.02] rounded-2xl border border-indigo-500/30 animate-in fade-in slide-in-from-top-2 duration-300">
              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5"><User size={12}/> Şoför Adı</label>
                <input value={mappingDriverName} onChange={e=>setMappingDriverName(e.target.value)} className="w-full bg-[#0a0c10] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5"><Truck size={12}/> Tır Seç</label>
                <select value={mappingTruckId} onChange={e=>setMappingTruckId(e.target.value)} className="w-full bg-[#0a0c10] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors">
                  <option value="">-- Tır Seç --</option>
                  {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
                </select>
              </div>
              <button onClick={() => saveMapping(newDeviceId)} disabled={savingMapping} className="w-full py-2.5 mt-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2">
                {savingMapping ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Check size={14}/>} Kaydet
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// ==========================================
// TAB 2: ÖZEL BÖLGELER (GEOFENCES)
// ==========================================
function GeofenceTab({ onClose, onStartAddGeofence }) {
  const { geofences, deleteGeofence } = useContext(DataContext);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pt-1">
      
      {/* Büyük Eylem Butonu */}
      <button
        onClick={() => {
          onClose();
          onStartAddGeofence();
        }}
        className="w-full relative group overflow-hidden rounded-2xl p-[1px] transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/25"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-70 group-hover:opacity-100 transition-opacity"></div>
        <div className="relative bg-[#0f141e] px-4 py-4 rounded-2xl flex items-center justify-center gap-2 transition-all group-hover:bg-[#141a26]">
          <Plus size={20} className="text-indigo-400 group-hover:text-white transition-colors" />
          <span className="font-bold text-indigo-100 group-hover:text-white transition-colors">
            Harita Üzerinde Yeni Bölge Çiz
          </span>
        </div>
      </button>

      {/* List */}
      <div className="space-y-3">
        {geofences.map(zone => (
          <div key={zone.id} className="group flex items-center justify-between p-4 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] hover:border-indigo-500/30 rounded-2xl transition-all">
            <div>
              <h3 className="text-sm font-bold text-slate-200 group-hover:text-indigo-100 transition-colors">{zone.name}</h3>
              <p className="text-[11px] text-slate-500 mt-1 font-medium flex items-center gap-1.5">
                <span>{zone.lat.toFixed(4)}, {zone.lon.toFixed(4)}</span>
                <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                <span className="text-indigo-400/80 font-mono">{Number(zone.radiusKm).toFixed(2)} km çap</span>
              </p>
            </div>
            <button onClick={() => deleteGeofence(zone.id, zone.name)} className="p-2.5 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all" title="Bölgeyi Sil">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {geofences.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
            <div className="w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center mb-3">
              <MapPin size={20} className="text-slate-500" />
            </div>
            <p className="text-slate-400 text-sm font-medium">Henüz özel bölge eklemediniz.</p>
            <p className="text-slate-500 text-xs mt-1">Yukarıdaki butonu kullanarak haritadan çizebilirsiniz.</p>
          </div>
        )}
      </div>

    </div>
  );
}

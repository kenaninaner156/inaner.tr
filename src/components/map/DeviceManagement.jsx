import React, { useState, useEffect } from 'react';
import { X, Smartphone, Check, User, Truck } from 'lucide-react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { useCompany } from '../../context/CompanyContext';
import { useTruck } from '../../context/TruckContext';

export default function DeviceManagement({ onClose }) {
  const { activeCompanyId } = useCompany();
  const { trucks } = useTruck();
  
  const [deviceMappings, setDeviceMappings] = useState({});
  const [loading, setLoading] = useState(true);
  
  // Eşleştirme düzenleme state'leri
  const [mappingDevice, setMappingDevice] = useState(null);
  const [mappingTruckId, setMappingTruckId] = useState('');
  const [mappingDriverName, setMappingDriverName] = useState('');
  const [savingMapping, setSavingMapping] = useState(false);

  // Bu şimdilik haritada sinyal gönderen her cihazın IDsini gerektiriyor ama elimizde direkt cihaz listesi yok.
  // Gerçek bir sistemde 'devices' diye ayrı bir tablo olur. Şimdilik `deviceMappings` içindeki keyleri listeliyoruz, 
  // ya da prop olarak aktif cihazları alabiliriz. MapLayout'dan geçirebilirdik.
  // Basitlik adına sadece eşleştirilmişleri listeliyoruz + yeni ekleme alanı sunuyoruz.
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

  const devices = Object.keys(deviceMappings);

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/60 rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        
        <div className="p-5 border-b border-slate-700/50 flex justify-between items-center">
          <div>
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <Smartphone size={20} className="text-indigo-400"/> Cihaz Eşleştirmeleri
            </h3>
            <p className="text-slate-400 text-xs mt-1">Haritadaki GPS cihazlarını tırlara ve şoförlere bağlayın.</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-2 bg-slate-800 rounded-xl transition-colors">
            <X size={18}/>
          </button>
        </div>

        <div className="p-5 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {loading ? (
            <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              
              {/* Mevcut Eşleştirmeler */}
              {devices.length === 0 && <p className="text-sm text-slate-500 text-center py-4">Kayıtlı cihaz eşleştirmesi yok.</p>}
              
              {devices.map(deviceId => {
                const mapped = deviceMappings[deviceId];
                const isEditing = mappingDevice === deviceId;
                const truck = trucks.find(t => t.id === mapped.truckId);

                return (
                  <div key={deviceId} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-bold text-slate-200 text-sm">{deviceId}</div>
                      <button 
                        onClick={() => {
                          if (isEditing) { setMappingDevice(null); return; }
                          setMappingDevice(deviceId);
                          setMappingTruckId(mapped?.truckId || '');
                          setMappingDriverName(mapped?.driverName || '');
                        }}
                        className="text-xs text-indigo-400 hover:underline"
                      >
                        {isEditing ? 'İptal' : 'Düzenle'}
                      </button>
                    </div>
                    
                    {isEditing ? (
                      <div className="space-y-3 mt-3 pt-3 border-t border-slate-700/50">
                        <div>
                          <label className="text-xs text-slate-400 mb-1 flex items-center gap-1"><User size={12}/> Şoför Adı</label>
                          <input value={mappingDriverName} onChange={e=>setMappingDriverName(e.target.value)} placeholder="Örn: Kenan İnaner"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"/>
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Truck size={12}/> Tır Seç</label>
                          <select value={mappingTruckId} onChange={e=>setMappingTruckId(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                            <option value="">-- Tır Seç --</option>
                            {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
                          </select>
                        </div>
                        <button onClick={() => saveMapping(deviceId)} disabled={savingMapping}
                          className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2">
                          {savingMapping ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Check size={14}/>}
                          Kaydet
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><User size={12}/> {mapped.driverName || 'Belirtilmedi'}</span>
                        <span className="flex items-center gap-1"><Truck size={12}/> {truck?.plate || 'Belirtilmedi'}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Yeni Cihaz Ekleme (Eğer henüz eşleştirilmemiş bir ID varsa manuel girmek için) */}
              <div className="mt-6 border-t border-slate-700/50 pt-4">
                <h4 className="text-sm font-semibold text-white mb-3">Yeni Cihaz Manuel Eşleştir</h4>
                <div className="space-y-3">
                  <input 
                    value={newDeviceId} 
                    onChange={e => setNewDeviceId(e.target.value)} 
                    placeholder="Cihaz ID (Örn: device_123)"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                  {newDeviceId && (
                    <button 
                      onClick={() => {
                        setMappingDevice(newDeviceId);
                        setMappingTruckId('');
                        setMappingDriverName('');
                      }}
                      className="text-xs text-indigo-400 hover:underline"
                    >
                      Eşleştirme Ayarlarını Aç
                    </button>
                  )}
                  {mappingDevice === newDeviceId && (
                    <div className="space-y-3 mt-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                      <div>
                        <label className="text-xs text-slate-400 mb-1">Şoför Adı</label>
                        <input value={mappingDriverName} onChange={e=>setMappingDriverName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"/>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 mb-1">Tır Seç</label>
                        <select value={mappingTruckId} onChange={e=>setMappingTruckId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
                          <option value="">-- Tır Seç --</option>
                          {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
                        </select>
                      </div>
                      <button onClick={() => saveMapping(newDeviceId)} className="w-full py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold">Kaydet</button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

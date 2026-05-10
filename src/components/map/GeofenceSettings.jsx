import React, { useState, useContext } from 'react';
import { X, Plus, Trash2, MapPin } from 'lucide-react';
import { DataContext } from '../../context/DataContext';

export default function GeofenceSettings({ onClose, initialZone, onSelectFromMap }) {
  const { geofences, addGeofence, deleteGeofence } = useContext(DataContext);
  const [isAdding, setIsAdding] = useState(!!initialZone);
  const [newZone, setNewZone] = useState(initialZone || { name: '', lat: '', lon: '', radiusKm: 0.5 });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newZone.name || !newZone.lat || !newZone.lon) return;
    
    await addGeofence({
      name: newZone.name,
      lat: parseFloat(newZone.lat),
      lon: parseFloat(newZone.lon),
      radiusKm: parseFloat(newZone.radiusKm) || 0.5
    });
    
    setIsAdding(false);
    setNewZone({ name: '', lat: '', lon: '', radiusKm: 0.5 });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/50 bg-[#0B0E14]">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <MapPin className="text-indigo-400" size={20} /> Özel Bölgeler
            </h2>
            <p className="text-xs text-slate-400 mt-1">Bu bölgelerde 5dk beklenirse rota bölünür.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl text-slate-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full py-3 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
            >
              <Plus size={18} /> Yeni Bölge Ekle
            </button>
          )}

          {isAdding && (
            <form onSubmit={handleAdd} className="bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1 block">Bölge Adı</label>
                <input
                  type="text" required
                  placeholder="Örn: Çayırhan Tesis"
                  value={newZone.name} onChange={e => setNewZone({...newZone, name: e.target.value})}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500 outline-none transition-colors"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Enlem (Lat)</label>
                  <input
                    type="number" step="any" required
                    placeholder="40.098"
                    value={newZone.lat} onChange={e => setNewZone({...newZone, lat: e.target.value})}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Boylam (Lon)</label>
                  <input
                    type="number" step="any" required
                    placeholder="31.621"
                    value={newZone.lon} onChange={e => setNewZone({...newZone, lon: e.target.value})}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => onSelectFromMap(newZone)}
                className="w-full py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <MapPin size={14} /> Haritadan Nokta Seç
              </button>
              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1 block">Yarıçap (KM)</label>
                <input
                  type="number" step="0.1" min="0.1" required
                  value={newZone.radiusKm} onChange={e => setNewZone({...newZone, radiusKm: e.target.value})}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500 outline-none transition-colors"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-2.5 rounded-xl text-slate-400 hover:bg-white/5 font-semibold text-sm transition-colors">İptal</button>
                <button type="submit" className="flex-1 py-2.5 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 transition-all">Kaydet</button>
              </div>
            </form>
          )}

          {/* List */}
          <div className="space-y-3">
            {geofences.map(zone => (
              <div key={zone.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">{zone.name}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">{zone.lat.toFixed(4)}, {zone.lon.toFixed(4)} • {zone.radiusKm} km çap</p>
                </div>
                <button onClick={() => deleteGeofence(zone.id, zone.name)} className="p-2 text-rose-400/50 hover:text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {geofences.length === 0 && !isAdding && (
              <div className="text-center py-8 text-slate-500 text-sm">
                Henüz özel bölge eklenmedi.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

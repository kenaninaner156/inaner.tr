import React, { useContext } from 'react';
import { X, Plus, Trash2, MapPin } from 'lucide-react';
import { DataContext } from '../../context/DataContext';

export default function GeofenceSettings({ onClose, onStartAddGeofence }) {
  const { geofences, deleteGeofence } = useContext(DataContext);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Arka plan */}
      <div className="absolute inset-0 bg-[#0a0c10]/80" onClick={onClose}></div>
      
      {/* Modal Kartı */}
      <div className="relative w-full max-w-md animate-in zoom-in-95 duration-300">
        <div className="glass-panel overflow-hidden flex flex-col max-h-[85vh] border border-white/5 shadow-2xl shadow-indigo-500/10">
          
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-r from-indigo-500/10 to-transparent border-b border-white/5">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
                <div className="p-2 bg-indigo-500/20 rounded-lg">
                  <MapPin className="text-indigo-400" size={18} />
                </div>
                Özel Bölgeler
              </h2>
              <p className="text-xs text-slate-400 mt-1.5 font-medium">Bu bölgelerde 5dk beklenirse rota bölünür.</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all">
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            
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
                  <button onClick={() => deleteGeofence(zone.id, zone.name)} className="p-2.5 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {geofences.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <div className="w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center mb-3">
                    <MapPin size={20} className="text-slate-500" />
                  </div>
                  <p className="text-slate-400 text-sm font-medium">Henüz özel bölge eklemediniz.</p>
                  <p className="text-slate-500 text-xs mt-1">Yukarıdaki butonu kullanarak haritadan bölge çizebilirsiniz.</p>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

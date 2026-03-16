import React, { useState, useContext } from 'react';
import { Droplet, Plus, MapPin, X, Trash2, Paperclip, FileText, Download, Pencil, StickyNote, ChevronDown } from 'lucide-react';
import { DataContext } from '../context/DataContext';
import FileUpload from './FileUpload';

const Fuel = () => {
    const { fuelRecords, addFuel, deleteFuel, editFuel } = useContext(DataContext);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [viewFiles, setViewFiles] = useState(null);
    const [editingFuel, setEditingFuel] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [showExtra, setShowExtra] = useState(false);
    const [editShowExtra, setEditShowExtra] = useState(false);
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        station: '',
        liters: '',
        price: '',
        notes: '',
        files: []
    });

    const openEditModal = (record) => {
        setEditingFuel(record);
        setEditForm({
            date: record.date,
            station: record.station,
            liters: record.liters,
            price: record.price,
            notes: record.notes || '',
            files: record.files || []
        });
    };

    const handleAdd = (e) => {
        e.preventDefault();
        addFuel({
            date: formData.date,
            station: formData.station,
            liters: parseFloat(formData.liters),
            price: parseFloat(formData.price),
            notes: formData.notes,
            files: formData.files
        });
        setIsModalOpen(false);
        setShowExtra(false);
        setFormData({ date: new Date().toISOString().split('T')[0], station: '', liters: '', price: '', notes: '', files: [] });
    };

    const handleEdit = async () => {
        await editFuel(editingFuel.id, {
            date: editForm.date,
            station: editForm.station,
            liters: parseFloat(editForm.liters),
            price: parseFloat(editForm.price),
            notes: editForm.notes,
            files: editForm.files
        });
        setEditingFuel(null);
    };

    const handleDelete = (id) => {
        deleteFuel(id);
    };

    const activeFuelRecords = fuelRecords.filter(r => !r.deleted);
    const totalLiters = activeFuelRecords.reduce((acc, r) => acc + r.liters, 0);
    const totalCost = activeFuelRecords.reduce((acc, r) => acc + r.price, 0);

    return (
        <div className="space-y-6 animate-in fade-in duration-500 relative pb-ios-nav">
            {/* Özet ve Ekleme */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex gap-4 w-full md:w-auto">
                    <div className="glass-panel px-4 py-2 flex items-center gap-3 flex-1">
                        <div className="bg-orange-500/20 p-2 rounded-lg text-orange-400"><Droplet size={20} /></div>
                        <div>
                            <p className="text-xs text-[var(--text-secondary)]">Toplam Alınan</p>
                            <p className="font-bold text-[var(--text-primary)]">{totalLiters.toFixed(2)} Lt</p>
                        </div>
                    </div>
                    <div className="glass-panel px-4 py-2 flex items-center gap-3 flex-1">
                        <div className="bg-brand-500/20 p-2 rounded-lg text-brand-400"><span className="font-bold text-lg leading-none">₺</span></div>
                        <div>
                            <p className="text-xs text-[var(--text-secondary)]">Toplam Tutar</p>
                            <p className="font-bold text-[var(--text-primary)]">₺{totalCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                </div>
                <button onClick={() => setIsModalOpen(true)}
                    className="w-full md:w-auto bg-orange-600 hover:bg-orange-500 text-[var(--text-primary)] px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center">
                    <Plus size={18} className="mr-2" /> Yeni Fiş Ekle
                </button>
            </div>

            {/* Tablo */}
            <div className="glass-panel overflow-hidden">
                <div className="overflow-x-auto -mx-0 md:mx-0">
                    <table className="w-full text-left border-collapse hidden md:table" style={{ minWidth: '600px' }}>
                        <thead>
                            <tr className="bg-white/5 border-b border-[var(--border-color)] text-[var(--text-secondary)] text-xs uppercase tracking-wide">
                                <th className="p-3 pl-4">Tarih</th>
                                <th className="p-3">İstasyon</th>
                                <th className="p-3 text-center">Litre</th>
                                <th className="p-3 text-right">Tutar</th>
                                <th className="p-3 text-center w-24"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {activeFuelRecords.length > 0 ? activeFuelRecords.map((record) => (
                                <tr key={record.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="p-3 pl-4 text-[var(--text-primary)] text-sm whitespace-nowrap">
                                        {new Date(record.date).toLocaleDateString('tr-TR')}
                                    </td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-1.5">
                                            <MapPin size={10} className="text-orange-400 flex-shrink-0" />
                                            <span className="text-[var(--text-primary)] text-sm">{record.station}</span>
                                        </div>
                                        {record.notes && (
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <StickyNote size={9} className="text-slate-500" />
                                                <span className="text-xs text-slate-500 truncate max-w-[200px]">{record.notes}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-3 text-center text-[var(--text-primary)] font-medium text-sm">{record.liters} Lt</td>
                                    <td className="p-3 text-right text-orange-400 font-bold text-sm">
                                        ₺{record.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                        <div className="text-xs text-slate-500 font-normal">₺{(record.price / record.liters).toFixed(2)}/Lt</div>
                                    </td>
                                    <td className="p-2 text-center">
                                        <div className="flex items-center justify-center gap-0.5">
                                            {record.files && record.files.length > 0 && (
                                                <button onClick={() => setViewFiles({ title: record.station, files: record.files })}
                                                    title={`${record.files.length} ek`}
                                                    className="p-1.5 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-brand-500/10">
                                                    <Paperclip size={14} />
                                                </button>
                                            )}
                                            <button onClick={() => openEditModal(record)}
                                                className="p-1.5 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-brand-500/10">
                                                <Pencil size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan="5" className="p-8 text-center text-slate-500">
                                    <Droplet size={32} className="mx-auto mb-3 opacity-30" />
                                    <p className="text-[var(--text-secondary)] font-medium">Henüz Kayıtlı Fiş Yok</p>
                                </td></tr>
                            )}
                        </tbody>
                    </table>

                    {/* Mobil Kart Görünümü */}
                    <div className="md:hidden flex flex-col gap-3 p-2">
                        {activeFuelRecords.length > 0 ? (
                            activeFuelRecords.map((record) => (
                                <div key={record.id} className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl p-4 shadow-sm relative overflow-hidden">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <div className="font-bold text-[var(--text-primary)] leading-tight flex items-center gap-1.5 text-[13px]">
                                                <MapPin size={14} className="text-orange-500" />
                                                {record.station}
                                            </div>
                                            {record.notes && (
                                                <div className="flex items-center gap-1 mt-1">
                                                    <StickyNote size={9} className="text-slate-500" />
                                                    <span className="text-[10px] text-slate-500 truncate max-w-[160px]">{record.notes}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-[10px] text-slate-500 font-medium">
                                                {new Date(record.date).toLocaleDateString('tr-TR')}
                                            </div>
                                            {record.files && record.files.length > 0 && (
                                                <button onClick={() => setViewFiles({ title: `Fiş Eki`, files: record.files })}
                                                    className="p-1 bg-brand-500/10 hover:bg-brand-500/20 rounded-md text-brand-400 transition-colors flex items-center">
                                                    <Paperclip size={12} />
                                                </button>
                                            )}
                                            <button onClick={() => openEditModal(record)}
                                                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-md text-[var(--text-secondary)] hover:text-orange-400 transition-colors">
                                                <Pencil size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 bg-white/5 rounded-xl p-2.5 items-center mt-3">
                                        <div className="flex flex-col">
                                            <div className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">LİTRE</div>
                                            <div className="text-[var(--text-primary)] font-medium text-xs">{record.liters} Lt</div>
                                        </div>
                                        <div className="flex flex-col border-l border-white/10 pl-2">
                                            <div className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">BİRİM</div>
                                            <div className="text-[var(--text-secondary)] font-medium text-xs">₺{(record.price / record.liters).toFixed(2)}</div>
                                        </div>
                                        <div className="flex flex-col items-end border-l border-white/10 pl-2 relative">
                                            <div className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5 w-full text-right">TUTAR</div>
                                            <div className="text-orange-400 font-bold text-sm w-full text-right">₺{parseFloat(record.price).toLocaleString('tr-TR')}</div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center text-slate-500">
                                <Droplet size={32} className="mx-auto mb-3 opacity-30" />
                                <p className="text-[var(--text-secondary)] font-medium">Henüz Kayıtlı Fiş Yok</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── DÜZENLE MODAL ─── */}
            {editingFuel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-panel w-full max-w-lg p-6 relative animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
                        <button onClick={() => setEditingFuel(null)} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-5 flex items-center gap-2">
                            <Pencil size={16} className="text-orange-400" /> Fişi Düzenle
                        </h3>
                        <div className="space-y-4">
                            {/* Tarih */}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tarih</label>
                                <input type="date" className="w-full glass-input px-3 py-2 text-sm"
                                    value={editForm.date}
                                    onChange={e => setEditForm({ ...editForm, date: e.target.value })} />
                            </div>
                            {/* İstasyon */}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">İstasyon / Konum</label>
                                <input type="text" className="w-full glass-input px-3 py-2 text-sm"
                                    value={editForm.station}
                                    onChange={e => setEditForm({ ...editForm, station: e.target.value })} />
                            </div>

                            {/* Litre & Ek Bilgiler Toggle */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Litre</label>
                                    <input type="number" step="0.01" className="w-full glass-input px-3 py-2 text-sm"
                                        value={editForm.liters}
                                        onChange={e => setEditForm({ ...editForm, liters: e.target.value })} />
                                </div>
                                <div className="flex items-end">
                                    <button
                                        type="button"
                                        onClick={() => setEditShowExtra(!editShowExtra)}
                                        className={`w-full py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${editShowExtra ? 'bg-orange-500/10 border-orange-500/50 text-orange-400 shadow-lg shadow-orange-500/10' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                                    >
                                        <StickyNote size={14} className={editShowExtra ? "animate-pulse" : ""} />
                                        Ek Bilgiler {editShowExtra ? <ChevronDown size={14} className="rotate-180" /> : <ChevronDown size={14} />}
                                    </button>
                                </div>
                            </div>

                            {/* Tutar Alanı */}
                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex flex-col items-center justify-center shadow-lg shadow-emerald-500/5">
                                <label className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-[0.2em] mb-1">Toplam Tutar</label>
                                <div className="relative">
                                    <span className="absolute -left-5 top-1 font-bold text-xl text-emerald-500/40">₺</span>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        className="bg-transparent text-3xl font-black text-emerald-400 text-center focus:outline-none w-40 placeholder:text-emerald-900"
                                        value={editForm.price}
                                        onChange={e => setEditForm({ ...editForm, price: e.target.value })}
                                        placeholder="0.00"
                                    />
                                </div>
                                {editForm.liters > 0 && editForm.price > 0 && (
                                    <div className="text-[10px] bg-emerald-500/10 text-emerald-500/80 px-2 py-0.5 rounded-full mt-2 font-bold transition-all animate-in fade-in slide-in-from-top-1">
                                        BİRİM: ₺{(editForm.price / editForm.liters).toFixed(2)} / Lt
                                    </div>
                                )}
                            </div>

                            {/* Ek Bilgiler (Not & Dosya) */}
                            {editShowExtra && (
                                <div className="space-y-4 pt-2 border-t border-white/5 animate-in slide-in-from-top-4 duration-300">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">📝 Not (İsteğe Bağlı)</label>
                                        <textarea
                                            rows={2}
                                            className="w-full glass-input px-3 py-2 text-sm resize-none text-[var(--text-primary)]"
                                            placeholder="Not ekleyin..."
                                            value={editForm.notes}
                                            onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">📎 Fotoğraf / Belge</label>
                                        <FileUpload files={editForm.files} onChange={files => setEditForm({ ...editForm, files })} />
                                    </div>
                                </div>
                            )}

                            {/* Aksiyon Butonları */}
                            <div className="grid grid-cols-5 gap-3 mt-2">
                                <button onClick={handleEdit}
                                    className="col-span-4 bg-orange-600 hover:bg-orange-500 text-[var(--text-primary)] py-3 rounded-xl font-bold transition-all shadow-lg shadow-orange-500/20">
                                    Kaydet
                                </button>
                                <button onClick={() => { handleDelete(editingFuel.id); setEditingFuel(null); }}
                                    className="col-span-1 flex items-center justify-center text-red-500 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all">
                                    <Trash2 size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── YENİ FİŞ MODAL ─── */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-panel w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto border-orange-500/30">
                        <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                            <X size={20} />
                        </button>
                        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center">
                            <Droplet className="mr-2 text-orange-500" /> Yeni Mazot Fişi
                        </h3>
                        <form onSubmit={handleAdd} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tarih</label>
                                <input type="date" required className="w-full glass-input px-4 py-2.5 text-sm font-medium" value={formData.date}
                                    onChange={e => setFormData({ ...formData, date: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">İstasyon / Konum</label>
                                <input type="text" required placeholder="Örn: Shell Eryaman" className="w-full glass-input px-4 py-2.5 text-sm" value={formData.station}
                                    onChange={e => setFormData({ ...formData, station: e.target.value })} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Litre</label>
                                    <input type="number" step="0.01" required placeholder="0.00" className="w-full glass-input px-4 py-2.5 text-sm" value={formData.liters}
                                        onChange={e => setFormData({ ...formData, liters: e.target.value })} />
                                </div>
                                <div className="flex items-end">
                                    <button
                                        type="button"
                                        onClick={() => setShowExtra(!showExtra)}
                                        className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${showExtra ? 'bg-orange-500/10 border-orange-500/50 text-orange-400 shadow-lg shadow-orange-500/10' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                                    >
                                        <StickyNote size={14} className={showExtra ? "animate-pulse" : ""} />
                                        Ek Bilgiler {showExtra ? <ChevronDown size={14} className="rotate-180" /> : <ChevronDown size={14} />}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-6 flex flex-col items-center justify-center shadow-lg shadow-emerald-500/5 my-2 relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
                                <label className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-[0.3em] mb-2">Toplam Tutar</label>
                                <div className="relative">
                                    <span className="absolute -left-6 top-1.5 font-bold text-2xl text-emerald-500/40">₺</span>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        required
                                        className="bg-transparent text-4xl font-black text-emerald-400 text-center focus:outline-none w-48 placeholder:text-emerald-900/30"
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: e.target.value })}
                                        placeholder="0.00"
                                    />
                                </div>
                                {formData.liters > 0 && formData.price > 0 && (
                                    <div className="text-[11px] bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full mt-3 font-bold border border-emerald-500/20 animate-in fade-in zoom-in duration-300">
                                        BİRİM: ₺{(formData.price / formData.liters).toFixed(2)} / Lt
                                    </div>
                                )}
                            </div>

                            {showExtra && (
                                <div className="space-y-4 pt-4 border-t border-white/5 animate-in slide-in-from-top-4 duration-500">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">📝 Not (İsteğe Bağlı)</label>
                                        <textarea
                                            rows={2}
                                            className="w-full glass-input px-4 py-2 resize-none text-sm text-[var(--test-primary)]"
                                            placeholder="Fiş hakkında not ekleyin..."
                                            value={formData.notes}
                                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">📎 Fiş Fotoğrafı / Belge</label>
                                        <FileUpload files={formData.files} onChange={files => setFormData({ ...formData, files })} />
                                    </div>
                                </div>
                            )}

                            <button type="submit"
                                className="w-full bg-orange-600 hover:bg-orange-500 text-[var(--text-primary)] px-4 py-4 rounded-xl font-bold transition-all shadow-lg shadow-orange-500/20 mt-2 uppercase tracking-wide">
                                Fişi Kaydet
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── DOSYA GÖRÜNTÜLEYICI ─── */}
            {viewFiles && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-panel w-full max-w-2xl p-6 relative animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <FileText className="text-orange-400" />
                                {viewFiles.title} İçin Ekler
                            </h3>
                            <button onClick={() => setViewFiles(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                            {viewFiles.files.map((file, idx) => (
                                <div key={idx} className="bg-white/5 border border-[var(--border-color)] rounded-xl overflow-hidden">
                                    {file.type && file.type.startsWith('image/') ? (
                                        <div className="bg-black/30 w-full flex justify-center p-4">
                                            <img src={file.data} alt="Belge/Makbuz" className="max-w-full max-h-[400px] object-contain rounded shadow-2xl" />
                                        </div>
                                    ) : (
                                        <div className="p-8 flex flex-col items-center justify-center bg-white/5">
                                            <FileText size={48} className="text-[var(--text-secondary)] mb-3" />
                                            <p className="text-[var(--text-primary)] font-medium">{file.name || 'Belge dosyası'}</p>
                                        </div>
                                    )}
                                    <div className="p-4 bg-white/5 border-t border-[var(--border-color)] flex justify-between items-center">
                                        <span className="text-sm text-[var(--text-secondary)] truncate max-w-[70%] font-medium">{file.name || 'Ek_Belge'}</span>
                                        <a href={file.data} download={file.name || 'Belge'}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-brand-400 hover:text-[var(--text-primary)] bg-brand-500/10 hover:bg-brand-500/30 border border-brand-500/20 rounded-lg transition-colors">
                                            <Download size={14} /> İndir
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Fuel;

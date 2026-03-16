import React, { useState, useContext, useMemo } from 'react';
import { DataContext } from '../context/DataContext';
import { Wallet, Search, Filter, TrendingUp, TrendingDown, Plus, Download, Trash2, Calendar, Pencil, ArrowDownRight, ArrowUpRight, X } from 'lucide-react';
import FileUpload from './FileUpload';

const Payments = () => {
    const {
        paymentRecords,
        addPayment,
        deletePayment,
        updatePayment
    } = useContext(DataContext);

    const [filterType, setFilterType] = useState('Hepsi'); // 'Hepsi', 'Tahsilat', 'Ödeme'
    const [filterMonth, setFilterMonth] = useState(''); // 'YYYY-MM'

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingPaymentId, setEditingPaymentId] = useState(null);

    // Form States
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        type: 'Tahsilat',
        description: '',
        amount: '',
        files: []
    });


    // Özet ve Filtre Hesaplamaları
    const activePaymentRecords = useMemo(() => {
        let records = (paymentRecords || []).filter(r => !r.deleted)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        if (filterType !== 'Hepsi') {
            records = records.filter(r => r.type === filterType);
        }

        if (filterMonth) {
            records = records.filter(r => {
                const recordMonth = r.date.substring(0, 7); // 'YYYY-MM'
                return recordMonth === filterMonth;
            });
        }

        return records;
    }, [paymentRecords, filterType, filterMonth]);

    const activeForBalance = (paymentRecords || []).filter(r => !r.deleted);
    const totalIncome = activeForBalance.filter(r => r.type === 'Tahsilat').reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalExpense = activeForBalance.filter(r => r.type === 'Ödeme').reduce((sum, r) => sum + (r.amount || 0), 0);
    const netBalance = totalIncome - totalExpense;

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            if (editingPaymentId) {
                await updatePayment(editingPaymentId, {
                    ...formData,
                    amount: parseFloat(formData.amount)
                });
            } else {
                await addPayment({
                    ...formData,
                    amount: parseFloat(formData.amount)
                });
            }

            setFormData({
                type: 'Tahsilat',
                date: new Date().toISOString().split('T')[0],
                description: '',
                amount: '',
                files: []
            });
            setIsAddModalOpen(false);
            setEditingPaymentId(null);
        } catch {
            
            alert('İşlem kaydedilemedi. Lütfen tekrar deneyin.');
        }
    };

    const handleDelete = (id) => {
        deletePayment(id);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Üst İstatistikler */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-panel p-5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl transition-all"></div>
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[var(--text-secondary)] text-sm font-medium">Toplam Tahsilat</p>
                            <h3 className="text-3xl font-bold mt-2 text-[var(--text-primary)]">₺{totalIncome.toLocaleString('tr-TR')}</h3>
                        </div>
                        <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
                            <ArrowDownRight size={24} />
                        </div>
                    </div>
                </div>

                <div className="glass-panel p-5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl transition-all"></div>
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[var(--text-secondary)] text-sm font-medium">Toplam Ödeme</p>
                            <h3 className="text-3xl font-bold mt-2 text-[var(--text-primary)]">₺{totalExpense.toLocaleString('tr-TR')}</h3>
                        </div>
                        <div className="p-2 bg-red-500/20 rounded-lg text-red-400">
                            <ArrowUpRight size={24} />
                        </div>
                    </div>
                </div>

                <div className="glass-panel p-5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/10 rounded-full blur-2xl transition-all"></div>
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[var(--text-secondary)] text-sm font-medium">Net Kasa (Bakiye)</p>
                            <h3 className={`text-3xl font-bold mt-2 ${netBalance >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                                ₺{netBalance.toLocaleString('tr-TR')}
                            </h3>
                        </div>
                        <div className="p-2 bg-brand-500/20 rounded-lg text-brand-400">
                            <Wallet size={24} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Aksiyon Barı */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-2">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="glass-input flex items-center px-4 py-2 hover:border-brand-500/30 transition-colors">
                        <Filter size={16} className="text-[var(--text-secondary)] mr-2" />
                        <span className="text-sm font-medium text-[var(--text-secondary)] mr-2">Tür:</span>
                        <select className="bg-transparent text-sm font-semibold focus:outline-none cursor-pointer"
                            value={filterType} onChange={e => setFilterType(e.target.value)}>
                            <option className="text-slate-900 font-medium" value="Hepsi">Tümü</option>
                            <option className="text-slate-900 font-medium" value="Tahsilat">Tahsilatlar</option>
                            <option className="text-slate-900 font-medium" value="Ödeme">Ödemeler</option>
                        </select>
                    </div>
                    <div className="glass-input flex items-center px-4 py-2 hover:border-brand-500/30 transition-colors relative group">
                        <Calendar size={16} className={`mr-1 transition-colors ${filterMonth ? 'text-brand-400' : 'text-[var(--text-secondary)] group-hover:text-brand-400'}`} />
                        <div className="relative flex items-center">
                            {/* Gerçek input (şeffaf ve üstte) */}
                            <input
                                type="month"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                value={filterMonth}
                                onChange={e => setFilterMonth(e.target.value)}
                            />
                            {/* Görünen sahte input (içi boşken hiçbir string göstermeyecek) */}
                            {filterMonth && (
                                <span className="text-sm font-semibold pointer-events-none text-brand-400 ml-1">
                                    {new Date(filterMonth + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                                </span>
                            )}
                        </div>
                        {filterMonth && (
                            <button onClick={() => setFilterMonth('')} className="ml-3 p-1 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-[var(--text-primary)] transition-colors" title="Filtreyi Temizle relative z-20">
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="w-full sm:w-auto bg-brand-600 hover:bg-brand-500 text-[var(--text-primary)] px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center whitespace-nowrap"
                >
                    <Plus size={18} className="mr-2" />
                    Yeni İşlem Ekle
                </button>
            </div>

            {/* Ödemeler Tablosu (Liste) */}
            <div className="glass-panel rounded-xl overflow-hidden">
                {activePaymentRecords.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <Wallet size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-lg">Henüz bir ödeme/tahsilat kaydı bulunmuyor.</p>
                        <p className="text-sm mt-1">Nakit akışınızı takip etmek için yeni işlem ekleyin.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--border-color)] text-[var(--text-secondary)] text-sm">
                                    <th className="p-4 font-medium">Tarih</th>
                                    <th className="p-4 font-medium">Tür</th>
                                    <th className="p-4 font-medium">Açıklama (Kime/Kimden)</th>
                                    <th className="p-4 font-medium text-right">Tutar</th>
                                    <th className="p-4 font-medium text-center">İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activePaymentRecords.map((record) => (
                                    <tr key={record.id} className="border-b border-[var(--border-color)] hover:bg-white/5 transition-colors group">
                                        <td className="p-4 text-[var(--text-primary)]">
                                            {new Date(record.date).toLocaleDateString('tr-TR')}
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${record.type === 'Tahsilat'
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                                                }`}>
                                                {record.type}
                                            </span>
                                        </td>
                                        <td className="p-4 text-[var(--text-primary)] font-medium">{record.description}</td>
                                        <td className="p-4 text-right font-bold text-[var(--text-primary)]">
                                            ₺{record.amount.toLocaleString('tr-TR')}
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => {
                                                        setEditingPaymentId(record.id);
                                                        setFormData({
                                                            type: record.type || 'Tahsilat',
                                                            date: record.date || new Date().toISOString().split('T')[0],
                                                            description: record.description || '',
                                                            amount: record.amount || '',
                                                            files: record.files || []
                                                        });
                                                        setIsAddModalOpen(true);
                                                    }}
                                                    className="p-1.5 rounded-lg transition-all text-slate-500 hover:text-brand-400 hover:bg-white/5"
                                                    title="Kaydı Düzenle"
                                                >
                                                    <Pencil size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(record.id)}
                                                    className="p-1.5 rounded-lg transition-all text-slate-500 hover:text-red-400 hover:bg-white/5"
                                                    title="Kaydı Sil"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Yeni İşlem Ekleme Modalı */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-[var(--bg-panel)] backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="glass-panel w-full max-w-md p-6 border border-[var(--border-color)] rounded-2xl animate-in zoom-in-95 duration-200">
                        <h2 className="text-xl font-bold mb-4 flex items-center text-[var(--text-primary)]">
                            <Wallet className="mr-2 text-brand-400" />
                            {editingPaymentId ? 'İşlemi Düzenle' : 'Yeni İşlem (Para Giriş/Çıkış)'}
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">İşlem Türü</label>
                                <select
                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all appearance-none"
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                >
                                    <option value="Tahsilat">Tahsilat (Para Girişi)</option>
                                    <option value="Ödeme">Ödeme (Para Çıkışı)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Tarih</label>
                                <input
                                    type="date"
                                    required
                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:outline-none focus:border-brand-500 transition-all"
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Açıklama</label>
                                <input
                                    type="text"
                                    required
                                    placeholder={formData.type === 'Tahsilat' ? "Örn: Çayırhan Nakliye Tahsilatı" : "Örn: Lastikçi Ahmet Usta Ödemesi"}
                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:outline-none focus:border-brand-500 transition-all"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Tutar (₺)</label>
                                <input
                                    type="number"
                                    required
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    className="w-full bg-[var(--bg-panel-hover)] border border-[var(--border-color)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:outline-none focus:border-brand-500 transition-all"
                                    value={formData.amount}
                                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">📎 Makbuz / Belge Ekle</label>
                                <FileUpload files={formData.files} onChange={files => setFormData({ ...formData, files })} />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAddModalOpen(false);
                                        setEditingPaymentId(null);
                                        setFormData({
                                            type: 'Tahsilat',
                                            date: new Date().toISOString().split('T')[0],
                                            description: '',
                                            amount: '',
                                            files: []
                                        });
                                    }}
                                    className="flex-1 py-2.5 rounded-lg font-medium text-[var(--text-primary)] hover:bg-white/5 transition-colors"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-brand-600 hover:bg-brand-500 text-[var(--text-primary)] py-2.5 rounded-lg font-medium shadow-lg shadow-brand-500/25 transition-all"
                                >
                                    Kaydet
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Payments;

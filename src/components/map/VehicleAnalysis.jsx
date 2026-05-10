import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { useCompany } from '../../context/CompanyContext';
import { BarChart3, TrendingUp, Clock, Activity, CalendarDays, Navigation } from 'lucide-react';
import { haversineKm } from '../../utils/mapUtils';

const RANGES = [
  { id: 'today',   label: 'Bugün' },
  { id: 'weekly',  label: '7 Gün' },
  { id: 'monthly', label: '30 Gün' },
  { id: 'custom',  label: 'Özel' },
];

export default function VehicleAnalysis({ deviceMappings, trucks }) {
  const { activeCompanyId } = useCompany();
  const [selectedDevice, setSelectedDevice] = useState('all');
  const [dateRange, setDateRange]           = useState('weekly');
  const [customStart, setCustomStart]       = useState('');
  const [customEnd, setCustomEnd]           = useState('');
  const [loading, setLoading]               = useState(false);
  const [stats, setStats] = useState({ km: 0, duration: 0, maxSpeed: 0, avgSpeed: 0, tripCount: 0 });

  const getDisplayName = (deviceId) => {
    const m = deviceMappings[deviceId];
    if (!m) return deviceId;
    const truck = trucks.find(t => t.id === m.truckId);
    return [m.driverName, truck?.plate].filter(Boolean).join(' - ') || deviceId;
  };

  const devices = Object.keys(deviceMappings);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let startIso = '';
        let endIso   = new Date().toISOString();
        const now    = new Date();

        if (dateRange === 'today') {
          const s = new Date(now); s.setHours(0, 0, 0, 0);
          startIso = s.toISOString();
        } else if (dateRange === 'weekly') {
          const s = new Date(now); s.setDate(s.getDate() - 7);
          startIso = s.toISOString();
        } else if (dateRange === 'monthly') {
          const s = new Date(now); s.setMonth(s.getMonth() - 1);
          startIso = s.toISOString();
        } else if (dateRange === 'custom') {
          if (!customStart || !customEnd) { setLoading(false); return; }
          startIso = new Date(customStart).toISOString();
          const e = new Date(customEnd); e.setHours(23, 59, 59, 999);
          endIso = e.toISOString();
        }

        const q = query(
          collection(db, 'truck_routes'),
          where('timestamp', '>=', startIso),
          where('timestamp', '<=', endIso),
          orderBy('timestamp', 'asc')
        );

        const snapshot = await getDocs(q);
        const allData  = snapshot.docs.map(d => d.data());

        // Şirket izolasyonu (eski kayıtlarda companyId yok → İnaner kabul edilir)
        const companyData = activeCompanyId
          ? allData.filter(d => !d.companyId || d.companyId === activeCompanyId)
          : allData;

        const filteredData = selectedDevice === 'all'
          ? companyData
          : companyData.filter(d => d.driverId === selectedDevice);

        // Hesaplamalar
        let totalKm = 0, topSpeed = 0, speedSum = 0, speedPoints = 0;
        const sessions = [];
        let currentSession = [];

        for (let i = 0; i < filteredData.length; i++) {
          const pt       = filteredData[i];
          const speedKmh = (pt.speed || 0) * 3.6;

          if (speedKmh > topSpeed) topSpeed = speedKmh;
          if (speedKmh > 5) { speedSum += speedKmh; speedPoints++; }

          if (currentSession.length === 0) {
            currentSession.push(pt);
          } else {
            const prev     = currentSession[currentSession.length - 1];
            const timeDiff = new Date(pt.timestamp).getTime() - new Date(prev.timestamp).getTime();
            if (timeDiff > 30 * 60 * 1000) {
              sessions.push(currentSession);
              currentSession = [pt];
            } else {
              totalKm += haversineKm(prev.lat, prev.lon, pt.lat, pt.lon);
              currentSession.push(pt);
            }
          }
        }
        if (currentSession.length > 0) sessions.push(currentSession);

        let totalDurationMin = 0;
        sessions.forEach(s => {
          if (s.length > 1) {
            totalDurationMin += (new Date(s[s.length - 1].timestamp).getTime() - new Date(s[0].timestamp).getTime()) / 60000;
          }
        });

        setStats({
          km:        Math.round(totalKm),
          duration:  Math.round(totalDurationMin / 60),
          maxSpeed:  Math.round(topSpeed),
          avgSpeed:  speedPoints > 0 ? Math.round(speedSum / speedPoints) : 0,
          tripCount: sessions.length,
        });
      } catch (err) {
        console.error('Analiz verisi çekme hatası:', err);
      }
      setLoading(false);
    };

    fetchData();
  }, [dateRange, customStart, customEnd, selectedDevice, activeCompanyId]);

  const statCards = [
    {
      label: 'Toplam Mesafe',
      value: stats.km.toLocaleString('tr-TR'),
      unit: 'km',
      icon: TrendingUp,
      color: 'indigo',
    },
    {
      label: 'Ort. / Max Hız',
      value: stats.avgSpeed,
      unit: 'km/h',
      extra: `Max ${stats.maxSpeed}`,
      extraColor: 'text-rose-400',
      icon: Activity,
      color: 'sky',
    },
    {
      label: 'Sürüş Süresi',
      value: stats.duration,
      unit: 'saat',
      icon: Clock,
      color: 'amber',
    },
    {
      label: 'Gerçekleşen Sefer',
      value: stats.tripCount,
      unit: 'adet',
      icon: Navigation,
      color: 'emerald',
    },
  ];

  const colorMap = {
    indigo:  { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  glow: 'bg-indigo-500/8'  },
    sky:     { bg: 'bg-sky-500/10',     text: 'text-sky-400',     glow: 'bg-sky-500/8'     },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   glow: 'bg-amber-500/8'   },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', glow: 'bg-emerald-500/8' },
  };

  return (
    <div
      data-map-overlay
      className="w-full h-full bg-[#0a0c10]/96 backdrop-blur-xl overflow-y-auto"
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e2130 transparent' }}
    >
      <div className="max-w-4xl mx-auto px-6 pt-24 pb-16 space-y-6">

        {/* Başlık */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
              <BarChart3 size={20} className="text-indigo-400" />
              Araç Analizi
            </h1>
            <p className="text-sm text-slate-600 mt-1">Sürüş verileri ve performans özeti</p>
          </div>

          {/* Filtreler */}
          <div className="flex flex-wrap gap-2">
            {/* Araç seçimi */}
            <div className="relative">
              <select
                value={selectedDevice}
                onChange={e => setSelectedDevice(e.target.value)}
                className="appearance-none bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-2.5 pr-8 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/40 transition-colors cursor-pointer"
                style={{ colorScheme: 'dark' }}
              >
                <option value="all">Tüm Araçlar</option>
                {devices.map(d => (
                  <option key={d} value={d}>{getDisplayName(d)}</option>
                ))}
              </select>
            </div>

            {/* Tarih range'i */}
            <div className="flex bg-white/[0.03] border border-white/[0.06] p-0.5 rounded-2xl">
              {RANGES.map(r => (
                <button
                  key={r.id}
                  onClick={() => setDateRange(r.id)}
                  className={`px-3 py-2 text-xs rounded-xl font-semibold transition-all duration-200 ${
                    dateRange === r.id
                      ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Özel tarih aralığı */}
        {dateRange === 'custom' && (
          <div className="flex gap-3 p-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl">
            {[
              { label: 'Başlangıç', value: customStart, set: setCustomStart },
              { label: 'Bitiş',     value: customEnd,   set: setCustomEnd   },
            ].map(f => (
              <div key={f.label} className="flex-1">
                <label className="text-[10px] text-slate-600 mb-1.5 block font-semibold uppercase tracking-wider">{f.label}</label>
                <input
                  type="date"
                  value={f.value}
                  onChange={e => f.set(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/40 transition-colors"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            ))}
          </div>
        )}

        {/* İstatistik Kartları */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statCards.map(card => {
              const colors = colorMap[card.color];
              const Icon   = card.icon;
              return (
                <div
                  key={card.label}
                  className="bg-white/[0.025] border border-white/[0.05] rounded-3xl p-5 relative overflow-hidden hover:border-white/[0.09] transition-all duration-300 group"
                >
                  {/* Glow */}
                  <div className={`absolute -right-4 -top-4 w-20 h-20 ${colors.glow} rounded-full blur-2xl group-hover:opacity-150 transition-opacity`} />

                  <div className={`w-9 h-9 ${colors.bg} rounded-2xl flex items-center justify-center mb-4`}>
                    <Icon size={17} className={colors.text} />
                  </div>

                  <p className="text-[11px] text-slate-600 font-semibold mb-1">{card.label}</p>
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-2xl font-bold text-white">{card.value}</span>
                    <span className="text-xs text-slate-600">{card.unit}</span>
                    {card.extra && (
                      <span className={`text-xs font-bold ${card.extraColor}`}>{card.extra}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bilgi notu */}
        <div className="flex items-center gap-3 p-4 bg-indigo-500/[0.07] border border-indigo-500/15 rounded-2xl">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
          <p className="text-xs text-indigo-300/70">
            Veriler 30 dakikalık duraksamalara göre otomatik sefer mantığıyla bölünerek hesaplanmıştır.
          </p>
        </div>
      </div>
    </div>
  );
}

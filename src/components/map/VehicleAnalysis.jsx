import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, getDoc, setDoc, doc, limit } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { useCompany } from '../../context/CompanyContext';
import { BarChart3, TrendingUp, Clock, Activity, Navigation, Save, RefreshCw } from 'lucide-react';
import { haversineKm } from '../../utils/mapUtils';
import { useTruck } from '../../context/TruckContext';

const RANGES = [
  { id: 'today',   label: 'Bugün' },
  { id: 'weekly',  label: '7 Gün' },
];

// Günlük snapshot koleksiyonu: vehicle_daily_stats/{companyId}_{deviceId}_{YYYY-MM-DD}
const getSnapshotId = (companyId, deviceId, dateStr) =>
  `${companyId || 'default'}_${deviceId}_${dateStr}`;

const toDateStr = (date) => date.toISOString().slice(0, 10); // "YYYY-MM-DD"

export default function VehicleAnalysis() {
  const { activeCompanyId } = useCompany();
  const { trucks } = useTruck();
  const [deviceMappings, setDeviceMappings] = useState({});
  const [selectedDevice, setSelectedDevice] = useState('all');
  const [dateRange, setDateRange]           = useState('weekly');
  const [customStart, setCustomStart]       = useState('');
  const [customEnd, setCustomEnd]           = useState('');
  const [loading, setLoading]               = useState(false);
  const [stats, setStats] = useState(null); // null = henüz hesaplanmadı
  const [snapshotInfo, setSnapshotInfo] = useState(null); // { fromCache: bool, savedCount: number }

  useEffect(() => {
    const mappingsDocId = `device_mappings_${activeCompanyId || 'default'}`;
    getDoc(doc(db, 'company_data', mappingsDocId)).then(s => {
      if (s.exists()) setDeviceMappings(s.data());
    });
  }, [activeCompanyId]);

  const getDisplayName = (deviceId) => {
    const m = deviceMappings[deviceId];
    if (!m) return deviceId;
    const truck = trucks.find(t => t.id === m.truckId);
    return [m.driverName, truck?.plate].filter(Boolean).join(' - ') || deviceId;
  };

  const devices = Object.keys(deviceMappings);

  // ── Günlük snapshot kaydet ──────────────────────────────────────────────
  const saveSnapshot = async (deviceId, dateStr, dayStats) => {
    try {
      const snapId = getSnapshotId(activeCompanyId, deviceId, dateStr);
      await setDoc(doc(db, 'vehicle_daily_stats', snapId), {
        deviceId,
        date: dateStr,
        companyId: activeCompanyId || 'default',
        ...dayStats,
        calculatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Snapshot kaydedilemedi:', e);
    }
  };

  // ── Tek bir günün verisini ham GPS'ten hesapla ──────────────────────────
  const calcDayStats = async (deviceId, dayStart, dayEnd) => {
    const conditions = [
      where('timestamp', '>=', dayStart.toISOString()),
      where('timestamp', '<=', dayEnd.toISOString()),
      orderBy('timestamp', 'asc'),
      limit(1500),
    ];
    if (deviceId !== 'all') {
      conditions.unshift(where('driverId', '==', deviceId));
    }

    const q = query(collection(db, 'truck_routes'), ...conditions);
    const snap = await getDocs(q);
    let data = snap.docs.map(d => d.data());

    // Şirket izolasyonu
    if (activeCompanyId) {
      data = data.filter(d => !d.companyId || d.companyId === activeCompanyId);
    }
    if (deviceId !== 'all') {
      // deviceId de dene (fallback)
      if (data.length === 0) {
        const q2 = query(
          collection(db, 'truck_routes'),
          where('deviceId', '==', deviceId),
          where('timestamp', '>=', dayStart.toISOString()),
          where('timestamp', '<=', dayEnd.toISOString()),
          orderBy('timestamp', 'asc'),
          limit(1500),
        );
        const snap2 = await getDocs(q2);
        data = snap2.docs.map(d => d.data());
        if (activeCompanyId) {
          data = data.filter(d => !d.companyId || d.companyId === activeCompanyId);
        }
      }
    }

    let totalKm = 0, topSpeed = 0, speedSum = 0, speedPoints = 0;
    const sessions = [];
    let curSession = [];

    for (let i = 0; i < data.length; i++) {
      const pt = data[i];
      const speedKmh = (pt.speed || 0) * 1.852;
      if (speedKmh > topSpeed) topSpeed = speedKmh;
      if (speedKmh > 5) { speedSum += speedKmh; speedPoints++; }

      if (curSession.length === 0) {
        curSession.push(pt);
      } else {
        const prev = curSession[curSession.length - 1];
        const diff = new Date(pt.timestamp).getTime() - new Date(prev.timestamp).getTime();
        if (diff > 30 * 60 * 1000) {
          sessions.push(curSession); curSession = [pt];
        } else {
          totalKm += haversineKm(prev.lat, prev.lon, pt.lat, pt.lon);
          curSession.push(pt);
        }
      }
    }
    if (curSession.length > 0) sessions.push(curSession);

    let totalDurMin = 0;
    sessions.forEach(s => {
      if (s.length > 1)
        totalDurMin += (new Date(s[s.length-1].timestamp).getTime() - new Date(s[0].timestamp).getTime()) / 60000;
    });

    return {
      km: Math.round(totalKm * 10) / 10,
      duration: Math.round(totalDurMin / 60 * 10) / 10,
      maxSpeed: Math.round(topSpeed),
      avgSpeed: speedPoints > 0 ? Math.round(speedSum / speedPoints) : 0,
      tripCount: sessions.length,
      pointCount: data.length,
    };
  };

  // ── Ana Hesaplama ───────────────────────────────────────────────────────
  const handleCalculate = async () => {
    if (dateRange === 'weekly') {
      const confirmProceed = window.confirm("⚠️ DİKKAT: 7 günlük analiz veritabanından yüksek miktarda veri okuyacaktır ve günlük Firebase kotanızı etkileyebilir. Devam etmek istiyor musunuz?");
      if (!confirmProceed) return;
    }
    setLoading(true);
    setSnapshotInfo(null);
    try {
      const now = new Date();
      const todayStr = toDateStr(now);

      // ── Tarih aralığını belirle ──
      let days = []; // [{ dateStr, dayStart, dayEnd }]

      if (dateRange === 'today') {
        const s = new Date(now); s.setHours(0,0,0,0);
        const e = new Date(now); e.setHours(23,59,59,999);
        days = [{ dateStr: todayStr, dayStart: s, dayEnd: e }];

      } else if (dateRange === 'weekly' || dateRange === 'monthly') {
        const count = dateRange === 'weekly' ? 7 : 30;
        for (let i = 0; i < count; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const ds = toDateStr(d);
          const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
          const dayEnd   = new Date(d); dayEnd.setHours(23,59,59,999);
          days.push({ dateStr: ds, dayStart, dayEnd });
        }

      } else if (dateRange === 'custom') {
        if (!customStart || !customEnd) { setLoading(false); return; }
        const s = new Date(customStart);
        const e = new Date(customEnd);
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          const ds = toDateStr(d);
          const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
          const dayEnd   = new Date(d); dayEnd.setHours(23,59,59,999);
          days.push({ dateStr: ds, dayStart, dayEnd });
        }
      }

      // ── Her gün için snapshot kontrol et veya hesapla ──
      let totalKm = 0, totalDur = 0, totalTrips = 0, maxSp = 0, avgSpSum = 0, avgSpCount = 0;
      let fromCacheCount = 0;
      let savedCount = 0;

      for (const { dateStr, dayStart, dayEnd } of days) {
        const isToday = dateStr === todayStr;
        const devKey = selectedDevice === 'all' ? 'all' : selectedDevice;
        const snapId = getSnapshotId(activeCompanyId, devKey, dateStr);

        let dayStats = null;

        // Bugün değilse cache'e bak
        if (!isToday) {
          const cached = await getDoc(doc(db, 'vehicle_daily_stats', snapId));
          if (cached.exists()) {
            dayStats = cached.data();
            fromCacheCount++;
          }
        }

        // Cache yoksa veya bugünse canlı hesapla
        if (!dayStats) {
          dayStats = await calcDayStats(selectedDevice, dayStart, dayEnd);
          // Bugün değilse cache'e kaydet
          if (!isToday && dayStats.km > 0) {
            await saveSnapshot(devKey, dateStr, dayStats);
            savedCount++;
          }
        }

        totalKm    += dayStats.km || 0;
        totalDur   += dayStats.duration || 0;
        totalTrips += dayStats.tripCount || 0;
        if ((dayStats.maxSpeed || 0) > maxSp) maxSp = dayStats.maxSpeed;
        if (dayStats.avgSpeed > 0) { avgSpSum += dayStats.avgSpeed; avgSpCount++; }
      }

      setStats({
        km: Math.round(totalKm),
        duration: Math.round(totalDur),
        maxSpeed: maxSp,
        avgSpeed: avgSpCount > 0 ? Math.round(avgSpSum / avgSpCount) : 0,
        tripCount: totalTrips,
      });
      setSnapshotInfo({ fromCache: fromCacheCount, saved: savedCount, total: days.length });

    } catch (err) {
      console.error('Analiz hatası:', err);
    }
    setLoading(false);
  };

  const statCards = [
    { label: 'Toplam Mesafe',   value: stats?.km?.toLocaleString('tr-TR') ?? '-', unit: 'km',   icon: TrendingUp, color: 'indigo' },
    { label: 'Ort. / Max Hız',  value: stats?.avgSpeed ?? '-',                    unit: 'km/h', icon: Activity,   color: 'sky',
      extra: stats ? `Max ${stats.maxSpeed}` : '', extraColor: 'text-rose-400' },
    { label: 'Sürüş Süresi',    value: stats?.duration ?? '-',                    unit: 'saat', icon: Clock,      color: 'amber' },
    { label: 'Gerçekleşen Sefer',value: stats?.tripCount ?? '-',                  unit: 'adet', icon: Navigation, color: 'emerald' },
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
          <div className="flex flex-wrap gap-2 items-center">
            {/* Araç seçimi */}
            <div className="relative">
              <select
                value={selectedDevice}
                onChange={e => { setSelectedDevice(e.target.value); setStats(null); }}
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
                  onClick={() => { setDateRange(r.id); setStats(null); setSnapshotInfo(null); }}
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

            <button
              onClick={handleCalculate}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-2xl transition-colors shadow-lg shadow-indigo-500/25"
            >
              {loading
                ? <><RefreshCw size={14} className="animate-spin" /> Hesaplanıyor...</>
                : <><BarChart3 size={14} /> Hesapla</>
              }
            </button>
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

        {/* Henüz hesaplanmadı */}
        {!stats && !loading && (
          <div className="flex flex-col items-center justify-center py-16 bg-white/[0.02] border border-white/[0.05] rounded-3xl">
            <BarChart3 size={48} className="text-slate-700 mb-4" />
            <p className="text-slate-400 text-sm font-medium">Analizi görmek için "Hesapla" butonuna tıklayın</p>
            <p className="text-slate-600 text-xs mt-2 text-center max-w-xs">
              Geçmiş günler otomatik olarak önbelleğe alınır — bir sonraki sorguda anında gösterilir.
            </p>
          </div>
        )}

        {/* Yükleniyor */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
            <p className="text-slate-400 text-sm">Veriler hesaplanıyor...</p>
          </div>
        )}

        {/* İstatistik Kartları */}
        {stats && !loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statCards.map(card => {
              const colors = colorMap[card.color];
              const Icon   = card.icon;
              return (
                <div
                  key={card.label}
                  className="bg-white/[0.025] border border-white/[0.05] rounded-3xl p-5 relative overflow-hidden hover:border-white/[0.09] transition-all duration-300 group"
                >
                  <div className={`absolute -right-4 -top-4 w-20 h-20 ${colors.glow} rounded-full blur-2xl`} />
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

        {/* Snapshot bilgi notu */}
        {snapshotInfo && !loading && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-4 bg-indigo-500/[0.07] border border-indigo-500/15 rounded-2xl">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
              <p className="text-xs text-indigo-300/70">
                {snapshotInfo.total} günlük veri analiz edildi.
                {snapshotInfo.fromCache > 0 && ` ${snapshotInfo.fromCache} gün önbellekten okundu (0 ekstra okuma).`}
              </p>
            </div>
            {snapshotInfo.saved > 0 && (
              <div className="flex items-center gap-3 p-4 bg-emerald-500/[0.07] border border-emerald-500/15 rounded-2xl">
                <Save size={12} className="text-emerald-400 flex-shrink-0" />
                <p className="text-xs text-emerald-300/70">
                  {snapshotInfo.saved} günün özeti kaydedildi. Bir sonraki sorguda otomatik önbellekten okunacak.
                </p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

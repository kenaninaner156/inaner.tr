import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy, getDoc, setDoc, doc, limit } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { useCompany } from '../../context/CompanyContext';
import { BarChart3, TrendingUp, Clock, Activity, Navigation, Save, RefreshCw, Calendar, Truck, ShieldCheck } from 'lucide-react';
import { haversineKm } from '../../utils/mapUtils';
import { useTruck } from '../../context/TruckContext';

const RANGES = [
  { id: 'today',   label: 'Bugün' },
  { id: 'weekly',  label: '7 Gün' },
];

const getSnapshotId = (companyId, deviceId, dateStr) =>
  `${companyId || 'default'}_${deviceId}_${dateStr}`;

const toDateStr = (date) => date.toISOString().slice(0, 10); // "YYYY-MM-DD"

export default function VehicleAnalysis({ isEmbedded = false, activeTruckId }) {
  const { activeCompanyId } = useCompany();
  const { trucks } = useTruck();
  const [deviceMappings, setDeviceMappings] = useState({});
  const [selectedDevice, setSelectedDevice] = useState('all');
  const [dateRange, setDateRange]           = useState('today');
  const [customStart, setCustomStart]       = useState('');
  const [customEnd, setCustomEnd]           = useState('');
  const [loading, setLoading]               = useState(false);
  const [stats, setStats]                   = useState(null);
  const [dailyDetails, setDailyDetails]     = useState([]);
  const [snapshotInfo, setSnapshotInfo]     = useState(null);

  useEffect(() => {
    const mappingsDocId = `device_mappings_${activeCompanyId || 'default'}`;
    getDoc(doc(db, 'company_data', mappingsDocId)).then(s => {
      if (s.exists()) {
        const mappings = s.data() || {};
        setDeviceMappings(mappings);
        
        if (activeTruckId) {
          const matchedDevice = Object.keys(mappings).find(d => mappings[d]?.truckId === activeTruckId);
          if (matchedDevice) {
            setSelectedDevice(matchedDevice);
          }
        }
      }
    });
  }, [activeCompanyId, activeTruckId]);

  const getDisplayName = (deviceId) => {
    const m = deviceMappings[deviceId];
    if (!m) return deviceId;
    const truck = (trucks || []).find(t => t.id === m.truckId);
    return [truck?.plate, m.driverName].filter(Boolean).join(' - ') || deviceId;
  };

  const devices = Object.keys(deviceMappings);

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

  const calcDayStats = async (deviceId, dayStart, dayEnd) => {
    let data = [];

    if (deviceId !== 'all') {
      try {
        const dateStr = dayStart.toISOString().slice(0, 10);
        const dailyDocId = `${deviceId}_${dateStr}`;
        const dailySnap = await getDoc(doc(db, 'daily_routes', dailyDocId));
        if (dailySnap.exists() && Array.isArray(dailySnap.data().points) && dailySnap.data().points.length > 0) {
          data = dailySnap.data().points;
          if (activeCompanyId && dailySnap.data().companyId && dailySnap.data().companyId !== activeCompanyId) {
            data = [];
          }
        }
      } catch (err) {
        console.warn('daily_routes analizi hatası:', err);
      }
    }

    if (data.length === 0) {
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
      data = snap.docs.map(d => d.data());

      if (activeCompanyId) {
        data = data.filter(d => !d.companyId || d.companyId === activeCompanyId);
      }
      if (deviceId !== 'all' && data.length === 0) {
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

  const handleCalculate = useCallback(async () => {
    setLoading(true);
    setSnapshotInfo(null);
    try {
      const now = new Date();
      const todayStr = toDateStr(now);

      let days = [];

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

      let totalKm = 0, totalDur = 0, totalTrips = 0, maxSp = 0, avgSpSum = 0, avgSpCount = 0;
      let fromCacheCount = 0;
      let savedCount = 0;
      const dayList = [];

      for (const { dateStr, dayStart, dayEnd } of days) {
        const isToday = dateStr === todayStr;
        const devKey = selectedDevice === 'all' ? 'all' : selectedDevice;
        const snapId = getSnapshotId(activeCompanyId, devKey, dateStr);

        let dayStats = null;

        if (!isToday) {
          const cached = await getDoc(doc(db, 'vehicle_daily_stats', snapId));
          if (cached.exists()) {
            dayStats = cached.data();
            fromCacheCount++;
          }
        }

        if (!dayStats) {
          dayStats = await calcDayStats(selectedDevice, dayStart, dayEnd);
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

        dayList.push({
          date: dateStr,
          ...dayStats
        });
      }

      setStats({
        km: Math.round(totalKm),
        duration: Math.round(totalDur),
        maxSpeed: maxSp,
        avgSpeed: avgSpCount > 0 ? Math.round(avgSpSum / avgSpCount) : 0,
        tripCount: totalTrips,
      });
      setDailyDetails(dayList);
      setSnapshotInfo({ fromCache: fromCacheCount, saved: savedCount, total: days.length });

    } catch (err) {
      console.error('Analiz hatası:', err);
    }
    setLoading(false);
  }, [activeCompanyId, customEnd, customStart, dateRange, selectedDevice]);

  useEffect(() => {
    handleCalculate();
  }, [dateRange, selectedDevice]);

  const statCards = [
    { label: 'Toplam Mesafe',   value: stats?.km?.toLocaleString('tr-TR') ?? '0', unit: 'km',   icon: TrendingUp, color: 'sky' },
    { label: 'Ort. / Max Hız',  value: stats?.avgSpeed ?? '0',                    unit: 'km/s', icon: Activity,   color: 'emerald',
      extra: stats ? `Max ${stats.maxSpeed}` : '', extraColor: 'text-emerald-400' },
    { label: 'Sürüş Süresi',    value: stats?.duration ?? '0',                    unit: 'saat', icon: Clock,      color: 'amber' },
    { label: 'Sefer Sayısı',    value: stats?.tripCount ?? '0',                  unit: 'adet', icon: Navigation, color: 'blue' },
  ];

  const colorMap = {
    sky:     { bg: 'bg-sky-500/10',     text: 'text-sky-400',     border: 'border-sky-500/20' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
    blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20' },
  };

  const content = (
    <div className="space-y-3 sm:space-y-4">
      {/* Filtre & Araç Çubuğu */}
      <div className="bg-[#0d1117] border border-white/[0.08] p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="relative">
            <select
              value={selectedDevice}
              onChange={e => { setSelectedDevice(e.target.value); }}
              className="bg-[#07090e] border border-white/10 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-white focus:outline-none focus:border-slate-500 transition-colors cursor-pointer appearance-none"
              style={{ colorScheme: 'dark' }}
            >
              <option value="all">🚗 Tüm Filo Araçları</option>
              {devices.map(d => (
                <option key={d} value={d}>{getDisplayName(d)}</option>
              ))}
            </select>
          </div>

          <div className="flex bg-[#07090e] border border-white/10 p-0.5 rounded-xl">
            {RANGES.map(r => (
              <button
                key={r.id}
                onClick={() => { setDateRange(r.id); }}
                className={`px-3 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                  dateRange === r.id
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleCalculate}
          disabled={loading}
          className="h-8 px-3.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          {loading
            ? <><RefreshCw size={13} className="animate-spin" /> Hesaplanıyor...</>
            : <><RefreshCw size={13} /> Yenile</>
          }
        </button>
      </div>

      {/* İstatistik Bento Kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {statCards.map(card => {
          const colors = colorMap[card.color];
          const Icon   = card.icon;
          return (
            <div
              key={card.label}
              className="bg-[#07090e] border border-white/[0.08] rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-slate-400">{card.label}</span>
                <div className={`w-7 h-7 ${colors.bg} ${colors.border} border rounded-lg flex items-center justify-center`}>
                  <Icon size={14} className={colors.text} />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight">{card.value}</span>
                  <span className="text-[11px] text-slate-400 font-sans">{card.unit}</span>
                </div>
                {card.extra && (
                  <p className={`text-[10px] font-bold ${card.extraColor} mt-0.5`}>{card.extra}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Günlük Ayrıntı / Geçmiş Tablosu */}
      {dailyDetails.length > 0 && (
        <div className="bg-[#07090e] border border-white/[0.08] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={13} className="text-slate-400" /> Günlük Performans Dökümü
            </h4>
            {snapshotInfo?.fromCache > 0 && (
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                <ShieldCheck size={11} /> {snapshotInfo.fromCache} gün önbellekte
              </span>
            )}
          </div>
          
          <div className="space-y-1.5">
            {dailyDetails.map((day, idx) => (
              <div key={idx} className="flex items-center justify-between bg-white/[0.02] hover:bg-white/[0.04] px-3 py-2 rounded-xl border border-white/[0.05] text-xs transition">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-mono text-[11px]">
                    {new Date(day.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', weekday: 'short' })}
                  </span>
                </div>
                <div className="flex items-center gap-4 font-mono">
                  <span className="text-white font-bold">{day.km || 0} km</span>
                  <span className="text-slate-400 text-[11px]">{day.duration || 0} sa</span>
                  <span className="text-emerald-400 text-[11px]">Max {day.maxSpeed || 0} km/s</span>
                  <span className="text-slate-400 text-[10px]">{day.tripCount || 0} sefer</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (isEmbedded) {
    return content;
  }

  return (
    <div className="w-full h-full p-4 sm:p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-4">
        {content}
      </div>
    </div>
  );
}

import { haversineKm, calcStats, cleanGpsSpikes, filterSessionPoints } from './mapUtils.js';

function normalizeTurkish(str = '') {
  return str
    .toLowerCase()
    .replace(/[-_.,/]/g, ' ')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

/**
 * İnaner Lojistik Resmi Tesis & Şantiye Koordinat Referansları
 */
const KNOWN_DESTINATIONS = [
  { match: ['bastas', 'elmadag'], name: 'Bastaş Elmadağ', lat: 39.945, lon: 33.190, expectedKm: 165 },
  { match: ['ferpa'], name: 'Ferpa Çimento (Hasanoğlan / Lalahan)', lat: 39.965, lon: 33.134, expectedKm: 160 },
  { match: ['limmer', 'sasmaz'], name: 'Limmer Beton (Şaşmaz)', lat: 39.947, lon: 32.742, expectedKm: 115 },
  { match: ['limak'], name: 'Limak Çimento (Ankara)', lat: 39.944, lon: 32.701, expectedKm: 114 },
  { match: ['temelli', 'tepe beton'], name: 'Temelli (Tepe Beton / Başkent OSB)', lat: 39.829, lon: 32.684, expectedKm: 128 },
  { match: ['birlik'], name: 'Birlik Hazır Beton (Şaşmaz)', lat: 39.945, lon: 32.735, expectedKm: 116 },
  { match: ['mamak'], name: 'Mamak (Baştaş)', lat: 39.953, lon: 32.877, expectedKm: 145 },
  { match: ['kale', 'kirikkale'], name: 'Kale Kırıkkale (Baştaş)', lat: 40.594, lon: 33.611, expectedKm: 185 },
  { match: ['uysal', 'sincan'], name: 'S-Uysal Beton (Sincan)', lat: 39.971, lon: 32.573, expectedKm: 130 },
  { match: ['kazan'], name: 'Kazan Beton (Saray Sanayi)', lat: 40.046, lon: 32.620, expectedKm: 107 },
  { match: ['anil', 'beypazari'], name: 'Anıl Beton (Beypazarı)', lat: 40.031, lon: 32.252, expectedKm: 58 },
  { match: ['nallihan'], name: 'Nallıhan Tesis / Maden', lat: 40.192, lon: 31.757, expectedKm: 182 },
  { match: ['dodurga'], name: 'Dodurga (Limmer / Baştaş)', lat: 39.819, lon: 32.404, expectedKm: 135 },
  { match: ['cankaya'], name: 'Çankaya Tesis', lat: 39.860, lon: 32.860, expectedKm: 155 },
  { match: ['kecioren'], name: 'Keçiören Tesis', lat: 39.996, lon: 32.853, expectedKm: 140 },
  { match: ['bestepe'], name: 'Beştepe Tesis', lat: 39.933, lon: 32.868, expectedKm: 130 },
  { match: ['umitkoy'], name: 'Ümitköy Tesis', lat: 39.890, lon: 32.700, expectedKm: 125 },
];

const KNOWN_ORIGINS = [
  { match: ['cayirhan'], name: 'Çayırhan', lat: 40.094, lon: 31.680 },
  { match: ['bastas', 'elmadag'], name: 'Bastaş Elmadağ', lat: 39.945, lon: 33.190 },
  { match: ['kirka'], name: 'Kırka Eti Bor', lat: 39.290, lon: 30.520 },
  { match: ['beypazari'], name: 'Beypazarı Tesis', lat: 40.031, lon: 32.252 },
  { match: ['limak'], name: 'Limak Çimento', lat: 39.944, lon: 32.701 },
  { match: ['ferpa'], name: 'Ferpa Çimento', lat: 39.965, lon: 33.134 },
];

function resolveDestinationCoords(toText, geofences = []) {
  if (!toText) return null;
  const norm = normalizeTurkish(toText);

  if (geofences && geofences.length > 0) {
    const matchedG = geofences.find(g => norm.includes(normalizeTurkish(g.name || '')));
    if (matchedG && matchedG.lat && matchedG.lon) {
      return { name: matchedG.name, lat: matchedG.lat, lon: matchedG.lon, expectedKm: null };
    }
  }

  for (const dest of KNOWN_DESTINATIONS) {
    if (dest.match.some(m => norm.includes(m))) {
      return { name: dest.name, lat: dest.lat, lon: dest.lon, expectedKm: dest.expectedKm };
    }
  }

  return null;
}

function resolveOriginCoords(fromText, geofences = []) {
  if (!fromText) return null;
  const norm = normalizeTurkish(fromText);

  if (geofences && geofences.length > 0) {
    const matchedG = geofences.find(g => norm.includes(normalizeTurkish(g.name || '')));
    if (matchedG && matchedG.lat && matchedG.lon) {
      return { name: matchedG.name, lat: matchedG.lat, lon: matchedG.lon };
    }
  }

  for (const orig of KNOWN_ORIGINS) {
    if (orig.match.some(m => norm.includes(m))) {
      return { name: orig.name, lat: orig.lat, lon: orig.lon };
    }
  }

  return { name: fromText, lat: 40.094, lon: 31.680 };
}

/**
 * Şirketin Gerçek İrsaliye & Sefer Verilerini (trips) Analiz Eder,
 * En çok gidilen ticari hatları frekanslarıyla çıkarır ve GPS oturumlarıyla bağlar.
 */
export function mineCommercialTripCorridors(trips = [], gpsSessions = [], geofences = []) {
  if (!trips || trips.length === 0) return [];

  const corridorMap = new Map();

  // 1. Tüm ticari sefer fişlerini normalize et ve grupla
  for (const trip of trips) {
    if (trip.deleted) continue;
    let from = (trip.from || trip.origin || '').trim();
    let to   = (trip.to || trip.destination || '').trim();

    if (!from || !to || from === '11' || to === '11' || from.startsWith('demo') || to.startsWith('demo') || from.length < 2 || to.length < 2) {
      continue;
    }

    const normTo = normalizeTurkish(to);
    let normalizedTo = to;

    // Fiyat farklılığı veya tire ile girilen Bastaş-Elmadağ ve Bastaş Elmadağ kayıtlarını birleştir
    if (normTo.includes('bastas') && normTo.includes('elmadag')) {
      normalizedTo = 'Bastaş Elmadağ';
    } else if (normTo.includes('ferpa')) {
      normalizedTo = 'Ferpa Çimento';
    } else if (normTo.includes('limmer') && normTo.includes('dodurga')) {
      normalizedTo = 'Dodurga (Limmer)';
    } else if (normTo.includes('limmer') || (normTo.includes('sasmaz') && normTo.includes('limmer'))) {
      normalizedTo = 'Limmer Beton (Şaşmaz)';
    } else if (normTo.includes('limak')) {
      normalizedTo = 'Limak Çimento';
    } else if (normTo.includes('temelli') || normTo.includes('tepe beton')) {
      normalizedTo = 'Temelli (Tepe Beton)';
    } else if (normTo.includes('birlik')) {
      normalizedTo = 'Birlik Hazır Beton (Şaşmaz)';
    } else if (normTo.includes('uysal') || (normTo.includes('sincan') && normTo.includes('beton'))) {
      normalizedTo = 'S-Uysal Beton (Sincan)';
    } else if (normTo.includes('kirikkale') || (normTo.includes('kale') && normTo.includes('bastas'))) {
      normalizedTo = 'Kale Kırıkkale (Baştaş)';
    } else if (normTo.includes('kazan')) {
      normalizedTo = 'Kazan Beton';
    } else if (normTo.includes('anil') || normTo.includes('beypazari')) {
      normalizedTo = 'Anıl Beton (Beypazarı)';
    } else if (normTo.includes('nallihan')) {
      normalizedTo = 'Nallıhan Tesis';
    } else if (normTo.includes('dodurga')) {
      normalizedTo = 'Dodurga (Baştaş)';
    } else if (normTo.includes('mamak')) {
      normalizedTo = 'Mamak (Baştaş)';
    }

    const normFrom = normalizeTurkish(from);
    let normalizedFrom = from;
    if (normFrom.includes('cayirhan')) normalizedFrom = 'Çayırhan';
    else if (normFrom.includes('bastas') && normFrom.includes('elmadag')) normalizedFrom = 'Bastaş Elmadağ';

    const corridorKey = `${normalizedFrom} ➔ ${normalizedTo}`;

    if (!corridorMap.has(corridorKey)) {
      const origCoords = resolveOriginCoords(normalizedFrom, geofences);
      const destCoords = resolveDestinationCoords(normalizedTo, geofences);

      corridorMap.set(corridorKey, {
        id: `commercial_${encodeURIComponent(normalizedFrom)}_${encodeURIComponent(normalizedTo)}`,
        name: corridorKey,
        from: normalizedFrom,
        to: normalizedTo,
        count: 0,
        trips: [],
        totalDeclaredKm: 0,
        startPoint: origCoords ? { lat: origCoords.lat, lon: origCoords.lon } : null,
        endPoint: destCoords ? { lat: destCoords.lat, lon: destCoords.lon } : null,
        expectedKm: destCoords?.expectedKm || null,
        gpsPath: null,
        realKm: null,
        realDurationMin: null,
        realAvgSpeed: null
      });
    }

    const corridor = corridorMap.get(corridorKey);
    corridor.count++;
    const km = parseFloat(trip.km || trip.distance || 0);
    if (km > 0) corridor.totalDeclaredKm += km;

    corridor.trips.push({
      id: trip.id,
      date: trip.date,
      dateFormatted: trip.date ? new Date(trip.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Belirtilmemiş',
      vehicle: trip.plate || trip.vehicleName || 'Tır',
      driver: trip.driverName || 'Şoför',
      km: km || 0
    });
  }

  // 2. GPS Oturumları ile Kusursuz Eşleştirme
  if (gpsSessions && gpsSessions.length > 0) {
    const cleanedSessions = gpsSessions.map(s => cleanGpsSpikes(s)).filter(s => s && s.length > 8);

    for (const corridor of corridorMap.values()) {
      if (!corridor.startPoint || !corridor.endPoint) continue;

      let bestMatch = null;
      let minDistanceScore = 99999;

      for (const session of cleanedSessions) {
        const sStart = session[0];
        const sEnd   = session[session.length - 1];
        if (!sStart || !sEnd) continue;

        const dStart = haversineKm(sStart.lat, sStart.lon, corridor.startPoint.lat, corridor.startPoint.lon);
        const dEnd   = haversineKm(sEnd.lat, sEnd.lon, corridor.endPoint.lat, corridor.endPoint.lon);
        const totalDistScore = dStart + dEnd;

        if (totalDistScore < minDistanceScore && totalDistScore < 14.0) {
          minDistanceScore = totalDistScore;
          bestMatch = session;
        }
      }

      if (bestMatch && bestMatch.length > 5) {
        const stats = calcStats(bestMatch);
        const filtered = filterSessionPoints(bestMatch, 0.08);
        corridor.gpsPath = filtered.map(p => ({ lat: p.lat, lon: p.lon }));
        corridor.startPoint = { lat: filtered[0].lat, lon: filtered[0].lon };
        corridor.endPoint   = { lat: filtered[filtered.length - 1].lat, lon: filtered[filtered.length - 1].lon };
        corridor.realKm = stats.km;
        corridor.realDurationMin = stats.durationMin;
        corridor.realAvgSpeed = stats.avgSpeedKmh;
      }
    }
  }

  // 3. Sıralama ve Sonuç Hazırlığı
  const results = [];
  for (const corridor of corridorMap.values()) {
    const avgDeclaredKm = corridor.count > 0 ? (corridor.totalDeclaredKm / corridor.count).toFixed(0) : 0;
    const displayKm = corridor.realKm || avgDeclaredKm;

    results.push({
      id: corridor.id,
      name: corridor.name,
      from: corridor.from,
      to: corridor.to,
      tripCount: corridor.count,
      km: displayKm,
      durationMin: corridor.realDurationMin || (displayKm ? Math.round((displayKm / 50) * 60) : null),
      avgSpeedKmh: corridor.realAvgSpeed || 50,
      startPoint: corridor.startPoint || { lat: 40.094, lon: 31.680 },
      endPoint: corridor.endPoint || { lat: 39.945, lon: 33.190 },
      path: corridor.gpsPath || (corridor.startPoint && corridor.endPoint ? [corridor.startPoint, corridor.endPoint] : []),
      individualTrips: corridor.trips
    });
  }

  results.sort((a, b) => b.tripCount - a.tripCount);
  return results;
}

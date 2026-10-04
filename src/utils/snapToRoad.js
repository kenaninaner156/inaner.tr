// src/utils/snapToRoad.js
/**
 * OSRM Driving Route Tabanlı Gerçek Karayolu Eşleme (Snap-to-Roads) Servisi
 *
 * GPS sapmalarını (10-20m şerit dışı kaymalar, araziye taşmalar) tamamen sıfırlar;
 * tırın rotasını ve konumunu tam olarak karayolu şeridine ve viraj kavislerine oturtur.
 */

const snapCache = new Map(); // hash -> { segments, allPositions, snappedLastPoint }
const pendingRequests = new Map();
const nearestCache = new Map(); // coordKey -> [lat, lon]

/**
 * Tek bir koordinatı en yakın karayolu şeridine oturtur (OSRM Nearest)
 */
export async function snapPointToRoad(lat, lon) {
  if (isNaN(lat) || isNaN(lon)) return [lat, lon];
  const key = `${lat.toFixed(5)}_${lon.toFixed(5)}`;
  if (nearestCache.has(key)) return nearestCache.get(key);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const url = `https://router.project-osrm.org/nearest/v1/driving/${lon.toFixed(6)},${lat.toFixed(6)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return [lat, lon];
    const data = await res.json();
    if (data.code === 'Ok' && data.waypoints && data.waypoints[0] && data.waypoints[0].location) {
      const snapped = [data.waypoints[0].location[1], data.waypoints[0].location[0]];
      // Eğer yol 75 metreden yakınsa yola oturt
      if (data.waypoints[0].distance <= 75) {
        nearestCache.set(key, snapped);
        if (nearestCache.size > 200) {
          nearestCache.delete(nearestCache.keys().next().value);
        }
        return snapped;
      }
    }
  } catch (_) {
    clearTimeout(timeoutId);
  }
  return [lat, lon];
}

// Traccar GPS hız verisi knot cinsindedir: 1 knot = 1.852 km/h
export function getSpeedColor(speedKnots) {
  const kmh = (speedKnots || 0) * 1.852;
  if (kmh < 5)  return '#ef4444';
  if (kmh < 30) return '#f97316';
  if (kmh < 70) return '#6366f1';
  if (kmh < 90) return '#38bdf8';
  return '#22c55e';
}

function getCoordsHash(points) {
  if (!points || points.length === 0) return '';
  const first = points[0];
  const mid = points[Math.floor(points.length / 2)];
  const last = points[points.length - 1];
  return `${points.length}_${first.lat?.toFixed(5)}_${first.lon?.toFixed(5)}_${mid?.lat?.toFixed(5)}_${last?.lat?.toFixed(5)}_${last?.lon?.toFixed(5)}`;
}

/**
 * Tek bir koordinat bloğunu (maksimum 60 nokta) OSRM Route API ile yola oturtur
 * Her bacak (leg) için araç hız rengini koruyarak segmentlere ayırır.
 */
async function snapChunk(points) {
  if (!points || points.length < 2) {
    const raw = points.map(p => [Number(p.lat), Number(p.lon)]);
    return {
      allPositions: raw,
      segments: raw.length >= 2 ? [{ color: getSpeedColor(points[0]?.speed), positions: raw }] : []
    };
  }

  const coordStr = points.map(p => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=true`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 sn zaman aşımı

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error('OSRM non-200');

    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes[0] && Array.isArray(data.routes[0].legs)) {
      const allPositions = [];
      const segments = [];

      data.routes[0].legs.forEach((leg, legIdx) => {
        const rawPt = points[legIdx];
        const color = getSpeedColor(rawPt ? rawPt.speed : 0);
        const legCoords = [];

        if (Array.isArray(leg.steps)) {
          leg.steps.forEach(st => {
            if (st.geometry && Array.isArray(st.geometry.coordinates)) {
              st.geometry.coordinates.forEach(([lon, lat]) => {
                legCoords.push([lat, lon]);
              });
            }
          });
        }

        if (legCoords.length > 0) {
          allPositions.push(...legCoords);

          const lastSeg = segments[segments.length - 1];
          if (lastSeg && lastSeg.color === color) {
            lastSeg.positions.push(...legCoords);
          } else {
            segments.push({ color, positions: legCoords });
          }
        }
      });

      if (allPositions.length >= 2) {
        return { allPositions, segments };
      }
    }
  } catch (_) {
    clearTimeout(timeoutId);
  }

  // Hata durumunda ham GPS noktalarına dön
  const fallbackCoords = points.map(p => [Number(p.lat), Number(p.lon)]);
  const fallbackSegments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const color = getSpeedColor(points[i].speed);
    const lastSeg = fallbackSegments[fallbackSegments.length - 1];
    if (lastSeg && lastSeg.color === color) {
      lastSeg.positions.push([Number(points[i + 1].lat), Number(points[i + 1].lon)]);
    } else {
      fallbackSegments.push({
        color,
        positions: [
          [Number(points[i].lat), Number(points[i].lon)],
          [Number(points[i + 1].lat), Number(points[i + 1].lon)]
        ]
      });
    }
  }

  return { allPositions: fallbackCoords, segments: fallbackSegments };
}

/**
 * Rota noktalarını yola hizalar ve hız segmentlerine ayırır.
 *
 * @param {Array<{lat: number, lon: number, speed?: number}>} points
 * @returns {Promise<{
 *   allPositions: Array<[number, number]>,
 *   segments: Array<{color: string, positions: Array<[number, number]>}>,
 *   snappedLastPoint: [number, number] | null
 * }>}
 */
export async function snapRouteToRoads(points) {
  if (!points || points.length < 2) {
    const raw = (points || []).map(p => [Number(p.lat), Number(p.lon)]);
    return { allPositions: raw, segments: [], snappedLastPoint: raw[0] || null };
  }

  // Geçerli koordinatları filtrele ve mükerrerleri ayıkla
  const valid = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

    if (valid.length > 0) {
      const prev = valid[valid.length - 1];
      if (Math.abs(prev.lat - lat) < 0.00003 && Math.abs(prev.lon - lon) < 0.00003) {
        continue;
      }
    }
    valid.push({ ...p, lat, lon });
  }

  if (valid.length < 2) {
    const raw = valid.map(p => [p.lat, p.lon]);
    return { allPositions: raw, segments: [], snappedLastPoint: raw[0] || null };
  }

  const cacheKey = getCoordsHash(valid);
  if (snapCache.has(cacheKey)) {
    return snapCache.get(cacheKey);
  }

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const CHUNK_SIZE = 55;
      const allPositions = [];
      const segments = [];

      for (let i = 0; i < valid.length; i += (CHUNK_SIZE - 1)) {
        const chunk = valid.slice(i, i + CHUNK_SIZE);
        if (chunk.length < 2) break;

        const result = await snapChunk(chunk);

        if (allPositions.length === 0) {
          allPositions.push(...result.allPositions);
        } else {
          allPositions.push(...result.allPositions.slice(1));
        }

        result.segments.forEach(seg => {
          const lastSeg = segments[segments.length - 1];
          if (lastSeg && lastSeg.color === seg.color) {
            lastSeg.positions.push(...seg.positions);
          } else {
            segments.push(seg);
          }
        });

        if (i + CHUNK_SIZE >= valid.length) break;
      }

      const snappedLastPoint = allPositions.length > 0 ? allPositions[allPositions.length - 1] : null;

      const output = {
        allPositions,
        segments,
        snappedLastPoint
      };

      if (snapCache.size > 150) {
        const firstKey = snapCache.keys().next().value;
        snapCache.delete(firstKey);
      }

      snapCache.set(cacheKey, output);
      return output;
    } catch (_) {
      const raw = valid.map(p => [p.lat, p.lon]);
      return { allPositions: raw, segments: [], snappedLastPoint: raw[raw.length - 1] || null };
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, promise);
  return promise;
}

// src/utils/roadRoutingUtils.js

const memoryCache = new Map();

export async function fetchRoadGeometry(startPoint, endPoint) {
  if (!startPoint || !endPoint) return null;

  const startLat = (startPoint.lat != null ? Number(startPoint.lat) : Number(startPoint[0])).toFixed(4);
  const startLon = (startPoint.lon != null ? Number(startPoint.lon) : Number(startPoint[1])).toFixed(4);
  const endLat   = (endPoint.lat != null ? Number(endPoint.lat) : Number(endPoint[0])).toFixed(4);
  const endLon   = (endPoint.lon != null ? Number(endPoint.lon) : Number(endPoint[1])).toFixed(4);

  if (isNaN(startLat) || isNaN(startLon) || isNaN(endLat) || isNaN(endLon)) return null;

  const cacheKey = `road_geo_${startLat}_${startLon}_${endLat}_${endLon}`;

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.coordinates) && parsed.coordinates.length > 5) {
        memoryCache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch (e) {}

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        const distanceKm = Math.round((route.distance || 0) / 1000);
        const durationMin = Math.round((route.duration || 0) / 60);

        const result = {
          coordinates,
          distanceKm,
          durationMin
        };

        memoryCache.set(cacheKey, result);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(result));
        } catch (err) {}

        return result;
      }
    }
  } catch (err) {
    console.warn('[RoadRouting] OSRM rota servisi uyarısı:', err.message);
  }

  return null;
}

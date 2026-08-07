// EPSG:3857 (Web Mercator) helpers for the timelapse crop box.
// GIBS WMS GetMap expects BBOX in EPSG:3857 meters (x = easting, y = northing).

const R = 6378137
const HALF_CIRCUMFERENCE = Math.PI * R // 20037508.342789244

// [lng, lat] → [x, y] meters (EPSG:3857)
export const lngLatToMercator = ([lng, lat]) => {
  const x = (lng / 180) * HALF_CIRCUMFERENCE
  const rad = (lat * Math.PI) / 180
  const y = R * Math.log(Math.tan(Math.PI / 4 + rad / 2))
  return [x, y]
}

// [x, y] meters → [lng, lat]
export const mercatorToLngLat = ([x, y]) => {
  const lng = (x / HALF_CIRCUMFERENCE) * 180
  const rad = 2 * Math.atan(Math.exp(y / R)) - Math.PI / 2
  const lat = (rad * 180) / Math.PI
  return [lng, lat]
}

// Crop rectangle [[swLng, swLat], [neLng, neLat]] → [minX, minY, maxX, maxY] in EPSG:3857.
export const rectToBbox3857 = ([[swLng, swLat], [neLng, neLat]]) => {
  const [swX, swY] = lngLatToMercator([swLng, swLat])
  const [neX, neY] = lngLatToMercator([neLng, neLat])
  const minX = Math.min(swX, neX)
  const minY = Math.min(swY, neY)
  const maxX = Math.max(swX, neX)
  const maxY = Math.max(swY, neY)
  return [minX, minY, maxX, maxY]
}

// Builds the raster tile URL template for a GIBS layer.
// Most layers use the WMTS REST endpoint. Vector products (orbit tracks,
// thermal anomalies/fires, settlements) are only published as Mapbox vector
// tiles on WMTS, so for those (flagged with `wms: true` in layers.json) we use
// the WMS endpoint, which rasterises them server-side. MapLibre substitutes
// the {bbox-epsg-3857} token per tile.
export const buildTileUrlTemplate = (config, layer, time) => {
  // Flood-extent products are sparse/event-driven and regularly return WMTS 404
  // tiles even when the layer/time is valid. WMS returns a stable raster tile
  // (transparent when empty), avoiding console error floods.
  const floodExtentViaWms = /^(VIIRS|MODIS)_Combined_Flood_[123]-Day$/.test(layer.id)

  // Custom raster tile template (e.g. OpenStreetMap) — returned verbatim.
  if (layer.tiles) return layer.tiles
  if (layer.wms || floodExtentViaWms) {
    return `${config.wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer.id}&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=TRUE&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}&TIME=${time}`
  }
  const ext = layer.format?.split('/')[1] === 'jpeg' ? 'jpg' : layer.format?.split('/')[1] || 'png'
  return `${config.wmtsBaseUrl}/${layer.id}/default/${time}/${layer.tileMatrixSet}/{z}/{y}/{x}.${ext}`
}

// Builds a single-image WMS GetMap URL for a layer over a bbox in EPSG:3857
// meters. Used by the timelapse preview browser (low-res thumbs) and the GIF
// exporter (full-res frames). `time` may be a plain date (YYYY-MM-DD) or a
// full ISO datetime for sub-daily layers.
export const buildWmsUrl = (config, layer, bbox3857, width, height, time) => {
  const [minX, minY, maxX, maxY] = bbox3857
  return `${config.wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer.id}&STYLES=&FORMAT=image%2Fjpeg&TRANSPARENT=TRUE&CRS=EPSG:3857&WIDTH=${Math.round(width)}&HEIGHT=${Math.round(height)}&BBOX=${minX},${minY},${maxX},${maxY}&TIME=${time}`
}

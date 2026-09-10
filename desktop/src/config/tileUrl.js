// Builds the raster tile URL template for a GIBS layer.
// Most layers use the WMTS REST endpoint. Vector products (orbit tracks,
// thermal anomalies/fires, settlements) are only published as Mapbox vector
// tiles on WMTS, so for those (flagged with `wms: true` in layers.json) we use
// the WMS endpoint, which rasterises them server-side. MapLibre substitutes
// the {bbox-epsg-3857} token per tile.
export const buildTileUrlTemplate = (config, layer, time) => {
  // Dated imagery layers are served via WMS instead of WMTS. GIBS builds the
  // WMTS tile pyramid top-down, so a partially-processed day (or a sparse
  // product) can 404 on fine tiles while the data itself exists — the map then
  // shows a black void until you zoom to a level whose tiles exist. WMS
  // rasterises server-side at any zoom, so the nearest available imagery
  // always loads. (Flood-extent products were already routed this way for the
  // same reason.)
  const viaWms = layer.section === 'imagery' || layer.wms ||
    /^(VIIRS|MODIS)_Combined_Flood_[123]-Day$/.test(layer.id)

  // Custom raster tile template (e.g. OpenStreetMap) — returned verbatim.
  if (layer.tiles) return layer.tiles
  if (viaWms) {
    const fmt = encodeURIComponent(layer.format || 'image/png')
    return `${config.wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer.id}&STYLES=&FORMAT=${fmt}&TRANSPARENT=TRUE&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}&TIME=${time}`
  }
  const ext = layer.format?.split('/')[1] === 'jpeg' ? 'jpg' : layer.format?.split('/')[1] || 'png'
  return `${config.wmtsBaseUrl}/${layer.id}/default/${time}/${layer.tileMatrixSet}/{z}/{y}/{x}.${ext}`
}

// Builds a single-image WMS GetMap URL for a layer over a bbox in EPSG:3857
// meters. Used by the timelapse preview browser (low-res thumbs) and the GIF
// exporter (full-res frames). `time` may be a plain date (YYYY-MM-DD) or a
// full ISO datetime for sub-daily layers.
// `format` defaults to JPEG (light, opaque imagery). Pass 'image/png' for
// transparent overlays (reference/base) so their alpha survives compositing —
// a JPEG overlay would come back opaque and paint over the layers beneath it.
export const buildWmsUrl = (config, layer, bbox3857, width, height, time, format = 'image/jpeg') => {
  const [minX, minY, maxX, maxY] = bbox3857
  const fmt = encodeURIComponent(format)
  return `${config.wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer.id}&STYLES=&FORMAT=${fmt}&TRANSPARENT=TRUE&CRS=EPSG:3857&WIDTH=${Math.round(width)}&HEIGHT=${Math.round(height)}&BBOX=${minX},${minY},${maxX},${maxY}&TIME=${time}`
}

// Single-image WMS GetMap URL that stacks several layers in one request.
// `layers` is the same ordered array consumed by renderTimelapseGif (entries
// {layer, role}, first = bottom); `time` is the WMS TIME applied to ALL
// layers (the frame date — reference overlays are drawn separately with
// 'default'). Used by the timelapse GIF exporter to composite all dated
// layers server-side: GIBS handles layer transparency correctly, whereas
// fetching each layer separately and compositing client-side fails because
// GIBS returns OPAQUE PNGs for full-coverage products (an upper layer would
// paint over everything below it, leaving only the top layer visible).
// NOTE: a per-layer TIME list (comma-separated) is NOT supported — GIBS
// answers 400 Bad Request.
export const buildWmsUrlMulti = (config, layers, bbox3857, width, height, time) => {
  const [minX, minY, maxX, maxY] = bbox3857
  const ids = layers.map(l => (l.layer || l).id).join(',')
  return `${config.wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${ids}` +
    `&STYLES=&FORMAT=image%2Fjpeg&TRANSPARENT=TRUE&CRS=EPSG:3857` +
    `&WIDTH=${Math.round(width)}&HEIGHT=${Math.round(height)}&BBOX=${minX},${minY},${maxX},${maxY}&TIME=${time}`
}

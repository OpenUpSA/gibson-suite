// Builds the raster tile URL template for a GIBS layer.
// Most layers use the WMTS REST endpoint. Vector products (orbit tracks,
// thermal anomalies/fires, settlements) are only published as Mapbox vector
// tiles on WMTS, so for those (flagged with `wms: true` in layers.json) we use
// the WMS endpoint, which rasterises them server-side. MapLibre substitutes
// the {bbox-epsg-3857} token per tile.
export const buildTileUrlTemplate = (config, layer, time) => {
  if (layer.wms) {
    return `${config.wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer.id}&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=TRUE&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}&TIME=${time}`
  }
  const ext = layer.format?.split('/')[1] === 'jpeg' ? 'jpg' : layer.format?.split('/')[1] || 'png'
  return `${config.wmtsBaseUrl}/${layer.id}/default/${time}/${layer.tileMatrixSet}/{z}/{y}/{x}.${ext}`
}

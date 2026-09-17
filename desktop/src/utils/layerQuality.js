// Layer resolution / download-quality model, shared by the map (MapInstance),
// the layers sidebar and the Add Layer modal.
//
// "Quality" is NOT a re-render of the imagery — it is the deepest zoom level
// whose tiles we ask GIBS for. A raster source's `maxzoom` caps that; past it
// MapLibre upscales the deepest tile it has (overzoom), so a lower preset
// means fewer, coarser tiles — quicker to arrive, blurrier when zoomed in.
//
// Two things limit how far a preset can go:
//   1. The layer's native pyramid level (`GoogleMapsCompatible_LevelN` in its
//      WMTS tile matrix set). Asking for deeper tiles than the product has is
//      pure waste — GIBS would just upscale server-side.
//   2. The delivery route. Direct tile templates (OpenStreetMap) and WMS
//      rasterised layers (fires, etc.) have no adjustable level at all.

import { WMS_TILE_SIZE, usesWms } from '../config/tileUrl'

export const QUALITY_ORDER = ['low', 'medium', 'high']

// Preset → deepest canonical (tile) zoom level to request, expressed for a
// 256px WMTS tile grid. These are absolute tile-zoom caps, not map zooms: with
// 256px source tiles MapLibre requests tiles one level deeper than the map
// zoom, and a 512px WMS tile sits one level shallower again (see below).
export const QUALITY_MAXZOOM = {
  high: 9, // Level9 — native resolution for most GIBS true-colour imagery
  medium: 8,
  low: 7
}

// ── Map ↔ tile zoom relationship ──────────────────────────────────────
// MapLibre's own tile grid is 512px, so a source whose tiles are `tileSize`
// pixels sits at a shifted canonical level: 256px tiles are requested one
// level DEEPER than the map zoom, 512px tiles at the map zoom itself. A
// source's `maxzoom` caps exactly this value, which is what lets us tell
// "this zoom would ask for deeper tiles" apart from "both presets fetch
// identical tiles, so there is nothing to refine".
export const RASTER_TILE_SIZE = 256

const tileSizeShift = (tileSize) => Math.round(Math.log2(tileSize / RASTER_TILE_SIZE))

export const tileZoomFor = (mapZoom, tileSize = RASTER_TILE_SIZE) =>
  Math.max(0, Math.floor(mapZoom + Math.log2(512 / tileSize)))

// Would the view at `mapZoom` ask for tiles deeper than `maxzoom` — i.e. is
// the source's cap actually costing detail right now?
export const zoomBeyondTileCap = (mapZoom, maxzoom, tileSize = RASTER_TILE_SIZE) =>
  maxzoom != null && tileZoomFor(mapZoom, tileSize) > maxzoom

// Deepest level a layer's own pyramid contains, parsed from its tile matrix
// set (e.g. 'GoogleMapsCompatible_Level9' → 9). Null when the layer has no
// GIBS pyramid (custom tile template) or nothing to parse. Always reported in
// GIBS's own 256px-tile vocabulary, which is what the UI shows.
export const nativeLevel = (layer) => {
  const match = /Level(\d+)/.exec(layer?.tileMatrixSet || '')
  return match ? Number(match[1]) : null
}

// True when the layer's tiles come from a direct template (OpenStreetMap) —
// no GIBS pyramid, so the presets do not apply.
const isCustomTiles = (layer) => Boolean(layer?.tiles)

// True when GIBS rasterises the layer server-side on demand (WMS). Those
// products have no tile pyramid: every zoom is rendered from the source data.
const isServerRendered = (layer) => Boolean(layer?.wms)

// Pixel size of the tiles a layer's map source uses. All imagery is served
// through WMS, which renders on demand at whatever size we ask for, so it is
// fetched as 512px tiles: a quarter of the requests for exactly the same
// picture. That matters because GIBS marks every tile response
// `cache-control: no-store` — there is no HTTP cache to fall back on, so each
// avoided request is a full CDN round trip we don't pay.
export const tileSizeFor = (layer) => (usesWms(layer) ? WMS_TILE_SIZE : RASTER_TILE_SIZE)

// Deepest tile zoom to request for a layer at a given quality preset.
// Custom template layers are served at full zoom. Server-rendered layers are
// uncapped (12 is just the deepest useful level for the products sold this
// way — beyond it the source data runs out anyway). Everything else is capped
// by BOTH the preset and the layer's native pyramid, then converted into the
// layer's own tile grid.
export const maxzoomFor = (layer, quality = 'low') => {
  if (isCustomTiles(layer)) return 19
  const shift = tileSizeShift(tileSizeFor(layer))
  if (isServerRendered(layer)) return Math.max(0, 12 - shift)
  const preset = QUALITY_MAXZOOM[quality] ?? QUALITY_MAXZOOM.low
  const native = nativeLevel(layer)
  const cap = native ? Math.min(preset, native) : preset
  return Math.max(0, cap - shift)
}

// Could asking for more detail ever fetch deeper tiles for this layer? Used to
// skip pointless fast→sharp upgrades and to explain the UI.
export const canUpgrade = (layer) => {
  if (isCustomTiles(layer) || isServerRendered(layer)) return false
  const native = nativeLevel(layer)
  if (!native) return true
  return native > QUALITY_MAXZOOM.low
}

// Preset-aware check: would switching from one preset to another actually ask
// for deeper tiles for this layer?
export const qualityGains = (layer, from, to) => maxzoomFor(layer, to) > maxzoomFor(layer, from)

// Describes how (or whether) quality presets apply to a layer — drives the
// Sidebar hint and the Add Layer modal's "Image quality" block.
//   mode: 'presets' — Low/Medium/High work, capped by the layer's native level
//         'fixed'   — quality cannot be changed
export const qualitySupport = (layer) => {
  const native = nativeLevel(layer)

  if (isCustomTiles(layer)) {
    return {
      mode: 'fixed',
      nativeLevel: null,
      reason: 'direct',
      label: 'Fixed — direct tile service',
      detail: 'These tiles come straight from the provider at one fixed resolution, so there are no resolution presets to choose from.',
    }
  }

  if (isServerRendered(layer)) {
    return {
      mode: 'fixed',
      nativeLevel: null,
      reason: 'wms',
      label: 'Fixed — rendered on demand',
      detail: 'This product is drawn from its source data at whatever zoom you view it, so a resolution preset would have nothing to change.',
    }
  }

  const belowHigh = native !== null && native < QUALITY_MAXZOOM.high

  return {
    mode: 'presets',
    nativeLevel: native,
    reason: 'presets',
    label: native !== null
      ? `Low · Medium · High (up to Level ${native})`
      : 'Low · Medium · High',
    detail: belowHigh
      ? `Tiles exist up to zoom level ${native}, so Medium and High show the same detail — beyond it the imagery is only stretched. Low is the lightest download.`
      : native !== null
        ? `Tiles exist up to zoom level ${native}, which is what High fetches. Lower presets pull fewer, coarser tiles and appear sooner.`
        : 'Low and Medium pull fewer, coarser tiles and appear sooner; High is the full-resolution view.',
  }
}

// Quality to actually request for a layer given the user's per-layer settings.
// Imagery honours the choice; base and reference layers are static (their
// tiles never change with the date, so they are fetched once and cached) and
// render at full detail instead of the low default — at a low cap coastlines
// and the graticule go visibly soft as soon as you zoom in.
export const effectiveQuality = (layer, settings, section) => {
  const chosen = settings?.quality || 'low'
  return section === 'imagery' ? chosen : 'high'
}

// Coarsest pass worth loading first for a layer.
//
// Asking for a deep cap does NOT make the initial load slower — at low map
// zooms every preset fetches the very same tiles, because a cap only bites
// once the view wants tiles deeper than it. So a fast pass only helps when the
// view is already deep enough to be capped: there the coarse pass pulls a
// quarter of the tiles and paints immediately, and the sharp pass then fills
// in behind it. Everywhere else we go straight to the wanted cap, so a
// refinement pass never re-downloads tiles we already hold.
export const planStartMaxzoom = (layer, wantedMaxzoom, mapZoom) => {
  const lowMaxzoom = maxzoomFor(layer, 'low')
  if (lowMaxzoom >= wantedMaxzoom) return wantedMaxzoom // no coarser step exists
  return zoomBeyondTileCap(mapZoom, lowMaxzoom, tileSizeFor(layer)) ? lowMaxzoom : wantedMaxzoom
}

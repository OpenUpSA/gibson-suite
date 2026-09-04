import GIF from 'gif.js'
import gifWorkerSource from 'gif.js/dist/gif.worker.js?raw'
import { buildWmsUrl } from '../config/tileUrl'

// gif.js runs the encoder in a web worker; the worker script is bundled as raw
// text and served from a Blob URL (same pattern as the legacy app).
const gifWorkerUrl = URL.createObjectURL(
  new Blob([gifWorkerSource], { type: 'application/javascript' })
)

// Max export width — keeps GIF sizes / encode times reasonable.
export const GIF_MAX_WIDTH = 1280

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })

const resolveTemplate = (text, date, layerName) =>
  text.replace(/%date%/g, date).replace(/%layer%/g, layerName)

// Draws a caption block (same look as the grid-view captions) onto the frame.
const drawCaption = (ctx, caption, date, layerName, width, height) => {
  if (!caption?.visible || !caption?.text) return
  const lines = resolveTemplate(caption.text, date, layerName).split('\n')
  const fontSize = caption.fontSize || 11
  const pad = Math.round(fontSize * 0.66)
  const lineHeight = Math.round(fontSize * 1.3)
  ctx.font = `${fontSize}px monospace`
  const blockW = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2
  const blockH = lines.length * lineHeight + pad * 2

  let bx, by
  switch (caption.position) {
    case 'top-right': bx = width - blockW - pad; by = pad; break
    case 'top-left': bx = pad; by = pad; break
    case 'bottom-right': bx = width - blockW - pad; by = height - blockH - pad; break
    default: bx = pad; by = height - blockH - pad; break
  }

  ctx.fillStyle = caption.overlayColor || '#000000'
  ctx.globalAlpha = caption.overlayOpacity ?? 0.55
  ctx.fillRect(bx, by, blockW, blockH)
  ctx.globalAlpha = 1
  ctx.fillStyle = caption.textColor || '#ffffff'
  lines.forEach((line, i) => {
    ctx.fillText(line, bx + pad, by + pad + (i + 1) * lineHeight)
  })
}

// Simple date stamp drawn bottom-left (fallback when a frame has no caption).
const drawDateStamp = (ctx, text, width, height) => {
  const pad = 6
  const fontSize = 13
  ctx.font = `${fontSize}px monospace`
  const textW = ctx.measureText(text).width + pad * 2
  const textH = fontSize + pad * 2
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, height - textH, textW, textH)
  ctx.fillStyle = '#fff'
  ctx.fillText(text, pad, height - textH + pad + fontSize)
}

/**
 * Renders a timelapse GIF from GIBS WMS images.
 *
 * @param {Object} opts
 * @param {Array<{time: string, label?: string, caption?: Object, delayMs?: number}>} opts.frames — one per GIF frame; caption (visible/text/position/overlayColor/overlayOpacity/textColor/fontSize) overrides the date stamp, delayMs overrides the default delay
 * @param {Array<{layer: Object, role?: string}>} opts.layers — every active layer, pre-ordered bottom→top (base first, imagery above, reference on top — matching the map's stacking). `layer` is the layers.json object, `role` is 'imagery'|'base'|'reference'. TIME is resolved per frame: imagery/base use the frame date, reference uses GIBS 'default'.
 * @param {Array<number>} opts.bbox3857 — [minX, minY, maxX, maxY] EPSG:3857
 * @param {number} opts.width — target GIF width (≤ GIF_MAX_WIDTH)
 * @param {number} opts.height — target GIF height
 * @param {number} opts.delayMs — per-frame delay in milliseconds
 * @param {string} opts.wmsBaseUrl — GIBS WMS endpoint
 * @param {boolean} [opts.stampDates] — draw the date label on each frame
 * @param {(done: number, total: number) => void} [opts.onProgress]
 * @returns {Promise<Blob>} the finished GIF
 */
export const renderTimelapseGif = ({
  frames,
  layers,
  bbox3857,
  width,
  height,
  delayMs,
  wmsBaseUrl,
  stampDates = true,
  onProgress,
}) =>
  new Promise((resolve, reject) => {
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width,
      height,
      workerScript: gifWorkerUrl,
    })

    let done = 0
    const total = frames.length

    const drawNext = async (index) => {
      if (index >= total) {
        gif.on('finished', resolve)
        gif.on('abort', () => reject(new Error('GIF render aborted')))
        gif.render()
        return
      }

      const frame = frames[index]
      try {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })

        // Black background — WMS transparent areas would otherwise be garbage.
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, width, height)

        // Composite every active layer for this frame, in stacking order.
        // `layers` is pre-ordered so the bottom layer draws first. TIME is
        // resolved per frame: imagery/base use the frame date, reference
        // overlays use the GIBS 'default' (static) time.
        // Only the bottom-most layer is opaque JPEG; every layer above it is
        // PNG so its transparency composites over the layers beneath. A JPEG
        // overlay is opaque and would paint over (erase) everything below it —
        // with multiple imagery layers that left only the top layer visible.
        for (let i = 0; i < layers.length; i++) {
          const l = layers[i]
          try {
            const time = l.role === 'reference' ? 'default' : frame.time
            const fmt = i === 0 ? 'image/jpeg' : 'image/png'
            const url = buildWmsUrl({ wmsBaseUrl }, l.layer, bbox3857, width, height, time, fmt)
            const img = await loadImage(url)
            ctx.drawImage(img, 0, 0, width, height)
          } catch (e) {
            // A single failed layer shouldn't abort the whole GIF — skip it.
            console.warn(`[Timelapse] layer ${l.layer?.id} failed for ${frame.time}:`, e)
          }
        }

        const firstImagery = layers.find(l => l.role === 'imagery' || l.role === 'base')
        const layerName = firstImagery?.layer.name || layers[0]?.layer.name || ''
        if (frame.caption?.visible && frame.caption?.text) {
          drawCaption(ctx, frame.caption, frame.label, layerName, width, height)
        } else if (stampDates && frame.label) {
          drawDateStamp(ctx, frame.label, width, height)
        }

        gif.addFrame(canvas, { copy: true, delay: Math.round(frame.delayMs ?? delayMs) })
        done++
        onProgress?.(done, total)
        drawNext(index + 1)
      } catch (err) {
        reject(err)
      }
    }

    drawNext(0)
  })

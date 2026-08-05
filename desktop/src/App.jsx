import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import GIF from 'gif.js'
import { buildTileUrlTemplate } from './config/tileUrl'
import gifWorkerSource from 'gif.js/dist/gif.worker.js?raw'

const gifWorkerUrl = URL.createObjectURL(
  new Blob([gifWorkerSource], { type: 'application/javascript' })
)
import Map from './components/Map'
import LayerSelector from './components/LayerSelector'
import IntroModal from './components/IntroModal'
import About from './components/About'
import TimeBar from './components/TimeBar'
import DatePicker from './components/DatePicker'
import SplitView from './components/SplitView'
import CompareView from './components/CompareView'
import Toolbar from './components/Toolbar'
import ExportPanel from './components/ExportPanel'
import SplitOptionsPanel from './components/SplitOptionsPanel'
import TimelapsePanel from './components/TimelapsePanel'
import SearchPanel from './components/SearchPanel'
import TileUrlPanel from './components/TileUrlPanel'
import FeedbackPanel from './components/FeedbackPanel'

import layersConfig from './config/layers.json'
import './App.css'

function App() {
  const trueColorLayers = layersConfig.categories["True Color"] || []
  const defaultLayer = trueColorLayers.find(
    layer => layer.id === "VIIRS_NOAA21_CorrectedReflectance_TrueColor"
  ) || trueColorLayers[0]

  const defaultDateObj = new Date()
  defaultDateObj.setDate(defaultDateObj.getDate() - 3)
  const defaultDate = defaultDateObj.toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(defaultDate)
  const [selectedLayer, setSelectedLayer] = useState({ ...defaultLayer, time: defaultDate })
  const [exportTexts, setExportTexts] = useState(['%date%\n%layer%', '%date%\n%layer%'])
  const [exportOverlayColor, setExportOverlayColor] = useState('#000000')
  const [exportOverlayOpacity, setExportOverlayOpacity] = useState(0.55)
  const [exportTextColor, setExportTextColor] = useState('#ffffff')

  const [isPanelVisible, setIsPanelVisible] = useState(false)
  const [isZenMode, setIsZenMode] = useState(false)
  const [isExportPanelVisible, setIsExportPanelVisible] = useState(false)
  const [isTimelapsePanelVisible, setIsTimelapsePanelVisible] = useState(false)
  const [isSearchPanelVisible, setIsSearchPanelVisible] = useState(false)
  const [isTileUrlPanelVisible, setIsTileUrlPanelVisible] = useState(false)
  const [isFeedbackPanelVisible, setIsFeedbackPanelVisible] = useState(false)
  const [isGlobe, setIsGlobe] = useState(false)
  const [selectedTile, setSelectedTile] = useState(null)
  const [tilePickActive, setTilePickActive] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(true)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [isSplitView, setIsSplitView] = useState(false)
  const [isCompareView, setIsCompareView] = useState(false)

  const [splitPanes, setSplitPanes] = useState([
    { layer: defaultLayer, date: defaultDate },
    { layer: defaultLayer, date: defaultDate }
  ])
  const [comparePanes, setComparePanes] = useState([
    { layer: defaultLayer, date: defaultDate },
    { layer: defaultLayer, date: defaultDate }
  ])
  const [exportCrop, setExportCrop] = useState({ top: 0, bottom: 0 })

  const [timelapseFrames, setTimelapseFrames] = useState([])
  const [timelapseRectangle, setTimelapseRectangle] = useState(null)
  const [timelapseAspectRatio, setTimelapseAspectRatio] = useState(null)
  const [timelapseNewFrameDate, setTimelapseNewFrameDate] = useState(defaultDate)
  const [isTimelapseExporting, setIsTimelapseExporting] = useState(false)
  const [timelapseDelay, setTimelapseDelay] = useState(2)
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [initialView, setInitialView] = useState(null)

  const mapInstanceRef = useRef(null)
  const activeLayerRef = useRef(null)
  const splitMapInstancesRef = useRef([])
  const compareSplitPosRef = useRef(50)
  const drawRef = useRef(null)
  const capabilitiesDocRef = useRef(null)
  const [capsLoaded, setCapsLoaded] = useState(false)

  useEffect(() => {
    const fetchCaps = async () => {
      try {
        const res = await fetch('/wmts-capabilities/WMTSCapabilities.xml')
        if (!res.ok) return
        const text = await res.text()
        // Strip namespace prefixes so querySelector can find elements by local name
        const clean = text
          .replace(/<\/(\w+):(\w+)>/g, '</$2>')
          .replace(/<(\w+):(\w+)([\s>])/g, '<$2$3')
          .replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '')
        capabilitiesDocRef.current = new DOMParser().parseFromString(clean, 'text/xml')
        setCapsLoaded(true)
      } catch {}
    }
    fetchCaps()
  }, [])

  const findTimeDimension = (layerId) => {
    const doc = capabilitiesDocRef.current
    if (!doc) return null
    for (const el of doc.querySelectorAll('Layer')) {
      const idEl = el.querySelector('Identifier')
      if (idEl && idEl.textContent === layerId) {
        for (const dim of el.querySelectorAll('Dimension')) {
          const dimId = dim.querySelector('Identifier')
          if (dimId && dimId.textContent.toLowerCase() === 'time') return dim
        }
      }
    }
    return null
  }

  // All availability intervals for a layer, as {start, end, period} with
  // ISO dates (time component stripped) and an ISO 8601 period (e.g. P1D, P8D).
  const layerTimeIntervals = (layerId) => {
    const dim = findTimeDimension(layerId)
    if (!dim) return null
    const intervals = []
    for (const val of dim.querySelectorAll('Value')) {
      const parts = val.textContent.split('/')
      if (parts.length >= 3) {
        intervals.push({
          start: parts[0].split('T')[0],
          end: parts[1].split('T')[0],
          period: parts[2]
        })
      } else if (parts.length === 1 && parts[0]) {
        const d = parts[0].split('T')[0]
        intervals.push({ start: d, end: d, period: 'P1D' })
      }
    }
    return intervals.length ? intervals : null
  }

  const layerAvailability = useMemo(
    () => (capsLoaded && selectedLayer ? layerTimeIntervals(selectedLayer.id) : null),
    [capsLoaded, selectedLayer?.id]
  )

  const latestLayerDate = (layerId) => {
    const dim = findTimeDimension(layerId)
    if (!dim) return null
    const defaultEl = dim.querySelector('Default')
    if (defaultEl) return defaultEl.textContent
    // Fall back to the last Value element's end date
    const valEls = dim.querySelectorAll('Value')
    if (valEls.length) {
      const lastVal = valEls[valEls.length - 1].textContent
      const parts = lastVal.split('/')
      if (parts.length >= 2) return parts[1]
    }
    return null
  }

  const handleLayerSelect = (layer) => {
    setSelectedLayer({ ...layer, time: selectedDate })
  }

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate)
    if (selectedLayer) {
      // For sub-daily layers (IMERG, GHRSST MUR) the stored time includes a HH:MM:SSZ
      // component that must be preserved so tiles continue to resolve correctly.
      const storedTime = selectedLayer.time || ''
      const timeComponent = storedTime.includes('T') ? storedTime.split('T')[1] : null
      const newTime = timeComponent ? `${newDate}T${timeComponent}` : newDate
      setSelectedLayer({ ...selectedLayer, time: newTime })
    }
  }

  const handleGoToLast = () => {
    const latest = latestLayerDate(selectedLayer?.id)
    const date = latest ? latest.split('T')[0] : (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()
    handleDateChange(date)
  }

  const togglePanel = () => {
    if (isSplitView || isCompareView || isTimelapsePanelVisible || isSearchPanelVisible || isTileUrlPanelVisible || isFeedbackPanelVisible) {
      setIsSplitView(false)
      setIsCompareView(false)
      setIsTimelapsePanelVisible(false)
      setIsSearchPanelVisible(false)
      setIsTileUrlPanelVisible(false)
      setIsFeedbackPanelVisible(false)
      setTilePickActive(false)
      setIsPanelVisible(true)
      setIsExportPanelVisible(false)
    } else {
      setIsPanelVisible(!isPanelVisible)
      setIsExportPanelVisible(false)
    }
  }

  const toggleSplitView = () => {
    if (isSplitView) {
      setSelectedLayer({ ...splitPanes[0].layer, time: splitPanes[0].date })
      setSelectedDate(splitPanes[0].date)
      setIsSplitView(false)
      setIsPanelVisible(false)
      setInitialView(null)
      return
    }
    const map = mapInstanceRef.current
    setInitialView(map ? { center: map.getCenter(), zoom: map.getZoom() } : null)
    setIsCompareView(false)
    setIsTimelapsePanelVisible(false)
    setIsSearchPanelVisible(false)
    setIsTileUrlPanelVisible(false)
    setTilePickActive(false)
    setSplitPanes([
      { layer: selectedLayer, date: selectedDate },
      { layer: selectedLayer, date: selectedDate }
    ])
    setExportTexts(['%date%\n%layer%', '%layer%'])
    setIsSplitView(true)
    setIsPanelVisible(true)
    setIsExportPanelVisible(false)
  }

  const toggleExportPanel = () => {
    setIsExportPanelVisible(!isExportPanelVisible)
    if (!isExportPanelVisible) {
      setIsPanelVisible(false)
      setIsSearchPanelVisible(false)
      setIsTileUrlPanelVisible(false)
      setTilePickActive(false)
    }
  }

  const toggleTimelapsePanel = () => {
    if (isTimelapsePanelVisible) {
      setIsTimelapsePanelVisible(false)
      setIsPanelVisible(false)
      setInitialView(null)
      return
    }
    if (isSplitView || isCompareView) {
      setSelectedLayer({ ...(splitPanes[0] || comparePanes[0]).layer, time: (splitPanes[0] || comparePanes[0]).date })
      setSelectedDate((splitPanes[0] || comparePanes[0]).date)
      setIsSplitView(false)
      setIsCompareView(false)
    }
    const map = mapInstanceRef.current
    setInitialView(map ? { center: map.getCenter(), zoom: map.getZoom() } : null)
    setIsSearchPanelVisible(false)
    setIsTileUrlPanelVisible(false)
    setTilePickActive(false)
    setIsPanelVisible(true)
    setIsTimelapsePanelVisible(true)
    setIsExportPanelVisible(false)
  }

  const toggleSearchPanel = () => {
    if (isSearchPanelVisible) {
      setIsSearchPanelVisible(false)
      setIsPanelVisible(false)
      return
    }
    setIsSplitView(false)
    setIsCompareView(false)
    setIsTimelapsePanelVisible(false)
    setIsExportPanelVisible(false)
    setIsTileUrlPanelVisible(false)
    setIsPanelVisible(true)
    setIsSearchPanelVisible(true)
  }

  const toggleFeedbackPanel = () => {
    if (isFeedbackPanelVisible) {
      setIsFeedbackPanelVisible(false)
      setIsPanelVisible(false)
      return
    }
    setIsSplitView(false)
    setIsCompareView(false)
    setIsTimelapsePanelVisible(false)
    setIsExportPanelVisible(false)
    setIsSearchPanelVisible(false)
    setIsTileUrlPanelVisible(false)
    setTilePickActive(false)
    setIsPanelVisible(true)
    setIsFeedbackPanelVisible(true)
  }

  const toggleTileUrlPanel = () => {
    if (isTileUrlPanelVisible) {
      setIsTileUrlPanelVisible(false)
      setIsPanelVisible(false)
      setTilePickActive(false)
      return
    }
    setIsSplitView(false)
    setIsCompareView(false)
    setIsTimelapsePanelVisible(false)
    setIsExportPanelVisible(false)
    setIsSearchPanelVisible(false)
    setSelectedTile(null)
    setTilePickActive(false)
    setIsPanelVisible(true)
    setIsTileUrlPanelVisible(true)
  }

  const toggleCompareView = () => {
    if (isCompareView) {
      setIsCompareView(false)
      setIsPanelVisible(false)
      setInitialView(null)
      return
    }
    if (isSplitView) {
      setSelectedLayer({ ...splitPanes[0].layer, time: splitPanes[0].date })
      setSelectedDate(splitPanes[0].date)
      setIsSplitView(false)
    }
    const map = mapInstanceRef.current
    setInitialView(map ? { center: map.getCenter(), zoom: map.getZoom() } : null)
    setIsTimelapsePanelVisible(false)
    setIsSearchPanelVisible(false)
    setIsTileUrlPanelVisible(false)
    setTilePickActive(false)
    setComparePanes([
      { layer: selectedLayer, date: selectedDate },
      { layer: selectedLayer, date: selectedDate }
    ])
    setIsCompareView(true)
    setIsPanelVisible(true)
    setIsExportPanelVisible(false)
  }

  const handleTimelapseAddFrame = (date, rectangle) => {
    setTimelapseFrames(prev => [...prev, { date, rectangle }])
  }

  const handleTimelapseRemoveFrame = (index) => {
    setTimelapseFrames(prev => prev.filter((_, i) => i !== index))
  }

  const handleTimelapseReorderFrames = (reordered) => {
    setTimelapseFrames(reordered)
  }

  const handleTimelapseRectangleChange = (rectangle) => {
    setTimelapseRectangle(rectangle)
  }

  const handleTimelapseClearRectangle = () => {
    setTimelapseRectangle(null)
    setTimelapseAspectRatio(null)
  }

  const handleApplyPreset = (preset) => {
    if (preset === 'freeform') {
      setTimelapseAspectRatio(null)
      setTimelapseRectangle(null)
      return
    }

    const map = mapInstanceRef.current
    if (!map) return

    const ratio = preset === '16:9' ? 16 / 9 : 1
    setTimelapseAspectRatio(ratio)

    const dpr = window.devicePixelRatio || 1
    const canvas = map.getCanvas()
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    const cx = w / 2
    const cy = h / 2

    let rw, rh
    if (preset === '16:9') {
      rw = w * 0.85
      rh = rw * (9 / 16)
      if (rh > h * 0.85) { rh = h * 0.85; rw = rh * (16 / 9) }
    } else {
      rw = rh = Math.min(w, h) * 0.75
    }

    const sw = map.unproject([cx - rw / 2, cy + rh / 2])
    const ne = map.unproject([cx + rw / 2, cy - rh / 2])
    const rect = [[sw.lng, sw.lat], [ne.lng, ne.lat]]

    setTimelapseRectangle(rect)

    if (drawRef.current) {
      drawRef.current.deleteAll()
      drawRef.current.changeMode('simple_select')
    }

    map.fitBounds(rect, { padding: 40, animate: true, duration: 500 })
  }

  const handleComparePaneChange = (index, field, value) => {
    setComparePanes(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleTimelapseExport = async () => {
    const map = mapInstanceRef.current
    if (!map || timelapseFrames.length < 2 || !timelapseRectangle) return

    setIsTimelapseExporting(true)

    const { wmtsBaseUrl } = layersConfig
    const layerId = selectedLayer.id
    const layerTileMatrixSet = selectedLayer.tileMatrixSet
    const [sw, ne] = timelapseRectangle

    // Hide draw features during capture
    const savedFeatures = drawRef.current ? drawRef.current.getAll() : null
    if (drawRef.current) drawRef.current.deleteAll()

    // Zoom into the rectangle so tiles load at full resolution before computing dimensions
    map.fitBounds(timelapseRectangle, { padding: 0, animate: false })
    await new Promise(resolve => {
      if (map.loaded()) resolve()
      else map.once('idle', resolve)
    })

    const dpr = window.devicePixelRatio || 1
    const swPx = map.project([sw[0], sw[1]])
    const nePx = map.project([ne[0], ne[1]])
    const cropX = Math.min(swPx.x, nePx.x) * dpr
    const cropY = Math.min(swPx.y, nePx.y) * dpr
    const cropW = Math.abs(nePx.x - swPx.x) * dpr
    const cropH = Math.abs(nePx.y - swPx.y) * dpr

    if (cropW < 1 || cropH < 1) {
      setIsTimelapseExporting(false)
      return
    }

    const gifWidth = Math.round(cropW)
    const gifHeight = Math.round(cropH)

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: gifWidth,
      height: gifHeight,
      workerScript: gifWorkerUrl
    })

    const captureNext = (index) => {
      if (index >= timelapseFrames.length) {
        gif.render()
        return
      }

      const frame = timelapseFrames[index]
      const urlTemplate = buildTileUrlTemplate(layersConfig, selectedLayer, frame.date)
      const source = map.getSource(activeLayerRef.current?.sourceId || 'gibs-layer')
      if (source) {
        source.setTiles([urlTemplate])
      }

      const waitForMap = new Promise((resolve) => {
        requestAnimationFrame(() => {
          if (map.loaded()) return resolve()
          map.once('idle', () => resolve())
        })
      })
      const timeout = new Promise(resolve => setTimeout(resolve, 10000))

      Promise.race([waitForMap, timeout]).then(() => {
        const canvas = map.getCanvas()
        const cropped = document.createElement('canvas')
        cropped.width = gifWidth
        cropped.height = gifHeight
        const ctx = cropped.getContext('2d')
        ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, gifWidth, gifHeight)

        // Draw date overlay
        const pad = 6
        const fontSize = 13
        ctx.font = `${fontSize}px monospace`
        const text = frame.date
        const textW = ctx.measureText(text).width + pad * 2
        const textH = 14 + pad
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(0, gifHeight - textH, textW, textH)
        ctx.fillStyle = '#fff'
        ctx.fillText(text, pad, gifHeight - textH + pad + fontSize)

        gif.addFrame(cropped, { copy: true, delay: Math.round(timelapseDelay * 1000) })
        captureNext(index + 1)
      })
    }

    gif.on('finished', (blob) => {
      setIsTimelapseExporting(false)
      // Restore draw features
      if (savedFeatures && drawRef.current) {
        drawRef.current.set(savedFeatures)
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'timelapse.gif'
      link.click()
      URL.revokeObjectURL(url)
    })

    captureNext(0)
  }

  const resolveTemplate = (text, date, layerName) =>
    text.replace(/%date%/g, date).replace(/%layer%/g, layerName)

  const drawTextBlock = (ctx, lines, x, y, pad, fontSize, lineHeight, bgColor, opacity, textColor, align) => {
    const blockH = lines.length * lineHeight + pad * 2
    const blockW = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2
    ctx.fillStyle = bgColor
    ctx.globalAlpha = opacity
    ctx.fillRect(x, y - blockH, blockW, blockH)
    ctx.globalAlpha = 1
    ctx.fillStyle = textColor
    lines.forEach((line, i) => {
      const tx = align === 'right' ? x + blockW - pad - ctx.measureText(line).width : x + pad
      ctx.fillText(line, tx, y - blockH + pad + i * lineHeight + fontSize)
    })
  }

  const handleExport = useCallback(() => {
    setTimeout(() => {
      let canvas

      if (isCompareView) {
        const maps = splitMapInstancesRef.current
        if (maps.length < 2 || maps.some(m => !m)) return

        const [c0, c1] = maps.map(m => m.getCanvas())
        canvas = document.createElement('canvas')
        canvas.width = c1.width
        canvas.height = c1.height
        const ctx = canvas.getContext('2d')

        // pane 1 is the bottom (full), pane 0 is clipped on top
        ctx.drawImage(c1, 0, 0)
        const clipW = Math.round(c0.width * (compareSplitPosRef.current / 100))
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, clipW, c0.height)
        ctx.clip()
        ctx.drawImage(c0, 0, 0)
        ctx.restore()

        // divider line
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(clipW, 0)
        ctx.lineTo(clipW, canvas.height)
        ctx.stroke()
      } else if (isSplitView) {
        const maps = splitMapInstancesRef.current
        if (maps.length < 2 || maps.some(m => !m)) return

        const canvases = maps.map(m => m.getCanvas())
        const totalW = canvases.reduce((s, c) => s + c.width, 0)
        const maxH = Math.max(...canvases.map(c => c.height))

        canvas = document.createElement('canvas')
        canvas.width = totalW
        canvas.height = maxH
        const ctx = canvas.getContext('2d')

        let offsetX = 0
        canvases.forEach((c, i) => {
          ctx.drawImage(c, offsetX, 0)
          if (i < canvases.length - 1) {
            ctx.strokeStyle = '#000'
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.moveTo(offsetX + c.width, 0)
            ctx.lineTo(offsetX + c.width, maxH)
            ctx.stroke()
          }
          offsetX += c.width
        })
      } else {
        const map = mapInstanceRef.current
        if (!map) return
        const src = map.getCanvas()
        canvas = document.createElement('canvas')
        canvas.width = src.width
        canvas.height = src.height
        canvas.getContext('2d').drawImage(src, 0, 0)
      }

      // apply crop first
      const { top, bottom } = exportCrop
      const dpr = window.devicePixelRatio || 1
      const cropTop = Math.round(top * dpr)
      const cropBottom = Math.round(bottom * dpr)
      if (cropTop || cropBottom) {
        const cw = canvas.width
        const ch = canvas.height - cropTop - cropBottom
        if (cw > 0 && ch > 0) {
          const cropped = document.createElement('canvas')
          cropped.width = cw
          cropped.height = ch
          cropped.getContext('2d').drawImage(canvas, 0, cropTop, cw, ch, 0, 0, cw, ch)
          canvas = cropped
        }
      }

      // then draw text on cropped canvas (at bottom of visible area)
      const pad = 10
      const fontSize = 13
      const lineHeight = 18
      const ctx = canvas.getContext('2d')
      ctx.font = `${fontSize}px monospace`

      if (isCompareView) {
        const lines = resolveTemplate(exportTexts[0] || '%date%\n%layer%', comparePanes[0].date, comparePanes[0].layer.name).split('\n')
        const blockW = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2
        drawTextBlock(ctx, lines, canvas.width - blockW - pad, canvas.height - pad, pad, fontSize, lineHeight,
          exportOverlayColor, exportOverlayOpacity, exportTextColor, 'right')
      } else if (isSplitView) {
        const maps = splitMapInstancesRef.current
        const canvases = maps.map(m => m.getCanvas())
        let offsetX = 0

        maps.forEach((m, i) => {
          const pane = splitPanes[i]
          if (!pane) return
          const cw = canvases[i].width
          const text = exportTexts[i] || '%date%\n%layer%'
          const lines = resolveTemplate(text, pane.date, pane.layer.name).split('\n')
          const blockW = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2

          if (i === 0) {
            drawTextBlock(ctx, lines, offsetX + pad, canvas.height - pad, pad, fontSize, lineHeight,
              exportOverlayColor, exportOverlayOpacity, exportTextColor, 'left')
          } else {
            const rx = offsetX + cw - blockW - pad
            drawTextBlock(ctx, lines, rx, canvas.height - pad, pad, fontSize, lineHeight,
              exportOverlayColor, exportOverlayOpacity, exportTextColor, 'right')
          }
          offsetX += cw
        })
      } else {
        const lines = resolveTemplate(exportTexts[0] || '%date%\n%layer%', selectedDate, selectedLayer.name).split('\n')
        drawTextBlock(ctx, lines, pad, canvas.height - pad, pad, fontSize, lineHeight,
          exportOverlayColor, exportOverlayOpacity, exportTextColor, 'left')
      }

      const dateStr = selectedDate.replace(/-/g, '')
      const filename = isSplitView ? `gibson-split-${dateStr}.jpg` : isCompareView ? `gibson-compare-${dateStr}.jpg` : `gibson-${selectedLayer.id}-${dateStr}.jpg`
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.click()
        URL.revokeObjectURL(url)
      }, 'image/jpeg', 0.95)
    }, 800)
  }, [isSplitView, isCompareView, selectedLayer, selectedDate, splitPanes, comparePanes, exportTexts, exportOverlayColor, exportOverlayOpacity, exportTextColor, exportCrop])

  return (
    <div className={`app${isGlobe ? ' globe-mode' : ''}`}>
      <Toolbar
        isLayersView={isPanelVisible && !isSplitView && !isCompareView && !isTimelapsePanelVisible && !isExportPanelVisible && !isSearchPanelVisible}
        onTogglePanel={togglePanel}
        isSplitView={isSplitView}
        onToggleSplit={toggleSplitView}
        isCompareView={isCompareView}
        onToggleCompare={toggleCompareView}
        isExportPanelVisible={isExportPanelVisible}
        onToggleExportPanel={toggleExportPanel}
        isTimelapsePanelVisible={isTimelapsePanelVisible}
        onToggleTimelapsePanel={toggleTimelapsePanel}
        isSearchPanelVisible={isSearchPanelVisible}
        onToggleSearchPanel={toggleSearchPanel}
        isTileUrlPanelVisible={isTileUrlPanelVisible}
        onToggleTileUrlPanel={toggleTileUrlPanel}
        onToggleAbout={() => setIsAboutOpen(true)}
        isZenMode={isZenMode}
        onToggleZen={() => setIsZenMode(z => !z)}
        isGlobe={isGlobe}
        onToggleGlobe={() => setIsGlobe(g => !g)}
        isFeedbackPanelVisible={isFeedbackPanelVisible}
        onToggleFeedbackPanel={toggleFeedbackPanel}
      />

      <IntroModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />

      {isAboutOpen && <About onClose={() => setIsAboutOpen(false)} />}

      <div className={`sidebar-panel ${!isZenMode && (isPanelVisible || isExportPanelVisible || isTimelapsePanelVisible || isSearchPanelVisible || isTileUrlPanelVisible || isFeedbackPanelVisible) ? 'panel-visible' : 'panel-hidden'}`}>
        <div className="sidebar-header">
          <button className="sidebar-close" onClick={() => { setIsPanelVisible(false); setIsExportPanelVisible(false); setIsTimelapsePanelVisible(false); setIsSearchPanelVisible(false); setIsTileUrlPanelVisible(false); setIsFeedbackPanelVisible(false); setTilePickActive(false) }} title="Close panel">
            ✕
          </button>
        </div>

        <div className="sidebar-content">
          {isFeedbackPanelVisible ? (
            <FeedbackPanel />
          ) : isTileUrlPanelVisible ? (
            <>
              <div className="split-options-header" style={{ padding: '20px 20px 0' }}>Tile URL</div>
              <TileUrlPanel
                layer={selectedLayer}
                config={layersConfig}
                selectedTile={selectedTile}
                pickActive={tilePickActive}
                onTogglePick={() => { setTilePickActive(a => !a); setSelectedTile(null) }}
              />
            </>
          ) : isSearchPanelVisible ? (
            <>
              <div className="split-options-header" style={{ padding: '20px 20px 0' }}>Search</div>
              <SearchPanel
                mapRef={mapInstanceRef}
                onClose={() => { setIsSearchPanelVisible(false); setIsPanelVisible(false) }}
              />
            </>
          ) : isExportPanelVisible ? (
            <ExportPanel
              exportTexts={exportTexts}
              overlayColor={exportOverlayColor}
              overlayOpacity={exportOverlayOpacity}
              textColor={exportTextColor}
              crop={exportCrop}
              onExportTextsChange={setExportTexts}
              onOverlayColorChange={setExportOverlayColor}
              onOverlayOpacityChange={setExportOverlayOpacity}
              onTextColorChange={setExportTextColor}
              onCropChange={setExportCrop}
              onExport={handleExport}
              isSplitView={isSplitView}
              paneCount={isSplitView ? splitPanes.length : 1}
            />
          ) : isCompareView ? (
            <div className="compare-options-panel">
              <div className="compare-options-header">Compare</div>
              {[0, 1].map(i => (
                <div key={i} className="compare-pane-options">
                  <div className="compare-pane-label">{i === 0 ? 'Left' : 'Right'} Layer</div>
                  <select
                    className="compare-layer-select"
                    value={comparePanes[i].layer.id}
                    onChange={(e) => {
                      const newId = e.target.value
                      for (const cat of Object.values(layersConfig.categories)) {
                        const found = cat.find(l => l.id === newId)
                        if (found) {
                          handleComparePaneChange(i, 'layer', { ...found, time: comparePanes[i].date })
                          return
                        }
                      }
                    }}
                  >
                    {Object.entries(layersConfig.categories).map(([catName, layers]) => (
                      <optgroup key={catName} label={catName}>
                        {layers.map(layer => (
                          <option key={layer.id} value={layer.id}>
                            {layer.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="compare-date-row">
                    <label className="compare-date-label">Date</label>
                    <DatePicker
                      selectedDate={comparePanes[i].date}
                      onDateChange={(date) => handleComparePaneChange(i, 'date', date)}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : isSplitView ? (
            <SplitOptionsPanel
              config={layersConfig}
              panes={splitPanes}
              onPanesChange={setSplitPanes}
              exportTexts={exportTexts}
              onExportTextsChange={setExportTexts}
              syncEnabled={syncEnabled}
              onToggleSync={() => setSyncEnabled(!syncEnabled)}
            />
          ) : isTimelapsePanelVisible ? (
            <TimelapsePanel
              config={layersConfig}
              selectedLayer={selectedLayer}
              selectedDate={selectedDate}
              onDateChange={setTimelapseNewFrameDate}
              onAddFrame={handleTimelapseAddFrame}
              onRemoveFrame={handleTimelapseRemoveFrame}
              onReorder={handleTimelapseReorderFrames}
              onExport={handleTimelapseExport}
              frames={timelapseFrames}
              rectangle={timelapseRectangle}
              onRectangleChange={handleTimelapseRectangleChange}
              onClearRectangle={handleTimelapseClearRectangle}
              onApplyPreset={handleApplyPreset}
              isExporting={isTimelapseExporting}
              delay={timelapseDelay}
              onDelayChange={setTimelapseDelay}
            />
          ) : (
            <>
              <div className="split-options-header" style={{ padding: '20px 20px 0' }}>GIBS Layers</div>
              <LayerSelector
                config={layersConfig}
                onLayerSelect={handleLayerSelect}
                selectedLayer={selectedLayer}
              />
            </>
          )}
        </div>
        
      </div>

      <div className="main-area">
        <div className="map-wrapper">
          {isSplitView ? (
            <SplitView
              config={layersConfig}
              panes={splitPanes}
              crop={exportCrop}
              onCropChange={setExportCrop}
              onMapInstancesReady={(instances) => { splitMapInstancesRef.current = instances }}
              syncEnabled={syncEnabled}
              initialView={initialView}
            />
          ) : isCompareView ? (
            <CompareView
              config={layersConfig}
              panes={comparePanes}
              onMapInstancesReady={(instances) => { splitMapInstancesRef.current = instances }}
              onSplitPosChange={(pos) => { compareSplitPosRef.current = pos }}
              initialView={initialView}
            />
          ) : (
            <Map
              selectedLayer={selectedLayer}
              selectedDate={selectedDate}
              config={layersConfig}
              timelapseMode={isTimelapsePanelVisible}
              timelapseRectangle={timelapseRectangle}
              timelapseAspectRatio={timelapseAspectRatio}
              onDrawRectangle={handleTimelapseRectangleChange}
              onMapReady={(m) => { mapInstanceRef.current = m }}
              activeLayerRef={activeLayerRef}
              isZenMode={isZenMode}
              isGlobe={isGlobe}
              drawRef={drawRef}
              initialCenter={initialView?.center}
              initialZoom={initialView?.zoom}
              tilePickMode={tilePickActive}
              onTilePick={(tile) => { setSelectedTile(tile); setTilePickActive(false) }}
            />
          )}
        </div>

        {!isSplitView && !isCompareView && !isZenMode && (
          <TimeBar
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            onGoToLast={handleGoToLast}
            availability={layerAvailability}
          />
        )}
      </div>
    </div>
  )
}

export default App

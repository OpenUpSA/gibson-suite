import React, { useState, useEffect, useRef } from 'react'
import './LegendBar.css'

const COLORMAP_BASE = '/colormaps'

const LegendBar = ({ layer, status }) => {
  const [legendData, setLegendData] = useState(null)
  const [tooltip, setTooltip] = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    if (status === 'loading') setLegendData(null)
  }, [status])

  useEffect(() => {
    if (!layer || !layer.legendId) { setLegendData(null); return }

    const fetchColormap = async () => {
      const url = `${COLORMAP_BASE}/${layer.legendId}.xml`
      try {
        const res = await fetch(url, { mode: 'cors' })
        if (!res.ok) return
        const text = await res.text()
        const doc = new DOMParser().parseFromString(text, 'text/xml')
        if (doc.querySelector('parsererror')) return

        const entries = Array.from(doc.querySelectorAll('ColorMapEntry'))
        const colors = []
        entries.forEach(entry => {
          const rgb = entry.getAttribute('rgb')
          if (rgb) colors.push(`rgb(${rgb})`)
        })
        const nonDataColors = colors.filter((_, i) => {
          const entry = entries[i]
          return entry && entry.getAttribute('nodata') !== 'true'
        })

        const colorMaps = Array.from(doc.querySelectorAll('ColorMap'))
        const dataColorMap = colorMaps.find(cm => {
          const cmEntries = cm.querySelectorAll('ColorMapEntry')
          return Array.from(cmEntries).some(e => e.getAttribute('nodata') !== 'true')
        })
        const units = dataColorMap?.getAttribute('units') || ''

        const legend = doc.querySelector('Legend[type="continuous"]')
        let minLabel = '', maxLabel = ''
        if (legend) {
          minLabel = legend.getAttribute('minLabel') || ''
          maxLabel = legend.getAttribute('maxLabel') || ''
        }

        const legendEntries = Array.from(doc.querySelectorAll('Legend[type="continuous"] > LegendEntry'))
        const ticks = []
        const values = []
        const nonDataCount = nonDataColors.length
        legendEntries.forEach(entry => {
          const showTick = entry.getAttribute('showTick') === 'true'
          const showLabel = entry.getAttribute('showLabel') === 'true'
          const label = entry.getAttribute('label') || ''
          const id = parseInt(entry.getAttribute('id'), 10)
          const tip = entry.getAttribute('tooltip') || ''
          if (id >= 1) values.push(tip)
          if (showTick && id >= 1) {
            ticks.push({ pos: (id - 1) / nonDataCount, label: showLabel ? label : '' })
          }
        })

        setLegendData({ units, colors, values, ticks, minLabel, maxLabel })
      } catch {}
    }
    fetchColormap()
  }, [layer, layer?.legendId])

  useEffect(() => {
    if (!legendData || !canvasRef.current || status !== 'loaded') return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { colors, ticks, minLabel, maxLabel } = legendData
    const w = canvas.width
    const barH = 16

    ctx.clearRect(0, 0, w, canvas.height)
    const segW = w / colors.length
    colors.forEach((color, i) => {
      ctx.fillStyle = color
      ctx.fillRect(Math.floor(i * segW), 0, Math.ceil(segW + 1), barH)
    })

    ctx.fillStyle = '#ccc'
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 1
    ctx.font = `10px 'Courier New', monospace`
    ctx.textAlign = 'center'
    const tickH = 5
    const labelY = barH + tickH + 12

    ticks.forEach(t => {
      const x = t.pos * w
      ctx.beginPath()
      ctx.moveTo(x, barH)
      ctx.lineTo(x, barH + tickH)
      ctx.stroke()
      if (t.label) ctx.fillText(t.label, x, labelY)
    })

    ctx.textAlign = 'left'
    ctx.fillText(minLabel, 2, labelY)
    ctx.textAlign = 'right'
    ctx.fillText(maxLabel, w - 2, labelY)
  }, [legendData, status])

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas || !legendData) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const cw = rect.width
    if (x < 0 || x >= cw) { setTooltip(null); return }
    const idx = Math.floor((x / cw) * legendData.values.length)
    const clamped = Math.max(0, Math.min(legendData.values.length - 1, idx))
    const parentRect = canvas.parentElement.getBoundingClientRect()
    setTooltip({ value: legendData.values[clamped], x: e.clientX - parentRect.left })
  }

  const handleMouseLeave = () => setTooltip(null)

  if (status === 'loading') {
    return (
      <div className="legend-bar legend-bar-loading">
        <div className="legend-bar-spinner" />
        <span className="legend-bar-loading-text">Loading...</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="legend-bar legend-bar-error">
        <span className="legend-error-text">Failed to load layer tiles</span>
      </div>
    )
  }

  if (status !== 'loaded' || !legendData) return null

  return (
    <div className="legend-bar">
      <div className="legend-bar-body">
        <div className="legend-bar-canvas-wrap">
          <canvas
            ref={canvasRef}
            width={320}
            height={44}
            className="legend-bar-canvas"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
          {tooltip && (
            <div className="legend-bar-tooltip" style={{ left: tooltip.x }}>
              {tooltip.value}
            </div>
          )}
        </div>
        <span className="legend-bar-unit">{legendData.units}</span>
      </div>
    </div>
  )
}

export default LegendBar

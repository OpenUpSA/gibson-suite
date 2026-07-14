import React, { useState, useEffect, useRef } from 'react'
import './Legend.css'

const Legend = ({ selectedLayer }) => {
  const [legendData, setLegendData] = useState(null)
  const [hasLegend, setHasLegend] = useState(true)
  const [loading, setLoading] = useState(true)
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!selectedLayer) return

    setLoading(true)
    setHasLegend(true)
    setLegendData(null) // Clear previous legend

    // Fetch colormap XML from GIBS
    const fetchColormap = async () => {
      const colormapUrl = `https://gibs.earthdata.nasa.gov/colormaps/v1.3/${selectedLayer.id}.xml`
      
      try {
        const response = await fetch(colormapUrl, { mode: 'cors' })
        if (!response.ok) {
          setHasLegend(false)
          setLegendData(null)
          setLoading(false)
          return
        }
        
        const xmlText = await response.text()
        const parser = new DOMParser()
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
        
        // Check for XML parsing errors
        const parserError = xmlDoc.querySelector('parsererror')
        if (parserError) {
          setHasLegend(false)
          setLegendData(null)
          setLoading(false)
          return
        }
        
        // Parse colormap
        const colorMap = xmlDoc.querySelector('ColorMap')
        if (!colorMap) {
          setHasLegend(false)
          setLegendData(null)
          setLoading(false)
          return
        }
        
        const title = colorMap.getAttribute('title') || selectedLayer.name
        const units = colorMap.getAttribute('units') || ''
        
        // Check for Legend element with min/max labels
        const legend = xmlDoc.querySelector('Legend')
        let minLabel = ''
        let maxLabel = ''
        
        if (legend) {
          minLabel = legend.getAttribute('minLabel') || ''
          maxLabel = legend.getAttribute('maxLabel') || ''
        }
        
        const entries = Array.from(xmlDoc.querySelectorAll('ColorMapEntry'))
        const colors = []
        const labels = []
        
        entries.forEach(entry => {
          const rgb = entry.getAttribute('rgb')
          const label = entry.getAttribute('label')
          if (rgb) {
            colors.push(`rgb(${rgb})`)
            if (label) labels.push(label)
          }
        })
        
        // If no labels from entries, use Legend min/max
        if (labels.length === 0 && minLabel && maxLabel) {
          labels.push(minLabel, maxLabel)
        }
        
        if (colors.length > 0) {
          setLegendData({ title, units, colors, labels, minLabel, maxLabel })
          setHasLegend(true)
        } else {
          setHasLegend(false)
          setLegendData(null)
        }
        
      } catch (error) {
        // Silently fail for layers without colormaps
        setHasLegend(false)
        setLegendData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchColormap()

  }, [selectedLayer, selectedLayer.id])

  useEffect(() => {
    if (!legendData || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { colors } = legendData
    
    const width = canvas.width
    const height = canvas.height
    
    // Clear canvas first
    ctx.clearRect(0, 0, width, height)
    
    const segmentWidth = width / colors.length
    
    // Draw color gradient
    colors.forEach((color, i) => {
      ctx.fillStyle = color
      ctx.fillRect(Math.floor(i * segmentWidth), 0, Math.ceil(segmentWidth) + 1, height)
    })
    
    console.log('Canvas drawn with', colors.length, 'colors')
    
  }, [legendData])

  if (!selectedLayer || !hasLegend || !legendData) return null

  return (
    <div className="legend-inline">
      <canvas 
        ref={canvasRef}
        width={200}
        height={12}
        className="legend-canvas-inline"
      />
      <div className="legend-labels-inline">
        <span className="legend-label-min">
          {legendData.minLabel || legendData.labels[0] || ''}
        </span>
        <span className="legend-label-max">
          {legendData.maxLabel || legendData.labels[legendData.labels.length - 1] || ''}
        </span>
      </div>
      {legendData.units && (
        <span className="legend-units">{legendData.units.trim()}</span>
      )}
    </div>
  )
}

export default Legend

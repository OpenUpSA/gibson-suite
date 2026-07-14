import React, { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import './GibsCapabilities.css'

function fetchCapabilities() {
  return fetch('/wmts-capabilities/WMTSCapabilities.xml')
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch capabilities')
      return res.text()
    })
    .then(text => {
      const clean = text
        .replace(/<\/(\w+):(\w+)>/g, '</$2>')
        .replace(/<(\w+):(\w+)([\s>])/g, '<$2$3')
        .replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '')
      return new DOMParser().parseFromString(clean, 'text/xml')
    })
}

function parseLayers(doc) {
  const layers = []
  for (const el of doc.querySelectorAll('Contents > Layer')) {
    const identifier = el.querySelector('Identifier')?.textContent || ''
    const title = el.querySelector('Title')?.textContent || ''
    const abstract = el.querySelector('Abstract')?.textContent || ''

    const bboxEl = el.querySelector('BoundingBox')
    let bbox = ''
    if (bboxEl) {
      const lc = bboxEl.querySelector('LowerCorner')?.textContent || ''
      const uc = bboxEl.querySelector('UpperCorner')?.textContent || ''
      const crs = bboxEl.getAttribute('CRS') || ''
      bbox = `${crs} [${lc}, ${uc}]`
    }

    const styles = []
    for (const s of el.querySelectorAll('Style')) {
      const id = s.querySelector('Identifier')?.textContent
      if (id) styles.push(id)
    }

    const formats = []
    for (const f of el.querySelectorAll('Format')) {
      if (f.textContent) formats.push(f.textContent)
    }

    const tmsLinks = []
    for (const t of el.querySelectorAll('TileMatrixSetLink')) {
      const tms = t.querySelector('TileMatrixSet')?.textContent
      if (tms) tmsLinks.push(tms)
    }

    const timeDimEl = el.querySelector('Dimension Identifier')
    let timeRange = ''
    let timeValues = []
    if (timeDimEl && timeDimEl.textContent.toLowerCase() === 'time') {
      const dim = timeDimEl.closest('Dimension')
      if (dim) {
        for (const v of dim.querySelectorAll('Value')) {
          if (v.textContent) timeValues.push(v.textContent)
        }
        if (timeValues.length) {
          const first = timeValues[0].split('/')[0].split('T')[0]
          const last = timeValues[timeValues.length - 1].split('/')[1]?.split('T')[0] || timeValues[timeValues.length - 1].split('/')[0].split('T')[0]
          timeRange = `${first} — ${last}`
        }
      }
    }

    const wgs84Bbox = el.querySelector('WGS84BoundingBox')
    let geoBbox = ''
    if (wgs84Bbox) {
      const lc = wgs84Bbox.querySelector('LowerCorner')?.textContent || ''
      const uc = wgs84Bbox.querySelector('UpperCorner')?.textContent || ''
      geoBbox = `[${lc}, ${uc}]`
    }

    layers.push({
      identifier,
      title,
      abstract,
      bbox,
      geoBbox,
      styles,
      formats,
      tmsLinks,
      timeRange,
      timeValues
    })
  }
  return layers
}

function GibsCapabilities() {
  const [layers, setLayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterText, setFilterText] = useState('')
  const [expandedAbstract, setExpandedAbstract] = useState(new Set())

  useEffect(() => {
    fetchCapabilities()
      .then(doc => {
        setLayers(parseLayers(doc))
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const filteredLayers = useMemo(() => {
    if (!filterText.trim()) return layers
    const q = filterText.toLowerCase()
    return layers.filter(l =>
      l.identifier.toLowerCase().includes(q) ||
      l.title.toLowerCase().includes(q) ||
      l.abstract.toLowerCase().includes(q) ||
      l.styles.some(s => s.toLowerCase().includes(q)) ||
      l.formats.some(f => f.toLowerCase().includes(q)) ||
      l.tmsLinks.some(t => t.toLowerCase().includes(q)) ||
      l.timeRange.toLowerCase().includes(q)
    )
  }, [layers, filterText])

  const toggleAbstract = (id) => {
    setExpandedAbstract(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="gibs-page">
        <div className="gibs-loading">Loading capabilities document…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="gibs-page">
        <div className="gibs-error">Failed to load capabilities: {error}</div>
      </div>
    )
  }

  return (
    <div className="gibs-page">
      <header className="gibs-header">
        <div className="gibs-header-left">
          <Link to="/" className="gibs-back-link">&larr; Viewer</Link>
          <h1>GIBS Capabilities</h1>
        </div>
        <div className="gibs-header-right">
          <span className="gibs-count">{filteredLayers.length} of {layers.length} layers</span>
          <input
            type="text"
            className="gibs-search"
            placeholder="Filter layers…"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            autoFocus
          />
        </div>
      </header>
      <div className="gibs-table-wrap">
        <table className="gibs-table">
          <thead>
            <tr>
              <th>Identifier</th>
              <th>Title</th>
              <th>Abstract</th>
              <th>Time Range</th>
              <th>Bounding Box</th>
              <th>Style</th>
              <th>Format</th>
              <th>TileMatrixSet</th>
            </tr>
          </thead>
          <tbody>
            {filteredLayers.length === 0 && (
              <tr>
                <td colSpan={8} className="gibs-empty">No layers match your filter.</td>
              </tr>
            )}
            {filteredLayers.map((l, i) => {
              const absKey = `${l.identifier}-${i}`
              const isExpanded = expandedAbstract.has(absKey)
              const shortAbs = l.abstract.length > 120 ? l.abstract.slice(0, 120) + '…' : l.abstract
              return (
                <tr key={absKey}>
                  <td className="gibs-cell-id">{l.identifier}</td>
                  <td>{l.title}</td>
                  <td className="gibs-cell-abs">
                    <span>{isExpanded ? l.abstract : shortAbs}</span>
                    {l.abstract.length > 120 && (
                      <button
                        className="gibs-expand-btn"
                        onClick={() => toggleAbstract(absKey)}
                      >
                        {isExpanded ? 'less' : 'more'}
                      </button>
                    )}
                  </td>
                  <td className="gibs-cell-time">{l.timeRange || '—'}</td>
                  <td className="gibs-cell-bbox">{l.geoBbox || l.bbox || '—'}</td>
                  <td className="gibs-cell-list">{l.styles.join(', ') || '—'}</td>
                  <td className="gibs-cell-list">{l.formats.join(', ') || '—'}</td>
                  <td className="gibs-cell-list">{l.tmsLinks.join(', ') || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default GibsCapabilities

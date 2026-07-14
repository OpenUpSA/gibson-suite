import React, { useState, useRef, useEffect } from 'react'
import './SearchPanel.css'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

const SearchPanel = ({ mapRef, onClose }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults([]); setSearched(false); return }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=10&addressdetails=1`)
        if (!res.ok) throw new Error()
        const data = await res.json()
        setResults(data)
      } catch { setResults([]) }
      setLoading(false)
      setSearched(true)
    }, 300)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  const goTo = (lat, lon) => {
    const map = mapRef?.current
    if (map) {
      map.flyTo({ center: [lon, lat], zoom: 12 })
    }
    onClose()
  }

  return (
    <div className="search-panel">
      <div className="search-input-wrap">
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          placeholder="Search for a location..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        />
        {query && (
          <button className="search-clear" onClick={() => { setQuery(''); setResults([]); setSearched(false) }} title="Clear search">
            ✕
          </button>
        )}
        {loading && <span className="search-spinner" />}
      </div>

      {searched && results.length === 0 && (
        <div className="search-no-results">No locations found</div>
      )}

      {results.length > 0 && (
        <div className="search-results">
          {results.map((r, i) => (
            <button
              key={i}
              className="search-result-item"
              onClick={() => goTo(parseFloat(r.lat), parseFloat(r.lon))}
            >
              <div className="search-result-name">{r.display_name}</div>
              <div className="search-result-type">{r.type} &middot; {r.category}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default SearchPanel

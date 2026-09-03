import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import './PlaceSearch.css'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

// Debounced Nominatim place search for the layers sidebar. Selecting a
// result calls onSelect(lat, lon) so the caller can fly the active view's
// map to the location.
const PlaceSearch = ({ onSelect }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setSearched(false)
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=8&addressdetails=1&accept-language=en`
        )
        if (!res.ok) throw new Error()
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
      } catch {
        setResults([])
      }
      setLoading(false)
      setSearched(true)
    }, 300)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  const pick = (r) => {
    onSelect?.(parseFloat(r.lat), parseFloat(r.lon))
    setQuery('')
    setResults([])
    setSearched(false)
  }

  return (
    <div className="place-search">
      <div className="place-search-input-wrap">
        <Icon icon="fluent:search-20-filled" width="14" height="14" className="place-search-icon" />
        <input
          className="place-search-input"
          type="text"
          placeholder="Search for a place…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="place-search-clear"
            onClick={() => { setQuery(''); setResults([]); setSearched(false) }}
            title="Clear search"
          >
            <Icon icon="fluent:dismiss-12-regular" width="12" height="12" />
          </button>
        )}
        {loading && <span className="place-search-spinner" />}
      </div>

      {searched && results.length === 0 && !loading && (
        <div className="place-search-empty">No places found</div>
      )}

      {results.length > 0 && (
        <div className="place-search-results">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              className="place-search-result"
              onClick={() => pick(r)}
            >
              <span className="place-search-result-name">{r.display_name}</span>
              <span className="place-search-result-type">{r.type} · {r.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default PlaceSearch

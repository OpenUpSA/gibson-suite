import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { decodeCompareShare } from '../utils/shareCompare'
import CompareOverlay from './CompareOverlay'
import { layerById, layerCatalog, wmtsBaseUrl, mapSettings, DEFAULT_SETTINGS } from './Globe'
import './CompareShare.css'

// Rebuild a tab-like object the map components expect from the compact
// share payload. Per-layer settings default (same as a fresh app session).
const buildTab = (data, id, fallbackLabel) => ({
  id,
  label: data.l || fallbackLabel,
  activeBySection: {
    base: data.s?.base || [],
    imagery: data.s?.imagery || [],
    reference: data.s?.reference || []
  },
  layerSettings: Object.fromEntries(layerCatalog.map(l => [l.id, DEFAULT_SETTINGS(l)])),
  hiddenLayers: new Set(),
  date: data.d,
  mapPosition: data.p ? { center: data.p.c, zoom: data.p.z } : undefined
})

/**
 * Minimalist share/embed page for the Compare view: full-bleed compare
 * overlay, no toolbars or sidebars — just the GIBSON logo at the top.
 * State is reconstructed entirely from the encoded URL payload.
 */
const CompareShare = () => {
  const { payload } = useParams()
  const decoded = useMemo(() => decodeCompareShare(payload), [payload])

  if (!decoded) {
    return (
      <div className="compare-share compare-share--error">
        <img src="/gibson-icon.png" alt="Gibson" className="compare-share-logo" />
        <p className="compare-share-error-text">This share link is invalid or has expired.</p>
      </div>
    )
  }

  const tabA = buildTab(decoded.tabs[0], 'share-a', 'View A')
  const tabB = buildTab(decoded.tabs[1], 'share-b', 'View B')

  return (
    <div className="compare-share">
      <Link to="/" className="compare-share-logo-link" title="Open GIBSON">
        <img src="/gibson-icon.png" alt="GIBSON" className="compare-share-logo" />
      </Link>
      <CompareOverlay
        tabA={tabA}
        tabB={tabB}
        layerById={layerById}
        layerCatalog={layerCatalog}
        wmtsBaseUrl={wmtsBaseUrl}
        mapSettings={mapSettings}
        captions={decoded.c || {}}
      />
    </div>
  )
}

export default CompareShare

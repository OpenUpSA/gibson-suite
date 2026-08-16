// Share-link payload helpers for the minimalist compare view.
//
// The compare state (two tabs: label / date / active layers / map position,
// plus optional captions) is JSON-encoded and base64url-encoded into a
// compact URL segment: /share/compare/<payload>. The viewer page
// (CompareShare.jsx) decodes it and rebuilds the map tabs with default
// per-layer settings.

const b64urlEncode = (str) => {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const b64urlDecode = (str) => {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

// Compact serialization of one tab — only what the share view needs.
const serializeTab = (tab) => ({
  l: tab.label,
  d: tab.date,
  s: {
    imagery: tab.activeBySection?.imagery || [],
    base: tab.activeBySection?.base || [],
    reference: tab.activeBySection?.reference || []
  },
  p: tab.mapPosition ? { c: tab.mapPosition.center, z: tab.mapPosition.zoom } : undefined
})

/**
 * Build the encoded payload for two tabs and (optionally) compare captions.
 * @returns {string} base64url payload for use in /share/compare/<payload>
 */
export const encodeCompareShare = ({ tabA, tabB, captions }) => {
  const payload = {
    v: 1,
    tabs: [serializeTab(tabA), serializeTab(tabB)],
    c: captions ? { before: captions.before, after: captions.after } : undefined
  }
  return b64urlEncode(JSON.stringify(payload))
}

/**
 * Decode a /share/compare payload back into plain data.
 * @returns {{v: number, tabs: Array, c?: object} | null}
 */
export const decodeCompareShare = (encoded) => {
  try {
    const payload = JSON.parse(b64urlDecode(encoded))
    if (payload.v !== 1 || !Array.isArray(payload.tabs) || payload.tabs.length !== 2) return null
    return payload
  } catch {
    return null
  }
}

/** Full absolute URL for a payload (uses the current origin). */
export const shareUrlFor = (payload) => `${window.location.origin}/share/compare/${payload}`

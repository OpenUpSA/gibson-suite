// Shared base64url codec for compact URL payloads — URL-safe, no padding.
// (shareCompare.js has its own private copy for the compare share route;
// new payload helpers should use this module.)

export const b64urlEncode = (str) => {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const b64urlDecode = (str) => {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

// All active layer names for a tab, one per line with a separator between
// them — used for the info tooltips in the compare / grid / timelapse views.
// The tooltip renders with white-space: pre-line so the \n become real lines.
export const LAYER_NAME_SEPARATOR = '\n────────\n'

export const layerNamesForTab = (tab, layerById) => {
  if (!tab) return ''
  const ids = [
    ...(tab.activeBySection?.imagery || []),
    ...(tab.activeBySection?.base || []),
    ...(tab.activeBySection?.reference || [])
  ]
  const names = ids.map(id => layerById.get(id)?.name).filter(Boolean)
  return names.length ? names.join(LAYER_NAME_SEPARATOR) : (tab.label || '')
}
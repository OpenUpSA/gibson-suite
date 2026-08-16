import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'

// Inline-rename label used in the view tab bars (layers + layout sidebars).
// Click the pencil (or double-click the label) to edit; Enter/blur commits,
// Escape cancels. The new name is stored on the tab object, so it shows up
// everywhere the view name is used (tab bars, captions, exports...).
const EditableTabLabel = ({ label, fallback, onRename }) => {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(label || fallback)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEditing = () => {
    setValue(label || fallback)
    setEditing(true)
  }

  const commit = () => {
    const trimmed = value.trim()
    if (trimmed && trimmed !== label) onRename(trimmed)
    setEditing(false)
  }

  const cancel = () => {
    setValue(label || fallback)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="tabbed-sidebar-tab-rename-input"
        value={value}
        maxLength={40}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') cancel()
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <span className="tabbed-sidebar-tab-label-wrap">
      <span
        className="tabbed-sidebar-tab-label"
        title="Double-click to rename"
        onDoubleClick={(e) => { e.stopPropagation(); startEditing() }}
      >
        {label || fallback}
      </span>
      <button
        type="button"
        className="tabbed-sidebar-tab-rename"
        title="Rename view"
        onClick={(e) => { e.stopPropagation(); startEditing() }}
      >
        <Icon icon="fluent:edit-12-regular" width="10" height="10" />
      </button>
    </span>
  )
}

export default EditableTabLabel

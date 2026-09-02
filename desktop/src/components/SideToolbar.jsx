import { useRef } from 'react'
import { Icon } from '@iconify/react'
import './SideToolbar.css'

const TOOLS = [
  { id: 'layers', icon: 'fluent:layer-20-filled', title: 'Layers' },
  { id: 'layout', icon: 'fluent:grid-20-filled', title: 'Grid layout' },
  { id: 'compare', icon: 'fluent:split-hint-20-filled', title: 'Compare views' },
  { id: 'timelapse', icon: 'fluent:filmstrip-20-filled', title: 'Timelapse GIF' }
]

const SideToolbar = ({ activeTool, onToolClick, onSaveProject, onLoadProject, onResetAll, onLogoClick }) => {
  const projectInputRef = useRef(null)

  const handleProjectFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file || !onLoadProject) return
    try {
      const text = await file.text()
      if (!onLoadProject(text)) {
        window.alert("Couldn't read that file — is it a Gibson project?")
      }
    } catch (err) {
      console.error('Failed to read project file:', err)
      window.alert("Couldn't read that file — is it a Gibson project?")
    }
  }

  return (
    <div className="side-toolbar">
      <img
        src="/gibson-icon.png"
        alt="Gibson"
        className="side-toolbar-logo"
        data-tour="logo"
        onClick={onLogoClick}
        title="About Gibson"
        role="button"
      />
      {TOOLS.map(tool => (
        <button
          key={tool.id}
          type="button"
          className={`side-tool-btn${activeTool === tool.id ? ' active' : ''}`}
          onClick={() => onToolClick(tool.id)}
          title={tool.title}
          data-tour={`tool-${tool.id}`}
        >
          <Icon icon={tool.icon} width="24" height="24" />
        </button>
      ))}
      <div className="side-toolbar-bottom">
        {onSaveProject && (
          <button
            type="button"
            className="side-tool-btn"
            onClick={onSaveProject}
            title="Save project — download everything (views, grid, compare, timelapse) as a file"
          >
            <Icon icon="fluent:save-20-regular" width="22" height="22" />
          </button>
        )}
        {onLoadProject && (
          <button
            type="button"
            className="side-tool-btn"
            onClick={() => projectInputRef.current?.click()}
            title="Open project — load a previously saved Gibson project file"
          >
            <Icon icon="fluent:folder-open-20-regular" width="22" height="22" />
          </button>
        )}
        {onLoadProject && (
          <input
            ref={projectInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={handleProjectFile}
          />
        )}
        {onResetAll && (
          <button
            type="button"
            className="side-tool-btn side-tool-reset"
            onClick={onResetAll}
            title="Reset everything — clear all saved views, layouts and compare settings"
            data-tour="tool-reset"
          >
            <Icon icon="fluent:arrow-reset-20-regular" width="20" height="20" />
          </button>
        )}
      </div>
    </div>
  )
}

export default SideToolbar

import { Icon } from '@iconify/react'
import './SideToolbar.css'

const TOOLS = [
  { id: 'layers', icon: 'fluent:layer-20-filled', title: 'Layers' },
  { id: 'layout', icon: 'fluent:grid-20-filled', title: 'Grid layout' },
  { id: 'compare', icon: 'fluent:split-hint-20-filled', title: 'Compare views' },
  { id: 'timelapse', icon: 'fluent:filmstrip-20-filled', title: 'Timelapse GIF' }
]

const SideToolbar = ({ activeTool, onToolClick }) => (
  <div className="side-toolbar">
    <img src="/gibson-icon.png" alt="Gibson" className="side-toolbar-logo" />
    {TOOLS.map(tool => (
      <button
        key={tool.id}
        type="button"
        className={`side-tool-btn${activeTool === tool.id ? ' active' : ''}`}
        onClick={() => onToolClick(tool.id)}
        title={tool.title}
      >
        <Icon icon={tool.icon} width="24" height="24" />
      </button>
    ))}
  </div>
)

export default SideToolbar

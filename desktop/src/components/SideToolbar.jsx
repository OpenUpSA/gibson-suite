import { Icon } from '@iconify/react'
import './SideToolbar.css'

const TOOLS = [
  { id: 'layers', icon: 'fluent:layer-20-filled', title: 'Layers' }
]

const SideToolbar = ({ activeTool, onToolClick }) => (
  <div className="side-toolbar">
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

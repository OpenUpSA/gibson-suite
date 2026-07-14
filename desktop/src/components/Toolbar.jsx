import React from 'react'
import { Icon } from '@iconify/react'
import './Toolbar.css'
import { APP_VERSION } from '../config/version'

const Toolbar = ({ isLayersView, onTogglePanel, isSplitView, onToggleSplit, isCompareView, onToggleCompare, isExportPanelVisible, onToggleExportPanel, onToggleAbout, isTimelapsePanelVisible, onToggleTimelapsePanel, isSearchPanelVisible, onToggleSearchPanel, isZenMode, onToggleZen, isTileUrlPanelVisible, onToggleTileUrlPanel, isGlobe, onToggleGlobe, isFeedbackPanelVisible, onToggleFeedbackPanel }) => {
  return (
    <div className="toolbar">
      <div className="toolbar-buttons">
        <button
          className="toolbar-btn toolbar-globe"
          onClick={onToggleAbout}
          title={`About Gibson v${APP_VERSION}`}
        >
          <Icon icon="fluent:globe-28-regular" width="30" height="30" />
        </button>

        <button
          className={`toolbar-btn ${isSearchPanelVisible ? 'active' : ''}`}
          onClick={onToggleSearchPanel}
          title="Search layers"
        >
          <Icon icon="fluent:search-20-filled" width="24" height="24" />
        </button>

        <button
          className={`toolbar-btn ${isLayersView ? 'active' : ''}`}
          onClick={onTogglePanel}
          title="Toggle layers panel"
        >
          <Icon icon="fluent:layer-20-filled" width="24" height="24" />
        </button>

        <button
          className={`toolbar-btn ${isSplitView ? 'active' : ''}`}
          onClick={onToggleSplit}
          title="Split view"
        >
          <Icon icon="fluent:split-vertical-20-filled" width="24" height="24" />
        </button>

        <button
          className={`toolbar-btn ${isCompareView ? 'active' : ''}`}
          onClick={onToggleCompare}
          title="Compare view"
        >
          <Icon icon="fluent:split-hint-20-filled" width="24" height="24" />
        </button>

        <button
          className={`toolbar-btn ${isTimelapsePanelVisible ? 'active' : ''}`}
          onClick={onToggleTimelapsePanel}
          title="Timelapse"
        >
          <Icon icon="fluent:timer-20-filled" width="24" height="24" />
        </button>

        <button
          className={`toolbar-btn ${isTileUrlPanelVisible ? 'active' : ''}`}
          onClick={onToggleTileUrlPanel}
          title="Tile URL"
        >
          <Icon icon="fluent:link-20-filled" width="24" height="24" />
        </button>

        <div className="toolbar-divider" />

        <button
          className={`toolbar-btn ${isExportPanelVisible ? 'active' : ''}`}
          onClick={onToggleExportPanel}
          title="Export"
        >
          <Icon icon="fluent:image-20-filled" width="24" height="24" />
        </button>

        <button
          className={`toolbar-btn ${isGlobe ? 'active' : ''}`}
          onClick={onToggleGlobe}
          title={isGlobe ? 'Switch to flat map' : 'Switch to globe'}
        >
          <Icon icon={isGlobe ? 'fluent:globe-20-filled' : 'fluent:map-20-filled'} width="24" height="24" />
        </button>

        <button
          className={`toolbar-btn ${isZenMode ? 'active' : ''}`}
          onClick={onToggleZen}
          title={isZenMode ? 'Exit zen mode' : 'Zen mode'}
        >
          <Icon icon={isZenMode ? 'fluent:eye-20-filled' : 'fluent:eye-off-20-filled'} width="24" height="24" />
        </button>

        <div className="toolbar-divider" />

        <button
          className={`toolbar-btn ${isFeedbackPanelVisible ? 'active' : ''}`}
          onClick={onToggleFeedbackPanel}
          title="Feedback"
        >
          <Icon icon="fluent:chat-bubbles-question-20-filled" width="24" height="24" />
        </button>
      </div>
    </div>
  )
}

export default Toolbar

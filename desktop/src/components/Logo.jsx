import React from 'react'
import './Logo.css'
import { APP_VERSION } from '../config/version'

const Logo = ({ secondary = false }) => {
  // Use specific logo for secondary (ADH logo)
  let logoSrc = null
  
  if (secondary) {
    // Use ADH logo for secondary
    try {
      logoSrc = new URL('../assets/adh-logo.svg', import.meta.url).href
    } catch (e) {
      // ADH logo should exist
    }
  } else {
    // Use Gibson logo for primary
    try {
      logoSrc = new URL('../assets/GIBSON.png', import.meta.url).href
    } catch (e) {
      // Will use text fallback
    }
  }

  const logoContent = logoSrc ? (
    <>
      <img src={logoSrc} alt={secondary ? "Africa Data Hub" : "Logo"} className="logo-image" />
      {!secondary && <div className="logo-subtitle">GIBS Observations Navigator</div>}
    </>
  ) : (
    !secondary && (
      <div className="logo-placeholder">
        <div className="logo-text">GIBS</div>
        <div className="logo-subtext">Viewer</div>
      </div>
    )
  )

  return (
    <div className={`logo-container ${secondary ? 'secondary' : ''}`}>
      {secondary && logoSrc ? (
        <a href="https://www.africadatahub.org/" target="_blank" rel="noopener noreferrer">
          {logoContent}
        </a>
      ) : (
        <div className="logo-content" title={`GIBS Observations Navigator v${APP_VERSION}`}>
          {logoContent}
        </div>
      )}
    </div>
  )
}

export default Logo

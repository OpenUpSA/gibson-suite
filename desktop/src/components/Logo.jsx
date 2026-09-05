import React from 'react'
import adhLogo from '../assets/adh-logo.svg'
import './Logo.css'
import { APP_VERSION } from '../config/version'

// Logo block for the welcome / about modal. Primary shows the Gibson logo
// (served from /public/gibson-logo.png), secondary shows the ADH logo
// linking to africadatahub.org.
const Logo = ({ secondary = false }) => {
  if (secondary) {
    return (
      <div className="logo-container secondary">
        <a href="https://www.africadatahub.org/" target="_blank" rel="noopener noreferrer">
          <img src={adhLogo} alt="Africa Data Hub" className="logo-image" />
        </a>
      </div>
    )
  }

  return (
    <div className="logo-container">
      <div className="logo-content" title={`GIBS Observations Navigator v${APP_VERSION}`}>
        <img src="/gibson-logo.png" alt="Logo" className="logo-image" />
        <div className="logo-subtitle">GIBS Observations Navigator</div>
      </div>
    </div>
  )
}

export default Logo

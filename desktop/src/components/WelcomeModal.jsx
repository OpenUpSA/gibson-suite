import React from 'react'
import Logo from './Logo'
import './IntroModal.css'
import './About.css'
import './WelcomeModal.css'
import { APP_VERSION } from '../config/version'

// Welcome / about screen — shown on first load and whenever the logo is
// clicked. Reuses the original IntroModal copy, plus a "take the tour"
// button that launches the guided walkthrough.
const WelcomeModal = ({ isOpen, onClose, onStartTour }) => {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="about-close" onClick={onClose}>×</button>
        <div className="about-logo"><Logo /></div>
        <h1 className="about-version-heading">
          <span className="about-version">v{APP_VERSION}</span>
        </h1>

        <div className="modal-body">
          <p>
            The Global Imagery Browse Services (GIBS) provides access to near real-time satellite imagery from NASA's Earth observing satellites. GIBSON is a curated list of imagery that have proved useful and relevant for journalists and researchers focusing on climate, environmental and social issues in Africa.
          </p>

          <p>
            Explore a wide range of Earth observation layers including:
          </p>

          <ul>
            <li><strong>Atmospheric Data:</strong> Monitor aerosols, water vapor, and cloud properties</li>
            <li><strong>Land Surface:</strong> Track vegetation health and land cover changes</li>
            <li><strong>Temperature:</strong> Observe sea and land surface temperatures</li>
            <li><strong>True Color Imagery:</strong> View corrected reflectance from multiple satellites</li>
          </ul>

          <p>
            Select a layer from the sidebar, choose a date, and explore earth from space.
            The map provides high-resolution imagery updated daily. Each layer includes a legend
            showing the data scale and units.
          </p>

          <div className="modal-footer welcome-actions">
            <button className="btn-primary" onClick={onClose}>
              Start Exploring
            </button>
            {onStartTour && (
              <button className="btn-secondary welcome-tour-btn" onClick={onStartTour}>
                Take the tour
              </button>
            )}
          </div>
          <div className="modal-adh-logo">
            <Logo secondary />
          </div>
        </div>
      </div>
    </div>
  )
}

export default WelcomeModal

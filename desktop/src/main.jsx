import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Globe from './components/Globe'
import CompareShare from './components/CompareShare'
import TooltipProvider from './components/TooltipProvider'
import './index.css'

// Lazy-loaded so the legacy app's CSS (App.css) only loads when visiting
// /legacy — its rules (e.g. .sidebar-section-title) would otherwise collide
// with the new Globe page's Sidebar.css on every route.
const App = lazy(() => import('./_legacy/App'))
const GibsCapabilities = lazy(() => import('./_legacy/pages/GibsCapabilities'))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          {/* New minimal rebuild — just the globe and a base layer */}
          <Route path="/" element={<Globe />} />
          {/* Shared minimalist compare view (no toolbars) */}
          <Route path="/share/compare/:payload" element={<CompareShare />} />
          {/* Old app kept for reference while we rebuild */}
          <Route path="/legacy" element={<App />} />
          <Route path="/gibs" element={<GibsCapabilities />} />
          <Route path="*" element={<Globe />} />
        </Routes>
      </Suspense>
      <TooltipProvider />
    </BrowserRouter>
  </React.StrictMode>,
)

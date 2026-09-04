import { Joyride, STATUS } from 'react-joyride'
import './TutorialTour.css'

// Guided tour steps — each targets an element via its data-tour attribute.
// Selectors stay stable even if CSS class names change. skipBeacon makes the
// tooltip appear immediately instead of a pulsing dot that needs a click.
const STEPS = [
  {
    target: '[data-tour="logo"]',
    title: 'Welcome to Gibson',
    content: 'This is the GIBSON satellite imagery viewer. Click the logo anytime to see this welcome / about screen again.',
    placement: 'right',
    skipBeacon: true
  },
  {
    target: '[data-tour="tool-layers"]',
    title: 'Layers',
    content: 'Browse the layer library — add or remove satellite imagery, reference overlays and base layers, and change dates.',
    placement: 'right',
    skipBeacon: true
  },
  {
    target: '[data-tour="sidebar"]',
    title: 'The layers sidebar',
    content: 'Your active layers live here, grouped by type. Toggle visibility, reorder them, tweak quality and opacity, and pick a date for the view.',
    placement: 'right',
    skipBeacon: true
  },
  {
    target: '[data-tour="tool-layout"]',
    title: 'Grid layout',
    content: 'Arrange multiple views side-by-side in a grid. Assign a view to each cell, set spans, add captions, and export the whole grid as an image.',
    placement: 'right',
    skipBeacon: true
  },
  {
    target: '[data-tour="tool-compare"]',
    title: 'Compare views',
    content: 'Overlay two views on the map with a draggable slider — great for spotting change between two dates. Share a link or save a project from here too.',
    placement: 'right',
    skipBeacon: true
  },
  {
    target: '[data-tour="tool-timelapse"]',
    title: 'Timelapse GIF',
    content: 'Draw a box on the map, pick a date range, and export an animated GIF showing how the imagery changes over time.',
    placement: 'right',
    skipBeacon: true
  },
  {
    target: '[data-tour="tool-reset"]',
    title: 'Reset',
    content: 'Flush everything — saved views, layouts, compare settings — and start fresh. It asks for confirmation first.',
    placement: 'right',
    skipBeacon: true
  },
  {
    target: '[data-tour="map"]',
    title: 'The map',
    content: 'Pan and zoom to explore. Everything you add in the sidebar renders here, and views remember their own position.',
    placement: 'top',
    skipBeacon: true
  }
]

const TutorialTour = ({ run, onFinish }) => {
  const handleCallback = ({ status, action }) => {
    // Close on Skip, Close, or reaching the end
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status) || action === 'close') {
      onFinish?.()
    }
  }

  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous
      showProgress
      showSkipButton
      disableOverlayClose
      hideCloseButton={false}
      spotlightPadding={6}
      callback={handleCallback}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: '#4FC3D9',
          textColor: 'rgba(255, 255, 255, 0.9)',
          backgroundColor: '#202020',
          arrowColor: '#202020',
          overlayColor: 'rgba(0, 0, 0, 0.55)'
        },
        buttonNext: { backgroundColor: '#4FC3D9', color: '#1a1a1a', fontWeight: 700 },
        buttonBack: { color: 'rgba(255, 255, 255, 0.8)' },
        buttonSkip: { color: 'rgba(255, 255, 255, 0.55)' },
        tooltipTitle: { fontSize: 15, fontWeight: 700 },
        tooltipContent: { fontSize: 12.5, lineHeight: 1.5 },
        tooltipFooter: { marginTop: 10 }
      }}
    />
  )
}

export default TutorialTour

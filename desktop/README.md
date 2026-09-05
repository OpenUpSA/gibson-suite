# Gibson - NASA GIBS Satellite Imagery Viewer

A modern React application for exploring NASA GIBS satellite imagery with an interactive map interface and high-resolution timeline navigation.

## Features

- 🗺️ **Interactive MapLibre GL map** with 50+ NASA GIBS satellite layers
- 📅 **Scrollable timeline** with 15+ years of historical data (2010-2025)
- 🎯 **High-resolution navigation** - drag scrubber, click timeline, or use date dropdowns
- 🎨 **Organized layer categories** - Vegetation, Temperature, Precipitation, Fire, Ocean, and more
- 👁️ **Collapsible sidebar** for distraction-free viewing
- ℹ️ **Layer information** - descriptions, metadata, and technical details
- � **About page** - project documentation and useful resources
- 📊 **Footer panel** - layer metadata and legend display
- 📱 **Fully responsive** design for desktop, tablet, and mobile

## Quick Start

### Installation

```bash
yarn install
# or
npm install
```

### Development

```bash
yarn dev
# or
npm run dev
```

The app will open at `http://localhost:5173`

### Build for Production

```bash
yarn build
# or
npm run build
```

### Preview Production Build

```bash
yarn preview
# or
npm run preview
```

## Configuration

All layer configurations are stored in `src/config/layers.json`. You can easily add, remove, or modify layers without touching the code.

### Layer Configuration Structure

```json
{
  "categories": {
    "Category Name": [
      {
        "id": "GIBS_Layer_ID",
        "name": "Display Name",
        "description": "Detailed layer description with resolution and use cases",
        "tileMatrixSet": "GoogleMapsCompatible_Level9",
        "time": "2024-11-20"
      }
    ]
  },
  "mapSettings": {
    "center": [-28.5, 24.0],
    "zoom": 4,
    "minZoom": 2,
    "maxZoom": 9
  },
  "wmtsBaseUrl": "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best",
  "format": "image/png"
}
```

### Adding New Layers

1. Open `src/config/layers.json`
2. Find or create a category (e.g., "Temperature", "Vegetation & Agriculture", "Fire & Thermal")
3. Add a new layer object with:
   - `id`: The GIBS layer identifier (e.g., "MODIS_Terra_Land_Surface_Temp_Day")
   - `name`: User-friendly display name
   - `description`: Detailed description including resolution and use cases
   - `tileMatrixSet`: The appropriate tile matrix set (GoogleMapsCompatible_Level3 through Level13)
   - `time`: Date in YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ format

### Available Layer Categories

- **Corrected Reflectance** - True color satellite imagery
- **Vegetation & Agriculture** - NDVI, EVI, crop health indicators
- **Fire & Thermal** - Active fire detection and thermal anomalies
- **Temperature** - Air and land surface temperature
- **Precipitation & Soil Moisture** - Rainfall and soil moisture data
- **Water Vapor & Clouds** - Atmospheric water content and cloud properties
- **Ocean & Water Quality** - Sea surface temperature, chlorophyll
- **Snow & Ice** - Snow cover and ice extent
- **Land Cover & Use** - Surface type classifications
- **Aerosols & Air Quality** - Dust, smoke, air pollution

### Finding Layer IDs

Visit the [NASA GIBS Capabilities Document](https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml) to find available layers and their tile matrix sets.

### Timelapse date availability (`public/layer-dates.json`)

The timelapse tool needs to know which dates each layer has imagery for. That
lives in the WMTS capabilities document, which is huge (5+ MB) and **times out
when proxied through Netlify (504 Gateway Timeout)**. Instead, the app ships a
pre-generated static JSON — `public/layer-dates.json` — with the raw TIME
dimension values per layer, served straight from the CDN (no proxy, no timeout).

**It refreshes automatically — no manual step.** The `prebuild` hook
(`work/refresh_layer_dates.mjs`) runs before every `vite build` (i.e. every
Netlify deploy): if the committed JSON's data is older than a day it downloads
the current capabilities and regenerates the JSON via `work/gen_layer_dates.py`.
If GIBS is unreachable at build time it warns and keeps the committed copy —
the build never fails because of a refresh.

As a second safety net, the client (`src/utils/gibsCaps.js`) falls back to
fetching the live capabilities XML **directly from GIBS** (CORS-enabled) when
the JSON is missing a layer or its data is stale — so new layers and recent
dates still work between deploys.

To regenerate manually (e.g. offline):

```sh
curl -o work/wmts_caps.xml \
  https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml
python3 work/gen_layer_dates.py
```

Commit the updated `public/layer-dates.json`; the build copies it to `dist/`
automatically. The client expands the intervals (see `src/utils/gibsCaps.js`).

## Project Structure

```
gibson/
├── src/
│   ├── components/
│   │   ├── About.jsx            # About page with project info and resources
│   │   ├── About.css
│   │   ├── DebugPanel.jsx       # Footer panel with layer metadata and legend
│   │   ├── DebugPanel.css
│   │   ├── IntroModal.jsx       # Welcome modal on first visit
│   │   ├── IntroModal.css
│   │   ├── LayerInfo.jsx        # Layer information modal
│   │   ├── LayerInfo.css
│   │   ├── LayerSelector.jsx    # Sidebar layer selection with categories
│   │   ├── LayerSelector.css
│   │   ├── Legend.jsx           # Layer legend/color scale display
│   │   ├── Legend.css
│   │   ├── Logo.jsx             # Application logo component
│   │   ├── Logo.css
│   │   ├── Map.jsx              # MapLibre GL map component
│   │   ├── Map.css
│   │   ├── MapFooter.jsx        # (Legacy - replaced by TimeBar)
│   │   ├── MapFooter.css
│   │   ├── MapInfo.jsx          # Map hover info (lat/lng)
│   │   ├── MapInfo.css
│   │   ├── TimeBar.jsx          # Scrollable timeline with date navigation
│   │   └── TimeBar.css
│   ├── config/
│   │   └── layers.json          # Layer configuration (50+ NASA GIBS layers)
│   ├── assets/
│   │   ├── adh-logo.svg         # Africa Data Hub logo
│   │   ├── gibson-logo.png      # Gibson logo
│   │   └── README.md
│   ├── App.jsx                  # Main application component
│   ├── App.css
│   ├── main.jsx                 # React entry point
│   └── index.css
├── index.html                   # HTML template
├── package.json
├── vite.config.js              # Vite build configuration
└── README.md
```

## Usage

### Navigation

1. **Select a layer** - Click any layer name in the sidebar to display it on the map
2. **Navigate time** - Use the timeline at the bottom to:
   - Drag the orange scrubber to any date
   - Click anywhere on the timeline to jump to that date
   - Use previous/next day buttons (◀ ▶)
   - Select year/month/day from dropdown menus
   - Scroll horizontally to browse 15+ years of data
3. **Toggle sidebar** - Click the ◀/▶ button to show/hide the sidebar for full-screen viewing
4. **Browse categories** - Click category headers to expand/collapse layer groups
5. **View layer info** - Click "About This Layer" to see detailed descriptions and metadata
6. **Get help** - Click the "About" button for project information and useful links

### Timeline Features

- **15+ years of data** - Browse satellite imagery from 2010 to present
- **High resolution** - 5 pixels per day for precise navigation
- **Smart scrolling** - Timeline auto-scrolls to keep selected date visible
- **Visual markers** - Daily ticks, weekly highlights, monthly labels, year markers (orange)
- **Multiple navigation modes** - drag, click, buttons, or dropdowns

### Map Interaction

- **Pan** - Click and drag to move around
- **Zoom** - Use mouse wheel or +/- controls
- **Layer opacity** - Layers render at 80% opacity by default
- **Base map** - OpenStreetMap provides context

## Technologies

- **React 18** - Modern UI framework with hooks
- **Vite** - Fast build tool and dev server
- **MapLibre GL JS v4.7.1** - High-performance vector and raster mapping library
- **NASA GIBS** - Global Imagery Browse Services for satellite data
- **OpenStreetMap** - Base map tiles for geographic context

## Troubleshooting

### Layers not loading

1. **Check the browser console** for specific error messages
2. **Verify the layer ID** exists in the [GIBS capabilities document](https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml)
3. **Ensure correct tile matrix set** - Different layers support different zoom levels (Level3-Level13)
4. **Confirm date availability** - Not all layers have data for all dates
5. **Check network connectivity** - GIBS tiles require internet access

### Console shows 400/404 tile errors

Some layers may not have data for all dates or zoom levels. This is normal behavior:
- Historical layers may only have monthly or weekly data
- Some layers start in 2012, others in 2000 or earlier
- Near real-time layers may have a 1-2 day delay
- Try adjusting the date using the timeline to find available imagery

### Timeline not scrolling smoothly

- Ensure you're using a modern browser (Chrome, Firefox, Safari, Edge)
- Try reducing the number of browser tabs if performance is slow
- On mobile, use touch gestures to scroll the timeline

### Sidebar not visible on mobile

- The sidebar automatically hides on screens smaller than 640px
- Use the ◀/▶ toggle button to show/hide the sidebar
- When sidebar is visible on mobile, the map is hidden to save space

## Development Notes

### Architecture

- **Component-based design** - Modular React components for easy maintenance
- **JSON configuration** - All layers defined in `layers.json` for non-developer editing
- **State management** - React hooks for date, layer, and UI state
- **Responsive CSS** - Mobile-first design with media queries
- **MapLibre GL** - Hardware-accelerated rendering for smooth performance

### Key Components

- **TimeBar** - 15-year scrollable timeline with auto-scroll and multi-input navigation
- **Map** - MapLibre GL integration with GIBS WMTS tiles
- **LayerSelector** - Collapsible categories with 50+ organized layers
- **DebugPanel** - Footer showing layer ID, date, scale, and legend
- **IntroModal** - First-visit welcome screen
- **About** - Project documentation and resource links
- **LayerInfo** - Detailed layer descriptions and metadata

## License

This project uses NASA GIBS data which is freely available for use. The imagery is in the public domain.

## Resources

### NASA GIBS
- [NASA GIBS Documentation](https://nasa-gibs.github.io/gibs-api-docs/)
- [GIBS Available Imagery Products](https://wiki.earthdata.nasa.gov/display/GIBS/GIBS+Available+Imagery+Products)
- [GIBS Capabilities Document](https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml)
- [NASA Worldview](https://worldview.earthdata.nasa.gov/) - Official NASA imagery viewer

### Mapping Libraries
- [MapLibre GL JS Documentation](https://maplibre.org/maplibre-gl-js/docs/)
- [MapLibre GL JS API Reference](https://maplibre.org/maplibre-gl-js/docs/API/)

### Development
- [React Documentation](https://react.dev/)
- [Vite Guide](https://vitejs.dev/guide/)

## Credits

Built by Africa Data Hub as part of the Gibson project to provide accessible satellite imagery visualization for the African continent and beyond.

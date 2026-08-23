import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The same proxy config must be provided for BOTH the dev server and the
  // preview server: `server.proxy` only applies to `vite dev`, while a built
  // app served via `vite preview` (npm run preview/start) needs `preview.proxy`.
  // Without it, requests like /wmts-capabilities/WMTSCapabilities.xml are
  // treated as static files in dist/ and return 404.
  server: {
    port: 3000,
    proxy: {
      '/colormaps': {
        target: 'https://gibs.earthdata.nasa.gov/colormaps/v1.3',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/colormaps/, '')
      },
      '/wmts-capabilities': {
        target: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/wmts-capabilities/, '')
      }
    }
  },
  preview: {
    port: 3000,
    proxy: {
      '/colormaps': {
        target: 'https://gibs.earthdata.nasa.gov/colormaps/v1.3',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/colormaps/, '')
      },
      '/wmts-capabilities': {
        target: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/wmts-capabilities/, '')
      }
    }
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
  }
})

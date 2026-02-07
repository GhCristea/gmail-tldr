import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [crx({ manifest })],
  publicDir: 'static',
  build: { rollupOptions: { input: { offscreen: 'static/offscreen.html', popup: 'static/popup.html' } } },
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } }
})

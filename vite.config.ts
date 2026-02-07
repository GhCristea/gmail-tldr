import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        offscreen: 'static/offscreen.html'
      }
    }
  },
  optimizeDeps: {
    include: ['sql.js'],
    exclude: ['@crxjs/vite-plugin']
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});

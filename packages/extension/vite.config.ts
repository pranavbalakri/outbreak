import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.js';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    port: 5174,
    strictPort: true,
    hmr: { port: 5174 },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // Chrome MV3 service workers run in isolation from the page bundle.
      // crxjs handles the entry wiring from the manifest.
    },
  },
});

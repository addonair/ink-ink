import { fileURLToPath, URL } from 'node:url';

import { crx } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';

// Explicit extension: Vite's native config loader (the planned default in a
// future major) cannot resolve extensionless imports here.
import manifest from './manifest.config.ts';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [crx({ manifest })],
  resolve: {
    alias: {
      '@core': r('./src/core'),
      '@adapters': r('./src/adapters'),
      '@overlay': r('./src/overlay'),
      '@state': r('./src/state'),
      '@compose': r('./src/compose'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Extension review is easier to argue when the shipped bundle is legible.
    minify: false,
    sourcemap: true,
  },
  server: {
    // CRXJS needs a stable port for its HMR client inside the content script.
    port: 5173,
    strictPort: true,
  },
});

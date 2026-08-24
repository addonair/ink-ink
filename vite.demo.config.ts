import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Standalone config for the demo page.
 *
 * Separate from `vite.config.ts` because that one is owned by the CRXJS plugin,
 * which rewrites the build around the extension manifest. The demo is an
 * ordinary web page and wants none of that.
 */
export default defineConfig({
  root: r('./demo'),
  resolve: {
    alias: {
      '@core': r('./src/core'),
      '@adapters': r('./src/adapters'),
      '@overlay': r('./src/overlay'),
      '@state': r('./src/state'),
      '@compose': r('./src/compose'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    open: false,
  },
  build: {
    outDir: r('./dist-demo'),
    emptyOutDir: true,
  },
});

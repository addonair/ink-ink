import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@core': r('./src/core'),
      '@adapters': r('./src/adapters'),
      '@overlay': r('./src/overlay'),
      '@state': r('./src/state'),
      '@compose': r('./src/compose'),
    },
  },
  test: {
    /**
     * Node, not jsdom, by default.
     *
     * `core/`, `state/`, and `compose/` are pure by design (NFR-15), so booting
     * a DOM for them costs seconds per file and buys nothing. A test that does
     * need the DOM opts in with a docblock at the top of the file:
     *
     *     // @vitest-environment jsdom
     *
     * This also means an accidental DOM dependency in core fails the test run
     * instead of passing quietly — the lint boundary and this default reinforce
     * each other.
     */
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /**
     * Process CSS so `overlay.css?inline` returns the real stylesheet rather
     * than an empty string. Without this the NFR-11 assertion — that styles are
     * injected into the shadow root — passes vacuously against ''.
     */
    css: true,
    coverage: {
      include: ['src/core/**', 'src/compose/**', 'src/state/**'],
    },
  },
});

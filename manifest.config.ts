import { defineManifest } from '@crxjs/vite-plugin';

import pkg from './package.json' with { type: 'json' };
import { matchPatternsFor, SITES } from './src/adapters/sites.ts';

/**
 * Host allowlist (FR-1).
 *
 * Generated from `SITES`, the same list the adapter registry is built from, so
 * the manifest and the registry cannot disagree. Adding a site is one entry in
 * `src/adapters/sites.ts`.
 *
 * Still an explicit allowlist of named domains — never `<all_urls>` — so the
 * extension only ever loads where it has a reason to (NFR-6). The widening from
 * one domain to six is recorded in `.claude/decisions/multi-site-support.md`.
 */
export const HOST_MATCHES = matchPatternsFor(SITES);

export default defineManifest({
  manifest_version: 3,
  name: 'ink-ink',
  version: pkg.version,
  description: pkg.description,

  icons: {
    16: 'public/icons/icon-16.png',
    32: 'public/icons/icon-32.png',
    48: 'public/icons/icon-48.png',
    128: 'public/icons/icon-128.png',
  },

  /**
   * `storage` only — it persists the user-editable trailing instruction
   * (spec section 5.6) and the toggle preference. Nothing else.
   *
   * Deliberately absent: host_permissions, activeTab, scripting, tabs,
   * cookies, webRequest. NFR-5/6/7 are enforced by this list staying short.
   * Adding anything here requires a decision record explaining why.
   */
  permissions: ['storage'],

  content_scripts: [
    {
      matches: [...HOST_MATCHES],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],

  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },

  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },

  action: {
    default_title: 'ink-ink',
  },
});

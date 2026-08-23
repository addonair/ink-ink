import { defineManifest } from '@crxjs/vite-plugin';

import pkg from './package.json' with { type: 'json' };

/**
 * Host allowlist (FR-1).
 *
 * MVP ships one host. Adding an entry here without also adding a matching
 * adapter under `src/adapters/` is a no-op: the registry returns null for
 * unknown hosts and the content script stays inert (NFR-9).
 *
 * TODO(verify): confirm these patterns against a live DeepSeek session before
 * the first real release. Spec section 8 flags host markup as the top risk.
 */
export const HOST_MATCHES = ['https://chat.deepseek.com/*'] as const;

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

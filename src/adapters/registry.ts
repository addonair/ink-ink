/**
 * Adapter lookup (NFR-10).
 *
 * Built from `SITES`, which is the same list the manifest's host allowlist is
 * generated from. They used to be maintained separately, and adding a host to
 * one without the other silently did nothing — a chance to get it wrong once
 * per site. Supporting a new site is now a single entry in `sites.ts`, with no
 * core logic changes.
 */

import { createChatAdapter } from './generic';
import { SITES } from './sites';
import type { SiteAdapter } from './types';

const ADAPTERS: readonly SiteAdapter[] = SITES.map(createChatAdapter);

/**
 * Find the adapter for a location, or null.
 *
 * Returning null must leave the extension inert rather than erroring — the
 * content script can be injected on a host whose adapter was removed, and a
 * broken adapter must never break someone's chat page (NFR-9).
 */
export function adapterFor(url: URL): SiteAdapter | null {
  for (const adapter of ADAPTERS) {
    try {
      if (adapter.matches(url)) return adapter;
    } catch {
      // A throwing matcher disqualifies itself; it never takes the page down.
      continue;
    }
  }
  return null;
}

export function allAdapters(): readonly SiteAdapter[] {
  return ADAPTERS;
}

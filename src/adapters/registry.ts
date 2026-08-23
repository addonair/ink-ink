/**
 * Adapter lookup (NFR-10).
 *
 * Adding a host site means writing an adapter and adding it to this array plus
 * the manifest's HOST_MATCHES. No core logic changes.
 */

import { deepseekAdapter } from './deepseek';
import type { SiteAdapter } from './types';

const ADAPTERS: readonly SiteAdapter[] = [deepseekAdapter];

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

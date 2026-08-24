/**
 * The demo's adapter — the real one, with only the host check replaced.
 *
 * This used to re-implement message discovery, and it immediately proved why
 * that is a bad idea: when the demo markup was changed to nest an assistant
 * turn the way real chat sites do, production code handled it and the demo's
 * copy did not, so the demo failed on a bug that was already fixed. A second
 * implementation of the same thing is a second thing to get wrong.
 *
 * Building on `createChatAdapter` means drawing on the demo exercises the code
 * that actually ships: the same message discovery, de-nesting, MCQ parsing,
 * scroll-root detection, composer discovery and insertion.
 */

import { createChatAdapter } from '@adapters/generic';
import type { SiteAdapter } from '@adapters/types';

const base = createChatAdapter({
  id: 'demo',
  label: 'Demo page',
  // The demo is served from localhost, so the host check is overridden below
  // rather than pretending this is a real site.
  domains: ['localhost'],
  composerSelectors: ['#composer'],
});

export const demoAdapter: SiteAdapter = {
  ...base,
  matches: (): boolean => true,
};

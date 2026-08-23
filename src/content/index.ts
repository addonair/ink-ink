/**
 * Content script entry point.
 *
 * This file runs inside someone's chat page, so unlike the rest of the
 * scaffold it contains no throwing stubs. NFR-9 is absolute here: if anything
 * is missing or unrecognised, the extension does nothing and the page is
 * untouched. Breaking the page the user is trying to read is the single worst
 * outcome this project can produce.
 */

import { adapterFor } from '@adapters/registry';
import type { SiteAdapter } from '@adapters/types';

const LOG_PREFIX = '[ink-ink]';

function bootstrap(): void {
  const adapter = adapterFor(new URL(window.location.href));

  if (adapter === null) {
    // Injected on a host with no adapter. Nothing to do — stay inert (NFR-9).
    return;
  }

  mount(adapter);
}

function mount(adapter: SiteAdapter): void {
  // SCAFFOLD. The real implementation wires up, in this order:
  //
  //   1. a shadow root host appended to document.body, so overlay styles
  //      cannot leak into the page (NFR-11)
  //   2. InkToggle, defaulting to OFF (FR-4)
  //   3. InkCanvas, pointer-events: none until enabled (FR-3)
  //   4. pointer listeners filtered through core's shouldCapture (FR-5/6/7),
  //      converting each event to document coordinates before recording (FR-9)
  //   5. on pointerup: classifyStroke -> resolveStroke against
  //      adapter.parseTargets(), then MarkSet.add (FR-17..FR-22)
  //   6. a cached target measurement invalidated on scroll/resize/mutation,
  //      never re-measured per pointer event (NFR-4)
  //   7. ReviewPanel, and on submit adapter.insertText() — never a send (FR-27)
  //
  // Every step must be individually failure-tolerant. An adapter returning
  // nothing should surface as a degraded toggle, not an exception.
  console.warn(`${LOG_PREFIX} adapter "${adapter.id}" matched; UI not yet implemented.`);
}

try {
  bootstrap();
} catch (error) {
  // Last line of defence. A bug in this extension must never surface as a
  // broken host page (NFR-9).
  console.error(`${LOG_PREFIX} failed to start; leaving the page untouched.`, error);
}

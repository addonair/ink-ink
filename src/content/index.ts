/**
 * Content script entry point.
 *
 * This file runs inside someone's chat page. NFR-9 is absolute here: if
 * anything is missing or unrecognised, the extension does nothing and the page
 * is untouched. Breaking the page the user is trying to read is the single
 * worst outcome this project can produce.
 */

import { adapterFor } from '@adapters/registry';
import type { SiteAdapter } from '@adapters/types';
import { InkSession } from '@overlay/session';
import { DEFAULT_TRAILING_INSTRUCTION } from '@compose/message';

const LOG_PREFIX = '[ink-ink]';
const STORAGE_KEY = 'trailingInstruction';

let session: InkSession | null = null;

function bootstrap(): void {
  const url = new URL(window.location.href);
  const adapter = adapterFor(url);

  // Announce injection, but at debug level on the healthy path.
  //
  // Chrome's extension Errors panel lists console.warn output alongside real
  // errors, so logging a successful injection as a warning made a working
  // extension look broken — it was reported as a crash. A warning is reserved
  // for the case that actually deserves attention: injected somewhere with no
  // adapter, which means the manifest and the registry disagree.
  if (adapter === null) {
    console.warn(
      `${LOG_PREFIX} injected on ${url.hostname} but no adapter matched; staying inert.`,
    );
    return; // NFR-9
  }

  console.debug(`${LOG_PREFIX} injected on ${url.hostname}; adapter: ${adapter.id}`);

  mount(adapter);
}

function mount(adapter: SiteAdapter): void {
  session = new InkSession({ adapter });

  // The one stored setting (FR-26, spec section 5.6). Read after mounting so a
  // storage failure delays nothing and breaks nothing.
  void readTrailingInstruction().then((value) => {
    session?.setTrailingInstruction(value);
  });

  chrome.storage?.onChanged.addListener((changes, area) => {
    const change = changes[STORAGE_KEY];
    if (area !== 'sync' || change === undefined) return;
    if (typeof change.newValue === 'string') session?.setTrailingInstruction(change.newValue);
  });
}

async function readTrailingInstruction(): Promise<string> {
  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    const value: unknown = stored[STORAGE_KEY];
    return typeof value === 'string' ? value : DEFAULT_TRAILING_INSTRUCTION;
  } catch {
    return DEFAULT_TRAILING_INSTRUCTION;
  }
}

try {
  bootstrap();
} catch (error) {
  // Last line of defence. A bug in this extension must never surface as a
  // broken host page (NFR-9).
  console.error(`${LOG_PREFIX} failed to start; leaving the page untouched.`, error);
}

/**
 * Background service worker.
 *
 * Intentionally near-empty. All the work happens in the content script; there
 * is no network activity, no message relaying, and no tab inspection, because
 * NFR-5 and NFR-7 mean there is nothing this worker legitimately needs to do.
 *
 * If a future change gives this file real responsibilities, that is a signal
 * worth a decision record — it is the file most likely to quietly accrue
 * permissions.
 */

const LOG_PREFIX = '[ink-ink]';

/**
 * Announce that the extension itself is alive.
 *
 * This exists purely for diagnosis. "No toggle appeared on the page" has at
 * least three causes — the extension is not loaded, it is loaded but the
 * content script does not match the host, or it matches but fails to inject —
 * and from outside the browser they look identical. A worker that reports its
 * own host allowlist distinguishes the first from the rest in one click.
 */
function announce(reason: string): void {
  const manifest = chrome.runtime.getManifest();
  const matches = manifest.content_scripts?.flatMap((cs) => cs.matches ?? []) ?? [];

  console.warn(
    `${LOG_PREFIX} service worker alive (${reason}). v${manifest.version}. ` +
      `Injecting on: ${matches.join(', ')}`,
  );
}

chrome.runtime.onInstalled.addListener((details) => {
  announce(details.reason);
});

chrome.runtime.onStartup.addListener(() => {
  announce('startup');
});

announce('worker started');

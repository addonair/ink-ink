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

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.warn(`${LOG_PREFIX} installed.`);
  }
});

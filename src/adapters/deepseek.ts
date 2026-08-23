/**
 * DeepSeek adapter — the MVP's single supported host.
 *
 * SCAFFOLD. Every selector below is a placeholder and is expected to be wrong
 * until verified against a live session. They are collected in one exported
 * object so that repairing the adapter is an exercise in editing a table, not
 * in hunting through logic (NFR-10).
 *
 * Deliberate choice: the stubs return empty/false rather than throwing, so an
 * unverified adapter leaves the extension inert instead of breaking the page
 * (NFR-9).
 */

import type { Target } from '@core/types';

import type { SiteAdapter } from './types';

/**
 * TODO(verify): confirm all of these against a real DeepSeek session before
 * the first release. Spec section 8 lists DOM fragility as the top risk.
 */
export const SELECTORS = {
  /** Container for a single assistant turn. */
  assistantMessage: '[data-message-author-role="assistant"]',
  /** Element present only while a response is generating. */
  streamingIndicator: '[data-streaming="true"]',
  /** The message composer input. */
  composer: 'textarea, [contenteditable="true"]',
} as const;

/**
 * Option-label patterns to try, in order (spec section 8: "Option parsing").
 * Each must capture the label in group 1 and the option text in group 2.
 */
export const OPTION_PATTERNS: readonly RegExp[] = [
  /^\s*\(([A-Za-z])\)\s+(.*)$/, //  (A) Paris
  /^\s*([A-Za-z])\)\s+(.*)$/, //    A) Paris
  /^\s*([A-Za-z])\.\s+(.*)$/, //    A. Paris
  /^\s*([A-Za-z])\s*[:-]\s+(.*)$/, // A: Paris  /  A - Paris
];

export const deepseekAdapter: SiteAdapter = {
  id: 'deepseek',
  label: 'DeepSeek',

  matches(url: URL): boolean {
    return url.hostname === 'chat.deepseek.com';
  },

  assistantMessages(): HTMLElement[] {
    // SCAFFOLD: returns nothing, so the extension stays inert (NFR-9).
    return [];
  },

  parseTargets(_message: HTMLElement): Target[] {
    // SCAFFOLD. The real implementation must:
    //   1. walk the message for question blocks and their option lines
    //   2. match each line against OPTION_PATTERNS
    //   3. measure bounds in DOCUMENT coordinates (FR-9, FR-16) —
    //      getBoundingClientRect() + window.scrollX/scrollY
    //   4. link each option to its question via questionId, so FR-21's
    //      replace-previous-answer behaviour has a key to group on
    return [];
  },

  isStreaming(): boolean {
    // SCAFFOLD: false is the safe default — it permits inking. Once the real
    // signal is wired, streaming should suppress ink (spec section 8).
    return false;
  },

  composer(): HTMLElement | null {
    return null;
  },

  insertText(_text: string): boolean {
    // SCAFFOLD. The real implementation sets the composer value and dispatches
    // an `input` event so the site's framework registers the change.
    //
    // It MUST NOT dispatch Enter or click the send button — FR-27 and NFR-8
    // require the user to send. This is the project's ToS line.
    return false;
  },
};

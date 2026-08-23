/**
 * The host-site boundary (NFR-10).
 *
 * Every CSS selector, class name, and DOM assumption about a chat site lives
 * behind this interface. Core logic never sees an HTMLElement it did not get
 * from here, so repairing a site that changed its markup — spec section 8 calls
 * that a question of when, not if — is a single-file change.
 *
 * Contract for every implementation: **degrade, never throw** (NFR-9). A site
 * that has restructured should make the extension inert, not break the page the
 * user is trying to read.
 */

import type { Target } from '@core/types';

export interface SiteAdapter {
  /** Stable identifier, e.g. 'deepseek'. Used in logs and settings. */
  readonly id: string;

  /** Display name for the options UI. */
  readonly label: string;

  /** Whether this adapter handles the given location. */
  matches(url: URL): boolean;

  /**
   * Roots of the assistant messages currently rendered.
   * Returns [] when nothing matches — never throws.
   */
  assistantMessages(): HTMLElement[];

  /**
   * Parse one assistant message into candidate targets (FR-15, FR-16).
   *
   * Responsible for the messy part: options are rendered markdown, not data.
   * Spec section 8 flags `A)` vs `A.` vs `(A)` vs `<li>` as all needing
   * handling. Returns [] when the message yields nothing recognisable.
   *
   * Bounding boxes must be in document coordinates (FR-9) — add scroll offset
   * to getBoundingClientRect values.
   */
  parseTargets(message: HTMLElement): Target[];

  /**
   * Whether a response is currently streaming.
   *
   * Spec section 8: content shifts while it generates, so marks drawn during
   * streaming drift. The MVP mitigation is to suppress ink while this is true.
   * Return `false` when the site gives no reliable signal.
   */
  isStreaming(): boolean;

  /** The site's message composer, or null when it cannot be found. */
  composer(): HTMLElement | null;

  /**
   * Insert text into the composer (FR-26).
   *
   * MUST NOT submit. FR-27 and NFR-8 both hinge on the user pressing send
   * themselves — that is the line this project holds on ToS posture.
   *
   * Returns false when insertion failed, so the caller can tell the user
   * instead of silently losing their answers.
   */
  insertText(text: string): boolean;
}

/**
 * Health signal for detecting silent breakage.
 *
 * Spec section 8 asks for "a plan for detecting and signalling breakage".
 * An adapter that finds messages but no targets is the tell-tale of a markup
 * change, and is distinguishable from a page that genuinely has no quiz.
 */
export interface AdapterHealth {
  adapterId: string;
  messagesFound: number;
  targetsFound: number;
  composerFound: boolean;
}

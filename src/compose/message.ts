/**
 * Turn resolved marks into the plain-text message that goes in the composer
 * (FR-26, FR-28; format in spec section 5.6).
 *
 * Pure and DOM-free, so the exact output is testable without a browser — worth
 * it because this string is what the model actually sees.
 */

import type { Mark } from '@core/types';

/**
 * Default trailing instruction (spec section 5.6).
 *
 * FR-26 requires this to be user-editable and persisted; the options page owns
 * that, and this is only the fallback.
 */
export const DEFAULT_TRAILING_INSTRUCTION = 'Mark these and explain any I got wrong.';

export interface ComposeOptions {
  trailingInstruction: string;
}

/**
 * Compose the MCQ answer message.
 *
 * Target shape, per spec section 5.6:
 *
 *     My answers:
 *     1. B
 *     2. C
 *     3. B
 *
 *     Mark these and explain any I got wrong.
 *
 * Only resolved marks are included (FR-20). Answers are ordered by question
 * ordinal, not by the order the user drew them — someone who jumps around the
 * page still gets a list the model can read straight down.
 */
export function composeAnswerMessage(_marks: readonly Mark[], _options: ComposeOptions): string {
  throw new Error('Not implemented: composeAnswerMessage');
}

/**
 * Compose a reference message: quoted passage plus the user's question (FR-28).
 *
 * DEFERRED — spec section 7 cuts US-7 from the MVP. Present so the compose
 * boundary is shaped for it, not because it ships now.
 */
export function composeReferenceMessage(_passage: string, _question: string): string {
  throw new Error('Not implemented: composeReferenceMessage (deferred, US-7)');
}

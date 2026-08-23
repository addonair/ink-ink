/**
 * Turn resolved marks into the plain-text message that goes in the composer
 * (FR-26, FR-28; format in spec section 5.6).
 *
 * Pure and DOM-free, so the exact output is testable without a browser — worth
 * it because this string is what the model actually sees.
 */

import type { Mark, Target } from '@core/types';

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

/** The resolved targets, in the order they should be listed. */
function answeredTargets(marks: readonly Mark[]): Target[] {
  const targets: Target[] = [];

  for (const mark of marks) {
    if (mark.resolution.status === 'resolved') targets.push(mark.resolution.target);
  }

  // Ordered by question number, not by draw order: someone who jumps around
  // the page still gets a list the model can read straight down. Targets with
  // no ordinal keep their relative position at the end rather than being
  // dropped — a missing number is a parsing gap, not a reason to lose an answer.
  return targets
    .map((target, index) => ({ target, index }))
    .sort((a, b) => {
      const ao = a.target.ordinal;
      const bo = b.target.ordinal;
      if (ao === undefined && bo === undefined) return a.index - b.index;
      if (ao === undefined) return 1;
      if (bo === undefined) return -1;
      return ao === bo ? a.index - b.index : ao - bo;
    })
    .map((entry) => entry.target);
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
 * Only resolved marks are included (FR-20).
 */
export function composeAnswerMessage(marks: readonly Mark[], options: ComposeOptions): string {
  const targets = answeredTargets(marks);
  if (targets.length === 0) return '';

  const lines = targets.map((target, i) => {
    const number = target.ordinal ?? i + 1;
    // Fall back to the option text when the label could not be parsed — a
    // slightly verbose answer beats silently omitting one.
    const answer = target.label ?? target.text;
    return `${number}. ${answer}`;
  });

  const body = `My answers:\n${lines.join('\n')}`;
  const instruction = options.trailingInstruction.trim();

  return instruction === '' ? body : `${body}\n\n${instruction}`;
}

/**
 * Compose a reference message: quoted passage plus the user's question (FR-28).
 *
 * DEFERRED — spec section 7 cuts US-7 from the MVP. Implemented because the
 * shape is settled and trivial, but nothing calls it yet.
 */
export function composeReferenceMessage(passage: string, question: string): string {
  const quoted = passage
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  const asked = question.trim();
  return asked === '' ? quoted : `${quoted}\n\n${asked}`;
}

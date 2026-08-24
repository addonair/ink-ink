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
  /**
   * Question numbers the user asked to have explained.
   *
   * Separate from the answers, because a question can be flagged without being
   * answered — not understanding a question is a common reason for leaving it
   * blank, which is exactly when an explanation is wanted.
   */
  explainOrdinals?: readonly number[];
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
/** "2", "2 and 4", "2, 4 and 7" — read aloud rather than comma-spliced. */
function listNumbers(numbers: readonly number[]): string {
  if (numbers.length === 1) return String(numbers[0]);
  const head = numbers.slice(0, -1).join(', ');
  return `${head} and ${numbers[numbers.length - 1]}`;
}

/**
 * The request to explain flagged questions.
 *
 * Deliberately asks for an explanation **even when the answer was right**: a
 * lucky guess is precisely the case where the student needs it, and the default
 * trailing instruction only covers what they got wrong.
 */
function explainParagraph(ordinals: readonly number[]): string {
  const sorted = [...new Set(ordinals)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';

  const subject = sorted.length === 1 ? 'question' : 'questions';
  return (
    `I'm not confident about ${subject} ${listNumbers(sorted)} — please explain ` +
    `${sorted.length === 1 ? 'it' : 'those'} in full, including what the question ` +
    'is asking and why the correct answer is right, even if I answered correctly.'
  );
}

export function composeAnswerMessage(marks: readonly Mark[], options: ComposeOptions): string {
  const targets = answeredTargets(marks);
  const explain = explainParagraph(options.explainOrdinals ?? []);

  // Only truly nothing to say is empty. Flags without answers are a real
  // message — "I could not answer these, please explain them" — and returning
  // '' for that silently discarded it.
  if (targets.length === 0 && explain === '') return '';

  const lines = targets.map((target, i) => {
    const number = target.ordinal ?? i + 1;
    // Fall back to the option text when the label could not be parsed — a
    // slightly verbose answer beats silently omitting one.
    const answer = target.label ?? target.text;
    return `${number}. ${answer}`;
  });

  const parts: string[] = [];
  if (targets.length > 0) parts.push(`My answers:\n${lines.join('\n')}`);

  // The trailing instruction says "mark these", so it only makes sense when
  // there are answers to mark. A flags-only message carries its own request.
  const instruction = options.trailingInstruction.trim();
  if (instruction !== '' && targets.length > 0) parts.push(instruction);

  if (explain !== '') parts.push(explain);

  return parts.join('\n\n');
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

/**
 * The running set of marks for the current page (FR-22).
 *
 * Host-agnostic by construction — it stores `Mark` values, never DOM nodes —
 * so it moves to a standalone app with core (NFR-15).
 */

import type { Mark, QuestionId, StrokeId } from '@core/types';

/** The question a mark answers, or null when it resolves to nothing. */
function questionOf(mark: Mark): QuestionId | null {
  if (mark.resolution.status !== 'resolved') return null;
  return mark.resolution.target.questionId ?? null;
}

export class MarkSet {
  #marks: Mark[] = [];

  /**
   * Add a mark.
   *
   * FR-21: when the mark resolves to an option whose question already has a
   * mark, the earlier one is replaced rather than both being kept — that is
   * US-5, changing your mind about an answer. Returns the displaced mark, if
   * any, so the caller can erase its ink.
   */
  add(mark: Mark): { displaced: Mark | null } {
    let displaced: Mark | null = null;

    const question = questionOf(mark);
    if (question !== null) {
      const index = this.#marks.findIndex((m) => questionOf(m) === question);
      if (index !== -1) {
        displaced = this.#marks[index]!;
        this.#marks.splice(index, 1);
      }
    }

    this.#marks.push(mark);
    return { displaced };
  }

  /** Remove one mark by its stroke id (FR-24). */
  remove(strokeId: StrokeId): Mark | null {
    const index = this.#marks.findIndex((m) => m.stroke.id === strokeId);
    if (index === -1) return null;
    return this.#marks.splice(index, 1)[0] ?? null;
  }

  /** Undo the most recently added mark (FR-25, US-4). */
  undo(): Mark | null {
    return this.#marks.pop() ?? null;
  }

  /** Every mark, in the order added. Includes unresolved ones for display. */
  all(): readonly Mark[] {
    return [...this.#marks];
  }

  /** Only resolved marks — the ones eligible for submission (FR-20). */
  resolved(): readonly Mark[] {
    return this.#marks.filter((m) => m.resolution.status === 'resolved');
  }

  /** Marks that failed to resolve, for the FR-13/FR-20 visual treatment. */
  unresolved(): readonly Mark[] {
    return this.#marks.filter((m) => m.resolution.status === 'unresolved');
  }

  /** The mark currently answering a question, if any. */
  forQuestion(questionId: QuestionId): Mark | null {
    return this.#marks.find((m) => questionOf(m) === questionId) ?? null;
  }

  /** Drop everything, e.g. after a successful submit (FR-14). */
  clear(): void {
    this.#marks = [];
  }

  get size(): number {
    return this.#marks.length;
  }
}

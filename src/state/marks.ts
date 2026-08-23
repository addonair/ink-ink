/**
 * The running set of marks for the current page (FR-22).
 *
 * Host-agnostic by construction — it stores `Mark` values, never DOM nodes —
 * so it moves to a standalone app with core (NFR-15).
 *
 * SCAFFOLD: method bodies unimplemented.
 */

import type { Mark, QuestionId, StrokeId } from '@core/types';

export class MarkSet {
  /**
   * Add a mark.
   *
   * FR-21: when the mark resolves to an option whose question already has a
   * mark, the earlier one is replaced rather than both being kept — that is
   * US-5, changing your mind about an answer. Returns the displaced mark, if
   * any, so the caller can erase its ink.
   */
  add(_mark: Mark): { displaced: Mark | null } {
    throw new Error('Not implemented: MarkSet.add');
  }

  /** Remove one mark by its stroke id (FR-24). */
  remove(_strokeId: StrokeId): Mark | null {
    throw new Error('Not implemented: MarkSet.remove');
  }

  /** Undo the most recently added mark (FR-25, US-4). */
  undo(): Mark | null {
    throw new Error('Not implemented: MarkSet.undo');
  }

  /** Every mark, in the order added. Includes unresolved ones for display. */
  all(): readonly Mark[] {
    throw new Error('Not implemented: MarkSet.all');
  }

  /** Only resolved marks — the ones eligible for submission (FR-20). */
  resolved(): readonly Mark[] {
    throw new Error('Not implemented: MarkSet.resolved');
  }

  /** Marks that failed to resolve, for the FR-13/FR-20 visual treatment. */
  unresolved(): readonly Mark[] {
    throw new Error('Not implemented: MarkSet.unresolved');
  }

  /** The mark currently answering a question, if any. */
  forQuestion(_questionId: QuestionId): Mark | null {
    throw new Error('Not implemented: MarkSet.forQuestion');
  }

  /** Drop everything, e.g. after a successful submit (FR-14). */
  clear(): void {
    throw new Error('Not implemented: MarkSet.clear');
  }

  get size(): number {
    throw new Error('Not implemented: MarkSet.size');
  }
}

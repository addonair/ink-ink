/**
 * The pre-submission review panel (FR-23, FR-24, FR-25, US-6).
 *
 * SCAFFOLD.
 *
 * Its whole purpose is US-6: let the user catch a mis-resolved mark before
 * spending a turn on it. So it must show the *resolved text*, not just "Q1
 * answered" — a wrong resolution is only visible if you can read what will be
 * sent.
 *
 * NFR-13: dismissible, and never blocking the conversation.
 */

import type { Mark, StrokeId } from '@core/types';

export interface ReviewPanelOptions {
  container: HTMLElement;
  onRemoveMark(strokeId: StrokeId): void;
  onUndo(): void;
  /** FR-27: this hands text to the composer. It never sends. */
  onSubmit(): void;
  onDismiss(): void;
}

export class ReviewPanel {
  constructor(_options: ReviewPanelOptions) {
    throw new Error('Not implemented: ReviewPanel');
  }

  /** Re-render from the current mark set (FR-23). */
  update(_marks: readonly Mark[]): void {
    throw new Error('Not implemented: ReviewPanel.update');
  }

  /** Show the exact text that will be inserted, so US-6 is actually served. */
  setPreview(_text: string): void {
    throw new Error('Not implemented: ReviewPanel.setPreview');
  }

  show(): void {
    throw new Error('Not implemented: ReviewPanel.show');
  }

  hide(): void {
    throw new Error('Not implemented: ReviewPanel.hide');
  }

  destroy(): void {
    throw new Error('Not implemented: ReviewPanel.destroy');
  }
}

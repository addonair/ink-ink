/**
 * The visible ink layer (FR-10 – FR-14).
 *
 * SCAFFOLD.
 *
 * Design notes the implementation must honour:
 *
 * - Strokes are stored in document coordinates (FR-9) and drawn with a single
 *   transform applied at paint time. Scrolling then means updating one offset,
 *   not re-projecting every point — which is how NFR-2 is met.
 * - Redraw on scroll/resize belongs in a rAF callback, never a scroll handler
 *   doing layout work (NFR-2, NFR-4).
 * - Resolved and unresolved marks render differently (FR-13).
 * - The canvas is `pointer-events: none` whenever the layer is off, so the
 *   extension intercepts nothing (FR-3).
 */

import type { Mark, Point, Stroke } from '@core/types';

export interface InkCanvasOptions {
  /** Host for the canvas. Should be inside a shadow root (NFR-11). */
  container: HTMLElement;
}

export class InkCanvas {
  constructor(_options: InkCanvasOptions) {
    throw new Error('Not implemented: InkCanvas');
  }

  /** Draw the in-progress stroke each frame while the pen is down (NFR-1). */
  drawLive(_points: readonly Point[]): void {
    throw new Error('Not implemented: InkCanvas.drawLive');
  }

  /** Commit a finished stroke to the persistent layer (FR-10, US-2). */
  commit(_stroke: Stroke): void {
    throw new Error('Not implemented: InkCanvas.commit');
  }

  /** Restyle a stroke once its mark resolved or failed to (FR-13, FR-20). */
  setMarkState(_mark: Mark): void {
    throw new Error('Not implemented: InkCanvas.setMarkState');
  }

  /** Erase one stroke — undo, per-mark removal, or FR-21 replacement. */
  erase(_strokeId: Stroke['id']): void {
    throw new Error('Not implemented: InkCanvas.erase');
  }

  /** Erase everything (FR-14). */
  clear(): void {
    throw new Error('Not implemented: InkCanvas.clear');
  }

  /** Re-anchor ink after scroll or reflow (FR-11, FR-12). */
  reanchor(): void {
    throw new Error('Not implemented: InkCanvas.reanchor');
  }

  /** Toggle interception without tearing the layer down (FR-2, FR-3). */
  setEnabled(_enabled: boolean): void {
    throw new Error('Not implemented: InkCanvas.setEnabled');
  }

  destroy(): void {
    throw new Error('Not implemented: InkCanvas.destroy');
  }
}

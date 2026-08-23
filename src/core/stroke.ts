/**
 * Stroke recording: raw pointer samples in, a `Stroke` in document coordinates
 * out (FR-8, FR-9).
 *
 * NFR-15 keeps this DOM-free, which is why the recorder accepts a plain
 * `PointerSample` rather than a PointerEvent. The content layer does the
 * unwrapping; the same recorder then works in a standalone app or a test with
 * no browser at all.
 */

import type { Point, Stroke, StrokeId } from './types';

/**
 * A pointer reading, already converted to document coordinates by the caller.
 *
 * FR-9 exists because the page scrolls under the ink. Viewport coordinates
 * would silently drift; converting once at the boundary means every downstream
 * consumer is working in the same space.
 */
export interface PointerSample {
  x: number;
  y: number;
  t: number;
  pressure?: number;
}

/** What the input layer reports about the device that produced an event. */
export type PointerKind = 'pen' | 'touch' | 'mouse';

/**
 * Whether a pointer should draw (FR-5, FR-6, FR-7).
 *
 * Isolated as one swappable predicate on purpose: spec section 8 flags that not
 * every stylus reports `pointerType === 'pen'` — some report touch or mouse. If
 * the target hardware misreports, this is the single function to change, and it
 * is testable without any hardware.
 */
export function shouldCapture(kind: PointerKind, inkLayerEnabled: boolean): boolean {
  if (!inkLayerEnabled) return false; // FR-3, FR-4
  switch (kind) {
    case 'pen':
      return true; // FR-5
    case 'touch':
      return false; // FR-6 — reserved for scrolling (US-8)
    case 'mouse':
      return true; // FR-7 — non-stylus testing fallback
  }
}

/**
 * Accumulates samples for one pen-down..pen-up gesture.
 *
 * SCAFFOLD: method bodies unimplemented.
 */
export class StrokeRecorder {
  /** Begin a stroke. Returns the id assigned to it. */
  begin(_sample: PointerSample): StrokeId {
    throw new Error('Not implemented: StrokeRecorder.begin');
  }

  /** Append a sample. No-op when no stroke is open. */
  extend(_sample: PointerSample): void {
    throw new Error('Not implemented: StrokeRecorder.extend');
  }

  /** Close the stroke and return it, or null if it was too short to keep. */
  end(_sample?: PointerSample): Stroke | null {
    throw new Error('Not implemented: StrokeRecorder.end');
  }

  /** Discard the in-progress stroke, e.g. on pointercancel. */
  abort(): void {
    throw new Error('Not implemented: StrokeRecorder.abort');
  }

  /** Points captured so far, for live rendering during the gesture (NFR-1). */
  get current(): readonly Point[] {
    throw new Error('Not implemented: StrokeRecorder.current');
  }
}

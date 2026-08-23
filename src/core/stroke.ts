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
 * Monotonic stroke ids.
 *
 * A counter rather than `crypto.randomUUID()`: ids only need to be unique
 * within one page session, and deterministic ids keep tests readable.
 */
let nextStrokeSeq = 1;

/** Test seam. Not used in production code. */
export function __resetStrokeIds(): void {
  nextStrokeSeq = 1;
}

const toPoint = (s: PointerSample): Point =>
  s.pressure === undefined
    ? { x: s.x, y: s.y, t: s.t }
    : { x: s.x, y: s.y, t: s.t, pressure: s.pressure };

/**
 * Accumulates samples for one pen-down..pen-up gesture.
 *
 * Deliberately does NOT drop short strokes: a single tap is a legitimate tick
 * (FR-18 covers "tick or short mark"). Judging whether a stroke means anything
 * is `classifyStroke`'s job, not the recorder's — the recorder only reports
 * what the pen did.
 */
export class StrokeRecorder {
  #id: StrokeId | null = null;
  #points: Point[] = [];

  /** Begin a stroke. Returns the id assigned to it. */
  begin(sample: PointerSample): StrokeId {
    const id = `stroke-${nextStrokeSeq++}` as StrokeId;
    this.#id = id;
    this.#points = [toPoint(sample)];
    return id;
  }

  /** Append a sample. No-op when no stroke is open. */
  extend(sample: PointerSample): void {
    if (this.#id === null) return;
    this.#points.push(toPoint(sample));
  }

  /** Close the stroke and return it, or null if no stroke was open. */
  end(sample?: PointerSample): Stroke | null {
    if (this.#id === null) return null;

    if (sample !== undefined) this.#points.push(toPoint(sample));

    const stroke: Stroke = { id: this.#id, points: this.#points };
    this.#id = null;
    this.#points = [];
    return stroke;
  }

  /** Discard the in-progress stroke, e.g. on pointercancel. */
  abort(): void {
    this.#id = null;
    this.#points = [];
  }

  /** Whether a stroke is currently open. */
  get isRecording(): boolean {
    return this.#id !== null;
  }

  /** Points captured so far, for live rendering during the gesture (NFR-1). */
  get current(): readonly Point[] {
    return this.#points;
  }
}

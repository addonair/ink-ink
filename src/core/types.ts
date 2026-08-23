/**
 * Core domain types.
 *
 * NFR-15: nothing in `src/core` may reference the DOM, Chrome APIs, or any
 * host-site concept. A `Target` is deliberately *not* an HTMLElement — the
 * adapter layer measures elements and hands core plain geometry, so the same
 * resolution logic works against a first-party quiz UI later.
 */

/** A single sampled pointer position, in document coordinates (FR-9). */
export interface Point {
  x: number;
  y: number;
  /** Milliseconds, from the same clock for every point in a stroke (FR-8). */
  t: number;
  /** 0..1 where the device reports it; undefined when it does not. */
  pressure?: number;
}

/** An axis-aligned rectangle in document coordinates (FR-16). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One continuous pen-down to pen-up gesture (FR-8). */
export interface Stroke {
  id: StrokeId;
  points: Point[];
}

export type StrokeId = string & { readonly __brand: 'StrokeId' };
export type TargetId = string & { readonly __brand: 'TargetId' };
export type QuestionId = string & { readonly __brand: 'QuestionId' };

/**
 * What a stroke can be drawn over (FR-15).
 *
 * `question` groups options so FR-21 (marking a second option replaces the
 * first) has something to key on. `span` supports the deferred referencing
 * flow (US-7) and is parsed but unused in the MVP.
 */
export type TargetKind = 'question' | 'option' | 'span';

export interface Target {
  id: TargetId;
  kind: TargetKind;
  /** Bounding box in document coordinates (FR-16). */
  bounds: Rect;
  /** Visible text, used to compose the outgoing message. */
  text: string;
  /** For `option`: the question it belongs to. Absent for standalone spans. */
  questionId?: QuestionId;
  /** For `option`: the parsed label — "B" from "B) Paris". */
  label?: string;
  /** For `question`: its 1-based position as displayed. */
  ordinal?: number;
}

/** How a stroke was interpreted geometrically (spec section 3). */
export type MarkKind = 'circle' | 'tick' | 'unknown';

/**
 * The outcome of resolving one stroke against the candidate targets.
 *
 * FR-19 requires an explicit unresolved state rather than a best guess, and
 * FR-20 requires unresolved marks to be excluded from the submitted message —
 * so this is a discriminated union, not a nullable target.
 */
export type Resolution =
  | { status: 'resolved'; target: Target; confidence: number }
  | { status: 'unresolved'; reason: UnresolvedReason; confidence: number };

export type UnresolvedReason =
  'no-targets' | 'below-threshold' | 'ambiguous' | 'unclassified-stroke';

/** A stroke plus what it resolved to. The unit the review panel lists (FR-23). */
export interface Mark {
  stroke: Stroke;
  kind: MarkKind;
  resolution: Resolution;
}

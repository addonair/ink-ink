/**
 * Pure geometry helpers. No DOM, no host concepts (NFR-15).
 *
 * SCAFFOLD: signatures and contracts only. Bodies are unimplemented so that
 * the first real commit fills them against the tests in `geometry.test.ts`
 * rather than inheriting guessed behaviour.
 */

import type { Point, Rect } from './types';

const TODO = (what: string): never => {
  throw new Error(`Not implemented: ${what}`);
};

/** Smallest axis-aligned box containing every point. Empty input -> null. */
export function boundingBox(_points: readonly Point[]): Rect | null {
  return TODO('boundingBox');
}

/** Arithmetic mean of the points. Basis for tick resolution (FR-18). */
export function centroid(_points: readonly Point[]): Point | null {
  return TODO('centroid');
}

/** Signed area via the shoelace formula; sign gives stroke winding direction. */
export function signedArea(_points: readonly Point[]): number {
  return TODO('signedArea');
}

/** Total pen-travel distance. Distinguishes a tick from a loop. */
export function pathLength(_points: readonly Point[]): number {
  return TODO('pathLength');
}

/** Straight-line distance from first point to last. */
export function endpointGap(_points: readonly Point[]): number {
  return TODO('endpointGap');
}

export function rectArea(_r: Rect): number {
  return TODO('rectArea');
}

/** Area of the intersection of two rects; 0 when they do not overlap. */
export function rectIntersectionArea(_a: Rect, _b: Rect): number {
  return TODO('rectIntersectionArea');
}

/**
 * Fraction of `target` covered by `region`, in 0..1.
 *
 * This is the score FR-17 ranks circle candidates by. Normalising against the
 * target (not the stroke) means a generous loop around a short option still
 * scores 1.0 — which is what a person drawing it intends.
 */
export function coverageOf(_target: Rect, _region: Rect): number {
  return TODO('coverageOf');
}

/** Even-odd point-in-polygon test, for tightening FR-17 beyond bbox overlap. */
export function pointInPolygon(_p: Point, _polygon: readonly Point[]): boolean {
  return TODO('pointInPolygon');
}

/** Shortest distance from a point to a rect; 0 when inside. Backs FR-18. */
export function distanceToRect(_p: Point, _r: Rect): number {
  return TODO('distanceToRect');
}

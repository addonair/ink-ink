/**
 * Pure geometry helpers. No DOM, no host concepts (NFR-15).
 *
 * Everything here works in `Vec2` rather than `Point`: these are spatial
 * questions, and a computed position has no timestamp to carry.
 */

import type { Rect, Vec2 } from './types';

/** Smallest axis-aligned box containing every point. Empty input -> null. */
export function boundingBox(points: readonly Vec2[]): Rect | null {
  const first = points[0];
  if (first === undefined) return null;

  let minX = first.x;
  let maxX = first.x;
  let minY = first.y;
  let maxY = first.y;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Arithmetic mean of the points. Basis for tick resolution (FR-18). */
export function centroid(points: readonly Vec2[]): Vec2 | null {
  if (points.length === 0) return null;

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }

  return { x: sumX / points.length, y: sumY / points.length };
}

/**
 * Signed area via the shoelace formula; sign gives stroke winding direction.
 *
 * The polygon is implicitly closed — the last point wraps to the first — so a
 * stroke the user left slightly open still reports the area they drew around.
 */
export function signedArea(points: readonly Vec2[]): number {
  if (points.length < 3) return 0;

  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    total += a.x * b.y - b.x * a.y;
  }

  return total / 2;
}

/** Total pen-travel distance. Distinguishes a tick from a loop. */
export function pathLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1]!, points[i]!);
  }
  return total;
}

/** Straight-line distance from first point to last. */
export function endpointGap(points: readonly Vec2[]): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return 0;
  return distance(first, last);
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function rectArea(r: Rect): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

export function rectCenter(r: Rect): Vec2 {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Area of the intersection of two rects; 0 when they do not overlap. */
export function rectIntersectionArea(a: Rect, b: Rect): number {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  // Rects meeting exactly at an edge overlap by zero, not by a sliver.
  if (overlapX <= 0 || overlapY <= 0) return 0;

  return overlapX * overlapY;
}

/**
 * Fraction of `target` covered by `region`, in 0..1.
 *
 * This is the score FR-17 ranks circle candidates by. Normalising against the
 * target (not the stroke) means a generous loop around a short option still
 * scores 1.0 — which is what a person drawing it intends.
 */
export function coverageOf(target: Rect, region: Rect): number {
  const area = rectArea(target);
  // A zero-area target cannot be "covered"; reporting 1.0 for it would let a
  // degenerate measurement win every ranking.
  if (area <= 0) return 0;

  return clamp01(rectIntersectionArea(target, region) / area);
}

/**
 * Even-odd point-in-polygon test, for tightening FR-17 beyond bbox overlap.
 *
 * Even-odd rather than winding: a stroke that crosses itself — a loop drawn
 * with a tail, which is common at speed — should still read as enclosing its
 * interior.
 */
export function pointInPolygon(p: Vec2, polygon: readonly Vec2[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;

    const straddlesRay = a.y > p.y !== b.y > p.y;
    if (!straddlesRay) continue;

    const crossingX = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (p.x < crossingX) inside = !inside;
  }

  return inside;
}

/** Whether a point lies within a rect, edges included. */
export function pointInRect(p: Vec2, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** Shortest distance from a point to a rect; 0 when inside. Backs FR-18. */
export function distanceToRect(p: Vec2, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

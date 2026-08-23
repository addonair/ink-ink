import { describe, expect, it } from 'vitest';

import {
  boundingBox,
  centroid,
  clamp01,
  coverageOf,
  distanceToRect,
  endpointGap,
  pathLength,
  pointInPolygon,
  rectArea,
  rectIntersectionArea,
  signedArea,
} from './geometry';
import type { Rect, Vec2 } from './types';

const v = (x: number, y: number): Vec2 => ({ x, y });
const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

/** A unit square traced clockwise in screen coordinates (y grows downward). */
const UNIT_SQUARE: Vec2[] = [v(0, 0), v(1, 0), v(1, 1), v(0, 1)];

describe('boundingBox', () => {
  it('returns null for an empty point list', () => {
    expect(boundingBox([])).toBeNull();
  });

  it('returns a zero-size rect for a single point', () => {
    expect(boundingBox([v(5, 7)])).toEqual({ x: 5, y: 7, width: 0, height: 0 });
  });

  it('encloses every point of a multi-point stroke', () => {
    const box = boundingBox([v(10, 20), v(-5, 40), v(30, 0)]);
    expect(box).toEqual({ x: -5, y: 0, width: 35, height: 40 });
  });
});

describe('centroid', () => {
  it('returns null for an empty point list', () => {
    expect(centroid([])).toBeNull();
  });

  it('returns the arithmetic mean of the points', () => {
    expect(centroid([v(0, 0), v(10, 0), v(0, 10), v(10, 10)])).toEqual({ x: 5, y: 5 });
  });

  it('carries no timestamp, because a computed position has none', () => {
    // Guards the Vec2/Point split: if centroid ever returns a Point again,
    // something has invented a `t` value out of nothing.
    expect(centroid([v(2, 4)])).toEqual({ x: 2, y: 4 });
  });
});

describe('signedArea', () => {
  it('is 0 for a straight line', () => {
    expect(signedArea([v(0, 0), v(10, 10), v(20, 20)])).toBeCloseTo(0);
  });

  it('is 0 for fewer than three points', () => {
    expect(signedArea([])).toBe(0);
    expect(signedArea([v(1, 1)])).toBe(0);
    expect(signedArea([v(1, 1), v(5, 5)])).toBe(0);
  });

  it('has opposite signs for clockwise and counter-clockwise loops', () => {
    const clockwise = signedArea(UNIT_SQUARE);
    const counter = signedArea([...UNIT_SQUARE].reverse());
    expect(Math.sign(clockwise)).toBe(-Math.sign(counter));
  });

  it('matches the known area of a unit square', () => {
    expect(Math.abs(signedArea(UNIT_SQUARE))).toBeCloseTo(1);
  });

  it('closes the polygon implicitly, so a slightly open loop still has area', () => {
    const openLoop = [v(0, 0), v(10, 0), v(10, 10), v(0, 10), v(0, 2)];
    expect(Math.abs(signedArea(openLoop))).toBeGreaterThan(90);
  });
});

describe('pathLength / endpointGap', () => {
  it('pathLength sums the segment distances', () => {
    expect(pathLength([v(0, 0), v(3, 4), v(3, 14)])).toBeCloseTo(15);
  });

  it('pathLength is 0 for fewer than two points', () => {
    expect(pathLength([])).toBe(0);
    expect(pathLength([v(1, 1)])).toBe(0);
  });

  it('endpointGap is 0 for a closed loop and large for a straight line', () => {
    expect(endpointGap([v(0, 0), v(10, 0), v(10, 10), v(0, 0)])).toBeCloseTo(0);
    expect(endpointGap([v(0, 0), v(30, 40)])).toBeCloseTo(50);
  });

  it('endpointGap is 0 for an empty list', () => {
    expect(endpointGap([])).toBe(0);
  });
});

describe('rectIntersectionArea', () => {
  it('is 0 for disjoint rects', () => {
    expect(rectIntersectionArea(rect(0, 0, 10, 10), rect(100, 100, 10, 10))).toBe(0);
  });

  it('is 0 for rects touching only at an edge', () => {
    // Adjacent option lines share a boundary; a sliver of overlap there would
    // make every mark ambiguous.
    expect(rectIntersectionArea(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(0);
  });

  it('equals the smaller rect area when one fully contains the other', () => {
    expect(rectIntersectionArea(rect(0, 0, 100, 100), rect(10, 10, 5, 5))).toBe(25);
  });

  it('computes partial overlap', () => {
    expect(rectIntersectionArea(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(25);
  });
});

describe('rectArea', () => {
  it('multiplies width by height', () => {
    expect(rectArea(rect(3, 4, 5, 6))).toBe(30);
  });

  it('treats negative dimensions as zero rather than negative area', () => {
    expect(rectArea(rect(0, 0, -5, 10))).toBe(0);
  });
});

describe('coverageOf', () => {
  it('is 1 when the region fully contains the target', () => {
    expect(coverageOf(rect(10, 10, 5, 5), rect(0, 0, 100, 100))).toBe(1);
  });

  it('is 0 when they do not overlap', () => {
    expect(coverageOf(rect(0, 0, 10, 10), rect(50, 50, 10, 10))).toBe(0);
  });

  it('normalises against the target, so an oversized loop still scores 1', () => {
    // FR-17: a generous circle around a short option is a confident answer,
    // not a vague one.
    const option = rect(100, 200, 80, 20);
    const generousLoop = rect(50, 150, 400, 120);
    expect(coverageOf(option, generousLoop)).toBe(1);
  });

  it('reports the covered fraction for partial overlap', () => {
    expect(coverageOf(rect(0, 0, 10, 10), rect(5, 0, 10, 10))).toBeCloseTo(0.5);
  });

  it('is 0 for a zero-area target rather than 1', () => {
    // A degenerate measurement must not win a ranking by default.
    expect(coverageOf(rect(5, 5, 0, 0), rect(0, 0, 100, 100))).toBe(0);
  });
});

describe('pointInPolygon', () => {
  const SQUARE: Vec2[] = [v(0, 0), v(10, 0), v(10, 10), v(0, 10)];

  it('detects a point inside a convex loop', () => {
    expect(pointInPolygon(v(5, 5), SQUARE)).toBe(true);
  });

  it('detects a point outside a convex loop', () => {
    expect(pointInPolygon(v(50, 5), SQUARE)).toBe(false);
    expect(pointInPolygon(v(5, -5), SQUARE)).toBe(false);
  });

  it('returns false for a degenerate polygon', () => {
    expect(pointInPolygon(v(0, 0), [])).toBe(false);
    expect(pointInPolygon(v(0, 0), [v(0, 0), v(1, 1)])).toBe(false);
  });

  it('handles a self-intersecting stroke under the even-odd rule', () => {
    // A bowtie. Its diagonals cross at (5,5), so the enclosed lobes are the
    // LEFT and RIGHT triangles — not top and bottom. At y=2 those lobes span
    // x 0..2 and x 8..10, leaving the middle outside despite sitting well
    // within the bounding box. This is exactly why FR-17 cannot rely on the
    // bounding box alone.
    const bowtie: Vec2[] = [v(0, 0), v(10, 10), v(10, 0), v(0, 10)];

    expect(pointInPolygon(v(1, 5), bowtie)).toBe(true); // left lobe
    expect(pointInPolygon(v(9, 5), bowtie)).toBe(true); // right lobe
    expect(pointInPolygon(v(5, 2), bowtie)).toBe(false); // between the lobes
    expect(pointInPolygon(v(50, 50), bowtie)).toBe(false); // far outside
  });
});

describe('distanceToRect', () => {
  const R = rect(10, 10, 20, 20); // spans x 10..30, y 10..30

  it('is 0 for a point inside the rect', () => {
    expect(distanceToRect(v(20, 20), R)).toBe(0);
  });

  it('is 0 for a point exactly on the edge', () => {
    expect(distanceToRect(v(10, 20), R)).toBe(0);
  });

  it('measures perpendicular distance for a point beside an edge', () => {
    expect(distanceToRect(v(35, 20), R)).toBeCloseTo(5);
    expect(distanceToRect(v(20, 5), R)).toBeCloseTo(5);
  });

  it('measures corner distance for a point diagonal to the rect', () => {
    expect(distanceToRect(v(33, 34), R)).toBeCloseTo(5); // 3-4-5 from (30,30)
  });
});

describe('clamp01', () => {
  it('clamps out-of-range values', () => {
    expect(clamp01(-5)).toBe(0);
    expect(clamp01(5)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });

  it('maps NaN to 0 rather than letting it poison a ranking', () => {
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

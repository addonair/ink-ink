import { describe, it } from 'vitest';

/**
 * Scaffold. These name the contracts `geometry.ts` documents; the first real
 * commit implements the functions against them.
 */
describe('boundingBox', () => {
  it.todo('returns null for an empty point list');
  it.todo('returns a zero-size rect for a single point');
  it.todo('encloses every point of a multi-point stroke');
});

describe('centroid', () => {
  it.todo('returns null for an empty point list');
  it.todo('returns the arithmetic mean of the points');
});

describe('signedArea', () => {
  it.todo('is ~0 for a straight line');
  it.todo('has opposite signs for clockwise and counter-clockwise loops');
  it.todo('matches the known area of a unit square');
});

describe('pathLength / endpointGap', () => {
  it.todo('pathLength sums the segment distances');
  it.todo('endpointGap is ~0 for a closed loop and large for a straight line');
});

describe('rectIntersectionArea', () => {
  it.todo('is 0 for disjoint rects');
  it.todo('is 0 for rects touching only at an edge');
  it.todo('equals the smaller rect area when one fully contains the other');
});

describe('coverageOf', () => {
  it.todo('is 1 when the region fully contains the target');
  it.todo('is 0 when they do not overlap');
  it.todo('normalises against the target, so an oversized loop still scores 1');
});

describe('pointInPolygon', () => {
  it.todo('detects a point inside a convex loop');
  it.todo('detects a point outside a convex loop');
  it.todo('handles a self-intersecting stroke under the even-odd rule');
});

describe('distanceToRect', () => {
  it.todo('is 0 for a point inside the rect');
  it.todo('measures perpendicular distance for a point beside an edge');
  it.todo('measures corner distance for a point diagonal to the rect');
});

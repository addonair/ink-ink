import { beforeEach, describe, expect, it } from 'vitest';

import { __resetStrokeIds, shouldCapture, StrokeRecorder } from './stroke';

describe('shouldCapture', () => {
  it('captures pen input when the ink layer is on (FR-5)', () => {
    expect(shouldCapture('pen', true)).toBe(true);
  });

  it('never captures touch, so the page keeps scrolling (FR-6, US-8)', () => {
    expect(shouldCapture('touch', true)).toBe(false);
    expect(shouldCapture('touch', false)).toBe(false);
  });

  it('captures mouse only as a testing fallback when toggled on (FR-7)', () => {
    expect(shouldCapture('mouse', true)).toBe(true);
    expect(shouldCapture('mouse', false)).toBe(false);
  });

  it('intercepts nothing at all while the layer is off (FR-3, FR-4)', () => {
    for (const kind of ['pen', 'touch', 'mouse'] as const) {
      expect(shouldCapture(kind, false)).toBe(false);
    }
  });
});

describe('StrokeRecorder', () => {
  let rec: StrokeRecorder;

  beforeEach(() => {
    __resetStrokeIds();
    rec = new StrokeRecorder();
  });

  it('assigns a unique id per stroke', () => {
    const a = rec.begin({ x: 0, y: 0, t: 0 });
    rec.end();
    const b = rec.begin({ x: 1, y: 1, t: 1 });
    rec.end();
    expect(a).not.toBe(b);
  });

  it('records points in order with timestamps (FR-8)', () => {
    rec.begin({ x: 0, y: 0, t: 100 });
    rec.extend({ x: 5, y: 5, t: 110 });
    rec.extend({ x: 10, y: 10, t: 120 });
    const s = rec.end({ x: 15, y: 15, t: 130 });

    expect(s?.points).toEqual([
      { x: 0, y: 0, t: 100 },
      { x: 5, y: 5, t: 110 },
      { x: 10, y: 10, t: 120 },
      { x: 15, y: 15, t: 130 },
    ]);
  });

  it('preserves pressure when reported and omits it when not', () => {
    rec.begin({ x: 0, y: 0, t: 0, pressure: 0.5 });
    rec.extend({ x: 1, y: 1, t: 1 });
    const s = rec.end();

    expect(s?.points[0]).toEqual({ x: 0, y: 0, t: 0, pressure: 0.5 });
    expect(s?.points[1]).toEqual({ x: 1, y: 1, t: 1 });
  });

  it('stores points in document coordinates, unaffected by scroll (FR-9)', () => {
    // The recorder is given document coordinates directly — it has no notion
    // of a viewport, which is the whole point of FR-9. Two samples at the same
    // document position are identical regardless of what scrolled between.
    rec.begin({ x: 400, y: 2200, t: 0 });
    rec.extend({ x: 400, y: 2200, t: 50 });
    const s = rec.end();

    const positions = s?.points.map((p) => ({ x: p.x, y: p.y }));
    expect(positions).toEqual([
      { x: 400, y: 2200 },
      { x: 400, y: 2200 },
    ]);
  });

  it('keeps a single-point tap, because a tap is a valid tick (FR-18)', () => {
    // The recorder reports what the pen did; deciding whether a stroke means
    // anything belongs to classifyStroke.
    rec.begin({ x: 50, y: 50, t: 0 });
    const s = rec.end();

    expect(s).not.toBeNull();
    expect(s?.points).toHaveLength(1);
  });

  it('end() returns null when no stroke is open', () => {
    expect(rec.end()).toBeNull();
  });

  it('exposes in-progress points for live rendering (NFR-1)', () => {
    rec.begin({ x: 0, y: 0, t: 0 });
    rec.extend({ x: 10, y: 0, t: 10 });
    expect(rec.current).toHaveLength(2);
    expect(rec.isRecording).toBe(true);
  });

  it('abort() discards the open stroke and leaves no partial state', () => {
    rec.begin({ x: 0, y: 0, t: 0 });
    rec.extend({ x: 10, y: 10, t: 10 });
    rec.abort();

    expect(rec.isRecording).toBe(false);
    expect(rec.current).toHaveLength(0);
    expect(rec.end()).toBeNull();
  });

  it('extend() before begin() is a no-op rather than a throw', () => {
    expect(() => rec.extend({ x: 1, y: 1, t: 1 })).not.toThrow();
    expect(rec.current).toHaveLength(0);
  });

  it('does not leak points from one stroke into the next', () => {
    rec.begin({ x: 0, y: 0, t: 0 });
    rec.extend({ x: 1, y: 1, t: 1 });
    rec.end();

    rec.begin({ x: 100, y: 100, t: 100 });
    const second = rec.end();

    expect(second?.points).toEqual([{ x: 100, y: 100, t: 100 }]);
  });
});

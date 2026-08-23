import { describe, expect, it } from 'vitest';

import { shouldCapture } from './stroke';

/**
 * FR-5/6/7 are fully specified and implementable without hardware, so they are
 * tested for real. Everything else in core is a scaffold stub marked `.todo`.
 */
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
  it.todo('assigns a unique id per stroke');
  it.todo('records points in order with timestamps (FR-8)');
  it.todo('stores points in document coordinates, unaffected by scroll (FR-9)');
  it.todo('returns null for a stroke below the minimum length');
  it.todo('exposes in-progress points for live rendering (NFR-1)');
  it.todo('abort() discards the open stroke and leaves no partial state');
  it.todo('extend() before begin() is a no-op rather than a throw');
});

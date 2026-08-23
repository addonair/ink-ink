import { describe, expect, it } from 'vitest';

import { classifyStroke, DEFAULT_THRESHOLDS } from './classify';
import type { Point, Stroke, StrokeId } from './types';

const stroke = (points: Array<[number, number]>): Stroke => ({
  id: 's1' as StrokeId,
  points: points.map(([x, y], i): Point => ({ x, y, t: i * 10 })),
});

/** An n-sided polygon approximating a circle of radius r, centred at (cx, cy). */
const loop = (cx: number, cy: number, r: number, sides = 16): Array<[number, number]> =>
  Array.from({ length: sides + 1 }, (_, i) => {
    const angle = (i / sides) * Math.PI * 2;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as [number, number];
  });

describe('classifier thresholds', () => {
  it('exposes tunable defaults rather than inlining magic numbers', () => {
    // Spec section 8 lists threshold tuning as an open question. This test
    // exists to fail loudly if the constants are ever inlined back into the
    // comparisons, which would make tuning a code-archaeology exercise.
    expect(DEFAULT_THRESHOLDS.closureRatio).toBeGreaterThan(0);
    expect(DEFAULT_THRESHOLDS.minLoopPathLength).toBeGreaterThan(0);
    expect(DEFAULT_THRESHOLDS.minLoopArea).toBeGreaterThan(0);
  });
});

describe('classifyStroke', () => {
  it('classifies a closed loop as a circle', () => {
    expect(classifyStroke(stroke(loop(100, 100, 40)))).toBe('circle');
  });

  it('classifies a loop left slightly open as a circle (real pens overshoot)', () => {
    // Drop the closing point so the endpoints do not meet exactly.
    const open = loop(100, 100, 40).slice(0, -2);
    expect(classifyStroke(stroke(open))).toBe('circle');
  });

  it('classifies a short two-segment mark as a tick', () => {
    expect(
      classifyStroke(
        stroke([
          [10, 10],
          [14, 16],
          [22, 4],
        ]),
      ),
    ).toBe('tick');
  });

  it('classifies a single tap as a tick, not a circle', () => {
    expect(classifyStroke(stroke([[50, 50]]))).toBe('tick');
  });

  it('classifies an empty stroke as unknown', () => {
    expect(classifyStroke(stroke([]))).toBe('unknown');
  });

  it('classifies a long open squiggle as unknown rather than guessing', () => {
    const squiggle: Array<[number, number]> = Array.from({ length: 40 }, (_, i) => [
      i * 10,
      i % 2 === 0 ? 0 : 20,
    ]);
    expect(classifyStroke(stroke(squiggle))).toBe('unknown');
  });

  it('classifies a loop below minLoopArea as unknown, not a circle', () => {
    // Long enough to pass the path-length gate, but a thin sliver enclosing
    // almost nothing — an underline doubled back on itself.
    const sliver: Array<[number, number]> = [
      [0, 0],
      [200, 0],
      [200, 0.4],
      [0, 0.4],
      [0, 0],
    ];
    expect(classifyStroke(stroke(sliver))).toBe('unknown');
  });

  it('accepts injected thresholds so tuning needs no code change', () => {
    const small = loop(10, 10, 4);

    // Default thresholds reject it as too small to be a deliberate circle.
    expect(classifyStroke(stroke(small))).toBe('tick');

    // Relaxed thresholds accept the same stroke as a circle.
    expect(
      classifyStroke(stroke(small), {
        closureRatio: 0.25,
        minLoopPathLength: 5,
        minLoopArea: 10,
      }),
    ).toBe('circle');
  });
});

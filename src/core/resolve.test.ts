import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RESOLVE_OPTIONS,
  MIN_CONFIDENCE,
  resolveStroke,
  scoreByEnclosure,
  scoreByProximity,
} from './resolve';
import type { Point, QuestionId, Stroke, StrokeId, Target, TargetId } from './types';

const stroke = (points: Array<[number, number]>): Stroke => ({
  id: 's1' as StrokeId,
  points: points.map(([x, y], i): Point => ({ x, y, t: i * 10 })),
});

/** A closed loop enclosing the given rect, with margin. */
const loopAround = (
  x: number,
  y: number,
  w: number,
  h: number,
  margin = 6,
): Array<[number, number]> => [
  [x - margin, y - margin],
  [x + w + margin, y - margin],
  [x + w + margin, y + h + margin],
  [x - margin, y + h + margin],
  [x - margin, y - margin],
];

const option = (
  id: string,
  label: string,
  bounds: { x: number; y: number; width: number; height: number },
  questionId = 'q1',
): Target => ({
  id: id as TargetId,
  kind: 'option',
  bounds,
  text: `${label}) something`,
  label,
  questionId: questionId as QuestionId,
  ordinal: 1,
});

// Three option lines stacked vertically, as a rendered markdown list would be.
const OPT_A = option('a', 'A', { x: 100, y: 100, width: 200, height: 20 });
const OPT_B = option('b', 'B', { x: 100, y: 130, width: 200, height: 20 });
const OPT_C = option('c', 'C', { x: 100, y: 160, width: 200, height: 20 });
const ALL = [OPT_A, OPT_B, OPT_C];

describe('resolve options', () => {
  it('keeps the FR-19 confidence threshold a named, tunable constant', () => {
    expect(MIN_CONFIDENCE).toBeGreaterThan(0);
    expect(MIN_CONFIDENCE).toBeLessThan(1);
    expect(DEFAULT_RESOLVE_OPTIONS.minConfidence).toBe(MIN_CONFIDENCE);
  });

  it('resolves only options by default; spans wait for US-7', () => {
    expect(DEFAULT_RESOLVE_OPTIONS.acceptKinds).toEqual(['option']);
  });
});

describe('scoreByEnclosure (FR-17)', () => {
  it('ranks the most-enclosed target first', () => {
    const s = stroke(loopAround(100, 130, 200, 20));
    const scored = scoreByEnclosure(s, ALL);
    expect(scored[0]?.target.label).toBe('B');
  });

  it('scores a target the stroke does not touch as 0', () => {
    const s = stroke(loopAround(100, 130, 200, 20));
    const far = scoreByEnclosure(s, ALL).find((r) => r.target.label === 'A');
    expect(far?.score).toBe(0);
  });

  it('returns an empty array for no targets', () => {
    expect(scoreByEnclosure(stroke(loopAround(0, 0, 10, 10)), [])).toEqual([]);
  });

  it('returns an empty array for an empty stroke', () => {
    expect(scoreByEnclosure(stroke([]), ALL)).toEqual([]);
  });

  it('resolves a circle drawn around only the word, on a full-width option line', () => {
    // The failure reported from the field. A rendered <li> spans the whole
    // content width, but people circle the word, not the line box. Scoring only
    // "fraction of the option covered" gave 0.05 against a 0.45 threshold, so
    // most real marks came back "not clearly over an option".
    const wide: Target = option('b', 'B', { x: 100, y: 200, width: 600, height: 24 });
    const roundTheWord = stroke([
      [120, 196],
      [200, 196],
      [200, 228],
      [120, 228],
      [120, 196],
    ]);

    const [top] = scoreByEnclosure(roundTheWord, [wide]);
    expect(top?.score).toBeGreaterThan(MIN_CONFIDENCE);
    expect(resolveStroke(roundTheWord, 'circle', [wide]).status).toBe('resolved');
  });

  it('still ranks the enclosed option first when the line is circled whole', () => {
    const s = stroke(loopAround(100, 130, 200, 20));
    expect(scoreByEnclosure(s, ALL)[0]?.target.label).toBe('B');
  });

  it('penalises a target inside the bounding box but outside the stroke path', () => {
    // A tall narrow loop drawn to the left of the options: its bounding box
    // clips them, but it never went around them. Without the penalty this
    // would read as a confident circle.
    const tallNarrow = stroke([
      [90, 90],
      [150, 90],
      [150, 95],
      [95, 95],
      [95, 185],
      [90, 185],
      [90, 90],
    ]);
    const scored = scoreByEnclosure(tallNarrow, ALL);
    for (const { score } of scored) {
      expect(score).toBeLessThan(MIN_CONFIDENCE);
    }
  });
});

describe('scoreByProximity (FR-18)', () => {
  it('ranks the target nearest the stroke centroid first', () => {
    const tick = stroke([
      [150, 138],
      [155, 145],
      [165, 132],
    ]);
    expect(scoreByProximity(tick, ALL)[0]?.target.label).toBe('B');
  });

  it('maps distance into 0..1 so scores compare with enclosure scores', () => {
    const tick = stroke([[150, 138]]);
    for (const { score } of scoreByProximity(tick, ALL)) {
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it('scores a tick landing on the option at 1', () => {
    const tick = stroke([[150, 138]]); // inside OPT_B
    expect(scoreByProximity(tick, [OPT_B])[0]?.score).toBeCloseTo(1);
  });

  it('returns an empty array for an empty stroke', () => {
    expect(scoreByProximity(stroke([]), ALL)).toEqual([]);
  });
});

describe('scoreByUnderline (underline marks)', () => {
  const under = (y: number, from = 110, to = 290) =>
    stroke(
      Array.from({ length: 10 }, (_, i) => [from + ((to - from) * i) / 9, y] as [number, number]),
    );

  it('resolves to the option the line runs along, not the one below it', () => {
    // The case that separates underline scoring from proximity scoring.
    //
    // B spans y 130..150, C spans y 160..180. A line at y 156 sits 6px below
    // B and 4px above C, so nearest-centroid picks C — the wrong answer. An
    // underline belongs to the text ABOVE it.
    const s = under(156);

    expect(scoreByProximity(s, ALL)[0]?.target.label).toBe('C');

    const r = resolveStroke(s, 'underline', ALL);
    expect(r.status).toBe('resolved');
    expect(r.status === 'resolved' && r.target.label).toBe('B');
  });

  it('picks the option a line sits under, when the boxes touch', () => {
    // The realistic layout: rendered list items are ADJACENT, so "just below
    // option B" is literally inside option C's box. Scoring "inside the box"
    // as a perfect match therefore hands the answer to C. Found in a browser;
    // the earlier fixtures had a 10px gap between options and hid it.
    const b = option('b2', 'B', { x: 100, y: 130, width: 200, height: 20 });
    const c = option('c2', 'C', { x: 100, y: 150, width: 200, height: 20 });

    const s = under(153); // 3px under B's text, and inside C's box
    const r = resolveStroke(s, 'underline', [b, c]);

    expect(r.status).toBe('resolved');
    expect(r.status === 'resolved' && r.target.label).toBe('B');
  });

  it('resolves a line drawn through the text to that option', () => {
    const r = resolveStroke(under(140), 'underline', ALL);
    expect(r.status === 'resolved' && r.target.label).toBe('B');
  });

  it('ignores an option the line does not run along horizontally', () => {
    // Far off to the right of every option box.
    const s = under(140, 900, 1200);
    expect(resolveStroke(s, 'underline', ALL).status).toBe('unresolved');
  });
});

describe('resolveStroke', () => {
  it('returns unresolved/no-targets when there are no candidates', () => {
    const r = resolveStroke(stroke(loopAround(100, 130, 200, 20)), 'circle', []);
    expect(r).toEqual({ status: 'unresolved', reason: 'no-targets', confidence: 0 });
  });

  it('returns unresolved/unclassified-stroke for an unknown mark kind', () => {
    const r = resolveStroke(stroke(loopAround(100, 130, 200, 20)), 'unknown', ALL);
    expect(r.status).toBe('unresolved');
    expect(r.status === 'unresolved' && r.reason).toBe('unclassified-stroke');
  });

  it('returns unresolved/below-threshold when the best score is too low (FR-19)', () => {
    // A tick far away from every option.
    const r = resolveStroke(stroke([[5000, 5000]]), 'tick', ALL);
    expect(r.status).toBe('unresolved');
    expect(r.status === 'unresolved' && r.reason).toBe('below-threshold');
  });

  it('returns unresolved/ambiguous when two targets score within the margin', () => {
    // A loop drawn around BOTH B and C: it encloses each about equally, so
    // which answer was meant is genuinely unknowable.
    const r = resolveStroke(stroke(loopAround(100, 130, 200, 50)), 'circle', ALL);
    expect(r.status).toBe('unresolved');
    expect(r.status === 'unresolved' && r.reason).toBe('ambiguous');
  });

  it('returns resolved with the winning target and its confidence', () => {
    const r = resolveStroke(stroke(loopAround(100, 130, 200, 20)), 'circle', ALL);
    expect(r.status).toBe('resolved');
    if (r.status !== 'resolved') throw new Error('expected resolved');
    expect(r.target.label).toBe('B');
    expect(r.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
  });

  it('uses enclosure scoring for circles and proximity scoring for ticks', () => {
    // A mark just to the right of every option box. It overlaps nothing, so
    // enclosure scores it zero — but it sits close to C, so proximity ranks C
    // first. That disagreement is the whole point of having two strategies.
    const beside = stroke([
      [320, 168],
      [326, 176],
      [332, 164],
    ]);

    expect(scoreByEnclosure(beside, ALL).every((s) => s.score === 0)).toBe(true);

    const nearest = scoreByProximity(beside, ALL)[0];
    expect(nearest?.target.label).toBe('C');
    expect(nearest?.score).toBeGreaterThan(0);

    // A circle that encloses nothing is not a guess waiting to happen (FR-19).
    expect(resolveStroke(beside, 'circle', ALL).status).toBe('unresolved');
  });

  it('ignores target kinds outside acceptKinds', () => {
    const span: Target = {
      id: 'span1' as TargetId,
      kind: 'span',
      bounds: { x: 100, y: 130, width: 200, height: 20 },
      text: 'a sentence',
    };
    const r = resolveStroke(stroke(loopAround(100, 130, 200, 20)), 'circle', [span]);
    expect(r.status === 'unresolved' && r.reason).toBe('no-targets');
  });

  it('never throws on malformed targets, degrading to unresolved (NFR-9)', () => {
    const malformed = [
      { ...OPT_B, bounds: undefined as unknown as Target['bounds'] },
      { ...OPT_C, bounds: { x: NaN, y: NaN, width: NaN, height: NaN } },
    ];
    let result: ReturnType<typeof resolveStroke> | undefined;
    expect(() => {
      result = resolveStroke(stroke(loopAround(100, 130, 200, 20)), 'circle', malformed);
    }).not.toThrow();
    expect(result?.status).toBe('unresolved');
  });

  it('respects an injected confidence threshold', () => {
    // A tick exactly PROXIMITY_FALLOFF (40px) below OPT_B scores 0.5 — above
    // the default bar, below a strict one. A fully-enclosing circle would
    // score 1.0 and prove nothing about the threshold.
    const s = stroke([[150, 190]]);

    expect(resolveStroke(s, 'tick', [OPT_B]).status).toBe('resolved');

    const strict = resolveStroke(s, 'tick', [OPT_B], {
      ...DEFAULT_RESOLVE_OPTIONS,
      minConfidence: 0.9,
    });
    expect(strict.status).toBe('unresolved');
    expect(strict.status === 'unresolved' && strict.reason).toBe('below-threshold');
    expect(strict.confidence).toBeCloseTo(0.5);
  });
});

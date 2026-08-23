import { describe, expect, it } from 'vitest';

import { DEFAULT_RESOLVE_OPTIONS, MIN_CONFIDENCE } from './resolve';

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
  it.todo('ranks the most-enclosed target first');
  it.todo('scores a target the stroke does not touch as 0');
  it.todo('returns an empty array for no targets');
});

describe('scoreByProximity (FR-18)', () => {
  it.todo('ranks the target nearest the stroke centroid first');
  it.todo('maps distance into 0..1 so scores compare with enclosure scores');
});

describe('resolveStroke', () => {
  it.todo('returns unresolved/no-targets when there are no candidates');
  it.todo('returns unresolved/unclassified-stroke for an unknown mark kind');
  it.todo('returns unresolved/below-threshold when the best score is too low (FR-19)');
  it.todo('returns unresolved/ambiguous when two targets score within the margin');
  it.todo('returns resolved with the winning target and its confidence');
  it.todo('uses enclosure scoring for circles and proximity scoring for ticks');
  it.todo('ignores target kinds outside acceptKinds');
  it.todo('never throws on malformed targets, degrading to unresolved (NFR-9)');
});

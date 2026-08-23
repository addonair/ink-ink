import { describe, expect, it } from 'vitest';

import { DEFAULT_THRESHOLDS } from './classify';

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
  it.todo('classifies a closed loop as a circle');
  it.todo('classifies a loop left slightly open as a circle (real pens overshoot)');
  it.todo('classifies a short two-segment mark as a tick');
  it.todo('classifies a single tap as a tick, not a circle');
  it.todo('classifies a long open squiggle as unknown rather than guessing');
  it.todo('classifies a loop below minLoopArea as unknown, not a circle');
  it.todo('accepts injected thresholds so tuning needs no code change');
});

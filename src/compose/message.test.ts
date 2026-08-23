import { describe, expect, it } from 'vitest';

import { DEFAULT_TRAILING_INSTRUCTION } from './message';

describe('trailing instruction', () => {
  it('matches the wording in spec section 5.6', () => {
    expect(DEFAULT_TRAILING_INSTRUCTION).toBe('Mark these and explain any I got wrong.');
  });
});

describe('composeAnswerMessage (FR-26, spec 5.6)', () => {
  it.todo('produces the "My answers:" header followed by numbered answers');
  it.todo('orders answers by question ordinal, not by draw order');
  it.todo('excludes unresolved marks (FR-20)');
  it.todo('appends the user-configured trailing instruction');
  it.todo('omits the trailing instruction when it is empty');
  it.todo('returns an empty string when there are no resolved marks');
});

describe('composeReferenceMessage (FR-28, deferred US-7)', () => {
  it.todo('quotes the marked passage above the typed question');
});

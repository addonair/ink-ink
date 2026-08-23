import { describe, it } from 'vitest';

describe('MarkSet', () => {
  it.todo('keeps marks in insertion order (FR-22)');
  it.todo(
    'replaces an existing mark for the same question and reports the displaced one (FR-21, US-5)',
  );
  it.todo('keeps marks for different questions side by side (US-3)');
  it.todo('remove() drops a single mark by stroke id (FR-24)');
  it.todo('undo() removes the most recent mark (FR-25, US-4)');
  it.todo('undo() on an empty set returns null rather than throwing');
  it.todo('resolved() excludes unresolved marks (FR-20)');
  it.todo('unresolved() returns only the flagged ones (FR-13)');
  it.todo('clear() empties the set after submission (FR-14)');
});

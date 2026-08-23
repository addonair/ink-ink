import { beforeEach, describe, expect, it } from 'vitest';

import type { QuestionId } from '@core/types';
import { makeOption, resetTestIds, resolvedMark, unresolvedMark } from '../test-support/marks';
import { MarkSet } from './marks';

const q1a = makeOption({ label: 'A', ordinal: 1, questionId: 'q1' });
const q1b = makeOption({ label: 'B', ordinal: 1, questionId: 'q1' });
const q2c = makeOption({ label: 'C', ordinal: 2, questionId: 'q2' });

describe('MarkSet', () => {
  let marks: MarkSet;

  beforeEach(() => {
    resetTestIds();
    marks = new MarkSet();
  });

  it('keeps marks in insertion order (FR-22)', () => {
    const first = resolvedMark(q1a);
    const second = resolvedMark(q2c);
    marks.add(first);
    marks.add(second);

    expect(marks.all().map((m) => m.stroke.id)).toEqual([first.stroke.id, second.stroke.id]);
    expect(marks.size).toBe(2);
  });

  it('replaces an existing mark for the same question and reports the displaced one (FR-21, US-5)', () => {
    const answeredA = resolvedMark(q1a);
    marks.add(answeredA);

    const changedToB = resolvedMark(q1b);
    const { displaced } = marks.add(changedToB);

    expect(displaced?.stroke.id).toBe(answeredA.stroke.id);
    expect(marks.size).toBe(1);
    expect(marks.forQuestion('q1' as QuestionId)?.stroke.id).toBe(changedToB.stroke.id);
  });

  it('keeps marks for different questions side by side (US-3)', () => {
    marks.add(resolvedMark(q1a));
    const { displaced } = marks.add(resolvedMark(q2c));

    expect(displaced).toBeNull();
    expect(marks.size).toBe(2);
  });

  it('does not let an unresolved mark displace a resolved answer', () => {
    // An unresolved mark answers no question, so it must not evict one.
    marks.add(resolvedMark(q1a));
    const { displaced } = marks.add(unresolvedMark());

    expect(displaced).toBeNull();
    expect(marks.forQuestion('q1' as QuestionId)).not.toBeNull();
  });

  it('remove() drops a single mark by stroke id (FR-24)', () => {
    const a = resolvedMark(q1a);
    const b = resolvedMark(q2c);
    marks.add(a);
    marks.add(b);

    expect(marks.remove(a.stroke.id)?.stroke.id).toBe(a.stroke.id);
    expect(marks.all().map((m) => m.stroke.id)).toEqual([b.stroke.id]);
  });

  it('remove() returns null for an unknown stroke id', () => {
    expect(marks.remove(resolvedMark(q1a).stroke.id)).toBeNull();
  });

  it('undo() removes the most recent mark (FR-25, US-4)', () => {
    const a = resolvedMark(q1a);
    const b = resolvedMark(q2c);
    marks.add(a);
    marks.add(b);

    expect(marks.undo()?.stroke.id).toBe(b.stroke.id);
    expect(marks.size).toBe(1);
  });

  it('undo() on an empty set returns null rather than throwing', () => {
    expect(() => marks.undo()).not.toThrow();
    expect(marks.undo()).toBeNull();
  });

  it('resolved() excludes unresolved marks (FR-20)', () => {
    marks.add(resolvedMark(q1a));
    marks.add(unresolvedMark());

    expect(marks.resolved()).toHaveLength(1);
  });

  it('unresolved() returns only the flagged ones (FR-13)', () => {
    marks.add(resolvedMark(q1a));
    marks.add(unresolvedMark('ambiguous'));

    const flagged = marks.unresolved();
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.resolution.status === 'unresolved' && flagged[0].resolution.reason).toBe(
      'ambiguous',
    );
  });

  it('clear() empties the set after submission (FR-14)', () => {
    marks.add(resolvedMark(q1a));
    marks.add(resolvedMark(q2c));
    marks.clear();

    expect(marks.size).toBe(0);
    expect(marks.all()).toEqual([]);
  });

  it('all() returns a copy, so callers cannot mutate internal state', () => {
    marks.add(resolvedMark(q1a));
    (marks.all() as unknown[]).length = 0;

    expect(marks.size).toBe(1);
  });
});

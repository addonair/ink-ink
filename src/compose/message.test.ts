import { beforeEach, describe, expect, it } from 'vitest';

import { makeOption, resetTestIds, resolvedMark, unresolvedMark } from '../test-support/marks';
import {
  composeAnswerMessage,
  composeReferenceMessage,
  DEFAULT_TRAILING_INSTRUCTION,
} from './message';

const opt = (label: string, ordinal: number) =>
  makeOption({ label, ordinal, questionId: `q${ordinal}` });

const DEFAULTS = { trailingInstruction: DEFAULT_TRAILING_INSTRUCTION };

describe('trailing instruction', () => {
  it('matches the wording in spec section 5.6', () => {
    expect(DEFAULT_TRAILING_INSTRUCTION).toBe('Mark these and explain any I got wrong.');
  });
});

describe('composeAnswerMessage (FR-26, spec 5.6)', () => {
  beforeEach(resetTestIds);

  it('produces exactly the shape given in spec section 5.6', () => {
    const marks = [resolvedMark(opt('B', 1)), resolvedMark(opt('C', 2)), resolvedMark(opt('B', 3))];

    expect(composeAnswerMessage(marks, DEFAULTS)).toBe(
      ['My answers:', '1. B', '2. C', '3. B', '', 'Mark these and explain any I got wrong.'].join(
        '\n',
      ),
    );
  });

  it('orders answers by question ordinal, not by draw order', () => {
    // Answered 3, then 1, then 2 — as someone skipping around a page would.
    const marks = [resolvedMark(opt('A', 3)), resolvedMark(opt('B', 1)), resolvedMark(opt('C', 2))];

    expect(composeAnswerMessage(marks, DEFAULTS)).toContain('1. B\n2. C\n3. A');
  });

  it('excludes unresolved marks (FR-20)', () => {
    const marks = [resolvedMark(opt('A', 1)), unresolvedMark('ambiguous')];
    const out = composeAnswerMessage(marks, DEFAULTS);

    expect(out).toContain('1. A');
    expect(out.split('\n').filter((l) => /^\d+\./.test(l))).toHaveLength(1);
  });

  it('appends the user-configured trailing instruction', () => {
    const out = composeAnswerMessage([resolvedMark(opt('A', 1))], {
      trailingInstruction: 'Grade strictly.',
    });

    expect(out).toBe('My answers:\n1. A\n\nGrade strictly.');
  });

  it('omits the trailing instruction when it is empty', () => {
    const out = composeAnswerMessage([resolvedMark(opt('A', 1))], { trailingInstruction: '   ' });

    expect(out).toBe('My answers:\n1. A');
    expect(out.endsWith('A')).toBe(true);
  });

  it('returns an empty string when there are no resolved marks', () => {
    expect(composeAnswerMessage([], DEFAULTS)).toBe('');
    expect(composeAnswerMessage([unresolvedMark()], DEFAULTS)).toBe('');
  });

  it('falls back to the option text when the label could not be parsed', () => {
    const unlabelled = makeOption({ label: 'X', ordinal: 1, questionId: 'q1', text: 'Paris' });
    delete unlabelled.label;

    expect(composeAnswerMessage([resolvedMark(unlabelled)], DEFAULTS)).toContain('1. Paris');
  });

  it('keeps an answer whose question ordinal is missing rather than dropping it', () => {
    // A parsing gap must not silently lose an answer the user gave.
    const noOrdinal = makeOption({ label: 'D', ordinal: 1, questionId: 'q9' });
    delete noOrdinal.ordinal;

    const out = composeAnswerMessage(
      [resolvedMark(opt('A', 1)), resolvedMark(noOrdinal)],
      DEFAULTS,
    );

    expect(out).toContain('1. A');
    expect(out).toContain('D');
  });
});

describe('composeReferenceMessage (FR-28, deferred US-7)', () => {
  it('quotes the marked passage above the typed question', () => {
    expect(composeReferenceMessage('The mitochondrion is the powerhouse.', 'Why?')).toBe(
      '> The mitochondrion is the powerhouse.\n\nWhy?',
    );
  });

  it('quotes every line of a multi-line passage', () => {
    expect(composeReferenceMessage('line one\nline two', 'Explain.')).toBe(
      '> line one\n> line two\n\nExplain.',
    );
  });

  it('returns just the quote when no question is typed', () => {
    expect(composeReferenceMessage('a passage', '')).toBe('> a passage');
  });
});

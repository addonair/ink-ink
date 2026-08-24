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

describe('questions flagged for explanation', () => {
  beforeEach(resetTestIds);

  it('appends a request naming the flagged questions', () => {
    const marks = [resolvedMark(opt('B', 1)), resolvedMark(opt('C', 2))];
    const out = composeAnswerMessage(marks, { ...DEFAULTS, explainOrdinals: [2] });

    expect(out).toContain(['My answers:', '1. B', '2. C'].join('\n'));
    // The user's own trailing instruction is left untouched.
    expect(out).toContain('Mark these and explain any I got wrong.');
    expect(out).toContain('question 2');
    // Asking even when correct is the point: a lucky guess is exactly when the
    // explanation is needed.
    expect(out).toMatch(/even if/i);
  });

  it('lists several flagged questions in order', () => {
    const marks = [resolvedMark(opt('A', 1)), resolvedMark(opt('B', 2))];
    const out = composeAnswerMessage(marks, { ...DEFAULTS, explainOrdinals: [4, 2] });

    expect(out).toContain('questions 2 and 4');
  });

  it('still composes a message when nothing was answered', () => {
    // "I could not answer any of these, please explain them" is a reasonable
    // thing to send, and used to be silently discarded because the composer
    // bailed as soon as there were no answered targets.
    const out = composeAnswerMessage([], { ...DEFAULTS, explainOrdinals: [1, 3] });

    expect(out).not.toBe('');
    expect(out).not.toContain('My answers:');
    expect(out).toContain('questions 1 and 3');
  });

  it('returns an empty string with neither answers nor flags', () => {
    expect(composeAnswerMessage([], { ...DEFAULTS, explainOrdinals: [] })).toBe('');
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

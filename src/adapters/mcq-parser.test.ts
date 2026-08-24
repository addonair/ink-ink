// @vitest-environment jsdom

/**
 * Capacity and identity of parsed questions.
 *
 * Prompted by the question "how many can I answer in one go?" — which turned
 * out to have two different answers depending on whether the questions are in
 * one response or several.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { parseMcqTargets } from './mcq-parser';

const OPTIONS = { scrollOffset: { x: 0, y: 0 } };

/** `count` four-option questions, numbered from `startAt`. */
function quiz(count: number, startAt = 1): string {
  let html = '';
  for (let q = 0; q < count; q++) {
    html += `<p>${startAt + q}. Question ${startAt + q}?</p><ul>`;
    for (const label of ['A', 'B', 'C', 'D']) {
      html += `<li><p>${label}) option ${label}</p></li>`;
    }
    html += '</ul>';
  }
  return html;
}

const parse = (selector: string) =>
  parseMcqTargets(document.querySelector<HTMLElement>(selector)!, OPTIONS);

describe('capacity', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('handles a long quiz in a single response', () => {
    // The spec's definition of done is a 20-question set; there is no cap.
    document.body.innerHTML = `<div id="m">${quiz(30)}</div>`;
    const targets = parse('#m');

    expect(targets).toHaveLength(120);
    expect(new Set(targets.map((t) => t.questionId)).size).toBe(30);
    expect(new Set(targets.map((t) => t.ordinal)).size).toBe(30);
  });

  it('reads question numbers beyond 99', () => {
    document.body.innerHTML = `<div id="m">${quiz(3, 100)}</div>`;
    expect([...new Set(parse('#m').map((t) => t.ordinal))]).toEqual([100, 101, 102]);
  });

  it('keeps question ids distinct across separate responses', () => {
    // Ask for a quiz, answer it, ask for another: both responses have a "1.".
    // Sharing an id made FR-21 treat them as the same question, so answering
    // the new Q1 silently erased the answer to the old one.
    document.body.innerHTML = `<div id="a">${quiz(2)}</div><div id="b">${quiz(2)}</div>`;

    const first = parse('#a');
    const second = parse('#b');
    const shared = first.filter((t) => second.some((o) => o.questionId === t.questionId));

    expect(shared).toHaveLength(0);
  });

  it('gives a message the same ids when re-measured', () => {
    // Ids must be stable across re-measures, or a mark would stop matching its
    // own question the moment the page was measured again.
    document.body.innerHTML = `<div id="m">${quiz(2)}</div>`;

    expect(parse('#m').map((t) => t.questionId)).toEqual(parse('#m').map((t) => t.questionId));
  });
});

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __stopStreamWatcher, deepseekAdapter } from './deepseek';
import { parseMcqTargets, parseOptionLabel } from './mcq-parser';
import { scrollOffsetOf } from './scroll';

/** This fixture page scrolls the window, so the offset is the window's. */
const OFFSET = (): { x: number; y: number } => scrollOffsetOf(null);

/**
 * jsdom does not lay out, so every rect is zero. Stub it with a synthetic
 * layout keyed off document order, which is enough to prove the
 * viewport → document conversion in FR-9.
 */
function stubLayout(scrollY = 0): void {
  Object.defineProperty(window, 'scrollY', { value: scrollY, writable: true });
  Object.defineProperty(window, 'scrollX', { value: 0, writable: true });

  const all = [...document.querySelectorAll('li, p')];
  all.forEach((el, i) => {
    el.getBoundingClientRect = (): DOMRect =>
      ({
        left: 100,
        top: i * 30 - scrollY,
        right: 300,
        bottom: i * 30 + 20 - scrollY,
        width: 200,
        height: 20,
        x: 100,
        y: i * 30 - scrollY,
        toJSON: () => ({}),
      }) as DOMRect;
  });
}

const message = (): HTMLElement => {
  const el = deepseekAdapter.assistantMessages()[0];
  if (el === undefined) throw new Error('no assistant message found');
  return el;
};

afterEach(() => {
  __stopStreamWatcher();
  vi.restoreAllMocks();
});

describe('parseOptionLabel', () => {
  it('parses every format spec section 8 lists', () => {
    expect(parseOptionLabel('A) Berlin')).toEqual({ label: 'A', rest: 'Berlin' });
    expect(parseOptionLabel('B. Mercury')).toEqual({ label: 'B', rest: 'Mercury' });
    expect(parseOptionLabel('(C) 64')).toEqual({ label: 'C', rest: '64' });
    expect(parseOptionLabel('D - Ayi Kwei Armah')).toEqual({ label: 'D', rest: 'Ayi Kwei Armah' });
  });

  it('uppercases lowercase labels so a) and A) group together', () => {
    expect(parseOptionLabel('a) Berlin')?.label).toBe('A');
  });

  it('rejects a label with no text after it', () => {
    // "A." ending a sentence, or a lone initial, is not an option line.
    expect(parseOptionLabel('A.')).toBeNull();
    expect(parseOptionLabel('B)')).toBeNull();
  });

  it('rejects ordinary prose', () => {
    expect(parseOptionLabel('The capital of France is Paris.')).toBeNull();
    expect(parseOptionLabel('1. What is the capital of France?')).toBeNull();
  });
});

describe('assistantMessages', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds messages by the fast-path selector', () => {
    document.body.innerHTML = `
      <div data-message-author-role="assistant">
        <p>1. Capital of France?</p>
        <ul><li>A) Berlin</li><li>B) Paris</li></ul>
      </div>`;

    expect(deepseekAdapter.assistantMessages()).toHaveLength(1);
  });

  it('falls back to structure when every known selector misses (NFR-9)', () => {
    // No recognisable class or data attribute anywhere — a redesign.
    document.body.innerHTML = `
      <main><div class="x7f2a">
        <p>1. Capital of France?</p>
        <ul><li>A) Berlin</li><li>B) Paris</li><li>C) Madrid</li></ul>
      </div></main>`;

    const found = deepseekAdapter.assistantMessages();
    expect(found.length).toBeGreaterThan(0);
    stubLayout();
    expect(deepseekAdapter.parseTargets(found[0]!, OFFSET()).map((t) => t.label)).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  it('does not treat composer contents as a message', () => {
    document.body.innerHTML = `
      <textarea>A) Berlin
B) Paris</textarea>`;

    expect(deepseekAdapter.assistantMessages()).toHaveLength(0);
  });

  it('returns an empty array on a page with nothing to parse', () => {
    document.body.innerHTML = '<p>Just a conversation.</p>';
    expect(deepseekAdapter.assistantMessages()).toEqual([]);
  });
});

describe('parseTargets', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div data-message-author-role="assistant">
        <p>1. What is the capital of France?</p>
        <ul><li>A) Berlin</li><li>B) Paris</li><li>C) Madrid</li></ul>
        <p>2. Closest planet to the Sun?</p>
        <ul><li>A. Venus</li><li>B. Mercury</li><li>C. Mars</li></ul>
        <p>3. What is 7 x 8?</p>
        <ul><li>(A) 54</li><li>(B) 56</li><li>(C) 64</li></ul>
      </div>`;
    stubLayout();
  });

  it('parses "A)" / "A." / "(A)" / list-item option formats', () => {
    const targets = deepseekAdapter.parseTargets(message(), OFFSET());
    expect(targets).toHaveLength(9);
    expect(targets.map((t) => t.label)).toEqual(['A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C']);
  });

  it('groups options under their question via questionId (FR-21)', () => {
    const targets = deepseekAdapter.parseTargets(message(), OFFSET());
    const groups = new Set(targets.map((t) => t.questionId));

    expect(groups.size).toBe(3);
    // Every option in one question shares its questionId, so marking a second
    // option can displace the first.
    const q1 = targets.filter((t) => t.ordinal === 1);
    expect(new Set(q1.map((t) => t.questionId)).size).toBe(1);
  });

  it('numbers questions from the prompt text, not just position', () => {
    const targets = deepseekAdapter.parseTargets(message(), OFFSET());
    expect([...new Set(targets.map((t) => t.ordinal))]).toEqual([1, 2, 3]);
  });

  it('reports bounds in document coordinates, not viewport (FR-9)', () => {
    const atTop = deepseekAdapter.parseTargets(message(), OFFSET());

    // Scroll down; viewport rects shift up, but document coordinates must not.
    stubLayout(500);
    const scrolled = deepseekAdapter.parseTargets(message(), OFFSET());

    expect(scrolled.map((t) => t.bounds.y)).toEqual(atTop.map((t) => t.bounds.y));
  });

  it('measures each option line, not the list wrapping them', () => {
    // A wrapper-sized box would overlap every option and make every circle
    // ambiguous.
    const targets = deepseekAdapter.parseTargets(message(), OFFSET());
    for (const t of targets) {
      expect(t.bounds.height).toBe(20);
    }
  });

  it('ignores a lone matching line rather than inventing a one-option question', () => {
    document.body.innerHTML = `
      <div data-message-author-role="assistant">
        <p>B. Mercury is closest to the Sun.</p>
      </div>`;
    stubLayout();

    expect(deepseekAdapter.parseTargets(message(), OFFSET())).toEqual([]);
  });

  it('returns an empty array rather than throwing on unparseable markup (NFR-9)', () => {
    document.body.innerHTML = '<div data-message-author-role="assistant"></div>';
    expect(() => deepseekAdapter.parseTargets(message(), OFFSET())).not.toThrow();
    expect(deepseekAdapter.parseTargets(message(), OFFSET())).toEqual([]);
  });
});

describe('paragraph-style options', () => {
  it('splits questions on the interrupting prompt, not just by parent', () => {
    // Bare <p> lines share one parent, so grouping by parent alone would merge
    // both questions into one.
    document.body.innerHTML = `
      <div data-message-author-role="assistant">
        <p>1. Capital of France?</p>
        <p>A) Berlin</p>
        <p>B) Paris</p>
        <p>2. Closest planet?</p>
        <p>A) Venus</p>
        <p>B) Mercury</p>
      </div>`;
    stubLayout();

    const targets = parseMcqTargets(message());
    expect(new Set(targets.map((t) => t.questionId)).size).toBe(2);
    expect([...new Set(targets.map((t) => t.ordinal))]).toEqual([1, 2]);
  });
});

describe('nested option markup', () => {
  // The shapes that made a real DeepSeek response parse to zero options.
  // Grouping by "consecutive children of one parent" fails all of these,
  // because each option's parent is a different wrapper element.

  it('parses a loose markdown list: <li><p>A) ...</p></li>', () => {
    document.body.innerHTML = `
      <div data-message-author-role="assistant">
        <p>1. Capital of France?</p>
        <ul>
          <li><p>A) Berlin</p></li>
          <li><p>B) Paris</p></li>
          <li><p>C) Madrid</p></li>
        </ul>
      </div>`;
    stubLayout();

    const targets = parseMcqTargets(message());
    expect(targets.map((t) => t.label)).toEqual(['A', 'B', 'C']);
    expect(new Set(targets.map((t) => t.questionId)).size).toBe(1);
  });

  it('parses one option per wrapper div', () => {
    document.body.innerHTML = `
      <div data-message-author-role="assistant">
        <p>1. Capital of France?</p>
        <div><span>A) Berlin</span></div>
        <div><span>B) Paris</span></div>
        <div><span>C) Madrid</span></div>
      </div>`;
    stubLayout();

    expect(parseMcqTargets(message()).map((t) => t.label)).toEqual(['A', 'B', 'C']);
  });

  it('splits two questions when the labels restart at A', () => {
    // The strongest markup-independent signal that a new question began.
    document.body.innerHTML = `
      <div data-message-author-role="assistant">
        <p>1. Capital of France?</p>
        <ul><li><p>A) Berlin</p></li><li><p>B) Paris</p></li></ul>
        <p>2. Closest planet?</p>
        <ul><li><p>A) Venus</p></li><li><p>B) Mercury</p></li></ul>
      </div>`;
    stubLayout();

    const targets = parseMcqTargets(message());
    expect(targets).toHaveLength(4);
    expect(new Set(targets.map((t) => t.questionId)).size).toBe(2);
    expect([...new Set(targets.map((t) => t.ordinal))]).toEqual([1, 2]);
  });

  it('still ignores a lone option-shaped line in prose', () => {
    document.body.innerHTML = `
      <div data-message-author-role="assistant">
        <p>B) Paris is the answer most people give.</p>
      </div>`;
    stubLayout();

    expect(parseMcqTargets(message())).toEqual([]);
  });

  it('finds the question prompt across a wrapper boundary', () => {
    document.body.innerHTML = `
      <div data-message-author-role="assistant">
        <div><p>3. What is 7 x 8?</p></div>
        <ul><li><p>A) 54</p></li><li><p>B) 56</p></li></ul>
      </div>`;
    stubLayout();

    // Ordinal comes from the prompt text, not from position.
    expect([...new Set(parseMcqTargets(message()).map((t) => t.ordinal))]).toEqual([3]);
  });
});

describe('isStreaming', () => {
  it('reports false on a settled page', () => {
    document.body.innerHTML = '<div data-message-author-role="assistant"></div>';
    deepseekAdapter.assistantMessages(); // starts the watcher
    expect(deepseekAdapter.isStreaming()).toBe(false);
  });

  it('reports true while the page is mutating', async () => {
    document.body.innerHTML = '<div data-message-author-role="assistant"></div>';
    deepseekAdapter.assistantMessages();

    document.body.appendChild(document.createElement('span'));
    // MutationObserver callbacks are delivered as microtasks.
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(deepseekAdapter.isStreaming()).toBe(true);
  });
});

describe('composer and insertText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds a fixed-position composer', () => {
    // offsetParent is null for fixed elements, so a check based on it would
    // reject exactly the element it is meant to find.
    document.body.innerHTML = `<textarea id="chat-input" style="position:fixed"></textarea>`;
    expect(deepseekAdapter.composer()?.id).toBe('chat-input');
  });

  it('skips a hidden composer', () => {
    document.body.innerHTML = `<textarea style="display:none"></textarea>`;
    expect(deepseekAdapter.composer()).toBeNull();
  });

  it('returns null when there is no composer', () => {
    document.body.innerHTML = '<p>nothing here</p>';
    expect(deepseekAdapter.composer()).toBeNull();
  });

  it('inserts into a textarea and fires input (FR-26)', () => {
    document.body.innerHTML = `<textarea id="chat-input"></textarea>`;
    const el = document.querySelector<HTMLTextAreaElement>('#chat-input')!;
    const events: string[] = [];
    el.addEventListener('input', () => events.push('input'));

    expect(deepseekAdapter.insertText('My answers:\n1. B')).toBe(true);
    expect(el.value).toBe('My answers:\n1. B');
    expect(events).toEqual(['input']);
  });

  it('inserts into a contenteditable composer', () => {
    document.body.innerHTML = `<div contenteditable="true" role="textbox"></div>`;
    const el = document.querySelector<HTMLElement>('[contenteditable]')!;

    expect(deepseekAdapter.insertText('1. B')).toBe(true);
    expect(el.textContent).toBe('1. B');
  });

  it('never sends: no Enter key and no click is dispatched (FR-27, NFR-8)', () => {
    document.body.innerHTML = `
      <textarea id="chat-input"></textarea>
      <button id="send">Send</button>`;
    const seen: string[] = [];
    for (const type of ['keydown', 'keypress', 'keyup', 'click', 'submit']) {
      document.addEventListener(type, (e) => seen.push(`${type}:${(e.target as Element).id}`));
    }

    deepseekAdapter.insertText('My answers:\n1. B');

    expect(seen).toEqual([]);
  });

  it('returns false rather than throwing when there is nowhere to insert', () => {
    document.body.innerHTML = '<p>no composer</p>';
    expect(deepseekAdapter.insertText('anything')).toBe(false);
  });
});

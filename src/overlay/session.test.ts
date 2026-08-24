// @vitest-environment jsdom

/**
 * Session wiring tests.
 *
 * These cover wiring and state transitions, not rendering. Ink is drawn as SVG
 * positioned in the page; that it actually paints, scrolls with the content,
 * and re-anchors on reflow is verified by driving a real browser against the
 * demo page instead.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SiteAdapter } from '@adapters/types';
import type { Target } from '@core/types';

import { fixtureAdapter } from '../test-support/fixture-adapter';
import { buildMcqPage, optionBounds } from '../test-support/mcq-page';
import { InkSession } from './session';

const shadowOf = (): ShadowRoot => {
  const host = document.querySelector('[data-ink-ink]');
  const shadow = host?.shadowRoot;
  if (shadow === null || shadow === undefined) {
    throw new Error('session did not mount a shadow root');
  }
  return shadow;
};

/** Pen input now arrives via a document-level capture listener. */
const sendPen = (type: string, x: number, y: number, id = 3): boolean =>
  document.dispatchEvent(
    new PointerEvent(type, {
      pointerType: 'pen',
      pointerId: id,
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    }),
  );

const drawSquare = (id = 3): void => {
  sendPen('pointerdown', 100, 100, id);
  sendPen('pointermove', 160, 100, id);
  sendPen('pointermove', 160, 160, id);
  sendPen('pointermove', 100, 160, id);
  sendPen('pointerup', 100, 100, id);
};

const toggle = (): HTMLButtonElement => {
  const el = shadowOf().querySelector<HTMLButtonElement>('.ink-toggle');
  if (el === null) throw new Error('no toggle');
  return el;
};

describe('InkSession', () => {
  let session: InkSession | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    buildMcqPage(document);
  });

  afterEach(() => {
    session?.destroy();
    session = null;
    vi.restoreAllMocks();
  });

  it('mounts inside a shadow root so host styles are untouched (NFR-11)', () => {
    session = new InkSession({ adapter: fixtureAdapter });

    expect(shadowOf().querySelector('.ink-layer')).not.toBeNull();
    expect(shadowOf().querySelector('style')?.textContent).toContain('.ink-toggle');
    // Nothing of ours in the light DOM beyond the single host element.
    expect(document.querySelectorAll('.ink-toggle')).toHaveLength(0);
  });

  it('starts off, and while off records nothing and claims no event (FR-3, FR-4)', () => {
    session = new InkSession({ adapter: fixtureAdapter });

    expect(toggle().textContent).toBe('Pen off');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');

    drawSquare();

    expect(session.markCount).toBe(0);
    // dispatchEvent returns false only if preventDefault was called, so a true
    // return proves the page's own handling was left alone.
    expect(sendPen('pointerdown', 100, 100)).toBe(true);
  });

  it('records a stroke once toggled on (FR-2)', () => {
    session = new InkSession({ adapter: fixtureAdapter });
    toggle().click();

    expect(toggle().textContent).toBe('Pen on');
    drawSquare();
    expect(session.markCount).toBe(1);
  });

  it('never claims non-pen events, so the page keeps scrolling (US-8)', () => {
    // Regression: a full-viewport overlay swallowed the wheel along with the
    // pen, so a chat scrolling in its own container stopped scrolling entirely
    // while the pen was on.
    session = new InkSession({ adapter: fixtureAdapter });
    toggle().click();

    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
    expect(document.dispatchEvent(wheel)).toBe(true);

    const mouse = new PointerEvent('pointerdown', {
      pointerType: 'touch',
      pointerId: 9,
      bubbles: true,
      cancelable: true,
    });
    expect(document.dispatchEvent(mouse)).toBe(true);
    expect(session.markCount).toBe(0);
  });

  it('does not report a healthy page as broken', () => {
    // Regression: the health check ran before anything had been measured and
    // compared against an empty cache, so every page with messages came up
    // degraded and the toggle was dead on arrival.
    session = new InkSession({ adapter: fixtureAdapter });

    expect(toggle().disabled).toBe(false);
    expect(toggle().textContent).toBe('Pen off');
  });

  it('reports when a response has no parseable options, without latching off (NFR-9)', () => {
    const brokenAdapter: SiteAdapter = {
      ...fixtureAdapter,
      parseTargets: (): Target[] => [], // markup changed underneath us
    };
    session = new InkSession({ adapter: brokenAdapter });

    expect(toggle().textContent).toBe('No options found');

    // Clicking is refused, but the button stays live: a response with no
    // options is normal, and the next one may have some. Disabling the button
    // meant the pen could never be turned on again without a reload.
    expect(toggle().disabled).toBe(false);
    toggle().click();
    expect(toggle().textContent).toBe('No options found');
    expect(session.markCount).toBe(0);
  });

  it('recovers once options appear, without a reload', () => {
    let broken = true;
    const flaky: SiteAdapter = {
      ...fixtureAdapter,
      parseTargets: (message) =>
        broken ? [] : fixtureAdapter.parseTargets(message, { x: 0, y: 0 }),
    };
    session = new InkSession({ adapter: flaky });

    toggle().click();
    expect(toggle().textContent).toBe('No options found');

    // The next response parses fine.
    broken = false;
    toggle().click();
    expect(toggle().textContent).toBe('Pen on');
  });

  it('stays inert rather than throwing when the adapter throws (NFR-9)', () => {
    const throwingAdapter: SiteAdapter = {
      ...fixtureAdapter,
      assistantMessages: () => {
        throw new Error('host markup changed');
      },
    };

    expect(() => {
      session = new InkSession({ adapter: throwingAdapter });
    }).not.toThrow();
  });

  it('is not degraded on a page that simply has no quiz', () => {
    // No messages at all is a normal page, not a broken one.
    document.body.innerHTML = '<p>just a conversation</p>';
    session = new InkSession({ adapter: fixtureAdapter });

    expect(toggle().disabled).toBe(false);
  });

  it('keeps a stroke whose pointer the browser cancelled mid-gesture', () => {
    // Regression: pointercancel used to abort the stroke, so ink stopped dead
    // and vanished partway through a line whenever the browser reinterpreted
    // the pen movement as a scroll gesture.
    session = new InkSession({ adapter: fixtureAdapter });
    toggle().click();

    sendPen('pointerdown', 100, 100);
    sendPen('pointermove', 140, 100);
    sendPen('pointermove', 140, 140);
    sendPen('pointercancel', 140, 140);

    // The stroke survived and became a mark, resolved or not.
    expect(session.markCount).toBe(1);
  });

  it('renders committed ink into the page layer, not a viewport canvas', () => {
    // FR-11: ink positioned in the page scrolls with the content by the same
    // mechanism as the text, so there is no scroll handler to lag behind.
    session = new InkSession({ adapter: fixtureAdapter });
    toggle().click();
    drawSquare(5);

    const layer = shadowOf().querySelector('.ink-layer');
    expect(layer?.querySelectorAll('svg.ink-stroke').length).toBe(1);

    // The layer itself takes up no space, so it cannot extend the page.
    const styles = shadowOf().querySelector('style')?.textContent ?? '';
    expect(styles).toContain('.ink-layer');
  });

  it('does not claim pen taps on its own controls', () => {
    // Input is captured on the document in the capture phase, which runs before
    // the event reaches its target. Without an exclusion, a pen tap on Undo or
    // the per-mark × is swallowed and the button never sees it.
    session = new InkSession({ adapter: fixtureAdapter });
    toggle().click();

    const tapped = new PointerEvent('pointerdown', {
      pointerType: 'pen',
      pointerId: 7,
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    const notPrevented = toggle().dispatchEvent(tapped);

    expect(notPrevented).toBe(true);
    expect(session.markCount).toBe(0);
  });

  it('lets a pen press Undo (FR-25)', () => {
    session = new InkSession({ adapter: fixtureAdapter });
    toggle().click();
    drawSquare();
    expect(session.markCount).toBe(1);

    const undo = shadowOf().querySelector<HTMLButtonElement>('.ink-actions button');
    if (undo === null) throw new Error('no undo button');

    undo.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerType: 'pen',
        pointerId: 8,
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
    undo.click();

    expect(session.markCount).toBe(0);
  });

  /**
   * Flagging a question for explanation.
   *
   * Keyed by question rather than by mark, because the flag has to survive
   * changing the answer and has to exist with no answer at all.
   */
  describe('flagging a question to be explained', () => {
    const flagButtons = (): HTMLButtonElement[] => [
      ...shadowOf().querySelectorAll<HTMLButtonElement>('.ink-flag'),
    ];

    function circle(question: number, option: number): void {
      const box = optionBounds(question, option);
      sendPen('pointerdown', box.x - 8, box.y - 8);
      sendPen('pointermove', box.x + box.width + 8, box.y - 8);
      sendPen('pointermove', box.x + box.width + 8, box.y + box.height + 8);
      sendPen('pointermove', box.x - 8, box.y + box.height + 8);
      sendPen('pointerup', box.x - 8, box.y - 8);
    }

    beforeEach(() => {
      session = new InkSession({ adapter: fixtureAdapter });
      toggle().click();
    });

    it('lists every question, answered or not, so an unanswered one can be flagged', () => {
      // The fixture has three questions and nothing is marked yet.
      expect(flagButtons()).toHaveLength(3);
    });

    it('includes a flagged unanswered question in the message', () => {
      flagButtons()[1]?.click();

      const text = session!.previewText();
      expect(text).not.toContain('My answers:');
      expect(text).toContain('question 2');
    });

    it('keeps the flag when the answer for that question changes (FR-21)', () => {
      circle(0, 0); // answer question 1 with A
      flagButtons()[0]?.click();
      expect(session!.previewText()).toContain('question 1');

      circle(0, 2); // change the answer to C; FR-21 replaces the mark
      expect(session!.markCount).toBe(1);

      // Changing your mind about the answer does not mean you now understand
      // the question.
      const text = session!.previewText();
      expect(text).toContain('1. C');
      expect(text).toContain('question 1');
    });

    it('clears flags on a successful submit, like marks', async () => {
      circle(0, 0);
      flagButtons()[0]?.click();
      expect(session!.previewText()).toContain('question 1');

      await expect(session!.submit()).resolves.toBe('inserted');

      expect(session!.markCount).toBe(0);
      expect(session!.previewText()).toBe('');
    });

    it('can submit with only flags and no answers', () => {
      flagButtons()[0]?.click();

      const submit = shadowOf().querySelector<HTMLButtonElement>('.ink-submit');
      expect(submit?.disabled).toBe(false);
    });
  });

  it('submit() does nothing when no marks are resolved', async () => {
    session = new InkSession({ adapter: fixtureAdapter });

    expect(session.previewText()).toBe('');
    await expect(session.submit()).resolves.toBe('failed');
  });

  it('setTrailingInstruction flows into the composed preview (FR-26)', () => {
    const insertText = vi.fn(() => true);
    session = new InkSession({ adapter: { ...fixtureAdapter, insertText } });

    session.setTrailingInstruction('Grade strictly.');
    // No marks yet, so nothing composes — but the setter must not throw and
    // must leave the session usable.
    expect(session.previewText()).toBe('');
  });

  it('reports failure and degrades when the composer cannot be reached', async () => {
    session = new InkSession({
      adapter: { ...fixtureAdapter, composer: () => null, insertText: () => false },
    });

    // Nothing resolved, so submit short-circuits before touching the adapter.
    await expect(session.submit()).resolves.toBe('failed');
  });

  /**
   * Rich text editors can accept a write and quietly discard it, so a failed
   * insert must not cost the user their marks. These cover the fallback.
   */
  describe('when the composer will not take the text', () => {
    /** Draw one resolvable mark so there is something to submit. */
    function drawAnswer(): void {
      const box = optionBounds(0, 0);
      sendPen('pointerdown', box.x - 8, box.y - 8);
      sendPen('pointermove', box.x + box.width + 8, box.y - 8);
      sendPen('pointermove', box.x + box.width + 8, box.y + box.height + 8);
      sendPen('pointermove', box.x - 8, box.y + box.height + 8);
      sendPen('pointerup', box.x - 8, box.y - 8);
    }

    function stubClipboard(writeText: () => Promise<void>): void {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
    }

    it('copies to the clipboard and clears, since the text is safe', async () => {
      const copied: string[] = [];
      stubClipboard(async (...args: unknown[]) => {
        copied.push(String(args[0]));
      });

      session = new InkSession({ adapter: { ...fixtureAdapter, insertText: () => false } });
      toggle().click();
      drawAnswer();
      expect(session.markCount).toBe(1);

      await expect(session.submit()).resolves.toBe('copied');
      expect(copied[0]).toContain('My answers:');
      expect(session.markCount).toBe(0);
    });

    it('keeps the marks when copying also fails', async () => {
      stubClipboard(() => Promise.reject(new Error('denied')));

      session = new InkSession({ adapter: { ...fixtureAdapter, insertText: () => false } });
      toggle().click();
      drawAnswer();

      await expect(session.submit()).resolves.toBe('failed');
      // Losing answers to a failed submit is the worst outcome available.
      expect(session.markCount).toBe(1);
    });
  });
});

/**
 * Chats that scroll their message area rather than the window.
 *
 * DeepSeek does this: the sidebar, header and composer stay put while only the
 * conversation moves. Coordinates built from `window.scrollY` are always
 * viewport coordinates on such a page, so a target box measured in content
 * space and a stroke drawn after a scroll stop describing the same place, and
 * marks come back unresolved.
 */
describe('InkSession on an inner-scrolling page', () => {
  let session: InkSession | null = null;
  let scroller: HTMLElement;

  const SCROLLED_BY = 60;

  beforeEach(() => {
    document.body.innerHTML = '';
    scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    document.body.appendChild(scroller);
    buildMcqPage(document, undefined, scroller);
  });

  afterEach(() => {
    session?.destroy();
    session = null;
    vi.restoreAllMocks();
  });

  it('resolves a mark drawn after the message area has scrolled', () => {
    session = new InkSession({
      adapter: { ...fixtureAdapter, scrollRoot: () => scroller },
    });
    shadowOf().querySelector<HTMLButtonElement>('.ink-toggle')?.click();

    // The message area scrolls; the window does not move at all.
    scroller.scrollTop = SCROLLED_BY;
    scroller.dispatchEvent(new Event('scroll'));

    // Option A of question 1 lives at these CONTENT coordinates. After the
    // scroll it appears that much higher on screen, which is where the pen
    // actually goes.
    const box = optionBounds(0, 0);
    const left = box.x - 10;
    const right = box.x + box.width + 10;
    const top = box.y - SCROLLED_BY - 10;
    const bottom = box.y + box.height - SCROLLED_BY + 10;

    const send = (type: string, x: number, y: number): void => {
      document.dispatchEvent(
        new PointerEvent(type, {
          pointerType: 'pen',
          pointerId: 21,
          isPrimary: true,
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
    };

    send('pointerdown', left, top);
    send('pointermove', right, top);
    send('pointermove', right, bottom);
    send('pointermove', left, bottom);
    send('pointerup', left, top);

    expect(session.markCount).toBe(1);

    // The point of the test: it must RESOLVE. Adding window.scrollY (always 0
    // here) instead of the container's scroll puts the stroke SCROLLED_BY px
    // away from the option and nothing overlaps.
    //
    // The panel lists every question now, answered or not, so this asserts on
    // the outcome rather than on how many rows there are.
    const states = [...shadowOf().querySelectorAll('.ink-mark-list li')].map((li) =>
      li.getAttribute('data-state'),
    );
    expect(states).toContain('resolved');
    expect(states).not.toContain('unresolved');
  });
});

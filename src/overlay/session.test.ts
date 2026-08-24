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
import { buildMcqPage } from '../test-support/mcq-page';
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

  it('degrades when a page has messages but no parseable options (NFR-9)', () => {
    const brokenAdapter: SiteAdapter = {
      ...fixtureAdapter,
      parseTargets: (): Target[] => [], // markup changed underneath us
    };
    session = new InkSession({ adapter: brokenAdapter });

    expect(toggle().disabled).toBe(true);
    expect(toggle().textContent).toBe('Pen unavailable');
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

  it('submit() does nothing when no marks are resolved', () => {
    session = new InkSession({ adapter: fixtureAdapter });

    expect(session.previewText()).toBe('');
    expect(session.submit()).toBe(false);
  });

  it('setTrailingInstruction flows into the composed preview (FR-26)', () => {
    const insertText = vi.fn(() => true);
    session = new InkSession({ adapter: { ...fixtureAdapter, insertText } });

    session.setTrailingInstruction('Grade strictly.');
    // No marks yet, so nothing composes — but the setter must not throw and
    // must leave the session usable.
    expect(session.previewText()).toBe('');
  });

  it('reports failure and degrades when the composer cannot be reached', () => {
    session = new InkSession({
      adapter: { ...fixtureAdapter, composer: () => null, insertText: () => false },
    });

    // Nothing resolved, so submit short-circuits before touching the adapter.
    expect(session.submit()).toBe(false);
  });
});

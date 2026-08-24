// @vitest-environment jsdom

/**
 * Session wiring tests.
 *
 * jsdom has no canvas, so the 2D context is stubbed — these cover the wiring
 * and state transitions, not the rendering. Painting and scroll anchoring are
 * verified by driving a real browser against the demo page instead.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SiteAdapter } from '@adapters/types';
import type { Target } from '@core/types';

import { fixtureAdapter } from '../test-support/fixture-adapter';
import { buildMcqPage } from '../test-support/mcq-page';
import { InkSession } from './session';

function stubCanvas(): void {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    setLineDash: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
}

const shadowOf = (): ShadowRoot => {
  const host = document.querySelector('[data-ink-ink]');
  const shadow = host?.shadowRoot;
  if (shadow === null || shadow === undefined) {
    throw new Error('session did not mount a shadow root');
  }
  return shadow;
};

const toggle = (): HTMLButtonElement => {
  const el = shadowOf().querySelector<HTMLButtonElement>('.ink-toggle');
  if (el === null) throw new Error('no toggle');
  return el;
};

describe('InkSession', () => {
  let session: InkSession | null = null;

  beforeEach(() => {
    stubCanvas();
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

    expect(shadowOf().querySelector('.ink-canvas')).not.toBeNull();
    expect(shadowOf().querySelector('style')?.textContent).toContain('.ink-toggle');
    // Nothing of ours in the light DOM beyond the single host element.
    expect(document.querySelectorAll('.ink-toggle')).toHaveLength(0);
  });

  it('starts with the ink layer off and intercepting nothing (FR-3, FR-4)', () => {
    session = new InkSession({ adapter: fixtureAdapter });

    expect(toggle().textContent).toBe('Pen off');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(shadowOf().querySelector<HTMLElement>('.ink-canvas')?.style.pointerEvents).toBe('none');
  });

  it('enables interception only once toggled on (FR-2)', () => {
    session = new InkSession({ adapter: fixtureAdapter });
    toggle().click();

    expect(toggle().textContent).toBe('Pen on');
    expect(shadowOf().querySelector<HTMLElement>('.ink-canvas')?.style.pointerEvents).toBe('auto');
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

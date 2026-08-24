/**
 * A real `SiteAdapter` over the synthetic MCQ page.
 *
 * Test-only: NOT registered in `src/adapters/registry.ts`, so it is
 * unreachable from the bundle. Its job is to prove the `SiteAdapter` interface
 * is actually sufficient to drive the pipeline — if the interface is the wrong
 * shape, that surfaces here rather than halfway through writing real DeepSeek
 * selectors.
 */

import { OPTION_PATTERNS } from '@adapters/deepseek';
import type { ScrollOffset } from '@adapters/scroll';
import type { SiteAdapter } from '@adapters/types';
import type { QuestionId, Rect, Target, TargetId } from '@core/types';

const SELECTORS = {
  assistantMessage: '[data-role="assistant"]',
  questionBlock: '[data-question]',
  option: 'li[data-rect]',
  composer: '[data-role="composer"]',
} as const;

/** Read the explicit geometry the fixture assigned (jsdom does not lay out). */
function boundsOf(el: Element): Rect | null {
  const raw = el.getAttribute('data-rect');
  if (raw === null) return null;

  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;

  const [x, y, width, height] = parts as [number, number, number, number];
  return { x, y, width, height };
}

/** Split "B) Paris" into its label and text, trying each accepted format. */
function parseOption(text: string): { label: string; rest: string } | null {
  for (const pattern of OPTION_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      return { label: match[1].toUpperCase(), rest: match[2] };
    }
  }
  return null;
}

export const fixtureAdapter: SiteAdapter = {
  id: 'fixture',
  label: 'Fixture (test only)',

  matches(url: URL): boolean {
    return url.hostname === 'fixture.test';
  },

  assistantMessages(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>(SELECTORS.assistantMessage)];
  },

  // Geometry comes from explicit data-rect attributes already in content
  // coordinates, so the offset is deliberately unused here.
  parseTargets(message: HTMLElement, _scrollOffset: ScrollOffset): Target[] {
    const targets: Target[] = [];

    for (const block of message.querySelectorAll<HTMLElement>(SELECTORS.questionBlock)) {
      const ordinal = Number(block.getAttribute('data-question'));
      if (Number.isNaN(ordinal)) continue;

      const questionId = `q${ordinal}` as QuestionId;

      for (const li of block.querySelectorAll<HTMLElement>(SELECTORS.option)) {
        const bounds = boundsOf(li);
        const text = li.textContent ?? '';
        const parsed = parseOption(text);

        // An unparseable option line is skipped, not guessed at (NFR-9).
        if (bounds === null || parsed === null) continue;

        targets.push({
          id: `${questionId}-${parsed.label}` as TargetId,
          kind: 'option',
          bounds,
          text,
          label: parsed.label,
          questionId,
          ordinal,
        });
      }
    }

    return targets;
  },

  /** This page scrolls the window, so there is no inner container. */
  scrollRoot(): HTMLElement | null {
    return null;
  },

  isStreaming(): boolean {
    return document.body.hasAttribute('data-streaming');
  },

  composer(): HTMLElement | null {
    return document.querySelector<HTMLElement>(SELECTORS.composer);
  },

  insertText(text: string): boolean {
    const el = this.composer();
    if (el === null) return false;

    // Sets the value and fires `input`, exactly as the real adapter must —
    // and dispatches no Enter and clicks no send button (FR-27, NFR-8).
    (el as HTMLTextAreaElement).value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  },
};

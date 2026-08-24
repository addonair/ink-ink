/**
 * A `SiteAdapter` over the demo page's own markup.
 *
 * Unlike the test fixture, this one measures for real with
 * `getBoundingClientRect` and converts to document coordinates — so the demo
 * exercises the same measurement path the DeepSeek adapter will use, including
 * the scroll-offset conversion FR-9 depends on.
 *
 * Not registered in `src/adapters/registry.ts`; it is only reachable from the
 * demo entry point and never reaches the extension bundle.
 */

import { OPTION_PATTERNS } from '@adapters/deepseek';
import type { SiteAdapter } from '@adapters/types';
import type { QuestionId, Rect, Target, TargetId } from '@core/types';

const SELECTORS = {
  assistantMessage: '[data-role="assistant"]',
  questionBlock: '[data-question]',
  option: 'li',
  composer: '#composer',
  streaming: '[data-streaming="true"]',
} as const;

/** Viewport rect to document coordinates (FR-9, FR-16). */
function documentRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + window.scrollX,
    y: r.top + window.scrollY,
    width: r.width,
    height: r.height,
  };
}

function parseOption(text: string): { label: string; rest: string } | null {
  for (const pattern of OPTION_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      return { label: match[1].toUpperCase(), rest: match[2] };
    }
  }
  return null;
}

export const demoAdapter: SiteAdapter = {
  id: 'demo',
  label: 'Demo page',

  matches(): boolean {
    return true;
  },

  assistantMessages(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>(SELECTORS.assistantMessage)];
  },

  parseTargets(message: HTMLElement): Target[] {
    const targets: Target[] = [];

    for (const block of message.querySelectorAll<HTMLElement>(SELECTORS.questionBlock)) {
      const ordinal = Number(block.getAttribute('data-question'));
      if (Number.isNaN(ordinal)) continue;

      const questionId = `q${ordinal}` as QuestionId;

      for (const li of block.querySelectorAll<HTMLElement>(SELECTORS.option)) {
        const text = (li.textContent ?? '').trim();
        const parsed = parseOption(text);
        if (parsed === null) continue; // unparseable line is skipped, not guessed

        targets.push({
          id: `${questionId}-${parsed.label}` as TargetId,
          kind: 'option',
          bounds: documentRect(li),
          text,
          label: parsed.label,
          questionId,
          ordinal,
        });
      }
    }

    return targets;
  },

  isStreaming(): boolean {
    return document.querySelector(SELECTORS.streaming) !== null;
  },

  composer(): HTMLElement | null {
    return document.querySelector<HTMLElement>(SELECTORS.composer);
  },

  insertText(text: string): boolean {
    const el = this.composer() as HTMLTextAreaElement | null;
    if (el === null) return false;

    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    return true;
  },
};

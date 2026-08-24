/**
 * A `SiteAdapter` over the demo page's own markup.
 *
 * Deliberately delegates to the same `parseMcqTargets` the DeepSeek adapter
 * uses, rather than parsing the demo's markup specially. That way drawing on
 * the demo in a real browser exercises the real parser and the real
 * viewport → document coordinate conversion — if the structural parser were
 * broken, the demo would show it.
 *
 * Not registered in `src/adapters/registry.ts`; only the demo entry point
 * imports it, so it never reaches the extension bundle.
 */

import { parseMcqTargets } from '@adapters/mcq-parser';
import { findScrollRoot, type ScrollOffset } from '@adapters/scroll';
import type { SiteAdapter } from '@adapters/types';
import type { Target } from '@core/types';

export const demoAdapter: SiteAdapter = {
  id: 'demo',
  label: 'Demo page',

  matches(): boolean {
    return true;
  },

  assistantMessages(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('[data-role="assistant"]')];
  },

  parseTargets(message: HTMLElement, scrollOffset: ScrollOffset): Target[] {
    return parseMcqTargets(message, { idPrefix: 'demo', scrollOffset });
  },

  /**
   * Detected rather than hard-coded, so the demo behaves like a real site
   * whether its messages sit in the page or inside a scrolling container.
   */
  scrollRoot(): HTMLElement | null {
    return findScrollRoot(this.assistantMessages()[0] ?? null);
  },

  isStreaming(): boolean {
    return document.body.hasAttribute('data-streaming');
  },

  composer(): HTMLElement | null {
    return document.querySelector<HTMLElement>('#composer');
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

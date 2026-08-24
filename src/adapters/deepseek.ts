/**
 * DeepSeek adapter — the MVP's single supported host.
 *
 * Strategy: try known selectors first, then fall back to structure.
 *
 * The selectors below are **unverified** and expected to break; spec section 8
 * calls host markup breakage a question of when, not if. So they are only a
 * fast path. When every one of them misses, `assistantMessages()` falls back to
 * finding message containers by shape, which survives a class-name change
 * entirely. That is the difference between the extension going dead on a
 * redesign and merely getting slower.
 *
 * All parsing lives in `mcq-parser.ts` and is site-independent. Only container
 * discovery, the composer, and streaming detection are DeepSeek's business.
 */

import { parseMcqTargets, parseOptionLabel } from './mcq-parser';
import { findScrollRoot, type ScrollOffset } from './scroll';
import type { SiteAdapter } from './types';
import type { Target } from '@core/types';

export { OPTION_PATTERNS } from './mcq-parser';

/**
 * Fast-path selectors for an assistant turn.
 *
 * TODO(verify): confirm against a live DeepSeek session. Ordered most to least
 * specific; the first that yields anything wins.
 */
export const MESSAGE_SELECTORS: readonly string[] = [
  '[data-message-author-role="assistant"]',
  '[data-role="assistant"]',
  '[class*="ds-markdown"]',
  '[class*="markdown-body"]',
  '[class*="message-content"]',
];

/** Composer candidates. Semantic rather than cosmetic, so relatively stable. */
export const COMPOSER_SELECTORS: readonly string[] = [
  'textarea#chat-input',
  'textarea[placeholder]',
  'div[contenteditable="true"]',
  '[role="textbox"]',
  'textarea',
];

/** Minimum option lines before a container counts as an assistant message. */
const MIN_OPTIONS_FOR_FALLBACK = 2;

/**
 * Whether an element is an editable host for text.
 *
 * The `isContentEditable` property alone is not enough: it is unimplemented in
 * some environments, and the attribute is what the page actually declares.
 * Checking both means the composer is found either way.
 */
function isContentEditable(el: HTMLElement): boolean {
  if (el.isContentEditable) return true;
  const attr = el.getAttribute('contenteditable');
  return attr === '' || attr === 'true' || attr === 'plaintext-only';
}

/**
 * Whether an element is a usable target.
 *
 * Deliberately NOT `offsetParent !== null`: that is null for every
 * `position: fixed` element, and chat composers are very often fixed — the
 * check would reject exactly the element it is meant to find.
 */
function isUsable(el: HTMLElement): boolean {
  if (el.hidden) return false;

  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style === undefined) return true;

  return style.display !== 'none' && style.visibility !== 'hidden';
}

function queryAll(selector: string): HTMLElement[] {
  try {
    return [...document.querySelectorAll<HTMLElement>(selector)];
  } catch {
    // An invalid selector must not take the adapter down (NFR-9).
    return [];
  }
}

/**
 * Structural fallback: find containers that look like rendered assistant
 * markdown, without relying on any class name.
 *
 * Walks up from option-looking lines to the nearest ancestor holding several
 * of them, then keeps only the outermost such ancestors.
 */
function messagesByStructure(): HTMLElement[] {
  const candidates = new Map<HTMLElement, number>();

  for (const el of document.querySelectorAll<HTMLElement>('li, p, div')) {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text === '' || parseOptionLabel(text) === null) continue;

    // Never treat the composer's own contents as a message.
    if (el.closest('textarea, input, [contenteditable="true"]') !== null) continue;

    const container = el.closest<HTMLElement>('article, section, div');
    if (container === null) continue;
    candidates.set(container, (candidates.get(container) ?? 0) + 1);
  }

  const qualifying = [...candidates.entries()]
    .filter(([, count]) => count >= MIN_OPTIONS_FOR_FALLBACK)
    .map(([el]) => el);

  // Drop any container nested inside another qualifying one, so a question
  // block does not get reported separately from the message that holds it.
  return qualifying.filter((el) => !qualifying.some((other) => other !== el && other.contains(el)));
}

/**
 * Streaming detection without a selector (spec section 8).
 *
 * A response that is still generating mutates its own subtree continuously.
 * Watching for that is site-independent and survives any redesign, where a
 * "is generating" class name would not.
 */
class StreamWatcher {
  #lastMutation = 0;
  #observer: MutationObserver | null = null;

  /** Quiet period after the last mutation before a response counts as settled. */
  static readonly QUIET_MS = 600;

  start(): void {
    if (this.#observer !== null) return;
    // Guarded so importing this module outside a browser (a worker, a node
    // test) cannot throw. An adapter that explodes on import would take the
    // whole content script with it.
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    if (document.body === null) return;

    this.#observer = new MutationObserver(() => {
      this.#lastMutation = Date.now();
    });
    this.#observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  get streaming(): boolean {
    if (this.#lastMutation === 0) return false;
    return Date.now() - this.#lastMutation < StreamWatcher.QUIET_MS;
  }

  stop(): void {
    this.#observer?.disconnect();
    this.#observer = null;
  }
}

const watcher = new StreamWatcher();

/**
 * Set a value on a framework-controlled field.
 *
 * React (and friends) install their own value setter and ignore direct
 * assignment, so the native prototype setter has to be called explicitly before
 * the `input` event will be believed.
 */
function setControlledValue(el: HTMLTextAreaElement | HTMLInputElement, text: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

  if (setter === undefined) {
    el.value = text;
  } else {
    setter.call(el, text);
  }
}

export const deepseekAdapter: SiteAdapter = {
  id: 'deepseek',
  label: 'DeepSeek',

  matches(url: URL): boolean {
    // Any deepseek.com subdomain, not just `chat.`. Pinning the exact
    // subdomain meant a wrong guess produced no UI at all and no clue why.
    const host = url.hostname.toLowerCase();
    return host === 'deepseek.com' || host.endsWith('.deepseek.com');
  },

  assistantMessages(): HTMLElement[] {
    watcher.start();

    for (const selector of MESSAGE_SELECTORS) {
      const found = queryAll(selector);
      if (found.length > 0) return found;
    }

    // Every known selector missed — the markup has probably changed. Fall back
    // to shape rather than going dead (NFR-9).
    return messagesByStructure();
  },

  parseTargets(message: HTMLElement, scrollOffset: ScrollOffset): Target[] {
    try {
      return parseMcqTargets(message, { idPrefix: 'deepseek', scrollOffset });
    } catch {
      return [];
    }
  },

  isStreaming(): boolean {
    return watcher.streaming;
  },

  /**
   * DeepSeek scrolls its message area, not the window, so this must not return
   * null — coordinates derived from window scroll would all be viewport
   * coordinates. Detected generically rather than by selector, since a scroll
   * container is recognisable by behaviour.
   */
  scrollRoot(): HTMLElement | null {
    const messages = this.assistantMessages();
    return findScrollRoot(messages[0] ?? null);
  },

  composer(): HTMLElement | null {
    for (const selector of COMPOSER_SELECTORS) {
      const el = queryAll(selector).find(isUsable);
      if (el !== undefined) return el;
    }
    return null;
  },

  /**
   * Insert into the composer (FR-26).
   *
   * MUST NOT submit. No Enter is dispatched and no send button is clicked —
   * FR-27 and NFR-8 both rest on the user sending it themselves, and that is
   * the line this project holds on terms of service.
   */
  insertText(text: string): boolean {
    const el = this.composer();
    if (el === null) return false;

    try {
      el.focus();

      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        setControlledValue(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      if (isContentEditable(el)) {
        el.textContent = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
        return true;
      }

      return false;
    } catch {
      return false;
    }
  },
};

/** Test seam: stop the mutation observer between cases. */
export function __stopStreamWatcher(): void {
  watcher.stop();
}

/**
 * A `SiteAdapter` that works on any AI chat, built from a `SiteConfig`.
 *
 * Almost nothing about reading a chat page is site-specific. Options are found
 * by shape and text pattern, streaming by mutation, the scroll container by
 * behaviour, and the composer by semantic role. What differs between sites is
 * the hostname and, occasionally, a selector worth trying first.
 *
 * Per-site selectors are only ever a fast path. When they all miss, the
 * structural fallback runs — which is what actually made DeepSeek work, since
 * the selectors guessed for it were never right (NFR-9, NFR-10).
 */

import { parseMcqTargets, parseOptionLabel } from './mcq-parser';
import { findScrollRoot, type ScrollOffset } from './scroll';
import { siteMatchesHost, type SiteConfig } from './sites';
import type { SiteAdapter } from './types';
import type { Target } from '@core/types';

/**
 * Message selectors tried on every site.
 *
 * Data attributes and roles rather than cosmetic class names, because those are
 * the parts of a page least likely to change in a redesign.
 */
export const COMMON_MESSAGE_SELECTORS: readonly string[] = [
  '[data-message-author-role="assistant"]',
  '[data-role="assistant"]',
  '[class*="ds-markdown"]',
  '[class*="markdown-body"]',
  '[class*="message-content"]',
  // Broad, so it goes last: it can match avatars and toolbars as easily as
  // messages, and an earlier position let it displace a working selector.
  '[data-testid*="assistant" i]',
];

/** Composer candidates tried on every site, semantic first. */
export const COMMON_COMPOSER_SELECTORS: readonly string[] = [
  'textarea[placeholder]',
  'div[contenteditable="true"]',
  '[role="textbox"]',
  'textarea',
];

/** Minimum option lines before a container counts as an assistant message. */
const MIN_OPTIONS_FOR_FALLBACK = 2;

/**
 * Keep only the outermost elements, dropping any contained by another.
 *
 * Real chat markup nests a message several layers deep, so one selector often
 * matches both a wrapper and its inner content. Parsing both yields the same
 * options twice, and two targets with identical bounds score identically —
 * which the resolver correctly reports as ambiguous, so every mark comes back
 * unresolved.
 *
 * The structural path always did this; the selector path did not, and that
 * asymmetry is what broke DeepSeek. One helper now serves both so they cannot
 * diverge again.
 */
function outermost(elements: readonly HTMLElement[]): HTMLElement[] {
  return elements.filter((el) => !elements.some((other) => other !== el && other.contains(el)));
}

/** Whether this element contains anything that reads as an option line. */
function holdsOptions(el: HTMLElement): boolean {
  for (const child of el.querySelectorAll('li, p, div, span')) {
    const text = (child.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text !== '' && parseOptionLabel(text) !== null) return true;
  }
  return false;
}

/**
 * Whether an element is an editable host for text.
 *
 * The `isContentEditable` property alone is not enough: it is unimplemented in
 * some environments, and the attribute is what the page actually declares.
 */
export function isContentEditable(el: HTMLElement): boolean {
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

  return outermost(qualifying);
}

/**
 * Streaming detection without a selector (spec section 8).
 *
 * A response that is still generating mutates its own subtree continuously.
 * Watching for that is site-independent and survives any redesign, where an
 * "is generating" class name would not.
 */
class StreamWatcher {
  #lastMutation = 0;
  #observer: MutationObserver | null = null;

  /** Quiet period after the last mutation before a response counts as settled. */
  static readonly QUIET_MS = 600;

  start(): void {
    if (this.#observer !== null) return;
    // Guarded so importing this module outside a browser cannot throw.
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

/** One page hosts one chat site, so one watcher serves every adapter. */
const watcher = new StreamWatcher();

/** Test seam: stop the mutation observer between cases. */
export function __stopStreamWatcher(): void {
  watcher.stop();
}

/**
 * Set a value on a framework-controlled field.
 *
 * React and friends install their own value setter and ignore direct
 * assignment, so the native prototype setter has to be called explicitly
 * before the `input` event will be believed.
 */
function setControlledValue(el: HTMLTextAreaElement | HTMLInputElement, text: string): boolean {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

  if (setter === undefined) {
    el.value = text;
  } else {
    setter.call(el, text);
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  return el.value === text;
}

/**
 * Replace a rich editor's contents with `text`.
 *
 * ChatGPT, Claude and Gemini use ProseMirror/Lexical-style editors that keep
 * their own document model and ignore — or immediately revert — a direct
 * `textContent` write. `execCommand('insertText')` is deprecated but is still
 * what produces the `beforeinput`/`input` events those editors listen for, so
 * it is tried first. Writing `textContent` remains as a last resort for plain
 * contenteditable elements.
 */
function setEditableText(el: HTMLElement, text: string): boolean {
  el.focus();

  try {
    const selection = el.ownerDocument.defaultView?.getSelection();
    if (selection !== null && selection !== undefined) {
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } catch {
    /* selection is best-effort; insertion is still worth attempting */
  }

  try {
    if (el.ownerDocument.execCommand('insertText', false, text)) {
      if ((el.textContent ?? '').includes(text.slice(0, 20))) return true;
    }
  } catch {
    /* fall through to the direct write */
  }

  el.textContent = text;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  return (el.textContent ?? '') === text;
}

/** Build an adapter for one chat site. */
export function createChatAdapter(site: SiteConfig): SiteAdapter {
  const messageSelectors = [...(site.messageSelectors ?? []), ...COMMON_MESSAGE_SELECTORS];
  const composerSelectors = [...(site.composerSelectors ?? []), ...COMMON_COMPOSER_SELECTORS];

  const adapter: SiteAdapter = {
    id: site.id,
    label: site.label,

    matches(url: URL): boolean {
      return siteMatchesHost(site, url.hostname);
    },

    /**
     * Find the assistant turns, preferring ones that actually hold questions.
     *
     * A selector used to win merely by matching something, which let a broad
     * selector displace a working one and silently disable the structural
     * fallback. Now a selector wins only if what it matched contains
     * option-looking text; otherwise the search continues.
     *
     * Order of preference:
     *   1. a selector whose matches hold options
     *   2. the structural scan
     *   3. whatever matched at all — so a page with messages but no parseable
     *      options is still distinguishable from a page with no messages, which
     *      is what the health check reports on.
     */
    assistantMessages(): HTMLElement[] {
      watcher.start();

      let matchedAnything: HTMLElement[] | null = null;

      for (const selector of messageSelectors) {
        const found = outermost(queryAll(selector));
        if (found.length === 0) continue;
        if (found.some(holdsOptions)) return found;
        matchedAnything ??= found;
      }

      const structural = messagesByStructure();
      if (structural.length > 0) return structural;

      return matchedAnything ?? [];
    },

    parseTargets(message: HTMLElement, scrollOffset: ScrollOffset): Target[] {
      try {
        return parseMcqTargets(message, { idPrefix: site.id, scrollOffset });
      } catch {
        return [];
      }
    },

    isStreaming(): boolean {
      return watcher.streaming;
    },

    /**
     * Chat sites usually scroll their message area rather than the window, so
     * this must not assume the window. Detected by behaviour rather than by
     * selector, since a scroll container is recognisable by what it does.
     */
    scrollRoot(): HTMLElement | null {
      return findScrollRoot(adapter.assistantMessages()[0] ?? null);
    },

    composer(): HTMLElement | null {
      for (const selector of composerSelectors) {
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
     *
     * Returns whether the text actually landed, verified by reading the field
     * back. A rich editor can accept the call and discard the content, and
     * reporting success then would clear the user's ink for nothing.
     */
    insertText(text: string): boolean {
      const el = adapter.composer();
      if (el === null) return false;

      try {
        el.focus();

        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
          return setControlledValue(el, text);
        }

        if (isContentEditable(el)) return setEditableText(el, text);

        return false;
      } catch {
        return false;
      }
    },
  };

  return adapter;
}

/**
 * Structural MCQ parsing, shared by every host adapter.
 *
 * The insight this module rests on: *parsing* rendered markdown is not
 * site-specific. Only *finding the container* is. Chat sites all render
 * assistant markdown into ordinary lists and paragraphs, so options can be
 * found by shape and text pattern rather than by class name — and class names
 * are precisely what spec section 8 warns will change without notice.
 *
 * An adapter therefore supplies the message root; this decides what is in it.
 */

import type { QuestionId, Rect, Target, TargetId } from '@core/types';

import { findScrollRoot, scrollOffsetOf, type ScrollOffset } from './scroll';

/**
 * Option-label formats to try, in order (spec section 8: "Option parsing").
 * Each captures the label in group 1 and the option text in group 2.
 */
export const OPTION_PATTERNS: readonly RegExp[] = [
  /^\s*\(([A-Za-z])\)\s*(.*)$/, //   (A) Paris
  /^\s*([A-Za-z])\)\s*(.*)$/, //     A) Paris
  /^\s*([A-Za-z])\.\s+(.*)$/, //     A. Paris
  /^\s*([A-Za-z])\s*[:–—-]\s+(.*)$/, // A: Paris / A - Paris / A – Paris
];

/** Leading question number, e.g. "3." or "3)" or "Question 3:". */
const QUESTION_ORDINAL = /^\s*(?:question\s*)?(\d{1,3})\s*[.):]/i;

export interface ParsedOption {
  label: string;
  rest: string;
}

/** Split "B) Paris" into label and remainder, or null if it is not an option. */
export function parseOptionLabel(text: string): ParsedOption | null {
  for (const pattern of OPTION_PATTERNS) {
    const match = pattern.exec(text);
    const label = match?.[1];
    const rest = match?.[2];
    // A label with no text after it is a false positive — "A." ending a
    // sentence, or a lone initial.
    if (label !== undefined && rest !== undefined && rest.trim() !== '') {
      return { label: label.toUpperCase(), rest: rest.trim() };
    }
  }
  return null;
}

/**
 * Viewport rect to content coordinates (FR-9, FR-16).
 *
 * `offset` must be the same one the pen samples use, or a box measured at one
 * scroll position and a stroke drawn at another describe different spaces and
 * nothing resolves.
 */
export function documentRect(el: Element, offset: ScrollOffset): Rect {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + offset.x,
    y: r.top + offset.y,
    width: r.width,
    height: r.height,
  };
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'BUTTON', 'CODE']);

function textOf(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Is this the element that *is* the option line, rather than an ancestor that
 * merely contains one?
 *
 * Taking the leaf-most match matters for measurement: a `<div>` wrapping the
 * whole list has a bounding box covering every option, which would make every
 * circle ambiguous.
 */
function isOptionLeaf(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return false;
  // The composer's own contents must never be treated as an option line.
  if (el instanceof HTMLElement && el.isContentEditable) return false;
  if (parseOptionLabel(textOf(el)) === null) return false;

  for (const child of el.children) {
    if (parseOptionLabel(textOf(child)) !== null) return false;
  }
  return true;
}

/**
 * The element immediately before `el` in document order, staying inside `root`.
 *
 * Walks the tree rather than only siblings, so a prompt can be found across a
 * wrapper boundary — `<div><p>3. …</p></div><ul><li><p>A) …</p></li></ul>` is
 * ordinary renderer output and sibling-only lookup misses it entirely.
 */
function previousInDocument(el: Element, root: Element): Element | null {
  const sibling = el.previousElementSibling;
  if (sibling !== null) {
    let deepest = sibling;
    while (deepest.lastElementChild !== null) deepest = deepest.lastElementChild;
    return deepest;
  }

  const parent = el.parentElement;
  return parent === null || parent === root ? null : parent;
}

/** Cap on how far back to look for a prompt, so a long message cannot stall. */
const PROMPT_LOOKBACK = 60;

/**
 * The question prompt preceding an option line.
 *
 * Walks backwards in document order for the nearest substantial text that is
 * not itself an option. Ancestors of the option list are skipped naturally,
 * because their text is the option text and parses as an option.
 */
function promptBefore(el: Element, root: Element): string {
  let node = previousInDocument(el, root);

  for (let hops = 0; node !== null && hops < PROMPT_LOOKBACK; hops++) {
    const text = textOf(node);
    if (text !== '' && parseOptionLabel(text) === null) return text;
    node = previousInDocument(node, root);
  }
  return '';
}

/**
 * A stable token per assistant message, so question ids cannot collide.
 *
 * The session collects targets from EVERY assistant message on the page. Ask
 * for a quiz, answer it, then ask for another, and both messages contain a
 * "1." — which produced the same question id for both. FR-21 then treats them
 * as one question, so answering Q1 of the new quiz silently erased the Q1
 * answer from the old one.
 *
 * A WeakMap keyed on the element gives each message a stable identity without
 * writing anything into the host page, and without holding messages alive.
 */
const messageTokens = new WeakMap<Element, string>();
let nextMessageToken = 0;

function tokenFor(message: Element): string {
  let token = messageTokens.get(message);
  if (token === undefined) {
    token = `m${nextMessageToken++}`;
    messageTokens.set(message, token);
  }
  return token;
}

interface QuestionGroup {
  options: Element[];
  prompt: string;
}

/**
 * Group option lines into questions, by document order rather than by parent.
 *
 * Grouping by "consecutive children of one parent" was the original approach
 * and it fails on the shape markdown renderers most often emit:
 *
 *     <li><p>A) Berlin</p></li>
 *     <li><p>B) Paris</p></li>
 *
 * The leaf-most match is the `<p>`, and each `<p>` has a different parent, so
 * every question collapsed into single-option groups and was discarded. A real
 * chat response parsed to zero options because of it.
 *
 * Document order has no such assumption. A new question starts when either:
 *
 * - **the label stops advancing** — A, B, C, then A again. Markup-independent
 *   and the strongest signal available.
 * - **the preceding prompt changes** — the options now sit under different
 *   question text.
 */
function groupsOfOptions(root: HTMLElement): QuestionGroup[] {
  const groups: QuestionGroup[] = [];
  let current: Element[] = [];
  let currentPrompt = '';
  let lastLabel = '';

  const flush = (): void => {
    if (current.length > 0) groups.push({ options: current, prompt: currentPrompt });
    current = [];
  };

  // querySelectorAll yields document order, which is what the grouping needs.
  for (const el of root.querySelectorAll('*')) {
    if (!isOptionLeaf(el)) continue;

    const parsed = parseOptionLabel(textOf(el));
    if (parsed === null) continue;

    const prompt = promptBefore(el, root);
    const advances = current.length === 0 || parsed.label > lastLabel;

    if (!advances || (current.length > 0 && prompt !== currentPrompt)) flush();

    if (current.length === 0) currentPrompt = prompt;
    current.push(el);
    lastLabel = parsed.label;
  }
  flush();

  return groups;
}

export interface ParseOptions {
  /** Prefix for generated ids, so two adapters cannot collide. */
  idPrefix?: string;
  /**
   * Scroll offset to convert measurements into content coordinates.
   *
   * Defaults to the offset of whatever scrolls this message, detected from the
   * message element itself. Leaving it to each adapter to remember was a
   * footgun: the demo adapter did not pass one, so its boxes were in viewport
   * coordinates while strokes were in content coordinates, and marks resolved
   * to the wrong option.
   */
  scrollOffset?: ScrollOffset;
}

/**
 * Parse one assistant message into candidate targets (FR-15, FR-16).
 *
 * Returns `[]` for anything unrecognisable rather than throwing or guessing
 * (NFR-9, FR-19).
 */
export function parseMcqTargets(message: HTMLElement, options: ParseOptions = {}): Target[] {
  const prefix = options.idPrefix ?? 'q';
  const offset = options.scrollOffset ?? scrollOffsetOf(findScrollRoot(message));
  const targets: Target[] = [];

  groupsOfOptions(message).forEach((group, index) => {
    // A single matching line is far more likely to be prose that happens to
    // start with a letter and a bracket than a one-option question.
    if (group.options.length < 2) return;

    const numbered = QUESTION_ORDINAL.exec(group.prompt);
    const ordinal = numbered?.[1] === undefined ? index + 1 : Number(numbered[1]);
    const questionId = `${prefix}-${tokenFor(message)}-${ordinal}-${index}` as QuestionId;

    for (const el of group.options) {
      const text = textOf(el);
      const parsed = parseOptionLabel(text);
      if (parsed === null) continue;

      targets.push({
        id: `${questionId}-${parsed.label}` as TargetId,
        kind: 'option',
        bounds: documentRect(el, offset),
        text,
        label: parsed.label,
        questionId,
        ordinal,
      });
    }
  });

  return targets;
}

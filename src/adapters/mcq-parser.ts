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

/** Viewport rect to document coordinates (FR-9, FR-16). */
export function documentRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + window.scrollX,
    y: r.top + window.scrollY,
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
 * Group option elements into questions by maximal runs of consecutive
 * siblings.
 *
 * This handles both shapes markdown produces: `<li>` items under one `<ul>`
 * (the whole list is one run), and bare `<p>` lines where the next question's
 * prompt interrupts the run. Grouping by parent alone would merge every
 * question in the paragraph case.
 */
function runsOfOptions(root: HTMLElement): Element[][] {
  const leaves = new Set<Element>();
  for (const el of root.querySelectorAll('*')) {
    if (isOptionLeaf(el)) leaves.add(el);
  }
  if (leaves.size === 0) return [];

  const parents = new Set<Element>();
  for (const leaf of leaves) {
    if (leaf.parentElement !== null) parents.add(leaf.parentElement);
  }

  const runs: Element[][] = [];
  for (const parent of parents) {
    let run: Element[] = [];
    for (const child of parent.children) {
      if (leaves.has(child)) {
        run.push(child);
      } else if (run.length > 0) {
        runs.push(run);
        run = [];
      }
    }
    if (run.length > 0) runs.push(run);
  }

  // Document order, so question numbering matches reading order.
  return runs.sort((a, b) => {
    const first = a[0];
    const second = b[0];
    if (first === undefined || second === undefined) return 0;
    return first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
}

/**
 * The prompt text for a run of options: the nearest preceding text before the
 * run, climbing out of the list wrapper when the options are `<li>` items.
 */
function promptFor(run: Element[]): string {
  const first = run[0];
  if (first === undefined) return '';

  let node: Element | null = first.previousElementSibling;
  if (node === null) {
    const wrapper = first.parentElement;
    node = wrapper?.previousElementSibling ?? null;
  }

  // Walk back over anything empty until real text appears.
  let hops = 0;
  while (node !== null && hops < 4) {
    const text = textOf(node);
    if (text !== '' && parseOptionLabel(text) === null) return text;
    node = node.previousElementSibling;
    hops++;
  }
  return '';
}

export interface ParseOptions {
  /** Prefix for generated ids, so two adapters cannot collide. */
  idPrefix?: string;
}

/**
 * Parse one assistant message into candidate targets (FR-15, FR-16).
 *
 * Returns `[]` for anything unrecognisable rather than throwing or guessing
 * (NFR-9, FR-19).
 */
export function parseMcqTargets(message: HTMLElement, options: ParseOptions = {}): Target[] {
  const prefix = options.idPrefix ?? 'q';
  const targets: Target[] = [];

  runsOfOptions(message).forEach((run, index) => {
    // A single matching line is far more likely to be prose that happens to
    // start with a letter and a bracket than a one-option question.
    if (run.length < 2) return;

    const prompt = promptFor(run);
    const numbered = QUESTION_ORDINAL.exec(prompt);
    const ordinal = numbered?.[1] === undefined ? index + 1 : Number(numbered[1]);
    const questionId = `${prefix}-${ordinal}-${index}` as QuestionId;

    for (const el of run) {
      const text = textOf(el);
      const parsed = parseOptionLabel(text);
      if (parsed === null) continue;

      targets.push({
        id: `${questionId}-${parsed.label}` as TargetId,
        kind: 'option',
        bounds: documentRect(el),
        text,
        label: parsed.label,
        questionId,
        ordinal,
      });
    }
  });

  return targets;
}

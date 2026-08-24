/**
 * Wires the overlay to a host site through a `SiteAdapter`.
 *
 * This is the whole extension's behaviour in one place, and it is deliberately
 * adapter-shaped: the content script mounts it with the DeepSeek adapter, the
 * demo page mounts it with a demo adapter, and neither knows anything the other
 * does. Nothing here contains a host-site selector (NFR-10).
 *
 * Failure policy: every adapter call is treated as fallible. A host that cannot
 * be read makes the toggle inert; it never throws into the page (NFR-9).
 */

import type { SiteAdapter } from '@adapters/types';
import { classifyStroke } from '@core/classify';
import { resolveStroke } from '@core/resolve';
import { shouldCapture, StrokeRecorder, type PointerKind } from '@core/stroke';
import type { Mark, Rect, Stroke, StrokeId, Target, TargetId } from '@core/types';
import { composeAnswerMessage, DEFAULT_TRAILING_INSTRUCTION } from '@compose/message';
import { MarkSet } from '@state/marks';

import { InkCanvas } from './ink-canvas';
import { ReviewPanel } from './review-panel';
import { InkToggle } from './toggle';
import overlayCss from './overlay.css?inline';

export interface SessionOptions {
  adapter: SiteAdapter;
  /** Where to mount. Defaults to document.body. */
  host?: HTMLElement;
  trailingInstruction?: string;
}

/** How long a cached target measurement stays valid (NFR-4). */
const MEASUREMENT_TTL_MS = 500;

const POINTER_KINDS = new Set(['pen', 'touch', 'mouse']);

/**
 * Describe which element actually scrolls, for diagnosis.
 *
 * A chat that scrolls inside its own container rather than the window breaks
 * assumptions about coordinates, so it is worth knowing which case a site is.
 */
function describeScrollParent(el: Element): string {
  let node: Element | null = el;
  while (node !== null && node !== document.body) {
    const style = getComputedStyle(node);
    const scrolls = /auto|scroll|overlay/.test(style.overflowY);
    if (scrolls && node.scrollHeight > node.clientHeight + 1) {
      return `<${node.tagName.toLowerCase()} class="${node.className}"> (inner container)`;
    }
    node = node.parentElement;
  }
  return document.documentElement.scrollHeight > window.innerHeight + 1
    ? 'window (page scrolls normally)'
    : 'none detected';
}

function pointerKindOf(event: PointerEvent): PointerKind | null {
  return POINTER_KINDS.has(event.pointerType) ? (event.pointerType as PointerKind) : null;
}

export class InkSession {
  readonly #adapter: SiteAdapter;
  readonly #hostEl: HTMLElement;
  readonly #shadow: ShadowRoot;
  readonly #canvas: InkCanvas;
  readonly #toggle: InkToggle;
  readonly #panel: ReviewPanel;
  readonly #marks = new MarkSet();
  readonly #recorder = new StrokeRecorder();

  #trailingInstruction: string;
  #enabled = false;
  #activePointerId: number | null = null;
  #targets: Target[] = [];
  #measuredAt = 0;

  constructor(options: SessionOptions) {
    this.#adapter = options.adapter;
    this.#trailingInstruction = options.trailingInstruction ?? DEFAULT_TRAILING_INSTRUCTION;

    // NFR-11: everything lives in a shadow root, so no style of ours can reach
    // the host page and nothing of theirs reaches us.
    const hostEl = document.createElement('div');
    hostEl.setAttribute('data-ink-ink', '');
    (options.host ?? document.body).appendChild(hostEl);

    const shadow = hostEl.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = overlayCss;
    shadow.appendChild(style);

    const root = document.createElement('div');
    root.className = 'ink-root';
    root.dataset['enabled'] = 'false';
    shadow.appendChild(root);

    this.#hostEl = hostEl;
    this.#shadow = shadow;

    this.#canvas = new InkCanvas({ container: root });
    this.#toggle = new InkToggle({
      container: root,
      onChange: (enabled) => this.#setEnabled(enabled),
    });
    this.#panel = new ReviewPanel({
      container: root,
      onRemoveMark: (id) => this.#removeMark(id),
      onUndo: () => this.#undo(),
      onSubmit: () => this.submit(),
      onDismiss: () => this.#panel.hide(),
    });

    // FR-12: a resize reflows the host page, moving text to entirely different
    // document coordinates. Re-measure and shift the ink to follow it.
    this.#canvas.onReflow(() => this.#handleReflow());

    this.#attachPointerListeners();
    this.#checkHealth();
  }

  /** Number of marks currently held, resolved or not. */
  get markCount(): number {
    return this.#marks.size;
  }

  /** The composed text, exactly as `submit()` would insert it. */
  previewText(): string {
    return composeAnswerMessage(this.#marks.resolved(), {
      trailingInstruction: this.#trailingInstruction,
    });
  }

  /**
   * Insert the composed answers into the host composer (FR-26).
   *
   * Never sends (FR-27, NFR-8). Clears the ink only once insertion succeeded —
   * losing someone's answers to a failed insert would be the worst outcome here.
   */
  submit(): boolean {
    const text = this.previewText();
    if (text === '') return false;

    let inserted: boolean;
    try {
      inserted = this.#adapter.insertText(text);
    } catch {
      inserted = false;
    }

    if (!inserted) {
      this.#toggle.setDegraded(true, 'Could not reach the chat box on this page');
      return false;
    }

    this.#marks.clear(); // FR-14
    this.#canvas.clear();
    this.#panel.update(this.#marks.all());
    this.#panel.setPreview('');
    return true;
  }

  setTrailingInstruction(value: string): void {
    this.#trailingInstruction = value;
    this.#refreshPanel();
  }

  destroy(): void {
    this.#canvas.destroy();
    this.#toggle.destroy();
    this.#panel.destroy();
    this.#hostEl.remove();
  }

  // --- pointer handling --------------------------------------------------

  /**
   * Listen on the document, in the capture phase, and act only on the pen.
   *
   * The overlay used to be a full-viewport element with `pointer-events: auto`,
   * which meant it swallowed the wheel as well as the pen. On a chat site whose
   * conversation scrolls inside its own container — not the window — that
   * container never received the event and the page simply stopped scrolling
   * while the pen was on.
   *
   * Capturing on the document instead lets everything that is not a pen stroke
   * reach the page untouched: wheel, mouse, touch, clicks. A pen event is
   * stopped here and never reaches the page, so drawing cannot select text or
   * press the site's own buttons.
   */
  #attachPointerListeners(): void {
    const opts = { capture: true } as const;

    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.#shouldDraw(event)) return;

        // Ink drawn while a response is still generating drifts as the content
        // grows (spec section 8). Refuse rather than record something that will
        // resolve against stale geometry.
        if (this.#isStreaming()) return;

        this.#claim(event);
        this.#activePointerId = event.pointerId;
        this.#recorder.begin(this.#sample(event));
        this.#canvas.drawLive(this.#recorder.current);
      },
      opts,
    );

    document.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerId !== this.#activePointerId) return;
        this.#claim(event);

        // Coalesced events recover the samples the browser batched between
        // frames, which is what keeps a fast stroke smooth (NFR-1).
        const events =
          typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
        for (const e of events.length > 0 ? events : [event]) {
          this.#recorder.extend(this.#sample(e));
        }
        this.#canvas.drawLive(this.#recorder.current);
      },
      opts,
    );

    const finish = (event: PointerEvent, appendFinalPoint: boolean): void => {
      if (event.pointerId !== this.#activePointerId) return;
      this.#claim(event);
      this.#activePointerId = null;

      const stroke = this.#recorder.end(appendFinalPoint ? this.#sample(event) : undefined);
      this.#canvas.drawLive([]);
      if (stroke !== null) this.#handleStroke(stroke);
    };

    document.addEventListener('pointerup', (e) => finish(e, true), opts);

    /**
     * A cancelled pointer keeps its stroke rather than discarding it.
     *
     * `pointercancel` means the browser took the pointer away mid-gesture.
     * Discarding the stroke is what made ink stop dead and vanish partway
     * through a line. Losing work someone deliberately drew is worse than
     * keeping a slightly short stroke, and the classifier already refuses to
     * read a stroke that means nothing.
     */
    document.addEventListener('pointercancel', (e) => finish(e, false), opts);
  }

  /** Whether this event is a pen stroke we should capture (FR-5, FR-6, FR-7). */
  #shouldDraw(event: PointerEvent): boolean {
    const kind = pointerKindOf(event);
    return kind !== null && shouldCapture(kind, this.#enabled);
  }

  /**
   * Take an event away from the page.
   *
   * Only ever called for pen events we are drawing with, so the page keeps
   * receiving everything else (FR-3).
   */
  #claim(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  /** Viewport event to document coordinates (FR-9). */
  #sample(event: PointerEvent | { clientX: number; clientY: number; pressure?: number }): {
    x: number;
    y: number;
    t: number;
    pressure?: number;
  } {
    const pressure = 'pressure' in event ? event.pressure : undefined;
    const base = {
      x: event.clientX + window.scrollX,
      y: event.clientY + window.scrollY,
      t: performance.now(),
    };
    // Pressure is carried when reported and omitted otherwise. It is never used
    // to decide anything — see .claude/knowledge/target-hardware.md, where a
    // pen reporting a constant 0 is on record.
    return pressure === undefined ? base : { ...base, pressure };
  }

  // --- resolution --------------------------------------------------------

  #handleStroke(stroke: Stroke): void {
    this.#canvas.commit(stroke);

    const kind = classifyStroke(stroke);
    const resolution = resolveStroke(stroke, kind, this.#targetsNow());
    const mark: Mark = { stroke, kind, resolution };

    const { displaced } = this.#marks.add(mark);
    if (displaced !== null) this.#canvas.erase(displaced.stroke.id); // FR-21

    this.#canvas.setMarkState(mark);
    this.#refreshPanel();
  }

  /**
   * Candidate targets, re-measured at most every MEASUREMENT_TTL_MS.
   *
   * NFR-4 forbids re-measuring the DOM on every pointer event. Measuring once
   * per stroke, with a short TTL, keeps `getBoundingClientRect` off the hot
   * path while staying fresh enough for a page that reflows as it streams.
   */
  #targetsNow(): Target[] {
    const now = performance.now();
    if (now - this.#measuredAt < MEASUREMENT_TTL_MS && this.#targets.length > 0) {
      return this.#targets;
    }

    this.#targets = this.#measure();
    this.#measuredAt = now;
    return this.#targets;
  }

  #measure(): Target[] {
    try {
      const targets: Target[] = [];
      for (const message of this.#adapter.assistantMessages()) {
        targets.push(...this.#adapter.parseTargets(message));
      }
      return targets;
    } catch {
      // A broken adapter yields no targets, so marks land unresolved rather
      // than the page breaking (NFR-9).
      return [];
    }
  }

  #isStreaming(): boolean {
    try {
      return this.#adapter.isStreaming();
    } catch {
      return false;
    }
  }

  // --- state -------------------------------------------------------------

  /**
   * Handle a request to turn the pen on or off.
   *
   * Health is re-checked on every attempt rather than latched. A response with
   * no options is a normal state, not a broken one — the next response may well
   * have some, and the old behaviour disabled the button permanently until the
   * page was reloaded.
   */
  #setEnabled(requested: boolean): void {
    if (!requested) {
      this.#applyEnabled(false);
      return;
    }

    // Measure on activation so the first stroke is not the one paying for it.
    this.#measuredAt = 0;
    this.#targetsNow();

    if (!this.#checkHealth()) {
      // Nothing markable here. Stay off, and say why in the console so the
      // markup can be inspected — this is the only route to it on a site
      // behind a login.
      this.#applyEnabled(false);
      this.#logDiagnosis();
      return;
    }

    this.#applyEnabled(true);
  }

  #applyEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    this.#toggle.setEnabled(enabled);

    const root = this.#shadow.querySelector<HTMLElement>('.ink-root');
    if (root !== null) root.dataset['enabled'] = String(enabled);
  }

  #removeMark(strokeId: StrokeId): void {
    const removed = this.#marks.remove(strokeId); // FR-24
    if (removed !== null) this.#canvas.erase(removed.stroke.id);
    this.#refreshPanel();
  }

  #undo(): void {
    const undone = this.#marks.undo(); // FR-25
    if (undone !== null) this.#canvas.erase(undone.stroke.id);
    this.#refreshPanel();
  }

  /**
   * Re-anchor ink and prune marks after the page reflowed (FR-12).
   *
   * Ink that can no longer be placed is dropped by the canvas; the mark set has
   * to drop those marks too, or the review panel would list answers with no
   * visible ink behind them.
   */
  #handleReflow(): void {
    this.#measuredAt = 0;
    const targets = this.#targetsNow();

    const byId = new Map<TargetId, Rect>();
    for (const t of targets) byId.set(t.id, t.bounds);

    this.#canvas.reflow(byId);

    const surviving = new Set(this.#canvas.strokeIds());
    for (const mark of this.#marks.all()) {
      if (!surviving.has(mark.stroke.id)) this.#marks.remove(mark.stroke.id);
    }

    this.#refreshPanel();
  }

  #refreshPanel(): void {
    this.#panel.update(this.#marks.all());
    this.#panel.setPreview(this.previewText());
  }

  /**
   * Detect silent host breakage (spec section 8 asks for a plan for this).
   *
   * Finding assistant messages but no targets inside them is the signature of a
   * markup change — and is distinguishable from a page that simply has no quiz
   * on it, which finds no messages either.
   */
  /**
   * Report what the adapter actually found, to the page console.
   *
   * Exists because "nothing resolves" on a real site is unfixable from the
   * outside: the markup is behind a login, so the only way to learn its shape
   * is to have the extension describe what it sees. Logged locally only —
   * nothing is transmitted anywhere (NFR-5).
   */
  #logDiagnosis(): void {
    try {
      const messages = this.#adapter.assistantMessages();
      const targets = this.#targetsNow();

      const lines: string[] = [
        `adapter: ${this.#adapter.id}`,
        `assistant messages found: ${messages.length}`,
        `option targets parsed: ${targets.length}`,
      ];

      const first = messages[messages.length - 1];
      if (first !== undefined) {
        const text = (first.textContent ?? '').replace(/\s+/g, ' ').trim();
        lines.push(
          `last message tag: <${first.tagName.toLowerCase()} class="${first.className}">`,
          `last message text (300 chars): ${text.slice(0, 300)}`,
          `child tags: ${[...first.children].map((c) => c.tagName.toLowerCase()).join(', ')}`,
        );

        // The single most useful thing for repairing the parser.
        lines.push('last message HTML (1200 chars):', first.innerHTML.slice(0, 1200));
      }

      lines.push(`scroll container: ${describeScrollParent(messages[0] ?? document.body)}`);

      console.warn(`[ink-ink] diagnosis\n${lines.join('\n')}`);
    } catch (error) {
      console.warn('[ink-ink] diagnosis failed', error);
    }
  }

  #checkHealth(): boolean {
    let messages: number;
    try {
      messages = this.#adapter.assistantMessages().length;
    } catch {
      messages = 0;
    }

    // Measure fresh rather than trusting the cache: at construction time
    // nothing has been measured yet, and comparing against an empty cache
    // reports every healthy page as broken.
    const targets = messages > 0 ? this.#targetsNow() : [];
    const broken = messages > 0 && targets.length === 0;

    this.#toggle.setDegraded(
      broken,
      broken
        ? 'No question options found in this response — try again once one is shown'
        : undefined,
    );

    return !broken;
  }
}

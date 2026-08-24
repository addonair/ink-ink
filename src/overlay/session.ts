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

import { describeScrollRoot, scrollOffsetOf, type ScrollOffset } from '@adapters/scroll';
import type { SiteAdapter } from '@adapters/types';
import { classifyStroke } from '@core/classify';
import { resolveStroke } from '@core/resolve';
import { shouldCapture, StrokeRecorder, type PointerKind } from '@core/stroke';
import type { Mark, QuestionId, Rect, Stroke, StrokeId, Target, TargetId } from '@core/types';
import { composeAnswerMessage, DEFAULT_TRAILING_INSTRUCTION } from '@compose/message';
import { MarkSet } from '@state/marks';

import { InkCanvas } from './ink-canvas';
import { ReviewPanel, type QuestionRow } from './review-panel';
import { InkToggle } from './toggle';
import overlayCss from './overlay.css?inline';

/** What happened to the composed text when the user submitted. */
export type SubmitOutcome = 'inserted' | 'copied' | 'failed';

export interface SessionOptions {
  adapter: SiteAdapter;
  /** Where to mount. Defaults to document.body. */
  host?: HTMLElement;
  trailingInstruction?: string;
}

/** How long a cached target measurement stays valid (NFR-4). */
const MEASUREMENT_TTL_MS = 500;

const POINTER_KINDS = new Set(['pen', 'touch', 'mouse']);

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
  #scrollRootEl: HTMLElement | null = null;
  #diagnosedSinceEnable = false;

  /**
   * Questions the user asked to have explained.
   *
   * Keyed by question rather than by mark, for two reasons: FR-21 replaces the
   * mark when an answer changes, and you still do not understand the question;
   * and a question can be flagged with no mark at all, which is the case this
   * feature mainly exists for.
   */
  readonly #flagged = new Set<QuestionId>();
  readonly #teardown = new AbortController();

  /**
   * Mirror the conversation's scroll onto the ink layer.
   *
   * Only needed when the chat scrolls its own container; when the window
   * scrolls, the offset is already reflected in the layer's position and this
   * resolves to a no-op translate.
   */
  readonly #onContentScroll = (): void => {
    const root = this.#scrollRootEl;
    this.#canvas.setScrollOffset(root?.scrollLeft ?? 0, root?.scrollTop ?? 0);
  };

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
      onToggleFlag: (questionId) => this.#toggleFlag(questionId),
      onUndo: () => this.#undo(),
      onSubmit: () => {
        void this.submit().then((outcome) => this.#panel.reportSubmission(outcome));
      },
      onDismiss: () => this.#panel.hide(),
    });

    // FR-12: a resize reflows the host page, moving text to entirely different
    // document coordinates. Re-measure and shift the ink to follow it.
    this.#canvas.onReflow(() => this.#handleReflow());

    this.#attachPointerListeners();
    this.#refreshScrollRoot();
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
      explainOrdinals: this.#explainOrdinals(),
    });
  }

  /**
   * Insert the composed answers into the host composer (FR-26).
   *
   * Never sends (FR-27, NFR-8).
   *
   * Rich text editors — ChatGPT, Claude and Gemini all use one — can accept a
   * write and quietly discard it, so `insertText` reports whether the text
   * actually landed. When it did not, the answers go to the clipboard instead.
   * Losing twenty marks to a failed insert is the worst outcome available here,
   * and a paste is a cheap price next to re-answering.
   *
   * Ink is cleared on `inserted` and `copied`, since the text is in the user's
   * hands either way, and kept on `failed`.
   */
  async submit(): Promise<SubmitOutcome> {
    const text = this.previewText();
    if (text === '') return 'failed';

    let inserted: boolean;
    try {
      inserted = this.#adapter.insertText(text);
    } catch {
      inserted = false;
    }

    if (inserted) {
      this.#finishSubmission();
      return 'inserted';
    }

    if (await this.#copyToClipboard(text)) {
      this.#toggle.setDegraded(true, 'Copied your answers — paste them into the chat box');
      this.#finishSubmission();
      return 'copied';
    }

    this.#toggle.setDegraded(true, 'Could not reach the chat box, and copying failed');
    return 'failed';
  }

  /** Runs inside the submit click, so it keeps its user-gesture permission. */
  async #copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  #finishSubmission(): void {
    this.#marks.clear(); // FR-14
    this.#flagged.clear();
    this.#canvas.clear();
    this.#refreshPanel();
    this.#panel.setPreview('');
  }

  setTrailingInstruction(value: string): void {
    this.#trailingInstruction = value;
    this.#refreshPanel();
  }

  destroy(): void {
    this.#teardown.abort();
    this.#scrollRootEl?.removeEventListener('scroll', this.#onContentScroll);
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
    // Every listener is registered against one signal, so destroy() detaches
    // them all. Without this the listeners outlived the session: a destroyed
    // session kept claiming pen events on the document, using its own stale
    // enabled flag and a host element no longer in the page.
    const opts = { capture: true, signal: this.#teardown.signal } as const;

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
    if (kind === null || !shouldCapture(kind, this.#enabled)) return false;

    /**
     * Never claim a tap on our own controls.
     *
     * Capture-phase listeners on the document run before the event reaches its
     * target, so without this a pen tap on Undo or the per-mark × was
     * swallowed and the button never fired. The toggle appeared to work only
     * because it is pressed while the layer is off, when nothing is claimed.
     *
     * `composedPath` includes the shadow host for events inside the shadow
     * root, so one check covers every control, including ones added later.
     */
    return !event.composedPath().includes(this.#hostEl);
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

  /**
   * Scroll offset for converting viewport positions into content coordinates.
   *
   * Cached, because resolving it walks the ancestor chain calling
   * getComputedStyle and this runs on every pointer sample (NFR-4).
   */
  #scrollOffset(): ScrollOffset {
    return scrollOffsetOf(this.#scrollRootEl);
  }

  /**
   * Re-detect which element scrolls the conversation, and follow it.
   *
   * The ink layer moves with window scroll for free, but not with a container's,
   * so its scroll has to be mirrored onto the layer.
   */
  #refreshScrollRoot(): void {
    let root: HTMLElement | null;
    try {
      root = this.#adapter.scrollRoot();
    } catch {
      root = null;
    }

    if (root === this.#scrollRootEl) return;

    this.#scrollRootEl?.removeEventListener('scroll', this.#onContentScroll);
    this.#scrollRootEl = root;
    this.#scrollRootEl?.addEventListener('scroll', this.#onContentScroll, { passive: true });
    this.#onContentScroll();
  }

  /** Viewport event to content coordinates (FR-9). */
  #sample(event: PointerEvent | { clientX: number; clientY: number; pressure?: number }): {
    x: number;
    y: number;
    t: number;
    pressure?: number;
  } {
    const pressure = 'pressure' in event ? event.pressure : undefined;
    const offset = this.#scrollOffset();
    const base = {
      x: event.clientX + offset.x,
      y: event.clientY + offset.y,
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

    // A mark that will not resolve is the case most needing explanation, and
    // the diagnosis used to fire only when the health check failed — so in the
    // exact situation where targets are found but nothing resolves, there was
    // no output at all. Logged once per enable rather than per stroke.
    if (mark.resolution.status === 'unresolved' && !this.#diagnosedSinceEnable) {
      this.#diagnosedSinceEnable = true;
      this.#logDiagnosis();
    }
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
      // One offset for both sides. The session owning it is what stops target
      // boxes and pen strokes drifting into different coordinate spaces.
      const offset = this.#scrollOffset();
      const targets: Target[] = [];
      for (const message of this.#adapter.assistantMessages()) {
        targets.push(...this.#adapter.parseTargets(message, offset));
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

    this.#diagnosedSinceEnable = false;

    // Measure on activation so the first stroke is not the one paying for it.
    this.#refreshScrollRoot();
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

    // The panel lists questions, not just marks, so it has to populate as soon
    // as the page has been measured rather than waiting for a first stroke.
    this.#refreshPanel();
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
    this.#refreshScrollRoot();
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

  /**
   * Every question on the page, with whatever the user did about it.
   *
   * Built from the measured targets rather than from the marks, so a question
   * nobody answered still gets a row and can be flagged.
   */
  #questionRows(): QuestionRow[] {
    const rows = new Map<QuestionId, QuestionRow>();

    for (const target of this.#targets) {
      const questionId = target.questionId;
      if (questionId === undefined || rows.has(questionId)) continue;

      rows.set(questionId, {
        questionId,
        ordinal: target.ordinal ?? rows.size + 1,
        answer: null,
        strokeId: null,
        flagged: this.#flagged.has(questionId),
      });
    }

    for (const mark of this.#marks.resolved()) {
      if (mark.resolution.status !== 'resolved') continue;
      const target = mark.resolution.target;
      const questionId = target.questionId;
      if (questionId === undefined) continue;

      const row = rows.get(questionId) ?? {
        questionId,
        ordinal: target.ordinal ?? rows.size + 1,
        answer: null,
        strokeId: null,
        flagged: this.#flagged.has(questionId),
      };
      row.answer = target.label ?? target.text;
      row.strokeId = mark.stroke.id;
      rows.set(questionId, row);
    }

    return [...rows.values()];
  }

  /** Ordinals of flagged questions, for the composed request. */
  #explainOrdinals(): number[] {
    return this.#questionRows()
      .filter((row) => row.flagged)
      .map((row) => row.ordinal);
  }

  #toggleFlag(questionId: QuestionId): void {
    if (this.#flagged.has(questionId)) {
      this.#flagged.delete(questionId);
    } else {
      this.#flagged.add(questionId);
    }
    this.#refreshPanel();
  }

  #refreshPanel(): void {
    this.#panel.update(this.#questionRows(), this.#marks.unresolved());
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

      const boxes = targets
        .slice(0, 6)
        .map(
          (t) =>
            `${t.ordinal ?? '?'}${t.label ?? '?'} @ ${Math.round(t.bounds.x)},${Math.round(
              t.bounds.y,
            )} ${Math.round(t.bounds.width)}x${Math.round(t.bounds.height)}`,
        );
      lines.push(`first targets: ${boxes.join(' | ')}`);

      // Two targets sharing a box score identically, which the resolver
      // reports as ambiguous — the signature of a message parsed twice.
      const seen = new Set(
        targets.map((t) => `${t.bounds.x},${t.bounds.y},${t.bounds.width},${t.bounds.height}`),
      );
      if (seen.size < targets.length) {
        lines.push(
          `WARNING: ${targets.length - seen.size} targets share a box with another — ` +
            'a message is being parsed more than once, which makes every mark ambiguous.',
        );
      }

      lines.push(`scroll container: ${describeScrollRoot(this.#scrollRootEl)}`);

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

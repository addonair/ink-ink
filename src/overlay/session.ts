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

    // Set the off state explicitly rather than inheriting it from the
    // stylesheet. If style injection ever failed, a canvas with the default
    // `pointer-events: auto` would swallow every click on the host page while
    // the layer is supposedly off — FR-3 must not depend on CSS loading.
    this.#canvas.setEnabled(false);

    // FR-12: a resize reflows the host page, moving text to entirely different
    // document coordinates. Re-measure and shift the ink to follow it.
    this.#canvas.onReflow(() => this.#handleReflow());

    this.#attachPointerListeners(root);
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

  #attachPointerListeners(root: HTMLElement): void {
    const surface = this.#canvas.element;

    surface.addEventListener('pointerdown', (event) => {
      const kind = pointerKindOf(event);
      if (kind === null || !shouldCapture(kind, this.#enabled)) return;

      // Ink drawn while a response is still generating drifts as the content
      // grows (spec section 8). Refuse rather than record something that will
      // resolve against stale geometry.
      if (this.#isStreaming()) return;

      event.preventDefault();
      this.#activePointerId = event.pointerId;
      this.#recorder.begin(this.#sample(event));
      this.#canvas.drawLive(this.#recorder.current);

      // Capture keeps the stroke alive if the pen leaves the canvas mid-draw.
      // It is an enhancement, not a prerequisite: setPointerCapture throws
      // when the id is no longer an active pointer, and losing the whole
      // stroke to that would be worse than losing capture. Recording has
      // already started by this point either way.
      try {
        surface.setPointerCapture(event.pointerId);
      } catch {
        /* drawing continues without capture */
      }
    });

    surface.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.#activePointerId) return;

      // Coalesced events recover the samples the browser batched between
      // frames, which is what keeps a fast stroke smooth (NFR-1).
      const events =
        typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
      for (const e of events.length > 0 ? events : [event]) {
        this.#recorder.extend(this.#sample(e));
      }
      this.#canvas.drawLive(this.#recorder.current);
    });

    const finish = (event: PointerEvent, appendFinalPoint: boolean): void => {
      if (event.pointerId !== this.#activePointerId) return;
      this.#activePointerId = null;

      const stroke = this.#recorder.end(appendFinalPoint ? this.#sample(event) : undefined);
      this.#canvas.drawLive([]);
      if (stroke !== null) this.#handleStroke(stroke);
    };

    surface.addEventListener('pointerup', (e) => finish(e, true));

    /**
     * A cancelled pointer keeps its stroke rather than discarding it.
     *
     * `pointercancel` means the browser took the pointer away mid-gesture. The
     * earlier behaviour — throw the stroke away — is what made ink stop dead
     * and vanish partway through a line. Losing work someone deliberately drew
     * is a far worse failure than keeping a slightly short stroke, and the
     * classifier already refuses to read a stroke that means nothing.
     *
     * The final position is not appended here, because a cancel carries no
     * meaningful coordinate.
     */
    surface.addEventListener('pointercancel', (e) => finish(e, false));

    // Keep the browser from treating pen drags as text selection or panning.
    root.addEventListener('contextmenu', (e) => {
      if (this.#enabled) e.preventDefault();
    });
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

  #setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    this.#canvas.setEnabled(enabled);

    const root = this.#shadow.querySelector<HTMLElement>('.ink-root');
    if (root !== null) root.dataset['enabled'] = String(enabled);

    if (enabled) {
      // Measure on activation so the first stroke is not the one paying for it.
      this.#measuredAt = 0;
      this.#targetsNow();
      this.#checkHealth();
    }
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
  #checkHealth(): void {
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
      broken ? 'ink-ink could not find any options in this response' : undefined,
    );
  }
}

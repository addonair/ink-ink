/**
 * The visible ink layer (FR-10 – FR-14).
 *
 * Coordinates: strokes are held in document coordinates (FR-9). The canvas is
 * viewport-sized and `position: fixed`; each paint applies a transform of
 * `-scrollX, -scrollY`. Scrolling therefore updates one transform rather than
 * re-projecting every point, which is what keeps NFR-2 achievable — no layout
 * work happens in the scroll handler, only a rAF-scheduled repaint.
 */

import type { Mark, Point, Rect, Stroke, StrokeId, TargetId } from '@core/types';

/** How a committed stroke should be drawn (FR-13). */
export type StrokeState = 'pending' | 'resolved' | 'unresolved';

const COLOURS: Record<StrokeState, string> = {
  pending: '#2563eb',
  resolved: '#2563eb',
  unresolved: '#dc2626',
};

const WIDTHS: Record<StrokeState, number> = {
  pending: 2.5,
  resolved: 3,
  unresolved: 3,
};

/**
 * Unresolved ink is dashed as well as red, so the distinction survives for
 * anyone who cannot rely on colour alone (FR-13, FR-20).
 */
const DASH: Record<StrokeState, number[]> = {
  pending: [],
  resolved: [],
  unresolved: [6, 4],
};

interface Entry {
  stroke: Stroke;
  state: StrokeState;
  /**
   * Where the resolved target sat when the stroke was drawn.
   *
   * Document coordinates survive scrolling but not reflow: narrow the window
   * and the text moves to entirely different document coordinates while the
   * ink stays put. Remembering the anchor lets the ink be shifted by however
   * far its target moved (FR-12).
   */
  anchor: Rect | null;
  /** Which target to re-measure against after a reflow. */
  targetId: TargetId | null;
}

/** Shift every point in a stroke by a delta. */
function translated(stroke: Stroke, dx: number, dy: number): Stroke {
  return { ...stroke, points: stroke.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
}

export interface InkCanvasOptions {
  /** Host for the canvas. Should be inside a shadow root (NFR-11). */
  container: HTMLElement;
}

export class InkCanvas {
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #entries: Entry[] = [];
  #live: readonly Point[] = [];
  #frame: number | null = null;
  #disposed = false;

  readonly #onScroll = (): void => this.#schedule();
  #onReflowHook: (() => void) | null = null;
  #observer: ResizeObserver | null = null;

  readonly #onResize = (): void => {
    this.reanchor();
    this.#onReflowHook?.();
  };

  constructor(options: InkCanvasOptions) {
    const canvas = document.createElement('canvas');
    canvas.className = 'ink-canvas';
    options.container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('ink-ink: 2D canvas context unavailable');

    this.#canvas = canvas;
    this.#ctx = ctx;

    this.#sizeToViewport();
    window.addEventListener('scroll', this.#onScroll, { passive: true });
    window.addEventListener('resize', this.#onResize, { passive: true });

    /**
     * ResizeObserver as well as the `resize` event (FR-12).
     *
     * It fires after layout, so measuring the host page from it yields the new
     * geometry. And it catches reflows that are not window resizes at all — a
     * sidebar opening changes where the text sits without the window changing
     * size, which FR-12 names explicitly.
     *
     * Safe to observe the document here only because this canvas is
     * `position: fixed` and contributes nothing to layout. An in-flow canvas
     * sized to the document would widen the document to match itself and
     * observe its own feedback.
     */
    if (typeof ResizeObserver !== 'undefined') {
      this.#observer = new ResizeObserver(() => this.#onResize());
      this.#observer.observe(document.documentElement);
    }
  }

  /** Draw the in-progress stroke each frame while the pen is down (NFR-1). */
  drawLive(points: readonly Point[]): void {
    this.#live = points;
    this.#schedule();
  }

  /** Commit a finished stroke to the persistent layer (FR-10, US-2). */
  commit(stroke: Stroke, state: StrokeState = 'pending'): void {
    this.#entries.push({ stroke, state, anchor: null, targetId: null });
    this.#live = [];
    this.#schedule();
  }

  /** Restyle a stroke once its mark resolved or failed to (FR-13, FR-20). */
  setMarkState(mark: Mark): void {
    const entry = this.#entries.find((e) => e.stroke.id === mark.stroke.id);
    if (entry === undefined) return;

    if (mark.resolution.status === 'resolved') {
      entry.state = 'resolved';
      // Remember where the target was, so the ink can follow it (FR-12).
      entry.anchor = { ...mark.resolution.target.bounds };
      entry.targetId = mark.resolution.target.id;
    } else {
      entry.state = 'unresolved';
    }
    this.#schedule();
  }

  /**
   * Move ink to follow content that reflowed (FR-12).
   *
   * `current` maps target id to its freshly measured box; each anchored stroke
   * shifts by however far its target moved, so a circle round option B is still
   * round option B after the window changes width.
   *
   * Unresolved strokes have no anchor and cannot be placed, so they are
   * dropped rather than left floating over unrelated text — ink pointing at
   * the wrong answer is worse than no ink.
   */
  reflow(current: ReadonlyMap<TargetId, Rect>): void {
    let changed = false;

    for (let i = this.#entries.length - 1; i >= 0; i--) {
      const entry = this.#entries[i]!;
      const now = entry.targetId === null ? undefined : current.get(entry.targetId);

      if (entry.anchor === null || now === undefined) {
        this.#entries.splice(i, 1);
        changed = true;
        continue;
      }

      const dx = now.x - entry.anchor.x;
      const dy = now.y - entry.anchor.y;
      if (dx === 0 && dy === 0) continue;

      entry.stroke = translated(entry.stroke, dx, dy);
      entry.anchor = { ...now };
      changed = true;
    }

    if (changed) this.#schedule();
  }

  /** Stroke ids currently held, so callers can reconcile their own state. */
  strokeIds(): StrokeId[] {
    return this.#entries.map((e) => e.stroke.id);
  }

  /** Called after the page reflows, so the session can re-measure. */
  onReflow(hook: () => void): void {
    this.#onReflowHook = hook;
  }

  /** Erase one stroke — undo, per-mark removal, or FR-21 replacement. */
  erase(strokeId: StrokeId): void {
    const index = this.#entries.findIndex((e) => e.stroke.id === strokeId);
    if (index === -1) return;
    this.#entries.splice(index, 1);
    this.#schedule();
  }

  /** Erase everything (FR-14). */
  clear(): void {
    this.#entries.length = 0;
    this.#live = [];
    this.#schedule();
  }

  /**
   * Re-anchor ink after scroll or reflow (FR-11, FR-12).
   *
   * A resize changes the backing store, which resets the context state, so the
   * canvas is re-sized and fully repainted rather than merely translated.
   */
  reanchor(): void {
    this.#sizeToViewport();
    this.#schedule();
  }

  /** Toggle interception without tearing the layer down (FR-2, FR-3). */
  setEnabled(enabled: boolean): void {
    this.#canvas.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  /** The element pointer listeners should attach to. */
  get element(): HTMLCanvasElement {
    return this.#canvas;
  }

  destroy(): void {
    this.#disposed = true;
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#observer?.disconnect();
    this.#observer = null;
    window.removeEventListener('scroll', this.#onScroll);
    window.removeEventListener('resize', this.#onResize);
    this.#canvas.remove();
  }

  // --- internals ---------------------------------------------------------

  #sizeToViewport(): void {
    const dpr = window.devicePixelRatio || 1;
    this.#canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
    this.#canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
    this.#canvas.style.width = `${window.innerWidth}px`;
    this.#canvas.style.height = `${window.innerHeight}px`;
  }

  #schedule(): void {
    if (this.#disposed || this.#frame !== null) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#render();
    });
  }

  #render(): void {
    const ctx = this.#ctx;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);

    // Document coordinates in, viewport pixels out. Everything below draws in
    // document space and needs no knowledge of the scroll position.
    ctx.setTransform(dpr, 0, 0, dpr, -window.scrollX * dpr, -window.scrollY * dpr);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const entry of this.#entries) {
      this.#path(entry.stroke.points, entry.state);
    }
    if (this.#live.length > 0) this.#path(this.#live, 'pending');
  }

  #path(points: readonly Point[], state: StrokeState): void {
    const first = points[0];
    if (first === undefined) return;

    const ctx = this.#ctx;
    ctx.strokeStyle = COLOURS[state];
    ctx.lineWidth = WIDTHS[state];
    ctx.setLineDash(DASH[state]);

    ctx.beginPath();

    if (points.length === 1) {
      // A tap still needs to leave a visible mark.
      ctx.arc(first.x, first.y, WIDTHS[state], 0, Math.PI * 2);
      ctx.fillStyle = COLOURS[state];
      ctx.fill();
      return;
    }

    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
      const p = points[i]!;
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

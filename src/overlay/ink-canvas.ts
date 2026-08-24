/**
 * The visible ink layer (FR-10 – FR-14).
 *
 * Coordinates: strokes are held in document coordinates (FR-9). The canvas is
 * viewport-sized and `position: fixed`; each paint applies a transform of
 * `-scrollX, -scrollY`. Scrolling therefore updates one transform rather than
 * re-projecting every point, which is what keeps NFR-2 achievable — no layout
 * work happens in the scroll handler, only a rAF-scheduled repaint.
 */

import type { Mark, Point, Stroke, StrokeId } from '@core/types';

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
  readonly #onResize = (): void => this.reanchor();

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
  }

  /** Draw the in-progress stroke each frame while the pen is down (NFR-1). */
  drawLive(points: readonly Point[]): void {
    this.#live = points;
    this.#schedule();
  }

  /** Commit a finished stroke to the persistent layer (FR-10, US-2). */
  commit(stroke: Stroke, state: StrokeState = 'pending'): void {
    this.#entries.push({ stroke, state });
    this.#live = [];
    this.#schedule();
  }

  /** Restyle a stroke once its mark resolved or failed to (FR-13, FR-20). */
  setMarkState(mark: Mark): void {
    const entry = this.#entries.find((e) => e.stroke.id === mark.stroke.id);
    if (entry === undefined) return;
    entry.state = mark.resolution.status === 'resolved' ? 'resolved' : 'unresolved';
    this.#schedule();
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

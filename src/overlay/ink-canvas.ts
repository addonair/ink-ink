/**
 * The visible ink layer (FR-10 – FR-14).
 *
 * Each committed stroke is its own `<svg>`, absolutely positioned at the
 * stroke's document coordinates inside a layer that lives in the page.
 *
 * That is the whole trick for FR-11. A single canvas painted in viewport space
 * has to be repainted on every scroll, and that repaint runs on the main thread
 * while the browser scrolls page content on the compositor — so during a real
 * scroll the ink visibly lags behind, or appears to float over the text. Ink
 * that sits in the page scrolls with the page, by the same mechanism as the
 * text it is drawn over, and needs no scroll handler at all.
 *
 * Each SVG is sized to its own stroke, so the layer never extends the page
 * beyond the content the ink was drawn on.
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
const DASH: Record<StrokeState, string> = {
  pending: 'none',
  resolved: 'none',
  unresolved: '6 4',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Padding around a stroke's bounding box so the stroke width is not clipped. */
const PAD = 6;

interface Entry {
  stroke: Stroke;
  state: StrokeState;
  el: SVGSVGElement;
  path: SVGPathElement;
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

function boundsOf(points: readonly Point[]): Rect {
  const first = points[0];
  if (first === undefined) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = first.x;
  let maxX = first.x;
  let minY = first.y;
  let maxY = first.y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** An SVG path `d`, with points expressed relative to `origin`. */
function pathData(points: readonly Point[], origin: { x: number; y: number }): string {
  const first = points[0];
  if (first === undefined) return '';

  // A single tap still needs to leave a visible mark: a degenerate arc.
  if (points.length === 1) {
    const x = first.x - origin.x;
    const y = first.y - origin.y;
    return `M ${x} ${y} l 0.01 0`;
  }

  let d = `M ${first.x - origin.x} ${first.y - origin.y}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    d += ` L ${p.x - origin.x} ${p.y - origin.y}`;
  }
  return d;
}

export interface InkCanvasOptions {
  /** Host for the layer. Should be inside a shadow root (NFR-11). */
  container: HTMLElement;
}

export class InkCanvas {
  /** Captures pointer input. Fixed to the viewport; never painted on. */
  readonly #surface: HTMLDivElement;
  /** Holds the stroke SVGs. Positioned in the page so it scrolls with content. */
  readonly #layer: HTMLDivElement;

  readonly #entries: Entry[] = [];
  #liveEl: SVGSVGElement | null = null;
  #livePath: SVGPathElement | null = null;

  #onReflowHook: (() => void) | null = null;
  #observer: ResizeObserver | null = null;

  readonly #onResize = (): void => {
    this.#onReflowHook?.();
  };

  constructor(options: InkCanvasOptions) {
    const surface = document.createElement('div');
    surface.className = 'ink-surface';

    const layer = document.createElement('div');
    layer.className = 'ink-layer';

    options.container.append(layer, surface);
    this.#surface = surface;
    this.#layer = layer;

    /**
     * ResizeObserver rather than only the `resize` event (FR-12).
     *
     * It fires after layout, so measuring the host page from it yields the new
     * geometry, and it catches reflows that are not window resizes at all — a
     * sidebar opening moves the text without the window changing size, which
     * FR-12 names explicitly.
     *
     * Note there is deliberately no scroll listener anywhere in this class.
     */
    if (typeof ResizeObserver !== 'undefined') {
      this.#observer = new ResizeObserver(() => this.#onResize());
      this.#observer.observe(document.documentElement);
    }
    window.addEventListener('resize', this.#onResize, { passive: true });
  }

  /** Draw the in-progress stroke each frame while the pen is down (NFR-1). */
  drawLive(points: readonly Point[]): void {
    if (points.length === 0) {
      this.#liveEl?.remove();
      this.#liveEl = null;
      this.#livePath = null;
      return;
    }

    if (this.#liveEl === null) {
      const { svg, path } = this.#makeSvg('pending');
      this.#liveEl = svg;
      this.#livePath = path;
      this.#layer.appendChild(svg);
    }

    this.#place(this.#liveEl, this.#livePath!, points, 'pending');
  }

  /** Commit a finished stroke to the persistent layer (FR-10, US-2). */
  commit(stroke: Stroke, state: StrokeState = 'pending'): void {
    const { svg, path } = this.#makeSvg(state);
    this.#place(svg, path, stroke.points, state);
    this.#layer.appendChild(svg);

    this.#entries.push({ stroke, state, el: svg, path, anchor: null, targetId: null });

    this.#liveEl?.remove();
    this.#liveEl = null;
    this.#livePath = null;
  }

  /**
   * Restyle a stroke once its mark resolved or failed to (FR-13, FR-20), and
   * record where its target was so the ink can follow a later reflow (FR-12).
   */
  setMarkState(mark: Mark): void {
    const entry = this.#entries.find((e) => e.stroke.id === mark.stroke.id);
    if (entry === undefined) return;

    if (mark.resolution.status === 'resolved') {
      entry.state = 'resolved';
      entry.anchor = { ...mark.resolution.target.bounds };
      entry.targetId = mark.resolution.target.id;
    } else {
      entry.state = 'unresolved';
    }
    this.#style(entry.path, entry.state);
  }

  /**
   * Move ink to follow content that reflowed (FR-12).
   *
   * `current` maps target id to its freshly measured box; each anchored stroke
   * shifts by however far its target moved, so a circle round option B is still
   * round option B at a different window width.
   *
   * Unresolved strokes have no anchor and cannot be placed, so they are dropped
   * rather than left floating over unrelated text — ink pointing at the wrong
   * answer is worse than no ink.
   */
  reflow(current: ReadonlyMap<TargetId, Rect>): void {
    for (let i = this.#entries.length - 1; i >= 0; i--) {
      const entry = this.#entries[i]!;
      const now = entry.targetId === null ? undefined : current.get(entry.targetId);

      if (entry.anchor === null || now === undefined) {
        entry.el.remove();
        this.#entries.splice(i, 1);
        continue;
      }

      const dx = now.x - entry.anchor.x;
      const dy = now.y - entry.anchor.y;
      if (dx === 0 && dy === 0) continue;

      entry.stroke = {
        ...entry.stroke,
        points: entry.stroke.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
      };
      entry.anchor = { ...now };
      this.#place(entry.el, entry.path, entry.stroke.points, entry.state);
    }
  }

  /** Erase one stroke — undo, per-mark removal, or FR-21 replacement. */
  erase(strokeId: StrokeId): void {
    const index = this.#entries.findIndex((e) => e.stroke.id === strokeId);
    if (index === -1) return;
    this.#entries[index]!.el.remove();
    this.#entries.splice(index, 1);
  }

  /** Erase everything (FR-14). */
  clear(): void {
    for (const entry of this.#entries) entry.el.remove();
    this.#entries.length = 0;
    this.drawLive([]);
  }

  /** Stroke ids currently held, so callers can reconcile their own state. */
  strokeIds(): StrokeId[] {
    return this.#entries.map((e) => e.stroke.id);
  }

  /** Called after the page reflows, so the session can re-measure. */
  onReflow(hook: () => void): void {
    this.#onReflowHook = hook;
  }

  /**
   * Re-anchor after a reflow (FR-11, FR-12).
   *
   * Nothing to do for scrolling: the ink is in the page and scrolls with it.
   */
  reanchor(): void {
    /* positions are page-relative; scrolling needs no work */
  }

  /** Toggle interception without tearing the layer down (FR-2, FR-3). */
  setEnabled(enabled: boolean): void {
    this.#surface.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  /** The element pointer listeners should attach to. */
  get element(): HTMLElement {
    return this.#surface;
  }

  destroy(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    window.removeEventListener('resize', this.#onResize);
    this.#surface.remove();
    this.#layer.remove();
  }

  // --- internals ---------------------------------------------------------

  #makeSvg(state: StrokeState): { svg: SVGSVGElement; path: SVGPathElement } {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ink-stroke');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    this.#style(path, state);
    return { svg, path };
  }

  #style(path: SVGPathElement, state: StrokeState): void {
    path.setAttribute('stroke', COLOURS[state]);
    path.setAttribute('stroke-width', String(WIDTHS[state]));
    path.setAttribute('stroke-dasharray', DASH[state]);
  }

  /**
   * Size and position one stroke's SVG at its own document coordinates.
   *
   * Positions are relative to the layer's own origin, measured rather than
   * assumed — the host page may put body margin or a transform between the
   * document origin and where the layer actually sits.
   */
  #place(
    svg: SVGSVGElement,
    path: SVGPathElement,
    points: readonly Point[],
    state: StrokeState,
  ): void {
    const box = boundsOf(points);
    const origin = { x: box.x - PAD, y: box.y - PAD };
    const width = box.width + PAD * 2;
    const height = box.height + PAD * 2;
    const layerOrigin = this.#layerOrigin();

    svg.style.left = `${origin.x - layerOrigin.x}px`;
    svg.style.top = `${origin.y - layerOrigin.y}px`;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    path.setAttribute('d', pathData(points, origin));
    this.#style(path, state);
  }

  /** Document coordinates of the layer's own top-left corner. */
  #layerOrigin(): { x: number; y: number } {
    const r = this.#layer.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY };
  }
}

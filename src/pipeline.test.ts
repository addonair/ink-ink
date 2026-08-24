// @vitest-environment jsdom

/**
 * End-to-end pipeline test.
 *
 * Drives synthetic pen coordinates through the whole path:
 *
 *   PointerSample -> StrokeRecorder -> classifyStroke -> resolveStroke
 *                 -> MarkSet -> composeAnswerMessage -> adapter.insertText
 *
 * The point is to prove the `SiteAdapter` interface is sufficient, and that
 * the pieces agree about coordinates, question grouping, and ordering —
 * before any effort goes into real DeepSeek selectors.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { classifyStroke } from '@core/classify';
import { resolveStroke } from '@core/resolve';
import { StrokeRecorder, __resetStrokeIds } from '@core/stroke';
import type { Mark, Rect, Stroke, Target } from '@core/types';
import { composeAnswerMessage, DEFAULT_TRAILING_INSTRUCTION } from '@compose/message';
import { MarkSet } from '@state/marks';

import { fixtureAdapter } from './test-support/fixture-adapter';
import { buildMcqPage, optionBounds } from './test-support/mcq-page';

const DEFAULTS = { trailingInstruction: DEFAULT_TRAILING_INSTRUCTION };

/** Record a closed loop around `box` as if drawn with a pen. */
function drawCircleAround(box: Rect, margin = 8): Stroke {
  const rec = new StrokeRecorder();
  const left = box.x - margin;
  const right = box.x + box.width + margin;
  const top = box.y - margin;
  const bottom = box.y + box.height + margin;

  // Sample each edge so the path has enough points to read as a loop.
  const corners: Array<[number, number]> = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
    [left, top],
  ];

  let t = 0;
  rec.begin({ x: corners[0]![0], y: corners[0]![1], t });
  for (let i = 1; i < corners.length; i++) {
    const [fromX, fromY] = corners[i - 1]!;
    const [toX, toY] = corners[i]!;
    for (let step = 1; step <= 6; step++) {
      t += 10;
      rec.extend({
        x: fromX + ((toX - fromX) * step) / 6,
        y: fromY + ((toY - fromY) * step) / 6,
        t,
      });
    }
  }

  const stroke = rec.end();
  if (stroke === null) throw new Error('recorder produced no stroke');
  return stroke;
}

/** Record a short tick centred on `box`. */
function drawTickOn(box: Rect): Stroke {
  const rec = new StrokeRecorder();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  rec.begin({ x: cx - 6, y: cy, t: 0 });
  rec.extend({ x: cx, y: cy + 6, t: 10 });
  rec.extend({ x: cx + 8, y: cy - 8, t: 20 });

  const stroke = rec.end();
  if (stroke === null) throw new Error('recorder produced no stroke');
  return stroke;
}

/** The full per-stroke path: classify, resolve, record. */
function applyStroke(stroke: Stroke, targets: Target[], marks: MarkSet): Mark {
  const kind = classifyStroke(stroke);
  const resolution = resolveStroke(stroke, kind, targets);
  const mark: Mark = { stroke, kind, resolution };
  marks.add(mark);
  return mark;
}

describe('pipeline: stroke to composed message', () => {
  let targets: Target[];
  let marks: MarkSet;

  beforeEach(() => {
    document.body.innerHTML = '';
    __resetStrokeIds();
    buildMcqPage(document);
    marks = new MarkSet();

    const [message] = fixtureAdapter.assistantMessages();
    if (message === undefined) throw new Error('fixture produced no assistant message');
    targets = fixtureAdapter.parseTargets(message, { x: window.scrollX, y: window.scrollY });
  });

  it('parses every option across all four formats (FR-15, spec section 8)', () => {
    expect(targets).toHaveLength(9);
    expect(targets.map((t) => t.label)).toEqual(['A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C']);
    // "B) Paris", "B. Mercury", "(B) 56" all parse to the same label.
    expect(targets.filter((t) => t.label === 'B').map((t) => t.ordinal)).toEqual([1, 2, 3]);
  });

  it('resolves a circle drawn around an option to that option (FR-17)', () => {
    const mark = applyStroke(drawCircleAround(optionBounds(0, 1)), targets, marks);

    expect(mark.kind).toBe('circle');
    expect(mark.resolution.status).toBe('resolved');
    expect(mark.resolution.status === 'resolved' && mark.resolution.target.label).toBe('B');
  });

  it('resolves a tick placed on an option to that option (FR-18)', () => {
    const mark = applyStroke(drawTickOn(optionBounds(1, 2)), targets, marks);

    expect(mark.kind).toBe('tick');
    expect(mark.resolution.status === 'resolved' && mark.resolution.target.label).toBe('C');
  });

  it('composes the whole answered set into the spec section 5.6 shape', () => {
    applyStroke(drawCircleAround(optionBounds(0, 1)), targets, marks); // 1. B
    applyStroke(drawCircleAround(optionBounds(1, 1)), targets, marks); // 2. B
    applyStroke(drawTickOn(optionBounds(2, 2)), targets, marks); // 3. C

    expect(composeAnswerMessage(marks.resolved(), DEFAULTS)).toBe(
      ['My answers:', '1. B', '2. B', '3. C', '', 'Mark these and explain any I got wrong.'].join(
        '\n',
      ),
    );
  });

  it('numbers answers by question even when answered out of order (US-3)', () => {
    applyStroke(drawCircleAround(optionBounds(2, 0)), targets, marks); // 3. A
    applyStroke(drawCircleAround(optionBounds(0, 2)), targets, marks); // 1. C

    expect(composeAnswerMessage(marks.resolved(), DEFAULTS)).toContain('1. C\n3. A');
  });

  it('replaces an earlier answer when the same question is marked again (FR-21, US-5)', () => {
    const first = applyStroke(drawCircleAround(optionBounds(0, 0)), targets, marks); // 1. A

    const second = drawCircleAround(optionBounds(0, 2)); // change to C
    const kind = classifyStroke(second);
    const { displaced } = marks.add({
      stroke: second,
      kind,
      resolution: resolveStroke(second, kind, targets),
    });

    expect(displaced?.stroke.id).toBe(first.stroke.id);
    expect(marks.resolved()).toHaveLength(1);
    expect(composeAnswerMessage(marks.resolved(), DEFAULTS)).toContain('1. C');
  });

  it('flags a mark between two options as unresolved rather than guessing (FR-19)', () => {
    // A loop spanning options A and B of question 1: genuinely ambiguous.
    const a = optionBounds(0, 0);
    const b = optionBounds(0, 1);
    const spanning: Rect = {
      x: a.x,
      y: a.y,
      width: a.width,
      height: b.y + b.height - a.y,
    };

    const mark = applyStroke(drawCircleAround(spanning), targets, marks);

    expect(mark.resolution.status).toBe('unresolved');
    expect(marks.unresolved()).toHaveLength(1);
  });

  it('excludes unresolved marks from the composed message (FR-20)', () => {
    applyStroke(drawCircleAround(optionBounds(0, 1)), targets, marks); // resolves
    applyStroke(drawCircleAround({ x: 4000, y: 4000, width: 50, height: 20 }), targets, marks);

    const out = composeAnswerMessage(marks.resolved(), DEFAULTS);
    expect(out).toContain('1. B');
    expect(out.split('\n').filter((l) => /^\d+\./.test(l))).toHaveLength(1);
  });

  it('inserts the composed text into the composer without sending (FR-26, FR-27)', () => {
    applyStroke(drawCircleAround(optionBounds(0, 1)), targets, marks);
    const text = composeAnswerMessage(marks.resolved(), DEFAULTS);

    let submitted = false;
    const composer = fixtureAdapter.composer() as HTMLTextAreaElement;
    composer.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') submitted = true;
    });

    expect(fixtureAdapter.insertText(text)).toBe(true);
    expect(composer.value).toBe(text);
    // The user presses send. The extension never does.
    expect(submitted).toBe(false);
  });

  it('reports streaming so ink can be suppressed while content shifts', () => {
    expect(fixtureAdapter.isStreaming()).toBe(false);
    document.body.setAttribute('data-streaming', '');
    expect(fixtureAdapter.isStreaming()).toBe(true);
  });
});

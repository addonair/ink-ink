// @vitest-environment jsdom

/**
 * Nested message containers.
 *
 * Real chat markup wraps a message several layers deep, so one selector often
 * matches both an outer wrapper and an inner content div. The structural
 * fallback always dropped nested matches; the selector path did not, so the
 * same options were parsed twice and every mark came back unresolved.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __stopStreamWatcher, deepseekAdapter } from './deepseek';
import { resolveStroke } from '@core/resolve';
import type { Point, Stroke, StrokeId, Target } from '@core/types';

const OFFSET = { x: 0, y: 0 };

/** jsdom does not lay out; give each option line a distinct box. */
function stubLayout(): void {
  [...document.querySelectorAll('li, p')].forEach((el, i) => {
    el.getBoundingClientRect = (): DOMRect =>
      ({
        left: 100,
        right: 300,
        top: i * 30,
        bottom: i * 30 + 20,
        width: 200,
        height: 20,
        x: 100,
        y: i * 30,
        toJSON: () => ({}),
      }) as DOMRect;
  });
}

const targets = (): Target[] =>
  deepseekAdapter.assistantMessages().flatMap((m) => deepseekAdapter.parseTargets(m, OFFSET));

afterEach(() => {
  __stopStreamWatcher();
});

describe('nested message containers', () => {
  beforeEach(() => {
    // One selector matches the wrapper AND the inner content, as real chat
    // markup routinely does.
    document.body.innerHTML = `
      <div data-role="assistant">
        <div data-role="assistant">
          <p>1. Capital of France?</p>
          <ul><li>A) Berlin</li><li>B) Paris</li><li>C) Madrid</li></ul>
        </div>
      </div>`;
    stubLayout();
  });

  it('reports each message once, not once per nesting level', () => {
    expect(deepseekAdapter.assistantMessages()).toHaveLength(1);
  });

  it('parses each option exactly once', () => {
    const labels = targets().map((t) => t.label);
    expect(labels).toEqual(['A', 'B', 'C']);
  });

  it('a circle over an option still resolves', () => {
    // The user-visible symptom: duplicated targets made every mark ambiguous.
    const box = targets().find((t) => t.label === 'B')!.bounds;
    const points: Point[] = [
      [box.x - 8, box.y - 8],
      [box.x + box.width + 8, box.y - 8],
      [box.x + box.width + 8, box.y + box.height + 8],
      [box.x - 8, box.y + box.height + 8],
      [box.x - 8, box.y - 8],
    ].map(([x, y], i) => ({ x: x!, y: y!, t: i * 10 }));
    const stroke: Stroke = { id: 's' as StrokeId, points };

    expect(resolveStroke(stroke, 'circle', targets()).status).toBe('resolved');
  });
});

describe('why duplicates are fatal', () => {
  it('two targets with identical bounds make a good mark ambiguous', () => {
    // Records the mechanism rather than leaving it as folklore: identical
    // boxes score identically, so best and runner-up differ by 0, which is
    // inside AMBIGUITY_MARGIN.
    const bounds = { x: 100, y: 100, width: 200, height: 20 };
    const one = { id: 'a', kind: 'option', bounds, text: 'B) Paris', label: 'B' } as Target;
    const two = { ...one, id: 'b' } as Target;

    const points: Point[] = [
      [92, 92],
      [308, 92],
      [308, 128],
      [92, 128],
      [92, 92],
    ].map(([x, y], i) => ({ x: x!, y: y!, t: i * 10 }));
    const stroke: Stroke = { id: 's' as StrokeId, points };

    expect(resolveStroke(stroke, 'circle', [one]).status).toBe('resolved');

    const dup = resolveStroke(stroke, 'circle', [one, two]);
    expect(dup.status).toBe('unresolved');
    expect(dup.status === 'unresolved' && dup.reason).toBe('ambiguous');
  });
});

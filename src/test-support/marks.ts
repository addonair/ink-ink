/**
 * Test-only builders for marks and targets.
 *
 * Lives outside `core/` so the boundary rules stay honest, and outside
 * `adapters/` so nothing test-shaped can reach the bundle. Not referenced by
 * any production module.
 */

import type { Mark, MarkKind, QuestionId, Stroke, StrokeId, Target, TargetId } from '@core/types';

let seq = 0;

export function resetTestIds(): void {
  seq = 0;
}

export function makeStroke(points: Array<[number, number]> = [[0, 0]]): Stroke {
  seq += 1;
  return {
    id: `test-stroke-${seq}` as StrokeId,
    points: points.map(([x, y], i) => ({ x, y, t: i * 10 })),
  };
}

export function makeOption(opts: {
  label: string;
  ordinal: number;
  questionId: string;
  text?: string;
  bounds?: Target['bounds'];
}): Target {
  return {
    id: `${opts.questionId}-${opts.label}` as TargetId,
    kind: 'option',
    bounds: opts.bounds ?? { x: 0, y: 0, width: 100, height: 20 },
    text: opts.text ?? `${opts.label}) option ${opts.label}`,
    label: opts.label,
    questionId: opts.questionId as QuestionId,
    ordinal: opts.ordinal,
  };
}

export function resolvedMark(target: Target, kind: MarkKind = 'circle', confidence = 0.9): Mark {
  return {
    stroke: makeStroke(),
    kind,
    resolution: { status: 'resolved', target, confidence },
  };
}

export function unresolvedMark(
  reason:
    'no-targets' | 'below-threshold' | 'ambiguous' | 'unclassified-stroke' = 'below-threshold',
): Mark {
  return {
    stroke: makeStroke(),
    kind: 'circle',
    resolution: { status: 'unresolved', reason, confidence: 0 },
  };
}

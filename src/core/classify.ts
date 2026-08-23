/**
 * Stroke shape classification: is this a circle, a tick, or neither?
 *
 * Pure (NFR-15) and deliberately separate from resolution — FR-17 and FR-18
 * pick different scoring strategies based on the answer, so the decision needs
 * to be inspectable and testable on its own.
 *
 * The thresholds below are placeholders. Spec section 8 lists threshold tuning
 * as an open question answerable only with real strokes; they are named
 * constants so tuning is a one-line change with a test to prove it.
 */

import { endpointGap, pathLength, signedArea } from './geometry';
import type { MarkKind, Stroke } from './types';

/**
 * A stroke counts as closed when the gap between its endpoints is at most
 * this fraction of its total path length.
 */
export const CLOSURE_RATIO = 0.25;

/** Below this total travel, a stroke is a tap or tick rather than a loop. */
export const MIN_LOOP_PATH_LENGTH = 40;

/** A loop enclosing less than this many square px is noise, not a circle. */
export const MIN_LOOP_AREA = 200;

export interface ClassifierThresholds {
  closureRatio: number;
  minLoopPathLength: number;
  minLoopArea: number;
}

export const DEFAULT_THRESHOLDS: ClassifierThresholds = {
  closureRatio: CLOSURE_RATIO,
  minLoopPathLength: MIN_LOOP_PATH_LENGTH,
  minLoopArea: MIN_LOOP_AREA,
};

/**
 * Classify a stroke's shape.
 *
 * Returns 'unknown' rather than forcing a choice — FR-19's philosophy of
 * flagging instead of guessing starts here, not just at resolution.
 */
export function classifyStroke(
  stroke: Stroke,
  thresholds: ClassifierThresholds = DEFAULT_THRESHOLDS,
): MarkKind {
  const points = stroke.points;
  if (points.length === 0) return 'unknown';

  const length = pathLength(points);

  // A tap or a short flick is a tick (FR-18 covers "tick or short mark").
  // Checked before closure, because a tap trivially satisfies "endpoints are
  // close together" without being a loop.
  if (length < thresholds.minLoopPathLength) return 'tick';

  const closed = endpointGap(points) <= thresholds.closureRatio * length;
  const enclosed = Math.abs(signedArea(points));

  if (closed && enclosed >= thresholds.minLoopArea) return 'circle';

  // Long, open, or enclosing nothing meaningful: a squiggle, an underline, a
  // stray hand rest. Say so rather than guessing.
  return 'unknown';
}

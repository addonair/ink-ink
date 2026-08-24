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

import { boundingBox, endpointGap, pathLength, signedArea } from './geometry';
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

/**
 * How many times wider than tall an open stroke must be to read as a line.
 *
 * Generous, because a hand-drawn underline wanders: what distinguishes it is
 * that it travels sideways far more than it travels up and down.
 */
export const MIN_UNDERLINE_ASPECT = 3;

/**
 * How straight an open stroke must be to read as a line, from 0 to 1.
 *
 * Measured as endpoint distance over path length: 1 for a perfectly straight
 * stroke, lower the more it wanders. Aspect ratio alone is not enough — a
 * zigzag squiggle and a doubled-back sliver are both far wider than tall, and
 * both were wrongly read as underlines without this.
 *
 * Measured on the test fixtures: a hand-drawn underline with wobble scores
 * ~0.99, the squiggle ~0.45, and a closed sliver 0. This sits in that gap.
 */
export const MIN_UNDERLINE_STRAIGHTNESS = 0.75;

export interface ClassifierThresholds {
  closureRatio: number;
  minLoopPathLength: number;
  minLoopArea: number;
  minUnderlineAspect: number;
  minUnderlineStraightness: number;
}

export const DEFAULT_THRESHOLDS: ClassifierThresholds = {
  closureRatio: CLOSURE_RATIO,
  minLoopPathLength: MIN_LOOP_PATH_LENGTH,
  minLoopArea: MIN_LOOP_AREA,
  minUnderlineAspect: MIN_UNDERLINE_ASPECT,
  minUnderlineStraightness: MIN_UNDERLINE_STRAIGHTNESS,
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

  // Enclosure wins over flatness: a wide, flat ellipse is still a circle.
  if (closed && enclosed >= thresholds.minLoopArea) return 'circle';

  // A line drawn along text — an underline or a strike-through, which mean the
  // same thing here. It has to be both flat AND straight: aspect ratio alone
  // also matches a zigzag squiggle and a loop doubled back on itself, since
  // both are far wider than they are tall.
  const box = boundingBox(points);
  const flat = box !== null && box.width >= Math.max(box.height, 1) * thresholds.minUnderlineAspect;
  const straight = endpointGap(points) / length >= thresholds.minUnderlineStraightness;

  if (flat && straight) return 'underline';

  // Long, open, and going nowhere in particular: a squiggle or a stray hand
  // rest. Say so rather than guessing.
  return 'unknown';
}

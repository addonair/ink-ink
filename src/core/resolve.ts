/**
 * Resolve a stroke to the thing it was drawn over (FR-17, FR-18, FR-19).
 *
 * Pure (NFR-15): takes already-measured targets, returns a decision. The
 * adapter layer owns measurement; this owns judgement.
 */

import {
  boundingBox,
  centroid,
  coverageOf,
  distanceToRect,
  pointInPolygon,
  rectCenter,
} from './geometry';
import type { MarkKind, Resolution, Stroke, Target } from './types';

/**
 * Minimum confidence for a resolution to count (FR-19).
 *
 * PLACEHOLDER. Spec section 8: "FR-19 needs a real number. Only discoverable by
 * testing with actual strokes." Kept as a named export so tuning is one edit
 * with a regression test, not a magic number inside a comparison.
 *
 * Set deliberately high: a mark that fails to resolve costs one redrawn
 * gesture, and the review panel (US-6) makes it visible. A mark that resolves
 * to the wrong option costs a turn and misleads the model about what the
 * student thinks. Failing toward "unresolved" is the cheaper mistake.
 */
export const MIN_CONFIDENCE = 0.45;

/**
 * When the best and runner-up candidates are within this margin, the mark is
 * ambiguous rather than resolved. Guards the case where a circle straddles two
 * adjacent option lines — common with tightly-spaced markdown lists.
 */
export const AMBIGUITY_MARGIN = 0.15;

/**
 * Multiplier applied when a target overlaps the stroke's bounding box but its
 * centre is not actually inside the stroke path.
 *
 * Without this, FR-17 degrades from "enclosed by" to "inside the box around" —
 * a tall narrow loop, or a scribble that doubles back, has a bounding box
 * covering options it never went around.
 */
export const OUTSIDE_PATH_PENALTY = 0.4;

/** Distance in px at which a tick's proximity score falls to one half. */
export const PROXIMITY_FALLOFF = 40;

export interface ResolveOptions {
  minConfidence: number;
  ambiguityMargin: number;
  /** Restrict candidates by kind. MVP resolves options only; US-7 adds spans. */
  acceptKinds: readonly Target['kind'][];
}

export const DEFAULT_RESOLVE_OPTIONS: ResolveOptions = {
  minConfidence: MIN_CONFIDENCE,
  ambiguityMargin: AMBIGUITY_MARGIN,
  acceptKinds: ['option'],
};

/** A target with its score, exposed so the review panel can explain a decision. */
export interface ScoredTarget {
  target: Target;
  score: number;
}

const byScoreDescending = (a: ScoredTarget, b: ScoredTarget): number => b.score - a.score;

/**
 * Score every candidate for a circle mark (FR-17).
 *
 * Ranked by how much of each target's bounding box the stroke encloses.
 */
export function scoreByEnclosure(stroke: Stroke, targets: readonly Target[]): ScoredTarget[] {
  const region = boundingBox(stroke.points);
  if (region === null) return [];

  return targets
    .map((target) => {
      const coverage = coverageOf(target.bounds, region);
      if (coverage === 0) return { target, score: 0 };

      // Bounding-box overlap is necessary but not sufficient — check the
      // target's centre against the actual path.
      const enclosed = pointInPolygon(rectCenter(target.bounds), stroke.points);
      return { target, score: enclosed ? coverage : coverage * OUTSIDE_PATH_PENALTY };
    })
    .sort(byScoreDescending);
}

/**
 * Score every candidate for a tick or short mark (FR-18).
 *
 * Ranked by proximity of the target to the stroke centroid, mapped into 0..1
 * so both strategies produce comparable confidences.
 */
export function scoreByProximity(stroke: Stroke, targets: readonly Target[]): ScoredTarget[] {
  const centre = centroid(stroke.points);
  if (centre === null) return [];

  return targets
    .map((target) => {
      const d = distanceToRect(centre, target.bounds);
      // Hyperbolic falloff: 1 when the tick lands on the option, one half at
      // PROXIMITY_FALLOFF away, approaching 0 but never negative.
      return { target, score: 1 / (1 + d / PROXIMITY_FALLOFF) };
    })
    .sort(byScoreDescending);
}

const unresolved = (
  reason: Extract<Resolution, { status: 'unresolved' }>['reason'],
  confidence = 0,
): Resolution => ({ status: 'unresolved', reason, confidence });

/**
 * Resolve one stroke against the candidate targets.
 *
 * Contract:
 *   - no candidates            -> unresolved / 'no-targets'
 *   - kind is 'unknown'        -> unresolved / 'unclassified-stroke'
 *   - best score < threshold   -> unresolved / 'below-threshold'
 *   - best and second within
 *     ambiguityMargin          -> unresolved / 'ambiguous'
 *   - otherwise                -> resolved, carrying the winning score
 *
 * It never throws on unparseable input and never guesses (FR-19, NFR-9).
 */
export function resolveStroke(
  stroke: Stroke,
  kind: MarkKind,
  targets: readonly Target[],
  options: ResolveOptions = DEFAULT_RESOLVE_OPTIONS,
): Resolution {
  try {
    const candidates = targets.filter((t) => options.acceptKinds.includes(t.kind));
    if (candidates.length === 0) return unresolved('no-targets');

    if (kind === 'unknown') return unresolved('unclassified-stroke');

    const scored =
      kind === 'circle'
        ? scoreByEnclosure(stroke, candidates)
        : scoreByProximity(stroke, candidates);

    const best = scored[0];
    if (best === undefined) return unresolved('no-targets');
    if (best.score < options.minConfidence) return unresolved('below-threshold', best.score);

    const runnerUp = scored[1];
    if (runnerUp !== undefined && best.score - runnerUp.score < options.ambiguityMargin) {
      return unresolved('ambiguous', best.score);
    }

    return { status: 'resolved', target: best.target, confidence: best.score };
  } catch {
    // A malformed target must not take down the page the user is reading
    // (NFR-9). Degrade to the same outcome as a mark we simply could not read.
    return unresolved('below-threshold');
  }
}

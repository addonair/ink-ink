/**
 * Resolve a stroke to the thing it was drawn over (FR-17, FR-18, FR-19).
 *
 * Pure (NFR-15): takes already-measured targets, returns a decision. The
 * adapter layer owns measurement; this owns judgement.
 */

import type { MarkKind, Resolution, Stroke, Target } from './types';

/**
 * Minimum confidence for a resolution to count (FR-19).
 *
 * PLACEHOLDER. Spec section 8: "FR-19 needs a real number. Only discoverable by
 * testing with actual strokes." Kept as a named export so tuning is one edit
 * with a regression test, not a magic number inside a comparison.
 */
export const MIN_CONFIDENCE = 0.35;

/**
 * When the best and runner-up candidates are within this margin, the mark is
 * ambiguous rather than resolved. Guards the case where a circle straddles two
 * adjacent option lines — common with tightly-spaced markdown lists.
 */
export const AMBIGUITY_MARGIN = 0.1;

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

/**
 * Score every candidate for a circle mark (FR-17).
 *
 * Ranked by how much of each target's bounding box the stroke encloses.
 */
export function scoreByEnclosure(_stroke: Stroke, _targets: readonly Target[]): ScoredTarget[] {
  throw new Error('Not implemented: scoreByEnclosure');
}

/**
 * Score every candidate for a tick or short mark (FR-18).
 *
 * Ranked by proximity of the target to the stroke centroid, mapped into 0..1
 * so both strategies produce comparable confidences.
 */
export function scoreByProximity(_stroke: Stroke, _targets: readonly Target[]): ScoredTarget[] {
  throw new Error('Not implemented: scoreByProximity');
}

/**
 * Resolve one stroke against the candidate targets.
 *
 * Contract, which the tests should pin down:
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
  _stroke: Stroke,
  _kind: MarkKind,
  _targets: readonly Target[],
  _options: ResolveOptions = DEFAULT_RESOLVE_OPTIONS,
): Resolution {
  throw new Error('Not implemented: resolveStroke');
}

# Decision: underline-mark

## Date

2026-08-24

## Context

`docs/spec.md` section 3 scoped two mark types for the MVP: circle and tick.

In field use on DeepSeek the repository owner reached for **underline** three
separate times without prompting, and each time the mark drew ink and came back
"Unresolved" — the classifier had no shape for it. Underlining an answer is an
ordinary thing to do on paper, and arguably more natural on a line of text than
circling it.

## Decision

Add `underline` as a third mark type, with its own resolution rule.

Classification requires a stroke to be both **flat** (bounding box at least
three times wider than tall) and **straight** (endpoint distance over path
length at least 0.75). A closed loop is still tested first, so a wide flat
ellipse remains a circle.

Resolution uses `scoreByUnderline`, not the existing tick scoring.

## Alternatives

- **Leave it out and let people circle.** Rejected: the user repeatedly reached
  for it anyway, which is the strongest evidence available about what the
  gesture should be. Making the tool fit the hand beats teaching the hand.
- **Treat an underline as a tick.** Rejected for a concrete reason, below.

## Reason

A line is drawn _beneath_ the words it marks, which puts it **closer to the
next option than to the one it means**. Reusing nearest-centroid tick scoring
therefore selects the wrong answer — verified with a line between two options,
where proximity picks the option below and underline scoring picks the right
one.

Silently marking the wrong answer is the worst failure this project can
produce: it is invisible to the user and it misleads the model about what the
student thinks. That is what justifies a separate scoring strategy rather than
reusing an existing one.

`scoreByUnderline` multiplies horizontal overlap — does the line actually
travel along this option? — by a vertical score biased upward, so distance
below an option costs far less than distance above it.

## Consequences

### Benefits

- The gesture people reach for now works.
- Horizontal overlap rejects a line drawn beside the options, so the resolver
  did not become more willing to guess (FR-19 holds).

### Costs

- A third scoring strategy to keep correct, and a third set of thresholds that
  spec section 8 says are only tunable against real strokes.
- The classifier now has two thresholds for one shape (aspect and straightness),
  because aspect alone wrongly claimed a zigzag squiggle and a doubled-back
  sliver.

## Evidence

- Reported three times in use, unprompted.
- `src/core/classify.test.ts` — underline in both directions, and the two
  shapes that must NOT be underlines.
- `src/core/resolve.test.ts` — a line at y=156 between options spanning
  130–150 and 160–180 asserts that proximity scoring picks the lower option
  while `resolveStroke` picks the correct one. Confirmed failing before the
  change.

## Status

Accepted

## Related Rules

- `.claude/rules/verify-tests-can-fail.md` — the discriminating test above was
  written to fail first, after an earlier version passed under proximity
  scoring and so tested nothing.

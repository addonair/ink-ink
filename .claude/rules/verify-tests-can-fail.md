# Rule: verify-tests-can-fail

## Rule

Before trusting a test or a browser probe, establish that it could have failed.
Two concrete checks, both cheap:

1. **Order of operations.** Capture every measurement _before_ any action that
   mutates what is being measured. Submitting, reloading, resizing, and
   clearing all destroy the thing under test.
2. **Falsifiability.** If the assertion would also pass against the broken
   behaviour, it is not a test. Run it against the old code, or pick inputs
   where correct and incorrect answers differ numerically.

For anything transient — lag, drift, a frame-timing bug — measure **in the
frame the effect occurs**, not after a settle delay. `scrollTo` followed by a
wait reports where things end up, not where they were during the scroll.

## Scope

All tests, and especially browser probes driven through the
`browser-automation` skill, where the page can be mutated between capture and
assertion without any type error to catch it.

Does not apply to pure-function unit tests over fixed inputs, where there is no
state to disturb.

## Why

Five test defects in a single session, all of which cost more time than the
production bugs they were meant to find. Worse, two of them produced _false
confidence_: a passing test and a wrong conclusion reported to the user.

The failure mode is asymmetric. A broken test that fails is a nuisance. A
broken test that passes sends work in the wrong direction — one of these caused
a whole canvas rewrite to be built on a misdiagnosis and then thrown away.

## Evidence

Session of 2026-08-24, all in this repository:

- `src/core/geometry.test.ts` — the bowtie point-in-polygon case asserted the
  wrong lobes were enclosed. The implementation was correct.
- `src/core/resolve.test.ts` — a threshold test used a stroke scoring exactly
  1.0, so a 0.99 threshold could never reject it. It proved nothing.
- `src/core/stroke.test.ts` — compared whole points including timestamps, which
  legitimately differ, when the claim was about position.
- Browser probe for FR-12 — called `page.goto` mid-script, reloading the page
  and mounting a fresh session, so it measured ink that had just been created.
  This produced a false "reflow is broken" reading and drove a canvas rewrite
  that had to be reverted.
- Browser probe for reflow + submit — clicked the submit button, which clears
  all ink, _before_ reading the ink's position. Reported `-26` for a stroke
  that had actually moved `+224`.
- Scroll verification — used `scrollTo` plus a 300ms wait, which measures the
  settled position. The reported bug was mid-scroll lag, so the probe could not
  have observed it, and "could not reproduce" was reported to the user for a
  bug that was real.

## Confidence

High. Six independent instances in one session, one root cause, and a
demonstrated cost: a reverted rewrite plus an incorrect report to the user.

## Added

2026-08-24

## Last Verified

2026-08-24

## Status

Active

## Enforcement

Manual. No lint rule can see that an assertion is vacuous or that a probe
measured after mutating.

The practical discipline: after writing a probe, state out loud what value it
would report if the code were broken. If that value is the same as the passing
value, the probe is wrong.

## Exceptions

None.

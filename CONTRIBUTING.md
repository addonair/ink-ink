# Contributing

## Setup

```bash
npm install
npm run dev
```

Load `dist/` as an unpacked extension via `chrome://extensions` → Developer mode
→ **Load unpacked**.

Requires Node 22+ and, for the icon generator and state validator, Python 3.

## Before opening a PR

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

CI runs the same set plus a format check and a manifest permission check.

## Requirement IDs

[`docs/spec.md`](docs/spec.md) is the source of truth, and it numbers everything
(FR-1, NFR-9, …). Reference the ID your change serves — in the code comment, the
commit message, or the PR description. It is how someone six months from now
works out why a piece of code is shaped the way it is.

If you're changing behaviour the spec describes, update the spec in the same PR.

## Architecture: the parts that aren't negotiable

**`src/core/` is pure.** It may not import from `adapters`, `overlay`, `state`,
`compose`, or `content`, and may not touch `chrome`, `document`, or `window`.
ESLint will stop you. This isn't stylistic — the spec's stated plan is to lift
this core into a standalone app later, and that stays cheap only while the
boundary holds. If core seems to need the DOM, measure in the adapter and pass
the result in.

**Host selectors go in `src/adapters/`.** Nowhere else. Chat sites change their
markup without warning; keeping every selector behind the `SiteAdapter`
interface is what makes the repair a one-file change instead of an
investigation.

**Nothing throws into the host page.** This code runs inside someone's chat
session. An adapter that can't find what it expects returns `[]`, `null`, or
`false`. The extension going quiet is an acceptable failure; breaking the page
someone is reading is not.

**The extension never sends a message.** It puts text in the composer; the user
presses send. No synthesised Enter, no clicking the send button. This is the
line that keeps the project on the right side of host-site terms of service.

## Adding a host site

1. Write an adapter implementing `SiteAdapter` (`src/adapters/types.ts`).
2. Register it in `src/adapters/registry.ts`.
3. Add its origin to `HOST_MATCHES` in `manifest.config.ts`.

No core changes should be needed. If they are, that's worth discussing in the
PR — it may mean the interface is wrong.

## Tests

Vitest, colocated as `*.test.ts`. Default environment is `node`; opt into the
DOM per-file with `// @vitest-environment jsdom`.

The pure modules — `core/`, `state/`, `compose/` — should be well covered, since
they're testable without a browser and hold the logic that's hardest to eyeball.
Stubs are currently marked `it.todo` with the contract in the test name; filling
one in means replacing the `.todo` with a real assertion.

## Tuning thresholds

The stroke classifier and resolver have placeholder constants
(`MIN_CONFIDENCE`, `CLOSURE_RATIO`, `MIN_LOOP_AREA`, …). The spec is explicit
that real numbers are only discoverable by drawing real strokes. When you tune
one, add a test that pins the behaviour you tuned it for — otherwise the next
person has no way to know which cases the number was chosen to satisfy.

Keep them named and exported. Inlining them into comparisons makes future tuning
an archaeology exercise.

## Repository knowledge

This repo uses the `living-codebase` skill. Significant architectural decisions
go in `.claude/decisions/`; conventions confirmed by repeated evidence can
become rules in `.claude/rules/`. Both must cite real evidence — a file, a test,
a decision. `npm run validate` checks their structure and flags rules that
haven't been re-verified in 90 days.

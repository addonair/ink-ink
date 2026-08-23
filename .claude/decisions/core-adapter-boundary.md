# Decision: core-adapter-boundary

## Date

2026-08-23

## Context

Two requirements in `docs/spec.md` pull in the same direction and are cheap now
but expensive to retrofit:

- **NFR-15** — stroke capture, coordinate handling, and hit-testing must be
  reusable in a standalone application later. Spec section 9 states this
  outright: if the gesture proves out, the same core moves to a first-party
  quiz UI where none of the DOM-fragility risk exists.
- **NFR-10** — host-site selectors must be isolated so that supporting a new
  site, or repairing one that changed its markup, requires no core changes.

Spec section 8 names DOM fragility as the top risk and calls breakage "a
question of when, not if."

## Decision

A one-way dependency, enforced by lint rather than documented by convention:

```text
adapters ──> core        (adapters import core types)
overlay  ──> core
content  ──> everything  (the only wiring layer)

core ──> nothing
```

`src/core/` may not import from `adapters`, `overlay`, `state`, `compose`, or
`content`, and may not reference `chrome`, `document`, or `window`.

The key consequence for the type model: `Target` carries a plain `Rect` in
document coordinates, **not** an `HTMLElement`. Adapters measure; core judges.

Every `SiteAdapter` method must degrade rather than throw — return `[]`, `null`,
or `false` when the markup is unrecognisable (NFR-9).

## Alternatives

- **Let core query the DOM directly.** Less indirection, no measurement layer.
  Rejected: it welds core to a browser and to whatever the host's markup looks
  like this month, forfeiting NFR-15 entirely.
- **Document the boundary in CONTRIBUTING and trust reviewers.** Rejected: the
  first convenient import erodes it, and the erosion is invisible in a diff.

## Reason

The boundary's whole value is that it holds without anyone remembering it. The
`living-codebase` skill's own guidance — prefer executable enforcement over
documentation-only rules — applies directly, and the enforcement here costs one
ESLint block.

Two mechanisms, deliberately overlapping:

1. `no-restricted-imports` and `no-restricted-globals` scoped to
   `src/core/**` in `eslint.config.js`, each carrying a message that explains
   the requirement rather than just refusing.
2. Vitest defaults to the `node` environment, so an accidental DOM dependency
   in core fails the test run rather than passing quietly under jsdom.

## Consequences

### Benefits

- Verified enforcing: a probe file importing `@adapters/registry` and touching
  `document` from inside `src/core/` produced 2 ESLint errors with the intended
  messages.
- Lifting core into a standalone app stays a move, not a rewrite.
- A DeepSeek markup change is confined to `src/adapters/deepseek.ts`.

### Costs

- Core cannot take shortcuts through the DOM; measurement must be passed in.
  This is the point, but it will feel like friction when writing the first
  resolution code.
- One more layer to wire in `src/content/index.ts`.

## Evidence

- `docs/spec.md` NFR-10, NFR-15, NFR-9, and sections 8 and 9.
- `eslint.config.js` — the `src/core/**` override block.
- `vitest.config.ts` — `environment: 'node'` by default, with a documented
  per-file jsdom opt-in.
- `src/adapters/registry.test.ts` — tests that unsupported hosts and throwing
  matchers both leave the extension inert.
- Boundary enforcement confirmed by probe on 2026-08-23.

## Status

Accepted

## Related Rules

- None yet. The lint rules are the enforcement; a written rule would duplicate
  them without adding anything.

# Decision: build-tooling

## Date

2026-08-23

## Context

`ink-ink` is a Manifest V3 Chrome extension built from scratch. It needed a
bundler, a manifest strategy, a test runner, and a lint setup before any feature
code could land.

The iteration loop matters more than usual here. The core interaction is a
stylus gesture whose thresholds — stroke closure, minimum loop area, resolution
confidence — are explicitly listed in `docs/spec.md` section 8 as tunable only
by drawing real strokes and seeing what happens. A slow reload cycle taxes every
one of those adjustments.

## Decision

Vite 8 + `@crxjs/vite-plugin` 2.7.1 + TypeScript, with Vitest for tests and
flat-config ESLint + Prettier.

The manifest is generated from a typed `manifest.config.ts` rather than
hand-written, so the host allowlist and the permission list are type-checked and
reviewable in one place.

**TypeScript is pinned to `^6.0.3`, not the latest 7.x.**

## Alternatives

- **esbuild + a hand-written `manifest.json`.** Fewer dependencies and nothing
  to break when CRXJS lags a Chrome release, but no HMR — every threshold tweak
  costs a manual extension reload.
- **TypeScript 7.x**, the current `latest` at 7.0.2.

## Reason

CRXJS gives HMR on the content script, which is the file that will be edited
most while tuning stroke handling. Its published peer range covers Vite 8, so
the pairing is supported rather than incidental.

The TypeScript pin is forced by a real constraint, not caution:

- `typescript-eslint@8.67.0` — the current stable release — declares
  `typescript: ">=4.8.4 <6.1.0"`.
- TypeScript `latest` is 7.0.2, outside that range.
- `typescript-eslint` publishes no stable release supporting 7.x; its
  `dist-tags` show only `latest: 8.67.0` and prerelease channels.

Installing TS 7 therefore breaks typed linting. TS 6.0.3 is the newest release
the whole toolchain actually supports.

## Consequences

### Benefits

- `npm install` resolves with no peer warnings — verified on 2026-08-23.
- Typed manifest: the permission list is a reviewed, type-checked artifact.
- HMR on the content script.

### Costs

- Not on the newest TypeScript. Revisit when `typescript-eslint` ships stable
  TS 7 support; the pin should be lifted then, not carried forward by habit.
- A CRXJS dependency that sits between us and Chrome's release cadence.
- Two TS-6 migration adjustments were needed and are already applied:
  `baseUrl` is gone (deprecated in 6, removed in 7) with `paths` entries made
  relative, and `allowImportingTsExtensions` is on so `vite.config.ts` can
  import `./manifest.config.ts` with its extension, which Vite's native config
  loader requires.

## Evidence

- `npm view typescript-eslint@8.67.0 peerDependencies` → `typescript: ">=4.8.4 <6.1.0"`
- `npm view typescript dist-tags` → `latest: 7.0.2`
- `npm view @crxjs/vite-plugin@2.7.1 peerDependencies` → vite range includes `^8.0.0`
- Verified locally: `npm install` clean, `tsc --noEmit` clean, `eslint .` clean,
  `vite build` emits a valid MV3 `dist/manifest.json`.
- Toolchain choice confirmed by the repository owner before scaffolding.

## Status

Accepted

## Related Rules

- None yet. If a future session tries to bump TypeScript past 6.x and finds
  linting broken, that is the evidence for promoting this into a rule.

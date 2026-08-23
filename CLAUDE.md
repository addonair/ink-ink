# CLAUDE.md

Guidance for working in this repository.

## What this is

A Manifest V3 Chrome extension that lets someone mark up an AI chat response
with a stylus — circling or ticking MCQ options — and turns those marks into a
text message inserted into the site's own composer.

**[`docs/spec.md`](docs/spec.md) is the source of truth for requirements.** It
uses stable IDs (FR-1, NFR-9, …). Reference them in code comments, commit
messages, and PRs; they are how a change is traced back to its reason.

Current state: **scaffold**. Most modules under `src/` are typed stubs that
throw `Not implemented`. That is deliberate — the structure and boundaries are
settled so that feature work has somewhere to land, without guessed behaviour
baked in first.

## Invariants

These are enforced, not aspirational. Breaking one should fail a check.

1. **`src/core/` imports nothing from the rest of the app** — no adapters, no
   overlay, no `chrome`, no `document`, no `window` (NFR-15). ESLint enforces
   this, and Vitest's `node` default catches accidental DOM use. If core seems
   to need something from outside, invert the dependency and pass it in.

2. **Host-site selectors live only in `src/adapters/`** (NFR-10). A CSS selector
   string in `content/` or `overlay/` is a lint warning for a reason: when a
   chat site changes its markup, the repair must stay a one-file change.

3. **Failure degrades to inert** (NFR-9). This code runs inside someone's chat
   page. An adapter that cannot parse anything makes the extension do nothing;
   it never throws into the host page. `src/content/index.ts` is the one file
   with no throwing stubs, for this reason.

4. **The extension never sends** (FR-27, NFR-8). `insertText` puts text in the
   composer. It does not dispatch Enter and does not click send. This is the
   project's ToS line and it is not a detail.

5. **Permissions stay at `storage` alone** (NFR-5/6/7). CI fails the build if
   the manifest grows a permission or any `host_permissions`. Widening the list
   needs a record under `.claude/decisions/`.

## Toolchain notes

- **TypeScript is pinned to `^6.0.3` on purpose.** `typescript-eslint@8.67.0`
  declares `typescript: ">=4.8.4 <6.1.0"`, so the current TS 7.x breaks typed
  linting. Do not bump it without checking that peer range first. Full reasoning
  in [`.claude/decisions/build-tooling.md`](.claude/decisions/build-tooling.md).
- `tsconfig.json` has no `baseUrl` (deprecated in TS 6, removed in 7); `paths`
  entries are relative and must keep their `./` prefix.
- Vitest defaults to the `node` environment. A test needing the DOM opts in with
  `// @vitest-environment jsdom` at the top of the file.

## Before finishing work

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

`npm run validate` checks the `.claude/` knowledge base for stale entries.

Do not commit unless asked.

## Open questions, deliberately unanswered

These are recorded in the spec as unknowns. Don't invent values for them —
they're answerable only with real strokes on real hardware.

- **The FR-19 confidence threshold.** `MIN_CONFIDENCE` in `src/core/resolve.ts`
  is a placeholder. Same for the classifier thresholds in `src/core/classify.ts`.
  They are named constants so tuning is one edit plus a test.
- **Whether the target stylus reports `pointerType === 'pen'`.** Some pens report
  as touch or mouse. `shouldCapture()` in `src/core/stroke.ts` is deliberately
  one small swappable predicate.
- **The real DeepSeek selectors.** Everything in `src/adapters/deepseek.ts` is
  marked `TODO(verify)` and is expected to be wrong until checked against a live
  session.

## Learned knowledge

This repo uses the `living-codebase` skill (vendored at
`.claude/skills/living-codebase/`). Repository knowledge accumulates under
`.claude/` — decisions, rules, observations, patterns — and is evidence-backed:
record what the code actually shows, not what seems likely. Only
`.claude/decisions/` exists so far, which is correct; the rest appear when there
is real evidence to put in them.

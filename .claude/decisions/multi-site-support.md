# Decision: multi-site-support

## Date

2026-08-24

## Context

`docs/spec.md` section 3 scoped "one supported host site to start (DeepSeek),
architected for more". The extension now works on DeepSeek, and the owner asked
for it to work on any AI chat.

Reading `src/adapters/deepseek.ts` before starting showed the architecture had
held: **only `matches()` and the id prefix were DeepSeek-specific.** Message
discovery, MCQ parsing, streaming detection, scroll-root detection, composer
discovery and text insertion were already site-independent. There was no
DeepSeek-shaped logic to generalise, only a wrapper to extract.

## Decision

Support six sites — DeepSeek, ChatGPT, Claude, Gemini, Copilot, Perplexity —
driven by one data table in `src/adapters/sites.ts`.

Both the manifest's `content_scripts.matches` and the adapter registry are
generated from that table. Adding a site is one entry.

## Alternatives

- **One hand-written adapter per site.** Rejected: there was nothing per-site to
  write. Six near-identical files would be six places for the same bug.
- **Match all URLs and detect chat pages at runtime.** Rejected outright. It
  would load the extension on every page anyone visits, for no benefit that an
  explicit list does not already give.

## Reason

**On the widened allowlist.** NFR-6 asks for the narrowest possible host
permissions, and this goes from one domain to six. The justification is that it
remains an explicit list of named domains rather than a wildcard, the extension
requests no `host_permissions` and still only the `storage` permission, and the
ink layer defaults to off on every page load (FR-4). A site the user never
visits costs nothing; a site they do visit is one they asked for.

**On one table for both lists.** The manifest allowlist and the registry were
previously separate, and the registry carried a comment warning that adding a
host to one without the other silently did nothing — producing either a site
that loads and does nothing, or an adapter that never runs. That is one chance
to get it wrong per site, and it scales with exactly the thing being added.

**On not guessing selectors.** The DeepSeek selectors originally shipped were
guesses, were never verified, and were probably never what made it work — the
structural parser was. Writing guessed class names for five more sites would
repeat a mistake already made twice in this repository, so per-site selectors
are recorded only where actually known (ChatGPT's
`data-message-author-role`), and finding messages by shape remains the real
mechanism.

## Consequences

### Benefits

- Adding a site is one data entry with no new logic.
- A consistency test asserts every site both resolves to an adapter and is
  covered by a generated match pattern, so the two lists cannot drift.

### Costs

- The extension now loads on six domains rather than one. Inert by default, but
  it is six pages it could in principle disturb rather than one.
- Five of the six are unverified against real markup. The structural fallback is
  expected to carry them; the composer is the likely failure point, which is
  what the clipboard fallback in `InkSession.submit` exists for.

## Evidence

- `src/adapters/generic.ts` — the extracted adapter; nothing in it is
  site-specific.
- `src/adapters/sites.test.ts` — consistency between manifest patterns and
  registry, confirmed failing when the registry is stubbed to drop a site.
- Built `dist/manifest.json` — twelve match patterns (apex plus wildcard for
  six domains), `permissions: ["storage"]`, no `host_permissions`.

## Status

Accepted

## Related Rules

- `.claude/rules/verify-tests-can-fail.md` — the consistency test was verified
  to fail before being trusted.

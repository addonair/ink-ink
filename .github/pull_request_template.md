## What and why

<!-- What changes, and which spec requirement or issue it serves. -->

Relates to: <!-- FR-xx / NFR-xx / #issue -->

## Checks

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass
- [ ] New behaviour has a test, or an explicit note on why it cannot have one

## Boundaries

<!-- These are the invariants that make future work cheap. Confirm or explain. -->

- [ ] `src/core/` still imports nothing from adapters, overlay, or Chrome APIs (NFR-15)
- [ ] Host-site selectors are confined to `src/adapters/` (NFR-10)
- [ ] A failure here degrades to inert rather than breaking the host page (NFR-9)

## Permissions

- [ ] No new manifest permissions

<!-- If this adds one, say which and why. CI fails the build otherwise, and
     widening the permission list needs a record under .claude/decisions/. -->

## Notes for the reviewer

<!-- Anything surprising, any tradeoff you are unsure about, anything you want
     a second opinion on. -->

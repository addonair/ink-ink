# Living Codebase State

This directory (`.claude/`) contains repository-specific knowledge learned
from actual code, tests, tooling, git history, and human feedback. It is the
evolving memory for the `living-codebase` skill.

## Directories

- `knowledge/` — stable repository facts and architecture.
- `patterns/` — recurring, reusable patterns matched across the codebase.
- `rules/` — evidence-backed development rules.
- `decisions/` — significant architectural decisions.
- `observations/` — hypotheses that are not yet rules.
- `scripts/` — safe, repository-specific automation.
- `metrics/` — optional development-system measurements.

## Lifecycle at a glance

```text
observation (Open → Candidate) → rule (Experimental → Active → Verified) → Deprecated
```

Rules must be evidence-backed, scoped, and periodically verified. A rule that
loses its evidence should be deprecated, not kept for comfort.

## What not to edit

Do not edit the skill's `SKILL.md` as a normal learning mechanism. The skill
is the stable constitution; this directory is the evolving memory. Persist
knowledge here, or in tests and automation — never by rewriting the skill.

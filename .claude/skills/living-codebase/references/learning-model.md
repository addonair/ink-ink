# Living Codebase Learning Model

This document is a detailed reference for the `living-codebase` skill. Load it when the main `SKILL.md` is not enough.

## State model

Knowledge moves along one lifecycle, split across two kinds of file so that
each status has exactly one home:

```text
observation file            rule file
────────────────            ─────────────────────────────
Open → Candidate     ──►     Experimental → Active → Verified
                                                        │
                                                        ▼
                                                   Deprecated
```

- **Observation `Open`** — recorded once; a hypothesis, nothing more.
- **Observation `Candidate`** — independent evidence suggests it is worth
  promoting. Promoting creates a rule and sets the observation to `Promoted`
  (or `Rejected` if the evidence does not hold up).
- **Rule `Experimental`** — newly promoted; follow loosely.
- **Rule `Active`** — repeated evidence; follow unless context justifies
  deviation.
- **Rule `Verified`** — additionally confirmed by tests, tooling, or an
  explicit decision.
- **Rule `Deprecated`** — its original reason no longer holds.

The status vocabularies are therefore:

- observations: `Open | Candidate | Promoted | Rejected`
- rules: `Experimental | Active | Verified | Deprecated`

These are exactly what `templates/observation.md`, `templates/rule.md`, and
`scripts/validate_state.py` expect. A rule may move backward (e.g. `Active`
→ `Experimental`) when evidence weakens.

## Evidence

Prefer independent evidence:

- separate modules
- separate tests
- separate commits
- explicit human decisions
- tooling configuration
- production/integration behavior

Repeated copies of the same implementation are weaker evidence than independent examples.

## Promotion checklist

Before promoting:

- Is the behavior intentional?
- Is it repeated?
- Is there a clear future action?
- Is its scope clear?
- Are exceptions known?
- Does another rule already cover it?
- Could it be automated?
- What evidence would invalidate it?

## Rule lifecycle

Every active rule should periodically be checked against current code.

If evidence disappears:

1. investigate;
2. lower confidence or mark experimental;
3. deprecate if invalid;
4. remove if historically unhelpful.

## Safety boundaries

The learning system must not:

- rewrite `SKILL.md` autonomously;
- weaken tests merely to satisfy a rule;
- silently alter security controls;
- silently change deployment behavior;
- silently modify broad repository policy;
- create rules from hallucinated evidence;
- claim certainty without evidence.

High-impact changes require human awareness and normal repository review.

## Pattern matching

Patterns are the highest-leverage form of learning for future work: they let
new code match the repository on sight. Record a pattern in `.claude/patterns/`
when the same structural solution appears across independent examples.

A recorded pattern should capture:

- the recurring problem it addresses;
- the shape of the solution (not a full copy — the essential structure);
- two or more independent instances that demonstrate it;
- where it applies and where it deliberately does not.

Before writing new code, match it against existing patterns for the area:

1. Find the nearest neighbor (a similar module, endpoint, or test).
2. Prefer its structure over a generic or personally-preferred one.
3. If no pattern fits, that is a signal — either the task is genuinely new,
   or a pattern is missing and should be recorded once evidence accumulates.

A single occurrence is not a pattern. Repeated copies of the *same* file are
weaker evidence than the same structure arrived at independently.

## Learning metrics

Metrics are optional. If used, track useful signals such as:

- repeated failure classes
- rule count
- active vs deprecated rules
- rules backed by tests
- rules backed by automation
- stale rules found
- recurring manual checks

Do not optimize for a high rule count. A smaller, accurate rule set is better.

## Example reasoning

Bad:

```text
A new module used dependency injection once.
Therefore all code must use dependency injection.
```

Better:

```text
Six independent services use constructor injection, tests instantiate
those services explicitly, and the project configuration has no service
container.

Conclusion: constructor injection is a strong convention.
```

Better still:

```text
Create a rule, then add a lint/type/test guard if practical.
```

# living-codebase (skill)

A Claude skill for operating as a long-lived developer inside an evolving
repository: learn architecture and conventions from code, tests, git, and
human feedback; maintain evidence-backed rules and knowledge; detect stale
rules; and improve development guardrails without blindly rewriting its own
instructions.

## Package contents

```text
living-codebase/
├── SKILL.md                     # the constitution (loaded when the skill triggers)
├── README.md                    # this file
├── references/
│   └── learning-model.md        # detailed learning / promotion / pattern model
├── templates/
│   ├── rule.md                  # copy into .claude/rules/
│   ├── observation.md           # copy into .claude/observations/
│   ├── decision.md              # copy into .claude/decisions/
│   └── state-readme.md          # copy into .claude/README.md at bootstrap
└── scripts/
    ├── scan_repository.py       # read-only repository map for bootstrapping
    └── validate_state.py        # read-only validator for .claude state files
```

## The two script locations (important)

There are two, and they are not the same:

- **Bundled skill scripts** — the `scripts/` directory *in this package*
  (`scan_repository.py`, `validate_state.py`). These ship with the skill and
  are run in place against a target repository. They are stable tooling.
- **Repository automation** — `.claude/scripts/` *inside a target repo*.
  This is where the skill writes repository-specific guardrails it learns
  over time. It is created lazily, only when there is something to automate.

The bundled scripts resolve `.claude/` relative to the repository root and
work whether invoked from the root or a nested subdirectory.

## Quick start

```bash
# Map the repository before substantial work:
python3 /path/to/living-codebase/scripts/scan_repository.py --path .

# Validate learned state (safe to run in a pre-commit hook, from any dir):
python3 /path/to/living-codebase/scripts/validate_state.py
python3 /path/to/living-codebase/scripts/validate_state.py --stale-days 90
```

Both scripts are read-only and require only the Python 3 standard library.

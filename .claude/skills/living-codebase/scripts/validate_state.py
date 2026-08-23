#!/usr/bin/env python3
"""Validate Living Codebase state files without modifying the repository.

Checks that rules, observations, and decisions under ``.claude/`` are
structurally complete and actually filled in (not left as raw template
placeholders), that status values are from the allowed set, and,
optionally, that ``active``/``verified`` rules have been verified recently.

This script is read-only. It never edits repository files.

Usage:
    validate_state.py [--path DIR] [--stale-days N] [--stale-fatal]

    --path DIR      Treat DIR as the repository root instead of searching.
    --stale-days N  Report active/verified rules whose "Last Verified"
                    date is more than N days old.
    --stale-fatal   Make stale rules a failure (non-zero exit) instead of
                    a warning. Only meaningful with --stale-days.

Exit codes:
    0  state is valid (and, if --stale-fatal, nothing stale)
    1  structural / placeholder / status errors found
    2  stale rules found and --stale-fatal was given
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path

# Status vocabularies. Rules and observations live on the same lifecycle
# described in references/learning-model.md:
#   observation Open -> Candidate -> Promoted/Rejected
#   rule        Experimental -> Active -> Verified -> Deprecated
RULE_STATUSES = {"experimental", "active", "verified", "deprecated"}
OBSERVATION_STATUSES = {"open", "candidate", "promoted", "rejected"}

# A value still equal to one of these (or containing an unfilled <...>
# angle-bracket marker, or the literal YYYY-MM-DD) means the author copied
# the template and never filled the field in.
PLACEHOLDER_VALUES = {
    "low | medium | high",
    "experimental | active | deprecated",
    "experimental | active | verified | deprecated",
    "open | candidate | promoted | rejected",
    "accepted | superseded | reverted",
    "manual",  # only a placeholder for Enforcement when nothing else is present
}
PLACEHOLDER_RE = re.compile(r"<[^>\n]+>|YYYY-MM-DD")
DATE_RE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")

ERRORS: list[str] = []
WARNINGS: list[str] = []


def find_root(explicit: str | None) -> Path:
    """Locate the repository root.

    Prefer the nearest ancestor that contains a ``.claude`` directory; fall
    back to the nearest ancestor containing ``.git``; otherwise the current
    directory. This makes the validator behave the same whether it is run
    from the repository root or a nested subdirectory (important for
    pre-commit hooks).
    """
    if explicit:
        return Path(explicit).resolve()
    here = Path.cwd().resolve()
    for base in (here, *here.parents):
        if (base / ".claude").is_dir():
            return base
    for base in (here, *here.parents):
        if (base / ".git").exists():
            return base
    return here


def split_sections(text: str) -> dict[str, str]:
    """Map each ``## Heading`` to the text beneath it (until the next ##)."""
    sections: dict[str, str] = {}
    current: str | None = None
    buf: list[str] = []
    for line in text.splitlines():
        if line.startswith("## "):
            if current is not None:
                sections[current] = "\n".join(buf).strip()
            current = line[3:].strip()
            buf = []
        elif current is not None:
            buf.append(line)
    if current is not None:
        sections[current] = "\n".join(buf).strip()
    return sections


def is_placeholder(value: str) -> bool:
    v = value.strip()
    if not v:
        return True
    if PLACEHOLDER_RE.search(v):
        return True
    if v.lower() in PLACEHOLDER_VALUES:
        return True
    return False


def check_required(sections: dict[str, str], required: list[str], path: Path) -> None:
    for heading in required:
        if heading not in sections:
            ERRORS.append(f"{path}: missing '## {heading}'")
        elif is_placeholder(sections[heading]):
            ERRORS.append(f"{path}: '## {heading}' is empty or still a template placeholder")


def check_status(sections: dict[str, str], allowed: set[str], path: Path, required: bool) -> str | None:
    if "Status" not in sections:
        if required:
            ERRORS.append(f"{path}: missing '## Status'")
        return None
    value = sections["Status"].strip()
    if is_placeholder(value):
        if required:
            ERRORS.append(f"{path}: '## Status' is still a template placeholder")
        return None
    token = value.split()[0].lower() if value.split() else ""
    if token not in allowed:
        ERRORS.append(
            f"{path}: '## Status' is '{value}'; expected one of "
            f"{sorted(allowed)}"
        )
        return None
    return token


def parse_date(value: str) -> dt.date | None:
    m = DATE_RE.search(value)
    if not m:
        return None
    try:
        return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def validate_rules(root: Path, stale_days: int | None) -> None:
    rules_dir = root / ".claude" / "rules"
    if not rules_dir.is_dir():
        return
    today = dt.date.today()
    for path in sorted(rules_dir.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        sections = split_sections(path.read_text(encoding="utf-8"))
        check_required(
            sections,
            ["Rule", "Scope", "Why", "Evidence", "Confidence", "Added", "Last Verified"],
            path,
        )
        status = check_status(sections, RULE_STATUSES, path, required=True)

        if stale_days is not None and status in {"active", "verified"}:
            verified = parse_date(sections.get("Last Verified", ""))
            if verified is not None:
                age = (today - verified).days
                if age > stale_days:
                    WARNINGS.append(
                        f"{path}: {status} rule last verified {age} days ago "
                        f"(> {stale_days}); re-verify or deprecate"
                    )


def validate_observations(root: Path) -> None:
    obs_dir = root / ".claude" / "observations"
    if not obs_dir.is_dir():
        return
    for path in sorted(obs_dir.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        sections = split_sections(path.read_text(encoding="utf-8"))
        check_required(
            sections,
            ["Observation", "Evidence", "Confidence", "Date", "Verification Needed"],
            path,
        )
        # Status is optional on observations, but validated when present.
        check_status(sections, OBSERVATION_STATUSES, path, required=False)


def validate_decisions(root: Path) -> None:
    dec_dir = root / ".claude" / "decisions"
    if not dec_dir.is_dir():
        return
    for path in sorted(dec_dir.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        sections = split_sections(path.read_text(encoding="utf-8"))
        check_required(
            sections,
            ["Date", "Context", "Decision", "Alternatives", "Reason", "Consequences", "Evidence"],
            path,
        )
        check_status(sections, {"accepted", "superseded", "reverted"}, path, required=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Living Codebase state files.")
    parser.add_argument("--path", help="Repository root (default: search upward for .claude/.git).")
    parser.add_argument("--stale-days", type=int, default=None,
                        help="Warn on active/verified rules verified more than N days ago.")
    parser.add_argument("--stale-fatal", action="store_true",
                        help="Treat stale rules as an error (exit 2).")
    args = parser.parse_args()

    root = find_root(args.path)
    claude_dir = root / ".claude"
    if not claude_dir.is_dir():
        print(f"No .claude directory found under {root}; nothing to validate.")
        return 0

    validate_rules(root, args.stale_days)
    validate_observations(root)
    validate_decisions(root)

    for warning in WARNINGS:
        print(f"warning: {warning}")

    if ERRORS:
        print("\nLiving Codebase validation failed:")
        for error in ERRORS:
            print(f"- {error}")
        return 1

    if WARNINGS and args.stale_fatal:
        print(f"\n{len(WARNINGS)} stale rule(s) found; failing because --stale-fatal was set.")
        return 2

    msg = "Living Codebase state is structurally valid."
    if WARNINGS:
        msg += f" ({len(WARNINGS)} staleness warning(s).)"
    print(msg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

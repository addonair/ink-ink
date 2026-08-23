#!/usr/bin/env python3
"""Produce a lightweight repository map for Living Codebase bootstrapping.

Read-only. Emits JSON describing the repository's shape so a developer can
orient quickly without reading everything: languages, likely frameworks,
test locations, CI configuration, and probable entry points.

Usage:
    scan_repository.py [--path DIR]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path

IGNORE = {
    ".git", ".hg", ".svn", ".venv", "venv", "env", "node_modules", "dist",
    "build", "out", "target", ".next", ".nuxt", ".cache", "__pycache__",
    ".mypy_cache", ".pytest_cache", ".idea", ".vscode", "coverage", ".tox",
}

TOP_FILES = {
    "README.md", "CONTRIBUTING.md", "CLAUDE.md", "AGENTS.md", "Makefile",
    "package.json", "pyproject.toml", "setup.py", "setup.cfg",
    "requirements.txt", "Pipfile", "poetry.lock", "go.mod", "Cargo.toml",
    "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml", "tsconfig.json",
    ".editorconfig", ".pre-commit-config.yaml",
}

SOURCE_EXTS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java", ".kt",
    ".rb", ".php", ".cs", ".c", ".cc", ".cpp", ".h", ".hpp", ".swift",
    ".scala", ".clj", ".ex", ".exs",
}

TEST_DIR_NAMES = {"test", "tests", "__tests__", "spec", "specs", "e2e"}
TEST_FILE_RE = re.compile(r"(^test_|_test\.|\.test\.|\.spec\.|Test\.java$|Spec\.\w+$)")

ENTRY_HINTS = {
    "main.py", "app.py", "manage.py", "wsgi.py", "asgi.py", "__main__.py",
    "index.js", "index.ts", "server.js", "server.ts", "main.go", "main.rs",
    "Main.java", "Program.cs",
}

# manifest filename -> list of (regex on file text, framework label)
FRAMEWORK_SIGNS = {
    "package.json": [
        (r'"next"', "Next.js"), (r'"react"', "React"), (r'"vue"', "Vue"),
        (r'"svelte"', "Svelte"), (r'"@angular/core"', "Angular"),
        (r'"express"', "Express"), (r'"@nestjs/core"', "NestJS"),
        (r'"vite"', "Vite"), (r'"jest"', "Jest"), (r'"vitest"', "Vitest"),
        (r'"typescript"', "TypeScript"),
    ],
    "pyproject.toml": [
        (r"django", "Django"), (r"flask", "Flask"), (r"fastapi", "FastAPI"),
        (r"pytest", "pytest"), (r"sqlalchemy", "SQLAlchemy"),
    ],
    "requirements.txt": [
        (r"(?i)^django", "Django"), (r"(?i)^flask", "Flask"),
        (r"(?i)^fastapi", "FastAPI"), (r"(?i)^pytest", "pytest"),
        (r"(?i)^sqlalchemy", "SQLAlchemy"),
    ],
    "go.mod": [(r"gin-gonic", "Gin"), (r"gorilla/mux", "Gorilla")],
    "Cargo.toml": [(r"actix", "Actix"), (r"axum", "Axum"), (r"tokio", "Tokio")],
    "pom.xml": [(r"spring-boot", "Spring Boot")],
    "build.gradle": [(r"spring-boot", "Spring Boot")],
    "composer.json": [(r"laravel/framework", "Laravel"), (r"symfony/", "Symfony")],
    "Gemfile": [(r"rails", "Rails"), (r"sinatra", "Sinatra")],
}


def git_branch(root: Path) -> str | None:
    try:
        return subprocess.check_output(
            ["git", "-C", str(root), "branch", "--show-current"],
            text=True, stderr=subprocess.DEVNULL,
        ).strip() or None
    except Exception:
        return None


def detect_ci(root: Path) -> list[str]:
    found = []
    checks = {
        "GitHub Actions": root / ".github" / "workflows",
        "GitLab CI": root / ".gitlab-ci.yml",
        "CircleCI": root / ".circleci",
        "Azure Pipelines": root / "azure-pipelines.yml",
        "Jenkins": root / "Jenkinsfile",
        "Travis": root / ".travis.yml",
    }
    for label, path in checks.items():
        if path.exists():
            found.append(label)
    return found


def detect_frameworks(root: Path) -> list[str]:
    frameworks: set[str] = set()
    for manifest, signs in FRAMEWORK_SIGNS.items():
        path = root / manifest
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for pattern, label in signs:
            if re.search(pattern, text, re.MULTILINE):
                frameworks.add(label)
    return sorted(frameworks)


def walk(root: Path):
    """Yield (relative_parts, filename) for every file, pruning IGNORE dirs."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORE]
        rel = Path(dirpath).relative_to(root)
        parts = () if str(rel) == "." else rel.parts
        for name in filenames:
            yield parts, name


def main() -> None:
    parser = argparse.ArgumentParser(description="Map a repository for bootstrapping.")
    parser.add_argument("--path", default=".", help="Repository root (default: cwd).")
    args = parser.parse_args()
    root = Path(args.path).resolve()

    top_dirs, top_files = [], []
    for p in sorted(root.iterdir(), key=lambda x: x.name.lower()):
        if p.name in IGNORE:
            continue
        (top_dirs if p.is_dir() else top_files).append(p.name)

    languages: dict[str, int] = {}
    test_dirs: set[str] = set()
    test_files = 0
    entry_points: list[str] = []

    for parts, name in walk(root):
        ext = Path(name).suffix.lower()
        if ext in SOURCE_EXTS:
            languages[ext] = languages.get(ext, 0) + 1
        if parts and parts[0].lower() in TEST_DIR_NAMES:
            test_dirs.add(parts[0])
        elif any(seg.lower() in TEST_DIR_NAMES for seg in parts):
            test_dirs.add("/".join(parts))
        if TEST_FILE_RE.search(name):
            test_files += 1
        if name in ENTRY_HINTS:
            entry_points.append("/".join((*parts, name)))

    result = {
        "root": str(root),
        "git_branch": git_branch(root),
        "top_level_directories": top_dirs,
        "top_level_files": top_files,
        "interesting_top_level_files_present": sorted(set(top_files) & TOP_FILES),
        "source_file_extensions": dict(
            sorted(languages.items(), key=lambda x: (-x[1], x[0]))
        ),
        "likely_frameworks": detect_frameworks(root),
        "ci_configuration": detect_ci(root),
        "test_locations": sorted(test_dirs),
        "test_file_count": test_files,
        "likely_entry_points": sorted(entry_points)[:20],
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

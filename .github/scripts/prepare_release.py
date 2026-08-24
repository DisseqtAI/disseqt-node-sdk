"""Prepare a release: bump versions, stamp the CHANGELOG, extract notes.

Used by .github/workflows/release.yml. Run from the repo root:

    python3 .github/scripts/prepare_release.py <patch|minor|major>

- bumps ``"version"`` in package.json (regex on the version line, so npm's
  formatting is preserved byte-for-byte)
- keeps ``SDK_VERSION`` in src/version.ts in lockstep when the file exists
  (tests/version.test.ts guards the pairing)
- retitles ``## Unreleased`` in CHANGELOG.md to ``## X.Y.Z``, keeping a
  fresh empty Unreleased section above it
- writes the new section's body to release_notes.md (not committed) for
  the GitHub release
- prints the new version to stdout (and nothing else)
"""

from __future__ import annotations

import pathlib
import re
import subprocess
import sys

BUMPS = ("patch", "minor", "major")


def current_version_is_tagged(current: str) -> bool:
    """Refuse to bump past a version that was never released.

    If package.json's version has no matching ``v<version>`` git tag,
    someone hand-bumped it in a feature branch. Bumping again would skip
    that number entirely (the python repo jumped 0.9.0 -> 0.11.0 exactly
    this way on 2026-08-24). On this repo release-finalize.yml normally
    self-heals a merged hand-bump by tagging and releasing it — so if
    this guard fires, finalize most likely skipped it, e.g. because
    src/version.ts was not bumped in lockstep (check that first).

    Fail-open when git itself is unavailable or errors for environmental
    reasons: the guard must never be the thing that breaks a release.
    Only a definitive "tag does not exist" (git exit code 1) blocks.
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "-q", "--verify", f"refs/tags/v{current}"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as exc:
        print(f"warning: tag check skipped (git unavailable: {exc})", file=sys.stderr)
        return True
    if result.returncode == 0:
        return True
    if result.returncode == 1:
        print(
            f"package.json is at {current}, but tag v{current} does not exist — "
            "the version was hand-bumped without being released. Bumping again "
            f"would silently skip {current}. Likely cause: release-finalize "
            "skipped it because src/version.ts disagreed with package.json — "
            f"fix the lockstep and merge, and finalize will release {current}; "
            "or revert the hand-bump so the Release workflow owns the "
            "numbering, then re-run. Reminder: feature branches should only "
            "add Unreleased CHANGELOG entries — never touch the version.",
            file=sys.stderr,
        )
        return False
    print(
        f"warning: tag check inconclusive (git exited {result.returncode}); continuing",
        file=sys.stderr,
    )
    return True


def notes_current() -> int:
    """Print the CHANGELOG section for the version currently in package.json.

    Used by release-finalize.yml after a release PR merges — no mutation.
    """
    text = pathlib.Path("package.json").read_text(encoding="utf-8")
    match = re.search(r'^  "version": "(\d+\.\d+\.\d+)",$', text, flags=re.M)
    if match is None:
        print("package.json has no plain X.Y.Z version line", file=sys.stderr)
        return 1
    version = match.group(1)
    log = pathlib.Path("CHANGELOG.md").read_text(encoding="utf-8")
    heading = f"## {version}"
    if heading not in log:
        print("Maintenance release.")
        return 0
    tail = log.split(heading, 1)[1]
    next_section = re.search(r"^## ", tail, flags=re.M)
    notes = (tail[: next_section.start()] if next_section else tail).strip()
    print(notes if notes else "Maintenance release.")
    return 0


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--notes-current":
        return notes_current()
    if len(sys.argv) != 2 or sys.argv[1] not in BUMPS:
        print(f"usage: prepare_release.py <{'|'.join(BUMPS)}|--notes-current>", file=sys.stderr)
        return 2
    bump = sys.argv[1]

    package = pathlib.Path("package.json")
    text = package.read_text(encoding="utf-8")
    match = re.search(r'^  "version": "(\d+)\.(\d+)\.(\d+)",$', text, flags=re.M)
    if match is None:
        print("package.json has no plain X.Y.Z version line", file=sys.stderr)
        return 1
    major, minor, patch = (int(g) for g in match.groups())
    if not current_version_is_tagged(f"{major}.{minor}.{patch}"):
        return 1
    if bump == "major":
        major, minor, patch = major + 1, 0, 0
    elif bump == "minor":
        minor, patch = minor + 1, 0
    else:
        patch += 1
    version = f"{major}.{minor}.{patch}"
    package.write_text(
        text[: match.start()] + f'  "version": "{version}",' + text[match.end() :],
        encoding="utf-8",
    )

    version_ts = pathlib.Path("src/version.ts")
    if version_ts.exists():
        ts = version_ts.read_text(encoding="utf-8")
        ts, count = re.subn(
            r"export const SDK_VERSION = '\d+\.\d+\.\d+';",
            f"export const SDK_VERSION = '{version}';",
            ts,
            count=1,
        )
        if count != 1:
            print("src/version.ts has no SDK_VERSION constant to bump", file=sys.stderr)
            return 1
        version_ts.write_text(ts, encoding="utf-8")

    changelog = pathlib.Path("CHANGELOG.md")
    log = changelog.read_text(encoding="utf-8")
    marker = "## Unreleased"
    heading = f"## {version}"
    if marker in log:
        log = log.replace(marker, f"{marker}\n\n{heading}", 1)
    elif log.startswith("# Changelog\n"):
        # Older changelogs predate the Unreleased convention — create it.
        log = log.replace("# Changelog\n", f"# Changelog\n\n{marker}\n\n{heading}\n", 1)
    else:
        print("CHANGELOG.md has neither an Unreleased section nor a Changelog title", file=sys.stderr)
        return 1
    changelog.write_text(log, encoding="utf-8")

    tail = log.split(heading, 1)[1]
    next_section = re.search(r"^## ", tail, flags=re.M)
    notes = (tail[: next_section.start()] if next_section else tail).strip()
    if not notes:
        notes = "Maintenance release."
    pathlib.Path("release_notes.md").write_text(notes + "\n", encoding="utf-8")

    print(version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

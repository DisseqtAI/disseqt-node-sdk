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
import sys

BUMPS = ("patch", "minor", "major")


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in BUMPS:
        print(f"usage: prepare_release.py <{'|'.join(BUMPS)}>", file=sys.stderr)
        return 2
    bump = sys.argv[1]

    package = pathlib.Path("package.json")
    text = package.read_text(encoding="utf-8")
    match = re.search(r'^  "version": "(\d+)\.(\d+)\.(\d+)",$', text, flags=re.M)
    if match is None:
        print("package.json has no plain X.Y.Z version line", file=sys.stderr)
        return 1
    major, minor, patch = (int(g) for g in match.groups())
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

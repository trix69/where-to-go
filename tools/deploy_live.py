#!/usr/bin/env python3
"""Ship to live: trix69/where-to-go -> https://trix69.github.io/where-to-go/

    python3 tools/deploy_live.py --ship 0.1

There is no default. The version must be named on the command line and must equal VERSION, because a
mistyped or remembered version is how the wrong build reaches the person who depends on it.

What it does, and nothing else:
  1. refuses on a dirty tree (a live site must be rebuildable from a commit);
  2. refuses unless `python3 tools/version.py` agrees across VERSION, version.json and index.html;
  3. fast-forwards `main` from `dev` (no merge commits, no surprise diffs);
  4. writes version.json for the live version, commits if it changed, tags `v<version>`;
  5. pushes `main` and the tag, then returns to `dev`.

Work happens on `dev`; `main` only ever holds what Trix has approved for live.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip()


def git(*args, check=True, capture=True):
    p = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=capture)
    if check and p.returncode != 0:
        sys.exit(f"git {' '.join(args)} failed:\n{(p.stderr or p.stdout).strip()}")
    return (p.stdout or "").strip()


def main():
    args = sys.argv[1:]
    if len(args) != 2 or args[0] != "--ship":
        sys.exit(
            f"Live ships only when you ask for it, naming the version.\n"
            f"    python3 tools/deploy_live.py --ship {VERSION}\n"
            f"(VERSION is {VERSION}; the test site is a different command: tools/deploy_test.py)")
    wanted = args[1]
    if wanted != VERSION:
        sys.exit(f"asked to ship {wanted}, but VERSION is {VERSION}. Bump it or ship the right number.")

    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    if git("status", "--porcelain"):
        sys.exit("working tree is dirty — commit to `dev` first, then ship the commit")

    check = subprocess.run([sys.executable, "tools/version.py"], cwd=ROOT, text=True, capture_output=True)
    if check.returncode != 0:
        sys.exit((check.stderr or check.stdout).strip())

    git("checkout", "main")
    git("merge", "--ff-only", "dev")

    # Live version.json corresponds to the live version, not a test build's stamp.
    (ROOT / "version.json").write_text(json.dumps({"version": VERSION}) + "\n", encoding="utf-8")
    if git("status", "--porcelain"):
        git("add", "version.json")
        git("-c", "user.name=Hermes", "-c", "user.email=hermes@local",
            "commit", "-m", f"Version {VERSION}: live version.json")

    git("tag", "-f", f"v{VERSION}")
    git("push", "origin", "main")
    git("push", "-f", "origin", f"v{VERSION}")
    head = git("rev-parse", "--short", "HEAD")
    print(f"Shipped {VERSION} ({head}) -> https://trix69.github.io/where-to-go/")

    git("checkout", "dev")
    git("merge", "--ff-only", "main")
    git("push", "-q", "origin", "dev", check=False)


if __name__ == "__main__":
    main()

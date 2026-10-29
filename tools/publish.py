#!/usr/bin/env python3
"""Create the two GitHub repos, push, and turn on GitHub Pages for both.

    python3 tools/publish.py            # do it
    python3 tools/publish.py --dry-run  # print the steps, touch nothing

Live:  trix69/where-to-go       -> https://trix69.github.io/where-to-go/
Test:  trix69/where-to-go-test  -> https://trix69.github.io/where-to-go-test/

Both are PUBLIC, because Pages for a private repo needs a paid plan and nothing secret is in the
tree (the TfNSW key lives in the proxy's environment, never here).

Refuses to run without `gh auth status` succeeding: creating repos under the wrong account, or
pushing this project somewhere Trix did not mean, is not a mistake worth risking for speed.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GH = "gh"
LIVE = "where-to-go"
TEST = "where-to-go-test"
OWNER = "trix69"
DRY = "--dry-run" in sys.argv[1:]
LIVE = "--live" in sys.argv[1:]   # pushing main is a ship; tools/deploy_live.py is the normal route


def run(cmd, cwd=ROOT, check=True, capture=True):
    if DRY:
        print("  would run:", " ".join(cmd))
        return ""
    p = subprocess.run(cmd, cwd=cwd, text=True, capture_output=capture)
    if check and p.returncode != 0:
        sys.exit(f"failed: {' '.join(cmd)}\n{(p.stderr or p.stdout or '').strip()}")
    return (p.stdout or "").strip()


def exists(repo):
    if DRY:
        return False  # so a dry run prints the create step for both repos
    return subprocess.run([GH, "repo", "view", f"{OWNER}/{repo}"], capture_output=True).returncode == 0


def enable_pages(repo):
    # Pages from the default branch root: there is no build step, so the source is the site.
    if DRY:
        print(f"  would enable Pages on {OWNER}/{repo} from main /")
        return
    p = subprocess.run(
        [GH, "api", "-X", "POST", f"repos/{OWNER}/{repo}/pages",
         "-f", "source[branch]=main", "-f", "source[path]=/"],
        capture_output=True, text=True)
    if p.returncode != 0 and "already enabled" not in (p.stderr or ""):
        sys.exit(f"could not enable Pages on {repo}: {(p.stderr or p.stdout).strip()}")
    print(f"  Pages on {OWNER}/{repo} -> https://{OWNER}.github.io/{repo}/")


def main():
    if not DRY and subprocess.run([GH, "auth", "status"], capture_output=True).returncode != 0:
        sys.exit("gh is not authenticated. Run: gh auth login  (or export GH_TOKEN=...)")
    if DRY:
        print("dry run — nothing below is executed\n")

    print(f"live repo {OWNER}/{LIVE}")
    if not exists(LIVE):
        run([GH, "repo", "create", f"{OWNER}/{LIVE}", "--public",
             "--description", "Where To Go · 想去哪儿 — one tap from your saved places to a transit answer"])
    if DRY:
        run(["git", "remote", "add", "origin", f"https://github.com/{OWNER}/{LIVE}.git"])
    elif not run(["git", "remote"], check=False):
        run(["git", "remote", "add", "origin", f"https://github.com/{OWNER}/{LIVE}.git"])
    if LIVE:
        run(["git", "push", "-u", "origin", "main"])
    else:
        print("  not touching live: `main` is pushed only by tools/deploy_live.py --ship <version>")
    enable_pages(LIVE)

    print(f"test repo {OWNER}/{TEST}")
    if not exists(TEST):
        run([GH, "repo", "create", f"{OWNER}/{TEST}", "--public",
             "--description", "Where To Go — test build (noindex)"])
    run([sys.executable, "tools/deploy_test.py"])
    enable_pages(TEST)

    print("\nDone. Both sites take a minute or two to publish the first time.")
    print(f"  live https://{OWNER}.github.io/{LIVE}/")
    print(f"  test https://{OWNER}.github.io/{TEST}/")
    print("Next: point config.js proxyBase at the Worker (see proxy/README.md), then re-deploy.")


if __name__ == "__main__":
    main()

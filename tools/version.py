#!/usr/bin/env python3
"""Keep the app version in step across VERSION, version.json and index.html.

Usage:
  python3 tools/version.py           check that all agree (exits 1 if not), including the ?v= stamps
  python3 tools/version.py bump      next version: 0.1 ... 0.9, 1.0, 1.1 ...
  python3 tools/version.py set 0.1   set an exact version

The rules, same shape as typing-zen and Violin Toolkit:
- **Only a ship to live bumps the version**; test builds and work on `dev` do not. The test site shows
  VERSION with "-test" while `dev` is the shipped commit, and the next version with "-test" once `dev`
  has moved past it (tools/deploy_test.py derives this) — so a post-1.0 test build reads 1.1-test.
- Every file the page loads carries ?v=<version> so a new release is fetched past GitHub Pages'
  10-minute cache instead of being served from it.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION = ROOT / "VERSION"
JSON = ROOT / "version.json"
HTML = ROOT / "index.html"
APP = ROOT / "app.js"
TRANSIT = ROOT / "transit.js"

# The version line in the helper (places) sheet — not on the traveller's screen.
SHOWN = re.compile(r'(<span id="appVersion">)([^<]*)(</span>)')
# index.html: the stylesheet and the module entry point.
HTML_ASSETS = re.compile(r'((?:href|src)="(?:style\.css|app\.js))(?:[?]v=[^"]*)?"')
# app.js / transit.js: their module imports.
JS_ASSETS = re.compile(r'(from "\./(?:config|transit)\.js)(?:[?]v=[^"]*)?"')


def bumped(v):
    major, _, minor = v.partition(".")
    major, minor = int(major), int(minor)
    if minor + 1 >= 10:
        return f"{major + 1}.0"
    return f"{major}.{minor + 1}"


def _counts(html, app, transit):
    return {
        "html": len(HTML_ASSETS.findall(html)),
        "app": len(JS_ASSETS.findall(app)) + len(JS_ASSETS.findall(transit)),
    }


def found():
    html, app, transit = (p.read_text(encoding="utf-8") for p in (HTML, APP, TRANSIT))
    m = SHOWN.search(html)
    stamps = set(re.findall(r'(?:style\.css|app\.js)[?]v=([^"]*)"', html))
    stamps |= set(re.findall(r'from "\./(?:config|transit)\.js[?]v=([^"]*)"', app + transit))
    return {
        "VERSION": VERSION.read_text(encoding="utf-8").strip(),
        "version.json": json.loads(JSON.read_text(encoding="utf-8"))["version"],
        "index.html": m.group(2) if m else None,
        "file stamps": stamps.pop() if len(stamps) == 1 else "missing or mixed",
    }


def write(v):
    if not re.fullmatch(r"\d+\.\d+", v):
        sys.exit(f"'{v}' is not a version like 0.1 or 1.0")
    VERSION.write_text(v + "\n", encoding="utf-8")
    version_json(v)
    html = HTML.read_text(encoding="utf-8")
    html, n = SHOWN.subn(r"\g<1>" + v + r"\g<3>", html)
    if n != 1:
        sys.exit('index.html needs exactly one <span id="appVersion">')
    html, n = HTML_ASSETS.subn(r"\g<1>?v=" + v + '"', html)
    if n != 2:
        sys.exit("index.html should load style.css and app.js with ?v=; update tools/version.py")
    HTML.write_text(html, encoding="utf-8")
    for p in (APP, TRANSIT):
        js = p.read_text(encoding="utf-8")
        js, n2 = JS_ASSETS.subn(r"\g<1>?v=" + v + '"', js)
        if n2 == 0:
            sys.exit(f"{p.name} has no module imports to stamp; update tools/version.py")
        p.write_text(js, encoding="utf-8")
    print(f"Version {v}")


def version_json(v, build=None):
    payload = {"version": v}
    if build:
        payload["build"] = build
    JSON.write_text(json.dumps(payload) + "\n", encoding="utf-8")


def main():
    args = sys.argv[1:]
    if not args:
        seen = found()
        if len(set(seen.values())) != 1:
            sys.exit("Versions differ: " + ", ".join(f"{k} {v}" for k, v in seen.items()))
        print(f"Version {seen['VERSION']}, stamps agree")
    elif args == ["bump"]:
        write(bumped(found()["VERSION"]))
    elif len(args) == 2 and args[0] == "set":
        write(args[1])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()

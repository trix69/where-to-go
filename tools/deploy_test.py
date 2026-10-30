#!/usr/bin/env python3
"""Build the test site and push it to trix69/where-to-go-test (trix69.github.io/where-to-go-test/).

Usage:
  python3 tools/deploy_test.py              build from the working tree and push the test site
  python3 tools/deploy_test.py --local DIR  only build the test copy into DIR (no git), to check it

Live is never touched here. Live ships only when Trix says so, via tools/deploy_live.py.

dist/test-site/ is a clone of the test repo, made on first use (dist/ is git-ignored).

The test copy differs from the live one in these ways only:
- title "Where To Go (Test)", a noindex tag, an orange TEST ribbon;
- its own manifest identity, so it installs beside the live app instead of replacing it;
- its own storage key (whereToGo-test.v1), so trying the test site in the same browser does not
  rewrite the real saved places;
- the version reads "<VERSION>-test" and every ?v= stamp is a fingerprint of the app files, so each
  new test build is fetched fresh instead of served from Pages' 10-minute cache.
Everything else — config.js, proxy URL, code — is identical, so the test site exercises the same
transit proxy the live one uses.
"""
import hashlib
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import version  # noqa: E402  (tools/version.py)

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "dist" / "test-site"
REPO = "https://github.com/trix69/where-to-go-test.git"
URL = "https://trix69.github.io/where-to-go-test/"
FILES = ["index.html", "style.css", "app.js", "config.js", "transit.js", "manifest.webmanifest", ".nojekyll"]
DIRS = ["icons"]
RIBBON = ('<div class="test-ribbon" aria-hidden="true">TEST</div>\n'
          '<style>.test-ribbon { position: fixed; z-index: 300; top: 0; left: 50%; transform: translateX(-50%); '
          'padding: 2px 10px; border-radius: 0 0 8px 8px; background: #c2410c; color: #fff; '
          'font: 700 11px/1.4 ui-monospace, monospace; letter-spacing: .1em; pointer-events: none; }</style>\n')


def must(text, old, new, what):
    if text.count(old) != 1:
        sys.exit(f"test build: expected exactly one {what}; update tools/deploy_test.py")
    return text.replace(old, new)


def build(out):
    # R6.5: a test build carrying a localhost proxy fails for every visitor, silently, and the only
    # symptom is "no answer right now". Refuse instead of shipping it.
    cfg = (ROOT / "config.js").read_text(encoding="utf-8")
    if re.search(r"127\.0\.0\.1|localhost", cfg):
        sys.exit("test build: config.js points at a local proxy — set proxyBase back to the Worker")

    for f in FILES:
        shutil.copy2(ROOT / f, out / f)
    for d in DIRS:
        if (out / d).exists():
            shutil.rmtree(out / d)
        shutil.copytree(ROOT / d, out / d)

    live = version.found()["VERSION"]
    shown = f"{live}-test"
    stamp = hashlib.sha1(b"".join((ROOT / f).read_bytes() for f in FILES)).hexdigest()[:10]

    manifest = (ROOT / "manifest.webmanifest").read_text(encoding="utf-8")
    manifest = must(manifest, '"name": "Where To Go · 想去哪儿"', '"name": "Where To Go (Test)"', "manifest name")
    manifest = must(manifest, '"short_name": "Where To Go"', '"short_name": "WTG Test"', "manifest short_name")
    manifest = must(manifest, '"id": "/where-to-go/"', '"id": "/where-to-go-test/"', "manifest id")
    (out / "manifest.webmanifest").write_text(manifest, encoding="utf-8")

    html = (out / "index.html").read_text(encoding="utf-8")
    html = must(html, "<title>Where To Go · 想去哪儿</title>",
                '<title>Where To Go (Test)</title>\n<meta name="robots" content="noindex">', "<title>")
    html = must(html, "<body>\n", "<body>\n" + RIBBON, "<body>")
    html = must(html, '<meta name="apple-mobile-web-app-title" content="Where To Go">',
                '<meta name="apple-mobile-web-app-title" content="WTG Test">', "home-screen title")
    html, n = version.SHOWN.subn(r'\g<1>' + shown + r'\g<3>', html)
    if n != 1:
        sys.exit('test build: index.html needs exactly one <span id="appVersion">')
    html = must(html, '<span id="appVersion">', f'<span id="appVersion" data-build="{stamp}">', "appVersion span")
    html, n = version.HTML_ASSETS.subn(r'\g<1>?v=' + stamp + '"', html)
    if n != 2:
        sys.exit("test build: index.html should load style.css and app.js with ?v=")
    (out / "index.html").write_text(html, encoding="utf-8")

    for name in ("app.js", "transit.js"):
        js = (out / name).read_text(encoding="utf-8")
        js, n = version.JS_ASSETS.subn(r'\g<1>?v=' + stamp + '"', js)
        if n == 0:
            sys.exit(f"test build: {name} has no module imports to stamp")
        if name == "app.js":
            js = must(js, 'const STORE = "whereToGo.v1";', 'const STORE = "whereToGo-test.v1";', "storage key")
            keys = set(re.findall(r'"(whereToGo[\w.-]*)"', js))
            unknown = sorted(k for k in keys if k != "whereToGo-test.v1")
            if unknown:
                sys.exit("test build: decide whether these keys are shared or kept apart: " + ", ".join(unknown))
        (out / name).write_text(js, encoding="utf-8")

    (out / "version.json").write_text('{"version": "%s", "build": "%s"}\n' % (shown, stamp), encoding="utf-8")
    return shown, stamp


def git(*args, cwd=SITE):
    return subprocess.check_output(["git", *args], cwd=cwd, text=True).strip()


def main():
    args = sys.argv[1:]
    if args[:1] == ["--local"] and len(args) == 2:
        out = Path(args[1])
        out.mkdir(parents=True, exist_ok=True)
        shown, stamp = build(out)
        print(f"Built test copy {shown} (build {stamp}) in {out}")
        return
    if args:
        sys.exit(__doc__)

    if not (SITE / ".git").is_dir():
        SITE.parent.mkdir(exist_ok=True)
        if subprocess.call(["git", "clone", "-q", REPO, str(SITE)]) != 0:
            sys.exit(f"Could not clone {REPO}. Does the repo exist, and does gh have push rights?")
        git("config", "--local", "user.name", "trix69")
        git("config", "--local", "user.email", "56258450+trix69@users.noreply.github.com")
    if git("ls-remote", "--heads", "origin", "main"):
        git("pull", "-q", "--ff-only", "origin", "main")

    shown, stamp = build(SITE)
    src = git("rev-parse", "--short", "HEAD", cwd=ROOT)
    dirty = " + uncommitted changes" if git("status", "--porcelain", "--", *FILES, *DIRS, cwd=ROOT) else ""
    git("add", "-A")
    if not git("status", "--porcelain"):
        print("Test site unchanged")
        return
    git("commit", "-q", "-m", f"Test build {shown} ({stamp}) from where-to-go {src}{dirty}")
    git("push", "-q", "origin", "HEAD:main")
    print(f"Pushed test build {shown} ({stamp}) from {src}{dirty} -> {URL}")


if __name__ == "__main__":
    main()

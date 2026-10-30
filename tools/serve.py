#!/usr/bin/env python3
"""Local dev server for Where To Go.

Plain `python3 -m http.server` lets the browser reuse a cached `app.js?v=0.1`, because the query
string only changes when the version does — so an edit looks like it did nothing. This server sends
`Cache-Control: no-store` on everything, which makes a reload mean what it says.

    python3 tools/serve.py            # http://127.0.0.1:8801/
    python3 tools/serve.py 8807       # another port

The test and live sites are unaffected: they stamp real fingerprints into `?v=`.
"""
import http.server
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "?v=" in (args[0] if args else "") or True:
            pass  # quiet: the terminal stays readable while iterating


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8801
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
        print(f"serving {ROOT} at http://127.0.0.1:{port}/ (no-store)", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()

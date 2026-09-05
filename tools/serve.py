#!/usr/bin/env python3
"""Local preview server that never lets the browser cache anything.

`python3 -m http.server` sends Last-Modified and nothing else, and Chrome then
holds ES modules in memory across a reload -- so editing a viewer and hitting
refresh can silently keep running the old code. This adds no-store.

    python3 tools/serve.py [port]
"""
import functools
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):        # keep the terminal readable
        if not args or "200" not in str(args):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(NoCache, directory=root)
    print(f"serving {root} at http://127.0.0.1:{port}/  (no-store)")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()

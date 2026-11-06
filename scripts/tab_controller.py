#!/usr/bin/env python3
"""Tab controller for the wall dashboard kiosk.

Chrome runs in kiosk mode with its own profile and its DevTools HTTP port open on
localhost. This helper keeps two tabs: the dashboard and one Yahoo page. When the
dashboard reaches its Fantasy screen it calls /show, and this helper brings the Yahoo
tab to the front for that screen's duration, then returns to the dashboard.

It only ever opens the single URL it was started with. It does not read, parse or
change the Yahoo page, and it listens on localhost only. Standard library only.

Endpoints (all GET, JSON responses):
  /health                          200 when Chrome's DevTools port is reachable, else 503
  /show?seconds=N&reload=M         show the Yahoo tab for N seconds (3-600). The Yahoo page
                                   updates itself, so it is only reopened as a safety net
                                   when it is older than M minutes (5-720, default 60)
  /dashboard                       return to the dashboard tab now
"""

import argparse
import json
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Browser:
    def __init__(self, debug_port, dashboard_origin, yahoo_url):
        self.base = "http://127.0.0.1:%d" % debug_port
        self.dashboard_origin = dashboard_origin.rstrip("/")
        self.yahoo_url = yahoo_url
        self.lock = threading.RLock()
        self.yahoo_id = None
        self.loaded_at = 0.0
        self.timer = None

    # --- Chrome DevTools HTTP endpoints ---

    def _call(self, path, method="GET"):
        req = urllib.request.Request(self.base + path, method=method)
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.read().decode("utf-8", "replace")

    def tabs(self):
        return [t for t in json.loads(self._call("/json/list")) if t.get("type") == "page"]

    def reachable(self):
        try:
            self.tabs()
            return True
        except Exception:
            return False

    def _open_yahoo(self):
        quoted = urllib.parse.quote(self.yahoo_url, safe=":/?&=#%@+,;~")
        return json.loads(self._call("/json/new?" + quoted, "PUT"))["id"]

    def _dashboard_id(self):
        for tab in self.tabs():
            if tab.get("url", "").startswith(self.dashboard_origin):
                return tab["id"]
        return None

    def _activate(self, tab_id):
        if tab_id:
            self._call("/json/activate/" + tab_id)

    # --- actions ---

    def _cancel_timer(self):
        if self.timer is not None:
            self.timer.cancel()
            self.timer = None

    def show(self, seconds, reload_minutes):
        with self.lock:
            self._cancel_timer()
            alive = {t["id"] for t in self.tabs()}
            stale = (time.time() - self.loaded_at) >= reload_minutes * 60
            if self.yahoo_id not in alive or stale:
                old = self.yahoo_id if self.yahoo_id in alive else None
                self.yahoo_id = self._open_yahoo()   # opens in the foreground
                self.loaded_at = time.time()
                if old:
                    self._call("/json/close/" + old)
            self._activate(self.yahoo_id)
            self.timer = threading.Timer(seconds, self.back)
            self.timer.daemon = True
            self.timer.start()

    def back(self):
        with self.lock:
            self._cancel_timer()
            try:
                self._activate(self._dashboard_id())
            except Exception:
                pass


def make_handler(browser, allowed_origin):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, code, payload):
            body = json.dumps(payload).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.send_header("Vary", "Origin")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            origin = self.headers.get("Origin")
            if origin and origin != allowed_origin:
                self._send(403, {"error": "origin not allowed"})
                return
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)

            def number(name, default, low, high):
                try:
                    value = float(query.get(name, [default])[0])
                except ValueError:
                    value = default
                return min(high, max(low, value))

            try:
                if parsed.path == "/health":
                    ok = browser.reachable()
                    self._send(200 if ok else 503, {"ok": ok})
                elif parsed.path == "/show":
                    browser.show(number("seconds", 20, 3, 600), number("reload", 60, 5, 720))
                    self._send(200, {"ok": True})
                elif parsed.path == "/dashboard":
                    browser.back()
                    self._send(200, {"ok": True})
                else:
                    self._send(404, {"error": "not found"})
            except Exception as err:  # Chrome not reachable, tab vanished, etc.
                self._send(502, {"error": str(err)})

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--debug-port", type=int, default=9222, help="Chrome remote debugging port")
    parser.add_argument("--listen-port", type=int, default=8081, help="port this helper listens on (localhost only)")
    parser.add_argument("--dashboard-origin", default="http://127.0.0.1:8080")
    parser.add_argument("--yahoo-url", required=True, help="the one page to show as the Fantasy screen")
    args = parser.parse_args()

    browser = Browser(args.debug_port, args.dashboard_origin, args.yahoo_url)
    server = ThreadingHTTPServer(("127.0.0.1", args.listen_port), make_handler(browser, args.dashboard_origin.rstrip("/")))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

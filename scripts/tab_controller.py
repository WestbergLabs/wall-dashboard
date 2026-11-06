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
  /matchup?poll=N&reload=M         latest matchup read from a hidden Yahoo tab (see below)
  /capture                         save the Yahoo tab's HTML, text and a screenshot to captures/

Live mode: the first /matchup call opens the Yahoo URL in a background tab and, every N
seconds, runs scripts/extractors/yahoo-matchup.js inside it, keeping the newest result. The
dashboard shows that data redrawn in its own style. The tab is a normal signed-in page that
updates itself, so no extra requests are made to Yahoo. Reading a page this way is automated
access, which Yahoo's terms prohibit without permission.
"""

import argparse
import json
import os
import sys
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import CDP  # noqa: E402


class Browser:
    def __init__(self, debug_port, dashboard_origin, yahoo_url, extractor_path=None, captures_dir=None):
        self.base = "http://127.0.0.1:%d" % debug_port
        self.dashboard_origin = dashboard_origin.rstrip("/")
        self.yahoo_url = yahoo_url
        self.lock = threading.RLock()
        self.yahoo_id = None
        self.loaded_at = 0.0
        self.timer = None
        self.extractor_path = extractor_path
        self.captures_dir = captures_dir
        self.latest = None
        self.latest_at = 0.0
        self.latest_error = None
        self.live_thread = None
        self.poll_seconds = 20
        self.reload_minutes = 60

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

    # --- live mode: read a hidden Yahoo tab ---

    def _tab_by_id(self, tab_id):
        for tab in self.tabs():
            if tab["id"] == tab_id:
                return tab
        return None

    def _ensure_background_yahoo(self):
        with self.lock:
            alive = {t["id"] for t in self.tabs()}
            stale = (time.time() - self.loaded_at) >= self.reload_minutes * 60
            if self.yahoo_id in alive and not stale:
                return self.yahoo_id
            old = self.yahoo_id if self.yahoo_id in alive else None
            self.yahoo_id = self._open_yahoo()          # opens in the foreground
            self.loaded_at = time.time()
            if old:
                self._call("/json/close/" + old)
            self._activate(self._dashboard_id())        # straight back to the dashboard
            return self.yahoo_id

    def _evaluate_in(self, tab_id, expression):
        tab = self._tab_by_id(tab_id)
        if not tab or not tab.get("webSocketDebuggerUrl"):
            raise RuntimeError("Yahoo tab is not available")
        with CDP(tab["webSocketDebuggerUrl"]) as cdp:
            return cdp.evaluate(expression)

    def _extractor_source(self):
        with open(self.extractor_path, "r", encoding="utf-8") as handle:
            return handle.read()

    def _live_loop(self):
        while True:
            try:
                tab_id = self._ensure_background_yahoo()
                value = self._evaluate_in(tab_id, self._extractor_source())
                with self.lock:
                    self.latest = value
                    self.latest_at = time.time()
                    self.latest_error = None
            except Exception as err:
                with self.lock:
                    self.latest_error = str(err)
            time.sleep(self.poll_seconds)

    def start_live(self, poll_seconds, reload_minutes):
        with self.lock:
            self.poll_seconds = poll_seconds
            self.reload_minutes = reload_minutes
            if self.live_thread is None or not self.live_thread.is_alive():
                self.live_thread = threading.Thread(target=self._live_loop, daemon=True)
                self.live_thread.start()

    def matchup(self):
        with self.lock:
            if self.latest is None:
                return {"ok": False, "pending": True, "error": self.latest_error}
            return {
                "ok": True,
                "ageSeconds": round(time.time() - self.latest_at, 1),
                "data": self.latest,
                "error": self.latest_error,
            }

    def capture(self):
        if not self.captures_dir:
            raise RuntimeError("captures directory is not configured")
        tab_id = self._ensure_background_yahoo()
        stamp = time.strftime("%Y%m%d-%H%M%S")
        os.makedirs(self.captures_dir, exist_ok=True)
        files = []
        page = json.loads(self._evaluate_in(tab_id, "JSON.stringify({url: location.href, title: document.title, "
                                                    "html: document.documentElement.outerHTML, text: document.body.innerText})"))
        for suffix, key in (("html", "html"), ("txt", "text")):
            path = os.path.join(self.captures_dir, "matchup-%s.%s" % (stamp, suffix))
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(page[key])
            files.append(path)
        try:
            tab = self._tab_by_id(tab_id)
            with CDP(tab["webSocketDebuggerUrl"]) as cdp:
                shot = cdp.call("Page.captureScreenshot", {"format": "png"})
            path = os.path.join(self.captures_dir, "matchup-%s.png" % stamp)
            import base64
            with open(path, "wb") as handle:
                handle.write(base64.b64decode(shot["data"]))
            files.append(path)
        except Exception:
            pass  # a screenshot is a nice extra, not required
        return {"files": files, "url": page["url"], "title": page["title"]}


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
                elif parsed.path == "/matchup":
                    browser.start_live(number("poll", 20, 5, 120), number("reload", 60, 5, 720))
                    self._send(200, browser.matchup())
                elif parsed.path == "/capture":
                    self._send(200, dict(ok=True, **browser.capture()))
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
    here = os.path.dirname(os.path.abspath(__file__))
    parser.add_argument("--extractor", default=os.path.join(here, "extractors", "yahoo-matchup.js"),
                        help="script evaluated inside the Yahoo tab in live mode")
    parser.add_argument("--captures-dir", default=os.path.join(os.path.dirname(here), "captures"),
                        help="where /capture saves the page for tuning the extractor")
    args = parser.parse_args()

    browser = Browser(args.debug_port, args.dashboard_origin, args.yahoo_url, args.extractor, args.captures_dir)
    server = ThreadingHTTPServer(("127.0.0.1", args.listen_port), make_handler(browser, args.dashboard_origin.rstrip("/")))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Check whether an iCloud shared album link can be read without signing in.

Usage: python3 scripts/icloud-probe.py "https://photos.icloud.com/shared/album/<token>"

It only asks iCloud's own servers for the album's photo list (the same list the public
web view uses) and prints what came back. It saves nothing and downloads no photos.
Apple has no official interface for this, so the result tells us whether a dashboard
screen for iCloud albums is possible.
"""
import json
import re
import sys
import urllib.error
import urllib.request

BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def token_from(link):
    match = re.search(r"(?:#|/album/|/sharedalbum/#?)([A-Za-z0-9]{10,40})\s*$", link.strip())
    return match.group(1) if match else link.strip()


def partition(token):
    if token[0] == "A":
        n = BASE62.index(token[1])
    else:
        n = BASE62.index(token[1]) * 62 + BASE62.index(token[2])
    return n


def post(url, body):
    request = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "text/plain", "User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers), err.read()


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    token = token_from(sys.argv[1])
    host = "p%02d-sharedstreams.icloud.com" % partition(token)
    print("token length:", len(token), "first guess host:", host)
    for attempt in range(3):
        status, headers, body = post("https://%s/%s/sharedstreams/webstream" % (host, token), {"streamCtag": None})
        print("attempt", attempt + 1, "status", status)
        redirect = headers.get("X-Apple-MMe-Host")
        if status == 330 and redirect and redirect.endswith(".icloud.com"):
            host = redirect
            print("redirected to", host)
            continue
        break
    text = body.decode("utf-8", "replace")
    try:
        data = json.loads(text)
        photos = data.get("photos", [])
        print("album name:", data.get("streamName"))
        print("photos listed:", len(photos))
        print("keys of first photo:", sorted(photos[0].keys()) if photos else None)
        print("RESULT: readable" if photos else "RESULT: answered but no photos")
    except ValueError:
        print("RESULT: not readable this way")
        print("first 300 characters of the reply:", text[:300])
    return 0


if __name__ == "__main__":
    sys.exit(main())

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
    except (urllib.error.URLError, OSError) as err:
        return 0, {}, ("connection failed: %s" % err).encode()


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    token = token_from(sys.argv[1])
    print("token length:", len(token))
    hosts = ["sharedstreams.icloud.com"]
    if partition(token) <= 99:
        hosts.append("p%02d-sharedstreams.icloud.com" % partition(token))
    else:
        print("note: the older server-number scheme does not fit this token, so only the generic address is tried")

    host, status, headers, body = None, None, {}, b""
    for first in hosts:
        host = first
        for attempt in range(4):
            status, headers, body = post("https://%s/%s/sharedstreams/webstream" % (host, token), {"streamCtag": None})
            print("POST", host, "-> status", status)
            redirect = headers.get("X-Apple-MMe-Host")
            if status == 330 and redirect and redirect.endswith(".icloud.com"):
                host = redirect
                print("  redirected to", host)
                continue
            break
        if status == 200:
            break

    text = body.decode("utf-8", "replace")
    try:
        data = json.loads(text)
    except ValueError:
        print("RESULT: not readable this way")
        print("first 300 characters of the reply:", text[:300])
        return 0
    photos = data.get("photos", [])
    print("album name:", data.get("streamName"))
    print("photos listed:", len(photos))
    if not photos:
        print("RESULT: answered but no photos")
        return 0
    first = photos[0]
    print("keys of first photo:", sorted(first.keys()))
    print("derivative sizes:", sorted((first.get("derivatives") or {}).keys()))
    status, _, body = post("https://%s/%s/sharedstreams/webasseturls" % (host, token), {"photoGuids": [first.get("photoGuid")]})
    print("POST webasseturls -> status", status)
    try:
        items = json.loads(body.decode("utf-8", "replace")).get("items", {})
        print("download links returned:", len(items))
        print("RESULT: readable" if items else "RESULT: list readable, but no download links")
    except ValueError:
        print("RESULT: list readable, but download links failed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

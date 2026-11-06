"""Minimal Chrome DevTools Protocol client over a websocket. Standard library only.

Used by tab_controller.py to evaluate a small script inside a tab that is already open in
the kiosk browser. The connection goes to Chrome's debugging port on localhost.
"""

import base64
import json
import os
import socket
import struct
import urllib.parse


class CDPError(Exception):
    pass


class CDP:
    def __init__(self, ws_url, timeout=10):
        parsed = urllib.parse.urlparse(ws_url)
        self.sock = socket.create_connection((parsed.hostname, parsed.port), timeout=timeout)
        self.sock.settimeout(timeout)
        self.buf = b""
        self.next_id = 0

        key = base64.b64encode(os.urandom(16)).decode()
        request = (
            "GET %s HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n"
            % (parsed.path, parsed.hostname, parsed.port, key)
        )
        self.sock.sendall(request.encode())

        header = b""
        while b"\r\n\r\n" not in header:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise CDPError("connection closed during handshake")
            header += chunk
        head, _, rest = header.partition(b"\r\n\r\n")
        if b" 101 " not in head.split(b"\r\n")[0]:
            raise CDPError("websocket handshake refused: " + head.split(b"\r\n")[0].decode("latin-1"))
        self.buf = rest

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # --- websocket framing ---

    def _send_frame(self, opcode, payload):
        n = len(payload)
        head = bytearray([0x80 | opcode])
        if n < 126:
            head.append(0x80 | n)
        elif n < 65536:
            head.append(0x80 | 126)
            head += struct.pack(">H", n)
        else:
            head.append(0x80 | 127)
            head += struct.pack(">Q", n)
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(head) + mask + masked)

    def _read_exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(max(65536, n - len(self.buf)))
            if not chunk:
                raise CDPError("connection closed")
            self.buf += chunk
        data, self.buf = self.buf[:n], self.buf[n:]
        return data

    def _recv_message(self):
        message = b""
        while True:
            b1, b2 = self._read_exact(2)
            fin, opcode = b1 & 0x80, b1 & 0x0F
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack(">H", self._read_exact(2))[0]
            elif length == 127:
                length = struct.unpack(">Q", self._read_exact(8))[0]
            payload = self._read_exact(length)  # server frames are not masked
            if opcode == 0x8:
                raise CDPError("connection closed by browser")
            if opcode == 0x9:
                self._send_frame(0xA, payload)
                continue
            if opcode == 0xA:
                continue
            message += payload
            if fin:
                return message.decode("utf-8", "replace")

    # --- protocol ---

    def call(self, method, params=None):
        self.next_id += 1
        call_id = self.next_id
        self._send_frame(0x1, json.dumps({"id": call_id, "method": method, "params": params or {}}).encode())
        while True:
            reply = json.loads(self._recv_message())
            if reply.get("id") != call_id:
                continue  # an event or an older reply
            if "error" in reply:
                raise CDPError(reply["error"].get("message", "protocol error"))
            return reply.get("result", {})

    def evaluate(self, expression):
        result = self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True})
        if "exceptionDetails" in result:
            details = result["exceptionDetails"]
            text = (details.get("exception") or {}).get("description") or details.get("text", "script error")
            raise CDPError(text)
        return result.get("result", {}).get("value")

#!/usr/bin/env python3
"""Local relay for the 인연 portraits: the browser sends a prompt, this adds the
API key and calls the OpenAI image API. The key never reaches the browser.

  export OPENAI_API_KEY=sk-...
  python3 tools/portrait-proxy.py            # listens on 127.0.0.1:8787

Then open the app with  ?portrait=http://127.0.0.1:8787
(see README, "Portraits"). Standard library only.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "8787"))
# Tried in order; the first one this account can use is remembered.
MODELS = [m for m in os.environ.get("IMAGE_MODEL", "gpt-image-2,gpt-image-1.5,gpt-image-1").split(",") if m]
SIZE = os.environ.get("IMAGE_SIZE", "1024x1024")
QUALITY = os.environ.get("IMAGE_QUALITY", "low")  # low | medium | high
ALLOWED = set(filter(None, os.environ.get(
    "ALLOWED_ORIGINS",
    "http://127.0.0.1:8001,http://localhost:8001,http://127.0.0.1:8000,http://localhost:8000,https://taegyu831.github.io",
).split(",")))
KEY = os.environ.get("OPENAI_API_KEY", "")
MAX_PROMPT = 2000


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _send(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.headers.get("Origin", "") not in ALLOWED:
            return self._send(403, {"error": "origin not allowed"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            prompt = str(json.loads(self.rfile.read(size))["prompt"]).strip()
        except Exception:
            return self._send(400, {"error": "send {\"prompt\": \"...\"}"})
        if not prompt or len(prompt) > MAX_PROMPT:
            return self._send(400, {"error": "prompt missing or too long"})

        global MODELS
        image = None
        for model in list(MODELS):
            payload = {"model": model, "prompt": prompt, "size": SIZE, "quality": QUALITY, "n": 1,
                       "output_format": "jpeg", "output_compression": 82}
            request = urllib.request.Request(
                "https://api.openai.com/v1/images/generations",
                data=json.dumps(payload).encode(),
                headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
            )
            try:
                with urllib.request.urlopen(request, timeout=120) as reply:
                    image = json.load(reply)["data"][0]["b64_json"]
                MODELS = [model]  # remember the one that worked
                break
            except urllib.error.HTTPError as error:
                detail = error.read().decode(errors="replace")[:400]
                print(f"OpenAI {error.code} ({model}): {detail}", file=sys.stderr)
                if error.code in (400, 403, 404) and "model" in detail and model != MODELS[-1]:
                    continue  # this account cannot use that model, try the next
                return self._send(502, {"error": f"OpenAI answered {error.code}"})
            except Exception as error:  # network, timeout, odd reply
                print(f"relay failed: {error}", file=sys.stderr)
                return self._send(502, {"error": "relay failed"})
        if image is None:
            return self._send(502, {"error": "no usable image model"})
        print(f"portrait ok ({len(prompt)} chars)")
        self._send(200, {"image": f"data:image/jpeg;base64,{image}"})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    if not KEY:
        sys.exit("Set OPENAI_API_KEY first:  export OPENAI_API_KEY=sk-...")
    LIST = ", ".join(MODELS)
    print(f"portrait relay on http://127.0.0.1:{PORT}  models={LIST} size={SIZE} quality={QUALITY}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

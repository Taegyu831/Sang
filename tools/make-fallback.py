#!/usr/bin/env python3
"""Makes the spare portraits (20s) by calling the Vercel function, one at a time.

  python3 tools/make-fallback.py            # makes every missing file
  python3 tools/make-fallback.py --only fit-drive+-female

Files go to dist/fallback/<kind>-<pole or even>-<gender>.jpg (640 px). Existing
files are kept, so it can be run again after a failure. Needs macOS (sips).
"""
import base64, json, os, subprocess, sys, time, urllib.request, urllib.error

ENDPOINT = os.environ.get("PORTRAIT_URL", "https://project-zek4t.vercel.app/api/portrait")
ORIGIN = "https://taegyu831.github.io"
OUT = os.path.join(os.path.dirname(__file__), "..", "dist", "fallback")
FIT = ["drive+", "drive-", "social+", "social-", "feel+", "feel-", "steady+", "steady-", None]
CLASH = ["drive+", "social+", "feel+", "feel-", "steady+", "steady-", None]  # 6 kinds + even
PAUSE = 55  # the function allows 12 requests per 10 minutes per visitor

def jobs():
    for gender in ("female", "male"):
        for kind, poles in (("fit", FIT), ("clash", CLASH)):
            for pole in poles:
                yield {"kind": kind, "pole": pole, "gender": gender, "age": 20}

def name(spec):
    return f"{spec['kind']}-{spec['pole'] or 'even'}-{spec['gender']}"

def call(spec):
    req = urllib.request.Request(ENDPOINT, data=json.dumps({"spec": spec}).encode(),
                                 headers={"Content-Type": "application/json", "Origin": ORIGIN})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)["image"].split(",", 1)[1]

def main():
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    os.makedirs(OUT, exist_ok=True)
    todo = [s for s in jobs() if (only is None or name(s) == only) and not os.path.exists(os.path.join(OUT, name(s) + ".jpg"))]
    print(f"{len(todo)} to make", flush=True)
    for i, spec in enumerate(todo):
        path = os.path.join(OUT, name(spec) + ".jpg")
        for attempt in range(4):
            try:
                raw = path + ".tmp"
                open(raw, "wb").write(base64.b64decode(call(spec)))
                subprocess.run(["sips", "-Z", "640", "-s", "format", "jpeg", "-s", "formatOptions", "80", raw, "--out", path],
                               check=True, capture_output=True)
                os.remove(raw)
                print(f"[{i+1}/{len(todo)}] {name(spec)} ok", flush=True)
                break
            except urllib.error.HTTPError as e:
                print(f"  {name(spec)}: HTTP {e.code}, waiting", flush=True)
                time.sleep(90 if e.code == 429 else 20)
            except Exception as e:
                print(f"  {name(spec)}: {e}, retrying", flush=True)
                time.sleep(20)
        else:
            print(f"  gave up on {name(spec)}", flush=True)
        if i + 1 < len(todo):
            time.sleep(PAUSE)
    print("done", flush=True)

main()

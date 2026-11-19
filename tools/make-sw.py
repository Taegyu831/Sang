#!/usr/bin/env python3
"""Write the file list and version into dist/sw.js (the offline cache).

  python3 tools/make-sw.py          # update
  python3 tools/make-sw.py --check  # exit 1 if sw.js is out of date

The version is a hash of every cached file, so any change makes browsers
fetch the new files. Run it before every push.
"""
import hashlib
import json
import pathlib
import re
import sys

DIST = pathlib.Path(__file__).resolve().parent.parent / "dist"
SKIP = {"sw.js", "package.json"}
SKIP_SUFFIX = (".txt", ".md")


def build():
    files = sorted(
        p.relative_to(DIST).as_posix()
        for p in DIST.rglob("*")
        if p.is_file() and p.name not in SKIP and not p.name.startswith((".", "_")) and not p.name.endswith(SKIP_SUFFIX)
    )
    digest = hashlib.sha256()
    for name in files:
        digest.update(name.encode())
        digest.update((DIST / name).read_bytes())
    # the page itself is cached under "./"
    listed = ["./"] + files
    return digest.hexdigest()[:12], listed


def render(text, version, files):
    text = re.sub(r'const VERSION = "[^"]*";', f'const VERSION = "{version}";', text, count=1)
    body = "const FILES = [\n" + "".join(f"  {json.dumps(f)},\n" for f in files) + "];"
    return re.sub(r"const FILES = \[.*?\];", lambda _: body, text, count=1, flags=re.S)


if __name__ == "__main__":
    version, files = build()
    path = DIST / "sw.js"
    old = path.read_text()
    new = render(old, version, files)
    if "--check" in sys.argv:
        sys.exit(0 if old == new else 1)
    path.write_text(new)
    print(f"sw.js: version {version}, {len(files)} files")

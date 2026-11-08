"""Add ?v=<version> to every local script, module import, stylesheet and data
file reference in dist, so browsers fetch the new files after each deploy
(GitHub Pages lets browsers keep files for 10 minutes).

Usage: python3 tools/stamp_version.py <version>   (run in CI on a copy, not committed)
"""
import re
import sys
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / "dist"
version = sys.argv[1]
pattern = re.compile(r'(["\'])(\./[\w./-]+\.(?:js|css|json))\1')

for path in list(DIST.glob("*.js")) + list(DIST.glob("*.html")):
    text = path.read_text()
    stamped = pattern.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={version}{m.group(1)}", text)
    if stamped != text:
        path.write_text(stamped)
        print("stamped", path.name)

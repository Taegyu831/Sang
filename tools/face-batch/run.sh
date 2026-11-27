#!/bin/zsh
# Measures every picture in a folder with the same pipeline the app uses (no camera) and prints a
# summary of how the ratios and readings are distributed. Pictures stay where they are: nothing is copied
# into the repo, and nothing is sent anywhere.
#   usage: tools/face-batch/run.sh /path/to/folder-of-faces
set -e
FACES=${1:?folder of pictures}
HERE=${0:A:h}; REPO=${HERE:h:h}
LAB=$(mktemp -d); ln -s "$REPO/dist" "$LAB/dist"; ln -s "${FACES:A}" "$LAB/faces"; cp "$HERE/batch.html" "$LAB/batch.html"
(cd "$LAB" && python3 -m http.server 8002 --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > "$LAB/pid"); sleep 1
Q=$(python3 -c "import os,sys,urllib.parse as u;print(','.join(u.quote(n) for n in sorted(os.listdir(sys.argv[1])) if n.lower().endswith(('.jpg','.jpeg','.png','.webp'))))" "$FACES")
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --virtual-time-budget=600000 --dump-dom "http://127.0.0.1:8002/batch.html?files=$Q" 2>/dev/null > "$LAB/dom.html" || true
kill "$(cat "$LAB/pid")" 2>/dev/null || true
node "$HERE/summary.mjs" "$LAB/dom.html" "$REPO/dist/calibration.js"

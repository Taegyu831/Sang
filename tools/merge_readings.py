"""Merge collected popular readings into dist/parts.json.

Usage: python3 tools/merge_readings.py <research.json> [more.json ...]

The research files (with their sources) are kept outside this public repo;
sources are listed only in the team's artifact "상(相) 대중 관상 해석 모음".
Readings that sources read in opposite ways ("conflicts") are not merged.
Each run replaces the readings of the keys found in the given files, so the
script can be rerun after the team deletes lines in the research files.
"""
import json
import re
import sys
from pathlib import Path

PARTS = Path(__file__).resolve().parent.parent / "dist" / "parts.json"

# research key -> (card id, slot prefix). A prefix means the card watches several
# keys and stores texts as "key.direction".
KEY_TO_CARD = {
    "foreheadFace": ("forehead", None),
    "upperThird": ("thirds", "upperThird"),
    "middleThird": ("thirds", "middleThird"),
    "lowerThird": ("thirds", "lowerThird"),
    "thirdsBalance": ("thirds", None),
    "cheekWidth": ("faceShape", None),
    "faceRatio": ("faceShape", None),
    "fWHR": ("cheek", None),
    "fwhr": ("cheek", None),
    "jawCheek": ("jaw", None),
    "chinWidth": ("chin", None),
    "symmetry": ("symmetry", None),
    "browLength": ("browLength", None),
    "browTilt": ("browTilt", None),
    "browArch": ("browArch", None),
    "browEyeGap": ("browEyeGap", None),
    "browInnerGap": ("browInnerGap", None),
    "eyeGap": ("eyeGap", None),
    "eyeSize": ("eyeSize", None),
    "eyeOpen": ("eyeOpen", None),
    "eyeTilt": ("eyeTilt", None),
    "eyeAsym": ("eyeAsym", None),
    "noseWidth": ("noseWidth", None),
    "noseEyeGap": ("noseWidth", None),
    "noseLength": ("noseLength", None),
    "mouthFace": ("mouthFace", None),
    "mouthNose": ("mouthFace", None),
    "mouthEyeLine": ("mouthFace", None),
    "lipFull": ("lipFull", None),
    "lipRatio": ("lipRatio", None),
    "mouthLift": ("mouthLift", None),
    "philtrum": ("philtrum", None),
    "philtrumLower": ("philtrum", None),
}

# Plain declarative endings ("본다.", "있다.", "길다.") -> polite 합니다체 ("봅니다.").
BASE = 0xAC00


def _parts(ch):
    code = ord(ch) - BASE
    if not 0 <= code < 11172:
        return None
    return code // 28, code % 28


def _with_final(ch, final):
    head, _ = _parts(ch)
    return chr(BASE + head * 28 + final)


def _polite(match):
    prev = match.group(1)
    if prev == "는":  # 받는다 -> 받습니다
        return "습니다."
    parts = _parts(prev)
    if parts is None:
        return match.group(0)
    _, final = parts
    if final in (0, 4, 8):  # 크다, 본다, 길다 -> 큽니다, 봅니다, 깁니다
        return _with_final(prev, 17) + "니다."
    return prev + "습니다."  # 있다, 좋다, 했다


def voice(text):
    text = text.strip().replace("\u2014", ", ").replace("\u2013", ", ")
    text = re.sub(r"(\S)다\.(?=\s|$)", _polite, text)
    # "...보인다 (인상 평)." -> "...보입니다 (인상 평)."
    return re.sub(r"(\S)다(?= \()", lambda m: _polite(m)[:-1], text)


def main(paths):
    parts = json.loads(PARTS.read_text())
    cards = {c["id"]: c for c in parts["cards"]}
    touched = set()
    for path in paths:
        research = json.loads(Path(path).read_text())
        for entry in research["entries"]:
            target = KEY_TO_CARD.get(entry["key"])
            if not target:
                continue
            card_id, prefix = target
            card = cards[card_id]
            slot = f"{prefix}.{entry['direction']}" if prefix and entry["direction"] != "middle" else entry["direction"]
            if (card_id, slot) not in touched:
                card["readings"][slot] = []
                touched.add((card_id, slot))
            for r in entry["readings"]:
                card["readings"][slot].append({
                    "text": voice(r["text"]),
                    "domain": r.get("domain", ""),
                    # How many sources said it; used to show the most common first.
                    "n": len(r.get("sources", [])),
                    "from": entry.get("shape", ""),
                })
    for card in parts["cards"]:
        for slot, items in card["readings"].items():
            items.sort(key=lambda r: -r["n"])
    PARTS.write_text(json.dumps(parts, ensure_ascii=False, indent=1) + "\n")
    print(f"merged {len(touched)} slots")


if __name__ == "__main__":
    main(sys.argv[1:])

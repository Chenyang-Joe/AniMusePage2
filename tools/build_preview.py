#!/usr/bin/env python3
"""Shrink the *whole* candidate pool to browsing quality, for pick.html.

build_assets.py emits the two dozen files the site ships. This emits all 91
teaser clips and all 101 Stage-1 clips at a quality that is no good for the page
but fine for deciding which ones belong on it -- small textures, a third of the
frames -- so the choice can be made by eye, in a browser, from the live clips
rather than from filenames and a contact sheet of stills.

Output goes to assets/preview/ and is deliberately not committed.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb_opt import optimize

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "assets", "preview")

# Browsing quality: enough to tell a good clip from a bad one, small enough that
# a page of twelve loads while you scroll to it.
TEX = 256
QUALITY = 55
FRAMES = 32

# The tokens the exporter uses to end a species name; whatever follows is the
# action. "s089_Dingo_Juvenile_interactjuvenilea" -> "Dingo Juvenile", "interact…".
SEX = ("Male", "Female", "Juvenile")


def title(words):
    return " ".join(words)


def teaser():
    src = f"{DATA}/teaser/mesh"
    out = []
    for i, fn in enumerate(sorted(os.listdir(src))):
        if not fn.endswith(".glb"):
            continue
        key = f"T{i + 1:02d}"
        # "Bactrian_Camel_Female__bactrian_camel_<hash>.glb" -- the readable name
        # is everything before the doubled underscore; the action is not in there.
        label = title(fn.split("__")[0].split("_"))
        print(f"{key} {label}")
        e = {"id": key, "label": label, "file": fn, "rotateY": 0}
        e["mesh"] = emit(f"{src}/{fn}", f"teaser/{key}.mesh.glb",
                         max_frames=FRAMES, quality=QUALITY, max_tex=TEX)
        e["blob"] = emit(f"{DATA}/teaser/blob/{fn}", f"teaser/{key}.blob.glb",
                         do_jpeg=False, do_quant=False)
        out.append(e)
    return out


def stage1():
    src = f"{DATA}/stage1"
    out = []
    for d in sorted(os.listdir(src)):
        if not os.path.isdir(f"{src}/{d}"):
            continue
        parts = d.split("_")
        cut = max((i for i, p in enumerate(parts) if p in SEX), default=len(parts) - 1)
        key = parts[0]
        label = title(parts[1:cut + 1])
        action = "_".join(parts[cut + 1:])
        print(f"{key} {label} / {action}")
        e = {"id": key, "label": label, "action": action, "file": d, "rotateY": 0}
        e["mesh"] = emit(f"{src}/{d}/pred_textured.glb", f"stage1/{key}.pred.glb",
                         max_frames=FRAMES, quality=QUALITY, max_tex=TEX)
        e["gt"] = emit(f"{src}/{d}/gt_textured.glb", f"stage1/{key}.gt.glb",
                       max_frames=FRAMES, quality=QUALITY, max_tex=TEX)
        e["blob"] = emit(f"{src}/{d}/blob_nopiles.glb", f"stage1/{key}.blob.glb",
                         do_jpeg=False, do_quant=False)
        out.append(e)
    return out


def emit(src, rel, **kw):
    if not os.path.exists(src):
        print(f"  !! missing {src}")
        return None
    dst = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    optimize(src, dst, **kw)
    return rel


def main():
    os.makedirs(OUT, exist_ok=True)
    m = {"teaser": teaser(), "stage1": stage1()}
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump(m, f, indent=1)
    print(f"\n{len(m['teaser'])} teaser, {len(m['stage1'])} stage1")


if __name__ == "__main__":
    main()

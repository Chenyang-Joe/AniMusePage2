#!/usr/bin/env python3
"""Pick the handful of GLBs the page actually shows, shrink them, write a manifest.

`data/` holds ~6 GB of exports. The page needs about 25 files. This picks them,
runs each through glb_opt, and writes assets/models/manifest.json for the viewers
to read, so the sample lists live in one place instead of being duplicated in JS.
"""
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb_opt import optimize

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "assets", "models")
MAX_TEX = 1024

# Four species with obviously different body plans -- the point of the split
# viewer is that one shared bone book covers all of them.
TEASER = [
    ("fox",      "Fennec_Fox_Female__fennec_fox_female__4558f40ab8dc.glb", "Fennec Fox"),
    ("elephant", "Indian_Elephant_Female__indian_elepha_64be1af510c4.glb", "Indian Elephant"),
    ("wallaby",  "Rednecked_Wallaby_Male__rednecked_wal_36a87e28b6c0.glb", "Red-necked Wallaby"),
    ("warthog",  "Common_Warthog_Juvenile__common_warth_f072c9b5ba93.glb", "Common Warthog"),
]

# Stage-1 rigging comparison, textured: the point of the row is that the mesh we
# deform still looks like the animal, which an untextured clay render hides.
STAGE1 = [
    ("lynx",      "s042_Eurasian_Lynx_Juvenile_runbase",                  "Eurasian Lynx",   "run"),
    ("arcticfox", "s058_Arctic_Fox_Juvenile_walkbaseturnl",               "Arctic Fox",      "walk, turn left"),
    ("caracal",   "s011_Caracal_Juvenile_standtorunturnl",                "Caracal",         "stand to run"),
    ("leopard",   "s083_Clouded_Leopard_Juvenile_walktorunturnl",         "Clouded Leopard", "walk to run"),
]

# The four gray bones in every inpainting blob GLB -- matches
# configs/eval_inpaint inpaint_color [0.55,0.55,0.55,1.0]. Same indices on
# every species, which is the whole claim.
PINNED_BONES = [4, 55, 76, 77]

# The grid viewer orients each cell by rolling it until the pinned feet point
# down, so no per-animal constant is normally needed. This is the override for
# any clip that still lands wrong: extra degrees of roll on top.
# The generated panda clip has the animal on its back with its legs paddling in
# the air. A sweep of all 96 whole-degree-multiple orientations puts its four
# pinned feet at best level with its body, never below, so no camera or rotation
# makes it read as a quadruped -- the clip itself needs regenerating. Kept in the
# manifest, held out of the grid until then.
INPAINT_SKIP = {"The_juvenile_giant_panda_treads_water_a6e7e7b03aaf"}
INPAINT_ROTZ = {}

# Left front leg, from references/repos/scene_1/main.js.
LEG_BONES = [44, 45, 46, 47, 48, 49, 50, 51, 26, 110, 111, 13]

# Framing straight from references/repos/scene_1/main.js -- these were tuned by
# eye against these three exports, so the viewer reuses them rather than
# re-deriving an orientation from bounding boxes.
EDITING = [
    ("tiger",    "Bengal_Tiger_Female__bengal_tiger_fem_85a98badff8b.glb", "Bengal Tiger",     180, 0.08),
    ("elephant", "African_Elephant_Female__african_elep_cc89c098eb78.glb", "African Elephant", 0,   0.0),
    ("bear",     "Grizzly_Bear_Female__grizzly_bear_fem_11bc3ce97aa2.glb", "Grizzly Bear",     90,  0.0),
]

stats = [0, 0]


def emit(src, rel, **kw):
    dst = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if not os.path.exists(src):
        print(f"  !! missing {src}")
        return None
    b, a = optimize(src, dst, max_tex=MAX_TEX, **kw)
    stats[0] += b
    stats[1] += a
    return rel


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    m = {"pinnedBones": PINNED_BONES, "legBones": LEG_BONES}

    print("teaser (split viewer + correspondence)")
    m["teaser"] = []
    for key, fn, label in TEASER:
        m["teaser"].append({
            "id": key, "label": label,
            "mesh": emit(f"{DATA}/teaser/mesh/{fn}", f"teaser/{key}.mesh.glb"),
            # Blobs carry no texture and quantizing 120 tiny ellipsoids buys
            # nothing, so they go through untouched.
            "blob": emit(f"{DATA}/teaser/blob/{fn}", f"teaser/{key}.blob.glb", do_jpeg=False, do_quant=False),
        })

    print("stage1 (rigging comparison)")
    m["stage1"] = []
    for key, d, label, action in STAGE1:
        m["stage1"].append({
            "id": key, "label": label, "action": action,
            "gt":   emit(f"{DATA}/stage1/{d}/gt_textured.glb",   f"stage1/{key}.gt.glb"),
            "pred": emit(f"{DATA}/stage1/{d}/pred_textured.glb", f"stage1/{key}.pred.glb"),
            "blob": emit(f"{DATA}/stage1/{d}/blob_nopiles.glb", f"stage1/{key}.blob.glb",
                         do_jpeg=False, do_quant=False),
        })

    print("inpainting (pinned feet + text prompts)")
    caps = {}
    with open(f"{DATA}/inpainting/captions.txt") as f:
        for line in f:
            if "\t" in line:
                fn, cap = line.rstrip("\n").split("\t", 1)
                caps[fn] = cap.strip()
    m["inpainting"] = []
    for fn in sorted(os.listdir(f"{DATA}/inpainting/mesh")):
        if not fn.endswith(".glb"):
            continue
        key = fn[:-4]
        m["inpainting"].append({
            "id": key,
            "prompt": caps.get(fn, ""),
            "rotateZ": INPAINT_ROTZ.get(key, 0),
            "inGrid": key not in INPAINT_SKIP,
            "mesh": emit(f"{DATA}/inpainting/mesh/{fn}", f"inpainting/{key}.mesh.glb", max_frames=90),
            "blob": emit(f"{DATA}/inpainting/blob/{fn}", f"inpainting/{key}.blob.glb",
                         do_jpeg=False, do_quant=False),
        })

    print("editing (leg slider)")
    m["editing"] = []
    for key, fn, label, rot, nudge in EDITING:
        m["editing"].append({
            "id": key, "label": label, "rotateY": rot, "nudgeX": nudge,
            "mesh": emit(f"{DATA}/editing/mesh/{fn}", f"editing/{key}.mesh.glb"),
            "blob": emit(f"{DATA}/editing/blob/{fn}", f"editing/{key}.blob.glb",
                         do_jpeg=False, do_quant=False),
        })

    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(m, f, indent=1)
    b, a = stats
    print(f"\ntotal {b/1e6:.0f} MB -> {a/1e6:.0f} MB  ({b/max(a,1):.1f}x)")


if __name__ == "__main__":
    main()

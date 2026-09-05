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
# rotateY is extra degrees on top of the automatic profile turn; 180 turns an
# animal that ends up facing tail-first.
TEASER = [
    ("fox",      "Fennec_Fox_Female__fennec_fox_female__4558f40ab8dc.glb", "Fennec Fox", 0),
    ("elephant", "Indian_Elephant_Female__indian_elepha_64be1af510c4.glb", "Indian Elephant", 0),
    ("wallaby",  "Rednecked_Wallaby_Male__rednecked_wal_36a87e28b6c0.glb", "Red-necked Wallaby", 180),
    ("warthog",  "Common_Warthog_Juvenile__common_warth_f072c9b5ba93.glb", "Common Warthog", 0),
]

# What each clip is doing, keyed by the ids above. Not recoverable from the
# teaser filenames, which truncate the source name before the action.
ACTIONS = {}

# A second, larger draw for the Stage-2 wall. Deliberately disjoint from TEASER
# so the two split viewers never show the same animal. Chosen for short clips and
# low vertex counts -- eight of these load in the time one of the big ones would.
GALLERY = [
    ("wombat",   "Common_Wombat_Juvenile__common_wombat_d75c42453139.glb", "Common Wombat", 0),
    ("quokka",   "Quokka_Juvenile__quokka_juvenile__ani_ed4a5523cfee.glb", "Quokka", 0),
    ("wilddog",  "African_Wild_Dog_Female__african_wild_2d6e9829b182.glb", "African Wild Dog", 0),
    ("addax",    "Addax_Female__addax_female__animation_3c84f53e637e.glb", "Addax", 0),
    ("badger",   "Honey_Badger_Female__honey_badger_mal_9b84ff3fdd83.glb", "Honey Badger", 0),
    ("arcticwolf", "Arctic_Wolf_Male__arctic_wolf_male__a_fdaf083438c8.glb", "Arctic Wolf", 0),
    ("platypus", "Platypus_Male__platypus_male__animati_abc6c6f4afb4.glb", "Platypus", 0),
    ("bonobo",   "Bonobo_Female__bonobo_female__animati_c8a00d05ea65.glb", "Bonobo", 0),
]

# Stage-1 rigging comparison, textured: the point of the row is that the mesh we
# deform still looks like the animal, which an untextured clay render hides.
# The longest clips in the set: a short one barely moves, which is exactly what
# this comparison must not show.
STAGE1 = [
    ("dingo",  "s089_Dingo_Juvenile_interactjuvenilea",        "Dingo",           "interact"),
    ("llama",  "s031_Llama_Juvenile_drinkloop01",              "Llama",           "drink"),
    ("lemur",  "s061_Red_Ruffed_Lemur_Juvenile_standpreen01",  "Red Ruffed Lemur", "preen"),
    ("saiga",  "s035_Saiga_Female_fightattack",                "Saiga",           "fight"),
]

# Correspondence only needs the bones, so this group costs a few hundred KB and
# can afford body plans that share almost nothing with each other.
CORRESPOND = [
    ("tortoise",  "Galapagos_Giant_Tortoise_Male__galapa_9ddb7e38ada8.glb", "Galapagos Tortoise"),
    ("cassowary", "Cassowary_Male__cassowary_male__anima_107a3ec7af0b.glb", "Cassowary"),
    ("armadillo", "Nine_Banded_Armadillo_Male__nine_band_8e9a3d7e9bac.glb", "Nine-banded Armadillo"),
    ("capybara",  "Capybara_Male__capybara_male__animati_9f3c80b87e69.glb", "Capybara"),
]

# The four gray bones in every inpainting blob GLB -- matches
# configs/eval_inpaint inpaint_color [0.55,0.55,0.55,1.0]. Same indices on
# every species, which is the whole claim.
PINNED_BONES = [4, 55, 76, 77]

# The grid viewer orients each cell by rolling it until the pinned feet point
# down, so no per-animal constant is normally needed. This is the override for
# any clip that still lands wrong: extra degrees of roll on top.
# Per-clip overrides for the inpainting grid. `INPAINT_SKIP` holds a clip out of
# the grid without deleting the asset; ROTX/ROTZ are extra degrees of roll in
# screen axes, on top of the automatic orientation.
INPAINT_SKIP = set()
INPAINT_ROTX = {}
# Extra degrees of roll in screen axes, on top of the automatic orientation.
# Empty on purpose: once the bones are registered onto the mesh in the viewer,
# the automatic rule gets every clip right, the belly-up panda included.
INPAINT_ROTZ = {
    "The_juvenile_giant_panda_treads_water_a6e7e7b03aaf": 90,
    "The_male_asian_small_clawed_otter_swi_27a9b42ca295": 90,
}

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

    for group, table in (("teaser", TEASER), ("gallery", GALLERY)):
        print(f"{group} (split viewers)")
        m[group] = []
        for key, fn, label, rot in table:
            m[group].append({
                "id": key, "label": label, "rotateY": rot,
                # The teaser exports truncate the source name, so the action is
                # not recoverable from the filename. Fill in by hand.
                "action": ACTIONS.get(key, ""),
                "mesh": emit(f"{DATA}/teaser/mesh/{fn}", f"{group}/{key}.mesh.glb"),
                # Blobs carry no texture and quantizing 120 tiny ellipsoids buys
                # nothing, so they go through untouched.
                "blob": emit(f"{DATA}/teaser/blob/{fn}", f"{group}/{key}.blob.glb",
                             do_jpeg=False, do_quant=False),
            })

    print("stage1 (rigging comparison)")
    m["stage1"] = []
    for key, d, label, action in STAGE1:
        m["stage1"].append({
            "id": key, "label": label, "action": action,
            "gt":   emit(f"{DATA}/stage1/{d}/gt_textured.glb",   f"stage1/{key}.gt.glb", max_frames=100),
            "pred": emit(f"{DATA}/stage1/{d}/pred_textured.glb", f"stage1/{key}.pred.glb", max_frames=100),
            "blob": emit(f"{DATA}/stage1/{d}/blob_nopiles.glb", f"stage1/{key}.blob.glb",
                         do_jpeg=False, do_quant=False),
        })

    print("correspondence (bones only)")
    m["correspond"] = []
    for key, fn, label in CORRESPOND:
        m["correspond"].append({
            "id": key, "label": label,
            "blob": emit(f"{DATA}/teaser/blob/{fn}", f"correspond/{key}.blob.glb",
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
            "rotateX": INPAINT_ROTX.get(key, 0),
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

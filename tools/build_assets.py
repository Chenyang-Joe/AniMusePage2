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
# Picks and orientations from references/repos/scene_5, which curated both by
# hand against a camera looking down -Z -- exactly the axis both split viewers
# use. So `groundModel`'s automatic lay-down is switched off for these two
# groups, and rotateY carries scene_5's flip. The viewers add a measured side-on
# turn on top (`facingTurn`), because these meshes are not authored on a common
# axis; where that measurement is wrong -- a near-square animal has no long axis
# to find -- the correction is folded into rotateY here, since the two are added.
TEASER = [
    # The camel and the meerkat are round enough that no rotation makes one axis
    # clearly longer -- 1.07 at best -- so `facingTurn` has nothing to find and
    # these two carry the whole angle by hand, turned to face left like the rest.
    ("camel",   "Bactrian_Camel_Female__bactrian_camel_db6831436c54.glb", "Bactrian Camel", 90),
    ("meerkat", "Meerkat_Juvenile__meerkat_juvenile__a_1c0f2ac8c214.glb", "Meerkat", 90),
    ("penguin", "King_Penguin_Male__king_penguin_male__51afc65ae2d9.glb", "King Penguin", 180),
    ("pallascat", "Pallas_Cat_Male__pallas_cat_male__ani_d6e9a20566ca.glb", "Pallas's Cat", 180),
]

# What each clip is doing, keyed by the ids above. Not recoverable from the
# teaser filenames, which truncate the source name before the action.
ACTIONS = {}

# The Stage-2 wall: the remaining six of scene_5's ten, plus two of the longest
# clips in the pool so the wall is not all short loops.
GALLERY = [
    ("arcticwolf", "Arctic_Wolf_Female__arctic_wolf_femal_9c0c125b1b50.glb", "Arctic Wolf", 0),
    ("addax",      "Addax_Female__addax_female__animation_3c84f53e637e.glb", "Addax", 0),
    # -90 / +90 cancel or supply the measured turn: the kangaroo is already
    # side-on and the crouching chimpanzee is too square to call.
    ("kangaroo",   "Red_Kangaroo_Juvenile__red_kangaroo_j_4feb086e6b5b.glb", "Red Kangaroo", -90),
    ("badger",     "Honey_Badger_Juvenile__honey_badger_j_df49ab261a6b.glb", "Honey Badger", 180),
    ("tiger",      "Bengal_Tiger_Male__bengal_tiger_male__134f4edbedf7.glb", "Bengal Tiger", 0),
    ("otter",      "Asian_Small_Clawed_Otter_Male__asian__c0909d86f1be.glb", "Asian Small-clawed Otter", 0),
    ("brownbear",  "Himalayan_Brown_Bear_Female__himalaya_219094cd7b0b.glb", "Himalayan Brown Bear", 0),
    ("chimpanzee", "Western_Chimpanzee_Juvenile__western__08a30ba11351.glb", "Western Chimpanzee", 90),
]

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
# rotateY, then nudgeX / nudgeY: the rearing bear sits higher than the two
# quadrupeds once each pair is grounded, so the others are lifted to match it.
EDITING = [
    ("tiger",    "Bengal_Tiger_Female__bengal_tiger_fem_85a98badff8b.glb", "Bengal Tiger",     180, 0.16, 0.15),
    ("elephant", "African_Elephant_Female__african_elep_cc89c098eb78.glb", "African Elephant", 0,   0.0,  0.15),
    ("bear",     "Grizzly_Bear_Female__grizzly_bear_fem_11bc3ce97aa2.glb", "Grizzly Bear",     90,  0.0,  0.0),
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
                # scene_5's orientation is complete on its own.
                "profile": False,
                # The teaser exports truncate the source name, so the action is
                # not recoverable from the filename. Fill in by hand.
                "action": ACTIONS.get(key, ""),
                # The wall shows all eight at once, so its meshes get thinned;
                # the hero viewer shows one at a time and keeps every frame.
                "mesh": emit(f"{DATA}/teaser/mesh/{fn}", f"{group}/{key}.mesh.glb",
                             max_frames=70 if group == "gallery" else None),
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
    for key, fn, label, rot, nudge_x, nudge_y in EDITING:
        m["editing"].append({
            "id": key, "label": label, "rotateY": rot,
            "nudgeX": nudge_x, "nudgeY": nudge_y,
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

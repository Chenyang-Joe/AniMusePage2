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
#
# Picks, angles and captions all come from pick.html, where they were made
# against the live clips. rotateY is whatever angle the clip was left at there;
# the viewers add the measured side-on turn (`facingTurn`) on top, exactly as
# the picker did, so what was chosen is what renders. `groundModel`'s automatic
# lay-down stays switched off for these two groups so it cannot argue with it.
#
# The hero shows one animal at a time and can afford the long clips.
TEASER = [
    ("polarbear", "Polar_Bear_Male__polar_bear_male__ani_19265aad3435.glb", "Polar Bear", 0),
    ("macaque",   "Japanese_Macaque_Female__japanese_mac_86b28b03fc31.glb", "Japanese Macaque", 90),
    ("camel",     "Bactrian_Camel_Female__bactrian_camel_db6831436c54.glb", "Bactrian Camel", 180),
    ("capybara",  "Capybara_Male__capybara_male__animati_9f3c80b87e69.glb", "Capybara", 30),
]

# What each clip is doing. Not recoverable from the teaser filenames, which
# truncate the source name before the action -- these were read off the clips.
ACTIONS = {
    "tortoise":   "walks and turns left",
    "polarbear":  "swims",
    "macaque":    "stands up, then drops back down",
    "camel":      "walks, then lowers its head to drink",
    "addax":      "rushes forward",
    "lemur":      "walks on all fours",
    "bonobo":     "jumps excitedly",
    "elephant":   "turns left at a brisk walk",
    "wallaby":    "hops forward",
    "arcticwolf": "breaks into a run",
    "capybara":   "sniffs the ground",
    "hyena":      "gives a small hop",
}

# The Stage-2 wall: the other eight.
GALLERY = [
    ("arcticwolf", "Arctic_Wolf_Female__arctic_wolf_femal_9c0c125b1b50.glb", "Arctic Wolf", 180),
    ("elephant",   "Indian_Elephant_Female__indian_elepha_64be1af510c4.glb", "Indian Elephant", 0),
    ("bonobo",     "Bonobo_Female__bonobo_female__animati_c8a00d05ea65.glb", "Bonobo", 0),
    ("wallaby",    "Rednecked_Wallaby_Male__rednecked_wal_36a87e28b6c0.glb", "Red-necked Wallaby", 90),
    ("addax",      "Addax_Female__addax_female__animation_3c84f53e637e.glb", "Addax", 0),
    ("lemur",      "B_W_Ruffed_Lemur_Male__b_w_ruffed_lem_2aabc3fd7a19.glb", "Black-and-white Ruffed Lemur", 0),
    ("tortoise",   "Galapagos_Giant_Tortoise_Male__galapa_9ddb7e38ada8.glb", "Galapagos Giant Tortoise", 0),
    ("hyena",      "Spotted_Hyena_Female__spotted_hyena_f_160db685a46d.glb", "Spotted Hyena", 0),
]

# The rigging comparison: four of the eight Stage-1 clips chosen in pick.html.
# The baboon comes up from the correspondence row to keep a primate in here --
# the red ruffed lemur was the primate and it is out. Angles as picked; the row
# viewer adds the measured side-on turn, as everywhere else, and -30 is a
# three-quarter view: these two are side-on at 0 and face the camera at -90.
STAGE1 = [
    ("saiga",  "s035_Saiga_Female_fightattack",                      "Saiga",            "attacks",                      0),
    ("wolf",   "s047_Arctic_Wolf_Male_fightreact",                   "Arctic Wolf",      "recoils from a blow",        -30),
    ("sheep",  "s016_Dall_Sheep_Male_matingritual",                  "Dall Sheep",       "performs a mating display",  -30),
    ("baboon", "s091_Hamadryas_Baboon_Juvenile_standtodrinktrough",  "Hamadryas Baboon", "stands up to drink",         180),
]

# Correspondence needs only the bones, so it costs a few hundred KB and can
# afford the body plans that share the least: a small mustelid, a long-necked
# camelid, four tons of elephant -- and a bird, which is the one
# that makes the point hardest to argue with, since a cassowary has no forelimbs
# to speak of and the slots find its wings anyway. `blob_nopiles` where Stage-1
# has it: the three direction spikes on every ellipsoid are noise when the
# question is *which* ellipsoid, not which way it points. The cassowary is the
# exception -- it only exists in the teaser pool -- and its export carries the
# same 120 ellipsoids and nothing else, so it sits in the row unremarked.
# Paths are relative to data/ because these two pools are laid out differently.
CORRESPOND = [
    ("skunk",     "stage1/s093_Striped_Skunk_Male_enterburrowunderground/blob_nopiles.glb",    "Striped Skunk",    0),
    ("cassowary", "teaser/blob/Cassowary_Male__cassowary_male__anima_107a3ec7af0b.glb",        "Cassowary",        0),
    ("camel",     "stage1/s002_Bactrian_Camel_Juvenile_fighttauntreact/blob_nopiles.glb",      "Bactrian Camel",   0),
    # The rhino read badly here -- the ellipsoids on its horn jitter frame to
    # frame, which is the first thing the eye lands on in a row of still bones.
    ("elephant",  "stage1/s068_Indian_Elephant_Female_standtorunturnl/blob_nopiles.glb", "Indian Elephant", 180),
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
                # Both groups get thinned, the wall harder: it loads eight files
                # at once where the hero loads one. Untrimmed, the hero's clips
                # run to 250 frames and 14 MB apiece, which is the old site's
                # loading problem all over again. These animals move slowly
                # enough, and the tracks interpolate linearly, that a third of
                # the frames is not visible as steppiness.
                "mesh": emit(f"{DATA}/teaser/mesh/{fn}", f"{group}/{key}.mesh.glb",
                             max_frames=70 if group == "gallery" else 110),
                # Blobs carry no texture and quantizing 120 tiny ellipsoids buys
                # nothing, so they go through untouched.
                "blob": emit(f"{DATA}/teaser/blob/{fn}", f"{group}/{key}.blob.glb",
                             do_jpeg=False, do_quant=False),
            })

    print("stage1 (rigging comparison)")
    m["stage1"] = []
    for key, d, label, action, rot in STAGE1:
        m["stage1"].append({
            "id": key, "label": label, "action": action, "rotateY": rot,
            "gt":   emit(f"{DATA}/stage1/{d}/gt_textured.glb",   f"stage1/{key}.gt.glb", max_frames=100),
            "pred": emit(f"{DATA}/stage1/{d}/pred_textured.glb", f"stage1/{key}.pred.glb", max_frames=100),
            "blob": emit(f"{DATA}/stage1/{d}/blob_nopiles.glb", f"stage1/{key}.blob.glb",
                         do_jpeg=False, do_quant=False),
        })

    print("correspondence (bones only)")
    m["correspond"] = []
    for key, src, label, rot in CORRESPOND:
        m["correspond"].append({
            "id": key, "label": label, "rotateY": rot,
            "blob": emit(f"{DATA}/{src}", f"correspond/{key}.blob.glb",
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
            # Six cells at a couple of hundred pixels each, on a shared clock:
            # this is the heaviest group on the page and the one that can least
            # afford to be. At 90 frames the exports came through untouched --
            # 25 MB of morph targets loading directly above the editing viewer,
            # which then waited its turn for bandwidth it did not need to.
            "mesh": emit(f"{DATA}/inpainting/mesh/{fn}", f"inpainting/{key}.mesh.glb", max_frames=40),
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

# AniMuse project page

Static site — no build step, no npm, no CDN. three.js is vendored under `vendor/`.

```sh
python3 -m http.server 8123          # then open http://127.0.0.1:8123/
```

An ES-module importmap in `index.html` maps `three` and `three/addons/` to
`vendor/three/`, so the same files work locally and on GitHub Pages.

## Layout

```
index.html            the page
legacy/index.html     the first version, kept as a reference for the viewers.
                      Shares css/, js/, assets/ and vendor/ with the live page;
                      its own links are ../-prefixed, and js/main.js resolves
                      asset paths against itself so both depths work.
css/style.css         one stylesheet
js/main.js            lazy-boots each viewer when it nears the viewport
js/viewers/stage.js   shared renderer, GLB cache, grounding, row layout, camera fit
js/viewers/split.js   bones | mesh split slider, one animal
js/viewers/splitgrid.js  the same split across a wall of eight
js/viewers/correspond.js  cross-species bone-slot correspondence
js/viewers/row.js     synchronised row (Stage-1 comparison, inpainting)
js/viewers/editing.js leg-group slider
tools/glb_opt.py      GLB shrinker (prune, JPEG, int16 quantize, frame decimate)
tools/build_assets.py picks the ~30 GLBs the page shows, shrinks them, writes the manifest
tools/glbinfo.py      prints a GLB's structure
tools/figures.py      renders the paper figures to web JPEGs
draft_2.md            the page's copy and section plan
caption_fix.md        the eval-figure caption rewrite, for Overleaf
assets/models/        shipped GLBs + manifest.json
data/                 raw exports, ~6 GB, gitignored
references/repos/     read-only: CANOR_GAUSS (the method) and scene_1 (prior prototype)
```

## Assets

`data/` is not in the repo. To regenerate `assets/models/` from it:

```sh
python3 tools/build_assets.py        # 173 MB -> 52 MB
```

Which samples appear is decided by the tables at the top of `tools/build_assets.py`.
`rotateY` there is a manual override on top of the automatic profile turn — add 180
if an animal ends up facing the wrong way down the row.

## Notes on the data

- Nothing is skinned at runtime. `*/blob/*.glb` is 120 separate ellipsoid nodes driven
  by TRS keyframes; `*/mesh/*.glb` is one mesh with a morph target per frame driven by a
  one-hot weight track. Playing an animation is just an `AnimationMixer`.
- Node index == mesh index == material index == **SGB slot**. Bone colour is a ramp over
  that index and is byte-identical across species, which is what the correspondence
  viewer shows.
- In `data/inpainting/`, slots **4, 55, 76, 77** are grey — those are the pinned foot
  bones (matching `inpaint_color` in the method repo's `configs/eval_inpaint/`).
- The left front leg is slots **44–51, 26, 110, 111, 13**, from the `scene_1` prototype.
- three.js inflates a morph-target mesh's bounding box to cover its whole animation, so
  anything that measures geometry uses `restBox()` in `js/viewers/stage.js` instead of
  `Box3.setFromObject` — see the comment there.
- Bones and mesh come out of the exporter at different scales *and* different orientations,
  so anything showing both has to call `alignBlobToMesh()` first. Skipping it was what made
  the panda look belly-up: the automatic orientation read the bones while the viewer drew
  the mesh, and the two disagreed.
- Centring and rotating must live on separate groups. Rotating the group that also carries
  the centring offset swings a cell off its slot in the grid.

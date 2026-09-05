import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

/** Load a GLB once per URL. Viewers that share a file share the parse, too. */
export function loadGLB(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
}

/**
 * Drop every parsed GLB. The site never needs this -- it ships two dozen files
 * and keeps them -- but the picker pages through nearly two hundred, and a
 * parsed clip is several times the size of the file it came from.
 */
export function clearGLBCache() { cache.clear(); }

/** Every renderer we hand out, so `resize` can be driven from one listener. */
const stages = new Set();

// Handy when tuning framing from the console; costs nothing.
if (typeof window !== 'undefined') window.__animuse = { stages, all: [], loadGLB };

/**
 * A canvas that only starts costing anything once it scrolls into view.
 *
 * Nothing here creates a WebGL context until `mount()` runs, and `mount()` is
 * called by an IntersectionObserver. That is the whole answer to the old site's
 * "loads too slowly": the page ships as text, and each viewer pays for itself
 * only when the reader actually reaches it.
 */
export function createStage(host, opts = {}) {
  const {
    fov = 32,
    background = 0xffffff,
    cameraPos = [0, 0.45, 2.4],
    target = [0, 0.45, 0],
    onReady = null,
  } = opts;

  const stage = {
    host, mounted: false, renderer: null, scene: null, camera: null,
    controls: null, mixers: [], clock: new THREE.Clock(), onFrame: null,
    paused: false,
  };

  function mount() {
    if (stage.mounted) return;
    stage.mounted = true;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.autoClear = false;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(background);

    const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 100);
    camera.position.set(...cameraPos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 0.8;
    controls.maxDistance = 6;
    controls.update();

    // Same rig as the authors' scene_1/scene_2 prototypes: one key, one cool
    // fill, no rim. A rim light on a white background just eats the silhouette.
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb8c8d8, 0.4);
    fill.position.set(-3, 2.5, -2);
    scene.add(fill);

    Object.assign(stage, { renderer, scene, camera, controls });
    stages.add(stage);
    resize(stage);
    if (onReady) onReady(stage);
  }

  // 300px of lead time so the GLB is usually decoded before it's on screen.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { mount(); io.disconnect(); }
    }
  }, { rootMargin: '300px 0px' });
  io.observe(host);

  // Pause offscreen viewers so a page full of canvases stays at 60fps.
  const vis = new IntersectionObserver((entries) => {
    for (const e of entries) stage.paused = !e.isIntersecting;
  }, { threshold: 0 });
  vis.observe(host);

  stage.mountNow = mount;
  // Chrome keeps only a handful of WebGL contexts alive and silently kills the
  // oldest beyond that, so anything that swaps viewers in and out -- the picker
  // pages through nearly two hundred clips -- has to give them back explicitly.
  stage.dispose = () => {
    io.disconnect();
    vis.disconnect();
    stages.delete(stage);
    ro.unobserve(host);
    if (!stage.renderer) return;
    stage.controls.dispose();
    stage.renderer.dispose();
    stage.renderer.forceContextLoss();
    stage.renderer.domElement.remove();
    stage.renderer = null;
    stage.onFrame = null;
  };
  if (typeof window !== 'undefined') window.__animuse.all.push(stage);
  return stage;
}

function resize(stage) {
  const { renderer, camera, host } = stage;
  if (!renderer) return;
  const w = host.clientWidth;
  const h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (stage.onResize) stage.onResize();
}

const ro = new ResizeObserver(() => { for (const s of stages) resize(s); });

export function observeResize(host) { ro.observe(host); }

function tick() {
  requestAnimationFrame(tick);
  for (const s of stages) {
    const dt = s.clock.getDelta();
    if (s.paused || !s.renderer) continue;
    for (const m of s.mixers) m.update(dt);
    s.controls.update();
    if (s.onFrame) s.onFrame(dt);
    else {
      s.renderer.clear();
      s.renderer.render(s.scene, s.camera);
    }
  }
}
tick();

/**
 * Ground a model on y=0 and centre it in x/z.
 *
 * Blob and mesh exports of the same animal share a scale wrapper, so doing this
 * to each independently still lines them up to within a millimetre -- which is
 * what lets the split viewer draw one as the left half of the other.
 */
export function groundModel(root, { rotateY = 0, profile = true, nudgeX = 0 } = {}) {
  root.rotation.y = rotateY * Math.PI / 180;
  root.updateMatrixWorld(true);
  let box = restBox(root);

  // Animals are exported nose-along-Z, so a front-facing camera would look
  // straight down the body. Turn whichever horizontal axis is longer to face
  // across the screen, and every species reads as a profile without a
  // per-file camera angle.
  let applied = rotateY;
  if (profile && (box.max.z - box.min.z) > (box.max.x - box.min.x)) {
    applied += 90;
    root.rotation.y = applied * Math.PI / 180;
    root.updateMatrixWorld(true);
    box = restBox(root);
  }

  // Adjust relative, never absolute: callers may have already moved this root
  // (registering bones onto a mesh, for instance) and that offset has to survive.
  const c = box.getCenter(new THREE.Vector3());
  root.position.x -= c.x - nudgeX;
  root.position.y -= box.min.y;
  root.position.z -= c.z;
  // Callers showing several representations of one animal reuse this so the
  // auto-orientation can't decide differently for two near-identical meshes.
  return { rotateY: applied, offset: root.position.clone() };
}

/**
 * The box of a mesh in its rest pose, ignoring morph targets.
 *
 * `Box3.setFromObject` cannot be used for this: GLTFLoader inflates a morph
 * target mesh's bounding box to cover the whole animation, so it reports the
 * envelope the mesh sweeps rather than the shape on screen. Registering bones
 * against that envelope makes them come out a third too large.
 */
export function restBox(root) {
  const box = new THREE.Box3();
  const one = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const pos = o.isMesh && o.geometry?.attributes?.position;
    if (!pos) return;
    one.setFromBufferAttribute(pos).applyMatrix4(o.matrixWorld);
    box.union(one);
  });
  return box;
}

/**
 * What an animal actually occupies on screen, frame by frame.
 *
 * `restBox` answers this for a still pose and `Box3.setFromObject` answers the
 * whole envelope (and over-answers it -- three.js inflates a morph geometry's
 * box conservatively), but neither describes a clip that travels: an otter that
 * swims four body lengths downstream has an envelope four times its body, so
 * normalising by it leaves the otter half the size of its neighbours, and
 * centring on its rest pose lets it swim out of frame.
 *
 * So the clip is evaluated, a frame at a time, and the poses are measured for
 * what they are. Two things move: a `morphTargetInfluences` track, one-hot per
 * frame over (F-1) relative targets, and a `root.position` track carrying the
 * travel -- which is why this drives a mixer rather than reading the morph
 * arrays directly. Only the handful of influences that are actually non-zero are
 * blended, so this stays one pass over the vertices per frame.
 *
 * Returns the animal as the viewers show it: on a treadmill. `travelAt` is the
 * horizontal drift to subtract at a given point in the clip, and `size` and
 * `center` describe what is left once that drift is gone. Height is deliberately
 * left in -- a meerkat rearing up is the motion, not travel.
 */
function clipBoxes(root, clip, samples) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o); });

  const v = new THREE.Vector3();
  const poseBox = (o) => {
    const pos = o.geometry.attributes.position;
    const targets = o.geometry.morphAttributes?.position || [];
    const infl = o.morphTargetInfluences || [];
    // Only the handful of influences that are actually non-zero -- the tracks
    // are one-hot per frame, so between two frames there are at most two.
    const active = [];
    for (let k = 0; k < infl.length; k++) {
      if (targets[k] && Math.abs(infl[k]) > 1e-4) active.push([targets[k], infl[k]]);
    }
    const box = new THREE.Box3();
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      for (const [d, w] of active) {
        v.set(v.x + d.getX(i) * w, v.y + d.getY(i) * w, v.z + d.getZ(i) * w);
      }
      box.expandByPoint(v);
    }
    return box.applyMatrix4(o.matrixWorld);
  };

  // A mixer of our own, so this can walk the clip without disturbing whatever
  // mixer the viewer is driving the same objects with.
  const mixer = clip && meshes.length ? new THREE.AnimationMixer(root) : null;
  if (mixer) mixer.clipAction(clip).play();
  const n = mixer ? Math.max(2, samples) : 1;

  const boxes = [];
  for (let j = 0; j < n; j++) {
    if (mixer) mixer.setTime((j / (n - 1)) * clip.duration);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const o of meshes) box.union(poseBox(o));
    boxes.push(box);
  }
  if (mixer) {
    mixer.setTime(0);
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
    root.updateMatrixWorld(true);
  }
  if (!boxes.length) boxes.push(restBox(root));
  return boxes;
}

/** Sample an array of per-frame values at normalised clip position `u`. */
function sampleAt(list, u) {
  const x = Math.min(list.length - 1, Math.max(0, u * (list.length - 1)));
  const i = Math.floor(x);
  return { a: list[i], b: list[Math.min(i + 1, list.length - 1)], f: x - i };
}

export function poseFrames(root, clip = null, { samples = 24 } = {}) {
  const boxes = clipBoxes(root, clip, samples);

  const centers = boxes.map((b) => b.getCenter(new THREE.Vector3()));
  const anchor = centers.reduce((a, c) => a.add(c), new THREE.Vector3())
    .divideScalar(centers.length);
  const travel = centers.map((c) => new THREE.Vector3(c.x - anchor.x, 0, c.z - anchor.z));

  const treadmill = new THREE.Box3();
  boxes.forEach((b, j) => treadmill.union(b.clone().translate(travel[j].clone().negate())));

  return {
    size: treadmill.getSize(new THREE.Vector3()),
    center: treadmill.getCenter(new THREE.Vector3()),
    /** Horizontal drift at normalised clip position `u`, to be subtracted. */
    travelAt(u) {
      const { a, b, f } = sampleAt(travel, u);
      return a.clone().lerp(b, f);
    },
  };
}

/**
 * The vertical correction that keeps the bones standing on the ground the
 * surface stands on.
 *
 * The two exports disagree about gravity. Every frame of the mesh is grounded --
 * its lowest vertex sits on y=0 the whole way through -- while the bones keep
 * the body's real vertical motion. Registered once at frame 0, as
 * `alignBlobToMesh` does, they then drift apart by up to a tenth of the body's
 * height, which reads as bones bobbing inside a mesh that stands still.
 *
 * This walks both clips once and returns the offset to add to the bones. It is
 * measured relative to frame 0, so the registration that was already made there
 * is left exactly as it was and only the drift is taken out.
 */
export function verticalLock(meshRoot, meshClip, blobRoot, blobClip, { samples = 24 } = {}) {
  const mesh = clipBoxes(meshRoot, meshClip, samples).map((b) => b.min.y);
  const bones = clipBoxes(blobRoot, blobClip, samples).map((b) => b.min.y);
  const n = Math.min(mesh.length, bones.length);
  const offset = [];
  for (let j = 0; j < n; j++) {
    offset.push((mesh[j] - mesh[0]) - (bones[j] - bones[0]));
  }
  return (u) => {
    const { a, b, f } = sampleAt(offset, u);
    return a + (b - a) * f;
  };
}

/**
 * Extra degrees of Y turn that put an animal side-on to the camera.
 *
 * These meshes are not authored on a common axis -- an arctic wolf runs down Z
 * and a tiger down X -- so something has to notice. Judged on `poseFrames`,
 * which reports the body with its travel removed: what is left is the animal's
 * own shape, and whichever horizontal axis it is longer along is the one that
 * should lie across the screen. (The raw animation envelope would answer "which
 * way did it walk", which is the same question only when the clip travels.)
 *
 * A near-square animal -- a camel head-on is as wide as it is deep, and so is a
 * crouching chimpanzee -- has no long axis to find, and guessing one throws away
 * a better answer: `rotateY` in the manifest, which was curated by hand. So the
 * turn is only applied when the measurement is decisive. Returns 0 or 90; which
 * *end* faces which way is always the curated decision.
 */
const DECISIVE = 1.15;

export function facingTurn(meshRoot, clip = null) {
  const { size } = poseFrames(meshRoot, clip, { samples: 8 });
  return size.z > size.x * DECISIVE ? 90 : 0;
}

/**
 * Register a bone cloud onto the mesh it belongs to, then ground the pair.
 *
 * The two exports are not in one coordinate frame: the surface carries a scale
 * wrapper the bones never got, and in the teaser set the bones additionally sit
 * in a normalised cube while the mesh sits near the origin. Measured across the
 * shipped pairs the bone box is a uniformly smaller, sometimes re-centred copy of
 * the mesh box, so a similarity fit -- one scale plus a translation, both read
 * off the frame-0 boxes -- puts them back on top of each other.
 *
 * The scale comes from the median axis ratio rather than the mean: bones stop
 * short of the nose and tail, so the long axis reads systematically low and
 * would drag an average down with it.
 *
 * `override` ({ scale, offset }) is the escape hatch for a pair the fit misses.
 */
/**
 * The same registration the other way round: move the surface onto the bones.
 *
 * For a viewer that shows one or the other rather than both at once, the bones
 * can be laid out first and the surface fetched later -- but only if arriving
 * late costs nothing on screen, which means the late one is the one that moves.
 *
 * It takes a *box* rather than the bones themselves, because by the time the
 * surface arrives the bones are deep in a scene graph and their world box is no
 * longer the frame the surface's own transform lives in. The caller measures the
 * bones once, while that frame and the world still agree, and keeps the box.
 * `meshRoot` must still be unparented when this runs, for the same reason.
 */
export function alignMeshToBox(meshRoot, box) {
  meshRoot.updateMatrixWorld(true);
  const mb = restBox(meshRoot);
  if (box.isEmpty() || mb.isEmpty()) return 1;

  const bs = box.getSize(new THREE.Vector3());
  const ms = mb.getSize(new THREE.Vector3());
  const ratios = [bs.x / ms.x, bs.y / ms.y, bs.z / ms.z]
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const s = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;

  meshRoot.scale.multiplyScalar(s);
  meshRoot.updateMatrixWorld(true);
  meshRoot.position.add(box.getCenter(new THREE.Vector3()))
    .sub(restBox(meshRoot).getCenter(new THREE.Vector3()));
  meshRoot.updateMatrixWorld(true);
  return s;
}

export function alignBlobToMesh(blobRoot, meshRoot, override = {}) {
  blobRoot.updateMatrixWorld(true);
  meshRoot.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(blobRoot);
  const mb = restBox(meshRoot);
  if (bb.isEmpty() || mb.isEmpty()) return 1;

  // Both boxes are now the rest pose, so the per-axis ratios agree to within a
  // few percent and the median is a stable estimate of the one true factor. It
  // is preferred over the mean because bones stop short of nose and tail, which
  // pulls the long axis low.
  const bs = bb.getSize(new THREE.Vector3());
  const ms = mb.getSize(new THREE.Vector3());
  const ratios = [ms.x / bs.x, ms.y / bs.y, ms.z / bs.z]
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const s = override.scale ?? (ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1);

  blobRoot.scale.multiplyScalar(s);
  blobRoot.updateMatrixWorld(true);
  const bc = new THREE.Box3().setFromObject(blobRoot).getCenter(new THREE.Vector3());
  const mc = mb.getCenter(new THREE.Vector3());
  blobRoot.position.add(mc).sub(bc);
  if (override.offset) blobRoot.position.add(new THREE.Vector3(...override.offset));
  blobRoot.updateMatrixWorld(true);
  return s;
}

/**
 * Register the bones onto the mesh, then frame the two as one rigid object.
 *
 * The pair has to share a parent: grounding rotates about the origin, and the
 * bones do not sit at the origin, so turning each half separately after aligning
 * them would swing them apart again.
 */
export function pairModels(meshRoot, blobRoot, { align, scaleTo, stack = 0, ...groundOpts } = {}) {
  const pair = new THREE.Group();
  pair.add(meshRoot, blobRoot);
  alignBlobToMesh(blobRoot, meshRoot, align || {});
  if (scaleTo) {
    // A row of species is a UI, not a size comparison: an elephant rendered at
    // true scale beside a fox leaves the fox unreadable. Normalise the mesh's
    // largest extent, not its height -- these animals are caught mid-motion, and
    // a running cat is long and low where a standing elephant is tall.
    const size = restBox(meshRoot).getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z);
    if (span > 1e-4) pair.scale.multiplyScalar(scaleTo / span);
  }
  if (stack) {
    // Bones under the surface they drive, rather than a toggle between the two:
    // the edit and its effect are then legible in one glance.
    blobRoot.updateMatrixWorld(true);
    const h = restBox(blobRoot).getSize(new THREE.Vector3()).y / (pair.scale.y || 1);
    blobRoot.position.y -= h * (1 + stack);
  }
  const res = groundModel(pair, groundOpts);
  return { pair, ...res };
}

/**
 * Lay grounded models out along X, spaced by their own widths.
 *
 * Species differ enormously in footprint -- an elephant next to a fennec fox --
 * so a fixed spacing either overlaps the big ones or strands the small ones.
 */
export function layoutRow(roots, { gap = 0.18 } = {}) {
  const widths = roots.map((r) => {
    r.updateMatrixWorld(true);
    const b = restBox(r);
    return Math.max(b.max.x - b.min.x, 1e-3);
  });
  const pad = gap * Math.max(...widths);
  const total = widths.reduce((a, b) => a + b, 0) + pad * (roots.length - 1);
  let x = -total / 2;
  roots.forEach((r, i) => {
    r.position.x += x + widths[i] / 2;
    x += widths[i] + pad;
  });
}

/**
 * Point the camera at whatever is actually in the scene.
 *
 * Keeps the current view direction so this can be re-run when the reader picks a
 * different sample without yanking the camera back to a default angle.
 */
export function fitCamera(stage, roots, { padding = 1.25, keepDirection = true, dir: initialDir, box: given } = {}) {
  const { camera, controls } = stage;
  if (!camera || (!given && !roots.length)) return;
  // `box` lets a caller that has measured the whole clip (see `poseFrames`) frame
  // that instead of the rest pose the roots happen to be sitting in.
  const box = given ? given.clone() : new THREE.Box3();
  if (!given) for (const r of roots) {
    r.updateMatrixWorld(true);
    box.union(restBox(r));
  }
  if (box.isEmpty()) return;
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const dir = keepDirection && stage.fitted
    ? camera.position.clone().sub(controls.target).normalize()
    : new THREE.Vector3(...(initialDir || [0.22, 0.14, 1])).normalize();

  const vFov = camera.fov * Math.PI / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  // Measured to the box's *near* face, not its centre. A chunky animal -- a
  // giant tortoise is nearly as deep as it is wide -- viewed from not much more
  // than its own depth away throws its near end forward hard enough to break
  // out of a frame that only fitted its middle.
  const near = (Math.abs(dir.x) * size.x + Math.abs(dir.y) * size.y
                + Math.abs(dir.z) * size.z) / 2;
  const dist = near + padding * Math.max(
    (size.y / 2) / Math.tan(vFov / 2),
    (size.x / 2) / Math.tan(hFov / 2),
  );
  camera.position.copy(centre).addScaledVector(dir, dist);
  controls.target.copy(centre);
  controls.minDistance = dist * 0.35;
  controls.maxDistance = dist * 3;
  controls.update();
  stage.fitted = true;
}

/**
 * Every clip here is authored STEP at 10 fps, which stutters visibly on a 60 Hz
 * display. LINEAR interpolates between keyframes -- SLERP for the bones'
 * quaternion tracks, and a free in-between mesh for the morph-weight tracks.
 */
/**
 * How fast a generated clip plays, everywhere one plays.
 *
 * Most of these are under two seconds -- a wallaby hop is 0.4 -- and at their
 * authored rate they read as a flicker rather than a motion. Half speed gives
 * the eye time to follow the pose through. It is one constant, and every viewer
 * reads it, so no two of them can end up at different tempos.
 */
export const PLAYBACK = 0.5;

export function forceLinearInterp(clip) {
  for (const track of clip.tracks) track.setInterpolation(THREE.InterpolateLinear);
  return clip;
}

/** Play a GLB's first clip on a model, registering the mixer with the stage. */
export function playClip(stage, gltf, root) {
  if (!gltf.animations || !gltf.animations.length) return null;
  const mixer = new THREE.AnimationMixer(root);
  // On the mixer rather than the action: `mixer.time` is scaled with it, so
  // callers that read the clock back off the mixer still get clip time.
  mixer.timeScale = PLAYBACK;
  mixer.clipAction(forceLinearInterp(gltf.animations[0])).play();
  mixer.update(0);
  stage.mixers.push(mixer);
  return mixer;
}

/**
 * The blob exports give every bone its own material, coloured by a ramp over the
 * bone index that is identical across species. Lift them out of shadow without
 * changing the hue, since that hue *is* the semantic label.
 */
export function styleBlob(root, { emissive = 0.55, highlight = null, near = null,
                                  highlightColor = 0xff2e93, nearColor = 0xff6fb5,
                                  dimColor = 0x9a9a9a, hide = null } = {}) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const picked = highlight ? new Set(highlight) : null;
  const nearSet = near ? new Set(near) : null;
  const hidden = hide ? new Set(hide) : null;
  meshes.forEach((m, k) => {
    m.material = m.material.clone();
    if (hidden?.has(k)) { m.visible = false; return; }
    if (picked) {
      // When a handful of slots are the story -- the pinned feet, the leg group
      // -- the index ramp is noise. Body goes to one flat grey, the way the
      // authors' scene_2 prototype does it, so the highlight reads as the message.
      const on = picked.has(k);
      const col = new THREE.Color(on ? (nearSet?.has(k) ? nearColor : highlightColor) : dimColor);
      m.material.color = col;
      m.material.emissive = col.clone();
      m.material.emissiveIntensity = on ? 1.0 : 0.35;
      m.material.roughness = on ? 0.5 : 0.65;
      m.material.metalness = 0;
    } else if (m.material.emissive) {
      m.material.emissive = new THREE.Color().copy(m.material.color);
      m.material.emissiveIntensity = emissive;
    }
  });
  return meshes;
}

/** Textured meshes ship dark albedo and no normals; self-illuminate a little. */
export function styleMesh(root, { emissive = 0.3, brighten = 1, plain = false } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if (plain) {
      // The untextured exports carry a COLOR_0 ramp that is identical on ground
      // truth and prediction -- it encodes nothing about the comparison, and
      // being near-black it hides the silhouette. Drop it for clay grey.
      o.material.vertexColors = false;
      o.material.color = new THREE.Color(0xc9ccd2);
      o.material.roughness = 0.85;
      o.material.metalness = 0;
    } else {
      if (brighten !== 1) o.material.color.multiplyScalar(brighten);
      if (o.material.map && !o.material.emissiveMap) {
        o.material.emissiveMap = o.material.map;
        o.material.emissive = new THREE.Color(0xffffff);
        o.material.emissiveIntensity = emissive;
      }
    }
    o.material.needsUpdate = true;
  });
}

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

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc4d2e0, 0.45);
    fill.position.set(-3, 2.5, -2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.35);
    rim.position.set(0, 2, -5);
    scene.add(rim);

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
export function groundModel(root, { rotateY = 0, profile = true } = {}) {
  root.rotation.y = rotateY * Math.PI / 180;
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);

  // Animals are exported nose-along-Z, so a front-facing camera would look
  // straight down the body. Turn whichever horizontal axis is longer to face
  // across the screen, and every species reads as a profile without a
  // per-file camera angle.
  let applied = rotateY;
  if (profile && (box.max.z - box.min.z) > (box.max.x - box.min.x)) {
    applied += 90;
    root.rotation.y = applied * Math.PI / 180;
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
  }

  const c = box.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= box.min.y;
  // Callers showing several representations of one animal reuse this so the
  // auto-orientation can't decide differently for two near-identical meshes.
  return applied;
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
    const b = new THREE.Box3().setFromObject(r);
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
export function fitCamera(stage, roots, { padding = 1.25, keepDirection = true } = {}) {
  const { camera, controls } = stage;
  if (!camera || !roots.length) return;
  const box = new THREE.Box3();
  for (const r of roots) {
    r.updateMatrixWorld(true);
    box.expandByObject(r);
  }
  if (box.isEmpty()) return;
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const vFov = camera.fov * Math.PI / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dist = Math.max(
    (size.y / 2) / Math.tan(vFov / 2),
    (size.x / 2) / Math.tan(hFov / 2),
    (size.z / 2) / Math.tan(hFov / 2),
  ) * padding;

  const dir = keepDirection && stage.fitted
    ? camera.position.clone().sub(controls.target).normalize()
    : new THREE.Vector3(0.22, 0.14, 1).normalize();
  camera.position.copy(centre).addScaledVector(dir, dist);
  controls.target.copy(centre);
  controls.minDistance = dist * 0.35;
  controls.maxDistance = dist * 3;
  controls.update();
  stage.fitted = true;
}

/** Play a GLB's first clip on a model, registering the mixer with the stage. */
export function playClip(stage, gltf, root) {
  if (!gltf.animations || !gltf.animations.length) return null;
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(gltf.animations[0]).play();
  mixer.update(0);
  stage.mixers.push(mixer);
  return mixer;
}

/**
 * The blob exports give every bone its own material, coloured by a ramp over the
 * bone index that is identical across species. Lift them out of shadow without
 * changing the hue, since that hue *is* the semantic label.
 */
export function styleBlob(root, { emissive = 0.55 } = {}) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    m.material = m.material.clone();
    if (m.material.emissive) {
      m.material.emissive = new THREE.Color().copy(m.material.color);
      m.material.emissiveIntensity = emissive;
    }
  }
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

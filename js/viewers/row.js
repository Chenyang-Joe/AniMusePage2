import * as THREE from 'three';
import { createStage, loadGLB, groundModel, alignBlobToMesh, restBox, facingTurn, playClip, styleBlob, styleMesh, observeResize } from './stage.js';

/**
 * Several representations of one animal, side by side, each in its own viewport.
 *
 * The columns are separate viewports rather than models spaced along X, because
 * a shared pivot at the centre of a row swings the outer columns through the
 * frame as soon as you drag. Here every column gets its own camera aimed at its
 * own model, and all of them copy one OrbitControls' offset -- so each animal
 * turns about itself while the whole row stays locked to the same angle,
 * distance and ground line.
 */
export function initRow(host, samples, opts = {}) {
  const { columns, fov = 30, padding = 1.18 } = opts;

  const canvasHost = host.querySelector('.viewer-canvas');
  const chipRow = host.querySelector('.viewer-chips');
  const captionEl = host.querySelector('.viewer-caption');
  const labelRow = host.querySelector('.viewer-labels');

  const N = columns.length;
  let roots = [];
  let cams = [];
  let centres = [];
  let dist = 3;
  let loadToken = 0;

  if (labelRow) {
    labelRow.innerHTML = columns.map((c) => `<span>${c.label}</span>`).join('');
    labelRow.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
  }
  canvasHost.style.setProperty('--cols', N);

  const stage = createStage(canvasHost, {
    fov,
    onReady: (s) => {
      s.scene.background = null;
      s.renderer.setClearColor(0xffffff, 1);
      // The controls drive a camera nobody renders with; the columns just copy
      // its offset from the origin.
      s.controls.target.set(0, 0, 0);
      s.camera.position.set(0, 0, 1);
      s.onFrame = render;
      select(0);
    },
  });
  observeResize(canvasHost);

  function frameColumns() {
    const w = canvasHost.clientWidth;
    const h = canvasHost.clientHeight;
    if (!w || !h || !roots.length) return;
    const colW = w / N;
    const aspect = colW / h;

    // One distance for every column, from the largest model, so the comparison
    // is at a single scale rather than each animal filling its own box.
    const vFov = fov * Math.PI / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    let groundY = 0;
    dist = 0;
    for (const r of roots) {
      r.updateMatrixWorld(true);
      const size = restBox(r).getSize(new THREE.Vector3());
      groundY = Math.max(groundY, size.y / 2);
      dist = Math.max(dist,
        (size.y / 2) / Math.tan(vFov / 2),
        (size.x / 2) / Math.tan(hFov / 2),
        (size.z / 2) / Math.tan(hFov / 2));
    }
    // The rest box does not cover the swing of the animation, so the padding
    // has to leave room for it rather than hugging the first frame.
    dist *= padding;

    // A single eye height across the columns keeps the ground line level even
    // though the bone cloud is taller than the surface it wraps.
    centres = roots.map(() => new THREE.Vector3(0, groundY, 0));
    cams = roots.map((_, i) => {
      const c = cams[i] || new THREE.PerspectiveCamera(fov, 1, 0.02, 100);
      c.aspect = aspect;
      c.updateProjectionMatrix();
      return c;
    });
    stage.controls.minDistance = 0.35;
    stage.controls.maxDistance = 3;
    stage.camera.position.setLength(1);
    stage.controls.update();
  }

  function render() {
    const r = stage.renderer;
    const w = canvasHost.clientWidth;
    const h = canvasHost.clientHeight;
    if (!w || !h || !roots.length) { r.clear(); return; }
    const colW = w / N;

    // OrbitControls works on a unit sphere; scale its direction by our distance.
    const dir = stage.camera.position.clone().sub(stage.controls.target).normalize();
    r.setScissorTest(true);
    for (let i = 0; i < roots.length; i++) {
      const cam = cams[i];
      cam.position.copy(centres[i]).addScaledVector(dir, dist);
      cam.lookAt(centres[i]);
      roots.forEach((rt, k) => { rt.visible = k === i; });
      const x = Math.round(i * colW);
      const nx = Math.round((i + 1) * colW);
      r.setViewport(x, 0, nx - x, h);
      r.setScissor(x, 0, nx - x, h);
      r.clear();
      r.render(stage.scene, cam);
    }
    r.setScissorTest(false);
    roots.forEach((rt) => { rt.visible = true; });
  }

  async function select(i) {
    const token = ++loadToken;
    const sample = samples[i];
    for (const el of chipRow.children) el.classList.toggle('on', +el.dataset.i === i);
    host.classList.add('is-loading');

    const gltfs = await Promise.all(columns.map((c) => loadGLB(sample[c.key])));
    if (token !== loadToken) return;

    stage.scene.remove(...roots);
    roots = [];
    cams = [];
    stage.mixers.length = 0;

    roots = gltfs.map((g, k) => {
      const col = columns[k];
      const root = g.scene.clone(true);
      if (col.kind === 'blob') styleBlob(root, col.blob);
      else styleMesh(root);
      stage.scene.add(root);
      // Bone nodes carry no default transform, so measure only after frame 0.
      playClip(stage, g, root);
      return root;
    });

    // Bones and surface are exported at different scales, so without this the
    // bone column would sit visibly smaller than the mesh beside it. Only the
    // scale carries over -- each column is centred in its own viewport, so the
    // translation the fit also produces is irrelevant here.
    const refIndex = columns.findIndex((c) => c.kind !== 'blob');
    if (refIndex >= 0) {
      columns.forEach((c, k) => {
        if (c.kind === 'blob') alignBlobToMesh(roots[k], roots[refIndex], c.align || {});
      });
    }

    // Every column is the same animal in a different representation, so they all
    // take one orientation: the angle picked by hand plus the measured side-on
    // turn, read off a mesh column rather than the bones -- the bones are the
    // same shape but the mesh is what the reader is judging.
    const ref = refIndex >= 0 ? refIndex : 0;
    const turn = (sample.rotateY || 0) + facingTurn(roots[ref], gltfs[ref].animations?.[0]);
    roots.forEach((root) => groundModel(root, { rotateY: turn, profile: false }));

    frameColumns();
    stage.onResize = frameColumns;
    if (captionEl) captionEl.textContent = sample.caption || sample.prompt || '';
    host.classList.remove('is-loading');
  }

  samples.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.i = i;
    b.textContent = s.label || s.short || `Sample ${i + 1}`;
    b.addEventListener('click', () => { stage.mountNow(); select(i); });
    chipRow.appendChild(b);
  });

  return stage;
}

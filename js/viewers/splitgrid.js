import * as THREE from 'three';
import { createStage, loadGLB, alignBlobToMesh, restBox, fitCamera,
         styleBlob, styleMesh, forceLinearInterp, observeResize } from './stage.js';

/**
 * A wall of animals under one divider.
 *
 * The same bones-versus-surface split as the hero viewer, applied to a whole grid
 * at once: one vertical cut across the canvas, bones drawn to its left, the
 * surface they drive to its right. Dragging it pulls the wall from one
 * representation to the other, with a couple of animals caught mid-cut at any
 * moment -- which reads as scale in a way that one animal cannot.
 */
const COLS = 4;
const SPACING_X = 1.02;
const SPACING_Y = 0.92;
const CELL_SPAN = 0.92;
const TRUNC_DUR = 4.0;   // one shared clock so the wall moves together

export function initSplitGrid(host, samples, opts = {}) {
  const { startFraction = 0.5, cols = COLS } = opts;

  const canvasHost = host.querySelector('.viewer-canvas');
  const divider = host.querySelector('.split-divider');
  const labelL = host.querySelector('.split-label-left');
  const labelR = host.querySelector('.split-label-right');
  const labelGrid = host.querySelector('.grid-labels');
  if (labelL) labelL.textContent = opts.leftLabel || 'Semantic Gaussian Bones';
  if (labelR) labelR.textContent = opts.rightLabel || 'Skinned mesh';

  const rows = Math.ceil(samples.length / cols);
  const cells = [];
  let fraction = startFraction;

  // Labels are placed from the projected cell centres rather than by a CSS grid:
  // the camera fit leaves margins the grid knows nothing about, so a matching
  // CSS grid drifts away from the cells it is naming.
  if (labelGrid) {
    labelGrid.classList.add('projected');
    labelGrid.innerHTML = samples.map((s) =>
      `<span>${s.label}${s.action ? `<em>${s.action}</em>` : ''}</span>`).join('');
  }

  const stage = createStage(canvasHost, {
    fov: 32,
    onReady: async (s) => {
      s.scene.background = null;
      s.renderer.setClearColor(0xffffff, 1);

      const loaded = await Promise.all(samples.map(async (sample) => ({
        sample,
        blobGltf: await loadGLB(sample.blob),
        meshGltf: await loadGLB(sample.mesh),
      })));

      loaded.forEach(({ sample, blobGltf, meshGltf }, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, samples.length - row * cols);

        const blobRoot = blobGltf.scene.clone(true);
        const meshRoot = meshGltf.scene.clone(true);
        styleBlob(blobRoot);
        styleMesh(meshRoot);

        const blobMixer = new THREE.AnimationMixer(blobRoot);
        const meshMixer = new THREE.AnimationMixer(meshRoot);
        if (blobGltf.animations?.length) blobMixer.clipAction(forceLinearInterp(blobGltf.animations[0])).play();
        if (meshGltf.animations?.length) meshMixer.clipAction(forceLinearInterp(meshGltf.animations[0])).play();
        // Bone nodes are animation tracks only; nothing can be measured until
        // the clip has been evaluated once.
        blobMixer.setTime(0);
        meshMixer.setTime(0);

        // `centre` holds the offset, `inner` the orientation: rotating the group
        // that also carries the centring offset would swing the cell off its slot.
        const centre = new THREE.Group();
        centre.add(meshRoot, blobRoot);
        alignBlobToMesh(blobRoot, meshRoot);
        centre.updateMatrixWorld(true);
        centre.position.sub(restBox(centre).getCenter(new THREE.Vector3()));

        const inner = new THREE.Group();
        inner.add(centre);
        if (sample.rotateY) inner.rotation.y = sample.rotateY * Math.PI / 180;

        const pivot = new THREE.Group();
        pivot.add(inner);
        pivot.position.set(
          (col - (inRow - 1) / 2) * SPACING_X,
          ((rows - 1) / 2 - row) * SPACING_Y,
          0,
        );
        s.scene.add(pivot);

        // Lay the animal across the screen, centre it in its cell, and put every
        // species at the same on-screen size.
        pivot.updateMatrixWorld(true);
        let size = restBox(meshRoot).getSize(new THREE.Vector3());
        if (size.z > size.x) {
          inner.rotation.y += Math.PI / 2;
          pivot.updateMatrixWorld(true);
          size = restBox(meshRoot).getSize(new THREE.Vector3());
        }
        // Size on the box the mesh sweeps over the *whole clip*, not its rest
        // pose -- three.js already keeps that envelope on a morph-target
        // geometry. A sprawling animal like a bonobo is compact at rest and
        // enormous mid-stride, and normalising the rest pose leaves it towering
        // over the others once everything is moving. Diagonal rather than
        // longest side, for the same reason.
        const swept = new THREE.Box3().setFromObject(meshRoot).getSize(new THREE.Vector3());
        pivot.scale.setScalar(CELL_SPAN / Math.max(Math.hypot(swept.x, swept.y), 1e-4));

        cells.push({ blobRoot, meshRoot, blobMixer, meshMixer, pivot });
      });

      const pivots = s.scene.children.filter((o) => !o.isLight);
      // Straight on: an angled view skews the rows, and the labels are placed by
      // projection, so they would drift row by row.
      const frame = () => { fitCamera(s, pivots, { padding: 1.04, dir: [0, 0, 1] }); placeLabels(); };
      frame();
      s.onResize = frame;
      s.onFrame = render;
      host.classList.remove('is-loading');
    },
  });
  observeResize(canvasHost);

  /** Put each label under the cell it names, in projected screen coordinates. */
  function placeLabels() {
    if (!labelGrid || !stage.camera) return;
    const v = new THREE.Vector3();
    [...labelGrid.children].forEach((el, i) => {
      const cell = cells[i];
      if (!cell) return;
      cell.pivot.updateMatrixWorld(true);
      v.setFromMatrixPosition(cell.pivot.matrixWorld);
      v.y -= CELL_SPAN * 0.42;
      v.project(stage.camera);
      el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
      el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
    });
  }

  function render() {
    const r = stage.renderer;
    const w = canvasHost.clientWidth;
    const h = canvasHost.clientHeight;
    if (!w || !h || !cells.length) { r.clear(); return; }

    const t = stage.clock.getElapsedTime() % TRUNC_DUR;
    for (const c of cells) { c.blobMixer.setTime(t); c.meshMixer.setTime(t); }

    const x = Math.round(w * fraction);
    r.setViewport(0, 0, w, h);
    r.setScissorTest(true);

    for (const c of cells) { c.blobRoot.visible = true; c.meshRoot.visible = false; }
    r.setScissor(0, 0, x, h);
    r.clear();
    r.render(stage.scene, stage.camera);

    for (const c of cells) { c.blobRoot.visible = false; c.meshRoot.visible = true; }
    r.setScissor(x, 0, w - x, h);
    r.clear();
    r.render(stage.scene, stage.camera);

    r.setScissorTest(false);
  }

  function setFraction(f) {
    fraction = Math.max(0.02, Math.min(0.98, f));
    divider.style.left = `${fraction * 100}%`;
    if (labelL) labelL.style.opacity = fraction < 0.14 ? 0 : 1;
    if (labelR) labelR.style.opacity = fraction > 0.86 ? 0 : 1;
  }

  let dragging = false;
  const toFraction = (e) => {
    const r = canvasHost.getBoundingClientRect();
    return (e.clientX - r.left) / r.width;
  };
  divider.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    dragging = true;
    divider.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  divider.addEventListener('pointermove', (e) => { if (dragging) setFraction(toFraction(e)); });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    if (divider.hasPointerCapture(e.pointerId)) divider.releasePointerCapture(e.pointerId);
  };
  divider.addEventListener('pointerup', endDrag);
  divider.addEventListener('pointercancel', endDrag);
  divider.addEventListener('lostpointercapture', () => { dragging = false; });
  divider.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowLeft') { setFraction(fraction - step); e.preventDefault(); }
    if (e.key === 'ArrowRight') { setFraction(fraction + step); e.preventDefault(); }
  });

  setFraction(startFraction);
  return stage;
}

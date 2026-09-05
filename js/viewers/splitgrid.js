import * as THREE from 'three';
import { createStage, loadGLB, alignBlobToMesh, restBox, fitCamera, facingTurn,
         poseFrames, styleBlob, styleMesh, forceLinearInterp, observeResize } from './stage.js';

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
const MAX_LOOP = 8.0;    // seconds; longer clips are sped up to fit

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

        // Four nested groups, because four things have to happen without
        // arguing: `centre` registers the two representations on each other,
        // `inner` turns the animal side-on, `drift` puts it on a treadmill, and
        // `pivot` places and sizes the cell. Rotating the group that also
        // carries an offset would swing the cell off its slot.
        const centre = new THREE.Group();
        centre.add(meshRoot, blobRoot);
        alignBlobToMesh(blobRoot, meshRoot);
        centre.updateMatrixWorld(true);
        centre.position.sub(restBox(centre).getCenter(new THREE.Vector3()));

        const inner = new THREE.Group();
        inner.add(centre);
        // Same rule as the hero viewer: curated flip plus a measured side-on turn.
        inner.rotation.y = ((sample.rotateY || 0) + facingTurn(meshRoot, meshGltf.animations?.[0])) * Math.PI / 180;

        const drift = new THREE.Group();
        drift.add(inner);

        const pivot = new THREE.Group();
        pivot.add(drift);
        pivot.position.set(
          (col - (inRow - 1) / 2) * SPACING_X,
          ((rows - 1) / 2 - row) * SPACING_Y,
          0,
        );
        s.scene.add(pivot);

        // Now that the cell is oriented, measure the clip. `poseFrames` reports
        // the animal with its horizontal travel taken out, which is how the wall
        // shows it -- eight cells this tight cannot have a swimming otter cross
        // into the badger's. The rest pose would leave a sprawling animal
        // towering over the others the moment it moves, and the swept envelope
        // would shrink exactly the ones that travel; this is neither. Diagonal
        // rather than longest side, so a tall animal and a long one read as the
        // same weight.
        pivot.updateMatrixWorld(true);
        const pose = poseFrames(meshRoot, meshGltf.animations?.[0]);
        pivot.scale.setScalar(CELL_SPAN / Math.max(Math.hypot(pose.size.x, pose.size.y), 1e-4));
        // Measured before the scale was applied, so this is in pivot's own units.
        const home = pivot.position.clone().sub(pose.center);
        drift.position.copy(home);

        // Clips here run from one to twenty-five seconds. Truncating them all to
        // the shortest would freeze most of the wall, so each loops on its own
        // length instead, sped up enough that no loop outstays its welcome.
        const dur = meshGltf.animations?.[0]?.duration || blobGltf.animations?.[0]?.duration || 1;
        cells.push({ blobRoot, meshRoot, blobMixer, meshMixer, pivot, drift, pose, home,
                     dur, speed: Math.max(1, dur / MAX_LOOP) });
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

    const t = stage.clock.getElapsedTime();
    for (const c of cells) {
      const local = (t * c.speed) % c.dur;
      c.blobMixer.setTime(local);
      c.meshMixer.setTime(local);
      // Subtract this frame's travel, so the animal runs where it is standing.
      c.drift.position.copy(c.home).sub(c.pose.travelAt(local / c.dur));
    }

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

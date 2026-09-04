import * as THREE from 'three';
import { createStage, loadGLB, fitCamera, restBox, styleBlob, styleMesh, forceLinearInterp, observeResize } from './stage.js';

/**
 * Every species at once, on one clock — the inpainting viewer.
 *
 * Modelled on the authors' scene_2 prototype. Showing the animals one at a time
 * behind a chip row hides the actual claim: the *same* four bone slots are pinned
 * to the *same* cadence on all six, and their bodies each solve it differently.
 * Six cells side by side, driven by `setTime` off a shared clock so they stay in
 * phase, makes that a single glance.
 *
 * Three states, in the order scene_2 reveals them: the constraint alone, then the
 * body the model wrote around it, then the surface.
 */
const TRUNC_DUR = 6.0;       // the shortest clip; longer ones are truncated, not looped
const COLS = 3;
const SPACING_X = 0.95;
const SPACING_Y = 0.7;
const CELL_SPAN = 0.8;       // every cell normalised to this width

// Foot slots, split left/right. Near-side feet take the lighter tint so the
// four markers read as two pairs at depth rather than four identical dots.
const NEAR_FEET = [76, 4];   // left front, left rear
// Slot 87 pops between frames badly enough to distract; scene_2 hides it too.
const GLITCHY = [87];

export function initGrid(host, samples, pinned, opts = {}) {
  const { scale = 0.85 } = opts;
  const canvasHost = host.querySelector('.viewer-canvas');
  const labelGrid = host.querySelector('.grid-labels');
  const modeButtons = host.querySelectorAll('.seg button');

  const cells = [];
  let mode = 'bones';

  if (labelGrid) {
    labelGrid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    labelGrid.style.gridTemplateRows = `repeat(${Math.ceil(samples.length / COLS)}, 1fr)`;
    labelGrid.innerHTML = samples.map((s) => `<span>${s.label}</span>`).join('');
  }

  const stage = createStage(canvasHost, {
    fov: 35,
    onReady: async (s) => {
      const rows = Math.ceil(samples.length / COLS);
      const loaded = await Promise.all(samples.map(async (sample) => ({
        sample,
        blobGltf: await loadGLB(sample.blob),
        meshGltf: await loadGLB(sample.mesh),
      })));

      loaded.forEach(({ sample, blobGltf, meshGltf }, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);

        const blobRoot = blobGltf.scene.clone(true);
        const meshRoot = meshGltf.scene.clone(true);
        const bones = styleBlob(blobRoot, {
          highlight: pinned, near: NEAR_FEET, hide: GLITCHY,
        });
        styleMesh(meshRoot);

        const blobMixer = new THREE.AnimationMixer(blobRoot);
        const meshMixer = new THREE.AnimationMixer(meshRoot);
        if (blobGltf.animations?.length) blobMixer.clipAction(forceLinearInterp(blobGltf.animations[0])).play();
        if (meshGltf.animations?.length) meshMixer.clipAction(forceLinearInterp(meshGltf.animations[0])).play();

        // Centre each in its own frame, then hang both off one pivot, so the
        // state switch can never nudge a cell sideways.
        for (const model of [blobRoot, meshRoot]) {
          model.updateMatrixWorld(true);
          model.position.sub(restBox(model).getCenter(new THREE.Vector3()));
        }

        const pivot = new THREE.Group();
        pivot.position.set(
          (col - (COLS - 1) / 2) * SPACING_X,
          ((rows - 1) / 2 - row) * SPACING_Y,
          0,
        );
        pivot.add(blobRoot, meshRoot);
        s.scene.add(pivot);

        // A couple of these clips come out of the exporter standing on end.
        // Lay any cell down whose bones are taller than they are wide, then
        // normalise every cell to one size so the grid reads as a grid.
        pivot.updateMatrixWorld(true);
        let size = restBox(blobRoot).getSize(new THREE.Vector3());
        if (size.y > size.x) {
          pivot.rotation.z = -Math.PI / 2 + (sample.rotateZ || 0) * Math.PI / 180;
          pivot.updateMatrixWorld(true);
          size = restBox(blobRoot).getSize(new THREE.Vector3());
        } else if (sample.rotateZ) {
          pivot.rotation.z = sample.rotateZ * Math.PI / 180;
        }
        const span = Math.max(size.x, size.y, 1e-4);
        pivot.scale.setScalar(scale * (CELL_SPAN / span));

        const pinnedSet = new Set(pinned);
        const glitchy = new Set(GLITCHY);
        cells.push({
          blobRoot, meshRoot, blobMixer, meshMixer,
          feet: bones.filter((_, k) => pinnedSet.has(k)),
          // Hidden slots must stay out of `body`, or the state switch drags
          // them back in the moment it makes the body visible again.
          body: bones.filter((_, k) => !pinnedSet.has(k) && !glitchy.has(k)),
        });
      });

      fitCamera(s, s.scene.children.filter((o) => !o.isLight), { padding: 1.12 });
      s.onResize = () => fitCamera(s, s.scene.children.filter((o) => !o.isLight), { padding: 1.12 });
      s.onFrame = frame;
      setMode('bones');
      host.classList.remove('is-loading');
    },
  });
  observeResize(canvasHost);

  function frame() {
    // Drive by absolute time rather than accumulated deltas: six clips of
    // different native length stay locked to one phase that way.
    const t = stage.clock.getElapsedTime() % TRUNC_DUR;
    for (const c of cells) {
      if (mode === 'mesh') c.meshMixer.setTime(t);
      else c.blobMixer.setTime(t);
    }
    stage.renderer.clear();
    stage.renderer.render(stage.scene, stage.camera);
  }

  function setMode(m) {
    mode = m;
    for (const c of cells) {
      c.blobRoot.visible = m !== 'mesh';
      c.meshRoot.visible = m === 'mesh';
      for (const b of c.body) b.visible = m === 'bones';
    }
    modeButtons.forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  }

  modeButtons.forEach((b) => b.addEventListener('click', () => {
    stage.mountNow();
    setMode(b.dataset.mode);
  }));

  return stage;
}

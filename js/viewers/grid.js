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
    const rowCount = Math.ceil(samples.length / COLS);
    labelGrid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    labelGrid.style.gridTemplateRows = `repeat(${rowCount}, 1fr)`;
    labelGrid.innerHTML = samples.map((s, i) => {
      // A short final row is centred in 3D, so its labels have to shift too.
      const row = Math.floor(i / COLS);
      const inRow = Math.min(COLS, samples.length - row * COLS);
      const offset = i % COLS === 0 && inRow < COLS ? Math.floor((COLS - inRow) / 2) + 1 : 0;
      return `<span${offset ? ` style="grid-column:${offset + 1}"` : ''}>${s.label}</span>`;
    }).join('');
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
        // Centre a final row that doesn't fill the grid.
        const inRow = Math.min(COLS, samples.length - row * COLS);

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
        // Bone nodes carry no default transform, only animation tracks, so
        // nothing below can measure them until the clip has been evaluated once.
        blobMixer.setTime(0);
        meshMixer.setTime(0);

        // Centre each in its own frame, then hang both off one pivot, so the
        // state switch can never nudge a cell sideways.
        for (const model of [blobRoot, meshRoot]) {
          model.updateMatrixWorld(true);
          model.position.sub(restBox(model).getCenter(new THREE.Vector3()));
        }

        // Two nested groups: `inner` takes the automatic orientation, `pivot`
        // takes the cell's position, its scale, and any manual roll -- which is
        // then expressed in screen axes, where it is easy to reason about.
        const inner = new THREE.Group();
        inner.add(blobRoot, meshRoot);
        const pivot = new THREE.Group();
        pivot.position.set(
          (col - (inRow - 1) / 2) * SPACING_X,
          ((rows - 1) / 2 - row) * SPACING_Y,
          0,
        );
        pivot.add(inner);
        s.scene.add(pivot);

        // These clips leave the exporter at arbitrary rolls -- some standing on
        // end, one belly-up -- so orientation is resolved in two steps. First lay
        // the body down, turning its longer horizontal axis across the screen.
        // That leaves two possibilities 180 apart, and the pinned feet decide
        // between them: whichever way puts them below the body is the right way
        // up. No per-animal constant needed.
        const pinnedSet = new Set(pinned);
        const glitchy = new Set(GLITCHY);
        const feetMeshes = bones.filter((_, k) => pinnedSet.has(k));
        const bodyMeshes = bones.filter((_, k) => !pinnedSet.has(k) && !glitchy.has(k));
        const centroidY = (list) => list.reduce(
          (sum, mesh) => sum + mesh.getWorldPosition(new THREE.Vector3()).y, 0) / (list.length || 1);

        pivot.updateMatrixWorld(true);
        let roll = 0;
        const boxSize = () => restBox(blobRoot).getSize(new THREE.Vector3());
        if (boxSize().y > boxSize().x) {
          roll = -Math.PI / 2;
          inner.rotation.z = roll;
          pivot.updateMatrixWorld(true);
        }
        if (feetMeshes.length && bodyMeshes.length && centroidY(feetMeshes) > centroidY(bodyMeshes)) {
          roll += Math.PI;
        }
        inner.rotation.z = roll;
        pivot.updateMatrixWorld(true);

        // Manual roll on top, in screen axes. Needed only when a generated clip
        // leaves the animal on its back: its feet then straddle the body and no
        // in-plane rotation can bring them down.
        pivot.rotation.x = (sample.rotateX || 0) * Math.PI / 180;
        pivot.rotation.z = (sample.rotateZ || 0) * Math.PI / 180;
        pivot.updateMatrixWorld(true);

        const size = restBox(blobRoot).getSize(new THREE.Vector3());
        const span = Math.max(size.x, size.y, 1e-4);
        pivot.scale.setScalar(scale * (CELL_SPAN / span));

        cells.push({
          id: sample.id, label: sample.label, pivot, inner,
          blobRoot, meshRoot, blobMixer, meshMixer,
          feet: bones.filter((_, k) => pinnedSet.has(k)),
          // Hidden slots must stay out of `body`, or the state switch drags
          // them back in the moment it makes the body visible again.
          body: bones.filter((_, k) => !pinnedSet.has(k) && !glitchy.has(k)),
        });
      });

      // Handy for dialling in a stubborn clip from the console:
      //   const c = __animuse.grid.find(c => /panda/i.test(c.id));
      //   c.pivot.rotation.x = THREE.MathUtils.degToRad(90);
      if (typeof window !== 'undefined') window.__animuse.grid = cells;
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

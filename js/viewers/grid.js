import * as THREE from 'three';
import { createStage, loadGLB, alignMeshToBox, fitCamera, restBox, styleBlob, styleMesh,
         forceLinearInterp, observeResize, PLAYBACK } from './stage.js';

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
const SPACING_Y = 1.02;   // row pitch, with room under each cell for its label
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

  // Placed from the projected cell centres rather than by a CSS grid: the camera
  // fit leaves margins the grid knows nothing about, so a matching grid drifts
  // away from the cells it is naming -- and a short final row, centred in 3D,
  // has nothing to match at all.
  if (labelGrid) {
    labelGrid.classList.add('projected');
    labelGrid.innerHTML = samples.map((s) => `<span>${s.label}</span>`).join('');
  }

  const stage = createStage(canvasHost, {
    fov: 35,
    onReady: async (s) => {
      const rows = Math.ceil(samples.length / COLS);
      // Bones only, to begin with. The surfaces are the heavy half of this
      // group -- six exports of per-frame geometry, more than the rest of the
      // page put together -- and nothing shows them until the reader asks for
      // the third state. Fetching them here made every reader pay for the third
      // state, and made the viewer below this one wait its turn.
      const loaded = await Promise.all(samples.map(async (sample) => ({
        sample,
        blobGltf: await loadGLB(sample.blob),
      })));

      loaded.forEach(({ sample, blobGltf }, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        // Centre a final row that doesn't fill the grid.
        const inRow = Math.min(COLS, samples.length - row * COLS);

        const blobRoot = blobGltf.scene.clone(true);
        const bones = styleBlob(blobRoot, {
          highlight: pinned, near: NEAR_FEET, hide: GLITCHY,
        });

        const blobMixer = new THREE.AnimationMixer(blobRoot);
        if (blobGltf.animations?.length) blobMixer.clipAction(forceLinearInterp(blobGltf.animations[0])).play();
        // Bone nodes carry no default transform, only animation tracks, so
        // nothing below can measure them until the clip has been evaluated once.
        blobMixer.setTime(0);

        // Three nested groups, because centring and rotating must not share one:
        // `centre` carries the offset that puts the cell's middle on the origin,
        // `inner` the automatic orientation (which then turns about that middle),
        // `pivot` the cell's position, its scale, and any manual roll -- expressed
        // in screen axes, where it is easy to reason about. The surface, when it
        // arrives, is registered onto the bones inside `centre`, so none of this
        // has to be redone and nothing on screen moves.
        const centre = new THREE.Group();
        centre.add(blobRoot);
        centre.updateMatrixWorld(true);
        // Measured here, while `centre` is still unparented and sitting at the
        // origin, so the box is in the frame a late-arriving surface's own
        // transform will live in.
        const blobBox = new THREE.Box3().setFromObject(blobRoot);
        centre.position.sub(restBox(centre).getCenter(new THREE.Vector3()));

        const inner = new THREE.Group();
        inner.add(centre);
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
          id: sample.id, label: sample.label, pivot, inner, centre, blobBox,
          mesh: sample.mesh, blobRoot, blobMixer, meshRoot: null, meshMixer: null,
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
      // Straight on, like the wall: the default three-quarter view projects a
      // regular grid into an irregular one, and the labels are placed by
      // projection, so they would drift row by row.
      const frameAll = () => {
        fitCamera(s, s.scene.children.filter((o) => !o.isLight),
                  { padding: 1.12, dir: [0, 0, 1] });
        placeLabels();
      };
      frameAll();
      s.onResize = frameAll;
      s.onFrame = frame;
      setMode('bones');
      host.classList.remove('is-loading');
      const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2000));
      idle(() => loadMeshes(), { timeout: 6000 });
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
      v.y -= SPACING_Y * 0.42;   // just below the cell, clear of the row beneath
      v.project(stage.camera);
      el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
      el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
    });
  }

  function frame() {
    // Drive by absolute time rather than accumulated deltas: six clips of
    // different native length stay locked to one phase that way.
    const t = (stage.clock.getElapsedTime() * PLAYBACK) % TRUNC_DUR;
    for (const c of cells) {
      if (mode === 'mesh' && c.meshMixer) c.meshMixer.setTime(t);
      else c.blobMixer.setTime(t);
    }
    stage.renderer.clear();
    stage.renderer.render(stage.scene, stage.camera);
  }

  function setMode(m) {
    mode = m;
    if (m === 'mesh') loadMeshes();
    for (const c of cells) {
      // Until the surfaces arrive, the bones stand in for them -- the reader
      // sees the cadence they asked for either way, rather than six empty cells.
      const surfaced = m === 'mesh' && c.meshRoot;
      c.blobRoot.visible = !surfaced;
      if (c.meshRoot) c.meshRoot.visible = surfaced;
      for (const b of c.body) b.visible = m === 'bones';
    }
    modeButtons.forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  }

  /**
   * Fetch and register the surfaces. Called once, either when the reader asks
   * for them or when the page has gone quiet -- whichever comes first, so the
   * switch is usually instant without anything else having queued behind it.
   */
  let meshesStarted = false;
  function loadMeshes() {
    if (meshesStarted || !cells.length) return;
    meshesStarted = true;
    cells.forEach((c) => loadGLB(c.mesh).then((gltf) => {
      const root = gltf.scene.clone(true);
      styleMesh(root);
      const mixer = new THREE.AnimationMixer(root);
      if (gltf.animations?.length) mixer.clipAction(forceLinearInterp(gltf.animations[0])).play();
      mixer.setTime(0);
      alignMeshToBox(root, c.blobBox);
      c.centre.add(root);
      c.meshRoot = root;
      c.meshMixer = mixer;
      root.visible = mode === 'mesh';
      if (mode === 'mesh') c.blobRoot.visible = false;
    }).catch(() => { /* the bones keep standing in */ }));
  }

  modeButtons.forEach((b) => b.addEventListener('click', () => {
    stage.mountNow();
    setMode(b.dataset.mode);
  }));

  return stage;
}

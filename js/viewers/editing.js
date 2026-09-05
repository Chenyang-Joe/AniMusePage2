import * as THREE from 'three';
import { createStage, loadGLB, alignBlobToMesh, restBox, fitCamera, styleBlob, styleMesh, observeResize } from './stage.js';

// The orientation and the shift axis come from references/repos/scene_1/main.js,
// which was tuned by eye against these exact three exports. The layout does not:
// a row of pairs, each grounded on its own bones, came out ragged, so this is a
// plain 2x3 grid -- three columns on a common pitch, two rows, every cell
// centred on the same size.
const SHIFT_DIR_WORLD = new THREE.Vector3(1, 0, -1).normalize();
const MAX_SHIFT = 0.05;   // must match MAX_LEG_SHIFT in the morph bake
const SPACING = 0.95;     // column pitch
const ROW = 0.82;         // distance between the surface row and the bone row
const CELL = 0.60;        // every species drawn at this on-screen size
const LEG_COLOR = 0xff2e93;

/**
 * Part-level editing: one slider drags a named group of bone slots.
 *
 * No skinning runs in the browser. The bones move because we translate their
 * nodes directly; the surface follows because the export carries a single morph
 * target baked from the LBS solve at the slider's positive extreme, and three.js
 * accepts negative morph weights, so one target covers the full sweep. The bones
 * sit directly under the surface they drive, so the handle and its effect are
 * visible in the same glance.
 */
export function initEditing(host, samples, legBones) {
  const canvasHost = host.querySelector('.viewer-canvas');
  const slider = host.querySelector('.edit-slider');

  const animals = [];

  const stage = createStage(canvasHost, {
    fov: 32,
    onReady: async (s) => {
      const span = (samples.length - 1) * SPACING;

      const loaded = await Promise.all(samples.map(async (sample) => ({
        sample,
        blobGltf: await loadGLB(sample.blob),
        meshGltf: await loadGLB(sample.mesh),
      })));

      loaded.forEach(({ sample, blobGltf, meshGltf }, i) => {
        const rot = sample.rotateY || 0;
        const x = -span / 2 + i * SPACING;

        const blobRoot = blobGltf.scene.clone(true);
        // Freeze the bones at their rest frame; the slider, not the clip, is
        // what should be moving them here.
        if (blobGltf.animations?.length) {
          const m = new THREE.AnimationMixer(blobRoot);
          m.clipAction(blobGltf.animations[0]).play();
          m.update(0);
        }
        // Same treatment as the inpainting viewer: the slots under control are
        // the subject, everything else is context.
        const blobMeshes = styleBlob(blobRoot, { highlight: legBones, highlightColor: LEG_COLOR });

        const meshRoot = meshGltf.scene.clone(true);
        styleMesh(meshRoot, { brighten: /bear/i.test(sample.id) ? 1.8 : 1 });
        let morphMesh = null;
        meshRoot.traverse((o) => {
          if (o.isMesh && o.morphTargetInfluences?.length) morphMesh = o;
        });

        // Register the bones onto the surface while the two are still one
        // object -- that is where the scale relation between them is decided --
        // and only then split them into their two rows. Each cell nests
        // position outside rotation, so centring and turning cannot fight.
        const holder = new THREE.Group();
        holder.add(meshRoot, blobRoot);
        alignBlobToMesh(blobRoot, meshRoot);
        holder.updateMatrixWorld(true);

        const cell = (root, y) => {
          const inner = new THREE.Group();
          inner.rotation.y = rot * Math.PI / 180;
          inner.add(root);
          const centre = new THREE.Group();
          centre.add(inner);
          const g = new THREE.Group();
          g.add(centre);
          g.position.set(x, y, 0);
          s.scene.add(g);
          g.updateMatrixWorld(true);
          centre.position.sub(restBox(root).getCenter(new THREE.Vector3()).sub(g.position));
          return g;
        };
        const top = cell(meshRoot, ROW / 2);
        const bottom = cell(blobRoot, -ROW / 2);

        // One scale for the pair, measured on the surface, so the bones stay
        // the size the surface says they are.
        top.updateMatrixWorld(true);
        const size = restBox(meshRoot).getSize(new THREE.Vector3());
        const k = CELL / Math.max(Math.hypot(size.x, size.y), 1e-4);
        top.scale.setScalar(k);
        bottom.scale.setScalar(k);

        // The shift is authored in world space so all three animals sweep the
        // same way; rotate it into each model's own frame to undo their
        // per-file rotation.
        const dir = SHIFT_DIR_WORLD.clone()
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), -rot * Math.PI / 180);
        const legs = legBones.map((k) => blobMeshes[k]).filter(Boolean);
        const ys = legs.map((m) => m.position.y);
        const yMin = Math.min(...ys), yMax = Math.max(...ys);
        const range = (yMax - yMin) || 1;

        animals.push({
          blobRoot, meshRoot, morphMesh, dir, legs,
          originX: legs.map((m) => m.position.x),
          originZ: legs.map((m) => m.position.z),
          // Bones lower down the leg travel further, so the limb swings instead
          // of sliding rigidly.
          falloff: ys.map((y) => (yMax - y) / range),
        });
      });

      // Straight on. The default three-quarter view projects cells at different
      // x to slightly different heights, which is invisible on one animal and
      // reads as a crooked row on six.
      const cells = s.scene.children.filter((o) => !o.isLight);
      const fit = { padding: 1.12, dir: [0, 0, 1] };
      fitCamera(s, cells, fit);
      s.onResize = () => fitCamera(s, cells, fit);
      host.classList.remove('is-loading');
      apply(+slider.value);
    },
  });
  observeResize(canvasHost);

  function apply(raw) {
    const t = raw / 100;
    for (const a of animals) {
      for (let i = 0; i < a.legs.length; i++) {
        const d = t * MAX_SHIFT * a.falloff[i];
        a.legs[i].position.x = a.originX[i] + d * a.dir.x;
        a.legs[i].position.z = a.originZ[i] + d * a.dir.z;
      }
      if (a.morphMesh) a.morphMesh.morphTargetInfluences[0] = t;
    }
  }

  slider.addEventListener('input', () => apply(+slider.value));

  return stage;
}

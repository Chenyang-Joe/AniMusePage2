import * as THREE from 'three';
import { createStage, loadGLB, pairModels, fitCamera, styleBlob, styleMesh, observeResize } from './stage.js';

// Framing constants copied from references/repos/scene_1/main.js. That prototype
// was tuned by eye against these exact three exports, so the orientation, the
// spacing and the shift axis come from there rather than from a bounding box.
const SHIFT_DIR_WORLD = new THREE.Vector3(1, 0, -1).normalize();
const MAX_SHIFT = 0.05;   // must match MAX_LEG_SHIFT in the morph bake
const SPACING = 1.2;
const LIFT = 0.25;
const LEG_COLOR = 0xff2e93;
const TARGET_SPAN = 0.6;     // every species drawn at the same on-screen size

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
        const x = -span / 2 + i * SPACING + (sample.nudgeX || 0);

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

        // Register and ground as one object, so toggling Bones/Mesh doesn't
        // shift or resize anything.
        const { pair } = pairModels(meshRoot, blobRoot,
          { rotateY: rot, profile: false, scaleTo: TARGET_SPAN, stack: 0.18 });
        pair.position.x += x;
        pair.position.y += LIFT;
        s.scene.add(pair);
      
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

      const pairs = s.scene.children.filter((o) => !o.isLight);
      fitCamera(s, pairs, { padding: 1.3 });
      s.onResize = () => fitCamera(s, pairs, { padding: 1.3 });
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

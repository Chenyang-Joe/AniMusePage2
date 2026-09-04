import * as THREE from 'three';
import { createStage, loadGLB, groundModel, layoutRow, fitCamera, styleBlob, styleMesh, observeResize } from './stage.js';

// The left front leg, as 12 SGB slots. Straight from the authors' own scene_1
// prototype -- these indices are properties of the shared query book, so they
// name the same leg on every animal in the row.
const SHIFT_DIR_WORLD = new THREE.Vector3(1, 0, -1).normalize();
const MAX_SHIFT = 0.05;      // must match MAX_LEG_SHIFT in the morph bake
const LEG_COLOR = 0xff4466;

/**
 * Part-level editing: one slider drags a named group of bone slots.
 *
 * No skinning runs in the browser. The bones move because we translate their
 * nodes directly; the surface follows because the export carries a single morph
 * target baked from the LBS solve at the slider's positive extreme, and three.js
 * accepts negative morph weights, so one target covers the full sweep. Blob and
 * mesh are shown alternately rather than side by side, because the point is that
 * they are the same edit.
 */
export function initEditing(host, samples, legBones) {
  const canvasHost = host.querySelector('.viewer-canvas');
  const slider = host.querySelector('.edit-slider');
  const toggles = host.querySelectorAll('.edit-mode button');

  const animals = [];
  let mode = 'blob';

  const stage = createStage(canvasHost, {
    fov: 30,
    onReady: async (s) => {
      const loaded = await Promise.all(samples.map(async (sample) => ({
        sample,
        blobGltf: await loadGLB(sample.blob),
        meshGltf: await loadGLB(sample.mesh),
      })));

      const pairs = loaded.map(({ sample, blobGltf, meshGltf }) => {
        const blobRoot = blobGltf.scene.clone(true);
        // Freeze the bones at their rest frame; the slider, not the clip, is
        // what should be moving them here.
        if (blobGltf.animations?.length) {
          const m = new THREE.AnimationMixer(blobRoot);
          m.clipAction(blobGltf.animations[0]).play();
          m.update(0);
        }
        // Keep every other bone at its index colour -- that ramp is the paper's
        // evidence for slot semantics -- and just make the leg group glow.
        const blobMeshes = styleBlob(blobRoot);
        legBones.forEach((k) => {
          const mesh = blobMeshes[k];
          if (!mesh) return;
          mesh.material.color = new THREE.Color(LEG_COLOR);
          mesh.material.emissive = new THREE.Color(LEG_COLOR);
          mesh.material.emissiveIntensity = 1.0;
        });
        // Auto-profile turns each animal side-on; the mesh then has to take the
        // exact rotation the bones resolved to, and so does the shift axis.
        const rot = groundModel(blobRoot, { rotateY: sample.rotateY || 0 });
        s.scene.add(blobRoot);

        const meshRoot = meshGltf.scene.clone(true);
        styleMesh(meshRoot, { emissive: 0.3, brighten: /bear/i.test(sample.id) ? 1.8 : 1 });
        let morphMesh = null;
        meshRoot.traverse((o) => {
          if (o.isMesh && o.morphTargetInfluences?.length) morphMesh = o;
        });
        groundModel(meshRoot, { rotateY: rot, profile: false });
        meshRoot.visible = false;
        s.scene.add(meshRoot);

        // The shift is authored in world space so all three animals sweep the
        // same way; rotate it into each model's own frame to undo their
        // per-file rotation.
        const dir = SHIFT_DIR_WORLD.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -rot * Math.PI / 180);
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
        return { blobRoot, meshRoot };
      });

      // Both representations occupy the same slot, so lay out the bones and move
      // each mesh to match -- otherwise switching modes would shuffle the row.
      layoutRow(pairs.map((p) => p.blobRoot), { gap: 0.14 });
      pairs.forEach((p) => { p.meshRoot.position.x = p.blobRoot.position.x; });
      const all = pairs.flatMap((p) => [p.blobRoot, p.meshRoot]);
      fitCamera(s, all, { padding: 1.22 });
      s.onResize = () => fitCamera(s, all, { padding: 1.22 });
      host.classList.remove('is-loading');
      apply(+slider.value);
      setMode('blob');
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

  function setMode(m) {
    mode = m;
    for (const a of animals) {
      a.blobRoot.visible = m !== 'mesh';
      a.meshRoot.visible = m !== 'blob';
    }
    toggles.forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  }

  slider.addEventListener('input', () => apply(+slider.value));
  toggles.forEach((b) => b.addEventListener('click', () => { stage.mountNow(); setMode(b.dataset.mode); }));

  return stage;
}

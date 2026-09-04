import * as THREE from 'three';
import { createStage, loadGLB, groundModel, layoutRow, fitCamera, playClip, styleBlob, observeResize } from './stage.js';

/**
 * Cross-species bone correspondence.
 *
 * The bone exports already encode the claim: node index == mesh index ==
 * material index == SGB slot, and the colour ramp over that index is byte-for-byte
 * identical on every animal. So slot 37 is the same hue on a fox and on a warthog
 * whether or not anyone hovers. Hovering just makes it undeniable -- point at one
 * bone and its counterpart lights up on every other species while the rest fade.
 */
export function initCorrespondence(host, samples) {
  const canvasHost = host.querySelector('.viewer-canvas');
  const readout = host.querySelector('.corr-readout');
  const models = [];   // one entry per animal: { meshes: Mesh[] }
  let hovered = -1;

  const stage = createStage(canvasHost, {
    fov: 26,
    onReady: async (s) => {
      const gltfs = await Promise.all(samples.map((x) => loadGLB(x.blob)));
      const roots = gltfs.map((g, i) => {
        const root = g.scene.clone(true);
        const meshes = styleBlob(root, { emissive: 0.6 });
        meshes.forEach((m, k) => { m.userData.bone = k; });
        s.scene.add(root);
        // Bone nodes carry no default transform, so measure only after frame 0.
        playClip(s, g, root);
        groundModel(root);
        models.push({ meshes, label: samples[i].label });
        return root;
      });
      layoutRow(roots, { gap: 0.1 });
      fitCamera(s, roots, { padding: 1.1 });
      s.onResize = () => fitCamera(s, roots, { padding: 1.1 });
      host.classList.remove('is-loading');
    },
  });
  observeResize(canvasHost);

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function setHover(bone) {
    if (bone === hovered) return;
    hovered = bone;
    for (const m of models) {
      m.meshes.forEach((mesh, k) => {
        const on = bone < 0 || k === bone;
        mesh.material.opacity = on ? 1 : 0.1;
        mesh.material.transparent = !on;
        mesh.material.depthWrite = on;
        // Only brightness changes. Scaling the hovered bone made it balloon over
        // its neighbours and misrepresented the ellipsoid's actual extent.
        mesh.material.emissiveIntensity = on ? (bone < 0 ? 0.6 : 1.5) : 0.06;
      });
    }
    readout.textContent = bone < 0
      ? 'Hover any bone — its counterpart lights up on every species.'
      : `SGB slot ${bone} — the same slot on all ${models.length} animals.`;
    readout.classList.toggle('on', bone >= 0);
  }

  canvasHost.addEventListener('pointermove', (e) => {
    if (!stage.camera || !models.length) return;
    const r = canvasHost.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, stage.camera);
    const hits = ray.intersectObjects(models.flatMap((m) => m.meshes), false);
    setHover(hits.length ? hits[0].object.userData.bone : -1);
  });
  canvasHost.addEventListener('pointerleave', () => setHover(-1));

  return stage;
}

import * as THREE from 'three';
import { createStage, loadGLB, groundModel, layoutRow, fitCamera, facingTurn, playClip, styleBlob, observeResize } from './stage.js';

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
        // Same rule as everywhere else: the angle picked by hand plus the
        // measured side-on turn. There is no mesh here to measure, but the bones
        // are registered to one, so they answer the same question.
        groundModel(root, {
          rotateY: (samples[i].rotateY || 0) + facingTurn(root, g.animations?.[0]),
          profile: false,
        });
        models.push({ meshes, label: samples[i].label });
        return root;
      });
      layoutRow(roots, { gap: 0.34 });
      fitCamera(s, roots, { padding: 1.22 });
      s.onResize = () => fitCamera(s, roots, { padding: 1.22 });
      host.classList.remove('is-loading');
    },
  });
  observeResize(canvasHost);

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  // There is no hover on a touch screen, and without one this viewer is four
  // still animals that do nothing. A tap picks a slot there and it stays picked
  // until another tap, which is the same demonstration a moment later.
  const TAP = typeof window !== 'undefined'
    && window.matchMedia('(pointer: coarse)').matches;
  const IDLE = TAP
    ? 'Tap any SGB — its counterpart lights up on every species.'
    : 'Hover any SGB — its counterpart lights up on every species.';

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
      ? IDLE
      : `SGB slot ${bone} — the same slot on all ${models.length} animals.`;
    readout.classList.toggle('on', bone >= 0);
  }

  function pick(e) {
    if (!stage.camera || !models.length) return;
    const r = canvasHost.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, stage.camera);
    const hits = ray.intersectObjects(models.flatMap((m) => m.meshes), false);
    setHover(hits.length ? hits[0].object.userData.bone : -1);
  }

  // `pointerdown` covers the tap; on a mouse it just re-picks whatever is
  // already under the cursor, which costs nothing.
  canvasHost.addEventListener('pointerdown', pick);
  if (!TAP) {
    canvasHost.addEventListener('pointermove', pick);
    canvasHost.addEventListener('pointerleave', () => setHover(-1));
  }

  if (TAP) readout.textContent = IDLE;

  return stage;
}

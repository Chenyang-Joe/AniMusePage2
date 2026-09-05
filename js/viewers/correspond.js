import * as THREE from 'three';
import { createStage, loadGLB, groundModel, layoutRow, fitCamera, facingTurn, restBox, playClip, styleBlob, observeResize } from './stage.js';

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
  const labelGrid = host.querySelector('.grid-labels');
  const models = [];   // one entry per animal: { meshes: Mesh[] }
  let hovered = -1;

  // Named, because "the same slot on all four" is a claim about four particular
  // species and the reader should be able to see which. Placed by projection
  // like the grids: `layoutRow` spaces the animals by their own widths, so no
  // CSS grid would line up with them.
  if (labelGrid) {
    labelGrid.classList.add('projected');
    labelGrid.innerHTML = samples.map((x) => `<span>${x.label}</span>`).join('');
    // Hidden until they have somewhere to be: unplaced, they all sit in the
    // corner, and the models take a moment to arrive.
    labelGrid.style.opacity = '0';
  }

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
      layoutRow(roots, { gap: 0.5, even: true });
      // Where each animal sits once, measured now. Not `root.position`, which
      // grounding has already offset, and not the live box, which one of these
      // clips carries off into a burrow -- a name that follows its animal across
      // the frame is worse than no name at all.
      const anchors = roots.map((r) => restBox(r).getCenter(new THREE.Vector3()));
      // Straight on. Evenly spaced in world coordinates is not evenly spaced on
      // screen when the camera is off-axis: across a row this wide the far end
      // spreads out, and a row of four labelled species reads as uneven.
      s.onResize = () => fitCamera(s, roots, { padding: 1.06, dir: [0, 0, 1] });
      s.onResize();
      // Placed every frame, not once after the fit: the controls damp into
      // position, so the camera a moment after `fitCamera` is not the camera it
      // settles at, and a label placed against the first one lands a whole
      // animal to the left. It also keeps the names under their animals while
      // the reader orbits, which placing once never could.
      s.onFrame = () => {
        s.renderer.clear();
        s.renderer.render(s.scene, s.camera);
        placeLabels(anchors);
        if (labelGrid) labelGrid.style.opacity = '1';
      };
      host.classList.remove('is-loading');
    },
  });
  observeResize(canvasHost);

  /** Put each name under the animal it belongs to, in projected coordinates. */
  function placeLabels(anchors) {
    if (!labelGrid || !stage.camera) return;
    const v = new THREE.Vector3();
    [...labelGrid.children].forEach((el, i) => {
      if (!anchors[i]) return;
      v.copy(anchors[i]).project(stage.camera);
      el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
      el.style.top = '0';
    });
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  // There is no hover on a touch screen, and without one this viewer is four
  // still animals that do nothing. A tap picks a slot there and it stays picked
  // until another tap, which is the same demonstration a moment later.
  //
  // Which one this is can change after load: the media query is a guess, and the
  // first real touch is the answer. So it is a variable, not a constant.
  let tap = typeof window !== 'undefined'
    && window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const idle = () => (tap
    ? 'Tap any SGB — its counterpart lights up on every species.'
    : 'Hover any SGB — its counterpart lights up on every species.');

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
      ? idle()
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
  const clear = () => setHover(-1);
  const useHover = () => {
    canvasHost.addEventListener('pointermove', pick);
    canvasHost.addEventListener('pointerleave', clear);
  };
  const useTap = () => {
    tap = true;
    canvasHost.removeEventListener('pointermove', pick);
    canvasHost.removeEventListener('pointerleave', clear);
    if (hovered < 0) readout.textContent = idle();
  };
  if (tap) useTap(); else useHover();
  // And if a finger arrives on a device that claimed to have a pointer, believe
  // the finger.
  window.addEventListener('touchstart', useTap, { once: true, passive: true });

  return stage;
}

import * as THREE from 'three';
import { createStage, loadGLB, pairModels, fitCamera, facingTurn, poseFrames, playClip, styleBlob, styleMesh, observeResize } from './stage.js';

/**
 * Blob | mesh split viewer.
 *
 * One camera, one scene, two passes under a scissor test: the bones are drawn
 * left of the divider, the skinned surface right of it. Because both passes
 * share the camera, dragging the divider never desynchronises the two halves and
 * the whole thing still orbits as a single 3D scene -- which a pair of clipped
 * canvases or a crossfade would not give.
 */
export function initSplit(host, samples, opts = {}) {
  const { startFraction = 0.5, leftLabel = 'Semantic Gaussian Bones', rightLabel = 'Skinned mesh' } = opts;

  const canvasHost = host.querySelector('.viewer-canvas');
  const chipRow = host.querySelector('.viewer-chips');
  const divider = host.querySelector('.split-divider');
  const labelL = host.querySelector('.split-label-left');
  const labelR = host.querySelector('.split-label-right');
  labelL.textContent = leftLabel;
  labelR.textContent = rightLabel;

  let fraction = startFraction;
  let current = null;          // { blobRoot, meshRoot }
  let loadToken = 0;

  const stage = createStage(canvasHost, {
    onReady: (s) => {
      s.scene.background = null;
      s.renderer.setClearColor(0xffffff, 1);
      s.onFrame = render;
      select(0);
    },
  });
  observeResize(canvasHost);

  function render() {
    const r = stage.renderer;
    const w = canvasHost.clientWidth;
    const h = canvasHost.clientHeight;
    if (!w || !h || !current) { r.clear(); return; }
    // Read the clock off the mixer, not off `stage.clock`: the shared tick has
    // already taken this frame's delta out of it.
    if (current.dur && current.meshMixer) {
      const u = (current.meshMixer.time % current.dur) / current.dur;
      current.drift.position.copy(current.pose.travelAt(u)).negate();
    }
    const x = Math.round(w * fraction);

    r.setViewport(0, 0, w, h);
    r.setScissorTest(true);

    current.blobRoot.visible = true;
    current.meshRoot.visible = false;
    r.setScissor(0, 0, x, h);
    r.clear();
    r.render(stage.scene, stage.camera);

    current.blobRoot.visible = false;
    current.meshRoot.visible = true;
    r.setScissor(x, 0, w - x, h);
    r.clear();
    r.render(stage.scene, stage.camera);

    r.setScissorTest(false);
  }

  function setFraction(f) {
    fraction = Math.max(0.02, Math.min(0.98, f));
    divider.style.left = `${fraction * 100}%`;
    labelL.style.opacity = fraction < 0.14 ? 0 : 1;
    labelR.style.opacity = fraction > 0.86 ? 0 : 1;
  }

  async function select(i) {
    const token = ++loadToken;
    const s = samples[i];
    for (const el of chipRow.children) el.classList.toggle('on', +el.dataset.i === i);
    host.classList.add('is-loading');

    const [blobGltf, meshGltf] = await Promise.all([loadGLB(s.blob), loadGLB(s.mesh)]);
    if (token !== loadToken) return;   // a faster click won the race

    if (current) {
      stage.scene.remove(current.drift);
      stage.mixers.length = 0;
    }

    const blobRoot = blobGltf.scene.clone(true);
    const meshRoot = meshGltf.scene.clone(true);
    styleBlob(blobRoot);
    styleMesh(meshRoot);

    // Bone nodes carry no default transform -- they exist only as animation
    // tracks -- so the clip has to be applied before anything measures them.
    playClip(stage, blobGltf, blobRoot);
    const meshMixer = playClip(stage, meshGltf, meshRoot);
    // scene_5 curated which end faces the camera; the side-on turn is measured.
    const { pair } = pairModels(meshRoot, blobRoot, {
      align: s.align, profile: false,
      rotateY: (s.rotateY || 0) + facingTurn(meshRoot, meshGltf.animations?.[0]),
    });
    // Several of these clips travel, and one animal in one frame is exactly the
    // case where that shows: fitted to the pose it starts in, a walking meerkat
    // leaves the panel a second later. `drift` cancels the travel each frame and
    // the camera is fitted to what is left.
    const drift = new THREE.Group();
    drift.add(pair);
    stage.scene.add(drift);
    // From the top: `poseFrames` reads world matrices, and the groups above the
    // mesh were transformed a moment ago -- measuring before they are refreshed
    // puts the box somewhere the animal is not, and the camera aims there.
    drift.updateMatrixWorld(true);
    const pose = poseFrames(meshRoot, meshGltf.animations?.[0]);
    const box = new THREE.Box3().setFromCenterAndSize(pose.center, pose.size);
    // Tighter than the default: the box already covers the whole clip, so an
    // animal that rears is only ever this tall for a moment and spends the rest
    // of the loop looking small in a panel this wide.
    const fit = { box, padding: 1.08 };
    fitCamera(stage, [drift], fit);
    stage.onResize = () => fitCamera(stage, [drift], fit);

    const dur = meshGltf.animations?.[0]?.duration || 0;
    current = { drift, blobRoot, meshRoot, pose, dur, meshMixer };
    host.classList.remove('is-loading');
  }

  samples.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.i = i;
    b.textContent = s.label;
    b.addEventListener('click', () => { stage.mountNow(); select(i); });
    chipRow.appendChild(b);
  });

  // Divider drag. The handle sits above the canvas, so OrbitControls never sees
  // these pointers and the model doesn't spin while you're dragging the split.
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

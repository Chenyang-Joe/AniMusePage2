import { createStage, loadGLB, groundModel, layoutRow, fitCamera, playClip, styleBlob, styleMesh, observeResize } from './stage.js';

/**
 * A row of models in one scene, sharing a camera and a clock.
 *
 * Used wherever the point is a comparison held to the same instant and the same
 * viewing angle: ground truth beside our deformation, or the pinned bones beside
 * the body the model inpainted around them. One scene rather than N canvases, so
 * orbiting moves all of them together and there is only one WebGL context.
 */
export function initRow(host, samples, opts = {}) {
  const { gap = 0.12, columns, fov = 28 } = opts;

  const canvasHost = host.querySelector('.viewer-canvas');
  const chipRow = host.querySelector('.viewer-chips');
  const captionEl = host.querySelector('.viewer-caption');
  const labelRow = host.querySelector('.viewer-labels');

  let roots = [];
  let loadToken = 0;

  if (labelRow) {
    labelRow.innerHTML = columns.map((c) => `<span>${c.label}</span>`).join('');
    labelRow.style.gridTemplateColumns = `repeat(${columns.length}, 1fr)`;
  }

  const stage = createStage(canvasHost, { fov, onReady: () => select(0) });
  observeResize(canvasHost);

  async function select(i) {
    const token = ++loadToken;
    const sample = samples[i];
    for (const el of chipRow.children) el.classList.toggle('on', +el.dataset.i === i);
    host.classList.add('is-loading');

    const gltfs = await Promise.all(columns.map((c) => loadGLB(sample[c.key])));
    if (token !== loadToken) return;

    stage.scene.remove(...roots);
    roots = [];
    stage.mixers.length = 0;

    // Every column is the same animal in a different representation, so they
    // must all take the orientation the first one resolved to.
    let rowRotation = null;
    gltfs.forEach((g, k) => {
      const root = g.scene.clone(true);
      if (columns[k].kind === 'blob') styleBlob(root);
      else styleMesh(root, { plain: columns[k].kind === 'plain' });
      stage.scene.add(root);
      // Bone nodes carry no default transform, so measure only after frame 0.
      playClip(stage, g, root);
      const applied = groundModel(root, rowRotation === null
        ? {}
        : { rotateY: rowRotation, profile: false });
      if (rowRotation === null) rowRotation = applied;
      roots.push(root);
    });
    layoutRow(roots, { gap });
    fitCamera(stage, roots, { padding: 1.12 });
    stage.onResize = () => fitCamera(stage, roots, { padding: 1.12 });

    if (captionEl) captionEl.textContent = sample.caption || sample.prompt || '';
    host.classList.remove('is-loading');
  }

  samples.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.i = i;
    b.textContent = s.label || s.short || `Sample ${i + 1}`;
    b.addEventListener('click', () => { stage.mountNow(); select(i); });
    chipRow.appendChild(b);
  });

  return stage;
}

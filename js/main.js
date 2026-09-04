// Nothing here imports three.js. Each viewer's module -- and with it the ~2 MB
// of three.js and every GLB it needs -- is fetched only when that viewer comes
// within a screen or so of the reader. A visitor who reads the abstract and
// leaves downloads about 40 KB.

const BASE = 'assets/models/';

let manifestPromise = null;
const manifest = () => (manifestPromise ??= fetch(BASE + 'manifest.json').then((r) => r.json()));

function withBase(list, keys) {
  return list.map((s) => {
    const o = { ...s };
    for (const k of keys) if (o[k]) o[k] = BASE + o[k];
    return o;
  });
}

/** Turn "The_juvenile_gray_wolf_swims..." into a chip label that fits. */
function speciesLabel(prompt, id) {
  const m = /^The\s+(?:female|male|juvenile)\s+([a-z\s]+?)\s+(?:swims|treads|stands|walks|runs)/i.exec(prompt || '');
  const raw = m ? m[1] : id.replace(/_/g, ' ');
  return raw.replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

/** Run `boot` the first time #id gets close to the viewport. */
function whenNear(id, boot) {
  const el = document.getElementById(id);
  if (!el) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.disconnect();
      boot(el).catch((err) => {
        console.error(`viewer ${id} failed`, err);
        el.classList.remove('is-loading');
      });
    }
  }, { rootMargin: '700px 0px' });
  io.observe(el);
}

whenNear('v-split', async (el) => {
  const [{ initSplit }, m] = await Promise.all([import('./viewers/split.js'), manifest()]);
  initSplit(el, withBase(m.teaser, ['mesh', 'blob']), {
    leftLabel: 'Semantic Gaussian Bones',
    rightLabel: 'Skinned mesh',
  });
});

whenNear('v-corr', async (el) => {
  const [{ initCorrespondence }, m] = await Promise.all([import('./viewers/correspond.js'), manifest()]);
  initCorrespondence(el, withBase(m.teaser, ['blob']));
});

whenNear('v-stage1', async (el) => {
  const [{ initRow }, m] = await Promise.all([import('./viewers/row.js'), manifest()]);
  initRow(el, withBase(m.stage1, ['gt', 'pred', 'blob']).map((s) => ({ ...s, label: `${s.label} — ${s.action}` })), {
    columns: [
      { key: 'gt',   label: 'Ground truth',            kind: 'mesh' },
      { key: 'blob', label: 'Predicted SGBs',          kind: 'blob' },
      { key: 'pred', label: 'AniMuse LBS deformation', kind: 'mesh' },
    ],
  });
});

whenNear('v-inpaint', async (el) => {
  const [{ initRow }, m] = await Promise.all([import('./viewers/row.js'), manifest()]);
  initRow(el, withBase(m.inpainting, ['mesh', 'blob']).map((s) => ({ ...s, label: speciesLabel(s.prompt, s.id) })), {
    columns: [
      { key: 'blob', label: 'Generated bone trajectory — pink bones are the pinned constraint',
        kind: 'blob', blob: { highlight: m.pinnedBones } },
      { key: 'mesh', label: 'Inpainted full-body motion', kind: 'mesh' },
    ],
  });
});

whenNear('v-edit', async (el) => {
  const [{ initEditing }, m] = await Promise.all([import('./viewers/editing.js'), manifest()]);
  initEditing(el, withBase(m.editing, ['mesh', 'blob']), m.legBones);
});

// Highlight the section the reader is actually looking at.
const links = [...document.querySelectorAll('.nav a[href^="#"]')];
const targets = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const i = targets.indexOf(e.target);
    links.forEach((a, k) => a.classList.toggle('on', k === i));
  }
}, { rootMargin: '-45% 0px -50% 0px' });
targets.forEach((t) => spy.observe(t));

// YouTube facade: the embed's own scripts and cookies stay off the page until
// someone actually asks to watch.
for (const box of document.querySelectorAll('.video-embed[data-youtube]')) {
  box.querySelector('.video-placeholder')?.addEventListener('click', () => {
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${box.dataset.youtube}?autoplay=1&rel=0`;
    f.title = 'AniMuse overview video';
    f.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
    f.allowFullscreen = true;
    box.replaceChildren(f);
  }, { once: true });
}

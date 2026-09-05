// Nothing here imports three.js. Each viewer's module -- and with it the ~2 MB
// of three.js and every GLB it needs -- is fetched only when that viewer comes
// within a screen or so of the reader. A visitor who reads the abstract and
// leaves downloads about 40 KB.

// Resolved against this module rather than the document, so the page can live
// at any depth -- the v1 page kept under legacy/ loads the same assets.
const BASE = new URL('../assets/models/', import.meta.url).href;

let manifestPromise = null;
// Revalidated rather than served from cache. The manifest is the index that
// names every other file, and GitHub Pages hands it out with ten minutes of
// freshness -- so for ten minutes after a deploy that renames an asset, a
// returning reader is told to fetch a file that no longer exists, and the viewer
// does not fall back to the old one, it just fails. `no-cache` sends a
// conditional request: a 304 and no body when nothing changed, which for seven
// kilobytes is a fair price for never serving a stale index.
const manifest = () => (manifestPromise ??= fetch(BASE + 'manifest.json', { cache: 'no-cache' })
  .then((r) => r.json()));

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

// Media queries can be wrong about this -- a phone asked to request the desktop
// site reports a fine pointer -- and every viewer on the page behaves
// differently under a finger. The first touch that actually happens settles it.
if (typeof window !== 'undefined') {
  window.addEventListener('touchstart', () => {
    document.documentElement.dataset.input = 'touch';
  }, { once: true, passive: true });
}

// Four cells across is 60 pixels each on a phone, with the labels on top of one
// another. The grids reflow to two columns there. Read once: the only way to
// change it afterwards is to turn the device over, and a re-flow would have to
// rebuild every cell.
const NARROW = typeof window !== 'undefined'
  && window.matchMedia('(max-width: 720px)').matches;

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

whenNear('v-wall', async (el) => {
  const [{ initSplitGrid }, m] = await Promise.all([import('./viewers/splitgrid.js'), manifest()]);
  initSplitGrid(el, withBase(m.gallery, ['mesh', 'blob']), { cols: NARROW ? 2 : 4 });
});

whenNear('v-corr', async (el) => {
  const [{ initCorrespondence }, m] = await Promise.all([import('./viewers/correspond.js'), manifest()]);
  initCorrespondence(el, withBase(m.correspond, ['blob']));
});

whenNear('v-stage1', async (el) => {
  const [{ initRow }, m] = await Promise.all([import('./viewers/row.js'), manifest()]);
  // Species on the button, action on the line below -- the same split the hero
  // uses. Actions run to a clause ("walks, then lowers its head to drink") and a
  // button is the wrong place for one.
  initRow(el, withBase(m.stage1, ['gt', 'pred', 'blob'])
    .map((s) => ({ ...s, caption: s.action ? `${s.label} ${s.action}.` : s.label })), {
    columns: [
      { key: 'gt',   label: 'Ground truth',            kind: 'mesh' },
      { key: 'blob', label: 'SGBs extracted',          kind: 'blob' },
      { key: 'pred', label: 'Mesh deformed by the SGBs', kind: 'mesh' },
    ],
  });
});

whenNear('v-inpaint', async (el) => {
  const [{ initGrid }, m] = await Promise.all([import('./viewers/grid.js'), manifest()]);
  initGrid(el, withBase(m.inpainting.filter((s) => s.inGrid !== false), ['mesh', 'blob'])
    .map((s) => ({ ...s, label: speciesLabel(s.prompt, s.id) })), m.pinnedBones,
    { cols: NARROW ? 2 : 3 });
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

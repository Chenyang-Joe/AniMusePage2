/**
 * The sample picker.
 *
 * Choosing which clips go on the page is an eye judgement, and a still frame is
 * a bad way to make it: a clip can look fine in one frame and be dead in motion,
 * or the other way round. So this puts the whole candidate pool -- 90 teaser
 * clips, 100 Stage-1 clips -- on screen as live animation, twelve at a time,
 * through the same viewer the site uses, and lets the choice be made directly.
 *
 * It is a local tool: it reads assets/preview/ (built by tools/build_preview.py,
 * browsing quality, not committed) and is not linked from the site.
 */
import { initSplitGrid } from './viewers/splitgrid.js';
import { clearGLBCache } from './viewers/stage.js';

const BASE = new URL('../assets/preview/', import.meta.url).href;
const PER_PAGE = 12;
const COLS = 4;
const STORE = 'animuse-picks';

const host = document.getElementById('v-pick');
const cellBar = document.getElementById('cells');
const out = document.getElementById('out');
const pageNo = document.getElementById('pageno');
const countEl = document.getElementById('count');
const whichBtn = document.getElementById('which');

let data = null;
let tab = 'teaser';
let page = 0;
let which = 'mesh';        // stage1 only: the predicted mesh, or ground truth
let stage = null;

/** Picks survive a reload, so a long browse can be done in more than one sitting. */
const picks = JSON.parse(localStorage.getItem(STORE) || '{}');
const save = () => localStorage.setItem(STORE, JSON.stringify(picks));

const pool = () => data[tab];
const pageItems = () => pool().slice(page * PER_PAGE, (page + 1) * PER_PAGE);
const pages = () => Math.ceil(pool().length / PER_PAGE);

function render() {
  const items = pageItems();
  countEl.textContent = `${pool().length} clips · ${Object.keys(picks).length} picked`;
  pageNo.textContent = `${page + 1} / ${pages()}`;
  document.getElementById('prev').disabled = page === 0;
  document.getElementById('next').disabled = page >= pages() - 1;
  whichBtn.hidden = tab !== 'stage1';
  whichBtn.textContent = `Showing: ${which === 'gt' ? 'GT' : 'Pred'}`;

  // Give the old page's context back before asking for another one.
  if (stage) stage.dispose();
  clearGLBCache();
  host.classList.add('is-loading');
  host.querySelector('.grid-labels').innerHTML = '';

  stage = initSplitGrid(host, items.map((e) => ({
    id: e.id,
    label: `${e.id} · ${e.label}`,
    action: picks[e.id]?.action || e.action || '',
    rotateY: rotOf(e),
    mesh: BASE + (which === 'gt' && e.gt ? e.gt : e.mesh),
    blob: BASE + e.blob,
  })), { cols: COLS, startFraction: 0.28, padding: 1.22 });
  stage.mountNow();

  cellBar.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
  cellBar.innerHTML = '';
  items.forEach((e) => cellBar.appendChild(cellUI(e)));
  writeOut();
}

const rotOf = (e) => (picks[e.id]?.rotateY ?? e.rotateY ?? 0);

function cellUI(e) {
  const el = document.createElement('div');
  el.className = 'cell' + (picks[e.id] ? ' picked' : '');
  el.innerHTML = `<b>${e.id}</b> ${e.label}<br><span class="hint" style="font-size:11.5px">${e.action || ''} · rotY=${rotOf(e)}</span>`;

  const row = document.createElement('div');
  row.className = 'row';

  const pick = document.createElement('button');
  pick.className = 'pick' + (picks[e.id] ? ' on' : '');
  pick.textContent = picks[e.id] ? '✓ Picked' : 'Pick';
  pick.onclick = () => {
    if (picks[e.id]) delete picks[e.id];
    else picks[e.id] = { rotateY: rotOf(e), action: e.action || '', tab, label: e.label };
    save();
    render();
  };

  const turn = document.createElement('button');
  turn.textContent = '↻ Turn';
  turn.onclick = () => {
    // Keep it in -180..180: that is what gets pasted into build_assets.py.
    let r = rotOf(e) + 90;
    if (r > 180) r -= 360;
    (picks[e.id] || (picks[e.id] = { action: e.action || '', tab, label: e.label })).rotateY = r;
    save();
    render();
  };

  const act = document.createElement('input');
  act.type = 'text';
  act.placeholder = 'doing what?';
  act.value = picks[e.id]?.action || e.action || '';
  act.oninput = () => {
    (picks[e.id] || (picks[e.id] = { rotateY: rotOf(e), tab, label: e.label })).action = act.value;
    save();
    writeOut();
  };

  row.append(pick, turn, act);
  el.appendChild(row);
  return el;
}

function writeOut() {
  const lines = [];
  for (const group of ['teaser', 'stage1']) {
    const ids = Object.keys(picks).filter((k) => picks[k].tab === group);
    if (!ids.length) continue;
    lines.push(`# ${group} (${ids.length})`);
    for (const id of ids.sort()) {
      const p = picks[id];
      lines.push(`${id.padEnd(6)} rotY=${String(p.rotateY ?? 0).padStart(4)}  ${(p.label || '').padEnd(30)} ${p.action || ''}`);
    }
    lines.push('');
  }
  out.value = lines.join('\n') || '(nothing picked yet)';
}

document.getElementById('prev').onclick = () => { page--; render(); };
document.getElementById('next').onclick = () => { page++; render(); };
whichBtn.onclick = () => { which = which === 'gt' ? 'mesh' : 'gt'; render(); };
document.getElementById('copy').onclick = () => navigator.clipboard.writeText(out.value);
document.getElementById('clear').onclick = () => {
  if (!confirm('Clear every pick?')) return;
  for (const k of Object.keys(picks)) delete picks[k];
  save();
  render();
};
for (const t of ['teaser', 'stage1']) {
  document.getElementById(`tab-${t}`).onclick = () => {
    tab = t; page = 0;
    document.getElementById('tab-teaser').classList.toggle('on', t === 'teaser');
    document.getElementById('tab-stage1').classList.toggle('on', t === 'stage1');
    render();
  };
}

data = await (await fetch(BASE + 'index.json')).json();
render();

import './style.css';
import { StorageError, createSeedStore, structureKey, type SavedSeed } from './storage';
import { BIOMES } from './data/biomes';
import { STRUCTURES } from './data/structures';
import { versionsFor, type Edition } from './data/versions';
import { MapView } from './map/map';
import { parseSeed, seedParts } from './seed';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const map = new MapView($('map') as HTMLCanvasElement);

const seedIn = $<HTMLInputElement>('seed'), edIn = $<HTMLSelectElement>('edition'), verIn = $<HTMLSelectElement>('version');
const largeIn = $<HTMLInputElement>('large');
const dimIn = $<HTMLSelectElement>('dimension');
type DimName = 'overworld' | 'nether' | 'end';
const DIM_OF: Record<DimName, -1 | 0 | 1> = { overworld: 0, nether: -1, end: 1 };
const dimName = (d: unknown): DimName => (d === 'nether' || d === 'end' ? d : 'overworld');

function fillVersions(selected?: string) {
  const vs = versionsFor(edIn.value as Edition);
  verIn.innerHTML = vs.map((v) => `<option value="${v.label}">${v.label}</option>`).join('');
  if (selected && vs.some((v) => v.label === selected)) verIn.value = selected;
  $('note').hidden = edIn.value !== 'bedrock';
}
edIn.onchange = () => fillVersions();
fillVersions();

function generate() {
  const edition = edIn.value as Edition;
  const mc = versionsFor(edition).find((v) => v.label === verIn.value)!.mc;
  const { lo, hi } = seedParts(parseSeed(seedIn.value, edition));
  saveNotes();
  generated = { seed: seedIn.value.trim(), edition, version: verIn.value };
  map.setWorld(mc, lo, hi, largeIn.checked, DIM_OF[dimName(dimIn.value)]);
  const q = new URLSearchParams({ seed: seedIn.value, edition, version: verIn.value, dimension: dimIn.value });
  history.replaceState(null, '', `?${q}`);
  refreshActive();
}
$('seedForm').onsubmit = (e) => { e.preventDefault(); generate(); setSideOpen(false); };
dimIn.onchange = () => updateDimStyling();

// --- saved seeds (this browser only) ---
const seeds = createSeedStore();
const savedEl = $('saved');
const savedMsg = $('savedMsg');
function showSavedMsg(msg: string, isError = false) {
  savedMsg.textContent = msg;
  savedMsg.classList.toggle('error', isError);
  savedMsg.hidden = !msg;
}
/** Runs a storage change; on failure shows the reason instead of pretending it worked. */
function attempt(fn: () => void, refresh = true) {
  try {
    fn();
    showSavedMsg('');
  } catch (e) {
    showSavedMsg(e instanceof StorageError ? e.message : 'Something went wrong saving seeds.', true);
  }
  if (refresh) refreshSaved();
}
function refreshSaved() {
  const list = seeds.list();
  savedEl.innerHTML = '';
  if (!list.length) savedEl.innerHTML = '<li style="color:var(--muted);cursor:default">No saved seeds yet</li>';
  for (const s of list) savedEl.append(savedRow(s));
  refreshActive(list);
}

// --- notes + visited structures, kept on the saved seed matching the map ---
let activeId: string | null = null;
let generated: { seed: string; edition: Edition; version: string } | null = null;
/** The saved seed whose notes are in the textarea, so typed text is never saved onto a different seed. */
let notesOwner: string | null = null;
const notesIn = $<HTMLTextAreaElement>('notes');
const hideVisitedIn = $<HTMLInputElement>('hideVisited');
let selected: { type: number; x: number; z: number } | null = null;
let notesTimer = 0;
/**
 * The saved seed for the generated world: same seed and edition, preferring the same version, then the one last
 * loaded/saved, then the newest. Dimension is ignored on purpose: one saved seed covers all three dimensions.
 */
function activeSeed(list = seeds.list()): SavedSeed | null {
  if (!generated) return null;
  const g = generated;
  const matches = (s: SavedSeed) => s.seed === g.seed && s.edition === g.edition;
  const exact = (s: SavedSeed) => matches(s) && s.version === g.version;
  return list.find((s) => s.id === activeId && exact(s)) ?? list.find(exact)
    ?? list.find((s) => s.id === activeId && matches(s)) ?? list.find(matches) ?? null;
}
function refreshActive(list = seeds.list()) {
  const s = activeSeed(list);
  activeId = s?.id ?? null;
  $('notesHint').hidden = !!s;
  $('notesPanel').hidden = !s;
  if (s) {
    $('notesFor').textContent = s.name;
    $('visitedCount').textContent = `${s.visited.length} visited`;
    // don't clobber what the user is typing
    if (s.id !== notesOwner || document.activeElement !== notesIn) notesIn.value = s.notes;
  }
  notesOwner = s?.id ?? null;
  map.setVisited(new Set(s?.visited ?? []), hideVisitedIn.checked);
  renderPick(s);
}
function saveNotes() {
  clearTimeout(notesTimer);
  const s = seeds.list().find((x) => x.id === notesOwner);
  if (!s || s.notes === notesIn.value) return;
  // no list rebuild: this runs on blur, and replacing the rows would swallow the click that caused it
  attempt(() => seeds.setNotes(s.id, notesIn.value), false);
  const row = savedEl.querySelector<HTMLElement>(`li[data-id="${s.id}"]`);
  if (row) row.title = notesIn.value;
}
notesIn.oninput = () => { clearTimeout(notesTimer); notesTimer = window.setTimeout(saveNotes, 500); };
notesIn.onblur = saveNotes;
window.addEventListener('pagehide', saveNotes);
hideVisitedIn.onchange = () => refreshActive();
function savedRow(s: SavedSeed) {
  const li = document.createElement('li');
  li.dataset.id = s.id;
  li.innerHTML = `<div class="meta"><b></b><small></small></div><button title="Rename">✎</button><button title="Delete">✕</button>`;
  li.querySelector('b')!.textContent = s.name;
  const dimLabel = s.dimension === 'nether' ? ' · Nether' : s.dimension === 'end' ? ' · End' : '';
  const visitedLabel = s.visited.length ? ` · ${s.visited.length} visited` : '';
  li.querySelector('small')!.textContent = `${s.seed} · ${s.edition} ${s.version}${dimLabel}${visitedLabel}`;
  if (s.notes) li.title = s.notes;
  li.onclick = () => { load(s); setSideOpen(false); };
  const [ren, del] = li.querySelectorAll('button');
  ren.onclick = (e) => {
    e.stopPropagation();
    const name = prompt('Rename seed', s.name);
    if (name?.trim()) attempt(() => seeds.rename(s.id, name));
  };
  del.onclick = (e) => {
    e.stopPropagation();
    if (confirm(`Delete "${s.name}"?`)) attempt(() => seeds.remove(s.id));
  };
  return li;
}
function load(s: { id?: string; seed: string; edition: Edition; version: string; dimension?: string }) {
  saveNotes();
  if (s.id) activeId = s.id;
  seedIn.value = s.seed; edIn.value = s.edition; fillVersions(s.version);
  dimIn.value = dimName(s.dimension);
  updateDimStyling();
  generate();
}
$('save').onclick = () => {
  if (!seedIn.value.trim()) return;
  const name = prompt('Name for this seed', seedIn.value.trim());
  if (name === null) return;
  saveNotes();
  attempt(() => activeId = seeds.add({ name: name.trim() || seedIn.value.trim(), seed: seedIn.value.trim(), edition: edIn.value as Edition, version: verIn.value, dimension: dimName(dimIn.value), notes: '' }).id);
  // show the saved world so its notes and visits apply to what's on the map
  if (generated?.seed !== seedIn.value.trim() || generated?.edition !== edIn.value || generated?.version !== verIn.value) generate();
};
$('exportSeeds').onclick = () => {
  const url = URL.createObjectURL(new Blob([seeds.exportJson()], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'mc-mapper-seeds.json' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
const importIn = $<HTMLInputElement>('importSeeds');
$('importBtn').onclick = () => importIn.click();
importIn.onchange = async () => {
  const file = importIn.files?.[0];
  importIn.value = '';
  if (!file) return;
  const text = await file.text();
  let added = 0;
  attempt(() => { added = seeds.importJson(text); });
  if (!savedMsg.classList.contains('error')) showSavedMsg(added ? `Imported ${added} seed${added === 1 ? '' : 's'}.` : 'No new seeds in that file.');
};

// --- structure + biome filters ---
const DEFAULT_ON_KEYS = new Set(['village', 'outpost', 'mansion', 'monument', 'stronghold', 'fortress', 'bastion', 'end_city']);
const structOn = new Set(STRUCTURES.filter((s) => DEFAULT_ON_KEYS.has(s.key)).map((s) => s.type));
const structEls: Record<DimName, HTMLElement> = { overworld: $('structsOverworld'), nether: $('structsNether'), end: $('structsEnd') };
const dimNameOf = (d: -1 | 0 | 1 | undefined): DimName => (d === -1 ? 'nether' : d === 1 ? 'end' : 'overworld');
const structRows = STRUCTURES.map((s) => {
  const l = document.createElement('label');
  l.className = 'opt';
  l.dataset.dim = String(s.dim ?? 0);
  l.innerHTML = `<input type="checkbox" ${structOn.has(s.type) ? 'checked' : ''}><i style="background:${s.color}"></i>${s.icon} ${s.name}`;
  l.querySelector('input')!.onchange = (e) => {
    (e.target as HTMLInputElement).checked ? structOn.add(s.type) : structOn.delete(s.type);
    map.setStructures(new Set(structOn));
  };
  structEls[dimNameOf(s.dim)].append(l);
  return l;
});
map.setStructures(new Set(structOn));

const biomeOn = new Set<number>();
const biomeEl = $('biomes');
const biomeEls: Record<DimName, HTMLElement> = { overworld: $('biomesOverworld'), nether: $('biomesNether'), end: $('biomesEnd') };
const biomeRows = BIOMES.map((b) => {
  const l = document.createElement('label');
  l.className = 'opt';
  l.dataset.name = b.name.toLowerCase();
  l.dataset.dim = String(b.dim);
  l.innerHTML = `<input type="checkbox"><i style="background:rgb(${b.color})"></i>${b.name}`;
  l.querySelector('input')!.onchange = (e) => {
    (e.target as HTMLInputElement).checked ? biomeOn.add(b.id) : biomeOn.delete(b.id);
    map.setBiomeFilter(new Set(biomeOn));
  };
  biomeEls[dimNameOf(b.dim)].append(l);
  return l;
});
$<HTMLInputElement>('biomeSearch').oninput = (e) => {
  const q = (e.target as HTMLInputElement).value.toLowerCase();
  for (const r of biomeRows) r.hidden = !r.dataset.name!.includes(q);
};
$('biomeClear').onclick = () => {
  biomeOn.clear();
  biomeEl.querySelectorAll('input').forEach((i) => (i.checked = false));
  map.setBiomeFilter(new Set());
};

function updateDimStyling() {
  const dim = String(DIM_OF[dimName(dimIn.value)]);
  for (const r of [...structRows, ...biomeRows]) r.classList.toggle('otherDim', r.dataset.dim !== dim);
}
updateDimStyling();

// --- drawer (phones only; the classes have no effect on wide screens) ---
const openBtn = $('openSide');
function setSideOpen(open: boolean) {
  document.body.classList.toggle('sideOpen', open);
  openBtn.setAttribute('aria-expanded', String(open));
}
openBtn.onclick = () => setSideOpen(true);
$('closeSide').onclick = () => setSideOpen(false);
$('scrim').onclick = () => setSideOpen(false);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setSideOpen(false); });

// --- HUD ---
map.onHover = (x, z, biome) => ($('coords').textContent = `X ${x}  Z ${z}${biome ? ' · ' + biome : ''}`);
map.onStatus = (m) => ($('status').textContent = m);
map.onSelect = (f) => {
  selected = f;
  renderPick();
};
function renderPick(saved = activeSeed()) {
  const el = $('pick');
  const f = selected;
  el.hidden = !f;
  if (!f) return;
  const def = STRUCTURES.find((s) => s.type === f.type)!;
  el.innerHTML = `<b>${def.icon} ${def.name}</b><br>X ${f.x}, Z ${f.z}<br><code>/tp @s ${f.x} ~ ${f.z}</code>`;
  if (!saved) {
    el.insertAdjacentHTML('beforeend', '<p class="hint">Save this seed to mark structures visited.</p>');
    return;
  }
  const key = structureKey(f.type, f.x, f.z);
  const visited = saved.visited.includes(key);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = visited ? 'done' : '';
  btn.textContent = visited ? '✓ Visited (undo)' : 'Mark visited';
  btn.onclick = () => attempt(() => seeds.setVisited(saved.id, key, !visited));
  el.append(btn);
}
$('goto').onsubmit = (e) => {
  e.preventDefault();
  const x = parseInt($<HTMLInputElement>('gx').value), z = parseInt($<HTMLInputElement>('gz').value);
  if (!isNaN(x) && !isNaN(z)) map.goTo(x, z);
};
$('spawn').onclick = () => map.goToSpawn();
$('zoomIn').onclick = () => map.zoomBy(2);
$('zoomOut').onclick = () => map.zoomBy(0.5);

// --- boot: seed from URL, else first saved ---
refreshSaved();
const q = new URLSearchParams(location.search);
// With nothing to show yet, start with the drawer open so the seed box is visible on phones.
if (!q.get('seed')) setSideOpen(true);
else load({ seed: q.get('seed')!, edition: (q.get('edition') as Edition) || 'java', version: q.get('version') || '', dimension: q.get('dimension') || '' });

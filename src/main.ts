import './style.css';
import { createChangelogSeen } from './changelog';
import { CHANGELOG } from './data/changelog';
import { StorageError, createSeedStore, structureKey, type Pin, type SavedSeed } from './storage';
import { BIOMES } from './data/biomes';
import { STRUCTURES } from './data/structures';
import { currentVersionLabel, versionsFor, type Edition } from './data/versions';
import { MapView } from './map/map';
import { parseCoord, toNether, toOverworld } from './portal';
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
  document.body.dataset.edition = edIn.value;
}
edIn.onchange = () => fillVersions();
fillVersions();

/** Dimension of the world on the map (the select can be changed without regenerating). */
let shownDim: DimName | null = null;
function generate(at: { x: number; z: number } | null = null) {
  const edition = edIn.value as Edition;
  const mc = versionsFor(edition).find((v) => v.label === verIn.value)!.mc;
  const { lo, hi } = seedParts(parseSeed(seedIn.value));
  saveNotes();
  generated = { seed: seedIn.value.trim(), edition, version: verIn.value };
  shownDim = dimName(dimIn.value);
  map.setWorld(mc, lo, hi, largeIn.checked, DIM_OF[shownDim], at, edition === 'bedrock');
  const q = new URLSearchParams({ seed: seedIn.value, edition, version: verIn.value, dimension: dimIn.value });
  history.replaceState(null, '', `?${q}`);
  refreshActive();
  refreshPortal();
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
  if (!list.length) savedEl.innerHTML = '<li class="empty">No saved seeds yet</li>';
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
    $('visitedCount').textContent = `${s.visited.length} visited · ${s.pins.length} pin${s.pins.length === 1 ? '' : 's'}`;
    // don't clobber what the user is typing
    if (s.id !== notesOwner || document.activeElement !== notesIn) notesIn.value = s.notes;
  }
  notesOwner = s?.id ?? null;
  map.setVisited(new Set(s?.visited ?? []), hideVisitedIn.checked);
  map.setPins(s && shownDim ? s.pins.filter((p) => p.dimension === shownDim) : []);
  renderPins(s);
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
  const pinsLabel = s.pins.length ? ` · ${s.pins.length} pin${s.pins.length === 1 ? '' : 's'}` : '';
  li.querySelector('small')!.textContent = `${s.seed} · ${s.edition} ${s.version}${dimLabel}${visitedLabel}${pinsLabel}`;
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
  seedIn.value = s.seed; edIn.value = s.edition; fillVersions(currentVersionLabel(s.version));
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

// --- pins, kept on the saved seed matching the map ---
const pinBtn = $<HTMLButtonElement>('pinBtn');
const pinTip = $('pinTip');
const pinsEl = $('pins');
let pinMode = false;
let selectedPin: string | null = null;
let pinTipTimer = 0;
const DIM_LABEL: Record<DimName, string> = { overworld: 'Overworld', nether: 'Nether', end: 'End' };
function showPinTip(msg: string, ms = 0) {
  clearTimeout(pinTipTimer);
  pinTip.textContent = msg;
  pinTip.hidden = !msg;
  if (msg && ms) pinTipTimer = window.setTimeout(() => showPinTip(''), ms);
}
function setPinMode(on: boolean) {
  if (on && !activeSeed()) { showPinTip('Save this seed to drop pins.', 3000); on = false; }
  else showPinTip(on ? 'Tap the map to drop a pin · Esc to cancel' : '');
  pinMode = on;
  pinBtn.setAttribute('aria-pressed', String(on));
  map.setPinMode(on);
}
pinBtn.onclick = () => setPinMode(!pinMode);
map.onPlace = (x, z) => {
  setPinMode(false);
  const s = activeSeed();
  if (!s || !shownDim) return showPinTip('Save this seed to drop pins.', 3000);
  const name = prompt(`Name this pin (X ${x}, Z ${z})`, 'Pin');
  if (name === null) return;
  let pin: Pin | null = null;
  attempt(() => { pin = seeds.addPin(s.id, { name, x, z, dimension: shownDim! }); });
  if (pin) map.selectPin((pin as Pin).id);
};
map.onSelectPin = (id) => {
  selectedPin = id;
  renderPick();
};
function renamePin(s: SavedSeed, p: Pin) {
  const name = prompt('Rename pin', p.name);
  if (name?.trim()) attempt(() => seeds.renamePin(s.id, p.id, name));
}
function removePin(s: SavedSeed, p: Pin) {
  if (confirm(`Remove pin "${p.name}"?`)) attempt(() => seeds.removePin(s.id, p.id));
}
/** Shows a pin, switching the map to its dimension first if needed. */
function goToPin(p: Pin) {
  setSideOpen(false);
  if (shownDim !== p.dimension) {
    dimIn.value = p.dimension;
    updateDimStyling();
    generate({ x: p.x, z: p.z });
  } else map.goTo(p.x, p.z);
  map.selectPin(p.id);
}
function renderPins(s: SavedSeed | null) {
  $('pinsHint').hidden = !!s;
  $('pinsPanel').hidden = !s;
  pinsEl.innerHTML = '';
  if (!s) return;
  if (!s.pins.length) pinsEl.innerHTML = '<li class="empty">No pins yet</li>';
  // pins in the dimension on the map first
  const pins = [...s.pins].sort((a, b) => Number(b.dimension === shownDim) - Number(a.dimension === shownDim));
  for (const p of pins) {
    const li = document.createElement('li');
    li.innerHTML = `<div class="meta"><b></b><small></small></div><button title="Rename">✎</button><button title="Remove">✕</button>`;
    li.querySelector('b')!.textContent = `📍 ${p.name}`;
    li.querySelector('small')!.textContent = `X ${p.x}, Z ${p.z}${p.dimension === shownDim ? '' : ` · ${DIM_LABEL[p.dimension]}`}`;
    li.onclick = () => goToPin(p);
    const [ren, del] = li.querySelectorAll('button');
    ren.onclick = (e) => { e.stopPropagation(); renamePin(s, p); };
    del.onclick = (e) => { e.stopPropagation(); removePin(s, p); };
    pinsEl.append(li);
  }
}

// --- nether portal calculator ---
const owX = $<HTMLInputElement>('owX'), owZ = $<HTMLInputElement>('owZ');
const neX = $<HTMLInputElement>('neX'), neZ = $<HTMLInputElement>('neZ');
/** Fills the other side from the side just typed in; returns false if that side isn't two numbers. */
function convert(from: 'overworld' | 'nether'): boolean {
  const [ix, iz, ox, oz] = from === 'overworld' ? [owX, owZ, neX, neZ] : [neX, neZ, owX, owZ];
  const x = parseCoord(ix.value), z = parseCoord(iz.value);
  if (x === null || z === null) { ox.value = oz.value = ''; refreshPortal(); return false; }
  const out = from === 'overworld' ? toNether(x, z) : toOverworld(x, z);
  ox.value = String(out.x); oz.value = String(out.z);
  refreshPortal();
  return true;
}
function portalTarget(dim: 'overworld' | 'nether') {
  const [ix, iz] = dim === 'overworld' ? [owX, owZ] : [neX, neZ];
  const x = parseCoord(ix.value), z = parseCoord(iz.value);
  return x === null || z === null ? null : { x, z };
}
function refreshPortal() {
  $<HTMLButtonElement>('showOw').disabled = !generated || !portalTarget('overworld');
  $<HTMLButtonElement>('showNe').disabled = !generated || !portalTarget('nether');
  $<HTMLButtonElement>('portalCenter').disabled = !generated || shownDim === 'end';
}
owX.oninput = owZ.oninput = () => convert('overworld');
neX.oninput = neZ.oninput = () => convert('nether');
/** Puts a coordinate into one side of the calculator and fills in the other. */
function fillPortal(from: 'overworld' | 'nether', x: number, z: number) {
  const [ix, iz] = from === 'overworld' ? [owX, owZ] : [neX, neZ];
  ix.value = String(x); iz.value = String(z);
  convert(from);
}
$('portalCenter').onclick = () => {
  const c = map.center();
  fillPortal(shownDim === 'nether' ? 'nether' : 'overworld', c.x, c.z);
};
function showPortal(dim: 'overworld' | 'nether') {
  const at = portalTarget(dim);
  if (!at || !generated) return;
  setSideOpen(false);
  if (shownDim === dim) return map.goTo(at.x, at.z);
  dimIn.value = dim;
  updateDimStyling();
  generate(at);
}
$('showOw').onclick = () => showPortal('overworld');
$('showNe').onclick = () => showPortal('nether');
refreshPortal();

// --- structure + biome filters ---
const DEFAULT_ON_KEYS = new Set(['village', 'outpost', 'mansion', 'monument', 'stronghold', 'fortress', 'bastion', 'end_city']);
const structOn = new Set(STRUCTURES.filter((s) => DEFAULT_ON_KEYS.has(s.key)).map((s) => s.type));
const structEls: Record<DimName, HTMLElement> = { overworld: $('structsOverworld'), nether: $('structsNether'), end: $('structsEnd') };
const dimNameOf = (d: -1 | 0 | 1 | undefined): DimName => (d === -1 ? 'nether' : d === 1 ? 'end' : 'overworld');
const structRows = STRUCTURES.map((s) => {
  const l = document.createElement('label');
  l.className = 'opt';
  l.dataset.dim = String(s.dim ?? 0);
  if (s.bedrockApprox) l.dataset.approx = '';
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
const biomeRows = BIOMES.filter((b) => !b.underground).map((b) => {
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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setSideOpen(false); if (pinMode) setPinMode(false); } });

// --- what's new ---
const changelog = createChangelogSeen(CHANGELOG, seeds.list().length > 0);
const changelogDlg = $<HTMLDialogElement>('changelog');
const whatsNewBtn = $('whatsNew');
function refreshWhatsNewDot() {
  const n = changelog.unseen().length;
  whatsNewBtn.classList.toggle('hasNew', n > 0);
  openBtn.classList.toggle('hasNew', n > 0); // the button is hidden in the closed drawer on phones
  whatsNewBtn.title = n ? `${n} new update${n === 1 ? '' : 's'}` : '';
}
function renderChangelog() {
  const fresh = new Set(changelog.unseen().map((e) => e.id));
  const list = $('changelogList');
  list.innerHTML = '';
  for (const e of CHANGELOG) {
    const sec = document.createElement('section');
    sec.innerHTML = '<h3></h3><time></time><ul></ul>';
    sec.querySelector('h3')!.textContent = e.title;
    if (fresh.has(e.id)) sec.querySelector('h3')!.insertAdjacentHTML('beforeend', ' <span class="newTag">New</span>');
    const time = sec.querySelector('time')!;
    time.dateTime = e.date;
    time.textContent = new Date(`${e.date}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    for (const item of e.items) sec.querySelector('ul')!.append(Object.assign(document.createElement('li'), { textContent: item }));
    list.append(sec);
  }
}
whatsNewBtn.onclick = () => {
  renderChangelog(); // before marking seen, so the "New" tags show this once
  changelog.markSeen();
  refreshWhatsNewDot();
  changelogDlg.showModal();
};
$('closeChangelog').onclick = () => changelogDlg.close();
// click on the backdrop (outside the dialog box) closes it
changelogDlg.onclick = (e) => { if (e.target === changelogDlg) changelogDlg.close(); };
refreshWhatsNewDot();

// --- HUD ---
map.onHover = (x, z, biome) => ($('coords').textContent = `X ${x}  Z ${z}${biome ? ' · ' + biome : ''}`);
map.onStatus = (m) => ($('status').textContent = m);
map.onSelect = (f) => {
  selected = f;
  renderPick();
};
function renderPick(saved = activeSeed()) {
  const el = $('pick');
  const pin = selectedPin ? saved?.pins.find((p) => p.id === selectedPin) : undefined;
  if (saved && pin) return renderPinPick(el, saved, pin);
  const f = selected;
  el.hidden = !f;
  if (!f) return;
  const def = STRUCTURES.find((s) => s.type === f.type)!;
  el.innerHTML = `<b>${def.icon} ${def.name}</b><br>X ${f.x}, Z ${f.z}<br><code>/tp @s ${f.x} ~ ${f.z}</code>`;
  if (def.dim !== 1) el.append(portalPick(structureKey(f.type, f.x, f.z), f, def.dim === -1 ? 'nether' : 'overworld'));
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
function renderPinPick(el: HTMLElement, saved: SavedSeed, p: Pin) {
  el.hidden = false;
  el.innerHTML = `<b></b><br>X ${p.x}, Z ${p.z}<br><code>/tp @s ${p.x} ~ ${p.z}</code>`;
  el.querySelector('b')!.textContent = `📍 ${p.name}`;
  if (p.dimension !== 'end') el.append(portalPick(`pin:${p.id}`, p, p.dimension));
  const row = document.createElement('div');
  row.className = 'row';
  for (const [label, fn] of [['Rename', renamePin], ['Remove', removePin]] as const) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'alt';
    btn.textContent = label;
    btn.onclick = () => fn(saved, p);
    row.append(btn);
  }
  el.append(row);
}
/** Structure or pin whose portal coordinates are showing in the popup, so re-renders (e.g. Mark visited) keep them. */
let portalShownFor: string | null = null;
/** "Portal coords" button for the selected marker; once clicked, the matching spot in the other dimension. */
function portalPick(key: string, f: { x: number; z: number }, from: 'overworld' | 'nether') {
  const to = from === 'overworld' ? 'nether' : 'overworld';
  const wrap = document.createElement('div');
  wrap.className = 'pickPortal';
  if (portalShownFor !== key) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'alt';
    btn.textContent = `${to === 'nether' ? 'Nether' : 'Overworld'} portal coords`;
    btn.onclick = () => { portalShownFor = key; fillPortal(from, f.x, f.z); renderPick(); };
    wrap.append(btn);
    return wrap;
  }
  const at = from === 'overworld' ? toNether(f.x, f.z) : toOverworld(f.x, f.z);
  wrap.innerHTML = `<span>${to === 'nether' ? 'Nether' : 'Overworld'}: X ${at.x}, Z ${at.z}</span>`;
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'alt';
  go.textContent = `Show in ${to === 'nether' ? 'Nether' : 'Overworld'}`;
  go.onclick = () => showPortal(to);
  wrap.append(go);
  return wrap;
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

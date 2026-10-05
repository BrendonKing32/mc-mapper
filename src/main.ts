import './style.css';
import { seedsApi, type SavedSeed } from './api';
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
  const dim = dimIn.value === 'nether' ? -1 : 0;
  map.setWorld(mc, lo, hi, largeIn.checked, dim);
  const q = new URLSearchParams({ seed: seedIn.value, edition, version: verIn.value, dimension: dimIn.value });
  history.replaceState(null, '', `?${q}`);
}
$('seedForm').onsubmit = (e) => { e.preventDefault(); generate(); };
dimIn.onchange = () => filterStructsByDim();

// --- saved seeds ---
const savedEl = $('saved');
async function refreshSaved() {
  const list = await seedsApi.list();
  savedEl.innerHTML = '';
  if (!list.length) savedEl.innerHTML = '<li style="color:var(--muted);cursor:default">No saved seeds yet</li>';
  for (const s of list) savedEl.append(savedRow(s));
}
function savedRow(s: SavedSeed) {
  const li = document.createElement('li');
  li.innerHTML = `<div class="meta"><b></b><small></small></div><button title="Rename">✎</button><button title="Delete">✕</button>`;
  li.querySelector('b')!.textContent = s.name;
  li.querySelector('small')!.textContent = `${s.seed} · ${s.edition} ${s.version}${s.dimension === 'nether' ? ' · Nether' : ''}`;
  li.onclick = () => load(s);
  const [ren, del] = li.querySelectorAll('button');
  ren.onclick = async (e) => {
    e.stopPropagation();
    const name = prompt('Rename seed', s.name);
    if (name?.trim()) { await seedsApi.rename(s.id, name.trim()); refreshSaved(); }
  };
  del.onclick = async (e) => {
    e.stopPropagation();
    if (confirm(`Delete "${s.name}"?`)) { await seedsApi.remove(s.id); refreshSaved(); }
  };
  return li;
}
function load(s: { seed: string; edition: Edition; version: string; dimension?: string }) {
  seedIn.value = s.seed; edIn.value = s.edition; fillVersions(s.version);
  dimIn.value = s.dimension === 'nether' ? 'nether' : 'overworld';
  filterStructsByDim();
  generate();
}
$('save').onclick = async () => {
  if (!seedIn.value.trim()) return;
  const name = prompt('Name for this seed', seedIn.value.trim());
  if (name === null) return;
  await seedsApi.add({ name: name.trim() || seedIn.value.trim(), seed: seedIn.value.trim(), edition: edIn.value as Edition, version: verIn.value, dimension: dimIn.value as 'overworld' | 'nether', notes: '' });
  refreshSaved();
};

// --- structure + biome filters ---
const structOn = new Set([...STRUCTURES.slice(0, 5), ...STRUCTURES.filter((s) => s.key === 'fortress' || s.key === 'bastion')].map((s) => s.type));
const overworldEl = $('structsOverworld'), netherEl = $('structsNether');
const structRows = STRUCTURES.map((s) => {
  const l = document.createElement('label');
  l.className = 'opt';
  l.dataset.dim = String(s.dim ?? 0);
  l.innerHTML = `<input type="checkbox" ${structOn.has(s.type) ? 'checked' : ''}><i style="background:${s.color}"></i>${s.name}`;
  l.querySelector('input')!.onchange = (e) => {
    (e.target as HTMLInputElement).checked ? structOn.add(s.type) : structOn.delete(s.type);
    map.setStructures(new Set(structOn));
  };
  (s.dim === -1 ? netherEl : overworldEl).append(l);
  return l;
});
map.setStructures(new Set(structOn));
function filterStructsByDim() {
  const dim = dimIn.value === 'nether' ? '-1' : '0';
  for (const r of structRows) r.classList.toggle('otherDim', r.dataset.dim !== dim);
}
filterStructsByDim();

const biomeOn = new Set<number>();
const biomeEl = $('biomes');
const biomeRows = BIOMES.map((b) => {
  const l = document.createElement('label');
  l.className = 'opt';
  l.dataset.name = b.name.toLowerCase();
  l.innerHTML = `<input type="checkbox"><i style="background:rgb(${b.color})"></i>${b.name}`;
  l.querySelector('input')!.onchange = (e) => {
    (e.target as HTMLInputElement).checked ? biomeOn.add(b.id) : biomeOn.delete(b.id);
    map.setBiomeFilter(new Set(biomeOn));
  };
  biomeEl.append(l);
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

// --- HUD ---
map.onHover = (x, z, biome) => ($('coords').textContent = `X ${x}  Z ${z}${biome ? ' · ' + biome : ''}`);
map.onStatus = (m) => ($('status').textContent = m);
map.onSelect = (f) => {
  const el = $('pick');
  el.hidden = !f;
  if (f) {
    const def = STRUCTURES.find((s) => s.type === f.type)!;
    el.innerHTML = `<b>${def.name}</b><br>X ${f.x}, Z ${f.z}<br><code>/tp @s ${f.x} ~ ${f.z}</code>`;
  }
};
$('goto').onsubmit = (e) => {
  e.preventDefault();
  const x = parseInt($<HTMLInputElement>('gx').value), z = parseInt($<HTMLInputElement>('gz').value);
  if (!isNaN(x) && !isNaN(z)) map.goTo(x, z);
};
$('spawn').onclick = () => map.goToSpawn();

// --- boot: seed from URL, else first saved ---
refreshSaved();
const q = new URLSearchParams(location.search);
if (q.get('seed')) load({ seed: q.get('seed')!, edition: (q.get('edition') as Edition) || 'java', version: q.get('version') || '', dimension: q.get('dimension') || '' });

// Preview do cenário: veja todos os assets por categoria, com variantes, escala e etapas de obra.
// Parâmetros de URL: ?cat=casas &asset=casa_simples &variants=1 &scale=1 &rotate=1 &auto=1 &p=0.5 &t=3 &cam=0 &time=dia

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  SCENERY, SCENERY_IDS, CATEGORIES, makeScenery, setProgress, updateScenery, rollWheels, sceneryBox,
  setupEnvironment, makePreset, playClip,
} from '../assets/index.js';

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const showError = (msg) => { $('info').innerHTML = `<b style="color:#ffb4b4">Erro:</b> ${msg}`; };
addEventListener('error', (e) => showError(e.message));
addEventListener('unhandledrejection', (e) => showError(String(e.reason)));

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
} catch (e) {
  showError(`não foi possível iniciar o WebGL (${e.message}). Ative a aceleração de hardware do navegador e recarregue.`);
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 600);
const controls = new OrbitControls(camera, renderer.domElement);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: '#b9c79a', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.04;
ground.receiveShadow = true;
scene.add(ground);

let env = null;
let envArea = 0;
function applyEnvironment(time, area) {
  if (env) scene.remove(env.sun, env.hemi);
  env = setupEnvironment(scene, { time, area, fogFar: 900 });
  envArea = area;
}

const group = new THREE.Group();
scene.add(group);
let items = []; // { obj, def, id, variant, tag, size, scaleChar }

// ---- UI ----
for (const [k, v] of Object.entries(CATEGORIES)) $('cat').add(new Option(v, k));
function fillAssets() {
  const cat = $('cat').value;
  $('asset').innerHTML = '';
  $('asset').add(new Option('— todos desta categoria —', ''));
  for (const id of SCENERY_IDS) if (SCENERY[id].category === cat) $('asset').add(new Option(SCENERY[id].label, id));
}
$('cat').value = q.get('cat') || 'casas';
fillAssets();
if (q.get('asset')) {
  const a = SCENERY[q.get('asset')];
  if (a) { $('cat').value = a.category; fillAssets(); $('asset').value = q.get('asset'); }
}
$('variants').checked = q.get('variants') === '1';
$('scale').checked = q.get('scale') === '1';
$('rotate').checked = q.get('rotate') === '1';
$('auto').checked = q.has('auto') ? q.get('auto') === '1' : $('cat').value === 'obra';
if (q.get('time')) $('time').value = q.get('time');
$('progress').value = q.get('p') ?? ($('cat').value === 'obra' ? 1 : 0);

let time = Number(q.get('t') ?? 0);
let paused = q.has('t');
let camIndex = Number(q.get('cam') ?? 0);

// ---- montagem ----
function clearTags() {
  $('tags').innerHTML = '';
}

function build() {
  group.clear();
  clearTags();
  items = [];
  const cat = $('cat').value;
  const only = $('asset').value;
  const ids = only ? [only] : SCENERY_IDS.filter((id) => SCENERY[id].category === cat);
  const entries = [];
  for (const id of ids) {
    entries.push({ id, variant: null });
    if ($('variants').checked) for (const v of Object.keys(SCENERY[id].variants || {})) entries.push({ id, variant: v });
  }

  let cursor = 0;
  let maxZ = 0;
  let maxH = 0;
  for (const e of entries) {
    const obj = makeScenery(e.id, e.variant ? { variant: e.variant } : {});
    const b = sceneryBox(obj);
    const size = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
    const holder = new THREE.Group();
    obj.position.set(-c.x, 0, -c.z);
    holder.add(obj);
    holder.position.x = cursor + size.x / 2;
    cursor += size.x + Math.max(1.5, size.x * 0.18);
    group.add(holder);

    const def = SCENERY[e.id];
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = def.label + (e.variant ? ` · ${e.variant}` : '');
    $('tags').appendChild(tag);

    let ch = null;
    if ($('scale').checked) {
      ch = makePreset('construtor');
      ch.root.position.set(holder.position.x - size.x / 2 - 0.9, 0, size.z / 2 - 0.2);
      ch.root.rotation.y = 0.5;
      group.add(ch.root);
    }
    items.push({ holder, obj, e, def, size, tag, ch });
    maxZ = Math.max(maxZ, size.z);
    maxH = Math.max(maxH, size.y);
  }
  const total = cursor - Math.max(1.5, 0);
  group.position.x = -(total - 1.5) / 2;
  for (const it of items) it.tag.dataset.z = String(it.size.z);

  group.userData.extent = { w: total, h: maxH, d: maxZ };
  const area = Math.max(10, Math.max(total, maxZ) * 0.7);
  applyEnvironment($('time').value, area);
  setCamera(camIndex);
  updateInfo();
  const animatable = items.some((it) => it.obj.userData.setProgress);
  $('progress').parentElement.style.display = animatable ? '' : 'none';
  $('auto').parentElement.style.display = animatable ? '' : 'none';
}

function setCamera(i) {
  camIndex = ((i % 3) + 3) % 3;
  const { w, h, d } = group.userData.extent;
  const fovV = THREE.MathUtils.degToRad(camera.fov);
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
  const dist = Math.max((w / 2 + 1) / Math.tan(fovH / 2), (h / 2 + 1.5) / Math.tan(fovV / 2), d * 0.9) + d / 2;
  const target = new THREE.Vector3(0, Math.min(h * 0.4, 18), 0);
  const dirs = [new THREE.Vector3(0, 0.38, 1), new THREE.Vector3(0.75, 0.55, 0.9), new THREE.Vector3(0, 1.4, 0.6)];
  camera.position.copy(target).addScaledVector(dirs[camIndex].normalize(), dist);
  camera.far = Math.max(600, dist * 8);
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.update();
}

function updateInfo() {
  const cat = $('cat').value;
  const only = $('asset').value;
  if (only) {
    const def = SCENERY[only];
    const it = items[0];
    const s = it.size;
    const params = Object.entries(def.params || {}).map(([k, v]) => `<code>${k}</code>`).join(', ');
    const vars = Object.keys(def.variants || {}).join(', ');
    $('info').innerHTML = `<b>${def.label}</b> (<code>${only}</code>)<br>${def.description}<br>` +
      `<br>Tamanho: ${s.x.toFixed(1)} × ${s.z.toFixed(1)} m, altura ${s.y.toFixed(1)} m` +
      (params ? `<br>Parâmetros: ${params}` : '') + (vars ? `<br>Variantes: ${vars}` : '');
  } else {
    const n = SCENERY_IDS.filter((id) => SCENERY[id].category === cat).length;
    $('info').innerHTML = `<b>${CATEGORIES[cat]}</b>: ${n} assets. Escolha um asset para ver os detalhes.`;
  }
}

for (const id of ['cat']) $(id).onchange = () => {
  fillAssets();
  const obra = $('cat').value === 'obra';
  $('auto').checked = obra;
  $('progress').value = obra ? 1 : 0; // fora de "obra" o controle só abre a caçamba do caminhão, então começa em 0
  build();
};
for (const id of ['asset', 'variants', 'scale']) $(id).onchange = build;
$('time').onchange = () => applyEnvironment($('time').value, envArea);
$('cam').onclick = () => setCamera(camIndex + 1);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

window.__setTime = (t) => { paused = true; time = t; };
build();

// ---- loop ----
const v = new THREE.Vector3();
let last = performance.now();
function frame() {
  const now = performance.now();
  if (!paused) time += Math.min(0.1, (now - last) / 1000);
  last = now;

  const auto = $('auto').checked;
  const prog = auto ? 0.5 - 0.5 * Math.cos(time * 0.45) : Number($('progress').value);
  if (auto) $('progress').value = prog.toFixed(2);

  const rowEnd = []; // etiquetas que se sobrepõem descem para a linha seguinte
  for (const it of items) {
    if (it.obj.userData.setProgress) setProgress(it.obj, prog);
    updateScenery(it.obj, time);
    if (it.def.category === 'veiculos' || it.e.id === 'carrinho_mao') rollWheels(it.obj, time * 3);
    if ($('rotate').checked) it.holder.rotation.y = time * 0.5;
    else it.holder.rotation.y = 0;
    if (it.ch) playClip(it.ch, 'idle', time);

    v.set(it.holder.position.x + group.position.x, 0, it.size.z / 2 + 0.6);
    v.project(camera);
    const sx = (v.x * 0.5 + 0.5) * innerWidth;
    const tw = it.tag.offsetWidth || 90;
    let row = 0;
    while (rowEnd[row] !== undefined && sx - tw / 2 < rowEnd[row] + 6) row++;
    rowEnd[row] = sx + tw / 2;
    it.tag.style.left = `${sx}px`;
    it.tag.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight + 4 + row * 24}px`;
    it.tag.style.display = v.z < 1 ? '' : 'none';
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
window.__ready = true;

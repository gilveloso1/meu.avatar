// Preview interativo: veja todos os personagens e teste cada animação/expressão.
// Parâmetros de URL (úteis para capturas): ?view=lineup|single &char=construtor &clip=walk &expr=happy &t=0.25 &cam=0|1|2 &move=1

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PRESET_NAMES, PRESETS, makePreset, CLIPS, CLIP_NAMES, EXPRESSIONS, playClip, moveSpeed } from '../assets/index.js';

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// Mostra qualquer erro na própria página (em vez de deixá-la em branco).
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
scene.background = new THREE.Color('#9fd3f2');
scene.fog = new THREE.Fog('#9fd3f2', 18, 40);

scene.add(new THREE.HemisphereLight('#ffffff', '#8fa077', 1.1));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(4, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 6, bottom: -6, near: 1, far: 30 });
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#b9c79a', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(40, 40, '#9aa882', '#a7b58c');
grid.position.y = 0.002;
scene.add(grid);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;

// ---- personagens ----
const group = new THREE.Group();
scene.add(group);
let chars = [];
const SPACING = 1.15;

function rebuild() {
  group.clear();
  chars = [];
  const names = $('view').value === 'single' ? [$('char').value] : PRESET_NAMES;
  const gap = $('view').value === 'single' ? 0 : SPACING;
  names.forEach((name, i) => {
    const c = makePreset(name);
    const x = (i - (names.length - 1) / 2) * gap;
    c.root.position.set(x, 0, 0);
    c.baseX = x;
    group.add(c.root);
    chars.push(c);
  });
  setCamera(Number(q.get('cam') ?? camIndex));
  updateInfo();
}

const camIndex0 = 0;
let camIndex = camIndex0;
function setCamera(i) {
  camIndex = i % 3;
  const single = $('view').value === 'single';
  const span = single ? 1 : PRESET_NAMES.length * SPACING;
  const dist = single ? 3.4 : span * 1.15 + 2;
  const target = new THREE.Vector3(0, single ? 0.85 : 0.8, 0);
  const presets = [
    new THREE.Vector3(0, single ? 1.2 : 1.6, dist),                // frente
    new THREE.Vector3(dist * 0.5, single ? 1.4 : 2.4, dist * 0.8), // 3/4
    new THREE.Vector3(-dist * 0.55, single ? 1.3 : 2.2, -dist * 0.7), // costas
  ];
  camera.position.copy(presets[camIndex]);
  controls.target.copy(target);
  controls.update();
}

// ---- UI ----
for (const n of PRESET_NAMES) $('char').add(new Option(n, n));
for (const n of CLIP_NAMES) $('clip').add(new Option(n, n));
for (const n of Object.keys(EXPRESSIONS)) $('expr').add(new Option(n, n));
if (q.get('view')) $('view').value = q.get('view');
if (q.get('char')) $('char').value = q.get('char');
if (q.get('clip')) $('clip').value = q.get('clip');
if (q.get('expr')) $('expr').value = q.get('expr');

function updateInfo() {
  const clip = CLIPS[$('clip').value];
  const single = $('view').value === 'single';
  const role = single ? `<b>${$('char').value}</b>: ${PRESETS[$('char').value].role}<br>` : '';
  const speed = clip.metersPerSecond ? `<br>deslocamento: ${clip.metersPerSecond} m/s` : '';
  $('info').innerHTML = `${role}<b>${$('clip').value}</b> (${clip.loop ? 'loop' : 'uma vez'}, ${clip.duration}s): ${clip.description}${speed}`;
}
$('view').onchange = rebuild;
$('char').onchange = rebuild;
$('clip').onchange = updateInfo;
$('cam').onclick = () => setCamera(camIndex + 1);
let paused = q.has('t');
let time = Number(q.get('t') ?? 0);
$('play').onclick = () => { paused = !paused; $('play').textContent = paused ? 'Tocar' : 'Pausar'; };
$('play').textContent = paused ? 'Tocar' : 'Pausar';

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// Para capturas determinísticas: window.__setTime(1.25)
window.__setTime = (t) => { paused = true; time = t; };

rebuild();

let last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) time += dt * Number($('speed').value);
  const name = $('clip').value;
  const clip = CLIPS[name];
  const t = clip.loop ? time : time % (clip.duration + 1.2);
  for (const c of chars) {
    playClip(c, name, t, { expression: $('expr').value === 'neutral' ? undefined : $('expr').value });
    if (q.get('move') === '1' && clip.metersPerSecond) {
      const z = ((moveSpeed(c, name) * time + 4) % 8) - 4;
      c.root.position.z = z;
    } else {
      c.root.position.z = 0;
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
window.__ready = true;

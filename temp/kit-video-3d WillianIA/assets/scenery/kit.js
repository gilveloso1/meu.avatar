// Base do cenário: registro de assets, helpers de modelagem e ambiente (céu, luz).
//
// Convenções (as mesmas dos personagens):
//  - Metros. O asset fica centrado no chão (origem no centro da base, y = 0 é o chão).
//  - A "frente" do asset (porta, fachada, frente do veículo) aponta para +Z.
//  - Visual: peças arredondadas/chanfradas com sombreamento facetado (low-poly), cores chapadas.

import * as THREE from 'three';
import { mat, rbox, sphere, cylinder, ico, mesh } from '../characters/helpers.js';

export { mat, rbox, sphere, cylinder, ico, mesh };

export const PAL = {
  grass: '#7fc15a', grass2: '#72b44e', soil: '#8a5f3a', clay: '#b3703f', rock: '#8e9196',
  asphalt: '#3b3d42', sidewalk: '#cfcfc8', curb: '#b4b4ae', concrete: '#bdbdb7', brick: '#b8573b',
  wood: '#a9743f', woodDark: '#7a4a2b', metal: '#7b8794', white: '#f4f4ef', glass: '#8ecae6',
  yellow: '#f2c94c', orange: '#f28c28', red: '#d9473a', blue: '#3d6fb6', green: '#4f9d5a',
};

// ---------- registro ----------
// Cada asset: { category, label, description, params: { nome: [padrão, descrição] }, variants, make(grupo, params) }
export const SCENERY = {};
export const CATEGORIES = {
  casas: 'Casas',
  predios: 'Prédios e pontes',
  obra: 'Em construção (animáveis)',
  arvores: 'Árvores e plantas',
  ruas: 'Ruas e terreno',
  veiculos: 'Veículos',
  objetos: 'Objetos de rua e obra',
  formas: 'Formas e peças livres (para montar qualquer coisa)',
  maquinas: 'Máquinas e processos animados',
};

export function register(id, def) {
  SCENERY[id] = def;
}

// makeScenery('casa_simples', { variant: 'verde', wall: '#ffffff' }) → THREE.Group pronto para scene.add()
export function makeScenery(id, overrides = {}) {
  const def = SCENERY[id];
  if (!def) throw new Error(`Asset de cenário desconhecido: "${id}". Opções: ${Object.keys(SCENERY).join(', ')}`);
  const { variant, ...rest } = overrides;
  if (variant && !def.variants?.[variant]) {
    throw new Error(`Variante "${variant}" não existe em "${id}". Opções: ${Object.keys(def.variants || {}).join(', ') || '(nenhuma)'}`);
  }
  const base = Object.fromEntries(Object.entries(def.params || {}).map(([k, v]) => [k, v[0]]));
  const p = { ...base, ...(variant ? def.variants[variant] : {}), ...rest };
  const g = new THREE.Group();
  g.name = `cenario:${id}`;
  def.make(g, p);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.scenery = { id, params: p, category: def.category };
  return g;
}

// Etapa de obra 0..1 (casa_obra, predio_estrutura, rua_camadas, corte_terreno).
export function setProgress(obj, p) {
  if (!obj.userData.setProgress) throw new Error(`"${obj.name}" não tem etapas (setProgress).`);
  obj.userData.setProgress(Math.min(1, Math.max(0, p)));
}

// Movimento contínuo em função do tempo (ex.: tambor da betoneira). Não faz nada se o asset não tem.
export function updateScenery(obj, t) {
  if (obj.userData.update) obj.userData.update(t);
}

// Gira as rodas de um veículo conforme a distância andada (metros).
export function rollWheels(vehicle, distance) {
  vehicle.traverse((o) => {
    if (o.userData.wheelRadius) o.rotation.x = distance / o.userData.wheelRadius;
  });
}

export function sceneryBox(obj) {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}

// ---------- aleatório com semente (formas variadas mas reproduzíveis) ----------
export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- helpers de modelagem ----------
const dmats = new Map();
export function matDouble(color) {
  let m = dmats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    dmats.set(color, m);
  }
  return m;
}

// Caixa chanfrada com a BASE em y (x, z = centro). Retorna a malha.
export function bx(parent, color, w, h, d, x = 0, y = 0, z = 0, r = 0.03) {
  return mesh(rbox(w, h, d, r), color, { pos: [x, y + h / 2, z], parent });
}

// Cilindro vertical com a base em y.
export function cyl(parent, color, rTop, rBottom, h, x = 0, y = 0, z = 0, seg = 10) {
  return mesh(cylinder(rTop, rBottom, h, seg), color, { pos: [x, y + h / 2, z], parent });
}

// Esfera facetada (copas, arbustos). Centro em (x, y, z).
export function ball(parent, color, r, x, y, z, scale = [1, 1, 1], detail = 1) {
  return mesh(ico(detail), color, { pos: [x, y, z], scale: [r * scale[0], r * scale[1], r * scale[2]], parent });
}

// Malha a partir de triângulos [[x,y,z],[x,y,z],[x,y,z]] (face dupla: sem se preocupar com a ordem).
export function tris(parent, color, list) {
  const pos = [];
  for (const t of list) for (const v of t) pos.push(...v);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, matDouble(color));
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Roda: grupo que gira em torno do eixo X. userData.wheelRadius permite rollWheels().
export function wheel(parent, x, y, z, r = 0.35, w = 0.25, tire = '#26272b', hub = '#b9bcc2') {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.userData.wheelRadius = r;
  parent.add(g);
  const t = mesh(cylinder(r, r, w, 12), tire, { rot: [0, 0, Math.PI / 2], parent: g });
  mesh(cylinder(r * 0.55, r * 0.55, w + 0.02, 8), hub, { rot: [0, 0, Math.PI / 2], parent: g });
  mesh(rbox(w + 0.04, r * 0.18, r * 0.9, 0.01), hub, { parent: g });
  return g;
}

// Janela simples na fachada: z = 0 é a parede, +z sai dela. (x, y) = centro da janela.
export function win(parent, w, h, x, y, { frame = PAL.white, glass = PAL.glass, sill = true, shutter = null } = {}) {
  bx(parent, frame, w + 0.16, h + 0.16, 0.06, x, y - h / 2 - 0.08, 0.03, 0.02);
  bx(parent, glass, w, h, 0.05, x, y - h / 2, 0.06, 0.01);
  bx(parent, frame, 0.05, h, 0.06, x, y - h / 2, 0.08, 0.01);
  if (sill) bx(parent, frame, w + 0.3, 0.07, 0.18, x, y - h / 2 - 0.15, 0.09, 0.02);
  if (shutter) for (const sx of [-1, 1]) bx(parent, shutter, w * 0.34, h, 0.05, x + sx * (w / 2 + w * 0.17 + 0.08), y - h / 2, 0.04, 0.01);
}

// Janela simples e barata (2 malhas) para prédios com muitas janelas.
export function winLite(parent, w, h, x, y, frame = PAL.white, glass = PAL.glass) {
  bx(parent, frame, w + 0.14, h + 0.14, 0.05, x, y - h / 2 - 0.07, 0.025, 0.02);
  bx(parent, glass, w, h, 0.05, x, y - h / 2, 0.05, 0.01);
}

export function door(parent, w, h, x, color = PAL.woodDark, frame = PAL.white) {
  bx(parent, frame, w + 0.2, h + 0.1, 0.07, x, 0, 0.035, 0.02);
  bx(parent, color, w, h, 0.07, x, 0, 0.06, 0.02);
  mesh(sphere(0.05), '#d8c36a', { pos: [x + w * 0.35, h * 0.48, 0.12], parent });
}

// Grupo "fachada" encostado na parede de uma caixa w × d (centrada), olhando para fora.
// side: 'front' (+Z), 'back' (-Z), 'east' (+X), 'west' (-X). Dentro dele, z = 0 é a parede e x corre ao longo dela.
export function facade(parent, side, w, d) {
  const g = new THREE.Group();
  const cfg = {
    front: [0, d / 2, 0], back: [0, -d / 2, Math.PI], east: [w / 2, 0, Math.PI / 2], west: [-w / 2, 0, -Math.PI / 2],
  }[side];
  g.position.set(cfg[0], 0, cfg[1]);
  g.rotation.y = cfg[2];
  parent.add(g);
  return g;
}

// Telhado de duas águas com cumeeira ao longo de X (largura l), vão s (profundidade), altura h acima de y.
export function gableRoof(parent, { roof, wall, l, s, h, y = 0, over = 0.4, t = 0.12 }) {
  const a = Math.atan2(h, s / 2);
  const len = (s / 2 + over) / Math.cos(a);
  const hs = s / 2;
  for (const sx of [-1, 1]) {
    tris(parent, wall, [[[sx * (l / 2 - 0.02), y, hs], [sx * (l / 2 - 0.02), y, -hs], [sx * (l / 2 - 0.02), y + h, 0]]]);
  }
  for (const sg of [-1, 1]) {
    mesh(rbox(l + over * 2, t, len, 0.02), roof, {
      pos: [0, y + (h - over * Math.tan(a)) / 2 + t / 2, (sg * (s / 2 + over)) / 2], rot: [sg * a, 0, 0], parent,
    });
  }
  bx(parent, roof, l + over * 2, 0.14, 0.3, 0, y + h - 0.02, 0, 0.04);
}

// Telhado de quatro águas (cumeeira ao longo de X).
export function hipRoof(parent, color, { l, s, h, y = 0, over = 0.4 }) {
  const L = l / 2 + over;
  const S = s / 2 + over;
  const yb = y - over * (h / (s / 2));
  const yt = y + h;
  const rl = Math.max(0.1, (l - s) / 2);
  tris(parent, color, [
    [[-L, yb, S], [L, yb, S], [rl, yt, 0]], [[-L, yb, S], [rl, yt, 0], [-rl, yt, 0]],
    [[-L, yb, -S], [L, yb, -S], [rl, yt, 0]], [[-L, yb, -S], [rl, yt, 0], [-rl, yt, 0]],
    [[L, yb, S], [L, yb, -S], [rl, yt, 0]],
    [[-L, yb, S], [-L, yb, -S], [-rl, yt, 0]],
  ]);
  bx(parent, color, rl * 2 + 0.3, 0.12, 0.25, 0, yt - 0.03, 0, 0.04);
}

// ---------- ambiente ----------
export const SKIES = {
  dia: { sky: '#9fd3f2', fog: 18, ground: '#8fa077', sun: '#fff4e0', sunI: 2.2, hemi: 1.1 },
  tarde: { sky: '#f4b98a', fog: 16, ground: '#8a7a62', sun: '#ffd0a0', sunI: 2.4, hemi: 0.8 },
  nublado: { sky: '#c4cdd6', fog: 14, ground: '#8a9288', sun: '#e6ecf2', sunI: 1.2, hemi: 1.5 },
};

// Luz, sombra e céu padrão do kit (para todos os vídeos ficarem com a mesma cara).
// Devolve { sun, hemi } para ajustar. `area` = metade do lado da região que recebe sombra.
export function setupEnvironment(scene, { time = 'dia', area = 12, fogFar = 60 } = {}) {
  const e = SKIES[time] || SKIES.dia;
  scene.background = new THREE.Color(e.sky);
  scene.fog = new THREE.Fog(e.sky, e.fog, fogFar);
  const hemi = new THREE.HemisphereLight('#ffffff', e.ground, e.hemi);
  const sun = new THREE.DirectionalLight(e.sun, e.sunI);
  sun.position.set(area * 0.5, area * 1.1, area * 0.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -area, right: area, top: area, bottom: -area, near: 1, far: area * 5 });
  scene.add(hemi, sun);
  return { sun, hemi };
}

// Troca o horário (céu, neblina e luz) de um ambiente já criado por setupEnvironment.
export function setEnvironmentTime(scene, env, time) {
  const e = SKIES[time] || SKIES.dia;
  scene.background = new THREE.Color(e.sky);
  if (scene.fog) { scene.fog.color.set(e.sky); scene.fog.near = e.fog; }
  env.hemi.color.set('#ffffff');
  env.hemi.groundColor.set(e.ground);
  env.hemi.intensity = e.hemi;
  env.sun.color.set(e.sun);
  env.sun.intensity = e.sunI;
}

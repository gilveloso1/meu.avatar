// makeCharacter(config): monta um personagem low-poly sobre o esqueleto único.
// Todos os personagens têm as MESMAS juntas (ver skeleton.js), então qualquer animação serve para qualquer um.
// Só mudam a "pele" (cores, roupa, cabelo, chapéu, rosto) e as proporções (height, build, headScale).

import * as THREE from 'three';
import { buildSkeleton, DIMS, headSurface } from './skeleton.js';
import { mat, rbox, sphere, cylinder, torus, ico, mesh } from './helpers.js';
import { addHair, addHat, addGlasses, addFacialHair, addHeld } from './parts.js';

export const DEFAULT_CONFIG = {
  name: 'pessoa',
  role: '',
  skin: '#e8b58a',
  height: 1,        // escala uniforme (adulto = 1, criança ≈ 0.65)
  build: 1,         // largura do corpo (0.85 magro ... 1.3 largo)
  headScale: 1,     // cabeça maior/menor
  top: { color: '#4a90d9', stripe: null, sleeves: 'short' },   // sleeves: short | long
  bottom: { color: '#3b4a6b', type: 'pants' },                 // type: pants | shorts | skirt
  shoes: '#4a3728',
  hair: { style: 'short', color: '#3b2a1e' },                  // ver HAIR_STYLES
  hat: { type: 'none', color: '#f5c518' },                     // ver HAT_TYPES
  face: { brow: '#2b1d14', mustache: false, beard: false, glasses: false, facialHairColor: '#2b1d14' },
  held: { R: 'none', L: 'none' },                              // ver HELD_ITEMS
  stoop: 0,         // graus de curvatura das costas em repouso (idosos ≈ 10)
};

function merge(base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') out[k] = merge(base[k], v);
    else out[k] = v;
  }
  return out;
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) / 1000;
}

export const FACE_DEFAULT = { eyeOpen: 1, browRaise: 0, browTilt: 0, smile: 0, mouthOpen: 0, look: [0, 0] };

// Constrói o rosto (olhos, sobrancelhas, nariz, boca) e devolve as peças móveis.
// Posições do rosto na cabeça redonda (x, y em coordenadas da junta "head").
const EYE_X = 0.1;
const EYE_Y = 0.24;
const BROW_Y = 0.315;
const MOUTH_Y = 0.09;

// Coloca um grupo deitado na superfície da cabeça (acompanha a curva) e guarda a posição base.
function placeOnHead(group, x, y, lift) {
  const s = headSurface(x, y, lift);
  group.position.set(...s.pos);
  group.rotation.order = 'YXZ';
  group.rotation.set(s.pitch, s.yaw, 0);
  group.userData.base = s.pos.slice();
}

function buildFace(head, skin, browColor) {
  const rig = { eyes: [], brows: [] };

  for (const sx of [1, -1]) {
    const eye = new THREE.Group();
    placeOnHead(eye, sx * EYE_X, EYE_Y, 0.004);
    head.add(eye);
    mesh(sphere(0.042), '#1d1a1a', { scale: [1, 1.25, 0.45], parent: eye });
    mesh(sphere(0.013), '#ffffff', { pos: [0.012 * sx, 0.018, 0.016], parent: eye });
    rig.eyes.push(eye);

    const brow = new THREE.Group();
    placeOnHead(brow, sx * EYE_X, BROW_Y, 0.006);
    head.add(brow);
    mesh(rbox(0.085, 0.022, 0.025, 0.01), browColor, { parent: brow });
    rig.brows.push(brow);

    mesh(sphere(0.045), skin, { pos: [sx * DIMS.head.rx * 0.98, DIMS.head.cy - 0.02, 0], scale: [0.6, 1, 0.8], parent: head });
  }
  const nose = headSurface(0, 0.17, 0.01);
  mesh(sphere(0.035), skin, { pos: nose.pos, scale: [1, 1, 0.9], parent: head });

  const mouth = new THREE.Group();
  placeOnHead(mouth, 0, MOUTH_Y, 0.004);
  head.add(mouth);
  rig.mouthLine = mesh(rbox(0.08, 0.014, 0.014, 0.005), '#3a1f1f', { parent: mouth });
  rig.mouthArc = new THREE.Group();
  mesh(torus(0.05, 0.009, Math.PI, 4, 10), '#3a1f1f', { parent: rig.mouthArc });
  mouth.add(rig.mouthArc);
  rig.mouthOpen = mesh(sphere(0.045), '#4a1818', { scale: [1, 0.01, 0.4], parent: mouth });
  return rig;
}

// Aplica um estado de rosto: { eyeOpen, browRaise, browTilt, smile, mouthOpen, look:[x,y] }
export function applyFaceState(character, state = {}) {
  const f = { ...FACE_DEFAULT, ...state };
  const rig = character.faceRig;
  const eyeOpen = THREE.MathUtils.clamp(f.eyeOpen, 0, 1.3);
  rig.eyes.forEach((eye, i) => {
    eye.scale.set(1, Math.max(0.08, eyeOpen), 1);
    const base = eye.userData.base;
    eye.position.x = base[0] + f.look[0] * 0.015;
    eye.position.y = base[1] + f.look[1] * 0.015;
  });
  rig.brows.forEach((brow, i) => {
    const sx = i === 0 ? 1 : -1;
    brow.position.y = brow.userData.base[1] + f.browRaise * 0.03;
    brow.rotation.z = sx * f.browTilt * THREE.MathUtils.degToRad(24);
  });
  const open = THREE.MathUtils.clamp(f.mouthOpen, 0, 1);
  const smile = THREE.MathUtils.clamp(f.smile, -1, 1);
  rig.mouthOpen.scale.set(1 + Math.max(0, smile) * 0.35, Math.max(0.01, open * 0.9), 0.4);
  rig.mouthOpen.visible = open > 0.05;
  rig.mouthLine.visible = open <= 0.05 && Math.abs(smile) < 0.25;
  rig.mouthArc.visible = open <= 0.05 && Math.abs(smile) >= 0.25;
  rig.mouthArc.rotation.z = smile >= 0 ? Math.PI : 0;
  rig.mouthArc.scale.set(1, 0.45 * Math.abs(smile) + 0.05, 1);
  rig.mouthArc.position.y = smile >= 0 ? 0.01 : -0.015;
}

export function makeCharacter(userConfig = {}) {
  const c = merge(DEFAULT_CONFIG, userConfig);
  const { root, joints } = buildSkeleton();
  const w = c.build;
  const D = DIMS;
  const long = c.top.sleeves === 'long';
  const bottomColor = c.bottom.color;
  const legsCovered = c.bottom.type === 'pants';

  // ---- tronco ----
  mesh(rbox(0.34 * w, 0.17, 0.22, 0.05), bottomColor, { pos: [0, 0.04, 0], parent: joints.hips });
  mesh(rbox(0.36 * w, 0.23, 0.23, 0.05), c.top.color, { pos: [0, 0.09, 0], parent: joints.spine });
  mesh(rbox(0.43 * w, 0.33, 0.26, 0.07), c.top.color, { pos: [0, 0.14, 0], parent: joints.chest });
  if (c.top.stripe) {
    mesh(rbox(0.445 * w, 0.045, 0.275, 0.012), c.top.stripe, { pos: [0, 0.2, 0], parent: joints.chest });
    mesh(rbox(0.445 * w, 0.045, 0.275, 0.012), c.top.stripe, { pos: [0, 0.07, 0], parent: joints.chest });
  }
  mesh(cylinder(0.05, 0.055, 0.1, 7), c.skin, { pos: [0, 0.03, 0], parent: joints.neck });

  // ---- braços ----
  for (const side of ['L', 'R']) {
    mesh(sphere(0.07 * Math.sqrt(w)), c.top.color, { pos: [0, 0, 0], parent: joints['arm' + side] });
    mesh(rbox(0.115 * w, 0.28, 0.115, 0.045), c.top.color, { pos: [0, -0.12, 0], parent: joints['arm' + side] });
    mesh(rbox(0.095 * w, 0.25, 0.095, 0.04), long ? c.top.color : c.skin, { pos: [0, -0.115, 0], parent: joints['forearm' + side] });
    mesh(sphere(0.055), c.skin, { pos: [0, -0.035, 0], parent: joints['hand' + side] });
  }

  // ---- pernas ----
  for (const side of ['L', 'R']) {
    mesh(rbox(0.145 * w, 0.32, 0.145, 0.05), c.bottom.type === 'skirt' ? c.skin : bottomColor, { pos: [0, -0.14, 0], parent: joints['leg' + side] });
    mesh(rbox(0.12 * w, 0.3, 0.12, 0.04), legsCovered ? bottomColor : c.skin, { pos: [0, -0.13, 0], parent: joints['shin' + side] });
    mesh(rbox(0.14 * w, 0.11, 0.25, 0.045), c.shoes, { pos: [0, -0.045, 0.05], parent: joints['foot' + side] });
  }
  if (c.bottom.type === 'skirt') {
    mesh(cylinder(0.2 * w, 0.28 * w, 0.26, 9), bottomColor, { pos: [0, -0.07, 0], parent: joints.hips });
  }

  // ---- cabeça ----
  const head = new THREE.Group();
  head.name = 'headGroup';
  head.scale.setScalar(c.headScale);
  joints.head.add(head);
  mesh(ico(2), c.skin, { pos: [0, D.head.cy, 0], scale: [D.head.rx, D.head.ry, D.head.rz], parent: head });
  const faceRig = buildFace(head, c.skin, c.face.brow);
  addHair(head, c.hair.style, c.hair.color, c.hat.type);
  addHat(head, c.hat.type, c.hat.color);
  if (c.face.glasses) addGlasses(head);
  addFacialHair(head, c.face, c.face.facialHairColor);

  addHeld(joints.handR, c.held.R);
  addHeld(joints.handL, c.held.L);

  // ---- escala e repouso ----
  root.scale.setScalar(c.height);
  const rest = {};
  const stoop = THREE.MathUtils.degToRad(c.stoop);
  if (stoop) {
    rest.spine = [stoop * 0.5, 0, 0];
    rest.chest = [stoop * 0.6, 0, 0];
    rest.head = [-stoop * 0.7, 0, 0];
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const character = {
    name: c.name,
    config: c,
    root,
    joints,
    faceRig,
    rest,
    seed: hashSeed(c.name),
    heightScale: c.height,
  };
  root.name = `personagem:${c.name}`;
  root.userData.character = character;
  applyFaceState(character, FACE_DEFAULT);
  return character;
}

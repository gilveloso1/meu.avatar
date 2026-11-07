// Acessórios do personagem: cabelo, chapéus, óculos, barba e itens nas mãos.
// A cabeça é um elipsoide quase esférico (ver DIMS.head em skeleton.js). Cabelo e chapéus são
// "cascas" de esfera um pouco maiores que a cabeça, então acompanham a curva sem atravessá-la.
// Coordenadas da cabeça: a junta "head" fica na base do pescoço; o centro está em y = cy.

import * as THREE from 'three';
import { DIMS, headSurface } from './skeleton.js';
import { rbox, sphere, cylinder, torus, shell, mesh } from './helpers.js';

export const HAIR_STYLES = ['bald', 'short', 'fringe', 'long', 'ponytail', 'bun', 'curly', 'sides'];
export const HAT_TYPES = ['none', 'hardhat', 'cap'];
export const HELD_ITEMS = ['none', 'hammer', 'clipboard', 'shovel'];

const H = DIMS.head;
const HAT_TILT = -0.3; // chapéu e cabelo inclinados para trás: a borda da frente sobe e libera a testa
const HAIR_TILT = -0.55;

// Casca de cabelo cobrindo a cabeça. Sem chapéu: coroa inteira; com chapéu: só a nuca (o chapéu cobre o topo).
function hairShell(parent, color, covered) {
  const g = new THREE.Group();
  g.position.set(0, H.cy, 0);
  g.rotation.x = covered ? HAT_TILT : HAIR_TILT;
  g.scale.set(H.rx * 1.07, H.ry * 1.07, H.rz * 1.07);
  parent.add(g);
  const geo = covered ? shell(1.25, 0.9, Math.PI, Math.PI) : shell(0, 1.75);
  mesh(geo, color, { parent: g });
}

// `hat`: tipo de chapéu em uso. Com chapéu o topo do cabelo some (senão atravessaria o chapéu).
export function addHair(parent, style, color, hat = 'none') {
  if (!style || style === 'bald') return;
  const covered = hat && hat !== 'none';
  const cy = H.cy;

  switch (style) {
    case 'short':
      hairShell(parent, color, covered);
      break;
    case 'fringe':
      hairShell(parent, color, covered);
      if (!covered) {
        const s = headSurface(0, 0.37, 0.012);
        mesh(rbox(0.34, 0.05, 0.05, 0.02), color, { pos: s.pos, rot: [s.pitch, 0, 0], parent });
      }
      break;
    case 'long':
      hairShell(parent, color, covered);
      mesh(rbox(0.4, 0.46, 0.1, 0.04), color, { pos: [0, 0.07, -0.2], parent });
      for (const sx of [1, -1]) mesh(rbox(0.06, 0.4, 0.2, 0.03), color, { pos: [sx * 0.235, 0.14, -0.04], parent });
      break;
    case 'ponytail':
      hairShell(parent, color, covered);
      mesh(sphere(0.045), '#d94f6a', { pos: [0, 0.3, -0.225], parent });
      mesh(rbox(0.09, 0.3, 0.09, 0.03), color, { pos: [0, 0.14, -0.27], rot: [-0.18, 0, 0], parent });
      break;
    case 'bun':
      hairShell(parent, color, covered);
      if (!covered) mesh(sphere(0.1), color, { pos: [0, cy + 0.235, -0.1], parent });
      break;
    case 'curly': {
      if (covered) { hairShell(parent, color, true); break; }
      // bolinhas distribuídas sobre o alto e as costas da cabeça
      const dirs = [[0, 1, 0], [0.5, 0.85, 0.1], [-0.5, 0.85, 0.1], [0.85, 0.5, -0.1], [-0.85, 0.5, -0.1],
        [0, 0.6, -0.8], [0.55, 0.55, -0.65], [-0.55, 0.55, -0.65], [0.6, 0.8, -0.1], [-0.6, 0.8, -0.1], [0, 0.85, 0.45]];
      for (const [x, y, z] of dirs) {
        mesh(sphere(0.095), color, { pos: [x * H.rx * 0.98, cy + y * H.ry * 0.98, z * H.rz * 0.98], parent });
      }
      break;
    }
    case 'sides': { // idoso: só nuca e laterais
      const g = new THREE.Group();
      g.position.set(0, cy, 0);
      g.rotation.x = -0.1;
      g.scale.set(H.rx * 1.06, H.ry * 1.06, H.rz * 1.06);
      parent.add(g);
      mesh(shell(1.35, 0.55, Math.PI, Math.PI), color, { parent: g });
      for (const sx of [1, -1]) mesh(rbox(0.05, 0.14, 0.26, 0.02), color, { pos: [sx * 0.232, 0.25, -0.02], parent });
      break;
    }
    default:
      break;
  }
}

export function addHat(parent, type, color) {
  if (!type || type === 'none') return;
  const g = new THREE.Group();
  g.position.set(0, H.cy, 0);
  g.rotation.x = HAT_TILT;
  parent.add(g);

  if (type === 'hardhat') {
    const th = 1.4; // abertura da calota, em radianos a partir do topo
    const [sx, sy, sz] = [H.rx * 1.1, H.ry * 1.12, H.rz * 1.1];
    mesh(shell(0, th, 0, Math.PI * 2, 12, 6), color, { scale: [sx, sy, sz], parent: g });
    const baseY = sy * Math.cos(th);
    const baseR = Math.sin(th);
    mesh(cylinder(1, 1, 0.03, 12), color, { pos: [0, baseY - 0.004, 0], scale: [sx * baseR * 1.02, 1, sz * baseR * 1.02], parent: g });
    mesh(rbox(0.3, 0.02, 0.14, 0.008), color, { pos: [0, baseY, sz * baseR + 0.07], rot: [0.12, 0, 0], parent: g });
    // faixa central: meio-anel acompanhando a curva da calota
    const ridge = new THREE.Group();
    ridge.rotation.y = Math.PI / 2;
    ridge.scale.set(sz * 1.03, sy * 1.03, 1);
    g.add(ridge);
    const arc = mesh(torus(1, 0.055, Math.PI - 0.5, 4, 14), color);
    arc.rotation.z = 0.25;
    ridge.add(arc);
  } else if (type === 'cap') {
    const th = 1.35;
    const [sx, sy, sz] = [H.rx * 1.08, H.ry * 1.08, H.rz * 1.08];
    mesh(shell(0, th, 0, Math.PI * 2, 12, 6), color, { scale: [sx, sy, sz], parent: g });
    const baseY = sy * Math.cos(th);
    const baseR = Math.sin(th);
    mesh(rbox(0.28, 0.02, 0.16, 0.008), color, { pos: [0, baseY - 0.005, sz * baseR + 0.07], rot: [0.14, 0, 0], parent: g });
    mesh(sphere(0.022), color, { pos: [0, sy * 1.0, 0], parent: g });
  }
}

export function addGlasses(parent, color = '#222222') {
  for (const sx of [1, -1]) {
    const s = headSurface(sx * 0.1, 0.24, 0.01);
    const ring = mesh(torus(0.055, 0.008, Math.PI * 2, 4, 10), color, { pos: s.pos, parent });
    ring.rotation.order = 'YXZ';
    ring.rotation.set(s.pitch, s.yaw, 0);
  }
  const b = headSurface(0, 0.245, 0.01);
  mesh(rbox(0.05, 0.01, 0.01, 0.004), color, { pos: b.pos, parent });
}

export function addFacialHair(parent, { beard, mustache }, color) {
  if (beard) {
    // casca no queixo, abaixo da boca (a boca fica em y ≈ 0.09)
    const g = new THREE.Group();
    g.position.set(0, H.cy, 0);
    g.scale.set(H.rx * 1.04, H.ry * 1.04, H.rz * 1.04);
    parent.add(g);
    mesh(shell(2.35, 0.7, 0, Math.PI, 12, 4), color, { parent: g });
  }
  if (mustache) {
    const s = headSurface(0, 0.135, 0.012);
    mesh(rbox(0.12, 0.028, 0.03, 0.01), color, { pos: s.pos, rot: [s.pitch, 0, 0], parent });
  }
}

// Itens ficam presos na junta da mão. O "grip" é o ponto de pegada.
export function addHeld(handJoint, kind) {
  if (!kind || kind === 'none') return;
  const wood = '#9b6a3c';
  const steel = '#6b6f76';
  if (kind === 'hammer') {
    // aponta para frente com o braço pendurado; vira "martelo para cima" com o braço levantado
    const g = new THREE.Object3D();
    g.position.set(0, -0.04, 0);
    g.rotation.x = -Math.PI / 2;
    handJoint.add(g);
    mesh(rbox(0.035, 0.3, 0.035, 0.012), wood, { pos: [0, -0.06, 0], parent: g });
    mesh(rbox(0.15, 0.07, 0.07, 0.02), steel, { pos: [0, -0.22, 0], parent: g });
  } else if (kind === 'clipboard') {
    const g = new THREE.Object3D();
    g.position.set(0, -0.02, 0.0);
    handJoint.add(g);
    mesh(rbox(0.22, 0.3, 0.02, 0.008), '#8a5a2b', { pos: [0, -0.1, 0.07], parent: g });
    mesh(rbox(0.18, 0.25, 0.012, 0.004), '#f5f5f0', { pos: [0, -0.1, 0.085], parent: g });
    mesh(rbox(0.08, 0.03, 0.02, 0.006), '#9aa0a6', { pos: [0, 0.04, 0.085], parent: g });
  } else if (kind === 'shovel') {
    const g = new THREE.Object3D();
    g.position.set(0, -0.04, 0);
    handJoint.add(g);
    mesh(rbox(0.035, 0.8, 0.035, 0.012), wood, { pos: [0, -0.2, 0], parent: g });
    mesh(rbox(0.09, 0.04, 0.04, 0.012), wood, { pos: [0, 0.2, 0], parent: g });
    mesh(rbox(0.16, 0.22, 0.025, 0.01), steel, { pos: [0, -0.7, 0], parent: g });
  }
}

// Ruas, cruzamento, chão e campo. As ruas correm ao longo de Z; a origem é o centro, y = 0 é o chão.

import * as THREE from 'three';
import { register, PAL, bx, cyl, rng, mesh, rbox } from './kit.js';

const CURB_H = 0.2;
const ASPHALT_H = 0.06;

register('rua_reta', {
  category: 'ruas',
  label: 'Rua reta',
  description: 'Trecho de rua com asfalto, faixa central, meio-fio e calçadas dos dois lados. Corre ao longo de Z.',
  params: {
    length: [20, 'comprimento em metros (ao longo de Z)'],
    lanes: [2, 'número de faixas (2 ou 4)'],
    laneWidth: [3.4, 'largura de cada faixa'],
    sidewalk: [2.2, 'largura da calçada (0 = sem calçada)'],
    crosswalk: [false, 'faixa de pedestre no meio'],
  },
  variants: { larga: { lanes: 4 }, sem_calcada: { sidewalk: 0 }, com_faixa: { crosswalk: true } },
  make(g, p) {
    const L = p.length;
    const rw = p.lanes * p.laneWidth;
    bx(g, PAL.asphalt, rw, ASPHALT_H, L, 0, 0, 0, 0.01);
    for (const sx of [-1, 1]) {
      bx(g, PAL.curb, 0.25, CURB_H, L, sx * (rw / 2 + 0.125), 0, 0, 0.03);
      if (p.sidewalk > 0) bx(g, PAL.sidewalk, p.sidewalk, CURB_H, L, sx * (rw / 2 + 0.25 + p.sidewalk / 2), 0, 0, 0.03);
      bx(g, '#f4f4f1', 0.12, 0.012, L, sx * (rw / 2 - 0.3), ASPHALT_H, 0, 0.005);
    }
    if (p.lanes >= 4) {
      for (const sx of [-0.12, 0.12]) bx(g, PAL.yellow, 0.1, 0.012, L, sx, ASPHALT_H, 0, 0.005);
      for (const sx of [-1, 1]) for (let z = -L / 2 + 1; z < L / 2 - 1; z += 4) bx(g, '#f4f4f1', 0.12, 0.012, 2, sx * p.laneWidth, ASPHALT_H, z, 0.005);
    } else {
      for (let z = -L / 2 + 1; z < L / 2 - 1; z += 4) bx(g, PAL.yellow, 0.14, 0.012, 2, 0, ASPHALT_H, z, 0.005);
    }
    if (p.crosswalk) for (let x = -rw / 2 + 0.6; x < rw / 2 - 0.3; x += 0.9) bx(g, '#f4f4f1', 0.5, 0.014, 3, x, ASPHALT_H, 0, 0.005);
  },
});

register('cruzamento', {
  category: 'ruas',
  label: 'Cruzamento',
  description: 'Encontro de duas ruas em cruz, com faixas de pedestre nas quatro pontas e quarteirões de calçada nos cantos. 7 m de pista, braços de 8 m.',
  params: {
    arm: [8, 'comprimento de cada braço a partir do centro do cruzamento'],
    lanes: [2, 'faixas por rua'],
  },
  variants: { longo: { arm: 14 } },
  make(g, p) {
    const rw = p.lanes * 3.5;
    const A = p.arm;
    bx(g, PAL.asphalt, rw, ASPHALT_H, A * 2 + rw, 0, 0, 0, 0.01);
    bx(g, PAL.asphalt, A * 2 + rw, ASPHALT_H - 0.006, rw, 0, 0, 0, 0.01);
    const off = rw / 2 + 0.25;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      bx(g, PAL.sidewalk, A, CURB_H, A, sx * (off + A / 2), 0, sz * (off + A / 2), 0.03);
      bx(g, PAL.curb, 0.25, CURB_H, A, sx * (rw / 2 + 0.125), 0, sz * (rw / 2 + 0.25 + A / 2), 0.03);
      bx(g, PAL.curb, A, CURB_H, 0.25, sx * (rw / 2 + 0.25 + A / 2), 0, sz * (rw / 2 + 0.125), 0.03);
    }
    for (const sg of [-1, 1]) {
      for (let x = -rw / 2 + 0.6; x < rw / 2 - 0.3; x += 0.9) {
        bx(g, '#f4f4f1', 0.5, 0.014, 2.6, x, ASPHALT_H, sg * (rw / 2 + 1.8), 0.005);
        bx(g, '#f4f4f1', 2.6, 0.014, 0.5, sg * (rw / 2 + 1.8), ASPHALT_H, x, 0.005);
      }
      for (let k = 0; k < 2; k++) {
        const o = rw / 2 + 4 + k * 4;
        bx(g, PAL.yellow, 0.14, 0.012, 2, 0, ASPHALT_H, sg * (o + 1), 0.005);
        bx(g, PAL.yellow, 2, 0.012, 0.14, sg * (o + 1), ASPHALT_H, 0, 0.005);
      }
    }
  },
});

const GROUND = {
  grama: { base: '#7fc15a', patch: ['#72b44e', '#8acb62', '#78bb55'] },
  terra: { base: '#8a5f3a', patch: ['#7c5532', '#98693f', '#85593a'] },
  areia: { base: '#e6d3a1', patch: ['#dcc78d', '#efdfb4', '#e2cf9a'] },
  concreto: { base: '#bdbdb7', patch: ['#b2b2ac', '#c8c8c2', '#b8b8b2'] },
  asfalto: { base: '#3b3d42', patch: ['#35373b', '#42444a', '#393b40'] },
};

register('chao', {
  category: 'ruas',
  label: 'Chão (terreno)',
  description: 'Placa de chão quadrada com manchas de cor: grama, terra, areia, concreto ou asfalto.',
  params: {
    type: ['grama', "'grama' | 'terra' | 'areia' | 'concreto' | 'asfalto'"],
    size: [20, 'lado da placa em metros'],
    seed: [1, 'varia as manchas'],
  },
  variants: { terra: { type: 'terra' }, areia: { type: 'areia' }, concreto: { type: 'concreto' }, asfalto: { type: 'asfalto' } },
  make(g, p) {
    const t = GROUND[p.type] || GROUND.grama;
    const r = rng(p.seed);
    bx(g, t.base, p.size, 0.3, p.size, 0, -0.3, 0, 0.02);
    const n = Math.round(p.size * 0.8);
    for (let i = 0; i < n; i++) {
      const w = 1 + r() * 2.5;
      const d = 1 + r() * 2.5;
      const x = (r() - 0.5) * (p.size - w);
      const z = (r() - 0.5) * (p.size - d);
      bx(g, t.patch[i % 3], w, 0.012 + (i % 3) * 0.002, d, x, 0, z, 0.005);
    }
  },
});

register('campo_futebol', {
  category: 'ruas',
  label: 'Campo de futebol',
  description: 'Gramado listrado com linhas brancas (área, círculo central) e duas traves. 40 × 26 m (reduzido).',
  params: {
    length: [40, 'comprimento (ao longo de Z)'],
    width: [26, 'largura (ao longo de X)'],
  },
  variants: { pequeno: { length: 28, width: 18 } },
  make(g, p) {
    const [L, W] = [p.length, p.width];
    bx(g, PAL.grass, W + 4, 0.3, L + 4, 0, -0.3, 0, 0.02);
    const n = 8;
    for (let i = 0; i < n; i++) bx(g, i % 2 ? '#6fb34c' : '#80c45a', W, 0.02, L / n, 0, 0, -L / 2 + (i + 0.5) * (L / n), 0.005);
    const line = (w, d, x, z) => bx(g, '#f4f4f1', w, 0.03, d, x, 0, z, 0.005);
    line(W, 0.18, 0, L / 2); line(W, 0.18, 0, -L / 2); line(0.18, L, W / 2, 0); line(0.18, L, -W / 2, 0);
    line(W, 0.18, 0, 0);
    const circ = mesh(new THREE.TorusGeometry(3.2, 0.09, 4, 24), '#f4f4f1', { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0], parent: g });
    for (const sz of [-1, 1]) {
      const a = W * 0.45;
      line(a, 0.18, 0, sz * (L / 2 - 5)); line(0.18, 5, a / 2, sz * (L / 2 - 2.5)); line(0.18, 5, -a / 2, sz * (L / 2 - 2.5));
      const z = sz * L / 2;
      for (const sx of [-1, 1]) cyl(g, '#f4f4f1', 0.07, 0.07, 2.4, sx * 3.6, 0, z, 6);
      bx(g, '#f4f4f1', 7.3, 0.14, 0.14, 0, 2.4, z, 0.02);
      bx(g, '#ffffff', 7.2, 2.3, 0.04, 0, 0, z + sz * 1.2, 0.01).material = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, roughness: 1 });
    }
  },
});

// Peças "em construção": cada uma tem setProgress(0..1) — o Claude controla a etapa pelo tempo (função pura).
//   casa_obra        fundação → pilares → paredes → laje → madeiramento → telhas
//   predio_estrutura andar por andar (pilares e lajes)
//   rua_camadas      camadas da pavimentação, de baixo para cima
//   corte_terreno    camadas do solo
//   guindaste        guindaste de obra (torre); setProgress gira a lança

import * as THREE from 'three';
import { register, PAL, bx, cyl, tris, mesh, rbox } from './kit.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const stage = (p, a, b) => clamp01((p - a) / (b - a));
// Cresce de baixo para cima (escala em y a partir da base do grupo) e some quando k = 0.
const grow = (grp, k) => { grp.visible = k > 0.001; grp.scale.y = Math.max(0.001, k); };

register('casa_obra', {
  category: 'obra',
  label: 'Casa em obra',
  description: 'Casa sendo construída: setProgress(p) mostra fundação (0–0.12), pilares (–0.25), paredes de tijolo (–0.55), laje (–0.65), madeiramento (–0.82) e telhas (–1). 6 × 7 m.',
  params: {
    progress: [1, 'etapa inicial 0..1 (depois use setProgress)'],
    brick: [PAL.brick, 'cor dos tijolos'],
    tile: ['#d2693a', 'cor das telhas'],
  },
  variants: { fundacao: { progress: 0.1 }, paredes: { progress: 0.45 }, madeiramento: { progress: 0.8 } },
  make(g, p) {
    const [w, d] = [6, 7];
    const found = new THREE.Group();
    g.add(found);
    for (const sz of [-1, 1]) bx(found, PAL.concrete, w + 0.4, 0.35, 0.4, 0, 0, sz * (d / 2), 0.04);
    for (const sx of [-1, 1]) bx(found, PAL.concrete, 0.4, 0.35, d, sx * (w / 2), 0, 0, 0.04);
    bx(found, PAL.concrete, 0.4, 0.35, d, 0, 0, 0, 0.04);
    const floor = bx(g, '#cfcfca', w, 0.12, d, 0, 0.35, 0, 0.02);

    const pillars = new THREE.Group();
    pillars.position.y = 0.47;
    g.add(pillars);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0]]) bx(pillars, '#a9a9a3', 0.28, 2.4, 0.28, x * (w / 2), 0, z * (d / 2), 0.03);

    const walls = new THREE.Group();
    walls.position.y = 0.47;
    g.add(walls);
    const wallH = 2.4;
    bx(walls, p.brick, w, wallH, 0.2, 0, 0, -d / 2, 0.02);
    for (const sx of [-1, 1]) bx(walls, p.brick, 0.2, wallH, d, sx * (w / 2), 0, 0, 0.02);
    for (const sx of [-1, 1]) bx(walls, p.brick, w / 2 - 0.6, wallH, 0.2, sx * (w / 4 + 0.3), 0, d / 2, 0.02);
    bx(walls, p.brick, 1.2, 0.5, 0.2, 0, 1.9, d / 2, 0.02);

    const slab = new THREE.Group();
    slab.position.y = 2.87;
    g.add(slab);
    bx(slab, '#b9b9b4', w + 0.3, 0.2, d + 0.3, 0, 0, 0, 0.03);

    const baseY = 3.07;
    const rise = 1.8;
    const over = 0.4;
    const a = Math.atan2(rise, d / 2);
    const len = (d / 2 + over) / Math.cos(a);
    const gables = new THREE.Group();
    g.add(gables);
    for (const sx of [-1, 1]) tris(gables, p.brick, [[[sx * (w / 2 - 0.02), baseY, d / 2], [sx * (w / 2 - 0.02), baseY, -d / 2], [sx * (w / 2 - 0.02), baseY + rise, 0]]]);

    const frame = new THREE.Group();
    g.add(frame);
    const slabAt = (parent, color, wd, th, length, sg, distFromEave, mode) => {
      // posição sobre a água do telhado: a partir do beiral (z = sg*(d/2+over)) em direção à cumeeira
      const zLow = sg * (d / 2 + over);
      const yLow = baseY - over * Math.tan(a);
      const cx = zLow - sg * Math.cos(a) * distFromEave;
      const cy = yLow + Math.sin(a) * distFromEave;
      return mesh(rbox(wd, th, length, 0.015), color, { pos: [0, cy + th / 2, cx], rot: [sg * a, 0, 0], parent });
    };
    for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 6) {
      for (const sg of [-1, 1]) {
        const r = slabAt(frame, PAL.wood, 0.12, 0.16, len, sg, len / 2);
        r.position.x = x;
      }
    }
    for (const sg of [-1, 1]) for (let j = 0; j < 4; j++) slabAt(frame, PAL.woodDark, w + over * 2, 0.07, 0.1, sg, (j + 0.5) * (len / 4));
    bx(frame, PAL.woodDark, w + over * 2, 0.16, 0.14, 0, baseY + rise - 0.05, 0, 0.02);

    const rows = 8;
    const tiles = [];
    for (let j = 0; j < rows; j++) {
      const grp = new THREE.Group();
      for (const sg of [-1, 1]) slabAt(grp, p.tile, w + over * 2, 0.08, len / rows + 0.02, sg, (j + 0.5) * (len / rows) + 0.0);
      g.add(grp);
      tiles.push(grp);
    }
    const cap = bx(g, p.tile, w + over * 2, 0.14, 0.3, 0, baseY + rise - 0.02, 0, 0.04);

    g.userData.setProgress = (t) => {
      found.visible = t > 0.001;
      grow(found, stage(t, 0, 0.1));
      floor.visible = t > 0.1;
      grow(pillars, stage(t, 0.12, 0.25));
      grow(walls, stage(t, 0.25, 0.55));
      slab.visible = t > 0.55;
      slab.scale.y = Math.max(0.001, stage(t, 0.55, 0.65));
      gables.visible = t > 0.66;
      const fk = stage(t, 0.65, 0.82);
      frame.visible = fk > 0 && t < 0.99; // com o telhado fechado, o madeiramento some
      tiles.forEach((row, j) => { row.visible = t > 0.82 + (0.18 * (j + 1)) / (rows + 1); });
      cap.visible = t > 0.99;
    };
    g.userData.setProgress(p.progress);
  },
});

register('predio_estrutura', {
  category: 'obra',
  label: 'Estrutura de prédio',
  description: 'Esqueleto de concreto (pilares e lajes) subindo andar por andar: setProgress(p) constrói de 0 a todos os andares. 15 × 10 m, andares de 3,2 m.',
  params: {
    floors: [8, 'número de andares'],
    progress: [1, 'etapa inicial 0..1'],
    concrete: ['#b9b9b4', 'cor do concreto'],
  },
  variants: { baixo: { floors: 4 }, meio: { progress: 0.5 } },
  make(g, p) {
    const n = Math.max(2, Math.round(p.floors));
    const [bx_, bz, sp, fh] = [3, 2, 5, 3.2];
    const [W, D] = [bx_ * sp, bz * sp];
    bx(g, '#9a9a94', W + 1.2, 0.5, D + 1.2, 0, 0, 0, 0.04);
    const floors = [];
    for (let i = 0; i < n; i++) {
      const cols = new THREE.Group();
      cols.position.y = 0.5 + i * fh;
      g.add(cols);
      for (let ix = 0; ix <= bx_; ix++) for (let iz = 0; iz <= bz; iz++) bx(cols, p.concrete, 0.45, fh, 0.45, -W / 2 + ix * sp, 0, -D / 2 + iz * sp, 0.04);
      const slab = new THREE.Group();
      slab.position.y = 0.5 + (i + 1) * fh - 0.0;
      g.add(slab);
      bx(slab, '#a7a7a1', W + 0.8, 0.3, D + 0.8, 0, 0, 0, 0.03);
      floors.push({ cols, slab });
    }
    g.userData.setProgress = (t) => {
      const f = t * n;
      floors.forEach(({ cols, slab }, i) => {
        const k = clamp01(f - i);
        grow(cols, clamp01(k / 0.6));
        slab.visible = k > 0.6;
        slab.scale.y = Math.max(0.001, clamp01((k - 0.6) / 0.4));
      });
    };
    g.userData.setProgress(p.progress);
  },
});

function layerStack(g, layers, w, d, progress) {
  let y = 0;
  const groups = layers.map((l) => {
    const grp = new THREE.Group();
    grp.position.y = y;
    g.add(grp);
    bx(grp, l.color, w, l.h, d, 0, 0, 0, 0.02);
    y += l.h;
    return grp;
  });
  g.userData.layers = layers.map((l) => l.name);
  g.userData.setProgress = (t) => groups.forEach((grp, i) => grow(grp, clamp01(t * groups.length - i)));
  g.userData.setProgress(progress);
}

register('rua_camadas', {
  category: 'obra',
  label: 'Corte da pavimentação',
  description: 'Bloco em corte mostrando as camadas de uma rua: solo compactado, sub-base de brita, base, asfalto base e capa de rolamento (+ faixa). setProgress(p) empilha as camadas. 8 × 8 m, 1,35 m de altura.',
  params: { progress: [1, 'etapa inicial 0..1'] },
  variants: { subleito: { progress: 0.2 }, quase: { progress: 0.8 } },
  make(g, p) {
    layerStack(g, [
      { name: 'solo compactado (subleito)', color: '#7a5a3a', h: 0.5 },
      { name: 'sub-base de brita', color: '#9d9a93', h: 0.35 },
      { name: 'base de brita graduada', color: '#b9b6ad', h: 0.3 },
      { name: 'asfalto base (binder)', color: '#4a4a4e', h: 0.12 },
      { name: 'capa de rolamento (asfalto)', color: '#2f3034', h: 0.08 },
    ], 8, 8, p.progress);
    bx(g, PAL.yellow, 0.16, 0.01, 8, 0, 1.35, 0, 0.005);
  },
});

register('corte_terreno', {
  category: 'obra',
  label: 'Corte do terreno',
  description: 'Bloco de solo em corte com grama, terra, argila e rocha — para explicar fundações e muros de arrimo. setProgress(p) revela as camadas de baixo para cima. 8 × 6 m, 2,4 m de altura.',
  params: { progress: [1, 'etapa inicial 0..1'] },
  variants: { so_rocha: { progress: 0.25 } },
  make(g, p) {
    layerStack(g, [
      { name: 'rocha', color: PAL.rock, h: 0.9 },
      { name: 'argila', color: PAL.clay, h: 0.7 },
      { name: 'terra', color: PAL.soil, h: 0.6 },
      { name: 'grama', color: PAL.grass, h: 0.2 },
    ], 8, 6, p.progress);
  },
});

register('guindaste', {
  category: 'obra',
  label: 'Guindaste de obra',
  description: 'Guindaste de torre com lança, contrapeso, cabo e gancho. setProgress(p) gira a lança uma volta. Torre de 22 m.',
  params: {
    height: [22, 'altura da torre'],
    jib: [16, 'comprimento da lança'],
    angle: [0, 'giro inicial da lança (radianos)'],
  },
  variants: { baixo: { height: 14, jib: 12 } },
  make(g, p) {
    const c = '#f2c94c';
    bx(g, '#9a9a94', 4, 0.8, 4, 0, 0, 0, 0.05);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(g, c, 0.16, p.height, 0.16, sx * 0.7, 0.8, sz * 0.7, 0.02);
    for (let y = 1.2; y < p.height; y += 1.6) {
      bx(g, c, 1.5, 0.1, 0.1, 0, y + 0.0, 0.7, 0.01); bx(g, c, 1.5, 0.1, 0.1, 0, y, -0.7, 0.01);
      bx(g, c, 0.1, 0.1, 1.5, 0.7, y, 0, 0.01); bx(g, c, 0.1, 0.1, 1.5, -0.7, y, 0, 0.01);
    }
    const top = new THREE.Group();
    top.position.y = p.height + 0.8;
    g.add(top);
    bx(top, '#4a4f57', 1.8, 0.5, 1.8, 0, 0, 0, 0.04);
    bx(top, '#3d6fb6', 1.2, 1.1, 1.2, 0, 0.5, 0.2, 0.06);
    bx(top, c, p.jib, 0.5, 0.5, p.jib / 2 - 1.5, 1.0, 0, 0.03);
    bx(top, c, 6, 0.4, 0.4, -3.5, 1.0, 0, 0.03);
    bx(top, '#6d7783', 1.6, 1.2, 1.2, -5.5, 0.4, 0, 0.04);
    bx(top, c, 0.2, 2.6, 0.2, 0, 1.5, 0, 0.02);
    const hookX = p.jib - 2.5;
    bx(top, '#2b2f34', 0.05, 7, 0.05, hookX, -6.3, 0, 0.01);
    bx(top, '#d9473a', 0.4, 0.5, 0.3, hookX, -6.8, 0, 0.04);
    top.rotation.y = p.angle;
    g.userData.setProgress = (t) => { top.rotation.y = p.angle + t * Math.PI * 2; };
  },
});

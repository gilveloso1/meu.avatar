// Objetos de rua e de obra (cone, barreira, tijolos, poste, semáforo...). Cada um centrado no chão, frente para +Z.

import * as THREE from 'three';
import { register, PAL, bx, cyl, wheel, mesh, rbox, sphere, cylinder } from './kit.js';

const glow = (color) => new THREE.MeshBasicMaterial({ color });

register('cone', {
  category: 'objetos',
  label: 'Cone de trânsito',
  description: 'Cone laranja com faixa branca e base quadrada. 0,6 m.',
  params: { color: ['#f28c28', 'cor do cone'] },
  variants: { amarelo: { color: '#f2c94c' } },
  make(g, p) {
    bx(g, '#2b2f34', 0.42, 0.05, 0.42, 0, 0, 0, 0.015);
    cyl(g, p.color, 0.04, 0.17, 0.6, 0, 0.05, 0, 8);
    cyl(g, '#ffffff', 0.1, 0.13, 0.12, 0, 0.27, 0, 8);
  },
});

register('barreira', {
  category: 'objetos',
  label: 'Barreira de obra',
  description: 'Cavalete com tábuas listradas vermelho/branco para isolar uma área. 2 × 1 m.',
  params: { length: [2, 'comprimento'] },
  variants: { longa: { length: 3.5 } },
  make(g, p) {
    for (const sx of [-1, 1]) {
      bx(g, '#2b2f34', 0.1, 1.0, 0.1, sx * (p.length / 2 - 0.15), 0, 0, 0.02);
      bx(g, '#2b2f34', 0.1, 0.06, 0.7, sx * (p.length / 2 - 0.15), 0, 0, 0.02);
    }
    for (let i = 0; i < 3; i++) {
      const n = Math.round(p.length / 0.4);
      for (let k = 0; k < n; k++) bx(g, k % 2 ? '#ffffff' : PAL.red, p.length / n, 0.2, 0.05, -p.length / 2 + (k + 0.5) * (p.length / n), 0.55 + i * 0.22 - 0.1, 0.0, 0.01);
    }
  },
});

register('pilha_tijolos', {
  category: 'objetos',
  label: 'Pilha de tijolos',
  description: 'Pilha de tijolos sobre um pallet de madeira. 1,2 × 0,8 m, 0,8 m de altura.',
  params: { brick: [PAL.brick, 'cor dos tijolos'], rows: [6, 'fileiras de altura'] },
  variants: { baixa: { rows: 3 }, clara: { brick: '#d68a5a' } },
  make(g, p) {
    bx(g, PAL.wood, 1.2, 0.12, 0.9, 0, 0, 0, 0.02);
    for (let r = 0; r < p.rows; r++) {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        bx(g, p.brick, 0.29, 0.1, 0.28, -0.45 + i * 0.3 + (r % 2) * 0.02, 0.12 + r * 0.11, -0.28 + j * 0.29, 0.015);
      }
    }
  },
});

register('saco_cimento', {
  category: 'objetos',
  label: 'Sacos de cimento',
  description: 'Pilha de sacos de cimento com etiqueta azul. 0,6 m de lado.',
  params: { count: [6, 'quantidade de sacos (1 a 12)'] },
  variants: { um: { count: 1 }, muitos: { count: 12 } },
  make(g, p) {
    for (let i = 0; i < p.count; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      bx(g, '#d8d2c4', 0.6, 0.16, 0.38, (col - 1) * 0.3 * (row % 2 ? 1 : 1) + (row % 2) * 0.08, row * 0.17, (col % 2) * 0.03, 0.06);
      bx(g, '#3d6fb6', 0.3, 0.04, 0.2, (col - 1) * 0.3 + (row % 2) * 0.08, row * 0.17 + 0.16, 0, 0.01);
    }
  },
});

register('carrinho_mao', {
  category: 'objetos',
  label: 'Carrinho de mão',
  description: 'Carrinho de obra com caçamba, uma roda e dois cabos. 0,7 × 1,5 m. A roda gira com rollWheels().',
  params: { color: ['#f2c94c', 'cor da caçamba'] },
  variants: { azul: { color: '#3d6fb6' }, vermelho: { color: '#d9473a' } },
  make(g, p) {
    bx(g, p.color, 0.7, 0.3, 0.8, 0, 0.35, 0.3, 0.06);
    wheel(g, 0, 0.22, 0.75, 0.22, 0.1);
    for (const sx of [-1, 1]) {
      bx(g, PAL.wood, 0.06, 0.06, 1.1, sx * 0.28, 0.45, -0.55, 0.02);
      bx(g, '#2b2f34', 0.05, 0.4, 0.05, sx * 0.28, 0.05, -0.1, 0.01);
    }
  },
});

register('escada', {
  category: 'objetos',
  label: 'Escada de mão',
  description: 'Escada de madeira inclinada (encostada). 2,4 m.',
  params: { height: [2.4, 'altura'] },
  variants: { alta: { height: 3.6 } },
  make(g, p) {
    const len = p.height / Math.cos(0.2);
    for (const sx of [-1, 1]) {
      const r = bx(g, PAL.wood, 0.07, len, 0.07, sx * 0.25, 0, 0, 0.02);
      r.rotation.x = -0.2;
    }
    for (let y = 0.35; y < p.height; y += 0.35) {
      bx(g, PAL.woodDark, 0.5, 0.05, 0.06, 0, y, -y * Math.tan(0.2) + 0.03, 0.01);
    }
  },
});

register('poste_luz', {
  category: 'objetos',
  label: 'Poste de luz',
  description: 'Poste de rua com braço e lâmpada acesa. 6 m.',
  params: { height: [6, 'altura'], color: ['#7b8794', 'cor do poste'] },
  variants: { baixo: { height: 4 } },
  make(g, p) {
    cyl(g, p.color, 0.08, 0.14, p.height, 0, 0, 0, 8);
    bx(g, p.color, 0.1, 0.1, 1.3, 0, p.height - 0.1, 0.55, 0.02);
    bx(g, '#2b2f34', 0.35, 0.12, 0.6, 0, p.height - 0.2, 1.1, 0.03);
    mesh(new THREE.BoxGeometry(0.28, 0.04, 0.5), glow('#fff4b0'), { pos: [0, p.height - 0.24, 1.1], parent: g });
  },
});

register('semaforo', {
  category: 'objetos',
  label: 'Semáforo',
  description: 'Semáforo de poste com três luzes; escolha qual está acesa.',
  params: { state: ['vermelho', "'vermelho' | 'amarelo' | 'verde'"] },
  variants: { amarelo: { state: 'amarelo' }, verde: { state: 'verde' } },
  make(g, p) {
    cyl(g, '#4a4f57', 0.07, 0.1, 3.4, 0, 0, 0, 8);
    bx(g, '#2b2f34', 0.45, 1.2, 0.35, 0, 2.7, 0.0, 0.06);
    [['vermelho', '#ff3b30'], ['amarelo', '#ffd60a'], ['verde', '#34c759']].forEach(([n, c], i) => {
      const on = p.state === n;
      mesh(sphere(0.13), on ? glow(c) : '#3a3f45', { pos: [0, 3.1 - i * 0.37, 0.19], parent: g });
      if (on) g.children[g.children.length - 1].material = glow(c);
    });
  },
});

register('placa_pare', {
  category: 'objetos',
  label: 'Placa PARE',
  description: 'Placa octogonal vermelha em poste. 2,4 m.',
  params: {},
  make(g) {
    cyl(g, '#9aa0a6', 0.04, 0.04, 2.4, 0, 0, 0, 6);
    const o = mesh(cylinder(0.45, 0.45, 0.05, 8), PAL.red, { pos: [0, 2.3, 0.06], rot: [Math.PI / 2, Math.PI / 8, 0], parent: g });
    bx(g, '#ffffff', 0.6, 0.12, 0.02, 0, 2.24, 0.1, 0.01);
  },
});

register('banco', {
  category: 'objetos',
  label: 'Banco de praça',
  description: 'Banco de madeira com pés de ferro. 1,6 × 0,6 m.',
  params: { color: [PAL.wood, 'cor da madeira'] },
  variants: { verde: { color: '#4f9d5a' } },
  make(g, p) {
    for (let i = 0; i < 3; i++) bx(g, p.color, 1.6, 0.05, 0.14, 0, 0.45, 0.2 - i * 0.16, 0.01);
    for (let i = 0; i < 2; i++) bx(g, p.color, 1.6, 0.14, 0.05, 0, 0.7 + i * 0.17, -0.26, 0.01);
    for (const sx of [-1, 1]) {
      bx(g, '#3a3f45', 0.06, 0.45, 0.5, sx * 0.7, 0, 0, 0.01);
      bx(g, '#3a3f45', 0.06, 0.55, 0.06, sx * 0.7, 0.45, -0.26, 0.01);
    }
  },
});

register('cerca', {
  category: 'objetos',
  label: 'Cerca de madeira',
  description: 'Trecho de cerca de madeira com mourões e duas travas. 4 m (ajustável).',
  params: { length: [4, 'comprimento'], color: [PAL.wood, 'cor'] },
  variants: { branca: { color: '#f4f4f1' } },
  make(g, p) {
    const n = Math.max(2, Math.round(p.length / 0.5));
    for (let i = 0; i <= n; i++) bx(g, p.color, 0.1, 1.05, 0.08, -p.length / 2 + (i / n) * p.length, 0, 0, 0.02);
    for (const y of [0.35, 0.75]) bx(g, p.color, p.length, 0.08, 0.05, 0, y, 0.07, 0.01);
  },
});

register('muro', {
  category: 'objetos',
  label: 'Muro',
  description: 'Trecho de muro de alvenaria com capeamento. 4 m de comprimento, 2,2 m de altura.',
  params: { length: [4, 'comprimento'], height: [2.2, 'altura'], color: ['#e8dcc4', 'cor do reboco'] },
  variants: { tijolo: { color: PAL.brick }, cinza: { color: '#b4b4ae' } },
  make(g, p) {
    bx(g, p.color, p.length, p.height, 0.25, 0, 0, 0, 0.03);
    bx(g, '#d4d4ce', p.length + 0.1, 0.1, 0.35, 0, p.height, 0, 0.02);
    bx(g, '#a8a8a2', p.length + 0.05, 0.25, 0.3, 0, 0, 0, 0.02);
  },
});

register('hidrante', {
  category: 'objetos',
  label: 'Hidrante',
  description: 'Hidrante vermelho de calçada. 0,7 m.',
  params: {},
  make(g) {
    cyl(g, PAL.red, 0.14, 0.17, 0.6, 0, 0, 0, 8);
    cyl(g, PAL.red, 0.17, 0.17, 0.08, 0, 0.55, 0, 8);
    mesh(sphere(0.12), PAL.red, { pos: [0, 0.68, 0], parent: g });
    for (const sx of [-1, 1]) cyl(g, '#d9d9d4', 0.06, 0.06, 0.1, 0, 0.3, 0, 6).position.set(sx * 0.17, 0.35, 0);
  },
});

register('lixeira', {
  category: 'objetos',
  label: 'Lixeira',
  description: 'Lixeira de rua com tampa. 0,9 m.',
  params: { color: [PAL.green, 'cor'] },
  variants: { azul: { color: '#3d6fb6' }, amarela: { color: '#f2c94c' } },
  make(g, p) {
    cyl(g, p.color, 0.3, 0.26, 0.8, 0, 0, 0, 10);
    cyl(g, '#2b2f34', 0.33, 0.33, 0.08, 0, 0.8, 0, 10);
  },
});

register('caixa_madeira', {
  category: 'objetos',
  label: 'Caixote de madeira',
  description: 'Caixote de madeira com travessas em X. 0,8 m.',
  params: { size: [0.8, 'lado'] },
  variants: { grande: { size: 1.2 } },
  make(g, p) {
    const s = p.size;
    bx(g, PAL.wood, s, s, s, 0, 0, 0, 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, PAL.woodDark, 0.08, s + 0.02, 0.08, sx * (s / 2), 0, sz * (s / 2), 0.01);
    for (const sz of [-1, 1]) {
      const d = bx(g, PAL.woodDark, 0.07, s * 1.35, 0.03, 0, s * 0.5 - s * 0.675 + 0.0, sz * (s / 2 + 0.01), 0.01);
      d.position.y = s / 2;
      d.rotation.z = Math.PI / 4;
    }
  },
});

register('bueiro', {
  category: 'objetos',
  label: 'Bueiro (boca de lobo)',
  description: 'Grade de escoamento de água da chuva, ao nível do asfalto junto ao meio-fio. 0,9 × 0,5 m.',
  params: {},
  make(g) {
    bx(g, '#5a5f66', 0.95, 0.04, 0.55, 0, 0, 0, 0.01);
    bx(g, '#1b1d21', 0.8, 0.045, 0.4, 0, 0, 0, 0.005);
    for (let i = -3; i <= 3; i++) bx(g, '#7b8794', 0.05, 0.05, 0.42, i * 0.11, 0, 0, 0.005);
  },
});

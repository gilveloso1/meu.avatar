// Prédios, loja, galpão e ponte. Fachada para +Z.

import * as THREE from 'three';
import { register, PAL, bx, cyl, win, winLite, door, facade, gableRoof, mesh, rbox } from './kit.js';

register('predio_apartamentos', {
  category: 'predios',
  label: 'Prédio de apartamentos',
  description: 'Prédio residencial com térreo de entrada, janelas e sacadas em cada andar, platibanda e caixa d\'água. 14 × 10 m; cada andar 3 m.',
  params: {
    floors: [6, 'número de andares (incluindo o térreo)'],
    wall: ['#e9d8b4', 'cor da parede'],
    accent: ['#b9855a', 'cor do térreo, sacadas e detalhes'],
    balconies: [true, 'sacadas na frente'],
  },
  variants: {
    azul: { wall: '#cfe0ee', accent: '#5f7fa0' },
    rosa: { wall: '#f1d3d0', accent: '#b0605a' },
    alto: { floors: 10, wall: '#e6e1d8', accent: '#7b8794' },
  },
  make(g, p) {
    const [w, d, fh, gh] = [14, 10, 3, 3.6];
    const n = Math.max(2, Math.round(p.floors));
    const H = gh + (n - 1) * fh;
    bx(g, p.wall, w, H, d, 0, 0, 0, 0.05);
    bx(g, p.accent, w + 0.1, gh, d + 0.1, 0, 0, 0, 0.04);

    const f = facade(g, 'front', w, d);
    door(f, 2.4, 2.6, 0, '#7fb6d6', '#ffffff');
    bx(f, p.accent, 3.6, 0.15, 1.2, 0, 2.9, 0.6, 0.03);
    for (const x of [-4.8, -1.6, 4.8]) winLite(f, 1.8, 1.6, x, 1.7);
    winLite(f, 1.8, 1.6, 1.6 + 0.0, 1.7);
    for (let i = 1; i < n; i++) {
      const y = gh + (i - 1) * fh;
      for (const x of [-4.8, -1.6, 1.6, 4.8]) {
        winLite(f, 1.5, 1.5, x, y + 1.9);
        if (p.balconies) {
          bx(f, p.accent, 2.2, 0.15, 0.8, x, y + 0.0, 0.4, 0.03);
          bx(f, p.accent, 2.2, 0.55, 0.06, x, y + 0.15, 0.78, 0.02);
        }
      }
    }
    const b = facade(g, 'back', w, d);
    for (let i = 1; i < n; i++) for (const x of [-4.8, -1.6, 1.6, 4.8]) winLite(b, 1.5, 1.5, x, gh + (i - 1) * fh + 1.9);
    for (const side of ['east', 'west']) {
      const s = facade(g, side, w, d);
      for (let i = 0; i < n; i++) for (const x of [-2.5, 2.5]) winLite(s, 1.5, 1.5, x, i === 0 ? 1.9 : gh + (i - 1) * fh + 1.9);
    }
    // platibanda, caixa d'água, casa de máquinas
    const t = 0.35;
    bx(g, p.accent, w + 0.2, 0.8, t, 0, H, d / 2, 0.03);
    bx(g, p.accent, w + 0.2, 0.8, t, 0, H, -d / 2, 0.03);
    bx(g, p.accent, t, 0.8, d, w / 2, H, 0, 0.03);
    bx(g, p.accent, t, 0.8, d, -w / 2, H, 0, 0.03);
    cyl(g, '#6d8fb0', 1.1, 1.1, 1.6, -3.5, H, -1.5, 12);
    bx(g, p.wall, 2.4, 1.8, 2.4, 3.5, H, -1.5, 0.05);
  },
});

register('arranha_ceu', {
  category: 'predios',
  label: 'Arranha-céu',
  description: 'Torre de escritórios com fachada de vidro, faixas de laje a cada andar, base (pódio), coroa e antena. 16 × 16 m; cada andar 4 m.',
  params: {
    floors: [14, 'número de andares (cada um tem 4 m)'],
    glass: ['#5b8fb9', 'cor do vidro'],
    band: ['#dfe7ee', 'cor das faixas de laje'],
  },
  variants: {
    verde: { glass: '#5fa59a' },
    escuro: { glass: '#2f4458', band: '#9aa7b3' },
    alto: { floors: 30 },
  },
  make(g, p) {
    const [w, d, fh] = [16, 16, 4];
    const n = Math.max(3, Math.round(p.floors));
    const podium = 5;
    bx(g, '#c9ced4', w + 6, podium, d + 6, 0, 0, 0, 0.05);
    bx(g, '#8fb6d4', w + 6.1, 2.4, 0.2, 0, 0.4, (d + 6) / 2 + 0.0, 0.02);
    const f = facade(g, 'front', w + 6, d + 6);
    door(f, 3.2, 2.8, 0, '#a8d4ec', '#ffffff');
    const H = n * fh;
    bx(g, p.glass, w, H, d, 0, podium, 0, 0.05);
    for (let i = 0; i <= n; i++) bx(g, p.band, w + 0.3, 0.35, d + 0.3, 0, podium + i * fh - 0.1, 0, 0.03);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, p.band, 0.5, H, 0.5, sx * (w / 2), podium, sz * (d / 2), 0.05);
    for (const x of [-4, 0, 4]) { bx(g, p.band, 0.25, H, 0.25, x, podium, d / 2 + 0.05, 0.02); bx(g, p.band, 0.25, H, 0.25, x, podium, -d / 2 - 0.05, 0.02); }
    const top = podium + H;
    bx(g, p.glass, w - 4, 4, d - 4, 0, top, 0, 0.05);
    bx(g, p.band, w - 3.6, 0.4, d - 3.6, 0, top + 4, 0, 0.03);
    cyl(g, '#cfd4da', 0.12, 0.2, 6, 0, top + 4.4, 0, 6);
    mesh(new THREE.SphereGeometry(0.25, 6, 4), PAL.red, { pos: [0, top + 10.5, 0], parent: g });
  },
});

register('loja', {
  category: 'predios',
  label: 'Loja',
  description: 'Loja de rua com vitrine grande, porta de vidro, toldo listrado e letreiro. 8 × 8 m, 4 m de altura.',
  params: {
    wall: ['#f0e6d2', 'cor da parede'],
    awning: ['#d9473a', 'cor do toldo (alterna com branco)'],
    sign: ['#3d6fb6', 'cor do letreiro'],
  },
  variants: {
    padaria: { awning: '#f28c28', sign: '#8a4b2a', wall: '#f7e7c4' },
    mercado: { awning: '#4f9d5a', sign: '#2f6b3a' },
  },
  make(g, p) {
    const [w, d, h] = [8, 8, 4];
    bx(g, '#bdb6a6', w + 0.1, 0.3, d + 0.1, 0, 0, 0, 0.02);
    bx(g, p.wall, w, h - 0.3, d, 0, 0.3, 0, 0.05);
    bx(g, '#e8e8e4', w + 0.3, 0.3, d + 0.3, 0, h, 0, 0.03);
    const f = facade(g, 'front', w, d);
    f.position.y = 0.3;
    win(f, 4.2, 2.0, -1.4, 2.0, { frame: '#2b2f34', sill: false });
    door(f, 1.4, 2.3, 2.6, '#a8d4ec', '#2b2f34');
    bx(f, p.sign, 6.0, 0.8, 0.12, 0, 3.0, 0.06, 0.03);
    // toldo listrado inclinado
    for (let i = 0; i < 8; i++) {
      const m = mesh(rbox(0.9, 0.08, 1.5, 0.02), i % 2 ? '#ffffff' : p.awning, { pos: [-3.5 + i, 2.65, 0.75], rot: [0.28, 0, 0], parent: f });
    }
    for (const side of ['east', 'west']) win(facade(g, side, w, d), 1.4, 1.4, 0, 2.0);
  },
});

register('galpao', {
  category: 'predios',
  label: 'Galpão / fábrica',
  description: 'Galpão industrial de telhado metálico, portão de enrolar, janelas altas e chaminé. 24 × 14 m, 6 m de parede.',
  params: {
    wall: ['#c9cdd2', 'cor das paredes'],
    roof: ['#6d7783', 'cor do telhado'],
    door: ['#d9473a', 'cor do portão'],
  },
  variants: {
    azul: { wall: '#b5c8da', roof: '#4f6b8a', door: '#f2c94c' },
    verde: { wall: '#c8d8c0', roof: '#5a6b5a', door: '#7b8794' },
  },
  make(g, p) {
    const [w, d, h] = [24, 14, 6];
    bx(g, '#a8a8a2', w + 0.1, 0.4, d + 0.1, 0, 0, 0, 0.02);
    bx(g, p.wall, w, h - 0.4, d, 0, 0.4, 0, 0.05);
    gableRoof(g, { roof: p.roof, wall: p.wall, l: w, s: d, h: 2.2, y: h, over: 0.5 });
    const f = facade(g, 'front', w, d);
    f.position.y = 0.4;
    bx(f, p.door, 5, 4.2, 0.12, 0, 0, 0.05, 0.03);
    for (let i = 0; i < 8; i++) bx(f, '#8a1f1a', 5, 0.03, 0.14, 0, 0.3 + i * 0.5, 0.06, 0.01);
    for (const x of [-9, -6, 6, 9]) win(f, 2, 1.0, x, 4.2, { sill: false, frame: '#2b2f34' });
    cyl(g, '#a8523a', 0.7, 0.9, 9, w / 2 - 3, h, -d / 2 + 2.5, 10);
    cyl(g, '#2b2f34', 0.75, 0.75, 0.5, w / 2 - 3, h + 9, -d / 2 + 2.5, 10);
  },
});

register('ponte_viga', {
  category: 'predios',
  label: 'Ponte de vigas',
  description: 'Ponte de concreto sobre um rio: tabuleiro com pista, guarda-corpo, dois pilares com travessa e encontros nas pontas. Vão de 24 m ao longo de X, 8 m de largura.',
  params: {
    length: [24, 'comprimento do vão em metros (ao longo de X)'],
    height: [4.5, 'altura do tabuleiro acima da água'],
    river: [true, 'mostrar o rio embaixo'],
  },
  variants: {
    longa: { length: 36, height: 6 },
    baixa: { length: 16, height: 3 },
  },
  make(g, p) {
    const L = p.length;
    const H = p.height;
    const W = 8;
    const A = 8; // rampas de aproximação (aterro) nas duas pontas
    const T = L + A * 2;
    if (p.river) {
      bx(g, '#4aa3d8', L + 2, 0.12, 14, 0, 0, 0, 0.02);
      // aterro em degraus suaves até o nível do tabuleiro
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const hh = ((i + 1) / 4) * (H - 0.7);
          bx(g, i === 3 ? PAL.grass : PAL.soil, A / 2 + 0.5 - i * 0.0, hh, 14, sx * (L / 2 + 1 + (3 - i) * (A / 8) + A / 4 - i * 0.0), 0, 0, 0.1);
        }
      }
    }
    bx(g, PAL.concrete, T, 0.7, W, 0, H - 0.7, 0, 0.04);
    bx(g, PAL.asphalt, T, 0.08, W - 1.2, 0, H, 0, 0.01);
    for (let x = -T / 2 + 1; x < T / 2 - 1; x += 3) bx(g, PAL.yellow, 1.5, 0.01, 0.15, x, H + 0.08, 0, 0.005);
    for (const sz of [-1, 1]) {
      bx(g, PAL.concrete, T, 0.3, 0.3, 0, H, sz * (W / 2 - 0.15), 0.03);
      bx(g, PAL.concrete, T, 0.15, 0.15, 0, H + 0.95, sz * (W / 2 - 0.15), 0.02);
      for (let x = -T / 2 + 0.5; x <= T / 2 - 0.4; x += 2) bx(g, PAL.concrete, 0.2, 1.0, 0.2, x, H, sz * (W / 2 - 0.15), 0.02);
    }
    for (const x of [-L / 4, L / 4]) {
      bx(g, '#a9a9a3', W - 0.6, 0.6, 1.2, x, H - 1.3, 0, 0.04);
      for (const sz of [-1, 1]) cyl(g, '#a9a9a3', 0.6, 0.7, H - 1.3, x, 0, sz * (W / 2 - 1.2), 10);
    }
  },
});

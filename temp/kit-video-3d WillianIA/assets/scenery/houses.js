// Casas prontas (térrea, colonial, sobrado, moderna). Fachada para +Z, centradas no chão.

import { register, PAL, bx, cyl, win, door, facade, gableRoof, hipRoof } from './kit.js';

const BASE = '#bdb6a6';

register('casa_simples', {
  category: 'casas',
  label: 'Casa simples',
  description: 'Casa térrea de telhado de duas águas, porta central, duas janelas na frente e chaminé. 6 × 7 m.',
  params: {
    wall: ['#f2e2bf', 'cor da parede'],
    roof: ['#d2693a', 'cor das telhas'],
    door: ['#7a4a2b', 'cor da porta'],
    trim: ['#ffffff', 'cor de portas e janelas (molduras)'],
    chimney: [true, 'mostrar chaminé'],
  },
  variants: {
    verde: { wall: '#bfe3c0', roof: '#b8553a' },
    azul: { wall: '#c5dff2', roof: '#7b8794' },
    amarela: { wall: '#f7d98b', roof: '#a8402c', door: '#3f7f5a' },
  },
  make(g, p) {
    const [w, d, h] = [6, 7, 2.8];
    bx(g, BASE, w + 0.12, 0.3, d + 0.12, 0, 0, 0, 0.02);
    bx(g, p.wall, w, h - 0.3, d, 0, 0.3, 0, 0.05);
    gableRoof(g, { roof: p.roof, wall: p.wall, l: w, s: d, h: 1.8, y: h });
    if (p.chimney) bx(g, PAL.brick, 0.55, 1.9, 0.55, w / 2 - 1.2, h + 0.5, -d / 4, 0.04);

    const f = facade(g, 'front', w, d);
    f.position.y = 0.3;
    door(f, 1.0, 2.1, 0, p.door, p.trim);
    win(f, 1.2, 1.1, -1.8, 1.7, { frame: p.trim });
    win(f, 1.2, 1.1, 1.8, 1.7, { frame: p.trim });
    bx(f, PAL.concrete, 1.8, 0.15, 0.9, 0, 0, 0.45, 0.03);
    for (const side of ['east', 'west']) {
      const s = facade(g, side, w, d);
      s.position.y = 0.3;
      win(s, 1.1, 1.1, -1.4, 1.7, { frame: p.trim });
      win(s, 1.1, 1.1, 1.4, 1.7, { frame: p.trim });
    }
    const b = facade(g, 'back', w, d);
    b.position.y = 0.3;
    win(b, 1.2, 1.1, 0, 1.7, { frame: p.trim });
  },
});

register('casa_colonial', {
  category: 'casas',
  label: 'Casa colonial',
  description: 'Casa grande de telhado de quatro águas com varanda de colunas, portas duplas e janelas com venezianas. 9 × 7 m (+2 m de varanda).',
  params: {
    wall: ['#f6edd2', 'cor da parede'],
    roof: ['#c8593a', 'cor das telhas'],
    shutter: ['#3f7f5a', 'cor das venezianas'],
    trim: ['#ffffff', 'cor das colunas e molduras'],
  },
  variants: {
    rosa: { wall: '#f4cdd0', roof: '#a8402c', shutter: '#ffffff' },
    azul: { wall: '#cfe3f4', roof: '#7b4a3a', shutter: '#2f4f7f' },
  },
  make(g, p) {
    const [w, d, h] = [9, 7, 3];
    bx(g, BASE, w + 0.12, 0.3, d + 0.12, 0, 0, 0, 0.02);
    bx(g, p.wall, w, h - 0.3, d, 0, 0.3, 0, 0.05);
    hipRoof(g, p.roof, { l: w, s: d, h: 2.2, y: h, over: 0.5 });
    bx(g, p.roof, 0.7, 1.7, 0.7, -w / 4, h + 0.3, -d / 5, 0.04);

    // varanda
    bx(g, '#d8d2c4', w - 1, 0.25, 2.2, 0, 0, d / 2 + 1.1, 0.03);
    for (const x of [-3.5, -1.2, 1.2, 3.5]) cyl(g, p.trim, 0.14, 0.16, 2.4, x, 0.25, d / 2 + 2, 10);
    bx(g, p.trim, w - 0.6, 0.18, 0.3, 0, 2.65, d / 2 + 2, 0.03);
    bx(g, p.roof, w - 0.2, 0.14, 2.6, 0, 2.8, d / 2 + 1.0, 0.03);

    const f = facade(g, 'front', w, d);
    f.position.y = 0.3;
    door(f, 1.6, 2.2, 0, p.shutter, p.trim);
    for (const x of [-3, -1.9, 1.9, 3]) win(f, 0.95, 1.3, x, 1.7, { frame: p.trim, shutter: p.shutter, sill: false });
    for (const side of ['east', 'west']) {
      const s = facade(g, side, w, d);
      s.position.y = 0.3;
      win(s, 1.0, 1.3, -1.8, 1.7, { frame: p.trim, shutter: p.shutter });
      win(s, 1.0, 1.3, 1.8, 1.7, { frame: p.trim, shutter: p.shutter });
    }
  },
});

register('sobrado', {
  category: 'casas',
  label: 'Sobrado',
  description: 'Casa de dois andares com garagem, porta de entrada, sacada sobre a garagem e telhado de duas águas. 6,5 × 8 m, 5,6 m de parede.',
  params: {
    wall: ['#e6dcc8', 'cor da parede'],
    roof: ['#a8402c', 'cor das telhas'],
    garage: ['#9aa3ad', 'cor do portão da garagem'],
    trim: ['#ffffff', 'cor das molduras'],
  },
  variants: {
    cinza: { wall: '#cfd3d8', roof: '#4f5a66', garage: '#6d7783' },
    salmao: { wall: '#f4cfb4', roof: '#8a3b2a', garage: '#b0764a' },
  },
  make(g, p) {
    const [w, d, h] = [6.5, 8, 5.6];
    bx(g, BASE, w + 0.12, 0.3, d + 0.12, 0, 0, 0, 0.02);
    bx(g, p.wall, w, h - 0.3, d, 0, 0.3, 0, 0.05);
    bx(g, p.trim, w + 0.12, 0.2, d + 0.12, 0, 2.75, 0, 0.03);
    gableRoof(g, { roof: p.roof, wall: p.wall, l: w, s: d, h: 2.1, y: h });

    const f = facade(g, 'front', w, d);
    f.position.y = 0.3;
    bx(f, p.garage, 2.7, 2.3, 0.07, -1.5, 0, 0.05, 0.02);
    for (let i = 0; i < 4; i++) bx(f, p.trim, 2.7, 0.04, 0.08, -1.5, 0.5 + i * 0.55, 0.06, 0.01);
    door(f, 1.0, 2.1, 1.9, '#7a4a2b', p.trim);
    // sacada sobre a garagem
    bx(f, '#d8d2c4', 3.2, 0.2, 1.1, -1.5, 2.45, 0.55, 0.03);
    bx(f, p.trim, 3.2, 0.9, 0.06, -1.5, 2.65, 1.08, 0.02);
    win(f, 2.0, 1.5, -1.5, 4.3, { frame: p.trim });
    win(f, 1.2, 1.2, 1.9, 4.3, { frame: p.trim });
    win(f, 0.9, 0.9, 1.9, 1.5, { frame: p.trim, sill: false });
    for (const side of ['east', 'west']) {
      const s = facade(g, side, w, d);
      s.position.y = 0.3;
      win(s, 1.1, 1.1, -1.5, 1.7, { frame: p.trim });
      win(s, 1.1, 1.1, 1.5, 1.7, { frame: p.trim });
      win(s, 1.1, 1.1, -1.5, 4.3, { frame: p.trim });
      win(s, 1.1, 1.1, 1.5, 4.3, { frame: p.trim });
    }
  },
});

register('casa_moderna', {
  category: 'casas',
  label: 'Casa moderna',
  description: 'Casa de linhas retas: dois volumes, laje plana, janelas grandes e garagem. 9 × 7 m, 6 m de altura.',
  params: {
    wall: ['#f1f1ee', 'cor do volume de baixo'],
    accent: ['#8f9aa5', 'cor do volume de cima'],
    wood: ['#a9743f', 'cor do portão e detalhes de madeira'],
  },
  variants: {
    escura: { wall: '#4f565e', accent: '#e8e8e4', wood: '#7a4a2b' },
    quente: { wall: '#efe0c8', accent: '#c98a5a', wood: '#7a4a2b' },
  },
  make(g, p) {
    const [w, d] = [9, 7];
    bx(g, p.wall, w, 2.9, d, 0, 0, 0, 0.04);
    bx(g, '#f4f4f1', w + 0.5, 0.25, d + 0.5, 0, 2.9, 0, 0.03);
    bx(g, p.accent, 6, 2.9, 6.6, -1.5, 3.15, 0.4, 0.04);
    bx(g, '#f4f4f1', 6.4, 0.25, 7.0, -1.5, 6.05, 0.4, 0.03);

    const f = facade(g, 'front', w, d);
    win(f, 3.6, 2.0, -2.6, 2.3, { frame: '#2b2f34', sill: false });
    bx(f, p.wood, 2.9, 2.3, 0.07, 2.9, 0, 0.05, 0.02);
    for (let i = 0; i < 6; i++) bx(f, '#8a5a2f', 2.9, 0.04, 0.08, 2.9, 0.3 + i * 0.38, 0.06, 0.01);
    door(f, 1.0, 2.2, 0.35, p.wood, '#2b2f34');
    const up = facade(g, 'front', 6, 6.6);
    up.position.set(-1.5, 3.15, 0.4 + 0.0);
    win(up, 3.0, 1.6, -0.1, 2.0, { frame: '#2b2f34', sill: false });
    win(up, 1.2, 1.2, 2.0, 1.9, { frame: '#2b2f34', sill: false });
    for (const side of ['east', 'west']) {
      const s = facade(g, side, w, d);
      win(s, 2.0, 1.6, 0, 2.2, { frame: '#2b2f34', sill: false });
    }
  },
});

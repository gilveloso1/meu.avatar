// Árvores e plantas. A copa é feita de esferas facetadas; `seed` muda o formato (mesma semente = mesma árvore).

import { register, PAL, bx, cyl, ball, rng } from './kit.js';

register('arvore_redonda', {
  category: 'arvores',
  label: 'Árvore de copa redonda',
  description: 'Árvore clássica de tronco marrom e copa arredondada de várias bolas. Altura padrão 5 m.',
  params: {
    height: [5, 'altura total em metros'],
    leaf: ['#5fae4e', 'cor da copa'],
    trunk: ['#8a5a34', 'cor do tronco'],
    seed: [1, 'número que varia o formato da copa'],
  },
  variants: {
    clara: { leaf: '#86c95a', seed: 2 },
    escura: { leaf: '#3f8f46', seed: 3 },
    grande: { height: 8, seed: 4 },
    outono: { leaf: '#e08a3a', seed: 5 },
  },
  make(g, p) {
    const r = rng(p.seed);
    const s = p.height / 5;
    const th = p.height * 0.4;
    cyl(g, p.trunk, 0.16 * s, 0.26 * s, th, 0, 0, 0, 7);
    const cr = p.height * 0.3;
    const cy = th + cr * 0.55;
    ball(g, p.leaf, cr, 0, cy, 0);
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      const rr = cr * (0.5 + r() * 0.25);
      ball(g, i % 2 ? p.leaf : '#6dbd5a', cr * (0.55 + r() * 0.2), Math.cos(a) * rr, cy + (r() - 0.4) * cr * 0.7, Math.sin(a) * rr);
    }
  },
});

register('arvore_frutifera', {
  category: 'arvores',
  label: 'Árvore frutífera',
  description: 'Árvore de copa redonda com frutas (bolinhas coloridas), tipo laranjeira ou macieira. 4 m.',
  params: {
    fruit: ['#e8452c', 'cor das frutas'],
    leaf: ['#4f9d4a', 'cor da copa'],
    seed: [2, 'varia o formato'],
  },
  variants: { laranja: { fruit: '#f28c28' }, limao: { fruit: '#d7e34a' } },
  make(g, p) {
    const r = rng(p.seed);
    cyl(g, '#8a5a34', 0.14, 0.22, 1.6, 0, 0, 0, 7);
    ball(g, p.leaf, 1.4, 0, 2.7, 0);
    ball(g, p.leaf, 1.0, 0.9, 2.4, 0.3);
    ball(g, p.leaf, 1.0, -0.8, 2.5, -0.4);
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2;
      const e = (r() - 0.3) * 1.2;
      ball(g, p.fruit, 0.13, Math.cos(a) * 1.35 * Math.cos(e), 2.7 + Math.sin(e) * 1.2, Math.sin(a) * 1.35 * Math.cos(e), [1, 1, 1], 0);
    }
  },
});

register('arvore_pinheiro', {
  category: 'arvores',
  label: 'Pinheiro',
  description: 'Árvore em forma de cone, feita de camadas empilhadas. Altura padrão 6 m.',
  params: {
    height: [6, 'altura total'],
    leaf: ['#2f7d4a', 'cor da folhagem'],
    layers: [4, 'número de camadas (3 a 6)'],
  },
  variants: { clara: { leaf: '#4fa35a' }, alta: { height: 10, layers: 5 }, nevada: { leaf: '#dfeee8' } },
  make(g, p) {
    const n = Math.max(2, Math.min(7, Math.round(p.layers)));
    const th = p.height * 0.18;
    cyl(g, '#7a4a2b', 0.18, 0.26, th + 0.3, 0, 0, 0, 7);
    const span = p.height - th;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const r = (1.5 * p.height / 6) * (1 - k * 0.75);
      const h = (span / n) * 1.6;
      cyl(g, p.leaf, 0.02, r, h, 0, th + (span / n) * i * 0.85, 0, 8);
    }
  },
});

register('palmeira', {
  category: 'arvores',
  label: 'Palmeira',
  description: 'Palmeira de tronco levemente curvo em gomos e folhas compridas. 7 m.',
  params: {
    height: [7, 'altura total'],
    leaf: ['#4faa52', 'cor das folhas'],
    seed: [1, 'varia a curvatura'],
  },
  variants: { baixa: { height: 4.5, seed: 3 }, alta: { height: 10, seed: 2 } },
  make(g, p) {
    const r = rng(p.seed);
    const segs = 6;
    const sh = p.height / segs;
    const bend = (r() - 0.5) * 0.9;
    let x = 0;
    let y = 0;
    for (let i = 0; i < segs; i++) {
      const m = cyl(g, i % 2 ? '#a07a52' : '#8f6a45', 0.2 - i * 0.012, 0.24 - i * 0.012, sh + 0.05, x, y, 0, 8);
      x += (bend / segs) * 1.5;
      y += sh;
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const leaf = bx(g, p.leaf, 0.35, 0.06, 2.6, 0, 0, 0, 0.02);
      leaf.position.set(x + Math.sin(a) * 1.15, y + 0.1, Math.cos(a) * 1.15);
      leaf.rotation.set(0, a, 0);
      leaf.rotateX(0.55);
    }
    ball(g, '#7a5a3a', 0.28, x, y + 0.05, 0, [1, 1, 1], 0);
  },
});

register('arbusto', {
  category: 'arvores',
  label: 'Arbusto',
  description: 'Moita baixa de bolas verdes, para cercas vivas e jardins. 1,2 m.',
  params: {
    leaf: ['#4f9d4a', 'cor'],
    flowers: [false, 'com florzinhas'],
    seed: [1, 'varia o formato'],
  },
  variants: { florido: { flowers: true }, claro: { leaf: '#7dbd55', seed: 2 } },
  make(g, p) {
    const r = rng(p.seed);
    ball(g, p.leaf, 0.7, 0, 0.55, 0);
    for (let i = 0; i < 3; i++) ball(g, p.leaf, 0.5 + r() * 0.2, (r() - 0.5) * 1.3, 0.4, (r() - 0.5) * 0.9);
    if (p.flowers) for (let i = 0; i < 6; i++) ball(g, ['#f2c94c', '#e8587a', '#ffffff'][i % 3], 0.1, (r() - 0.5) * 1.3, 0.7 + r() * 0.4, 0.5 + r() * 0.2, [1, 1, 1], 0);
  },
});

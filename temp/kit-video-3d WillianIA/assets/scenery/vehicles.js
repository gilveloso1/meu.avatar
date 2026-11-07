// Veículos. A frente aponta para +Z. As rodas são grupos que giram (use rollWheels(veiculo, distanciaAndada)).

import * as THREE from 'three';
import { register, PAL, bx, cyl, wheel, mesh, rbox, cylinder, sphere } from './kit.js';

function car(g, p, { length, cabinLen, cabinZ, taxi }) {
  const L = length;
  bx(g, p.color, 1.8, 0.62, L, 0, 0.3, 0, 0.12);
  bx(g, '#2b2f34', 1.76, 0.2, L + 0.12, 0, 0.22, 0, 0.05);
  bx(g, p.color, 1.62, 0.62, cabinLen, 0, 0.92, cabinZ, 0.18);
  const zf = cabinZ + cabinLen / 2;
  const zb = cabinZ - cabinLen / 2;
  for (const sx of [-1, 1]) bx(g, PAL.glass, 0.03, 0.44, cabinLen - 0.5, sx * 0.81, 0.99, cabinZ, 0.01);
  bx(g, PAL.glass, 1.4, 0.42, 0.04, 0, 0.99, zf + 0.0, 0.01);
  bx(g, PAL.glass, 1.4, 0.42, 0.04, 0, 0.99, zb, 0.01);
  for (const sx of [-1, 1]) {
    bx(g, '#fff6c8', 0.38, 0.16, 0.06, sx * 0.6, 0.5, L / 2, 0.03);
    bx(g, PAL.red, 0.38, 0.14, 0.06, sx * 0.6, 0.5, -L / 2, 0.03);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(g, sx * 0.9, 0.33, sz * (L / 2 - 0.85), 0.33, 0.24);
  if (taxi) bx(g, '#fff6c8', 0.5, 0.18, 0.25, 0, 1.54, cabinZ, 0.05);
}

register('carro_sedan', {
  category: 'veiculos',
  label: 'Carro sedã',
  description: 'Carro de passeio com porta-malas. 1,8 × 4,4 m. Rodas giram com rollWheels().',
  params: { color: ['#d9473a', 'cor da carroceria'], taxi: [false, 'luminoso de táxi no teto'] },
  variants: { azul: { color: '#3d6fb6' }, branco: { color: '#f2f2f2' }, taxi: { color: '#f2c94c', taxi: true }, verde: { color: '#4f9d5a' } },
  make(g, p) { car(g, p, { length: 4.4, cabinLen: 2.1, cabinZ: -0.25, taxi: p.taxi }); },
});

register('carro_hatch', {
  category: 'veiculos',
  label: 'Carro hatch',
  description: 'Carro compacto de traseira alta. 1,8 × 3,8 m.',
  params: { color: ['#3d6fb6', 'cor da carroceria'] },
  variants: { vermelho: { color: '#d9473a' }, amarelo: { color: '#f2c94c' }, preto: { color: '#2f3338' } },
  make(g, p) { car(g, p, { length: 3.8, cabinLen: 2.4, cabinZ: -0.3, taxi: false }); },
});

register('onibus', {
  category: 'veiculos',
  label: 'Ônibus',
  description: 'Ônibus urbano com janelões, letreiro e portas. 2,5 × 10 m, 3,1 m de altura.',
  params: { color: ['#f2c94c', 'cor da carroceria'], stripe: ['#3d6fb6', 'cor da faixa'] },
  variants: { vermelho: { color: '#d9473a', stripe: '#ffffff' }, azul: { color: '#3d6fb6', stripe: '#f2c94c' }, verde: { color: '#4f9d5a', stripe: '#ffffff' } },
  make(g, p) {
    bx(g, p.color, 2.5, 2.6, 10, 0, 0.45, 0, 0.15);
    bx(g, p.stripe, 2.52, 0.35, 10.02, 0, 1.0, 0, 0.05);
    bx(g, '#2b2f34', 2.4, 0.4, 10.1, 0, 0.3, 0, 0.05);
    for (const sx of [-1, 1]) {
      bx(g, PAL.glass, 0.04, 0.95, 8.2, sx * 1.25, 1.75, -0.4, 0.01);
      for (let z = -4; z <= 3.4; z += 1.6) bx(g, p.color, 0.06, 0.95, 0.1, sx * 1.26, 1.75, z, 0.01);
    }
    bx(g, PAL.glass, 2.2, 1.2, 0.04, 0, 1.55, 5.0, 0.01);
    bx(g, '#1f2328', 1.8, 0.3, 0.04, 0, 2.85, 5.01, 0.01);
    bx(g, '#f2a03a', 1.2, 0.12, 0.05, 0, 2.93, 5.03, 0.01);
    bx(g, '#d8d8d4', 1.2, 0.2, 2.4, 0, 3.05, -1, 0.05);
    for (const sx of [-1, 1]) {
      bx(g, '#fff6c8', 0.4, 0.2, 0.06, sx * 0.9, 0.65, 5.0, 0.03);
      bx(g, PAL.red, 0.4, 0.2, 0.06, sx * 0.9, 0.65, -5.0, 0.03);
      wheel(g, sx * 1.15, 0.5, 3.2, 0.5, 0.3);
      wheel(g, sx * 1.15, 0.5, -3.0, 0.5, 0.3);
    }
    bx(g, PAL.glass, 0.04, 1.8, 1.1, 1.26, 0.85, 2.0, 0.01);
  },
});

function truckBase(g, p) {
  bx(g, '#3a3f45', 2.2, 0.35, 8.2, 0, 0.55, 0, 0.04);
  bx(g, p.cab, 2.4, 2.0, 2.0, 0, 0.9, 3.1, 0.14);
  bx(g, p.cab, 2.3, 0.7, 1.0, 0, 0.9, 4.45, 0.1);
  bx(g, PAL.glass, 2.1, 0.9, 0.04, 0, 1.75, 4.12, 0.01);
  for (const sx of [-1, 1]) {
    bx(g, PAL.glass, 0.04, 0.8, 1.2, sx * 1.21, 1.75, 3.1, 0.01);
    bx(g, '#fff6c8', 0.4, 0.18, 0.06, sx * 0.8, 0.95, 4.96, 0.03);
    wheel(g, sx * 1.1, 0.5, 3.4, 0.5, 0.32);
    wheel(g, sx * 1.1, 0.5, -2.2, 0.5, 0.32);
    wheel(g, sx * 1.1, 0.5, -3.5, 0.5, 0.32);
  }
}

register('caminhao_cacamba', {
  category: 'veiculos',
  label: 'Caminhão caçamba',
  description: 'Caminhão basculante para terra e entulho. setProgress(0..1) levanta a caçamba. 2,5 × 10 m.',
  params: { cab: ['#f28c28', 'cor da cabine'], bed: ['#7b8794', 'cor da caçamba'], tilt: [0, 'inclinação inicial da caçamba 0..1'] },
  variants: { amarelo: { cab: '#f2c94c' }, azul: { cab: '#3d6fb6', bed: '#d8d8d4' }, levantada: { tilt: 1 } },
  make(g, p) {
    truckBase(g, p);
    const bed = new THREE.Group();
    bed.position.set(0, 0.95, -3.9);
    g.add(bed);
    bx(bed, p.bed, 2.5, 0.2, 6.2, 0, 0, 3.1, 0.04);
    for (const sx of [-1, 1]) bx(bed, p.bed, 0.15, 1.2, 6.2, sx * 1.2, 0.1, 3.1, 0.04);
    bx(bed, p.bed, 2.5, 1.6, 0.15, 0, 0.1, 6.15, 0.04);
    bx(bed, p.bed, 2.5, 0.9, 0.12, 0, 0.1, 0.0, 0.03);
    const set = (k) => { bed.rotation.x = -k * 0.85; };
    set(p.tilt);
    g.userData.setProgress = set;
  },
});

register('betoneira', {
  category: 'veiculos',
  label: 'Caminhão betoneira',
  description: 'Caminhão de concreto com tambor listrado que gira (updateScenery(obj, t)). 2,5 × 9 m.',
  params: { cab: ['#f2f2f2', 'cor da cabine'], drum: ['#f28c28', 'cor do tambor'] },
  variants: { verde: { drum: '#4f9d5a' }, azul: { drum: '#3d6fb6', cab: '#f2c94c' } },
  make(g, p) {
    truckBase(g, p);
    bx(g, '#5a606b', 1.6, 0.9, 2.6, 0, 0.9, -2.8, 0.06);
    const pivot = new THREE.Group();
    pivot.position.set(0, 2.5, -1.2);
    pivot.rotation.x = -1.31;
    g.add(pivot);
    const spin = new THREE.Group();
    pivot.add(spin);
    mesh(cylinder(1.15, 1.15, 3.0, 12), p.drum, { parent: spin });
    mesh(cylinder(1.15, 0.28, 1.6, 12), p.drum, { pos: [0, 2.3, 0], parent: spin });
    mesh(cylinder(0.28, 1.15, 1.3, 12), p.drum, { pos: [0, -2.15, 0], parent: spin });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      mesh(rbox(0.16, 3.1, 0.14, 0.02), '#ffffff', { pos: [Math.cos(a) * 1.17, 0, Math.sin(a) * 1.17], rot: [0, -a, 0], parent: spin });
    }
    g.userData.update = (t) => { spin.rotation.y = t * 1.2; };
  },
});

register('rolo_compressor', {
  category: 'veiculos',
  label: 'Rolo compressor',
  description: 'Máquina de compactar asfalto e solo, com dois tambores de aço e cabine aberta. 1,9 × 3,6 m. Os tambores giram com rollWheels().',
  params: { color: ['#f2c94c', 'cor do corpo'] },
  variants: { laranja: { color: '#f28c28' }, azul: { color: '#3d6fb6' } },
  make(g, p) {
    for (const sz of [-1, 1]) wheel(g, 0, 0.7, sz * 1.5, 0.7, 1.7, '#8d97a3', '#6d7783');
    bx(g, p.color, 1.5, 0.7, 3.2, 0, 0.8, 0, 0.1);
    bx(g, p.color, 1.3, 0.6, 1.4, 0, 1.4, 0.9, 0.08);
    for (const sx of [-1, 1]) for (const sz of [-1, 0.2]) cyl(g, '#2b2f34', 0.05, 0.05, 1.5, sx * 0.65, 1.5, -0.5 + sz * 0.3, 6);
    bx(g, '#2b2f34', 1.5, 0.1, 1.5, 0, 3.0, -0.6, 0.02);
    bx(g, '#3a3f45', 0.6, 0.3, 0.6, 0, 1.5, -0.55, 0.05);
    bx(g, '#d6d6d0', 1.2, 0.1, 0.6, 0, 1.1, 1.6, 0.02);
  },
});

register('vibroacabadora', {
  category: 'veiculos',
  label: 'Vibroacabadora',
  description: 'Máquina que espalha o asfalto quente em camada uniforme: caçamba na frente (recebe a massa do caminhão), esteiras e a régua alisadora atrás. 2,9 × 6 m.',
  params: { color: ['#f2c94c', 'cor do corpo'] },
  variants: { laranja: { color: '#f28c28' }, azul: { color: '#3d6fb6' } },
  make(g, p) {
    for (const sx of [-1, 1]) {
      bx(g, '#2b2f34', 0.75, 0.85, 3.8, sx * 1.15, 0, 0.2, 0.12);
      for (const z of [-1.5, 0, 1.5, 1.9]) mesh(cylinder(0.3, 0.3, 0.8, 10), '#4a4f57', { pos: [sx * 1.15, 0.38, z + 0.2], rot: [0, 0, Math.PI / 2], parent: g });
    }
    bx(g, p.color, 2.1, 1.3, 3.2, 0, 0.7, -0.1, 0.1);
    bx(g, '#2b2f34', 1.6, 0.5, 1.8, 0, 1.9, -0.9, 0.06);
    // caçamba frontal com abas laterais inclinadas
    bx(g, p.color, 2.6, 0.9, 1.5, 0, 0.8, 2.3, 0.08);
    for (const sx of [-1, 1]) {
      const aba = bx(g, p.color, 0.12, 1.1, 1.5, sx * 1.4, 0.9, 2.3, 0.04);
      aba.rotation.z = sx * -0.45;
    }
    bx(g, '#1f2328', 2.2, 0.08, 1.3, 0, 1.55, 2.3, 0.02);
    // posto do operador com toldo
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, '#2b2f34', 0.08, 1.7, 0.08, sx * 0.85, 1.4, -0.6 + sz * 0.5, 0.02);
    bx(g, '#d6d6d0', 2.0, 0.1, 1.5, 0, 3.1, -0.6, 0.03);
    bx(g, '#3a3f45', 0.6, 0.5, 0.5, 0, 1.4, -0.7, 0.05);
    // régua alisadora atrás
    bx(g, '#3a3f45', 2.9, 0.4, 0.9, 0, 0.1, -2.5, 0.05);
    bx(g, '#6d7783', 2.9, 0.12, 0.5, 0, 0.5, -2.1, 0.03);
    for (const sx of [-1, 1]) bx(g, '#6d7783', 0.12, 0.7, 1.1, sx * 1.35, 0.2, -2.0, 0.03);
  },
});

register('espargidor', {
  category: 'veiculos',
  label: 'Caminhão espargidor',
  description: 'Caminhão-tanque que espalha o ligante asfáltico líquido (imprimação e pintura de ligação). setProgress(1) liga o jato e deixa a faixa escura atrás. 2,6 × 10 m.',
  params: { cab: ['#f2f2f2', 'cor da cabine'], tank: ['#2f3338', 'cor do tanque'], spraying: [false, 'jato ligado'] },
  variants: { jorrando: { spraying: true }, vermelho: { cab: '#d9473a' } },
  make(g, p) {
    truckBase(g, p);
    mesh(cylinder(1.0, 1.0, 5.6, 14), p.tank, { pos: [0, 1.95, -1.0], rot: [Math.PI / 2, 0, 0], parent: g });
    for (const z of [-3.6, 1.6]) mesh(sphere(1.0), p.tank, { pos: [0, 1.95, z], scale: [1, 1, 0.35], parent: g });
    bx(g, '#9aa0a6', 0.3, 0.3, 4.8, 0, 3.0, -1.0, 0.05);
    bx(g, '#1f2328', 2.9, 0.14, 0.14, 0, 0.55, -5.1, 0.03);
    for (let i = -4; i <= 4; i++) bx(g, '#1f2328', 0.06, 0.2, 0.06, i * 0.32, 0.38, -5.1, 0.01);
    const jato = bx(g, '#14151a', 2.9, 0.02, 7, 0, 0, -8.8, 0.005);
    const set = (k) => { jato.visible = k > 0.5; };
    set(p.spraying ? 1 : 0);
    g.userData.setProgress = set;
  },
});

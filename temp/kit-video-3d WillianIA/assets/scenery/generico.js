// Peças genéricas e máquinas animadas, para QUALQUER tema (não só obras): formas livres, tubos, engrenagens, hélices,
// esteiras, tanques, misturadores, montes de material, escavadeira e uma fábrica de processo.
// As que se mexem sozinhas têm update(t) (updateScenery); as que "enchem/crescem" têm setProgress.

import * as THREE from 'three';
import { register, PAL, bx, cyl, mesh, rbox, sphere, cylinder, ico } from './kit.js';

const DEG = Math.PI / 180;
const MATS = {
  pedra: ['#8e9196', '#6d7077', '#a39e94'], brita: ['#9a9a94', '#7d7e84'], areia: ['#dcc58f', '#cdb27a'], terra: ['#7a5a3a', '#6a4a2c'],
  concreto: ['#b5b5b0', '#a0a09b'], asfalto: ['#16171b', '#23242a'], grao: ['#e8c25a', '#d9a93c'], carvao: ['#2a2b30', '#3a3b42'],
};
const smooth = (x) => x * x * (3 - 2 * x);
const pw = (ph, pts) => {
  if (ph <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (ph <= pts[i][0]) { const [p0, v0] = pts[i - 1]; const [p1, v1] = pts[i]; return v0 + (v1 - v0) * smooth((ph - p0) / (p1 - p0)); }
  }
  return pts[pts.length - 1][1];
};

// partículas de pedra/grão que andam ao longo de uma reta (esteiras): devolve update(t, velocidade)
function carga(parent, a, b, material, n, tam, largura) {
  const cores = MATS[material] || MATS.pedra;
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }), n);
  const c = new THREE.Color();
  for (let k = 0; k < n; k++) im.setColorAt(k, c.set(cores[k % cores.length]));
  im.castShadow = true;
  parent.add(im);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  return (t, v = 1) => {
    for (let k = 0; k < n; k++) {
      const s = (((t * 0.18 * v + k / n) % 1) + 1) % 1;
      const j = ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1;
      const e = tam * (0.7 + 0.6 * ((Math.sin(k * 78.233) * 43758.5453) % 1 + 1) % 1);
      m.compose(
        new THREE.Vector3(a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s + 0.12 + e * 0.5, a[2] + (j - 0.5) * (largura - 0.2)),
        q.setFromEuler(new THREE.Euler(k, k * 2, 0)),
        new THREE.Vector3(e, e * 0.8, e),
      );
      im.setMatrixAt(k, m);
    }
    im.instanceMatrix.needsUpdate = true;
  };
}

register('forma', {
  category: 'formas',
  label: 'Forma livre',
  description: 'Peça básica para montar qualquer coisa (tanque, bloco, pilar, bola, lâmpada, quadro...). Empilhe várias para criar máquinas, diagramas e cenários novos. Combine com "anim", "opacidade" e "fluxos".',
  params: {
    tipo: ['caixa', "'caixa' | 'cilindro' | 'esfera' | 'cone' | 'toro' | 'capsula'"],
    tamanho: [[1, 1, 1], '[largura, altura, profundidade] em metros'],
    cor: ['#8a95a3', 'cor'],
    brilho: [false, 'superfície metálica/brilhante'],
    emissivo: [false, 'brilha sozinha (lâmpada, brasa, tela)'],
    apoiada: [true, 'true: a base fica no chão (y=0); false: centrada em y=0'],
  },
  variants: { tanque: { tipo: 'cilindro', tamanho: [2, 3, 2], cor: '#9aa7b5', brilho: true }, bola: { tipo: 'esfera', tamanho: [1.5, 1.5, 1.5], cor: '#e8587a' }, lampada: { tipo: 'esfera', tamanho: [0.8, 0.8, 0.8], cor: '#ffe066', emissivo: true } },
  make(g, p) {
    const [x, y, z] = p.tamanho;
    let geo;
    if (p.tipo === 'cilindro') geo = new THREE.CylinderGeometry(x / 2, x / 2, y, 16);
    else if (p.tipo === 'cone') geo = new THREE.CylinderGeometry(0, x / 2, y, 16);
    else if (p.tipo === 'esfera') geo = new THREE.SphereGeometry(0.5, 16, 10);
    else if (p.tipo === 'toro') geo = new THREE.TorusGeometry(x / 2, Math.min(y, z) / 2, 10, 24);
    else if (p.tipo === 'capsula') geo = new THREE.CapsuleGeometry(Math.min(x, z) / 2, Math.max(0.01, y - Math.min(x, z)), 6, 12);
    else geo = rbox(x, y, z, Math.min(0.06, Math.min(x, y, z) / 4));
    const mat = new THREE.MeshStandardMaterial({
      color: p.cor, roughness: p.brilho ? 0.25 : 0.85, metalness: p.brilho ? 0.55 : 0, flatShading: !p.brilho,
      ...(p.emissivo ? { emissive: p.cor, emissiveIntensity: 1.2 } : {}),
    });
    const m = new THREE.Mesh(geo, mat);
    if (p.tipo === 'esfera') m.scale.set(x, y, z);
    m.position.y = p.apoiada ? y / 2 : 0;
    g.add(m);
  },
});

register('tubo', {
  category: 'formas',
  label: 'Tubo / cano',
  description: 'Tubulação por pontos [x,y,z] (cano, fio, mangueira, veia). Use junto de um fluxo com "caminho" igual aos pontos para mostrar o que passa dentro, e "opacidade" 0.35 para enxergar o fluxo.',
  params: {
    pontos: [[[0, 0, 0], [0, 2, 0], [3, 2, 0]], 'lista de pontos [x,y,z] (relativos ao objeto)'],
    raio: [0.15, 'raio do tubo'],
    cor: ['#9aa7b5', 'cor'],
  },
  variants: { vermelho: { cor: '#d9473a' }, azul: { cor: '#3d8ee0' }, cobre: { cor: '#c97b45' } },
  make(g, p) {
    const pts = p.pontos.map((q) => new THREE.Vector3(...q));
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const d = new THREE.Vector3().subVectors(b, a);
      const L = d.length();
      if (L < 1e-4) continue;
      const m = mesh(cylinder(p.raio, p.raio, L, 10), p.cor, { parent: g });
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(up, d.normalize());
    }
    for (const q of pts) mesh(sphere(p.raio * 1.02), p.cor, { pos: q.toArray(), parent: g });
  },
});

register('engrenagem', {
  category: 'maquinas',
  label: 'Engrenagem',
  description: 'Engrenagem que gira sozinha (eixo para a câmera, +Z). Use duas lado a lado com velocidades opostas e "fase" diferente para mostrar transmissão. update(t).',
  params: {
    dentes: [12, 'número de dentes'], raio: [1, 'raio'], cor: ['#c9a227', 'cor'],
    velocidade: [60, 'graus por segundo (negativo = outro sentido)'], fase: [0, 'ângulo inicial em graus'],
  },
  variants: { prata: { cor: '#aab4c0' }, vermelha: { cor: '#d9473a', velocidade: -60 } },
  make(g, p) {
    const eixo = new THREE.Group(); // o eixo fica acima do chão (raio × 1.3), para a engrenagem não afundar
    eixo.position.y = p.raio * 1.3;
    g.add(eixo);
    const gr = new THREE.Group();
    eixo.add(gr);
    mesh(cylinder(p.raio, p.raio, 0.3, 24), p.cor, { rot: [Math.PI / 2, 0, 0], parent: gr });
    mesh(cylinder(p.raio * 0.28, p.raio * 0.28, 0.42, 12), '#4a4f57', { rot: [Math.PI / 2, 0, 0], parent: gr });
    for (let i = 0; i < p.dentes; i++) {
      const a = (i / p.dentes) * Math.PI * 2;
      const t = rbox(p.raio * 0.28, p.raio * 0.3, 0.3, 0.02);
      mesh(t, p.cor, { pos: [Math.cos(a) * p.raio * 1.05, Math.sin(a) * p.raio * 1.05, 0], rot: [0, 0, a + Math.PI / 2], parent: gr });
    }
    g.userData.update = (t) => { gr.rotation.z = (p.fase + p.velocidade * t) * DEG; };
    g.userData.update(0);
  },
});

register('helice', {
  category: 'maquinas',
  label: 'Hélice / ventilador',
  description: 'Hélice, pá de ventilador ou turbina que gira sozinha (eixo +Z). update(t).',
  params: { pas: [4, 'número de pás'], raio: [1.2, 'raio'], cor: ['#e8eef5', 'cor das pás'], velocidade: [360, 'graus por segundo'] },
  variants: { turbina: { pas: 3, raio: 2.5, velocidade: 90 }, ventilador: { pas: 5, raio: 0.8, cor: '#7fb0e0' } },
  make(g, p) {
    const eixo = new THREE.Group(); // eixo acima do chão (raio × 1.3)
    eixo.position.y = p.raio * 1.3;
    g.add(eixo);
    const gr = new THREE.Group();
    eixo.add(gr);
    mesh(sphere(p.raio * 0.16), '#4a4f57', { parent: gr });
    for (let i = 0; i < p.pas; i++) {
      const a = (i / p.pas) * Math.PI * 2;
      const pa = mesh(rbox(p.raio * 0.28, p.raio * 0.95, 0.05, 0.02), p.cor, { pos: [Math.cos(a + Math.PI / 2) * p.raio * 0.55, Math.sin(a + Math.PI / 2) * p.raio * 0.55, 0], rot: [0.35, 0, a], parent: gr });
      pa.castShadow = true;
    }
    g.userData.update = (t) => { gr.rotation.z = p.velocidade * t * DEG; };
    g.userData.update(0);
  },
});

register('esteira', {
  category: 'maquinas',
  label: 'Esteira transportadora',
  description: 'Esteira com material andando sobre ela (pedra, areia, grão, carvão...). Pode ser inclinada. update(t).',
  params: {
    comprimento: [6, 'comprimento em metros'], largura: [0.9, 'largura'], inclinacao: [0, 'graus de subida'],
    material: ['pedra', "'pedra' | 'brita' | 'areia' | 'terra' | 'concreto' | 'grao' | 'carvao'"], velocidade: [1, 'velocidade (1 = normal)'],
  },
  variants: { subindo: { inclinacao: 22, comprimento: 8 }, graos: { material: 'grao' }, areia: { material: 'areia' } },
  make(g, p) {
    const L = p.comprimento;
    const a = [-L / 2, 0, 0];
    const b = [L / 2, 0, 0];
    const gr = new THREE.Group();
    gr.rotation.z = p.inclinacao * DEG;
    gr.position.y = 0.55 + (Math.sin(p.inclinacao * DEG) * L) / 2;
    g.add(gr);
    bx(gr, '#2b2f34', L, 0.16, p.largura, 0, -0.08, 0, 0.03);
    for (const sz of [-1, 1]) bx(gr, '#8d97a3', L, 0.2, 0.06, 0, 0.0, sz * (p.largura / 2), 0.01);
    for (const sx of [-1, 1]) mesh(cylinder(0.2, 0.2, p.largura + 0.1, 12), '#4a4f57', { pos: [sx * L / 2, -0.08, 0], rot: [Math.PI / 2, 0, 0], parent: gr });
    for (let x = -L / 2 + 1; x < L / 2; x += 2) { const pe = bx(g, '#6d7783', 0.2, 0.55 + Math.sin(p.inclinacao * DEG) * (x + L / 2), 0.2, 0, 0, 0, 0.02); pe.position.set(x * Math.cos(p.inclinacao * DEG), (0.55 + Math.sin(p.inclinacao * DEG) * (x + L / 2)) / 2 - 0.0, 0); }
    const up = carga(gr, a, b, p.material, Math.max(10, Math.round(L * 4)), 0.14, p.largura);
    g.userData.update = (t) => up(t, p.velocidade);
    g.userData.update(0);
  },
});

register('monte', {
  category: 'maquinas',
  label: 'Monte de material',
  description: 'Pilha de pedra, areia, terra, grão, carvão ou asfalto. setProgress(0..1) faz o monte CRESCER (combine com um fluxo caindo em cima).',
  params: { material: ['pedra', "'pedra' | 'brita' | 'areia' | 'terra' | 'concreto' | 'grao' | 'carvao' | 'asfalto'"], raio: [1.6, 'raio da base'], progress: [1, 'tamanho inicial 0..1'] },
  variants: { areia: { material: 'areia' }, terra: { material: 'terra' }, grao: { material: 'grao' }, pequeno: { raio: 0.9 } },
  make(g, p) {
    const cores = MATS[p.material] || MATS.pedra;
    const gr = new THREE.Group();
    g.add(gr);
    // meia esfera achatada: a base fica rente ao chão
    mesh(new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), cores[0], { scale: [p.raio, p.raio * 0.62, p.raio], parent: gr });
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const r = p.raio * (0.5 + (i % 3) * 0.18);
      mesh(ico(0), cores[i % cores.length], { pos: [Math.cos(a) * r, p.raio * 0.12, Math.sin(a) * r], scale: p.raio * 0.16, parent: gr });
    }
    const set = (k) => { const s = 0.05 + 0.95 * k; gr.scale.set(s, s, s); gr.visible = k > 0.001; };
    set(p.progress);
    g.userData.setProgress = set;
  },
});

register('tanque', {
  category: 'maquinas',
  label: 'Tanque / silo transparente',
  description: 'Reservatório (água, leite, grão, combustível) com casca transparente e o conteúdo visível. setProgress(0..1) muda o NÍVEL (encher/esvaziar).',
  params: { raio: [1.2, 'raio'], altura: [3, 'altura'], liquido: ['#3fa5e0', 'cor do conteúdo'], casca: ['#cfd8e3', 'cor da casca'], nivel: [0.6, 'nível inicial 0..1'] },
  variants: { agua: {}, leite: { liquido: '#f4f1e8' }, oleo: { liquido: '#2a1f12' }, grao: { liquido: '#e0b84a' } },
  make(g, p) {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(p.raio, p.raio, p.altura, 20, 1, true), new THREE.MeshStandardMaterial({ color: p.casca, transparent: true, opacity: 0.28, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }));
    shell.position.y = p.altura / 2;
    g.add(shell);
    bx(g, '#8d97a3', p.raio * 2.2, 0.15, p.raio * 2.2, 0, 0, 0, 0.03);
    mesh(cylinder(p.raio * 1.04, p.raio * 1.04, 0.12, 20), '#8d97a3', { pos: [0, p.altura, 0], parent: g });
    const fill = mesh(cylinder(p.raio * 0.94, p.raio * 0.94, 1, 20), p.liquido, { parent: g });
    const set = (k) => { const h = Math.max(0.02, p.altura * 0.96 * k); fill.scale.y = h; fill.position.y = 0.08 + h / 2; };
    set(p.nivel);
    g.userData.setProgress = set;
  },
});

register('misturador', {
  category: 'maquinas',
  label: 'Misturador / tambor',
  description: 'Tanque aberto com pás girando e o conteúdo sendo misturado (massa, tinta, concreto, comida). Visto de cima fica bonito. update(t).',
  params: { raio: [1.4, 'raio'], conteudo: ['#9a8f7a', 'cor da mistura'], pas: ['#f2c94c', 'cor das pás'], velocidade: [90, 'graus por segundo'] },
  variants: { tinta: { conteudo: '#e8587a' }, concreto: { conteudo: '#a9a9a3' }, massa: { conteudo: '#f0dcae' } },
  make(g, p) {
    const h = 1.0;
    mesh(cylinder(p.raio, p.raio * 0.9, h, 20), '#5a6572', { pos: [0, h / 2, 0], parent: g });
    mesh(cylinder(p.raio * 0.9, p.raio * 0.9, 0.05, 20), p.conteudo, { pos: [0, h - 0.12, 0], parent: g });
    const eixo = new THREE.Group();
    eixo.position.y = h - 0.1;
    g.add(eixo);
    mesh(cylinder(0.1, 0.1, 1.6, 8), '#c9ced4', { pos: [0, 0.6, 0], parent: eixo });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; bx(eixo, p.pas, p.raio * 0.8, 0.14, 0.22, Math.cos(a) * p.raio * 0.4, -0.1, Math.sin(a) * p.raio * 0.4, 0.02).rotation.y = -a; }
    const bolhas = [];
    for (let i = 0; i < 10; i++) bolhas.push(mesh(sphere(0.1), p.conteudo, { parent: g }));
    g.userData.update = (t) => {
      eixo.rotation.y = p.velocidade * t * DEG;
      bolhas.forEach((b, i) => {
        const a = i * 2.4 + t * 1.6;
        const r = p.raio * (0.25 + ((i * 7) % 6) * 0.1);
        b.position.set(Math.cos(a) * r, h - 0.1 + 0.08 * Math.sin(t * 5 + i), Math.sin(a) * r);
      });
    };
    g.userData.update(0);
  },
});

register('escavadeira', {
  category: 'maquinas',
  label: 'Escavadeira',
  description: 'Escavadeira que cava, gira e despeja em ciclo (update). Para mostrar terraplenagem, mineração, obra. Cava na frente (+Z) e despeja à esquerda (-X, uns 5 m); ponha um "monte" lá. Use "fase" = -(início da cena) para o ciclo começar com a cena.',
  params: { cor: ['#f2c94c', 'cor do corpo'], ciclo: [6, 'segundos por ciclo de escavação'], fase: [0, 'segundos de deslocamento do ciclo (use -início da cena)'] },
  variants: { laranja: { cor: '#f28c28' }, rapida: { ciclo: 4 } },
  make(g, p) {
    for (const sx of [-1, 1]) {
      bx(g, '#2b2f34', 0.8, 0.9, 4.2, sx * 1.35, 0, 0, 0.12);
      for (const z of [-1.6, 0, 1.6]) mesh(cylinder(0.32, 0.32, 0.9, 10), '#4a4f57', { pos: [sx * 1.35, 0.4, z], rot: [0, 0, Math.PI / 2], parent: g });
    }
    bx(g, '#3a3f45', 2.2, 0.35, 2.6, 0, 0.75, 0, 0.05);
    const cab = new THREE.Group();
    cab.position.y = 1.1;
    g.add(cab);
    bx(cab, p.cor, 2.7, 1.0, 3.2, 0, 0, -0.2, 0.1);
    bx(cab, p.cor, 2.3, 0.9, 0.9, 0, 0, -2.0, 0.1);
    bx(cab, '#2b2f34', 1.1, 1.3, 1.3, -0.7, 1.0, 0.6, 0.08);
    bx(cab, PAL.glass, 1.0, 0.9, 0.05, -0.7, 1.2, 1.27, 0.01);
    const boom = new THREE.Group();
    boom.position.set(0.7, 0.5, 1.4);
    cab.add(boom);
    bx(boom, p.cor, 0.45, 0.5, 3.8, 0, -0.25, 1.9, 0.06);
    const stick = new THREE.Group();
    stick.position.set(0, 0, 3.8);
    boom.add(stick);
    bx(stick, '#e0b43a', 0.35, 0.4, 2.4, 0, -0.2, 1.2, 0.05);
    const balde = new THREE.Group();
    balde.position.set(0, 0, 2.4);
    stick.add(balde);
    bx(balde, '#6d7783', 1.2, 0.8, 1.0, 0, -0.6, 0.3, 0.05);
    const terra = [];
    const tg = new THREE.Group();
    g.add(tg);
    for (let i = 0; i < 14; i++) terra.push(mesh(ico(0), '#7a5a3a', { scale: 0.13, parent: tg }));
    const quedaMat = new THREE.Vector3();
    g.userData.update = (t) => {
      const ph = (((t + p.fase) / p.ciclo) % 1 + 1) % 1;
      cab.rotation.y = pw(ph, [[0, 0], [0.45, 0], [0.7, -1.5], [0.85, -1.5], [1, 0]]);
      boom.rotation.x = pw(ph, [[0, -0.55], [0.25, -0.2], [0.45, -0.75], [0.7, -0.75], [0.85, -0.55], [1, -0.55]]);
      stick.rotation.x = pw(ph, [[0, 0.9], [0.25, 0.6], [0.45, 1.0], [0.7, 1.0], [0.85, 0.85], [1, 0.9]]);
      balde.rotation.x = pw(ph, [[0, -0.2], [0.25, 0.9], [0.7, 0.9], [0.78, -0.6], [0.88, -0.2], [1, -0.2]]);
      g.updateMatrixWorld(true);
      balde.getWorldPosition(quedaMat);
      g.worldToLocal(quedaMat);
      const solta = ph > 0.72 && ph < 0.86 ? (ph - 0.72) / 0.14 : -1;
      terra.forEach((m, i) => {
        if (solta < 0) { m.visible = false; return; }
        const u = Math.min(1, solta * 1.4 + (i / 14) * 0.2);
        m.visible = true;
        m.position.set(quedaMat.x + (i % 3 - 1) * 0.2, quedaMat.y * (1 - u * u) + 0.1, quedaMat.z + ((i * 7) % 3 - 1) * 0.2);
      });
    };
    g.userData.update(0);
  },
});

register('fabrica_processo', {
  category: 'maquinas',
  label: 'Fábrica de processamento',
  description: 'Linha de processamento animada: 3 silos de matéria-prima, esteira subindo até um tambor rotativo aquecido (com chama), chaminé soltando fumaça e torre com bica de descarga. Serve para usinas, fábricas de cimento, de ração, de plástico etc. update(t). 22 × 14 m. Caminhão no ponto [9.5, 0, 3.6] (giro 0) recebe a carga.',
  params: { material: ['pedra', "material nas esteiras: 'pedra' | 'areia' | 'grao' | 'carvao'"], carregando: [true, 'bica despejando material para o caminhão'], velocidade: [1, 'velocidade da linha'] },
  variants: { graos: { material: 'grao' }, areia: { material: 'areia' } },
  make(g, p) {
    bx(g, '#9a9a94', 24, 0.25, 15, 0, -0.25, 0, 0.03);
    const zl = -3;
    const cores = ['#8e9196', '#a39e94', '#d9c28f'];
    for (let i = 0; i < 3; i++) {
      const x = -9.5 + i * 1.8;
      for (const sx of [-0.6, 0.6]) for (const sz of [-0.6, 0.6]) bx(g, '#6d7783', 0.14, 1.4, 0.14, x + sx, 0, zl + sz, 0.02);
      bx(g, '#d5dae0', 1.6, 1.3, 1.6, x, 1.4, zl, 0.06);
      mesh(ico(1), cores[i], { pos: [x, 2.8, zl], scale: [0.7, 0.35, 0.7], parent: g });
    }
    const belt1 = new THREE.Group();
    belt1.position.set(-7.6, 1.0, zl);
    g.add(belt1);
    bx(belt1, '#2b2f34', 6, 0.16, 0.9, 0, -0.08, 0, 0.03);
    const up1 = carga(belt1, [-3, 0, 0], [3, 0, 0], p.material, 22, 0.13, 0.9);
    const ang = Math.atan2(3.9, 4.2);
    const belt2 = new THREE.Group();
    belt2.position.set(-2.6 + 2.1, 1.0 + 1.95, zl);
    belt2.rotation.z = ang;
    g.add(belt2);
    bx(belt2, '#2b2f34', 5.7, 0.16, 0.9, 0, -0.08, 0, 0.03);
    const up2 = carga(belt2, [-2.85, 0, 0], [2.85, 0, 0], p.material, 20, 0.13, 0.9);
    // tambor rotativo aquecido
    const tambor = new THREE.Group();
    tambor.position.set(2.2, 5.2, zl);
    g.add(tambor);
    mesh(cylinder(1.15, 1.15, 6.2, 18), '#7b8794', { rot: [0, 0, Math.PI / 2], parent: tambor });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; bx(tambor, '#f2a03a', 6.0, 0.12, 0.18, 0, Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0.02).rotation.x = a; }
    for (const x of [-2, 2]) bx(g, '#4a4f57', 0.5, 4.0, 1.8, 2.2 + x, 0, zl, 0.05);
    const chama = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.8, 8), new THREE.MeshBasicMaterial({ color: '#ff9a1f', fog: false }));
    chama.rotation.z = Math.PI / 2;
    chama.position.set(5.9, 5.2, zl);
    g.add(chama);
    // filtro e chaminé
    bx(g, '#aab4c0', 2.6, 3.6, 2.2, 7.4, 0, zl, 0.08);
    cyl(g, '#d5dae0', 0.5, 0.6, 13, 9.1, 0, zl, 10);
    cyl(g, '#d9473a', 0.52, 0.52, 1.0, 9.1, 12, zl, 10);
    const fumaca = [];
    for (let i = 0; i < 14; i++) fumaca.push(mesh(ico(1), '#8e9199', { parent: g }));
    fumaca.forEach((m) => { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.55; m.material.depthWrite = false; m.castShadow = false; });
    // torre de mistura com bica
    bx(g, '#6d8fb0', 3.6, 8.5, 3.6, 9.6, 0, -3.2, 0.08);
    bx(g, '#d5dae0', 0.4, 9.2, 0.4, 7.2, 0, -3.2, 0.03);
    const bica = bx(g, '#4a4f57', 1.2, 0.9, 2.4, 9.6, 3.1, -0.8, 0.06);
    bica.rotation.x = 0.25;
    const queda = [];
    for (let i = 0; i < 26; i++) queda.push(mesh(sphere(0.12), '#16171b', { parent: g }));
    g.userData.update = (t) => {
      const v = p.velocidade;
      up1(t, v);
      up2(t, v);
      tambor.rotation.x = t * 1.1 * v;
      chama.scale.set(1 + 0.2 * Math.sin(t * 22), 1 + 0.15 * Math.sin(t * 17), 1);
      fumaca.forEach((m, i) => {
        const s = (((t * 0.22 * v + i / 14) % 1) + 1) % 1;
        m.position.set(9.1 + s * 2.2, 13.2 + s * 7, zl + Math.sin(i) * 0.3);
        m.scale.setScalar(0.5 + 1.7 * s);
      });
      queda.forEach((m, i) => {
        m.visible = p.carregando;
        const s = (((t * 1.5 * v + i / 26) % 1) + 1) % 1;
        m.position.set(9.6 + Math.sin(i * 3) * 0.25, 3.2 - s * 1.5, 0.6 + Math.cos(i * 2) * 0.2);
      });
    };
    g.userData.update(0);
  },
});

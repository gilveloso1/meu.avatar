// Fluxos de material: partículas animadas que mostram o PROCESSO (pedra caindo da caçamba, líquido sendo espirrado,
// areia, água, concreto, fumaça, vapor, poeira, fogo, fagulhas). Tudo é função pura do tempo t, então o render é exato.
//
// storyboard (dentro da cena):
//   "fluxos": [{ "material": "pedra", "origem": {"ancora":"cam","desloca":[0,2,-4.6]}, "destino": [0,0.3,-8],
//                "taxa": 40, "de": 28, "ate": 31 }]
// origem/destino: [x,y,z] no mundo OU { ancora: "id", desloca: [dx,dy,dz] } (segue o objeto/personagem, girando com ele).

import * as THREE from 'three';

export const MATERIAIS = {
  pedra: { cores: ['#8e9196', '#6d7077', '#a39e94', '#7b6f64'], forma: 'rocha', tam: 0.17, modo: 'queda', vida: 0.8 },
  brita: { cores: ['#9a9a94', '#7d7e84', '#b0aca3'], forma: 'rocha', tam: 0.1, modo: 'queda', vida: 0.8 },
  areia: { cores: ['#dcc58f', '#cdb27a', '#e6d3a1'], forma: 'rocha', tam: 0.06, modo: 'queda', vida: 0.8 },
  terra: { cores: ['#7a5a3a', '#6a4a2c', '#8a6a46'], forma: 'rocha', tam: 0.15, modo: 'queda', vida: 0.9 },
  concreto: { cores: ['#b5b5b0', '#a0a09b', '#c4c4bf'], forma: 'rocha', tam: 0.14, modo: 'queda', vida: 0.8 },
  asfalto: { cores: ['#101114', '#1a1b20', '#23242a'], forma: 'gota', tam: 0.13, modo: 'jato', vida: 0.6, brilho: true },
  agua: { cores: ['#5fb4ee', '#8fd0f7', '#4aa3e0'], forma: 'gota', tam: 0.1, modo: 'jato', vida: 0.7, opac: 0.8 },
  fumaca: { cores: ['#5d6068', '#7a7d85', '#8e9199'], forma: 'nuvem', tam: 0.8, modo: 'sobe', vida: 3.4, opac: 0.55, sobe: 5.5, taxa: 6 },
  vapor: { cores: ['#ffffff', '#eef3f8'], forma: 'nuvem', tam: 0.5, modo: 'sobe', vida: 2.2, opac: 0.45, sobe: 2.6, taxa: 8 },
  poeira: { cores: ['#d2c4a2', '#bfae8a'], forma: 'nuvem', tam: 0.45, modo: 'sobe', vida: 1.5, opac: 0.5, sobe: 1.2, taxa: 10 },
  ar: { cores: ['#dff1ff', '#ffffff'], forma: 'nuvem', tam: 0.14, modo: 'jato', vida: 1.0, opac: 0.35, basico: true, arco: 0.1 },
  bolha: { cores: ['#e8f6ff', '#ffffff'], forma: 'gota', tam: 0.07, modo: 'sobe', vida: 1.6, opac: 0.55, basico: true, sobe: 1.6, taxa: 14 },
  neve: { cores: ['#ffffff', '#eaf3fb'], forma: 'gota', tam: 0.06, modo: 'queda', vida: 2.4, basico: true },
  eletricidade: { cores: ['#fff27a', '#7fd7ff', '#ffffff'], forma: 'gota', tam: 0.07, modo: 'caminho', vida: 1.0, basico: true, taxa: 28 },
  luz: { cores: ['#fff6b0', '#ffe066'], forma: 'gota', tam: 0.09, modo: 'jato', vida: 0.9, opac: 0.8, basico: true, arco: 0 },
  fagulha: { cores: ['#ffc14d', '#ff8a1f', '#fff0a0'], forma: 'gota', tam: 0.05, modo: 'jato', vida: 0.6, basico: true },
  fogo: { cores: ['#ffb020', '#ff6a00', '#ffd54a'], forma: 'nuvem', tam: 0.4, modo: 'sobe', vida: 0.7, basico: true, sobe: 1.8, taxa: 24 },
};

const GEO = {};
function geometria(forma) {
  if (!GEO[forma]) {
    GEO[forma] = forma === 'gota' ? new THREE.SphereGeometry(1, 6, 4)
      : forma === 'nuvem' ? new THREE.IcosahedronGeometry(1, 1) : new THREE.IcosahedronGeometry(1, 0);
  }
  return GEO[forma];
}

// número pseudo-aleatório determinístico (0..1) a partir de 3 inteiros
const h = (a, b, c) => { const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return x - Math.floor(x); };

const O = new THREE.Vector3();
const D = new THREE.Vector3();
const P = new THREE.Vector3();
const S = new THREE.Vector3();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const M = new THREE.Matrix4();
const COR = new THREE.Color();

// resolver(ponto, t, out) → converte origem/destino ({ancora} ou [x,y,z]) em coordenadas do mundo no instante t
export function criarFluxo(spec, resolver) {
  const m = MATERIAIS[spec.material];
  if (!m) throw new Error(`Fluxo com material "${spec.material}" desconhecido (opções: ${Object.keys(MATERIAIS).join(', ')}).`);
  // "caminho": as partículas percorrem uma linha quebrada de pontos [x,y,z] (cano, fio, veia, esteira...)
  const caminho = spec.caminho && spec.caminho.length >= 2 ? spec.caminho : null;
  const modo = caminho ? 'caminho' : spec.modo || m.modo;
  const taxa = spec.taxa ?? m.taxa ?? 40;
  let acum = [0];
  if (caminho) {
    for (let i = 1; i < caminho.length; i++) acum.push(acum[i - 1] + Math.hypot(caminho[i][0] - caminho[i - 1][0], caminho[i][1] - caminho[i - 1][1], caminho[i][2] - caminho[i - 1][2]));
  }
  const compr = acum[acum.length - 1] || 1;
  const vida = spec.vida ?? (caminho ? compr / (spec.velocidade ?? 2) : m.vida);
  const tam = spec.tamanho ?? m.tam;
  const disp = spec.dispersao ?? (modo === 'sobe' ? 0.3 : 0.25);
  const esp = spec.espalha ?? 0.4;
  const arco = spec.arco ?? (modo === 'jato' ? 0.35 : 0);
  const subida = spec.subida ?? m.sobe ?? 2;
  const N = Math.min(1600, Math.max(1, Math.ceil(taxa * vida) + 2));
  const periodo = N / taxa;

  const material = m.basico
    ? new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: !!m.opac, opacity: m.opac ?? 1, fog: false })
    : new THREE.MeshStandardMaterial({
      color: '#ffffff', roughness: m.brilho ? 0.2 : 0.9, metalness: m.brilho ? 0.35 : 0, flatShading: true,
      transparent: !!m.opac, opacity: m.opac ?? 1, depthWrite: !m.opac,
    });
  const mesh = new THREE.InstancedMesh(geometria(m.forma), material, N);
  mesh.frustumCulled = false;
  mesh.castShadow = !m.opac && !m.basico;
  mesh.receiveShadow = false;
  for (let k = 0; k < N; k++) mesh.setColorAt(k, COR.set(m.cores[k % m.cores.length]));
  mesh.instanceColor.needsUpdate = true;

  const esconder = (k) => { M.makeScale(0, 0, 0); mesh.setMatrixAt(k, M); };

  return {
    mesh,
    atualizar(t) {
      const ativo = t >= spec.de && t < spec.ate + vida;
      mesh.visible = ativo;
      if (!ativo) return;
      for (let k = 0; k < N; k++) {
        const fase = k / taxa;
        const tt = t - spec.de - fase;
        if (tt < 0) { esconder(k); continue; }
        const ciclo = Math.floor(tt / periodo);
        const idade = tt - ciclo * periodo;
        const nasc = spec.de + fase + ciclo * periodo;
        if (nasc >= spec.ate || idade >= vida) { esconder(k); continue; }
        const u = idade / vida;
        const r1 = h(k, ciclo, 1);
        const r2 = h(k, ciclo, 2);
        const r3 = h(k, ciclo, 3);
        const r4 = h(k, ciclo, 4);
        const a1 = r1 * Math.PI * 2;
        const rd = Math.sqrt(r2) * disp;
        let escala = tam * (0.7 + 0.6 * r3);
        if (modo === 'caminho') {
          const s = u * compr;
          let i = 1;
          while (i < acum.length - 1 && acum[i] < s) i++;
          const seg = (s - acum[i - 1]) / Math.max(1e-6, acum[i] - acum[i - 1]);
          const A = caminho[i - 1];
          const B = caminho[i];
          P.set(A[0] + (B[0] - A[0]) * seg + Math.cos(a1) * rd, A[1] + (B[1] - A[1]) * seg + Math.sin(a1) * rd, A[2] + (B[2] - A[2]) * seg);
          if (u > 0.94) escala *= (1 - u) / 0.06;
          E.set(r1 * 6, r2 * 6, 0);
          Q.setFromEuler(E);
          S.set(escala, escala, escala);
          M.compose(P, Q, S);
          mesh.setMatrixAt(k, M);
          continue;
        }
        resolver(spec.origem, nasc, O);
        if (modo === 'sobe') {
          P.set(O.x + Math.cos(a1) * rd + (spec.vento?.[0] ?? 0.35) * idade, O.y + subida * u, O.z + Math.sin(a1) * rd + (spec.vento?.[1] ?? 0) * idade);
          escala *= (0.5 + 1.3 * u) * (u > 0.75 ? (1 - u) * 4 : 1);
        } else {
          const ox = O.x + Math.cos(a1) * rd;
          const oz = O.z + Math.sin(a1) * rd;
          const oy = O.y + (r3 - 0.5) * 0.1;
          if (spec.destino) resolver(spec.destino, t, D); else D.set(O.x, 0, O.z);
          const a2 = r4 * Math.PI * 2;
          const r5 = Math.sqrt(h(k, ciclo, 5)) * esp;
          const dx = D.x + Math.cos(a2) * r5;
          const dz = D.z + Math.sin(a2) * r5;
          const dy = D.y;
          const ey = modo === 'queda' ? u * u : u;
          P.set(ox + (dx - ox) * u, oy + (dy - oy) * ey + (modo === 'jato' ? arco * 4 * u * (1 - u) : 0), oz + (dz - oz) * u);
          if (u > 0.9) escala *= (1 - u) / 0.1;
        }
        E.set(r1 * 6 + idade * 3, r2 * 6 + idade * 2, 0);
        Q.setFromEuler(E);
        S.set(escala, escala * (m.forma === 'gota' && modo === 'jato' ? 1.4 : 1), escala);
        M.compose(P, Q, S);
        mesh.setMatrixAt(k, M);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

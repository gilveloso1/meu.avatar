// Geometrias e materiais compartilhados (cache) para manter o visual low-poly consistente e leve.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const geoCache = new Map();
const matCache = new Map();

export function mat(color) {
  const key = String(color);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0 });
    matCache.set(key, m);
  }
  return m;
}

function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}

// Caixa de cantos chanfrados (2 segmentos = facetas visíveis, estilo low-poly).
export function rbox(w, h, d, r = 0.03) {
  const rad = Math.min(r, Math.min(w, h, d) / 2 - 1e-4);
  return cached(`rb:${w}:${h}:${d}:${rad}`, () => new RoundedBoxGeometry(w, h, d, 2, rad));
}

export function sphere(r, ws = 8, hs = 6) {
  return cached(`sp:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
}

export function cylinder(rTop, rBottom, h, seg = 8) {
  return cached(`cy:${rTop}:${rBottom}:${h}:${seg}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, seg));
}

// Esfera facetada (icosaedro): é a cabeça redonda low-poly.
export function ico(detail = 2) {
  return cached(`ic:${detail}`, () => new THREE.IcosahedronGeometry(1, detail));
}

// Casca de esfera de raio 1 (escale para a cabeça). theta: do topo (0) à base (π); phi: ao redor
// (z negativo = nuca = phiStart π, phiLength π).
export function shell(thetaStart, thetaLength, phiStart = 0, phiLength = Math.PI * 2, ws = 12, hs = 6) {
  return cached(`sh:${thetaStart}:${thetaLength}:${phiStart}:${phiLength}:${ws}:${hs}`,
    () => new THREE.SphereGeometry(1, ws, hs, phiStart, phiLength, thetaStart, thetaLength));
}

export function dome(r, seg = 10) {
  return cached(`dm:${r}:${seg}`, () => new THREE.SphereGeometry(r, seg, 6, 0, Math.PI * 2, 0, Math.PI / 2));
}

export function torus(r, tube, arc = Math.PI * 2, rs = 4, ts = 10) {
  return cached(`to:${r}:${tube}:${arc}:${rs}:${ts}`, () => new THREE.TorusGeometry(r, tube, rs, ts, arc));
}

// Cria uma malha já posicionada. opts: { pos, rot (rad), scale, parent }
export function mesh(geometry, color, opts = {}) {
  const m = new THREE.Mesh(geometry, mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  if (opts.pos) m.position.set(...opts.pos);
  if (opts.rot) m.rotation.set(...opts.rot);
  if (opts.scale) {
    if (Array.isArray(opts.scale)) m.scale.set(...opts.scale);
    else m.scale.setScalar(opts.scale);
  }
  if (opts.parent) opts.parent.add(m);
  return m;
}

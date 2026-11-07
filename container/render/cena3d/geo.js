// Peças de geometria da biblioteca 3D (cena3d): materiais neutros, caixas arredondadas, membros
// torneados e elipsoides. Tudo em metros; nada aqui depende do navegador (os testes rodam no Node).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const GRAU = Math.PI / 180;

const cache = new Map();
/** Material fosco de uma cor; o mesmo objeto para a mesma cor e o mesmo brilho. */
export function material(cor, { brilho = 0, emissivo = 0 } = {}) {
  const chave = `${cor}|${brilho}|${emissivo}`;
  if (!cache.has(chave)) {
    const m = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.85 - brilho * 0.6, metalness: 0 });
    if (emissivo) {
      m.emissive = new THREE.Color(cor);
      m.emissiveIntensity = emissivo;
    }
    cache.set(chave, m);
  }
  return cache.get(chave);
}

/** Uma malha que projeta e recebe sombra. */
export function malha(geometria, mat) {
  const m = new THREE.Mesh(geometria, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Caixa de cantos arredondados com a base em y = 0 (como um móvel no chão). */
export function caixa(largura, altura, profundidade, mat, raio = 0.01) {
  const r = Math.max(0.001, Math.min(raio, largura / 2.1, altura / 2.1, profundidade / 2.1));
  const m = malha(new RoundedBoxGeometry(largura, altura, profundidade, 3, r), mat);
  m.position.y = altura / 2;
  return m;
}

/** Caixa centrada (sem levantar a base), para peças dentro de outras. */
export function bloco(largura, altura, profundidade, mat, raio = 0.005) {
  const r = Math.max(0.001, Math.min(raio, largura / 2.1, altura / 2.1, profundidade / 2.1));
  return malha(new RoundedBoxGeometry(largura, altura, profundidade, 2, r), mat);
}

/** Elipsoide de raios rx, ry, rz. */
export function elipsoide(rx, ry, rz, mat, segmentos = 24) {
  const m = malha(new THREE.SphereGeometry(1, segmentos, Math.round(segmentos * 0.75)), mat);
  m.scale.set(rx, ry, rz);
  return m;
}

/** Cilindro de pé com a base em y = 0. */
export function cilindro(raioBaixo, raioCima, altura, mat, segmentos = 28) {
  const m = malha(new THREE.CylinderGeometry(raioCima, raioBaixo, altura, segmentos), mat);
  m.position.y = altura / 2;
  return m;
}

/**
 * Membro torneado que desce da junta (y = 0) até y = -comprimento. O perfil é uma lista de
 * [t, raio] com t de 0 (junta) a 1 (ponta); as pontas fecham em meia esfera, para a junta seguinte
 * encaixar sem fresta. achatar estreita o membro de frente para trás (antebraço, canela).
 */
export function membro(perfil, comprimento, mat, achatar = 1) {
  const pontos = [];
  const r0 = perfil[0][1];
  const r1 = perfil[perfil.length - 1][1];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pontos.push(new THREE.Vector2(Math.sin(a) * r1 + 1e-4, -comprimento - Math.cos(a) * r1 * 0.6));
  }
  for (const [t, r] of [...perfil].reverse()) pontos.push(new THREE.Vector2(r, -t * comprimento));
  for (let i = 6; i >= 0; i--) {
    const a = (i / 6) * (Math.PI / 2);
    pontos.push(new THREE.Vector2(Math.sin(a) * r0 + 1e-4, Math.cos(a) * r0 * 0.6));
  }
  // De baixo para cima: nessa ordem, as faces do torno apontam para fora.
  const m = malha(new THREE.LatheGeometry(pontos, 24), mat);
  m.scale.z = achatar;
  return m;
}

/** Cápsula ao longo de -Y, da junta até o comprimento (falanges, pescoço). */
export function capsula(raio, comprimento, mat) {
  const m = malha(new THREE.CapsuleGeometry(raio, Math.max(0.0001, comprimento - 2 * raio), 4, 10), mat);
  m.position.y = -comprimento / 2;
  return m;
}

/**
 * Segmento do tronco torneado para cima, de y = perfil[0][0] até o último y, com o corte elíptico
 * (profundidade < 1 achata de frente para trás). perfil: [[y, raio], ...] em metros.
 */
export function tronco(perfil, mat, profundidade = 0.7) {
  const pontos = perfil.map(([y, r]) => new THREE.Vector2(r, y));
  const m = malha(new THREE.LatheGeometry(pontos, 32), mat);
  m.scale.z = profundidade;
  return m;
}

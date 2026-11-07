// Esqueleto ÚNICO compartilhado por todos os personagens.
// Convenções (valem para todo o kit):
//  - Unidades em metros. Pés no chão em y = 0. O personagem olha para +Z (para a câmera padrão).
//  - Lado esquerdo do personagem fica em +X (aparece à direita da tela quando ele olha para a câmera).
//  - Rotações em graus nas animações. Eixos:
//      x: membro pendurado (braço/perna) → negativo = para FRENTE; tronco/cabeça → positivo = inclina para FRENTE
//      y: positivo = vira para a ESQUERDA do personagem
//      z: braço esquerdo → positivo abre para o lado; braço direito → negativo abre para o lado

import * as THREE from 'three';

export const JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'armL', 'forearmL', 'handL',
  'armR', 'forearmR', 'handR',
  'legL', 'shinL', 'footL',
  'legR', 'shinR', 'footR',
];

// Chaves extras que uma pose pode ter além das juntas.
export const EXTRA_KEYS = ['hipsPos', 'face'];

// Grupos para máscaras (ex.: tocar "talk" só na cabeça/rosto enquanto o corpo anda).
export const GROUPS = {
  torso: ['hips', 'spine', 'chest', 'hipsPos'],
  head: ['neck', 'head'],
  face: ['face'],
  armL: ['armL', 'forearmL', 'handL'],
  armR: ['armR', 'forearmR', 'handR'],
  arms: ['armL', 'forearmL', 'handL', 'armR', 'forearmR', 'handR'],
  legs: ['legL', 'shinL', 'footL', 'legR', 'shinR', 'footR'],
  legL: ['legL', 'shinL', 'footL'],
  legR: ['legR', 'shinR', 'footR'],
};

// Medidas base de um adulto (metros). Crianças/altos usam escala uniforme do root.
export const DIMS = {
  foot: 0.10,        // altura do tornozelo ao chão
  shin: 0.28,
  thigh: 0.30,
  hipHalf: 0.10,     // distância do centro ao eixo da perna
  spine: 0.07,       // do quadril até o início do abdômen
  abdomen: 0.20,
  chest: 0.30,
  shoulderX: 0.25,
  shoulderDrop: 0.07, // quanto o ombro fica abaixo do topo do peito
  neck: 0.07,
  // Cabeça = elipsoide quase esférico. rx/ry/rz são os raios; cy é a altura do centro (a base fica em y = 0).
  head: { rx: 0.235, ry: 0.225, rz: 0.215, cy: 0.225 },
  upperArm: 0.26,
  forearm: 0.24,
};

// Ponto na superfície da cabeça (coordenadas da junta "head") para colocar rosto e acessórios.
// Devolve a posição (z calculado, mais `lift` ao longo da normal) e o giro (yaw/pitch) para a peça
// ficar deitada na superfície curva.
export function headSurface(x, y, lift = 0) {
  const { rx, ry, rz, cy } = DIMS.head;
  const k = Math.max(0.02, 1 - (x / rx) ** 2 - ((y - cy) / ry) ** 2);
  const z = rz * Math.sqrt(k);
  const gx = x / (rx * rx);
  const gy = (y - cy) / (ry * ry);
  const gz = z / (rz * rz);
  const len = Math.hypot(gx, gy, gz);
  const n = [gx / len, gy / len, gz / len];
  return {
    pos: [x + lift * n[0], y + lift * n[1], z + lift * n[2]],
    yaw: Math.atan2(n[0], n[2]),
    pitch: -Math.asin(n[1]),
  };
}

export const LEG_LENGTH = DIMS.thigh + DIMS.shin;
export const HIP_HEIGHT = LEG_LENGTH + DIMS.foot;

export function buildSkeleton() {
  const root = new THREE.Group();
  root.name = 'root';
  const joints = {};
  const make = (name, parent, x, y, z) => {
    const j = new THREE.Object3D();
    j.name = name;
    j.position.set(x, y, z);
    parent.add(j);
    joints[name] = j;
    return j;
  };

  const hips = make('hips', root, 0, HIP_HEIGHT, 0);
  const spine = make('spine', hips, 0, DIMS.spine, 0);
  const chest = make('chest', spine, 0, DIMS.abdomen, 0);
  const neck = make('neck', chest, 0, DIMS.chest, 0);
  make('head', neck, 0, DIMS.neck, 0);
  // Tronco e cabeça giram primeiro em Y (guinada) e depois inclinam: movimento mais natural.
  for (const n of ['hips', 'spine', 'chest', 'neck', 'head']) joints[n].rotation.order = 'YXZ';

  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const arm = make('arm' + side, chest, sx * DIMS.shoulderX, DIMS.chest - DIMS.shoulderDrop, 0);
    const fore = make('forearm' + side, arm, 0, -DIMS.upperArm, 0);
    make('hand' + side, fore, 0, -DIMS.forearm, 0);

    const leg = make('leg' + side, hips, sx * DIMS.hipHalf, 0, 0);
    const shin = make('shin' + side, leg, 0, -DIMS.thigh, 0);
    make('foot' + side, shin, 0, -DIMS.shin, 0);
  }
  return { root, joints };
}

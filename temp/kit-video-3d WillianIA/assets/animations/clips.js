// Biblioteca de animações prontas. Servem para QUALQUER personagem (mesmo esqueleto).
//
// Cada clip é uma função pura do tempo: pose(ph, t, p) → { junta: [x, y, z] em graus, hipsPos, face }.
//   ph = fase 0..1 do ciclo (loop) ou progresso 0..1 (clip de uma vez só, que então "segura" a pose final)
//   t  = tempo local em segundos     p = parâmetros do clip (já com os valores padrão)
// Poses são ESPARSAS: juntas não citadas ficam no repouso. Convenções de eixo: ver skeleton.js.
// Clips de um lado só são escritos para o lado DIREITO e espelhados automaticamente com params.side = 'L'.

import { DIMS, HIP_HEIGHT } from '../characters/skeleton.js';

const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const R = (x = 0, y = 0, z = 0) => [x, y, z];

// Interpolação suave entre keyframes: pts = [[fase, valor], ...] ordenado por fase (0..1).
export function curve(ph, pts) {
  if (ph <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (ph <= pts[i][0]) {
      const [p0, v0] = pts[i - 1];
      const [p1, v1] = pts[i];
      return v0 + (v1 - v0) * smooth((ph - p0) / (p1 - p0));
    }
  }
  return pts[pts.length - 1][1];
}

// Multiplica todas as rotações por k (usado para "entrar" na pose nos clips de uma vez só).
export function scalePose(pose, k) {
  const out = {};
  for (const [key, v] of Object.entries(pose)) {
    if (key === 'face') out.face = v;
    else out[key] = v.map((n) => n * k);
  }
  return out;
}

export const EXPRESSIONS = {
  neutral: {},
  happy: { smile: 0.8, browRaise: 0.15 },
  laugh: { smile: 1, mouthOpen: 0.7, browRaise: 0.2, eyeOpen: 0.7 },
  sad: { smile: -0.7, browTilt: -1, browRaise: -0.2 },
  angry: { smile: -0.5, browTilt: 1, browRaise: -0.3, eyeOpen: 0.8 },
  surprised: { mouthOpen: 0.9, browRaise: 1, eyeOpen: 1.25 },
  worried: { smile: -0.4, browTilt: -0.8, browRaise: 0.3 },
  thinking: { browRaise: 0.3, browTilt: -0.2, look: [0.7, 0.7] },
  sleepy: { eyeOpen: 0.35, smile: 0.1 },
};

const armsRest = () => ({
  armL: R(0, 0, 4), armR: R(0, 0, -4), forearmL: R(-6), forearmR: R(-6),
});

// Marcha genérica (andar, correr, empurrar): pernas + balanço dos braços + torção do tronco.
// Joelho: dobra no balanço (da saída do pé ao contato do calcanhar, ph 0.75..1.25 para a perna esquerda).
// O expoente 0.5 mantém o joelho dobrado até perto do contato, para o pé não afundar no chão antes da hora.
function kneeFlex(ph, K) {
  const u = ((((ph - 0.75) % 1) + 1) % 1) / 0.5;
  return u < 1 ? K * Math.pow(Math.sin(Math.PI * u), 0.5) : 0;
}

// Onda "quase triangular": a coxa se move com velocidade quase constante durante o apoio, então o pé
// recua em ritmo constante e fica parado no chão enquanto o corpo avança (sem patinar).
const triWave = (p) => Math.asin(0.97 * Math.sin(p)) / Math.asin(0.97);

function gait(ph, { A, K, B, E, twist }) {
  const p = ph * TAU;
  const s = Math.sin(p);
  const lg = triWave(p);
  return {
    legL: R(-A * lg), legR: R(A * lg),
    shinL: R(2 + kneeFlex(ph, K)), shinR: R(2 + kneeFlex(ph + 0.5, K)),
    armL: R(B * s, 0, 4), armR: R(-B * s, 0, -4),
    forearmL: R(-(E + E * Math.max(0, -s))), forearmR: R(-(E + E * Math.max(0, s))),
    hips: R(0, -twist * s, 0), spine: R(0, twist * 0.4 * s, 0), chest: R(0, twist * 0.8 * s, 0),
    head: R(0, -twist * 0.5 * s, 0),
  };
}

const speechMouth = (t) =>
  0.1 + 0.55 * Math.abs(Math.sin(t * TAU * 2.6)) * (0.5 + 0.5 * Math.sin(t * TAU * 0.9 + 1.3));

const ARM_DIRS = {
  forward: [-90, 0, -4],
  forwardUp: [-125, 0, -5],
  up: [-172, 0, -8],
  side: [0, 0, -90],
  down: [-12, 0, -6],
};

export const CLIPS = {
  idle: {
    description: 'Em pé parado, respirando e balançando de leve. Pose padrão quando nada está acontecendo.',
    loop: true, duration: 4, affects: ['torso', 'head', 'arms', 'legs'],
    params: {},
    pose(ph) {
      const b = Math.sin(ph * TAU * 2);
      const sway = Math.sin(ph * TAU);
      return {
        ...armsRest(),
        chest: R(1.2 * b, 1.5 * sway, 0), spine: R(0.6 * b, 0, 0),
        head: R(-0.8 * b, 3 * sway, 0),
        hips: R(0, -1 * sway, 0),
        hipsPos: R(0.006 * sway, 0, 0),
        legL: R(0, 0, 1.5), legR: R(0, 0, -1.5),
      };
    },
  },

  walk: {
    description: 'Andar em linha reta. Mova o personagem à frente na velocidade certa (use walkSpeed) para os pés não "patinarem".',
    loop: true, duration: 1, affects: ['torso', 'head', 'arms', 'legs'],
    params: {},
    pose(ph) { return gait(ph, { A: 24, K: 60, B: 20, E: 12, twist: 5 }); },
  },

  run: {
    description: 'Correr. Mais rápido, braços dobrados, tronco inclinado e pequenos saltos.',
    loop: true, duration: 0.6, affects: ['torso', 'head', 'arms', 'legs'],
    params: {},
    pose(ph) {
      const g = gait(ph, { A: 46, K: 85, B: 40, E: 75, twist: 8 });
      g.spine = [10, g.spine[1], 0];
      g.hipsPos = R(0, 0.09 * Math.pow(Math.sin(ph * TAU), 2), 0);
      return g;
    },
  },

  wave: {
    description: 'Acenar com a mão (cumprimento). Bom para apresentar o personagem ou se despedir.',
    loop: true, duration: 1.2, affects: ['armR', 'head', 'face'], mirrorable: true,
    params: { side: { default: 'R', description: "'R' acena com o braço direito, 'L' com o esquerdo" } },
    pose(ph) {
      const s = Math.sin(ph * TAU * 2);
      return {
        armR: R(-15, 0, -140), forearmR: R(-20, 0, -12 + 28 * s), handR: R(0, 0, 8 * s),
        armL: R(0, 0, 4), forearmL: R(-6),
        head: R(0, 0, -4), chest: R(0, 0, 2),
        face: { smile: 0.8, browRaise: 0.15 },
      };
    },
  },

  point: {
    description: 'Apontar com o braço para mostrar algo. Pose de uma vez só: o braço sobe e fica apontando.',
    loop: false, duration: 0.5, affects: ['armR', 'head'], mirrorable: true,
    params: {
      side: { default: 'R', description: "'R' ou 'L': qual braço aponta" },
      dir: { default: 'forward', description: 'forward | forwardUp | up | side (para fora do corpo) | down' },
    },
    pose(ph, t, p) {
      const a = ARM_DIRS[p.dir] || ARM_DIRS.forward;
      return scalePose({
        armR: R(...a), forearmR: R(0), handR: R(0),
        head: R(p.dir === 'up' ? -10 : p.dir === 'down' ? 12 : 0, p.dir === 'side' ? -18 : 0, 0),
        armL: R(0, 0, 4), forearmL: R(-6),
      }, smooth(clamp01(ph)));
    },
  },

  talk: {
    description: 'Falar gesticulando: mão direita e esquerda acompanham a fala, cabeça mexe, boca abre e fecha. Use enquanto toca a narração.',
    loop: true, duration: 2.4, affects: ['armR', 'armL', 'head', 'face', 'torso'],
    params: {
      mouthOpen: { default: null, description: 'Opcional 0..1: abertura da boca vinda do áudio (lip-sync). Se omitido, usa fala simulada.' },
      energy: { default: 1, description: 'Intensidade dos gestos (0.5 calmo ... 1.5 empolgado)' },
    },
    pose(ph, t, p) {
      const e = p.energy;
      const a = Math.sin(ph * TAU);
      const b = Math.sin(ph * TAU * 2 + 0.8);
      return {
        armR: R(-35 + 14 * a * e, 0, -14 + 6 * b * e), forearmR: R(-60 + 18 * b * e, 0, 0), handR: R(0, 0, 0),
        armL: R(-12 + 6 * b * e, 0, 8), forearmL: R(-30 + 10 * a * e),
        head: R(3 + 4 * b * e, 5 * a * e, 1.5 * a), chest: R(0, 3 * a * e, 0),
        face: {
          mouthOpen: p.mouthOpen ?? speechMouth(t),
          smile: 0.25, browRaise: 0.1 + 0.12 * Math.max(0, b) * e,
        },
      };
    },
  },

  hammer: {
    description: 'Martelar (bater prego, construir). Funciona melhor com o item "hammer" na mão direita.',
    loop: true, duration: 0.9, affects: ['armR', 'armL', 'torso', 'head', 'legs'], mirrorable: true,
    params: { side: { default: 'R', description: "'R' ou 'L': qual braço bate" } },
    pose(ph) {
      return {
        armR: R(curve(ph, [[0, -30], [0.45, -150], [0.6, -155], [0.72, -35], [0.8, -22], [1, -30]]), 0, -6),
        forearmR: R(curve(ph, [[0, -40], [0.45, -85], [0.6, -75], [0.72, -15], [0.8, -25], [1, -40]])),
        armL: R(-25, 0, 10), forearmL: R(-45),
        spine: R(curve(ph, [[0, 10], [0.5, -2], [0.72, 24], [1, 10]]), 0, 0),
        chest: R(curve(ph, [[0, 4], [0.5, -4], [0.72, 12], [1, 4]]), 0, 0),
        head: R(curve(ph, [[0, 10], [0.5, 6], [0.72, 16], [1, 10]]), 0, 0),
        legL: R(-8), legR: R(-4), shinL: R(14), shinR: R(8),
      };
    },
  },

  carry: {
    description: 'Carregar uma caixa/saco com os dois braços à frente. Use walking=1 para andar carregando, 0 para ficar parado.',
    loop: true, duration: 1, affects: ['torso', 'head', 'arms', 'legs'],
    params: { walking: { default: 1, description: '0 = parado carregando, 1 = andando carregando' } },
    pose(ph, t, p) {
      const g = gait(ph, { A: 24 * p.walking, K: 60 * p.walking, B: 0, E: 0, twist: 3 * p.walking });
      return {
        ...g,
        armL: R(-50, 0, -14), armR: R(-50, 0, 14),
        forearmL: R(-78, -10, 0), forearmR: R(-78, 10, 0),
        spine: R(-6, 0, 0), chest: R(-4, 0, 0),
      };
    },
  },

  push: {
    description: 'Empurrar algo pesado à frente (carrinho de mão, parede, porta), inclinado e com passos curtos.',
    loop: true, duration: 1.2, affects: ['torso', 'head', 'arms', 'legs'],
    params: {},
    pose(ph) {
      const g = gait(ph, { A: 18, K: 30, B: 0, E: 0, twist: 2 });
      return {
        ...g,
        armL: R(-82, 0, -6), armR: R(-82, 0, 6), forearmL: R(-8), forearmR: R(-8),
        spine: R(16, 0, 0), chest: R(10, 0, 0), head: R(-12, 0, 0),
      };
    },
  },

  dig: {
    description: 'Cavar com a pá (use o item "shovel"). Abaixa, enfia, levanta.',
    loop: true, duration: 1.6, affects: ['torso', 'head', 'arms', 'legs'],
    params: {},
    pose(ph) {
      const arm = curve(ph, [[0, -50], [0.3, -22], [0.5, -45], [0.8, -98], [1, -50]]);
      const fore = curve(ph, [[0, -30], [0.5, -20], [0.8, -62], [1, -30]]);
      return {
        armL: R(arm, 0, -8), armR: R(arm, 0, 8), forearmL: R(fore), forearmR: R(fore),
        spine: R(curve(ph, [[0, 26], [0.3, 38], [0.5, 30], [0.8, 6], [1, 26]]), 0, 0),
        chest: R(curve(ph, [[0, 10], [0.3, 14], [0.8, 0], [1, 10]]), 0, 0),
        head: R(-14, 0, 0),
        legL: R(-30), legR: R(10), shinL: R(35), shinR: R(25),
      };
    },
  },

  cheer: {
    description: 'Comemorar pulando com os braços para cima (sucesso, "funcionou!", final do vídeo).',
    loop: true, duration: 0.8, affects: ['torso', 'head', 'arms', 'legs', 'face'],
    params: {},
    pose(ph) {
      const s = Math.sin(ph * TAU);
      const jump = Math.abs(Math.sin(ph * TAU * 0.5));
      return {
        armL: R(-165 + 8 * s, 0, 14), armR: R(-165 - 8 * s, 0, -14), forearmL: R(-12), forearmR: R(-12),
        legL: R(-6 * jump), legR: R(6 * jump), shinL: R(8 + 30 * (1 - jump)), shinR: R(8 + 30 * (1 - jump)),
        hipsPos: R(0, 0.14 * jump, 0),
        head: R(-6, 4 * s, 0), chest: R(-4, 0, 0),
        face: { smile: 1, mouthOpen: 0.5, browRaise: 0.3 },
      };
    },
  },

  surprised: {
    description: 'Susto/surpresa: recua o corpo, abre os braços, olhos e boca arregalados. Pose de uma vez só.',
    loop: false, duration: 0.35, affects: ['torso', 'head', 'arms', 'face'],
    params: {},
    pose(ph) {
      const k = smooth(clamp01(ph));
      return {
        ...scalePose({
          armL: R(-30, 0, 28), armR: R(-30, 0, -28), forearmL: R(-45), forearmR: R(-45),
          spine: R(-8, 0, 0), chest: R(-6, 0, 0), head: R(-8, 0, 0),
        }, k),
        face: { ...EXPRESSIONS.surprised },
      };
    },
  },

  think: {
    description: 'Pensar: mão no queixo, cabeça inclinada, olhando para cima. Bom antes de uma explicação ou pergunta.',
    loop: true, duration: 3, affects: ['torso', 'head', 'arms', 'face'],
    params: {},
    pose(ph) {
      const s = Math.sin(ph * TAU);
      return {
        armR: R(-78, 0, -12), forearmR: R(-128, 0, 0), handR: R(0),
        armL: R(-45, 0, -20), forearmL: R(-110, 0, 0),
        head: R(-6 + 2 * s, 10, 7), spine: R(2, 0, 0),
        face: { ...EXPRESSIONS.thinking, browRaise: 0.3 + 0.1 * s },
      };
    },
  },

  look_around: {
    description: 'Olhar ao redor, virando a cabeça e o corpo devagar para os lados.',
    loop: true, duration: 4, affects: ['head', 'torso', 'face'],
    params: {},
    pose(ph) {
      const s = Math.sin(ph * TAU);
      return {
        head: R(1, 38 * s, 0), neck: R(0, 10 * s, 0), chest: R(0, 8 * s, 0), spine: R(0, 3 * s, 0),
        face: { look: [s * 0.9, 0] },
      };
    },
  },

  nod: {
    description: 'Balançar a cabeça dizendo "sim".',
    loop: false, duration: 0.9, affects: ['head', 'face'],
    params: {},
    pose(ph) {
      const env = Math.sin(clamp01(ph) * Math.PI);
      return { head: R(14 * env * Math.sin(ph * TAU * 2), 0, 0), face: { smile: 0.3 } };
    },
  },

  shake_head: {
    description: 'Balançar a cabeça dizendo "não".',
    loop: false, duration: 0.9, affects: ['head', 'face'],
    params: {},
    pose(ph) {
      const env = Math.sin(clamp01(ph) * Math.PI);
      return { head: R(0, 26 * env * Math.sin(ph * TAU * 2.5), 0), face: { smile: -0.2, browTilt: -0.3 } };
    },
  },

  shrug: {
    description: 'Dar de ombros ("não sei" / "talvez"): braços abertos e cabeça inclinada. Pose de uma vez só.',
    loop: false, duration: 0.45, affects: ['arms', 'head', 'torso', 'face'],
    params: {},
    pose(ph) {
      const k = smooth(clamp01(ph));
      return {
        ...scalePose({
          armL: R(-10, 0, 22), armR: R(-10, 0, -22), forearmL: R(-75), forearmR: R(-75),
          head: R(0, 0, 9), chest: R(0, 0, -2),
        }, k),
        face: { smile: -0.3, browTilt: -0.6, browRaise: 0.4 * k },
      };
    },
  },

  crouch: {
    description: 'Agachar para olhar/mexer em algo no chão (inspecionar fundação, fiação, encanamento).',
    loop: false, duration: 0.6, affects: ['torso', 'head', 'arms', 'legs'],
    params: {},
    pose(ph) {
      const k = smooth(clamp01(ph));
      return scalePose({
        legL: R(-70, 0, 8), legR: R(-70, 0, -8), shinL: R(115), shinR: R(115),
        spine: R(18), chest: R(8), head: R(-12),
        armL: R(-55, 0, -4), armR: R(-55, 0, 4), forearmL: R(-30), forearmR: R(-30),
      }, k);
    },
  },

  sit: {
    description: 'Sentar (cadeira, banco, banco do carro). Ajuste seatHeight à altura do assento e arms ao uso.',
    loop: false, duration: 0.5, affects: ['torso', 'head', 'arms', 'legs'], grounded: false,
    params: {
      seatHeight: { default: 0.34, description: 'Altura do assento em metros (unidades do personagem, antes da escala). 0.34 = pés tocam o chão.' },
      arms: { default: 'lap', description: "'lap' (mãos no colo), 'wheel' (mãos no volante, para dirigir) ou 'table' (braços sobre a mesa)" },
    },
    pose(ph, t, p) {
      const k = smooth(clamp01(ph));
      const arms = {
        lap: { armL: R(-25, 0, -6), armR: R(-25, 0, 6), forearmL: R(-70), forearmR: R(-70) },
        wheel: { armL: R(-62, 0, -6), armR: R(-62, 0, 6), forearmL: R(-42), forearmR: R(-42) },
        table: { armL: R(-45, 0, -8), armR: R(-45, 0, 8), forearmL: R(-75), forearmR: R(-75) },
      }[p.arms] || {};
      const sitY = p.seatHeight + 0.045 - HIP_HEIGHT;
      return {
        ...scalePose({
          legL: R(-90, 0, 3), legR: R(-90, 0, -3), shinL: R(90), shinR: R(90),
          ...arms, head: R(p.arms === 'wheel' ? 0 : 4),
        }, k),
        hipsPos: R(0, sitY * k, 0),
      };
    },
  },

  read_clipboard: {
    description: 'Ler/anotar na prancheta (use com engenheiro, que já tem prancheta na mão esquerda).',
    loop: true, duration: 3, affects: ['arms', 'head', 'torso', 'face'],
    params: {},
    pose(ph) {
      const s = Math.sin(ph * TAU * 3);
      return {
        armL: R(-58, 0, -14), forearmL: R(-100),
        armR: R(-50, 0, 16), forearmR: R(-92 + 6 * s), handR: R(0),
        head: R(20, 0, 0), spine: R(4), chest: R(3),
        face: { look: [0, -0.8] },
      };
    },
  },
};

export const CLIP_NAMES = Object.keys(CLIPS);

// ---- calibração automática da velocidade de caminhada (pés não patinam) ----
// Durante o apoio, o tornozelo recua em relação ao quadril na velocidade do deslocamento.
function legReach(p, s) {
  const t = rad(-(p['leg' + s]?.[0] ?? 0));
  const k = rad(p['shin' + s]?.[0] ?? 0);
  const a2 = t - k;
  return {
    y: DIMS.thigh * Math.cos(t) + DIMS.shin * Math.cos(a2) + DIMS.foot,
    z: DIMS.thigh * Math.sin(t) + DIMS.shin * Math.sin(a2),
  };
}

export { legReach };

// Peso do pé ESQUERDO como pé de apoio (1 = esquerdo no chão, 0 = direito). Na marcha, o esquerdo
// apoia enquanto recua (ph 0.25..0.75). A troca acontece quando as duas pernas estão esticadas e
// simétricas, então a altura do quadril não "pula".
const gaitStance = (ph) => clamp01(0.5 - 3 * Math.cos(ph * TAU));
for (const name of ['walk', 'run', 'push', 'carry']) CLIPS[name].stanceWeight = gaitStance;

function calibrate(name, params = {}) {
  const clip = CLIPS[name];
  const N = 720;
  const p = { ...Object.fromEntries(Object.entries(clip.params).map(([k, v]) => [k, v.default])), ...params };
  let sum = 0;
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const ph = (i / N) % 1;
    const pose = clip.pose(ph, ph * clip.duration, p);
    const leg = clip.stanceWeight(ph) >= 0.5 ? 'L' : 'R';
    const z = legReach(pose, leg).z;
    if (prev && prev.leg === leg) sum += -(z - prev.z); // quanto o pé de apoio recua em relação ao quadril
    prev = { leg, z };
  }
  return sum / clip.duration; // metros por ciclo / duração do ciclo
}

for (const name of ['walk', 'run', 'push']) CLIPS[name].metersPerSecond = +calibrate(name).toFixed(3);
// carry anda como walk quando walking=1
CLIPS.carry.metersPerSecond = CLIPS.walk.metersPerSecond;

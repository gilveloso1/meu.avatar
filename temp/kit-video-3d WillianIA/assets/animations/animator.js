// Animador: transforma clips em poses e aplica no personagem.
//
// Uso mais simples (um clip):      playClip(personagem, 'walk', t)
// Uso com roteiro (vários clips):  animate(personagem, camadas, t)   // ver evaluateTimeline
//
// Tudo é função do tempo `t` (segundos) — nenhum relógio interno — então dá para renderizar
// qualquer frame, em qualquer ordem, sem tremer (necessário para gerar vídeo frame a frame).

import * as THREE from 'three';
import { JOINTS, GROUPS, HIP_HEIGHT, DIMS } from '../characters/skeleton.js';
import { applyFaceState, FACE_DEFAULT } from '../characters/makeCharacter.js';
import { CLIPS, EXPRESSIONS, legReach } from './clips.js';

const rad = THREE.MathUtils.degToRad;
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ---------- poses ----------

// Espelha esquerda/direita (troca L↔R e inverte giros em y/z).
export function mirrorPose(pose) {
  const out = {};
  for (const [key, v] of Object.entries(pose)) {
    if (key === 'face') { out.face = { ...v, look: v.look ? [-v.look[0], v.look[1]] : undefined }; if (!v.look) delete out.face.look; continue; }
    if (key === 'hipsPos') { out.hipsPos = [-v[0], v[1], v[2]]; continue; }
    const swapped = key.endsWith('L') ? key.slice(0, -1) + 'R' : key.endsWith('R') ? key.slice(0, -1) + 'L' : key;
    out[swapped] = [v[0], -v[1], -v[2]];
  }
  return out;
}

function expandMask(mask) {
  const keys = new Set();
  for (const m of mask) (GROUPS[m] || [m]).forEach((k) => keys.add(k));
  return keys;
}

function maskPose(pose, mask) {
  if (!mask) return pose;
  const allowed = expandMask(mask);
  const out = {};
  for (const [k, v] of Object.entries(pose)) if (allowed.has(k)) out[k] = v;
  return out;
}

const lerp = (a, b, k) => a + (b - a) * k;
const lerpArr = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));

function blendFace(a = {}, b = {}, k) {
  const A = { ...FACE_DEFAULT, ...a };
  const B = { ...FACE_DEFAULT, ...b };
  return {
    eyeOpen: lerp(A.eyeOpen, B.eyeOpen, k), browRaise: lerp(A.browRaise, B.browRaise, k),
    browTilt: lerp(A.browTilt, B.browTilt, k), smile: lerp(A.smile, B.smile, k),
    mouthOpen: lerp(A.mouthOpen, B.mouthOpen, k), look: lerpArr(A.look, B.look, k),
  };
}

// Mistura a pose `a` (k=0) com a pose `b` (k=1). Juntas ausentes contam como repouso.
export function blendPoses(a, b, k) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (key === 'face') out.face = blendFace(a.face, b.face, k);
    else out[key] = lerpArr(a[key] || [0, 0, 0], b[key] || [0, 0, 0], k);
  }
  return out;
}

// Sobrepõe `over` em `base` com peso w (só as chaves presentes em `over`).
export function overlayPose(base, over, w = 1) {
  if (w <= 0) return base;
  const out = { ...base };
  for (const [key, v] of Object.entries(over)) {
    if (key === 'face') out.face = blendFace(base.face, v, w);
    else out[key] = w >= 1 ? v : lerpArr(base[key] || [0, 0, 0], v, w);
  }
  return out;
}

// ---------- amostragem de um clip ----------

function defaultsOf(clip) {
  return Object.fromEntries(Object.entries(clip.params || {}).map(([k, v]) => [k, v.default]));
}

// Distância que o quadril precisa descer para o pé de apoio tocar o chão (somente plano sagital).
// Com `wL` (peso do pé esquerdo como apoio, vindo do clip) usa o pé de apoio da fase; sem ele, o pé mais baixo.
function groundOffset(pose, wL) {
  const L = legReach(pose, 'L').y;
  const R = legReach(pose, 'R').y;
  const reach = wL === undefined ? Math.max(L, R) : wL * L + (1 - wL) * R;
  return reach - (DIMS.thigh + DIMS.shin + DIMS.foot);
}

// Amostra um clip no tempo local t (segundos). Devolve uma pose esparsa e já "finalizada"
// (pés retos no chão, quadril na altura certa, espelhamento e expressão aplicados).
export function sampleClip(name, t, params = {}) {
  const clip = CLIPS[name];
  if (!clip) throw new Error(`Clip desconhecido: "${name}". Opções: ${Object.keys(CLIPS).join(', ')}`);
  const p = { ...defaultsOf(clip), ...params };
  const ph = clip.loop ? (((t / clip.duration) % 1) + 1) % 1 : clamp01(t / clip.duration);
  let pose = clip.pose(ph, t, p);
  if (p.side === 'L' && clip.mirrorable) pose = mirrorPose(pose);

  const hasLegs = pose.legL || pose.legR || pose.shinL || pose.shinR;
  if (hasLegs) {
    for (const s of ['L', 'R']) {
      if (pose['foot' + s]) continue;
      const lx = pose['leg' + s]?.[0] ?? 0;
      const sx = pose['shin' + s]?.[0] ?? 0;
      pose['foot' + s] = [-(lx + sx), 0, 0]; // pé sempre paralelo ao chão
    }
    if (clip.grounded !== false) {
      const g = groundOffset(pose, clip.stanceWeight?.(ph));
      const hp = pose.hipsPos || [0, 0, 0];
      pose.hipsPos = [hp[0], hp[1] + g, hp[2]];
    }
  }
  if (p.expression) pose.face = { ...(pose.face || {}), ...(EXPRESSIONS[p.expression] || {}) };
  return pose;
}

// Velocidade (m/s no mundo) para mover o personagem enquanto toca walk/run/push/carry, sem patinar.
export function moveSpeed(character, clipName, params = {}) {
  const clip = CLIPS[clipName];
  const base = clip.metersPerSecond;
  if (!base) throw new Error(`O clip "${clipName}" não tem velocidade de deslocamento.`);
  const factor = clipName === 'carry' ? (params.walking ?? 1) : 1;
  return base * (params.speed ?? 1) * factor * character.heightScale;
}

// ---------- aplicar no personagem ----------

export function blinkFactor(t, seed = 0) {
  const period = 3.4;
  const ph = (t + seed * period * 1.7) % period;
  const dur = 0.16;
  return ph < dur ? 1 - Math.sin((ph / dur) * Math.PI) : 1;
}

// Aplica uma pose (de sampleClip/evaluateTimeline) ao personagem. Sempre parte do repouso.
export function applyPose(character, pose, { t = 0, blink = true } = {}) {
  for (const name of JOINTS) {
    const j = character.joints[name];
    const rest = character.rest[name] || [0, 0, 0];
    const r = pose[name] || [0, 0, 0];
    j.rotation.set(rest[0] + rad(r[0]), rest[1] + rad(r[1]), rest[2] + rad(r[2]));
  }
  const hp = pose.hipsPos || [0, 0, 0];
  character.joints.hips.position.set(hp[0], HIP_HEIGHT + hp[1], hp[2]);
  const face = { ...(pose.face || {}) };
  if (blink) face.eyeOpen = (face.eyeOpen ?? 1) * blinkFactor(t, character.seed);
  applyFaceState(character, face);
}

// Atalho: toca UM clip.  opts: { params, speed = 1, mask, expression, blink }
export function playClip(character, name, t, opts = {}) {
  const params = { ...(opts.params || {}), ...(opts.expression ? { expression: opts.expression } : {}) };
  const pose = maskPose(sampleClip(name, t * (opts.speed ?? 1), params), opts.mask);
  applyPose(character, pose, { t, blink: opts.blink });
  return pose;
}

// ---------- linha do tempo ----------
// `camadas` é uma lista de camadas; cada camada é uma lista de segmentos ordenados por início:
//   { clip, start, end?, speed?, params?, fade?, mask?, expression? }
// A camada 0 é o corpo base (se nada estiver ativo, o personagem fica em "idle").
// Camadas seguintes sobrepõem SÓ as juntas/grupos do clip (use `mask` para limitar, ex.: ['head','face']).
// Entre segmentos seguidos da mesma camada há transição suave de `fade` segundos (padrão 0.3).
//
//   animate(boneco, [
//     [ { clip: 'walk', start: 0, end: 3 }, { clip: 'point', start: 3, end: 5, params: { dir: 'up' } } ],
//     [ { clip: 'talk', start: 1, end: 5, mask: ['head', 'face'] } ],
//   ], t);

function segmentPose(seg, t) {
  const speed = seg.speed ?? 1;
  const tt = Math.min(t, seg.end ?? t);
  const params = { ...(seg.params || {}), ...(seg.expression ? { expression: seg.expression } : {}) };
  return maskPose(sampleClip(seg.clip, (tt - seg.start) * speed, params), seg.mask);
}

function evaluateLayer(layer, t) {
  let idx = -1;
  for (let i = 0; i < layer.length; i++) {
    const s = layer[i];
    if (t >= s.start && (s.end === undefined || t < s.end)) idx = i;
  }
  if (idx < 0) return null;
  const seg = layer[idx];
  const fade = seg.fade ?? 0.3;
  let pose = segmentPose(seg, t);
  let weight = 1;
  const prev = layer[idx - 1];
  const age = t - seg.start;
  if (prev && prev.end !== undefined && prev.end >= seg.start - 1e-6 && age < fade) {
    pose = blendPoses(segmentPose(prev, t), pose, smooth(age / fade));
  } else if (!prev && age < fade) {
    weight = smooth(age / fade);
  }
  const next = layer[idx + 1];
  if (seg.end !== undefined && !(next && next.start <= seg.end + 1e-6)) {
    const left = seg.end - t;
    if (left < fade) weight *= smooth(left / fade);
  }
  return { pose, weight };
}

export function evaluateTimeline(character, layers, t) {
  let pose = sampleClip('idle', t);
  layers.forEach((layer, i) => {
    const r = evaluateLayer(layer, t);
    if (!r) return;
    pose = overlayPose(pose, r.pose, i === 0 ? r.weight : r.weight);
  });
  return pose;
}

export function animate(character, layers, t, opts = {}) {
  const pose = evaluateTimeline(character, layers, t);
  applyPose(character, pose, { t, blink: opts.blink });
  return pose;
}

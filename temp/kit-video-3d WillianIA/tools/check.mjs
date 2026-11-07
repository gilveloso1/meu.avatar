// Validação automática do kit (sem navegador). Uso: npm run check
// Confere: todos os presets montam, todos os clips geram poses válidas, pés tocam o chão e os pés de
// apoio não "patinam" ao andar na velocidade calibrada. Sai com código 1 se algo falhar.

import * as THREE from 'three';
import {
  PRESET_NAMES, makePreset, CLIPS, CLIP_NAMES, JOINTS, sampleClip, playClip, animate, moveSpeed,
  SCENERY, SCENERY_IDS, makeScenery, setProgress, updateScenery, rollWheels, sceneryBox,
} from '../assets/index.js';

let failures = 0;
const fail = (msg) => { failures++; console.log('  ✗', msg); };
const ok = (msg) => console.log('  ✓', msg);

// 1) presets
console.log('Personagens');
const chars = {};
for (const name of PRESET_NAMES) {
  try {
    const c = makePreset(name);
    chars[name] = c;
    const missing = JOINTS.filter((j) => !c.joints[j]);
    if (missing.length) fail(`${name}: juntas faltando ${missing.join(', ')}`);
  } catch (e) { fail(`${name}: ${e.message}`); }
}
ok(`${Object.keys(chars).length}/${PRESET_NAMES.length} presets montados com o mesmo esqueleto (${JOINTS.length} juntas)`);

// 2) poses válidas
console.log('Animações');
const valid = new Set([...JOINTS, 'hipsPos', 'face']);
for (const name of CLIP_NAMES) {
  for (let i = 0; i <= 20; i++) {
    const t = (i / 20) * CLIPS[name].duration * 1.5;
    const pose = sampleClip(name, t);
    for (const [k, v] of Object.entries(pose)) {
      if (!valid.has(k)) { fail(`${name}: chave inválida "${k}"`); break; }
      if (k === 'face') { if (Object.values(v).flat().some((n) => n !== undefined && !Number.isFinite(n))) fail(`${name}: face com NaN`); }
      else if (!Array.isArray(v) || v.length !== 3 || v.some((n) => !Number.isFinite(n))) fail(`${name}: valor inválido em ${k}`);
    }
  }
}
ok(`${CLIP_NAMES.length} clips geram poses válidas`);

// 3) pés no chão e patinação
const c = chars.construtor;
const box = new THREE.Box3();
const footInfo = (side) => {
  c.root.updateMatrixWorld(true);
  box.setFromObject(c.joints['foot' + side]);
  return { minY: box.min.y, z: (box.min.z + box.max.z) / 2 };
};

console.log('Apoio dos pés');
for (const name of ['idle', 'walk', 'run', 'push', 'carry', 'dig', 'hammer', 'crouch']) {
  const clip = CLIPS[name];
  const dur = clip.loop ? clip.duration : clip.duration + 0.5;
  let worstLow = 0;
  let worstAir = 0;
  const N = 120;
  for (let i = 0; i < N; i++) {
    playClip(c, name, (i / N) * dur * (clip.loop ? 1 : 1) + (clip.loop ? 0 : 0), { blink: false });
    const low = Math.min(footInfo('L').minY, footInfo('R').minY);
    worstLow = Math.min(worstLow, low);
    worstAir = Math.max(worstAir, low);
  }
  const flight = name === 'run';
  if (worstLow < -0.03) fail(`${name}: pé afunda ${worstLow.toFixed(3)} m no chão`);
  else if (!flight && worstAir > 0.03) fail(`${name}: pé flutua ${worstAir.toFixed(3)} m acima do chão`);
  else ok(`${name}: pés ok (afunda ${(-worstLow * 100).toFixed(1)} cm, flutua até ${(worstAir * 100).toFixed(1)} cm)`);
}

console.log('Patinação ao andar');
for (const name of ['walk', 'push', 'carry']) {
  const v = moveSpeed(c, name);
  const clip = CLIPS[name];
  const dt = clip.duration / 240;
  // Durante a fase de apoio de cada pé (meio do apoio, sem as trocas de passo), ele deve ficar parado no mundo.
  let prev = { L: null, R: null };
  let slide = 0;
  let n = 0;
  for (let i = 0; i < 480; i++) {
    const t = i * dt;
    playClip(c, name, t, { blink: false });
    c.root.position.z = v * t;
    const ph = (((t / clip.duration) % 1) + 1) % 1;
    const wL = clip.stanceWeight(ph);
    for (const side of ['L', 'R']) {
      const f = footInfo(side);
      const planted = (side === 'L' ? wL : 1 - wL) >= 0.999;
      if (planted && prev[side] !== null) { slide += Math.abs(f.z - prev[side]) / dt; n++; }
      prev[side] = planted ? f.z : null;
    }
  }
  c.root.position.z = 0;
  const avg = slide / Math.max(1, n);
  (avg > 0.2 ? fail : ok)(`${name}: velocidade ${v.toFixed(2)} m/s, deslizamento médio dos pés em contato ${avg.toFixed(2)} m/s`);
}

// 4) linha do tempo
console.log('Linha do tempo');
try {
  const layers = [
    [{ clip: 'walk', start: 0, end: 3 }, { clip: 'point', start: 3, end: 5, params: { dir: 'up' } }],
    [{ clip: 'talk', start: 1, end: 5, mask: ['head', 'face'] }],
  ];
  for (let t = 0; t <= 6; t += 0.1) animate(c, layers, t);
  ok('camadas, transições e máscaras avaliam sem erro');
} catch (e) { fail(`linha do tempo: ${e.message}`); }

// 5) cenário
console.log('Cenário');
let sceneryCount = 0;
let variantCount = 0;
for (const id of SCENERY_IDS) {
  const def = SCENERY[id];
  for (const v of [undefined, ...Object.keys(def.variants || {})]) {
    try {
      const obj = makeScenery(id, v ? { variant: v } : {});
      const b = sceneryBox(obj);
      const s = b.getSize(new THREE.Vector3());
      if (![s.x, s.y, s.z, b.min.y].every(Number.isFinite) || s.length() === 0) fail(`${id}${v ? `/${v}` : ''}: tamanho inválido`);
      else if (b.min.y < -0.35) fail(`${id}${v ? `/${v}` : ''}: afunda ${b.min.y.toFixed(2)} m abaixo do chão`);
      if (obj.userData.setProgress) for (const t of [0, 0.5, 1]) setProgress(obj, t);
      updateScenery(obj, 1.5);
      rollWheels(obj, 2);
      v ? variantCount++ : sceneryCount++;
    } catch (e) { fail(`${id}${v ? `/${v}` : ''}: ${e.message}`); }
  }
}
ok(`${sceneryCount} assets de cenário + ${variantCount} variantes montam (tamanho válido, sem afundar no chão, etapas e rodas funcionam)`);

// 6) pack: arquivos essenciais, catálogo atualizado e projeto de exemplo válido
console.log('Pack');
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const essenciais = [
    'AGENTE.md', 'PROMPT.md', 'CLAUDE.md', 'AGENTS.md', 'README.md', '.env.example', 'catalog/RESUMO.md', 'catalog/CATALOG.md',
    'docs/storyboard.md', 'docs/processos.md', 'engine/fluxos.js', 'docs/roteiro-viral.md', 'docs/voz.md', 'docs/postagem.md', 'engine/player.js', 'engine/player.html',
    'tools/render.mjs', 'tools/validar.mjs', 'tools/voz.mjs', 'tools/voz/py/kokoro_tts.py', 'tools/voz/py/alinhar.py',
    'templates/canal.exemplo.json', 'templates/storyboard.minimo.json', 'projects/exemplo-casa/storyboard.json', 'projects/exemplo-asfalto/storyboard.json',
  ];
  const faltam = essenciais.filter((f) => !fs.existsSync(path.join(raiz, f)));
  if (faltam.length) fail(`arquivos faltando: ${faltam.join(', ')}`); else ok(`${essenciais.length} arquivos essenciais presentes`);

  const resumo = fs.readFileSync(path.join(raiz, 'catalog/RESUMO.md'), 'utf8');
  const semCatalogo = [...PRESET_NAMES, ...SCENERY_IDS].filter((id) => !resumo.includes(`\`${id}\``));
  if (semCatalogo.length) fail(`catalog/RESUMO.md desatualizado (rode npm run catalog): faltam ${semCatalogo.join(', ')}`);
  else ok('catalog/RESUMO.md lista todos os personagens e assets');

  const exemplos = fs.readdirSync(path.join(raiz, 'projects'), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_') && fs.existsSync(path.join(raiz, 'projects', d.name, 'storyboard.json')));
  for (const d of exemplos) {
    const r = spawnSync(process.execPath, [path.join(raiz, 'tools/validar.mjs'), `projects/${d.name}`, '--sem-audio', '--json'], { encoding: 'utf8', cwd: raiz });
    let res; try { res = JSON.parse(r.stdout); } catch { res = { ok: false, erros: [r.stderr || r.stdout] }; }
    if (!res.ok) fail(`projects/${d.name}: ${res.erros.join(' | ')}`); else ok(`projects/${d.name}: storyboard válido`);
  }
}

console.log(failures ? `\n${failures} problema(s) encontrado(s).` : '\nTudo certo.');
process.exit(failures ? 1 : 0);

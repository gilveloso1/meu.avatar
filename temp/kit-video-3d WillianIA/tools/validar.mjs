// Valida o storyboard de um projeto ANTES de renderizar: nomes de assets, tempos, câmera, ritmo e gancho.
//   node tools/validar.mjs projects/<nome>          (erros bloqueiam; avisos são sugestões de qualidade)
//   opções: --json (saída para máquina), --sem-audio (não exige o arquivo de áudio ainda)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCENERY, makeScenery, PRESETS, CLIPS, EXPRESSIONS, GROUPS, JOINTS, SKIES } from '../assets/index.js';
import { MATERIAIS } from '../engine/fluxos.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const projeto = args.find((a) => !a.startsWith('--'));
if (!projeto) { console.error('Uso: node tools/validar.mjs projects/<nome> [--json] [--sem-audio]'); process.exit(1); }
const pasta = path.join(raiz, projeto);
const erros = [];
const avisos = [];
const E = (m) => erros.push(m);
const A = (m) => avisos.push(m);

const sbArq = path.join(pasta, 'storyboard.json');
if (!fs.existsSync(sbArq)) { console.error(`Não achei ${projeto}/storyboard.json`); process.exit(1); }
let sb;
try { sb = JSON.parse(fs.readFileSync(sbArq, 'utf8')); } catch (e) { console.error(`storyboard.json não é um JSON válido: ${e.message}`); process.exit(1); }

const num = (x) => typeof x === 'number' && Number.isFinite(x);
const vec = (v, n) => Array.isArray(v) && n.includes(v.length) && v.every(num);
const TOL = 0.06;

// ---- geral ----
if (sb.versao !== 1) E('"versao" deve ser 1.');
if (!sb.titulo) A('Falta "titulo".');
const f = sb.formato || {};
if (!num(f.largura) || !num(f.altura) || !num(f.fps)) E('"formato" precisa de largura, altura e fps (ex.: 1080, 1920, 30).');
else if (f.largura > f.altura) A('O formato está na horizontal; Shorts/Reels/TikTok são verticais (1080×1920).');
if (!num(sb.duracao) || sb.duracao <= 0) E('"duracao" deve ser um número de segundos > 0.');
else if (sb.duracao > 180) A(`Duração de ${sb.duracao}s: Shorts vão até 3 min, e vídeos longos perdem retenção.`);

// ---- áudio e palavras ----
let palavras = [];
if (sb.audio) {
  const arq = path.join(pasta, sb.audio);
  if (!fs.existsSync(arq)) (args.includes('--sem-audio') ? A : E)(`Áudio "${sb.audio}" não existe. Gere com: node tools/voz.mjs gerar ${projeto}`);
  else {
    const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', arq], { encoding: 'utf8' });
    const d = parseFloat(r.stdout);
    if (Number.isFinite(d) && num(sb.duracao)) {
      if (sb.duracao < d - 0.05) E(`A duração do storyboard (${sb.duracao}s) é menor que o áudio (${d.toFixed(2)}s): a narração seria cortada.`);
      else if (sb.duracao > d + 2.5) A(`O storyboard dura ${sb.duracao}s mas o áudio só ${d.toFixed(2)}s: sobram ${(sb.duracao - d).toFixed(1)}s de vídeo mudo no final.`);
    }
  }
} else A('Sem "audio": o vídeo sairá mudo.');
if (sb.palavras) {
  const arq = path.join(pasta, sb.palavras);
  if (!fs.existsSync(arq)) (args.includes('--sem-audio') ? A : E)(`"${sb.palavras}" não existe.`);
  else {
    try { palavras = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { E(`"${sb.palavras}" não é um JSON válido.`); }
    if (palavras.length && num(sb.duracao) && palavras[palavras.length - 1].fim > sb.duracao + TOL) E('A última palavra termina depois do fim do vídeo.');
    if (palavras.length && palavras[0].inicio > 1.2) A(`A narração só começa em ${palavras[0].inicio}s: o gancho precisa abrir nos primeiros 1–2 s.`);
  }
} else A('Sem "palavras": o vídeo não terá legendas.');

// ---- cenas ----
const cenas = Array.isArray(sb.cenas) ? sb.cenas : [];
if (!cenas.length) E('Não há "cenas".');
const progressAssets = {};
const temEtapa = (asset) => {
  if (!(asset in progressAssets)) {
    try { progressAssets[asset] = !!makeScenery(asset).userData.setProgress; } catch { progressAssets[asset] = false; }
  }
  return progressAssets[asset];
};
const temUpdate = (asset) => {
  const k = `u:${asset}`;
  if (!(k in progressAssets)) {
    try { progressAssets[k] = !!makeScenery(asset).userData.update; } catch { progressAssets[k] = false; }
  }
  return progressAssets[k];
};
const FUNDOS = ['campo', 'colinas', 'cidade', 'floresta', 'deserto', 'litoral', 'industrial', 'interior'];
const CHAOS = ['grama', 'terra', 'areia', 'concreto', 'asfalto', 'madeira', 'piso'];
const scores = [];
const checaAmbiente = (amb, rot) => {
  if (!amb) return;
  if (amb.fundo !== undefined && !FUNDOS.includes(amb.fundo)) E(`${rot}: "fundo" inválido "${amb.fundo}". Todo vídeo precisa de um cenário de fora ou de uma sala (${FUNDOS.join(', ')}); nunca cor sólida ou "nenhum".`);
  if (amb.chao !== undefined && !CHAOS.includes(amb.chao)) E(`${rot}: "chao" inválido "${amb.chao}" (${CHAOS.join(', ')}); não existe chão vazio.`);
};
checaAmbiente(sb.ambiente, 'ambiente do vídeo');
const MOV = new Set(['walk', 'run', 'push', 'carry']);
const PLANOS = ['geral', 'medio', 'close', 'topo'];
const ESTILOS = ['titulo', 'destaque', 'pergunta', 'rodape'];
const maskOk = new Set([...Object.keys(GROUPS), ...JOINTS]);
const ICONES = ['x', 'v', 'alerta', 'interrogacao', 'exclamacao', 'coracao', 'estrela', 'lampada', 'relogio', 'dinheiro', 'fogo', 'proibido', 'raio'];
const DIRS = ['direita', 'esquerda', 'cima', 'baixo', 'horizontal', 'vertical'];
const EFEITOS = ['pretoebranco', 'zoom', 'tremor'];
let nTitulos = 0;
let nElementos = 0;
let nEfeitos = 0;

cenas.forEach((c, i) => {
  const P = `Cena ${i + 1} (${c.inicio}–${c.fim}s)`;
  if (!num(c.inicio) || !num(c.fim) || c.fim <= c.inicio) { E(`${P}: "inicio" e "fim" inválidos.`); return; }
  if (i === 0 && Math.abs(c.inicio) > TOL) E(`${P}: a primeira cena deve começar em 0.`);
  if (i > 0 && Math.abs(c.inicio - cenas[i - 1].fim) > TOL) E(`${P}: não encaixa com a cena anterior (termina em ${cenas[i - 1].fim}s). As cenas não podem ter buracos nem sobreposição.`);
  if (i === cenas.length - 1 && num(sb.duracao) && Math.abs(c.fim - sb.duracao) > TOL) E(`${P}: a última cena deve terminar em ${sb.duracao}s (a duração do vídeo).`);
  const dur = c.fim - c.inicio;
  if (dur > 7.5) A(`${P}: ${dur.toFixed(1)}s é longa; troque ângulo/cena a cada 3–6 s para manter a atenção.`);
  if (dur < 1.0) A(`${P}: ${dur.toFixed(1)}s é muito curta para ser percebida.`);
  const dentro = (de, ate, rot) => {
    if (!num(de) || !num(ate) || ate <= de) { E(`${P}: ${rot} com "de"/"ate" inválidos.`); return false; }
    if (de < c.inicio - TOL || ate > c.fim + TOL) A(`${P}: ${rot} (${de}–${ate}s) sai do intervalo da cena.`);
    return true;
  };

  const ids = new Set();
  const addId = (id, rot) => { if (!id) E(`${P}: ${rot} sem "id".`); else if (ids.has(id)) E(`${P}: id repetido "${id}".`); else ids.add(id); };
  const nObjs = (c.objetos || []).length;
  if (nObjs > 30) A(`${P}: ${nObjs} objetos; muitos objetos deixam o render lento.`);

  for (const o of c.objetos || []) {
    addId(o.id, 'objeto');
    const def = SCENERY[o.asset];
    if (!def) { E(`${P}: asset "${o.asset}" não existe no catálogo (veja catalog/CATALOG.md).`); continue; }
    if (o.variante && !def.variants?.[o.variante]) E(`${P}: "${o.asset}" não tem a variante "${o.variante}" (opções: ${Object.keys(def.variants || {}).join(', ') || 'nenhuma'}).`);
    for (const k of Object.keys(o.params || {})) if (!(k in (def.params || {}))) E(`${P}: parâmetro "${k}" não existe em "${o.asset}" (opções: ${Object.keys(def.params || {}).join(', ') || 'nenhum'}).`);
    if (o.pos && !vec(o.pos, [2, 3])) E(`${P}: "pos" de "${o.id}" deve ser [x, z] ou [x, y, z].`);
    if (o.etapa) {
      if (!temEtapa(o.asset)) E(`${P}: "${o.asset}" não tem etapas ("etapa" só funciona em casa_obra, predio_estrutura, rua_camadas, corte_terreno, guindaste, caminhao_cacamba).`);
      else if (!Array.isArray(o.etapa) || o.etapa.some((k) => !vec(k, [2]))) E(`${P}: "etapa" de "${o.id}" deve ser [[tempo, 0..1], ...].`);
    }
    if (o.movimentos) for (const m of o.movimentos) { if (!vec(m.para, [2]) || !dentro(m.de, m.ate, `movimento de "${o.id}"`)) E(`${P}: movimento de "${o.id}" inválido (precisa de de, ate e para:[x,z]).`); }
  }

  for (const p of c.personagens || []) {
    addId(p.id, 'personagem');
    if (!PRESETS[p.preset]) { E(`${P}: personagem "${p.preset}" não existe (opções: ${Object.keys(PRESETS).join(', ')}).`); continue; }
    if (p.pos && !vec(p.pos, [2, 3])) E(`${P}: "pos" de "${p.id}" deve ser [x, z] ou [x, y, z].`);
    for (const a of p.acoes || []) {
      const clip = CLIPS[a.clip];
      if (!clip) { E(`${P}: animação "${a.clip}" não existe (opções: ${Object.keys(CLIPS).join(', ')}).`); continue; }
      dentro(a.de, a.ate, `animação "${a.clip}" de "${p.id}"`);
      for (const k of Object.keys(a.params || {})) if (!(k in (clip.params || {}))) E(`${P}: parâmetro "${k}" não existe na animação "${a.clip}" (opções: ${Object.keys(clip.params || {}).join(', ') || 'nenhum'}).`);
      if (a.expressao && !(a.expressao in EXPRESSIONS)) E(`${P}: expressão "${a.expressao}" não existe (opções: ${Object.keys(EXPRESSIONS).join(', ')}).`);
      for (const m of a.mascara || []) if (!maskOk.has(m)) E(`${P}: máscara "${m}" inválida (grupos: ${Object.keys(GROUPS).join(', ')}).`);
      if (a.camada !== undefined && !(Number.isInteger(a.camada) && a.camada >= 0)) E(`${P}: "camada" deve ser inteiro ≥ 0.`);
    }
    for (const m of p.movimentos || []) {
      if (!vec(m.para, [2]) || !dentro(m.de, m.ate, `movimento de "${p.id}"`)) { E(`${P}: movimento de "${p.id}" inválido (precisa de de, ate e para:[x,z]).`); continue; }
      if (m.clip && !MOV.has(m.clip)) E(`${P}: movimento com clip "${m.clip}": só ${[...MOV].join(', ')} deslocam o personagem.`);
    }
    if (p.fala !== undefined) A(`${P}: "fala" vai dentro de uma ação (ex.: { "clip": "talk", "fala": true }), não no personagem.`);
  }

  for (const p of [...(c.personagens || []), ...(c.objetos || [])]) {
    for (const v of p.viraPara || []) {
      const ok = v.alvo === 'camera' || typeof v.alvo === 'number' || vec(v.alvo, [2]) || ids.has(v.alvo);
      if (!ok || !num(v.em)) E(`${P}: "viraPara" de "${p.id}" inválido (alvo: "camera", id, [x,z] ou ângulo em graus; precisa de "em").`);
    }
  }

  checaAmbiente(c.ambiente, P);
  for (const o of c.objetos || []) {
    if (o.opacidade !== undefined && !(num(o.opacidade) && o.opacidade >= 0 && o.opacidade <= 1)) E(`${P}: "opacidade" de "${o.id}" deve ser 0 a 1.`);
    if (o.anim) for (const k of Object.keys(o.anim)) if (!['pos', 'giro', 'gira', 'eixo', 'escala', 'pulsa', 'oscila', 'suave'].includes(k)) E(`${P}: anim de "${o.id}" tem campo desconhecido "${k}" (pos, giro, gira, eixo, escala, pulsa, oscila).`);
  }
  for (const f of c.fluxos || []) {
    if (!MATERIAIS[f.material]) E(`${P}: fluxo com material "${f.material}" inexistente (${Object.keys(MATERIAIS).join(', ')}).`);
    if (!f.origem && !f.caminho) E(`${P}: fluxo precisa de "origem" ([x,y,z] ou {ancora,desloca}) ou "caminho" (lista de pontos).`);
    if (f.caminho && !(Array.isArray(f.caminho) && f.caminho.length >= 2 && f.caminho.every((q) => vec(q, [3])))) E(`${P}: "caminho" do fluxo deve ser uma lista de pontos [x,y,z] (mínimo 2).`);
    for (const pt of [f.origem, f.destino]) {
      if (pt && !Array.isArray(pt) && !ids.has(pt.ancora)) E(`${P}: fluxo com ancora "${pt.ancora}" que não existe na cena.`);
      if (pt && Array.isArray(pt) && !vec(pt, [3])) E(`${P}: ponto de fluxo deve ser [x,y,z].`);
    }
    if (f.de !== undefined || f.ate !== undefined) dentro(f.de ?? c.inicio, f.ate ?? c.fim, `fluxo de ${f.material}`);
  }
  for (const r of c.rastros || []) {
    if (!ids.has(r.seguir)) E(`${P}: rastro seguindo "${r.seguir}" que não existe na cena.`);
    else {
      const alvo = [...(c.objetos || []), ...(c.personagens || [])].find((x) => x.id === r.seguir);
      if (!(alvo.movimentos || []).length) E(`${P}: rastro precisa que "${r.seguir}" tenha "movimentos" (é a faixa deixada atrás dele).`);
    }
  }

  // densidade de animação: quantos TIPOS de animação a cena tem além de câmera e fala
  {
    const kinds = new Set();
    const objs = c.objetos || [];
    const chars = c.personagens || [];
    if (objs.some((o) => (o.movimentos || []).length) || chars.some((p) => (p.movimentos || []).length)) kinds.add('movimento');
    if ((c.fluxos || []).length || (c.rastros || []).length) kinds.add('fluxo');
    if (objs.some((o) => (o.etapa && o.etapa.some((k) => k[1] !== o.etapa[0][1])) || o.aparece !== undefined || o.some !== undefined || o.anim)) kinds.add('transformação');
    if (objs.some((o) => SCENERY[o.asset] && temUpdate(o.asset))) kinds.add('máquina');
    if (chars.some((p) => (p.acoes || []).some((a) => !['talk', 'idle', 'look_around'].includes(a.clip)))) kinds.add('ação');
    const fala = chars.some((p) => (p.acoes || []).some((a) => a.clip === 'talk'));
    const camDin = !!(c.camera && (c.camera.deriva || (c.camera.aproxima && c.camera.aproxima !== 1) || c.camera.tipo === 'travelling'));
    scores.push({ i: i + 1, dur, score: kinds.size + (fala ? 0.5 : 0) + (camDin ? 0.5 : 0), kinds: [...kinds], chars: chars.length, ultima: i === cenas.length - 1, primeira: i === 0 });
  }

  const cam = c.camera;
  if (!cam) A(`${P}: sem câmera (usará um enquadramento padrão do primeiro item).`);
  else if (!['fixa', 'travelling', 'enquadrar'].includes(cam.tipo)) E(`${P}: câmera "tipo" deve ser fixa, travelling ou enquadrar.`);
  else if (cam.tipo === 'enquadrar') {
    if (!ids.has(cam.alvo)) E(`${P}: câmera enquadrar com alvo "${cam.alvo}" que não existe na cena.`);
    if (cam.plano && !PLANOS.includes(cam.plano)) E(`${P}: plano "${cam.plano}" inválido (${PLANOS.join(', ')}).`);
  } else if (cam.tipo === 'fixa') {
    if (!vec(cam.pos, [3])) E(`${P}: câmera fixa precisa de "pos": [x, y, z].`);
    if (!(vec(cam.olha, [2, 3]) || ids.has(cam.olha))) E(`${P}: câmera fixa precisa de "olha" ([x,y,z] ou id).`);
  } else if (cam.tipo === 'travelling') {
    for (const k of ['de', 'para']) if (!cam[k] || !vec(cam[k].pos, [3]) || !(vec(cam[k].olha, [2, 3]) || ids.has(cam[k].olha))) E(`${P}: travelling precisa de de/para com "pos" e "olha".`);
  }

  for (const t of c.textos || []) {
    if (!t.texto) E(`${P}: texto vazio.`);
    if (t.estilo && !ESTILOS.includes(t.estilo)) E(`${P}: estilo de texto "${t.estilo}" inválido (${ESTILOS.join(', ')}).`);
    if (t.texto && t.texto.length > 34 && t.estilo !== 'pergunta') A(`${P}: texto "${t.texto.slice(0, 20)}…" tem ${t.texto.length} caracteres; use no máximo ~30 para ler de relance.`);
    dentro(t.de ?? c.inicio, t.ate ?? c.fim, 'texto');
  }
  nTitulos += (c.textos || []).filter((t) => t.estilo === 'titulo' || t.estilo === 'destaque' || !t.estilo).length;

  for (const el of c.elementos || []) {
    nElementos++;
    if (!['seta', 'icone', 'etiqueta'].includes(el.tipo)) { E(`${P}: elemento com "tipo" inválido (seta, icone ou etiqueta).`); continue; }
    if (el.tipo === 'seta' && el.direcao && !DIRS.includes(el.direcao)) E(`${P}: seta com direcao "${el.direcao}" inválida (${DIRS.join(', ')}).`);
    if (el.tipo === 'icone' && !ICONES.includes(el.icone)) E(`${P}: ícone "${el.icone}" não existe (${ICONES.join(', ')}).`);
    if (el.tipo === 'etiqueta' && !el.texto) E(`${P}: etiqueta sem "texto".`);
    if (el.ancora) {
      if (!ids.has(el.ancora)) E(`${P}: elemento com ancora "${el.ancora}" que não existe na cena.`);
    } else if (!(vec(el.pos, [2]) && el.pos.every((v) => v >= 0 && v <= 1))) E(`${P}: elemento sem "ancora" precisa de "pos": [x, y] entre 0 e 1 (fração da tela).`);
    if (el.de !== undefined || el.ate !== undefined) dentro(el.de ?? c.inicio, el.ate ?? c.fim, `elemento ${el.tipo}`);
  }
  for (const f of c.efeitos || []) {
    nEfeitos++;
    if (!EFEITOS.includes(f.tipo)) E(`${P}: efeito "${f.tipo}" inválido (${EFEITOS.join(', ')}).`);
    dentro(f.de, f.ate, `efeito ${f.tipo}`);
  }
  if (c.transicao && !['corte', 'flash', 'fade'].includes(c.transicao)) E(`${P}: transicao deve ser corte, flash ou fade.`);
  if (c.ambiente?.horario && !(c.ambiente.horario in SKIES)) E(`${P}: horario inválido (${Object.keys(SKIES).join(', ')}).`);
});

// ---- animação: nenhuma cena pode ser só "objeto parado + câmera girando + boneco falando" ----
if (scores.length) {
  const fracas = scores.filter((s) => !s.primeira && !s.ultima && s.score < 2);
  for (const s of fracas) {
    const msg = `Cena ${s.i}: pouca animação (${s.kinds.join(', ') || 'só câmera/fala'}). Mostre o PROCESSO: adicione um destes — fluxo de material (pedra, água, fumaça...), movimento de objeto, etapa/aparece/anim, máquina animada ou ação do personagem (docs/processos.md).`;
    if (s.score < 1.5 && s.dur > 2.5) E(msg); else A(msg);
  }
  const media = scores.reduce((a, s) => a + s.score, 0) / scores.length;
  if (media < 2.5) E(`Densidade de animação baixa (média ${media.toFixed(1)} por cena; mínimo 2.5). O vídeo precisa ser animado ao máximo: cada cena com pelo menos 2 tipos de animação (fluxo, movimento, transformação, máquina, ação).`);
  const semPersonagem = scores.filter((s) => !s.chars).length;
  if (semPersonagem > scores.length * 0.5) A(`${semPersonagem} de ${scores.length} cenas sem personagens: personagens dão vida e retenção; ponha ao menos 1 em mais da metade das cenas.`);
}

// ---- retenção ----
if (num(sb.duracao)) {
  const maxTitulos = Math.max(3, Math.round(sb.duracao / 15));
  if (nTitulos > maxTitulos) A(`${nTitulos} títulos/destaques na tela: demais. Use poucos (no máximo ~${maxTitulos}): o gancho, uma ideia-chave e a pergunta final. A legenda já mostra o que é falado.`);
  if (nElementos + nEfeitos > Math.max(3, Math.round(sb.duracao / 8))) A(`${nElementos} elementos e ${nEfeitos} efeitos: use setas, ícones e efeitos só onde o vídeo realmente exigir (contraste certo/errado, direção, dado importante), senão poluem.`);
}
if (cenas.length && num(sb.duracao)) {
  const media = sb.duracao / cenas.length;
  if (media > 5.5) A(`Ritmo lento: ${media.toFixed(1)}s por cena em média. Mire em 3–5 s por cena.`);
  const primeira = cenas[0];
  if (!(primeira.textos || []).some((t) => (t.de ?? primeira.inicio) < 3)) A('Gancho: a primeira cena não tem texto na tela nos primeiros 3 s (título/pergunta que prende).');
  const ultima = cenas[cenas.length - 1];
  if (!(ultima.textos || []).some((t) => /\?/.test(t.texto))) A('Final: a última cena não tem a pergunta para comentar na tela (texto com "?").');
  let seguidas = 0;
  for (let i = 1; i < cenas.length; i++) {
    const a = cenas[i - 1].camera;
    const b = cenas[i].camera;
    const chave = (c) => JSON.stringify([c.tipo, c.alvo, c.plano, c.angulo, c.pos, c.olha, c.de?.pos, c.para?.pos]);
    if (a && b && chave(a) === chave(b)) seguidas++;
  }
  if (seguidas >= 2) A(`${seguidas} cortes seguidos com a mesma câmera: varie ângulo, plano ou alvo para o corte "renovar" a atenção.`);
}

if (args.includes('--json')) console.log(JSON.stringify({ ok: !erros.length, erros, avisos }, null, 2));
else {
  console.log(`Validação de ${projeto}: ${cenas.length} cenas, ${sb.duracao ?? '?'}s`);
  for (const e of erros) console.log(`  ✗ ${e}`);
  for (const a of avisos) console.log(`  ! ${a}`);
  console.log(erros.length ? `\n${erros.length} erro(s): corrija antes de renderizar.` : `\nSem erros${avisos.length ? ` (${avisos.length} aviso(s) de qualidade)` : ''}.`);
}
process.exit(erros.length ? 1 : 0);

/**
 * O que o canvas significa, tirado só da posição dos blocos e das linhas.
 * Os dois protótipos (código próprio e tldraw) usam estas mesmas funções.
 *
 * Projeto: { blocks, finals, edges }
 *   bloco: { id, kind: "video" | "image" | "audio", name, src, dur, tin, tout,
 *            x, y, mute, vol, tone, audio, speed, frame }   (dur: duração do
 *            arquivo; tin/tout: o corte; tone: 1 a TONES, o tom da cor do tipo;
 *            audio, só no vídeo: "linked" (o som dele numa faixa presa embaixo,
 *            na cor do vídeo), "unlinked" (desvinculado: virou um bloco de áudio)
 *            ou "none" (o arquivo não tem som); speed: a velocidade, 1 se não
 *            houver; frame: o enquadramento, ver placement())
 *   final: { id, x, y, resolution, format, speed }   (o que ele exporta; ver output())
 *   linha: { id, from, to }      (from: um bloco do grupo de saída;
 *                                 to: um bloco do grupo de entrada ou um final)
 *
 * Regras (geometria, em unidades do canvas):
 *   - a largura é a duração (PX por segundo);
 *   - blocos de imagem ou vídeo na mesma linha, encostados, formam uma
 *     sequência (um grupo);
 *   - um bloco de imagem ou vídeo encostado em cima de um grupo cobre a imagem
 *     dele naquele trecho (b-roll); o x diz o momento;
 *   - um bloco de áudio encostado embaixo de um grupo soma o som dele (o vídeo
 *     com áudio vinculado é mais alto: a faixa do som dele faz parte do bloco);
 *   - linhas ligam grupos; cada caminho até um bloco final é uma versão.
 */

export const PX = 40;
export const VIS_H = 96;
export const AUD_H = 40;
// Faixa do áudio vinculado, embaixo da imagem do vídeo.
export const LINK_H = 40;
export const MAX_FAIXAS = 8;
/** Menos que isso é arredondamento, não buraco (um quadro a 30 fps). */
const GAP_MIN = 0.034;
// Organizar: a área do grupo (20 px em volta) e a aba dele (40 px) cabem nas folgas; o Final, na dele.
const COL_GAP = 140;
const ROW_GAP = 110;
// O ímã do bloco alcança MAGNET vezes a mira fina do encaixe.
const MAGNET = 3;
// Longe assim da trilha atual (em trilhas), o elemento muda de trilha.
const TRACK_HOLD = 0.7;
const FINAL_HEAD = 92;
const FINAL_ROW = 38;
const LANE_ABOVE = 70;
const LANE_BELOW = 30;
export const MIN_LEN = 0.5;
export const IMAGE_MAX = 30;
/** Quantas variações cada bloco final tem; é também o que uma exportação monta de uma vez. */
export const MAX_VERSOES = 48;
export const TONES = 6;
/** Resolução e formato do vídeo exportado (nos Ajustes do Final), os mesmos dos modelos. */
export const RESOLUTIONS = ["480p", "720p", "1080p"];
export const FORMATS = [
  { value: "9:16", description: "Vertical: Reels, TikTok e Shorts." },
  { value: "16:9", description: "Horizontal: YouTube e telas largas." },
  { value: "1:1", description: "Quadrado: feed." },
  { value: "4:3", description: "Horizontal baixo: feed e apresentações." },
  { value: "3:4", description: "Vertical baixo: feed." },
];

/**
 * O que um Final exporta: resolução, formato e o tamanho em pixels (o lado menor
 * é o da resolução; sempre par, como o ffmpeg pede). Projetos de antes guardavam
 * size ("720x1280" ou "1080x1920"): vira 720p ou 1080p em 9:16.
 */
export function output(final) {
  const legacy = final?.size ? (final.size.startsWith("1080") ? "1080p" : "720p") : null;
  const resolution = RESOLUTIONS.includes(final?.resolution) ? final.resolution : legacy ?? "720p";
  const format = FORMATS.some((f) => f.value === final?.format) ? final.format : "9:16";
  const short = parseInt(resolution, 10);
  const [a, b] = format.split(":").map(Number);
  const even = (n) => Math.round(n / 2) * 2;
  const [width, height] = a >= b ? [even((short * a) / b), short] : [short, even((short * b) / a)];
  return { resolution, format, width, height };
}const EPS = 1;

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4;
/** O tempo do bloco na tela: o trecho do arquivo, na velocidade dele. */
export const len = (b) => (b.tout - b.tin) / (b.speed ?? 1);
export const width = (b) => len(b) * PX;
export const linked = (b) => b.kind === "video" && (b.audio ?? "linked") === "linked";
export const height = (b) => (visual(b) ? VIS_H : AUD_H);
/** O som que o bloco toca: o próprio áudio, ou o do vídeo enquanto vinculado. */
export const sounds = (b) => !b.mute && (b.kind === "audio" || linked(b));
const visual = (b) => b.kind !== "audio";
const near = (a, b) => Math.abs(a - b) < EPS;
const overlapX = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;

/** Grupos: sequências de blocos visuais, com o que está em cima e embaixo. */
export function groups(project) {
  const blocks = project.blocks;
  const vis = blocks.filter(visual);
  // A primeira trilha de vídeo é a de quem não apoia em ninguém; o resto se acha pela altura.
  const upper = (b) => vis.some((o) => o !== b && restsOn(b, o.y) && overlapX(b.x, b.x + width(b), o.x, o.x + width(o)));
  const out = [];
  for (const b of [...vis.filter((b) => !upper(b))].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const g = out.find((g) => near(g.y, b.y) && near(g.x + g.w, b.x));
    if (g) {
      g.blocks.push(b);
      g.w += width(b);
    } else out.push(single(b, [b]));
  }
  for (const b of vis.filter(upper)) out.push(single(b, [], [b]));
  for (const a of blocks.filter((b) => !visual(b))) out.push({ ...single(a, [], [], [a]), soloAudio: true });
  // Junta quem encosta ou fica em cima do que outro bloco ocupa, numa trilha dele.
  for (let found = true; found; ) {
    found = false;
    for (const g of out) {
      const edge = members(g);
      const lo = Math.min(...edge.map((b) => b.x));
      const hi = Math.max(...edge.map((b) => b.x + width(b)));
      const other = out.find((o) => {
        if (o === g) return false;
        const all = members(o);
        const x0 = Math.min(...all.map((b) => b.x));
        const x1 = Math.max(...all.map((b) => b.x + width(b)));
        if (!overlapX(x0, x1, lo, hi) && !near(x0, hi) && !near(x1, lo)) return false;
        // Sem trilha vazia no meio da área de vídeo: longe assim, é só coincidência de altura.
        const top = Math.max(...[...g.blocks, ...g.covers].map((b) => trackIn(b, g)), -1);
        const fits = (b) => trackIn(b, g) >= 0 && (!visual(b) || trackIn(b, g) <= top + 1);
        return all.every(fits);
      });
      if (!other) continue;
      for (const b of members(other)) (!visual(b) ? g.audios : near(b.y, g.y) && !g.soloAudio ? g.blocks : g.covers).push(b);
      out.splice(out.indexOf(other), 1);
      found = true;
      break;
    }
  }
  for (const g of out) finishGroup(g);
  // Bloco é o que tem a área tracejada: numerado na ordem em que os elementos entraram no canvas.
  const firstIndex = (g) => Math.min(...members(g).map((b) => blocks.indexOf(b)));
  out.filter(hasArea).sort((a, b) => firstIndex(a) - firstIndex(b)).forEach((g, i) => (g.number = i + 1));
  for (const g of out) {
    const own = members(g).map((b) => project.names?.[b.id]).find(Boolean);
    g.label = own ?? (g.number ? `Bloco ${g.number}` : g.name);
  }
  return out;
}

const single = (b, blocks = [], covers = [], audios = []) => ({ id: b.id, blocks, covers, audios, x: b.x, y: b.y, w: width(b), h: VIS_H });
export const members = (g) => [...g.blocks, ...g.covers, ...g.audios];
/** Se o bloco tem a área tracejada: mais de um elemento. */
export const hasArea = (g) => members(g).length > 1;

/** Onde começa cada área do bloco: no som solto, o que existe é a área de som. */
const videoY = (g) => (g.soloAudio ? g.y - VIS_H : g.y);
const soundY = (g) => (g.soloAudio ? g.y : g.y + VIS_H);

/** A trilha do elemento neste bloco, na área dele (0 é a mais perto da outra área), ou -1. */
function trackIn(b, g) {
  if (!visual(b)) {
    const t = Math.round((b.y - soundY(g)) / AUD_H);
    return near(t * AUD_H, b.y - soundY(g)) && t >= 0 && t < MAX_FAIXAS ? t : -1;
  }
  if (legacyRest(b, videoY(g))) return 1;
  const up = videoY(g) - b.y;
  const t = Math.round(up / VIS_H);
  return near(t * VIS_H, up) && t >= 0 ? t : -1;
}

/** Fecha o bloco: extensão, trilhas e onde fica o som dos vídeos vinculados. */
function finishGroup(g) {
  const all = members(g);
  g.blocks.sort((a, b) => a.x - b.x);
  g.covers.sort((a, b) => trackIn(a, g) - trackIn(b, g) || a.x - b.x);
  g.x = Math.min(...all.map((b) => b.x));
  g.w = Math.max(...all.map((b) => b.x + width(b))) - g.x;
  g.dur = g.w / PX;
  g.top = Math.min(g.y, ...g.covers.map((c) => c.y));
  // O som de quem é vinculado vai para a faixa pedida ou a mais perto com lugar.
  const taken = g.audios.map((a) => ({ track: trackIn(a, g), x0: a.x, x1: a.x + width(a) }));
  g.sounds = [...g.blocks, ...g.covers].filter(linked).map((block) => {
    const track = freeTrack(taken, block.lane ?? 0, block.x, block.x + width(block));
    taken.push({ track, x0: block.x, x1: block.x + width(block) });
    return { block, track, y: soundY(g) + track * LINK_H };
  });
  g.soundTaken = taken;
  g.bottom = Math.max(g.soloAudio ? g.y : g.y + VIS_H, ...g.audios.map((a) => a.y + AUD_H), ...g.sounds.map((s) => s.y + LINK_H));
  g.first = g.blocks[0] ?? g.audios[0] ?? g.covers[0];
  g.last = g.blocks[g.blocks.length - 1] ?? g.audios[0] ?? g.covers[0];
  g.name = g.first.name;
  if (g.blocks.length) g.name = g.blocks.map((b) => b.name).join(" + ");
}

/** A trilha livre mais perto da pedida: a última, depois de tudo, sempre está. */
function freeTrack(taken, want, x0, x1) {
  const next = taken.length ? Math.max(...taken.map((t) => t.track)) + 1 : 0;
  const tracks = Array.from({ length: Math.max(next, want) + 1 }, (_, i) => i).sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || a - b);
  return tracks.find((track) => !taken.some((t) => t.track === track && overlapX(x0, x1, t.x0, t.x1)));
}

/** Em projetos antigos, o som de quem estava por cima ficava entre a imagem e a sequência. */
const legacyRest = (b, y) => linked(b) && near(b.y + VIS_H + LINK_H, y);
const restsOn = (b, y) => near(b.y + VIS_H, y) || legacyRest(b, y);

/** Projeto antigo: põe quem estava por cima na trilha certa. */
export function upgrade(project) {
  const p = clone(project);
  for (const g of groups(p)) for (const c of g.covers) if (legacyRest(c, g.y)) p.blocks.find((b) => b.id === c.id).y = g.y - VIS_H;
  return p;
}

/** Dá nome a um bloco; vazio volta ao "Bloco 1". O nome fica no primeiro elemento dele. */
export function renameGroup(project, group, name) {
  const p = clone(project);
  p.names = { ...p.names };
  for (const b of members(group)) delete p.names[b.id];
  if (name.trim()) p.names[members(group)[0].id] = name.trim();
  return p;
}

export function groupIndex(gs) {
  const m = new Map();
  for (const g of gs) for (const b of [...g.blocks, ...g.covers, ...g.audios]) m.set(b.id, g);
  return m;
}

/** Linhas entre grupos (as que apontam para o mesmo grupo somem). */
export function links(project, gs = groups(project)) {
  const idx = groupIndex(gs);
  const finals = new Set(project.finals.map((f) => f.id));
  const out = [];
  for (const e of project.edges) {
    const from = idx.get(e.from);
    const to = finals.has(e.to) ? e.to : idx.get(e.to);
    if (!from || !to || from === to) continue;
    out.push({ edge: e, from, to });
  }
  return out;
}

/** Versões que chegam a um bloco final: uma lista de grupos cada. */
export function versions(project, finalId, gs = groups(project), max = MAX_VERSOES) {
  const ls = links(project, gs);
  const preds = (node) => ls.filter((l) => l.to === node).map((l) => l.from);
  const res = [];
  const walk = (g, tail, seen) => {
    if (res.length >= max) return;
    const ps = preds(g).filter((p) => !seen.has(p));
    if (!ps.length) return void res.push([g, ...tail]);
    for (const p of new Set(ps)) walk(p, [g, ...tail], new Set([...seen, p]));
  };
  for (const g of new Set(preds(finalId))) walk(g, [], new Set([g]));
  return res;
}

/** Se a variação passa por esta linha (de M.links) até o Final. */
export function linkOn(l, version, finalId) {
  const pos = version.indexOf(l.from);
  if (pos < 0) return false;
  return pos === version.length - 1 ? l.to === finalId : version[pos + 1] === l.to;
}

/** Se as linhas que chegam a este Final dão mais variações do que ele tem. */
export const overLimit = (project, finalId, gs) => versions(project, finalId, gs, MAX_VERSOES + 1).length > MAX_VERSOES;

/** Se a mudança leva algum Final a passar do limite, ou a passar ainda mais: quem liga é recusado. */
export function passesLimit(before, after) {
  const count = (p, id) => versions(p, id, groups(p), 20 * MAX_VERSOES).length;
  return after.finals.some((f) => {
    const n = count(after, f.id);
    return n > MAX_VERSOES && n > count(before, f.id);
  });
}

/** O nome de uma variação na tela e no arquivo, pela posição dela no Final. */
export const versionName = (i) => `Variação ${i + 1}`;

/** O card Final tem até 6 linhas e 8 colunas: 48 é o limite, e se divide por quase tudo. */
const VARIANT_ROWS = 6;
const VARIANT_COLS = 8;

/** Linhas e colunas do card Final: o maior número de linhas que fecha o retângulo; sem isso, 6. */
export function variantShape(n) {
  if (n <= VARIANT_ROWS) return { rows: n, cols: 1 };
  for (let rows = VARIANT_ROWS; rows > 1; rows--) if (n % rows === 0 && n / rows <= VARIANT_COLS) return { rows, cols: n / rows };
  return { rows: VARIANT_ROWS, cols: Math.ceil(n / VARIANT_ROWS) };
}

/** Como o card escreve cada variação: "Variação 1" até 2 colunas, "V. 13" com 3, só o número depois. */
export const variantLabel = (cols) => (cols <= 2 ? "full" : cols === 3 ? "short" : "number");

/**
 * Linha do tempo de uma versão: o que toca, quando e de onde do arquivo.
 * layer 0: base; 1: cobertura (b-roll); "audio": som somado.
 */
export function timeline(version, rate = 1) {
  const items = [];
  let t = 0;
  for (const g of version) {
    // Por trilha: quem está mais acima vem depois e fica por cima.
    const on = (b, layer) => items.push({ block: b, layer, start: (t + (b.x - g.x) / PX) / rate, len: len(b) / rate, tin: b.tin, speed: (b.speed ?? 1) * rate, rate });
    g.blocks.forEach((b) => on(b, 0));
    g.covers.forEach((b) => on(b, 1));
    g.audios.forEach((b) => on(b, "audio"));
    t += g.dur;
  }
  return { duration: t / rate, items };
}

/**
 * Onde o grupo não tem vídeo de base, em segundos a partir do começo dele: o que sobra,
 * porque uma cobertura ou um som passa do fim da sequência, sai sobre o fundo preto.
 */
export function baseGaps(g) {
  const gaps = [];
  let at = 0;
  for (const b of g.blocks) {
    const from = (b.x - g.x) / PX;
    if (from - at > GAP_MIN) gaps.push([+at.toFixed(3), +from.toFixed(3)]);
    at = Math.max(at, from + len(b));
  }
  if (g.dur - at > GAP_MIN) gaps.push([+at.toFixed(3), +g.dur.toFixed(3)]);
  return gaps;
}

/** Quanto o Final acelera todas as variações dele. */
export const finalRate = (final) => final?.speed ?? 1;

/**
 * O que o contêiner monta para um Final: cada grupo vira um trecho, feito uma vez
 * só, e cada versão é a lista dos trechos dela. O Worker roda isto sobre o projeto
 * salvo (src/exportar.ts). pick: os índices das versões; sem ele, todas.
 */
export function exportWork(project, finalId, pick) {
  const final = project.finals.find((f) => f.id === finalId);
  if (!final) return null;
  const gs = groups(project);
  const all = versions(project, finalId, gs);
  const chosen = (pick ?? all.map((_, i) => i)).filter((i) => all[i]);
  const { width: largura, height: altura } = output(final);
  const tipo = { video: "video", image: "imagem", audio: "audio" };
  const camada = { 0: "base", 1: "cobertura", audio: "audio" };
  const trechos = [];
  const seen = new Map();
  const trecho = (g) => {
    if (!seen.has(g)) {
      seen.set(g, trechos.length);
      const tl = timeline([g], finalRate(final));
      trechos.push({
        duracao: +tl.duration.toFixed(3),
        itens: tl.items.map((i) => ({
          tipo: tipo[i.block.kind],
          camada: camada[i.layer],
          src: i.block.src,
          entra: +i.start.toFixed(3),
          dura: +i.len.toFixed(3),
          corte: +i.tin.toFixed(3),
          volume: sounds(i.block) ? i.block.vol : 0,
          velocidade: +i.speed.toFixed(4),
          ...(i.block.frame && i.block.kind !== "audio" ? { quadro: { ...i.block.frame, ...(i.block.frame.keys ? { keys: i.block.frame.keys.map((k) => ({ ...k, t: k.t / i.rate })) } : {}) } } : {}),
        })),
      });
    }
    return seen.get(g);
  };
  return { largura, altura, trechos, versoes: chosen.map((i) => ({ nome: versionName(i), trechos: all[i].map(trecho) })) };
}

/* ---------- Edição (funções puras: devolvem um projeto novo) ---------- */

const clone = (p) => structuredClone(p);

/**
 * Onde um bloco arrastado vai parar: encaixa depois ou antes de outro, cobre um
 * grupo por cima (visual) ou entra embaixo dele (áudio). tol em unidades do
 * canvas. Devolve { x, y, mode, target } (mode null: solto, sem encaixe).
 */
export function snap(project, id, x, y, tol, keep = {}) {
  const b = project.blocks.find((o) => o.id === id);
  const w = width(b);
  const h = height(b);
  const isVideo = visual(b);
  const gs = groups({ ...project, blocks: project.blocks.filter((o) => o.id !== id) });
  const magnet = tol * MAGNET;
  // O bloco onde o elemento já está vem primeiro, e o segura numa área maior.
  for (const g of [...gs.filter((g) => g.id === keep.group), ...gs.filter((g) => g.id !== keep.group)]) {
    const inside = g.id === keep.group;
    const pad = inside ? magnet * 2 : magnet;
    if (y + h <= g.top - pad || y >= g.bottom + pad) continue;
    const lo = g.x;
    const hi = g.x + g.w;
    let at;
    let track = null;
    if (x > hi - EPS * 2 - (inside && keep.beside ? tol : 0)) {
      // Passou da ponta direita: desce para a primeira trilha, ao lado do bloco.
      if (x > hi + pad) continue;
      at = hi;
      track = 0;
    } else if (x + w <= lo + (inside ? EPS * 2 : tol)) {
      // Pela esquerda, encosta na ponta; passou disso, sai do bloco.
      if (x + w < lo - tol) continue;
      at = lo - w;
    } else {
      at = nearestEdge(x, w, [lo, hi, ...members(g).flatMap((o) => [o.x, o.x + width(o)])], tol);
      if (at >= hi - EPS * 2 || at + w <= lo + EPS * 2) at = x;
    }
    const taken = isVideo ? [...g.blocks, ...g.covers].map((o) => ({ track: trackIn(o, g), x0: o.x, x1: o.x + width(o) })) : g.soundTaken;
    const raw = isVideo ? (videoY(g) - y) / VIS_H : (y - soundY(g)) / AUD_H;
    // Perto da trilha onde está, fica nela: mexer devagar na fronteira não troca de trilha.
    const held = inside && keep.track !== undefined && Math.abs(raw - keep.track) < TRACK_HOLD;
    const limit = taken.length ? Math.max(...taken.map((t) => t.track)) + 1 : 0;
    const want = track ?? (held ? keep.track : Math.min(Math.max(Math.round(raw), 0), limit));
    track = freeTrack(taken, isVideo ? want : Math.min(want, MAX_FAIXAS - 1), at, at + w);
    return { x: at, y: isVideo ? videoY(g) - track * VIS_H : soundY(g) + track * AUD_H, mode: isVideo ? "video" : "sound", track, beside: at === hi, group: g };
  }
  return { x, y, mode: null };
}

/** A posição que encosta uma ponta do elemento na ponta mais perto, dentro da mira. */
function nearestEdge(x, w, edges, tol) {
  let best = x;
  let gap = tol;
  for (const e of edges)
    for (const at of [e, e - w])
      if (Math.abs(at - x) < gap) (gap = Math.abs(at - x)), (best = at);
  return best;
}

/** Move um elemento para onde o snap() mandou. */
export function dropBlock(project, id, s) {
  const p = clone(project);
  const b = p.blocks.find((o) => o.id === id);
  b.x = s.x;
  b.y = s.y;
  return p;
}

/** Muda a faixa do som de um vídeo vinculado para a mais perto desta altura do canvas. */
export function setLane(project, id, y) {
  const p = clone(project);
  const b = p.blocks.find((o) => o.id === id);
  const g = groupIndex(groups(p)).get(id);
  b.lane = Math.max(0, Math.min(Math.round((y - soundY(g)) / AUD_H), MAX_FAIXAS - 1));
  return p;
}

export function moveGroup(project, groupId, dx, dy) {
  const p = clone(project);
  const g = groups(p).find((g) => g.id === groupId);
  if (!g) return p;
  const ids = new Set(members(g).map((b) => b.id));
  for (const b of p.blocks) if (ids.has(b.id)) (b.x += dx), (b.y += dy);
  return p;
}

/* Linhas: curva suave; a que passaria sobre um elemento vai reta na altura de saída e curva no fim. */
export const PORT_OUT = 14;
const WIRE_BEND = 120;
const WIRE_PAD = 8;
const portY = (g) => g.y + (g.soloAudio ? AUD_H : VIS_H) / 2;
export const outPoint = (g) => ({ x: g.x + g.w + PORT_OUT, y: portY(g) });
export const inPoint = (g) => ({ x: g.x - PORT_OUT, y: portY(g) });
export const finalPoint = (f) => ({ x: f.x, y: f.y + 40 });
export function curve(a, b) {
  const k = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M${a.x},${a.y} C${a.x + k},${a.y} ${b.x - k},${b.y} ${b.x},${b.y}`;
}
/** Tamanho aproximado do card Final com n variações (o de verdade é medido na tela). */
function finalSize(n) {
  const { rows, cols } = variantShape(Math.max(n, 1));
  const label = variantLabel(cols);
  return { w: Math.max(180, 32 + cols * (label === "full" ? 166 : label === "short" ? 106 : 38)), h: n ? FINAL_HEAD + rows * FINAL_ROW : 80 };
}

/** O que as linhas devem evitar: as áreas dos grupos e os Finais. */
export function wireBoxes(project, gs = groups(project)) {
  const boxes = gs.map((g) => ({ node: g, x0: g.x, x1: g.x + g.w, y0: g.top, y1: g.bottom }));
  for (const f of project.finals) {
    const { w, h } = finalSize(versions(project, f.id, gs).length);
    boxes.push({ node: f.id, x0: f.x, x1: f.x + w, y0: f.y, y1: f.y + h });
  }
  return boxes;
}

/** Se a curva suave passa por cima de uma caixa. */
function curveHits(a, b, boxes) {
  const k = Math.max(40, Math.abs(b.x - a.x) / 2);
  for (let i = 1; i < 40; i++) {
    const t = i / 40;
    const u = 1 - t;
    const x = u ** 3 * a.x + 3 * u * u * t * (a.x + k) + 3 * u * t * t * (b.x - k) + t ** 3 * b.x;
    const y = u ** 3 * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t ** 3 * b.y;
    if (boxes.some((o) => x >= o.x0 - WIRE_PAD && x <= o.x1 + WIRE_PAD && y >= o.y0 - WIRE_PAD && y <= o.y1 + WIRE_PAD)) return true;
  }
  return false;
}

/** O desenho de uma ligação: a curva suave; se ela passa sobre algo, reta na saída e curva no fim. */
export function linkPath(l, project, boxes) {
  const f = typeof l.to === "string" ? project.finals.find((o) => o.id === l.to) : null;
  const a = outPoint(l.from);
  const b = f ? finalPoint(f) : inPoint(l.to);
  const others = boxes.filter((o) => o.node !== l.from && o.node !== l.to);
  if (b.x - a.x <= WIRE_BEND || !curveHits(a, b, others)) return curve(a, b);
  const x = b.x - WIRE_BEND;
  const k = WIRE_BEND * 0.6;
  return `M${a.x},${a.y} L${x},${a.y} C${x + k},${a.y} ${b.x - k},${b.y} ${b.x},${b.y}`;
}

/**
 * Organiza o canvas para nenhuma linha passar sobre um elemento. Cada grupo fica numa coluna,
 * depois de tudo o que vem antes dele, e os Finais na última. Coluna a coluna, cada elemento
 * tenta ter o conector na altura do que chega a ele (com uma ligação longa, a dela, para ela
 * seguir reta). As ligações que atravessam uma coluna reservam a altura delas nessa coluna.
 */
export function arrange(project) {
  const p = clone(project);
  const gs = groups(p);
  if (!gs.length) return p;
  const ls = links(p, gs);
  // Coluna: o caminho mais longo até o grupo. Com um laço nas ligações, para no número de grupos.
  const column = new Map(gs.map((g) => [g, 0]));
  for (let pass = 0; pass < gs.length; pass++)
    for (const l of ls) if (typeof l.to !== "string") column.set(l.to, Math.max(column.get(l.to), Math.min(column.get(l.from) + 1, gs.length)));
  const lastCol = Math.max(...column.values()) + 1;
  const col = (node) => (typeof node === "string" ? lastCol : column.get(node));
  const finalH = (f) => finalSize(versions(p, f.id, gs).length).h;
  const top = (g) => g.top;
  const bottom = (g) => g.bottom;
  // Altura do elemento e do conector dentro dele; o Final entra pelo id, como nas ligações.
  const size = (n) => (typeof n === "string" ? { h: finalH(p.finals.find((f) => f.id === n)), port: 40 } : { h: bottom(n) - top(n), port: portY(n) - top(n) });

  const port = new Map();
  const tops = new Map();
  const wanted = (node) => {
    const seen = ls.filter((l) => l.to === node && port.has(l.from));
    const long = seen.filter((l) => col(l.to) - col(l.from) > 1).sort((a, b) => col(a.from) - col(b.from))[0];
    const ys = seen.map((l) => port.get(l.from)).sort((a, b) => a - b);
    const middle = ys[(ys.length - 1) >> 1];
    // As alturas que servem, da melhor para a pior.
    return [...new Set([...(long ? [port.get(long.from)] : []), ...(ys.length ? [middle] : []), ...ys])];
  };
  const place = (first) => {
    port.clear();
    tops.clear();
    for (let c = 0; c <= lastCol; c++) {
      const lanes = ls.filter((l) => col(l.from) < c && c < col(l.to)).map((l) => port.get(l.from));
      const nodes = c === lastCol ? p.finals.map((f) => f.id) : c ? gs.filter((g) => column.get(g) === c) : first;
      const items = nodes.map((n) => ({ n, wants: wanted(n) }));
      if (c) items.sort((a, b) => (a.wants[0] ?? Infinity) - (b.wants[0] ?? Infinity));
      let free = -Infinity;
      for (const { n, wants } of items) {
        const { h, port: offset } = size(n);
        // A faixa não passa pelo elemento, contando a área e a aba do grupo.
        const lane = (y) => lanes.find((l) => l >= y - LANE_ABOVE && l <= y + h + LANE_BELOW);
        let y = wants.map((w) => w - offset).find((w) => w >= free && lane(w) === undefined);
        if (y === undefined) {
          y = Math.max(wants.length ? wants[0] - offset : free === -Infinity ? 0 : free, free);
          for (let l = lane(y); l !== undefined; l = lane(y)) y = l + LANE_ABOVE + 1;
        }
        tops.set(n, y);
        port.set(n, y + offset);
        free = y + h + ROW_GAP;
      }
    }
  };
  const sources = gs.filter((g) => column.get(g) === 0).sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1));
  place(sources);
  // A primeira coluna segue a ordem do que vem depois: cruza menos.
  const after = (g) => {
    const ys = ls.filter((l) => l.from === g).map((l) => port.get(l.to));
    return ys.length ? ys.reduce((a, b) => a + b) / ys.length : Infinity;
  };
  place([...sources].sort((a, b) => after(a) - after(b)));

  const widths = new Map();
  for (const g of gs) widths.set(column.get(g), Math.max(widths.get(column.get(g)) ?? 0, g.w));
  const xs = new Map();
  let x = 0;
  for (let c = 0; c < lastCol; c++) {
    xs.set(c, x);
    if (widths.has(c)) x += widths.get(c) + COL_GAP;
  }
  for (const g of gs) {
    const dx = xs.get(column.get(g)) - g.x;
    const dy = tops.get(g) - top(g);
    for (const b of members(g)) (b.x += dx), (b.y += dy);
  }
  for (const f of p.finals) (f.x = x), (f.y = tops.get(f.id));
  return p;
}

/**
 * Encurta ou alonga um bloco por uma das pontas. Num grupo, o que vem depois
 * acompanha (sem buraco); solto, a ponta esquerda anda com o corte.
 */
export function trim(project, id, side, timelineSeconds) {
  const p = clone(project);
  const b = p.blocks.find((o) => o.id === id);
  // A borda anda no tempo da tela; no arquivo, isso vale a velocidade do bloco.
  const seconds = timelineSeconds * (b.speed ?? 1);
  const g = groupIndex(groups(p)).get(id);
  const oldEnd = b.x + width(b);
  const max = b.kind === "image" ? IMAGE_MAX : b.dur;
  // Na mesma trilha, quem vem encostado depois acompanha, para não abrir buraco.
  const track = g ? members(g).filter((o) => o.id !== id && near(o.y, b.y)) : [];
  const followed = track.some((o) => near(o.x, oldEnd));
  if (side === "l") {
    let d;
    if (b.kind === "image") {
      const tout = Math.min(Math.max(b.tout - seconds, MIN_LEN), max);
      d = b.tout - tout;
      b.tout = tout;
    } else {
      const tin = Math.min(Math.max(b.tin + seconds, 0), b.tout - MIN_LEN);
      d = tin - b.tin;
      b.tin = tin;
    }
    if (!followed) b.x += d * PX;
  } else b.tout = Math.min(Math.max(b.tout + seconds, b.tin + MIN_LEN), max);
  const delta = b.x + width(b) - oldEnd;
  if (followed && delta) for (const o of track) if (o.x >= oldEnd - EPS) p.blocks.find((q) => q.id === o.id).x += delta;
  return p;
}

/**
 * Divide um bloco de vídeo ou áudio em dois, no instante `at` do arquivo. O segundo
 * vem logo depois, com tudo igual. Devolve { project, id }, id: o bloco novo.
 */
export function split(project, id, at) {
  const p = clone(project);
  const i = p.blocks.findIndex((o) => o.id === id);
  const b = p.blocks[i];
  const nid = newId("b");
  const part = (b.tout - at) / (b.tout - b.tin);
  const c = { ...clone(b), id: nid, tin: at, x: b.x + width(b) * (1 - part) };
  // A animação continua de onde estava: no segundo pedaço, o tempo dela recomeça antes.
  if (c.frame?.keys) c.frame.keys = c.frame.keys.map((k) => ({ ...k, t: k.t - (at - b.tin) / (b.speed ?? 1) }));
  b.tout = at;
  p.blocks.splice(i + 1, 0, c);
  return { project: p, id: nid };
}

/**
 * Refaz uma sequência: os blocos de `order`, encostados a partir de (x0, y). Quem cobria
 * ou somava som a um bloco (em `before`, onde ele começa) acompanha esse bloco. `after` é
 * o projeto já com os cortes e velocidades novos; quem saiu dele não conta.
 */
export function relay(before, after, order, x0, y) {
  const p = clone(after);
  const home = (id) => before.blocks.find((b) => b.id === id);
  const seqOf = new Set(order);
  const riders = [];
  for (const g of groups(before)) {
    const base = g.blocks.filter((b) => seqOf.has(b.id));
    if (!base.length) continue;
    for (const o of [...g.covers, ...g.audios]) {
      const under = base.find((b) => o.x >= b.x - EPS && o.x < b.x + width(b) - EPS);
      if (under) riders.push({ id: o.id, under: under.id });
    }
  }
  let x = x0;
  const moved = new Map();
  for (const id of order) {
    const b = p.blocks.find((o) => o.id === id);
    const was = home(id) ?? b;
    moved.set(id, { dx: x - was.x, dy: y - was.y });
    b.x = x;
    b.y = y;
    x += width(b);
  }
  for (const { id, under } of riders) {
    const b = p.blocks.find((o) => o.id === id);
    const was = home(id);
    const d = moved.get(under);
    if (b && was && d) (b.x = was.x + d.dx), (b.y = was.y + d.dy);
  }
  return p;
}

/** Uma chave da animação, com os valores que faltam no padrão. */
const keyOf = (k) => ({ t: k.t ?? 0, z: k.z ?? 1, x: k.x ?? 0.5, y: k.y ?? 0.5 });

/** O enquadramento (zoom e foco) no instante t do bloco, com a mesma curva da exportação. */
export function frameAt(frame, t) {
  const keys = (frame?.keys ?? [{}]).map(keyOf).sort((a, b) => a.t - b.t);
  const next = keys.findIndex((k) => k.t > t);
  if (next === 0) return keys[0];
  if (next < 0) return keys[keys.length - 1];
  const [a, b] = [keys[next - 1], keys[next]];
  const u = (t - a.t) / (b.t - a.t);
  const s = u * u * (3 - 2 * u);
  return { t, z: a.z + (b.z - a.z) * s, x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
}

/** A janela do quadro que o zoom mostra: foco no centro, sem sair da imagem. */
export function zoomWindow({ z, x, y }, W, H) {
  const [w, h] = [W / z, H / z];
  return { x: Math.min(Math.max(x * W - w / 2, 0), W - w), y: Math.min(Math.max(y * H - h / 2, 0), H - h), w, h };
}

/**
 * Onde a mídia (vw × vh) fica num quadro W × H, a mesma conta do container/exportar.py.
 * frame: { fit: "cover" | "contain" | "blur", flipH, flipV, rotate: 0, 90, 180 ou 270,
 * crop: { l, t, r, b } (fração cortada de cada lado), keys: [{ t, z, x, y }] }.
 * Devolve a matriz CSS (origem no canto da mídia) e o recorte em % para clip-path.
 */
export function placement(frame, vw, vh, W, H, t = 0) {
  const c = { l: 0, t: 0, r: 0, b: 0, ...frame?.crop };
  const [sw, sh] = [vw * (1 - c.l - c.r), vh * (1 - c.t - c.b)];
  const rotate = frame?.rotate ?? 0;
  const turned = rotate % 180 !== 0;
  const [rw, rh] = turned ? [sh, sw] : [sw, sh];
  const fill = (frame?.fit ?? "cover") === "cover";
  const s = fill ? Math.max(W / rw, H / rh) : Math.min(W / rw, H / rh);
  const win = zoomWindow(frameAt(frame, t), W, H);
  const z = W / win.w;
  // Da mídia para o quadro: centro do recorte na origem, espelha, gira, escala e leva ao centro.
  const a = (rotate * Math.PI) / 180;
  const [cos, sin] = [Math.round(Math.cos(a)), Math.round(Math.sin(a))];
  const [fx, fy] = [frame?.flipH ? -1 : 1, frame?.flipV ? -1 : 1];
  const k = s * z;
  const m = [cos * fx * k, sin * fx * k, -sin * fy * k, cos * fy * k];
  const [cx, cy] = [vw * (c.l + (1 - c.l - c.r) / 2), vh * (c.t + (1 - c.t - c.b) / 2)];
  const ox = (W / 2 - win.x) * z - (m[0] * cx + m[2] * cy);
  const oy = (H / 2 - win.y) * z - (m[1] * cx + m[3] * cy);
  return {
    matrix: [...m, ox, oy],
    clip: `inset(${c.t * 100}% ${c.r * 100}% ${c.b * 100}% ${c.l * 100}%)`,
  };
}

/**
 * Desvincula o áudio de um vídeo: cria uma cópia do som como bloco de áudio
 * comum, logo embaixo e com o mesmo corte, sem ligação nenhuma com o vídeo. O
 * vídeo só deixa de mostrar e tocar o próprio som (que continua no arquivo
 * dele). Devolve { project, audioId }.
 */
export function unlinkAudio(project, id) {
  const p = clone(project);
  const v = p.blocks.find((b) => b.id === id);
  if (!v || !linked(v)) return { project: p, audioId: null };
  const y = groupIndex(groups(p)).get(id).sounds.find((s) => s.block.id === id).y;
  v.audio = "unlinked";
  delete v.lane;
  const a = {
    id: newId("a"), kind: "audio", name: `Áudio de ${v.name}`, src: v.src, dur: v.dur, tin: v.tin, tout: v.tout,
    x: v.x, y, mute: v.mute, vol: v.vol, tone: nextTone(p, "audio", v.src), origin: "video",
  };
  p.blocks.push(a);
  return { project: p, audioId: a.id };
}

/** "Vincular ao áudio": o vídeo volta a mostrar e tocar o próprio som. Uma cópia feita antes não muda. */
export function relinkVideo(project, id) {
  const p = clone(project);
  const v = p.blocks.find((b) => b.id === id);
  if (v?.kind === "video") v.audio = "linked";
  return p;
}

/**
 * "Vincular ao vídeo": um áudio que veio de um vídeo volta a mostrar o vídeo do mesmo arquivo,
 * com o corte, o volume e a posição na linha do tempo, logo abaixo do bloco. O vídeo de onde
 * veio não muda. Devolve { project, videoId }.
 */
export function audioToVideo(project, id) {
  const p = clone(project);
  const a = p.blocks.find((b) => b.id === id);
  if (!a || a.kind !== "audio" || a.origin !== "video") return { project: p, videoId: null };
  const g = groupIndex(groups(p)).get(id);
  const others = p.blocks.filter((b) => b !== a);
  const v = { ...a, kind: "video", audio: "linked", name: a.name.replace(/^Áudio de /, ""), tone: nextTone({ blocks: others }, "video", a.src), y: g.bottom + 48 };
  delete v.origin;
  p.blocks[p.blocks.indexOf(a)] = v;
  return { project: p, videoId: v.id };
}

/** O som de um vídeo vinculado e uma cópia dele tocam juntos no mesmo grupo. */
export function doubledSound(project, gs = groups(project)) {
  return gs.some((g) => g.sounds.some(({ block: v }) => !v.mute && g.audios.some((a) => a.origin === "video" && a.src === v.src && !a.mute)));
}

/**
 * Por que uma ligação não pode existir, ou null se pode: "missing" (ponta que não existe),
 * "same" (o grupo com ele mesmo), "repeated" (já ligados), "cycle" (o caminho voltaria a
 * passar por aqui) ou "limit" (passaria do limite de variações).
 */
export function linkProblem(project, from, to) {
  const gs = groups(project);
  const idx = groupIndex(gs);
  const ls = links(project, gs);
  const a = idx.get(from);
  const isFinal = project.finals.some((f) => f.id === to);
  const b = isFinal ? to : idx.get(to);
  if (!a || !b) return "missing";
  if (a === b) return "same";
  if (ls.some((l) => l.from === a && l.to === b)) return "repeated";
  const seen = new Set();
  const reaches = (g) => g === a || (!seen.has(g) && (seen.add(g), ls.some((l) => l.from === g && reaches(l.to))));
  if (!isFinal && reaches(b)) return "cycle";
  return passesLimit(project, { ...project, edges: [...project.edges, { id: "nova", from, to }] }) ? "limit" : null;
}

/** Na primeira importação de um projeto sem Final: põe o Final à direita do bloco, ligado a ele. */
export function linkFirst(project, b) {
  if (project.blocks.length !== 1 || project.finals.length) return false;
  project.finals.push({ id: "final", x: b.x + width(b) + 160, y: b.y + (VIS_H - 80) / 2 });
  project.edges.push({ id: newId("e"), from: b.id, to: "final" });
  return true;
}

export function removeItems(project, ids) {
  const p = clone(project);
  const s = new Set(ids);
  p.blocks = p.blocks.filter((b) => !s.has(b.id));
  p.finals = p.finals.filter((f) => !s.has(f.id));
  p.edges = p.edges.filter((e) => !s.has(e.id) && !s.has(e.from) && !s.has(e.to));
  return p;
}

/**
 * Tom de um bloco novo: o mesmo arquivo repete o tom (é o mesmo trecho);
 * arquivo novo pega o tom menos usado entre os blocos do mesmo tipo.
 */
export function nextTone(project, kind, src) {
  const same = project.blocks.filter((b) => b.kind === kind);
  const twin = same.find((b) => b.src === src);
  if (twin) return twin.tone;
  const use = Array.from({ length: TONES }, (_, i) => same.filter((b) => b.tone === i + 1).length);
  return use.indexOf(Math.min(...use)) + 1;
}

let seq = 0;
export const newId = (prefix) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

/** O exemplo: 3 ganchos → corpo (com b-roll, produto e música) → 2 CTAs → final. */
export function sample(media) {
  const v = (id, name, file, dur, x, y, tone, extra = {}) => ({
    id, kind: "video", tone, name, src: media(file), dur, tin: 0, tout: dur, x, y, mute: false, vol: 1, ...extra,
  });
  const blocks = [
    v("g1", "Gancho 1", "gancho-1.mp4", 3, 0, 0, 1),
    v("g2", "Gancho 2", "gancho-2.mp4", 3, 0, 192, 2),
    v("g3", "Gancho 3", "gancho-3.mp4", 4, 0, 384, 3),
    v("corpo", "Corpo", "corpo.mp4", 8, 400, 192, 5),
    { id: "produto", kind: "image", tone: 3, name: "Produto", src: media("produto.jpg"), dur: IMAGE_MAX, tin: 0, tout: 2, x: 720, y: 192, mute: false, vol: 1 },
    v("broll", "B-roll", "broll.mp4", 4, 480, 96, 2, { tout: 3, mute: true }),
    { id: "musica", kind: "audio", tone: 4, name: "Música", src: media("musica.mp3"), dur: 16, tin: 0, tout: 10, x: 400, y: 328, mute: false, vol: 0.35 },
    v("ctaa", "CTA A", "cta-a.mp4", 3, 960, 64, 4),
    v("ctab", "CTA B", "cta-b.mp4", 3, 960, 320, 6),
  ];
  const e = (from, to) => ({ id: `e-${from}-${to}`, from, to });
  return {
    blocks,
    finals: [{ id: "final", x: 1240, y: 168 }],
    edges: [e("g1", "corpo"), e("g2", "corpo"), e("g3", "corpo"), e("produto", "ctaa"), e("produto", "ctab"), e("ctaa", "final"), e("ctab", "final")],
  };
}

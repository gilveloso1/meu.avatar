/**
 * O que o canvas significa, tirado só da posição dos blocos e das linhas.
 * Os dois protótipos (código próprio e tldraw) usam estas mesmas funções.
 *
 * Projeto: { blocks, finals, edges }
 *   bloco: { id, kind: "video" | "image" | "audio", name, src, dur, tin, tout,
 *            x, y, mute, vol, tone, audio }   (dur: duração do arquivo;
 *            tin/tout: o corte; tone: 1 a TONES, o tom da cor do tipo; audio,
 *            só no vídeo: "linked" (o som dele numa faixa presa embaixo, na cor
 *            do vídeo), "unlinked" (desvinculado: virou um bloco de áudio) ou
 *            "none" (o arquivo não tem som))
 *   final: { id, x, y, resolution, format }   (o que ele exporta; ver output())
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
// Organizar: a área do grupo (20 px em volta) e a aba dele (40 px) cabem nas folgas; o Final, na dele.
const COL_GAP = 140;
const ROW_GAP = 110;
// O ímã do bloco alcança MAGNET vezes a mira fina do encaixe.
const MAGNET = 3;
// Até onde da fileira o centro do elemento conta como "em cima"; mais baixo para quem já está lá.
const ROW_LINE = 0.25;
const ROW_LINE_HELD = 0.5;
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

export const len = (b) => b.tout - b.tin;
export const width = (b) => len(b) * PX;
export const linked = (b) => b.kind === "video" && (b.audio ?? "linked") === "linked";
export const height = (b) => (b.kind === "audio" ? AUD_H : VIS_H + (linked(b) ? LINK_H : 0));
/** O som que o bloco toca: o próprio áudio, ou o do vídeo enquanto vinculado. */
export const sounds = (b) => !b.mute && (b.kind === "audio" || linked(b));
const visual = (b) => b.kind !== "audio";
const near = (a, b) => Math.abs(a - b) < EPS;
const overlapX = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;

/** Grupos: sequências de blocos visuais, com o que está em cima e embaixo. */
export function groups(project) {
  const blocks = project.blocks;
  const vis = blocks.filter(visual);
  // Visual encostado no topo de outro visual é cobertura, não base.
  const isCover = (b) =>
    vis.some((o) => o !== b && restsOn(b, o.y) && overlapX(b.x, b.x + width(b), o.x, o.x + width(o)));
  const covers = vis.filter(isCover);
  const bases = vis.filter((b) => !covers.includes(b));

  // Une bases encostadas na mesma linha.
  const sorted = [...bases].sort((a, b) => a.y - b.y || a.x - b.x);
  const out = [];
  for (const b of sorted) {
    const g = out.find((g) => near(g.y, b.y) && near(g.x + g.w, b.x));
    if (g) {
      g.blocks.push(b);
      g.w += width(b);
    } else out.push({ id: b.id, blocks: [b], x: b.x, y: b.y, w: width(b), covers: [], audios: [] });
  }
  // Duas sequências podem ter crescido até se encostar.
  for (let merged = true; merged; ) {
    merged = false;
    for (const a of out)
      for (const b of out)
        if (a !== b && near(a.y, b.y) && near(a.x + a.w, b.x)) {
          a.blocks.push(...b.blocks);
          a.w += b.w;
          out.splice(out.indexOf(b), 1);
          merged = true;
        }
  }

  for (const g of out) g.h = Math.max(...g.blocks.map(height));
  const overlaps = (b, g) => overlapX(b.x, b.x + width(b), g.x, g.x + g.w);
  for (const c of covers) {
    const g = out.find((g) => restsOn(c, g.y) && overlaps(c, g));
    if (g) g.covers.push(c);
    else out.push({ id: c.id, blocks: [c], x: c.x, y: c.y, w: width(c), covers: [], audios: [] });
  }
  // Som somado: em faixas de AUD_H logo abaixo da imagem, até MAX_FAIXAS. A primeira é a do som
  // da sequência, onde cabe som embaixo de quem não tem (uma faixa vazia não solta as de baixo).
  const lane = (a, g) => (a.y - g.y - VIS_H) / AUD_H;
  for (const a of blocks.filter((b) => !visual(b))) {
    const g = out.find((g) => g.blocks.length && overlaps(a, g) && lane(a, g) > -0.01 && lane(a, g) < MAX_FAIXAS && near(Math.round(lane(a, g)) * AUD_H, a.y - g.y - VIS_H));
    if (g) g.audios.push(a);
    else out.push({ id: a.id, blocks: [], x: a.x, y: a.y, w: width(a), h: AUD_H, covers: [], audios: [a], soloAudio: true });
  }
  for (const g of out) {
    // O bloco vai de onde começa a onde acaba o que está nele: qualquer elemento pode passar da
    // sequência, nos dois lados (seqX e seq guardam onde ela começa e acaba).
    g.seqX = g.x;
    g.seq = g.x + g.w;
    const extra = [...g.covers, ...g.audios];
    g.x = Math.min(g.x, ...extra.map((c) => c.x));
    g.w = Math.max(g.seq, ...extra.map((c) => c.x + width(c))) - g.x;
    g.dur = g.w / PX;
    // Área de som: o som da sequência, os somados e, por último, o som de quem está em cima.
    const soundTop = Math.max(g.y + g.h, ...g.audios.map((a) => a.y + AUD_H));
    const ends = [];
    g.coverSounds = [...g.covers].filter(linked).sort((a, b) => a.x - b.x).map((block) => {
      let lane = ends.findIndex((end) => end <= block.x + EPS);
      if (lane < 0) lane = ends.length;
      ends[lane] = block.x + width(block);
      return { block, y: soundTop + lane * LINK_H };
    });
    g.bottom = soundTop + ends.length * LINK_H;
    g.first = g.blocks[0] ?? g.audios[0];
    g.last = g.blocks[g.blocks.length - 1] ?? g.audios[0];
    g.name = g.blocks.length ? g.blocks.map((b) => b.name).join(" + ") : g.audios[0].name;
  }
  // Bloco é o que tem a área tracejada: numerado na ordem em que os elementos entraram no canvas.
  const firstIndex = (g) => Math.min(...members(g).map((b) => blocks.indexOf(b)));
  const framed = out.filter(hasArea).sort((a, b) => firstIndex(a) - firstIndex(b));
  framed.forEach((g, i) => (g.number = i + 1));
  for (const g of out) {
    const own = members(g).map((b) => project.names?.[b.id]).find(Boolean);
    g.label = own ?? (g.number ? `Bloco ${g.number}` : g.name);
  }
  return out;
}

/** Quem está em cima apoia só a imagem; projetos antigos guardavam a faixa de som junto. */
const restsOn = (b, y) => near(b.y + VIS_H, y) || near(b.y + height(b), y);

/** Projeto antigo: o som de quem está em cima ficava entre a imagem e a sequência. */
export function upgrade(project) {
  const p = clone(project);
  const gs = groups(p);
  for (const g of gs) for (const c of g.covers) if (linked(c) && near(c.y + height(c), g.y)) p.blocks.find((b) => b.id === c.id).y = g.y - VIS_H;
  return p;
}

const members = (g) => [...g.blocks, ...g.covers, ...g.audios];
/** Se o grupo tem a área tracejada: mais de um elemento em sequência, por cima ou de som somado. */
export const hasArea = (g) => g.blocks.length > 1 || g.covers.length > 0 || (g.audios.length > 0 && !g.soloAudio);

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
export function timeline(version) {
  const items = [];
  let t = 0;
  for (const g of version) {
    // Quem está em cima pode começar antes da sequência.
    let at = t + (g.seqX - g.x) / PX;
    for (const b of g.blocks) {
      items.push({ block: b, layer: 0, start: at, len: len(b), tin: b.tin });
      at += len(b);
    }
    const clip = (b, layer) => {
      const rel = (b.x - g.x) / PX;
      const s = Math.max(0, rel);
      const e = Math.min(g.dur, rel + len(b));
      if (e - s > 0.01) items.push({ block: b, layer, start: t + s, len: e - s, tin: b.tin + (s - rel) });
    };
    if (g.soloAudio) items.push({ block: g.audios[0], layer: "audio", start: t, len: g.dur, tin: g.audios[0].tin });
    else {
      g.covers.forEach((b) => clip(b, 1));
      g.audios.forEach((b) => clip(b, "audio"));
    }
    t += g.dur;
  }
  return { duration: t, items };
}

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
      const tl = timeline([g]);
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
  const cx = x + w / 2;
  const cy = y + h / 2;
  const gs = groups({ ...project, blocks: project.blocks.filter((o) => o.id !== id) }).filter((g) => g.blocks.length);
  const magnet = tol * MAGNET;
  const free = () => ({ x, y, mode: null });
  // O bloco onde o elemento já está vem primeiro, e o segura numa área maior.
  const order = [...gs.filter((g) => g.id === keep.group), ...gs.filter((g) => g.id !== keep.group)];
  for (const g of order) {
    const inside = g.id === keep.group;
    const pad = inside ? magnet * 2 : magnet;
    const top = Math.min(g.y, ...g.covers.map((c) => c.y));
    if (y + h <= top - pad || y >= g.bottom + pad) continue;
    const start = g.seqX;
    const end = g.seq;
    const beside = { x: end, y: g.last.y, mode: "after", target: g.last.id, group: g };
    if (visual(b)) {
      // O centro do elemento decide: acima da linha, ele apoia em cima; abaixo, entra na sequência.
      if (cy < g.y + VIS_H * (inside && keep.mode === "cover" ? ROW_LINE_HELD : ROW_LINE)) {
        // Corre até a própria ponta sair da sequência, e o bloco cresce junto. Pela direita,
        // passou disso, desce para o lado; pela esquerda, sai do bloco. Entrar pede um pouco mais
        // que sair, para a borda não piscar.
        if (x > end - EPS * 2 - (inside && keep.mode === "after" ? tol : 0)) {
          if (x > end + pad) continue;
          return beside;
        }
        if (x + w <= start + (inside ? EPS * 2 : tol)) continue;
        return { x, y: g.y - VIS_H, mode: "cover", target: g.id, group: g };
      }
      // Vídeo e imagem vão para a área de vídeo, venham de onde vierem; o som vai junto.
      // Na sequência, o lugar muda só na metade de cada elemento: não abre e fecha a cada emenda.
      const at = g.blocks.findIndex((o) => cx < o.x + width(o) / 2);
      if (at < 0) {
        if (x > end + pad) continue;
        return beside;
      }
      if (at > 0) {
        const o = g.blocks[at - 1];
        return { x: o.x + width(o), y: o.y, mode: "after", target: o.id, group: g };
      }
      if (x + w < start - pad) continue;
      return { x: start - w, y: g.y, mode: "before", target: g.first.id, group: g };
    }
    // Som vai sempre para a área de som, e também corre até a própria ponta sair da sequência.
    if (x > end - (inside ? EPS * 2 : tol) || x + w <= start + (inside ? EPS * 2 : tol)) continue;
    // A faixa mais perto do mouse que tenha espaço; a de baixo do tudo está sempre livre.
    const base = g.y + VIS_H;
    const taken = [
      ...g.blocks.filter(linked).map((o) => ({ track: 0, x0: o.x, x1: o.x + width(o) })),
      ...g.audios.map((a) => ({ track: Math.round((a.y - base) / AUD_H), x0: a.x, x1: a.x + width(a) })),
    ];
    const next = taken.length ? Math.max(...taken.map((t) => t.track)) + 1 : 0;
    const want = Math.min(Math.max(Math.round((y - base) / AUD_H), 0), next);
    const free = (track) => !taken.some((t) => t.track === track && overlapX(x, x + w, t.x0, t.x1));
    const tracks = Array.from({ length: next + 1 }, (_, i) => i).sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || a - b);
    return { x, y: base + tracks.find(free) * AUD_H, mode: "audio", target: g.id, group: g };
  }
  return free();
}

/** Move um bloco para onde o snap() mandou, abrindo espaço se encaixou no meio. */
export function dropBlock(project, id, s) {
  const p = clone(project);
  const b = p.blocks.find((o) => o.id === id);
  if (s.mode === "after") {
    const t = p.blocks.find((o) => o.id === s.target);
    const end = t.x + width(t);
    const g = groups({ ...p, blocks: p.blocks.filter((o) => o.id !== id) }).find((g) => g.blocks.some((o) => o.id === t.id));
    if (g) for (const o of [...g.blocks, ...g.covers, ...g.audios]) if (o.x >= end - EPS) o.x += width(b);
  }
  b.x = s.x;
  b.y = s.y;
  return p;
}

export function moveGroup(project, groupId, dx, dy) {
  const p = clone(project);
  const g = groups(p).find((g) => g.id === groupId);
  if (!g) return p;
  const ids = new Set([...g.blocks, ...g.covers, ...g.audios].map((b) => b.id));
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
  const boxes = gs.map((g) => ({ node: g, x0: g.x, x1: g.x + g.w, y0: Math.min(g.y, ...g.covers.map((c) => c.y)), y1: g.bottom }));
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
  const top = (g) => Math.min(g.y, ...g.covers.map((c) => c.y));
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
    for (const b of [...g.blocks, ...g.covers, ...g.audios]) (b.x += dx), (b.y += dy);
  }
  for (const f of p.finals) (f.x = x), (f.y = tops.get(f.id));
  return p;
}

/**
 * Encurta ou alonga um bloco por uma das pontas. Num grupo, o que vem depois
 * acompanha (sem buraco); solto, a ponta esquerda anda com o corte.
 */
export function trim(project, id, side, seconds) {
  const p = clone(project);
  const b = p.blocks.find((o) => o.id === id);
  const g = groups(p).find((g) => g.blocks.some((o) => o.id === id));
  const oldEnd = b.x + width(b);
  const max = b.kind === "image" ? IMAGE_MAX : b.dur;
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
    if (!g || g.blocks.length === 1) b.x += d * PX;
  } else b.tout = Math.min(Math.max(b.tout + seconds, b.tin + MIN_LEN), max);
  const delta = b.x + width(b) - oldEnd;
  if (g && g.blocks.length > 1 && delta)
    for (const o of [...g.blocks, ...g.covers, ...g.audios]) if (o.id !== id && o.x >= oldEnd - EPS) o.x += delta;
  return p;
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
  const g = groups(p).find((g) => g.blocks.some((b) => b.id === id));
  const below = g ? g.audios.map((a) => p.blocks.find((b) => b.id === a.id)) : [];
  v.audio = "unlinked";
  const a = {
    id: newId("a"), kind: "audio", name: `Áudio de ${v.name}`, src: v.src, dur: v.dur, tin: v.tin, tout: v.tout,
    x: v.x, y: 0, mute: v.mute, vol: v.vol, tone: nextTone(p, "audio", v.src), origin: "video",
  };
  // O áudio fica logo embaixo do vídeo, na primeira faixa de som do grupo; as
  // faixas que já havia descem uma (e acompanham se o grupo ficou mais baixo).
  const h = Math.max(...(g ? g.blocks : [v]).map(height));
  a.y = (g ? g.y : v.y) + h;
  const shift = h - (g ? g.h : 0) + AUD_H;
  for (const o of below) o.y += shift;
  p.blocks.push(a);
  return { project: p, audioId: a.id };
}

/**
 * "Vincular ao áudio": o vídeo volta a mostrar e tocar o próprio som. Uma cópia
 * de áudio feita antes não muda. Se o grupo ficou mais alto, o som somado desce.
 */
export function relinkVideo(project, id) {
  const p = clone(project);
  const v = p.blocks.find((b) => b.id === id);
  if (!v || v.kind !== "video" || linked(v)) return p;
  const g = groups(p).find((g) => g.blocks.some((b) => b.id === id));
  v.audio = "linked";
  if (g) {
    const shift = Math.max(...g.blocks.map((b) => height(b.id === id ? v : b))) - g.h;
    for (const a of g.audios) p.blocks.find((b) => b.id === a.id).y += shift;
  }
  return p;
}

/**
 * "Vincular ao vídeo": um áudio que veio de um vídeo volta a mostrar o vídeo do
 * mesmo arquivo, com o som preso embaixo, mantendo corte, volume e posição na
 * linha do tempo. Sai das faixas de som e vai para logo abaixo do grupo. O vídeo
 * de onde veio não muda. Devolve { project, videoId }.
 */
export function audioToVideo(project, id) {
  const p = clone(project);
  const a = p.blocks.find((b) => b.id === id);
  if (!a || a.kind !== "audio" || a.origin !== "video") return { project: p, videoId: null };
  const g = groups(p).find((g) => g.audios.some((b) => b.id === id));
  const bottom = g ? Math.max(g.y + g.h, ...g.audios.map((o) => o.y + AUD_H)) : a.y;
  const others = p.blocks.filter((b) => b !== a);
  const v = { ...a, kind: "video", audio: "linked", name: a.name.replace(/^Áudio de /, ""), tone: nextTone({ blocks: others }, "video", a.src), y: bottom + 48 };
  delete v.origin;
  p.blocks[p.blocks.indexOf(a)] = v;
  // A faixa que ele deixou, se ficou vazia, fecha: as de baixo sobem uma.
  if (g && !g.audios.some((o) => o.id !== id && near(o.y, a.y)))
    for (const o of g.audios) if (o.y > a.y + 1) p.blocks.find((b) => b.id === o.id).y -= AUD_H;
  return { project: p, videoId: v.id };
}

/** O som de um vídeo vinculado e uma cópia dele tocam juntos no mesmo grupo. */
export function doubledSound(project, gs = groups(project)) {
  return gs.some((g) => g.blocks.some((v) => linked(v) && !v.mute && g.audios.some((a) => a.origin === "video" && a.src === v.src && !a.mute)));
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
    v("broll", "B-roll", "broll.mp4", 4, 480, 56, 2, { tout: 3, mute: true }),
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

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
    vis.some((o) => o !== b && near(b.y + height(b), o.y) && overlapX(b.x, b.x + width(b), o.x, o.x + width(o)));
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
    const g = out.find((g) => near(g.y, c.y + height(c)) && overlaps(c, g));
    if (g) g.covers.push(c);
    else out.push({ id: c.id, blocks: [c], x: c.x, y: c.y, w: width(c), covers: [], audios: [] });
  }
  // Som somado: em faixas de AUD_H embaixo do grupo, até MAX_FAIXAS (a primeira
  // encosta no grupo; uma faixa que fica vazia não solta as de baixo).
  const lane = (a, g) => (a.y - g.y - g.h) / AUD_H;
  for (const a of blocks.filter((b) => !visual(b))) {
    const g = out.find((g) => g.blocks.length && overlaps(a, g) && lane(a, g) > -0.01 && lane(a, g) < MAX_FAIXAS && near(Math.round(lane(a, g)) * AUD_H, a.y - g.y - g.h));
    if (g) g.audios.push(a);
    else out.push({ id: a.id, blocks: [], x: a.x, y: a.y, w: width(a), h: AUD_H, covers: [], audios: [a], soloAudio: true });
  }
  for (const g of out) {
    g.dur = g.w / PX;
    g.first = g.blocks[0] ?? g.audios[0];
    g.last = g.blocks[g.blocks.length - 1] ?? g.audios[0];
    g.name = g.blocks.length ? g.blocks.map((b) => b.name).join(" + ") : g.audios[0].name;
  }
  return out;
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
    let at = t;
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
export function snap(project, id, x, y, tol) {
  const b = project.blocks.find((o) => o.id === id);
  const w = width(b);
  const gs = groups({ ...project, blocks: project.blocks.filter((o) => o.id !== id) });
  const bases = gs.flatMap((g) => g.blocks.map((o) => ({ o, g })));
  if (visual(b)) {
    for (const { o, g } of bases) {
      if (Math.abs(y - o.y) > VIS_H / 2) continue;
      if (Math.abs(x - (o.x + width(o))) < tol) return { x: o.x + width(o), y: o.y, mode: "after", target: o.id, group: g };
      if (Math.abs(x + w - o.x) < tol && o === g.first) return { x: o.x - w, y: o.y, mode: "before", target: o.id, group: g };
    }
    for (const g of gs) {
      if (!g.blocks.length) continue;
      const cx = x + w / 2;
      const overRow = y + VIS_H > g.y + VIS_H * 0.2 && y < g.y + VIS_H * 0.6;
      if (overRow && cx > g.x && cx < g.x + g.w) return { x: Math.max(g.x, x), y: g.y - height(b), mode: "cover", target: g.id, group: g };
    }
  } else {
    for (const g of gs) {
      if (!g.blocks.length) continue;
      const cx = x + w / 2;
      const lanes = new Set(g.audios.map((a) => Math.round((a.y - g.y - g.h) / AUD_H))).size;
      const overRow = y + AUD_H > g.y + g.h * 0.4 && y < g.y + g.h + AUD_H * (lanes + 0.8);
      const lane = Math.min(Math.max(Math.round((y - g.y - g.h) / AUD_H), 0), lanes);
      if (overRow && cx > g.x && cx < g.x + g.w) return { x: Math.max(g.x, x), y: g.y + g.h + lane * AUD_H, mode: "audio", target: g.id, group: g };
    }
  }
  return { x, y, mode: null };
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

/**
 * O que o canvas significa, tirado só da posição dos blocos e das linhas.
 * Os dois protótipos (código próprio e tldraw) usam estas mesmas funções.
 *
 * Projeto: { blocks, finals, edges }
 *   bloco: { id, kind: "video" | "image" | "audio", name, src, dur, tin, tout,
 *            x, y, mute, vol, tone }   (dur: duração do arquivo; tin/tout: o
 *            corte; tone: 1 a TONES, o tom da cor do tipo)
 *   final: { id, x, y }
 *   linha: { id, from, to }      (from: um bloco do grupo de saída;
 *                                 to: um bloco do grupo de entrada ou um final)
 *
 * Regras (geometria, em unidades do canvas):
 *   - a largura é a duração (PX por segundo);
 *   - blocos de imagem ou vídeo na mesma linha, encostados, formam uma
 *     sequência (um grupo);
 *   - um bloco de imagem ou vídeo encostado em cima de um grupo cobre a imagem
 *     dele naquele trecho (b-roll); o x diz o momento;
 *   - um bloco de áudio encostado embaixo de um grupo soma o som dele;
 *   - linhas ligam grupos; cada caminho até um bloco final é uma versão.
 */

export const PX = 40;
export const VIS_H = 96;
export const AUD_H = 40;
export const MIN_LEN = 0.5;
export const IMAGE_MAX = 30;
export const MAX_VERSOES = 200;
export const TONES = 6;
const EPS = 1;

export const len = (b) => b.tout - b.tin;
export const width = (b) => len(b) * PX;
export const height = (b) => (b.kind === "audio" ? AUD_H : VIS_H);
const visual = (b) => b.kind !== "audio";
const near = (a, b) => Math.abs(a - b) < EPS;
const overlapX = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;

/** Grupos: sequências de blocos visuais, com o que está em cima e embaixo. */
export function groups(project) {
  const blocks = project.blocks;
  const vis = blocks.filter(visual);
  // Visual encostado no topo de outro visual é cobertura, não base.
  const isCover = (b) =>
    vis.some((o) => o !== b && near(b.y + VIS_H, o.y) && overlapX(b.x, b.x + width(b), o.x, o.x + width(o)));
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

  const rowOf = (b, dy) => out.find((g) => near(g.y, b.y + dy) && overlapX(b.x, b.x + width(b), g.x, g.x + g.w));
  for (const c of covers) {
    const g = rowOf(c, VIS_H);
    if (g) g.covers.push(c);
    else out.push({ id: c.id, blocks: [c], x: c.x, y: c.y, w: width(c), covers: [], audios: [] });
  }
  for (const a of blocks.filter((b) => !visual(b))) {
    const g = rowOf(a, -VIS_H);
    if (g) g.audios.push(a);
    else out.push({ id: a.id, blocks: [], x: a.x, y: a.y, w: width(a), covers: [], audios: [a], soloAudio: true });
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
export function versions(project, finalId, gs = groups(project)) {
  const ls = links(project, gs);
  const preds = (node) => ls.filter((l) => l.to === node).map((l) => l.from);
  const res = [];
  const walk = (g, tail, seen) => {
    if (res.length >= MAX_VERSOES) return;
    const ps = preds(g).filter((p) => !seen.has(p));
    if (!ps.length) return void res.push([g, ...tail]);
    for (const p of new Set(ps)) walk(p, [g, ...tail], new Set([...seen, p]));
  };
  for (const g of new Set(preds(finalId))) walk(g, [], new Set([g]));
  return res;
}

export const versionName = (v) => v.map((g) => g.name).join(" → ");

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

/** O que iria para o contêiner montar com ffmpeg. */
export function exportPlan(version) {
  const tl = timeline(version);
  const camada = { 0: "base", 1: "cobertura", audio: "audio" };
  return {
    versao: versionName(version),
    duracao: +tl.duration.toFixed(2),
    trechos: tl.items.map((i) => ({
      camada: camada[i.layer],
      arquivo: i.block.name,
      entra: +i.start.toFixed(2),
      dura: +i.len.toFixed(2),
      corte_inicio: +i.tin.toFixed(2),
      volume: i.block.mute ? 0 : i.block.vol,
    })),
  };
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
      if (overRow && cx > g.x && cx < g.x + g.w) return { x: Math.max(g.x, x), y: g.y - VIS_H, mode: "cover", target: g.id, group: g };
    }
  } else {
    for (const g of gs) {
      if (!g.blocks.length) continue;
      const cx = x + w / 2;
      const overRow = y + AUD_H > g.y + VIS_H * 0.4 && y < g.y + VIS_H + AUD_H * 0.8;
      if (overRow && cx > g.x && cx < g.x + g.w) return { x: Math.max(g.x, x), y: g.y + VIS_H, mode: "audio", target: g.id, group: g };
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
    { id: "musica", kind: "audio", tone: 4, name: "Música", src: media("musica.mp3"), dur: 16, tin: 0, tout: 10, x: 400, y: 288, mute: false, vol: 0.35 },
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

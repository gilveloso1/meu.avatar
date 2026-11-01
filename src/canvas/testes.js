import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "./modelo.js";

const p = M.sample((f) => f);

test("o exemplo tem 3 ganchos, o corpo e 2 CTAs: 6 versões", () => {
  const gs = M.groups(p);
  const corpo = gs.find((g) => g.id === "corpo");
  assert.deepEqual(corpo.blocks.map((b) => b.id), ["corpo", "produto"]);
  assert.deepEqual(corpo.covers.map((b) => b.id), ["broll"]);
  assert.deepEqual(corpo.audios.map((b) => b.id), ["musica"]);
  assert.equal(corpo.dur, 10);
  const vs = M.versions(p, "final");
  assert.equal(vs.length, 6);
  assert.equal(M.versionName(0), "Variação 1");
  assert.deepEqual(vs[0].map((g) => g.name), ["Gancho 1", "Corpo + Produto", "CTA A"]);
});

test("a linha do tempo põe o b-roll e a música no segundo certo", () => {
  const v = M.versions(p, "final")[0];
  const tl = M.timeline(v);
  assert.equal(tl.duration, 16);
  const broll = tl.items.find((i) => i.block.id === "broll");
  assert.deepEqual([broll.start, broll.len, broll.layer], [5, 3, 1]);
  const mus = tl.items.find((i) => i.block.id === "musica");
  assert.deepEqual([mus.start, mus.len], [3, 10]);
});

test("exportar faz cada grupo uma vez só: 6 versões saem de 6 trechos", () => {
  const w = M.exportWork(p, "final");
  assert.equal(w.versoes.length, 6);
  assert.equal(w.trechos.length, 6);
  assert.deepEqual([w.largura, w.altura], [720, 1280]);
  assert.equal(w.versoes[0].nome, "Variação 1");
  assert.equal(new Set(w.versoes.map((v) => v.trechos[1])).size, 1);
  const corpo = w.trechos[w.versoes[0].trechos[1]];
  assert.equal(corpo.duracao, 10);
  const broll = corpo.itens.find((i) => i.camada === "cobertura");
  assert.deepEqual([broll.entra, broll.dura, broll.volume], [2, 3, 0]);
  assert.deepEqual(M.exportWork(p, "final", [1, 99]).versoes.map((v) => v.nome), ["Variação 2"]);
  assert.equal(M.exportWork(p, "nada"), null);
});

const el = (id, x, y, dur = 5, kind = "image", extra = {}) => ({ id, kind, name: id, src: id, dur, tin: 0, tout: dur, x, y, mute: false, vol: 1, tone: 1, audio: "none", ...extra });
const faixa = (id, x, track = 0, dur = 2) => el(id, x, M.VIS_H + track * M.AUD_H, dur, "audio");
const base = (...extra) => ({ blocks: [el("a", 0, 0), el("b", 200, 0), ...extra], finals: [], edges: [] });
const dentro = { group: "a", track: 0 };
// Todo elemento segue as mesmas regras: cada caso roda para a área de vídeo e para a de som.
const areas = [
  { nome: "vídeo", novo: () => el("n", 2000, 2000, 2), acima: (t) => -t * M.VIS_H, ocupa: (id, x, t, d) => el(id, x, -t * M.VIS_H, d) },
  { nome: "som", novo: () => el("n", 2000, 2000, 2, "audio"), acima: (t) => M.VIS_H + t * M.AUD_H, ocupa: (id, x, t, d) => faixa(id, x, t, d) },
];
const pilha = (a, ...extra) => (a.nome === "vídeo" ? base(a.novo(), ...extra) : base(a.novo(), faixa("m", 0, 0, 10), ...extra));

for (const a of areas) {
  test(`${a.nome}: é puxado ao chegar perto e fica na sua área, venha de onde vier`, () => {
    for (const y of [a.nome === "som" ? -30 : -100, 130, a.acima(0)]) assert.equal(M.snap(pilha(a), "n", 100, y, 16).mode, a.nome === "vídeo" ? "video" : "sound");
    assert.equal(M.snap(pilha(a), "n", 100, -700, 16).mode, null);
  });

  test(`${a.nome}: na mesma trilha nunca fica sobre outro; vai para a livre mais perto`, () => {
    const q = pilha(a);
    const t0 = a.nome === "vídeo" ? 0 : 0;
    const s = M.snap(q, "n", 100, a.acima(t0), 16, dentro);
    assert.equal(s.track, 1);
    assert.equal(s.y, a.acima(1));
  });

  test(`${a.nome}: sobe para uma trilha nova e divide a trilha com quem não sobrepõe`, () => {
    const q = pilha(a, a.ocupa("o", 0, 1, 2));
    assert.equal(M.snap(q, "n", 120, a.acima(1), 16, { ...dentro, track: 1 }).track, 1);
    assert.equal(M.snap(q, "n", 40, a.acima(1), 16, { ...dentro, track: 1 }).track, 2);
    assert.equal(M.snap(q, "n", 40, a.acima(2), 16, { ...dentro, track: 2 }).track, 2);
  });

  test(`${a.nome}: corre até a ponta sair do bloco, que cresce nos dois lados`, () => {
    const q = pilha(a);
    const fim = M.groups(q).find((g) => g.id === "a");
    const hi = fim.x + fim.w;
    const passa = M.snap(q, "n", hi - 10, a.acima(1), 16, { ...dentro, track: 1 });
    assert.equal(passa.x, hi - 10);
    const g = M.groups(M.dropBlock(q, "n", passa)).find((g) => g.id === "a");
    assert.equal(g.w, hi + 70);
    const esq = M.snap(q, "n", -70, a.acima(1), 16, { ...dentro, track: 1 });
    assert.equal(esq.x, -70);
    const h = M.groups(M.dropBlock(q, "n", esq)).find((g) => g.id === "a");
    assert.deepEqual([h.x, h.w], [-70, hi + 70]);
  });

  test(`${a.nome}: passou da direita, fica ao lado na primeira trilha; da esquerda, sai`, () => {
    const q = pilha(a);
    const g = M.groups(q).find((g) => g.id === "a");
    const hi = g.x + g.w;
    const lado = M.snap(q, "n", hi + 10, a.acima(1), 16, { ...dentro, track: 1 });
    assert.deepEqual([lado.x, lado.track], [hi, 0]);
    const encosta = M.snap(q, "n", -85, a.acima(1), 16, { ...dentro, track: 1 });
    assert.equal(encosta.x, -80);
    assert.equal(M.snap(q, "n", -130, a.acima(1), 16, dentro).mode, null);
  });

  test(`${a.nome}: encosta magneticamente na ponta dos outros`, () => {
    const q = pilha(a, a.ocupa("o", 120, 1, 1));
    assert.equal(M.snap(q, "n", 35, a.acima(1), 16, { ...dentro, track: 1 }).x, 40);
    assert.equal(M.snap(q, "n", 170, a.acima(1), 16, { ...dentro, track: 1 }).x, 160);
  });

  test(`${a.nome}: mexer devagar na fronteira entre trilhas não troca de trilha`, () => {
    const q = pilha(a, a.ocupa("o", 0, 1, 1));
    const step = Math.abs(a.acima(1) - a.acima(0));
    let keep = { ...dentro, track: 1 };
    const trilhas = [];
    for (const f of [0.45, 0.5, 0.55, 0.45, 0.6, 0.5]) {
      const s = M.snap(q, "n", 300, a.acima(1) + (a.nome === "vídeo" ? 1 : -1) * step * f * 0.5, 16, keep);
      trilhas.push(s.track);
      keep = { group: s.group?.id, track: s.track };
    }
    assert.equal(new Set(trilhas).size, 1);
  });
}

test("encurtar puxa quem vem encostado depois, em qualquer trilha", () => {
  const q = base(faixa("m", 0, 0, 3), faixa("o", 120, 0, 3), el("c", 0, -M.VIS_H, 2), el("d", 80, -M.VIS_H, 2));
  const r = M.trim(q, "a", "r", -1);
  assert.equal(r.blocks.find((b) => b.id === "b").x, 160);
  assert.equal(M.trim(q, "m", "r", -1).blocks.find((b) => b.id === "o").x, 80);
  assert.equal(M.trim(q, "c", "r", -1).blocks.find((b) => b.id === "d").x, 40);
});

test("elemento em qualquer trilha toca no seu tempo; a mais alta fica por último", () => {
  const q = base(el("c", 40, -M.VIS_H, 2), el("d", 80, -2 * M.VIS_H, 2), faixa("m", -40, 0, 2));
  const g = M.groups(q).find((g) => g.id === "a");
  const tl = M.timeline([g]);
  assert.equal(tl.duration, 11);
  const de = (id) => tl.items.find((i) => i.block.id === id);
  assert.deepEqual(["m", "a", "b", "c", "d"].map((id) => de(id).start), [0, 1, 6, 2, 3]);
  assert.deepEqual(tl.items.filter((i) => i.layer === 1).map((i) => i.block.id), ["c", "d"]);
});

test("som do vídeo fica na faixa pedida, sem sobrepor, e anda junto com ele", () => {
  const v = (id, x, y, lane) => el(id, x, y, 5, "video", { audio: "linked", ...(lane === undefined ? {} : { lane }) });
  const q = { blocks: [v("a", 0, 0), v("c", 40, -M.VIS_H), v("d", 300, -M.VIS_H, 1), faixa("m", 200, 0, 5)], finals: [], edges: [] };
  const g = M.groups(q)[0];
  assert.deepEqual(g.sounds.map((s) => [s.block.id, s.track]), [["a", 0], ["c", 1], ["d", 1]]);
  assert.equal(g.bottom, M.VIS_H + 2 * M.AUD_H);
  const mudou = M.setLane(q, "a", M.VIS_H + 2 * M.AUD_H + 5);
  assert.deepEqual(M.groups(mudou)[0].sounds.map((s) => [s.block.id, s.track]), [["a", 2], ["c", 1], ["d", 1]]);
  const o = M.moveGroup(mudou, "a", 100, 50);
  assert.equal(M.groups(o)[0].sounds[0].y, 50 + M.VIS_H + 2 * M.AUD_H);
});

test("elementos soltos alinhados por acaso não viram trilhas de um bloco", () => {
  const q = { blocks: [el("a", 0, 0), el("b", 0, 192), el("c", 0, 384)], finals: [], edges: [] };
  assert.equal(M.groups(q).length, 3);
});

test("desvincular põe o som na faixa dele como áudio comum, e vincular de novo não mexe na cópia", () => {
  const { project: q, audioId } = M.unlinkAudio(p, "corpo");
  const a = q.blocks.find((b) => b.id === audioId);
  const v = q.blocks.find((b) => b.id === "corpo");
  assert.equal(M.sounds(v), false);
  assert.equal(a.y, v.y + M.VIS_H);
  assert.deepEqual(M.groups(q).find((g) => g.id === "corpo").audios.map((b) => b.id).sort(), [audioId, "musica"].sort());
  assert.deepEqual([a.tin, a.tout, a.kind], [0, 8, "audio"]);
  const r = M.relinkVideo(q, "corpo");
  assert.equal(M.linked(r.blocks.find((b) => b.id === "corpo")), true);
  assert.deepEqual(r.blocks.find((b) => b.id === audioId), a);
  assert.equal(M.doubledSound(r), true);
  const { project: s2, videoId } = M.audioToVideo(r, audioId);
  const nv = s2.blocks.find((b) => b.id === videoId);
  assert.deepEqual([nv.kind, nv.name, nv.audio], ["video", "Corpo", "linked"]);
  assert.equal(M.audioToVideo(s2, "musica").videoId, null);
});

test("projeto antigo: quem estava por cima sobe para a trilha certa", () => {
  const v = (id, x, y) => el(id, x, y, 5, "video", { audio: "linked" });
  const q = { blocks: [v("a", 0, 0), v("c", 40, -136), v("solto", 0, 900)], finals: [], edges: [] };
  assert.deepEqual(M.groups(q).find((g) => g.id === "a").covers.map((c) => c.id), ["c"]);
  const o = M.upgrade(q);
  assert.equal(o.blocks.find((b) => b.id === "c").y, -M.VIS_H);
  assert.equal(o.blocks.find((b) => b.id === "solto").y, 900);
  assert.deepEqual(M.groups(o).find((g) => g.id === "a").covers.map((c) => c.id), ["c"]);
});

test("os blocos se chamam Bloco 1, Bloco 2, e aceitam nome próprio", () => {
  const b = (id, x, y) => ({ id, kind: "image", name: id, src: id, dur: 5, tin: 0, tout: 5, x, y, mute: false, vol: 1, tone: 1 });
  let q = { blocks: [b("solto", 0, 900), b("a", 0, 500), b("b", 200, 500), b("c", 0, 0), b("d", 200, 0)], finals: [], edges: [] };
  const rotulos = () => M.groups(q).map((g) => [g.id, g.label]).sort();
  assert.deepEqual(rotulos(), [["a", "Bloco 1"], ["c", "Bloco 2"], ["solto", "solto"]]);
  q = M.renameGroup(q, M.groups(q).find((g) => g.id === "c"), "  Fim  ");
  assert.deepEqual(rotulos(), [["a", "Bloco 1"], ["c", "Fim"], ["solto", "solto"]]);
  q = M.renameGroup(q, M.groups(q).find((g) => g.id === "c"), "");
  assert.deepEqual(rotulos(), [["a", "Bloco 1"], ["c", "Bloco 2"], ["solto", "solto"]]);
});

test("linha em ciclo não trava", () => {
  const q = { ...p, edges: [...p.edges, { id: "x", from: "ctaa", to: "g1" }] };
  assert.equal(M.versions(q, "final").length, 6);
});

test("o Final exporta na resolução e no formato escolhidos (e lê o tamanho de antes)", () => {
  assert.deepEqual(M.output({}), { resolution: "720p", format: "9:16", width: 720, height: 1280 });
  assert.deepEqual(M.output({ resolution: "1080p", format: "16:9" }), { resolution: "1080p", format: "16:9", width: 1920, height: 1080 });
  assert.deepEqual(M.output({ resolution: "480p", format: "4:3" }), { resolution: "480p", format: "4:3", width: 640, height: 480 });
  assert.deepEqual(M.output({ resolution: "480p", format: "9:16" }), { resolution: "480p", format: "9:16", width: 480, height: 854 });
  assert.deepEqual(M.output({ size: "1080x1920" }), { resolution: "1080p", format: "9:16", width: 1080, height: 1920 });
});

test("o card Final fecha o retângulo quando dá, com até 6 linhas e 8 colunas", () => {
  const forma = (n) => { const s = M.variantShape(n); return `${s.rows}x${s.cols}`; };
  assert.deepEqual([1, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 24, 30, 36, 48].map(forma), ["1x1", "6x1", "4x2", "3x3", "5x2", "6x2", "2x7", "5x3", "4x4", "6x3", "5x4", "6x4", "6x5", "6x6", "6x8"]);
  assert.deepEqual([7, 11, 22, 47].map(forma), ["6x2", "6x2", "6x4", "6x8"]);
  for (let n = 1; n <= M.MAX_VERSOES; n++) {
    const s = M.variantShape(n);
    assert.ok(s.rows <= 6 && s.cols <= 8 && s.rows * s.cols >= n, `${n}`);
  }
});

test("o card escreve o nome inteiro até 2 colunas, V. com 3 e só o número depois", () => {
  assert.deepEqual([1, 2, 3, 4, 8].map(M.variantLabel), ["full", "full", "short", "number", "number"]);
});

test("cada Final tem até 48 variações, e o que passa disso só avisa", () => {
  const bloco = (id, y) => ({ id, kind: "image", name: id, src: "a", dur: 5, tin: 0, tout: 5, x: 0, y, mute: false, vol: 1, tone: 1 });
  const ganchos = Array.from({ length: 49 }, (_, i) => `g${i}`);
  const p = { blocks: ganchos.map((id, i) => bloco(id, i * 400)), finals: [{ id: "final", x: 900, y: 0 }], edges: ganchos.map((id) => ({ id: `e-${id}`, from: id, to: "final" })) };
  assert.equal(M.versions(p, "final").length, 48);
  assert.equal(M.overLimit(p, "final"), true);
  assert.equal(M.exportWork(p, "final").versoes.length, 48);
  p.edges.pop();
  assert.equal(M.overLimit(p, "final"), false);
});

test("a ligação que passa de 48 variações é recusada; as outras, não", () => {
  const bloco = (id, y) => ({ id, kind: "image", name: id, src: "a", dur: 5, tin: 0, tout: 5, x: 0, y, mute: false, vol: 1, tone: 1 });
  const ganchos = Array.from({ length: 50 }, (_, i) => `g${i}`);
  const liga = (ids) => ids.map((id) => ({ id: `e-${id}`, from: id, to: "final" }));
  const com = (ids) => ({ blocks: ganchos.map((id, i) => bloco(id, i * 400)), finals: [{ id: "final", x: 900, y: 0 }], edges: liga(ids) });
  assert.equal(M.passesLimit(com(ganchos.slice(0, 47)), com(ganchos.slice(0, 48))), false);
  assert.equal(M.passesLimit(com(ganchos.slice(0, 48)), com(ganchos.slice(0, 49))), true);
  assert.equal(M.passesLimit(com(ganchos.slice(0, 49)), com(ganchos.slice(0, 50))), true);
  assert.equal(M.passesLimit(com(ganchos.slice(0, 49)), com(ganchos.slice(0, 49))), false);
});

test("a linha está na variação que passa por ela até o Final", () => {
  const p = M.sample((f) => f);
  const gs = M.groups(p);
  const vs = M.versions(p, "final", gs);
  const ls = M.links(p, gs);
  for (const v of vs) {
    const nas = ls.filter((l) => M.linkOn(l, v, "final"));
    assert.equal(nas.length, v.length);
  }
  const fim = ls.find((l) => l.to === "final");
  assert.equal(vs.filter((v) => M.linkOn(fim, v, "final")).length, vs.filter((v) => v.at(-1) === fim.from).length);
});

test("organizar põe cada grupo depois do que vem antes, sem mudar as variações", () => {
  const p = M.sample((f) => f);
  const antes = M.versions(p, "final").map((v) => v.map((g) => g.name));
  const o = M.arrange(p);
  const gs = M.groups(o);
  assert.deepEqual(M.versions(o, "final", gs).map((v) => v.map((g) => g.name)).sort(), [...antes].sort());
  assert.equal(gs.length, M.groups(p).length);
  for (const l of M.links(o, gs)) assert.ok(typeof l.to === "string" ? o.finals[0].x > l.from.x + l.from.w : l.to.x > l.from.x + l.from.w);
  // Outra vez não muda nada.
  assert.deepEqual(M.arrange(o).blocks, o.blocks);
  assert.notEqual(p.blocks[0], o.blocks[0]);
});

/** Pontos de uma linha desenhada, tirados do próprio caminho (M, L opcional e C). */
function wirePoints(d) {
  const n = d.match(/-?[\d.]+/g).map(Number);
  const out = [];
  const line = n.length === 10;
  const [x0, y0] = n;
  const c = line ? n.slice(2) : n.slice(0, 2).concat(n.slice(2));
  if (line) for (let i = 0; i <= 200; i++) out.push([x0 + ((n[2] - x0) * i) / 200, y0 + ((n[3] - y0) * i) / 200]);
  const [ax, ay, bx, by, cx, cy, dx, dy] = c;
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const u = 1 - t;
    out.push([u ** 3 * ax + 3 * u * u * t * bx + 3 * u * t * t * cx + t ** 3 * dx, u ** 3 * ay + 3 * u * u * t * by + 3 * u * t * t * cy + t ** 3 * dy]);
  }
  return out;
}

/** Quantas linhas passam sobre um grupo ou Final que não é ponta delas. */
function wiresOverBlocks(p) {
  const gs = M.groups(p);
  const boxes = M.wireBoxes(p, gs);
  let hits = 0;
  for (const l of M.links(p, gs)) {
    const pts = wirePoints(M.linkPath(l, p, boxes));
    const others = boxes.filter((o) => o.node !== l.from && o.node !== l.to);
    if (others.some((b) => pts.some(([x, y]) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1))) hits++;
  }
  return hits;
}

const peca = (id, y = 0, x = 0, kind = "video", dur = 5) => ({ id, kind, name: id, src: id, dur, tin: 0, tout: dur, x, y, mute: false, vol: 1, tone: 1, audio: "none" });
const projeto = (ids, ligas, finais = ["final"]) => ({
  blocks: ids.map((id, i) => peca(id, (i * 977) % 2500, (i * 613) % 1800)),
  finals: finais.map((id) => ({ id, x: 0, y: 0 })),
  edges: ligas.map(([from, to], i) => ({ id: `e${i}`, from, to })),
});
const cenarios = {
  "gancho que pula o corpo": projeto(["g1", "g2", "c"], [["g1", "c"], ["g2", "c"], ["c", "final"], ["g2", "final"]]),
  "3 ganchos, corpo e 2 CTAs": projeto(["g1", "g2", "g3", "c", "a", "b"], [["g1", "c"], ["g2", "c"], ["g3", "c"], ["c", "a"], ["c", "b"], ["a", "final"], ["b", "final"]]),
  "ligações que pulam duas colunas": projeto(["a", "b", "c", "d", "e"], [["a", "b"], ["b", "c"], ["c", "d"], ["d", "final"], ["a", "c"], ["a", "d"], ["e", "d"], ["e", "final"], ["b", "final"]]),
  "dois Finais": projeto(["a", "b", "c", "d"], [["a", "c"], ["b", "c"], ["c", "f1"], ["d", "f2"], ["b", "f2"], ["a", "f1"]], ["f1", "f2"]),
  "muitos ganchos e CTAs": projeto(["g1", "g2", "g3", "g4", "g5", "c1", "c2", "x", "y", "z"], [["g1", "c1"], ["g2", "c1"], ["g3", "c1"], ["g4", "c2"], ["g5", "c2"], ["c1", "x"], ["c1", "y"], ["c2", "y"], ["c2", "z"], ["x", "final"], ["y", "final"], ["z", "final"], ["g5", "final"], ["g1", "z"]]),
  "elementos soltos": projeto(["a", "b", "c", "d"], [["a", "b"], ["b", "final"]]),
};

for (const [nome, p] of Object.entries(cenarios))
  test(`organizar não deixa linha sobre elemento: ${nome}`, () => {
    assert.equal(wiresOverBlocks(M.arrange(p)), 0);
  });

test("organizar alinha os conectores, como no exemplo do gancho que pula o corpo", () => {
  const o = M.arrange(cenarios["gancho que pula o corpo"]);
  const gs = M.groups(o);
  const y = (id) => M.outPoint(gs.find((g) => g.id === id)).y;
  assert.equal(y("g1"), y("c"));
  assert.equal(y("g2"), M.finalPoint(o.finals[0]).y);
});

test("com o gancho da ligação longa em cima, o outro ainda alinha com o corpo", () => {
  const p = structuredClone(cenarios["gancho que pula o corpo"]);
  p.blocks.find((b) => b.id === "g1").y = 3000;
  p.blocks.find((b) => b.id === "g2").y = 0;
  const o = M.arrange(p);
  const gs = M.groups(o);
  const y = (id) => M.outPoint(gs.find((g) => g.id === id)).y;
  assert.equal(y("g1"), y("c"));
  assert.equal(y("g2"), M.finalPoint(o.finals[0]).y);
  assert.equal(wiresOverBlocks(o), 0);
});

test("a linha é uma curva suave, e só vai reta quando passaria sobre um elemento", () => {
  const p = { blocks: [peca("a", 0, 0), peca("b", 0, 1400)], finals: [], edges: [{ id: "1", from: "a", to: "b" }] };
  const caminho = (q) => {
    const gs = M.groups(q);
    return M.linkPath(M.links(q, gs)[0], q, M.wireBoxes(q, gs));
  };
  assert.ok(!caminho(p).includes("L"));
  assert.ok(!caminho({ ...p, blocks: [...p.blocks, peca("longe", 900, 700)] }).includes("L"));
  const q = { ...p, blocks: [...p.blocks, peca("meio", 0, 700)] };
  assert.ok(caminho(q).includes("L"));
});

test("organizar considera coberturas e som embaixo", () => {
  const p = projeto(["a", "c"], [["a", "c"], ["c", "final"]]);
  p.blocks.push({ ...peca("capa", p.blocks[1].y - M.VIS_H, p.blocks[1].x, "image", 3) }, { ...peca("som", p.blocks[1].y + M.VIS_H, p.blocks[1].x, "audio", 3) }, peca("b", 3000));
  p.edges.push({ id: "z", from: "b", to: "final" }, { id: "w", from: "a", to: "final" });
  const o = M.arrange(p);
  assert.equal(wiresOverBlocks(o), 0);
  assert.equal(M.groups(o).length, M.groups(p).length);
});

test("organizar aguenta laço nas ligações e projeto vazio", () => {
  const bloco = (id, y) => ({ id, kind: "image", name: id, src: "a", dur: 5, tin: 0, tout: 5, x: 0, y, mute: false, vol: 1, tone: 1 });
  const p = { blocks: [bloco("a", 0), bloco("b", 400)], finals: [{ id: "final", x: 0, y: 0 }], edges: [{ id: "1", from: "a", to: "b" }, { id: "2", from: "b", to: "a" }] };
  assert.equal(M.groups(M.arrange(p)).length, 2);
  assert.deepEqual(M.arrange({ blocks: [], finals: [], edges: [] }).blocks, []);
});

test("ligações impossíveis são recusadas, cada uma com o motivo", () => {
  const bloco = (id, y) => ({ id, kind: "image", name: id, src: "a", dur: 5, tin: 0, tout: 5, x: 0, y, mute: false, vol: 1, tone: 1 });
  const q = { blocks: [bloco("a", 0), bloco("b", 400), bloco("c", 800), bloco("d", 1200)], finals: [{ id: "final", x: 900, y: 0 }], edges: [{ id: "1", from: "a", to: "b" }, { id: "2", from: "b", to: "c" }] };
  assert.equal(M.linkProblem(q, "c", "d"), null);
  assert.equal(M.linkProblem(q, "c", "final"), null);
  assert.equal(M.linkProblem(q, "a", "a"), "same");
  assert.equal(M.linkProblem(q, "a", "b"), "repeated");
  assert.equal(M.linkProblem(q, "b", "a"), "cycle");
  assert.equal(M.linkProblem(q, "c", "a"), "cycle");
  assert.equal(M.linkProblem(q, "a", "nada"), "missing");
  assert.equal(M.linkProblem(q, "nada", "a"), "missing");
  assert.equal(M.linkProblem(q, "final", "a"), "missing");
});

test("dois blocos do mesmo grupo não se ligam", () => {
  const b = (id, x) => ({ id, kind: "image", name: id, src: "a", dur: 5, tin: 0, tout: 2, x, y: 0, mute: false, vol: 1, tone: 1 });
  const q = { blocks: [b("a", 0), b("b", 2 * M.PX)], finals: [], edges: [] };
  assert.equal(M.linkProblem(q, "a", "b"), "same");
});

test("ligação salva que não existe mais é ignorada", () => {
  const q = { ...M.sample((f) => f) };
  q.edges = [...q.edges, { id: "x", from: "sumiu", to: "final" }, { id: "y", from: "g1", to: "sumiu" }];
  assert.equal(M.versions(q, "final").length, 6);
});

test("só a primeira importação traz o Final, ligado a ela", () => {
  const b = (id) => ({ id, kind: "image", name: id, src: "a", dur: 5, tin: 0, tout: 5, x: 100, y: 50, mute: false, vol: 1, tone: 1 });
  const q = { blocks: [b("a")], finals: [], edges: [] };
  assert.equal(M.linkFirst(q, q.blocks[0]), true);
  assert.equal(M.versions(q, "final").length, 1);
  q.blocks.push(b("b"));
  assert.equal(M.linkFirst(q, q.blocks[1]), false);
  assert.equal(q.edges.length, 1);
  const com = { blocks: [b("a")], finals: [{ id: "f", x: 0, y: 0 }], edges: [] };
  assert.equal(M.linkFirst(com, com.blocks[0]), false);
});

test("velocidade: o bloco dura menos, e a linha do tempo toca o arquivo mais rápido", () => {
  const b = { id: "a", kind: "video", tin: 2, tout: 8, dur: 10, x: 0, y: 0, speed: 2 };
  assert.equal(M.len(b), 3);
  const [i] = M.timeline([{ blocks: [b], covers: [], audios: [], x: 0, dur: 3 }], 1.5).items;
  assert.equal(i.speed, 3);
  assert.equal(i.len, 2);
});

test("o corte pela tela anda no tempo do arquivo, na velocidade do bloco", () => {
  const b = { id: "a", kind: "video", name: "a", src: "a", tin: 0, tout: 8, dur: 10, x: 0, y: 0, speed: 2, vol: 1 };
  const out = M.trim({ blocks: [b], finals: [], edges: [] }, "a", "r", -1);
  assert.equal(out.blocks[0].tout, 6);
});

test("dividir: a soma dos pedaços é o bloco, e a animação continua de onde estava", () => {
  const b = { id: "a", kind: "video", name: "a", src: "a", tin: 1, tout: 5, dur: 10, x: 40, y: 0, vol: 1, frame: { keys: [{ t: 3, z: 2, x: 0.5, y: 0.5 }] } };
  const { project, id } = M.split({ blocks: [b], finals: [], edges: [] }, "a", 3);
  const c = project.blocks.find((o) => o.id === id);
  assert.equal(project.blocks[0].tout, 3);
  assert.equal(c.x, 120);
  assert.equal(c.frame.keys[0].t, 1);
});

test("frameAt: fora das chaves fica na ponta; entre elas, a curva suave", () => {
  const f = { keys: [{ t: 1, z: 1 }, { t: 3, z: 2 }] };
  assert.equal(M.frameAt(f, 0).z, 1);
  assert.equal(M.frameAt(f, 2).z, 1.5);
  assert.equal(M.frameAt(f, 9).z, 2);
});

test("zoomWindow: foco no canto não mostra fora da imagem", () => {
  assert.deepEqual(M.zoomWindow({ z: 2, x: 0, y: 1 }, 100, 200), { x: 0, y: 100, w: 50, h: 100 });
});

test("placement: sem ajuste cobre o quadro, e cobrir e caber diferem no menor lado", () => {
  const ponto = ([a, b, c, d, e, f], x, y) => [a * x + c * y + e, b * x + d * y + f];
  const cobre = M.placement({}, 200, 100, 100, 100).matrix;
  assert.deepEqual(ponto(cobre, 100, 50), [50, 50]);
  assert.deepEqual(ponto(cobre, 50, 0), [0, 0]);
  const cabe = M.placement({ fit: "contain" }, 200, 100, 100, 100).matrix;
  assert.deepEqual(ponto(cabe, 0, 0), [0, 25]);
});

test("placement: zoom leva o foco ao centro, e girar 90° manda a direita para baixo", () => {
  const ponto = ([a, b, c, d, e, f], x, y) => [a * x + c * y + e, b * x + d * y + f];
  const z = M.placement({ keys: [{ t: 0, z: 2, x: 0.5, y: 0.25 }] }, 100, 100, 100, 100).matrix;
  assert.deepEqual(ponto(z, 50, 25), [50, 50]);
  const g = M.placement({ rotate: 90 }, 100, 100, 100, 100).matrix;
  assert.deepEqual(ponto(g, 100, 50), [50, 100]);
});

test("relay: encosta a sequência e leva junto quem a cobre", () => {
  const v = (id, x, y, extra = {}) => ({ id, kind: "video", name: id, src: id, tin: 0, tout: 2, dur: 2, x, y, vol: 1, audio: "none", ...extra });
  const antes = { blocks: [v("a", 0, 0), v("b", 80, 0), v("c", 100, -96, { tout: 1 })], finals: [], edges: [] };
  const depois = { ...antes, blocks: antes.blocks.map((b) => (b.id === "a" ? { ...b, tout: 1 } : b)) };
  const p = M.relay(antes, depois, ["a", "b"], 0, 0);
  assert.equal(p.blocks[1].x, 40);
  assert.equal(p.blocks[2].x, 60);
});

test("baseGaps: acha o fim sem base e o buraco na sequência, e ignora arredondamento", () => {
  const b = (x, tout) => ({ id: `b${x}`, kind: "video", x, tin: 0, tout });
  assert.deepEqual(M.baseGaps({ x: 0, dur: 5, blocks: [b(0, 3)] }), [[3, 5]]);
  assert.deepEqual(M.baseGaps({ x: 0, dur: 5, blocks: [b(0, 2), b(120, 2)] }), [[2, 3]]);
  assert.deepEqual(M.baseGaps({ x: 0, dur: 3.01, blocks: [b(0, 3)] }), []);
});

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

test("a linha do tempo põe o b-roll no segundo certo e corta a música no fim do grupo", () => {
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

test("encaixar no meio abre espaço; encurtar puxa o que vem depois", () => {
  const novo = { id: "n", kind: "video", name: "N", src: "", dur: 2, tin: 0, tout: 2, x: 0, y: 600, mute: false, vol: 1 };
  let q = { ...p, blocks: [...p.blocks, novo] };
  const s = M.snap(q, "n", 721, 200, 12);
  assert.equal(s.mode, "after");
  assert.equal(s.target, "corpo");
  q = M.dropBlock(q, "n", s);
  assert.equal(q.blocks.find((b) => b.id === "produto").x, 800);
  assert.equal(M.groups(q).find((g) => g.id === "corpo").dur, 12);
  q = M.trim(q, "corpo", "r", -1);
  assert.equal(q.blocks.find((b) => b.id === "n").x, 680);
  assert.equal(q.blocks.find((b) => b.id === "produto").x, 760);
});

test("vídeo solto por cima vira cobertura; áudio embaixo soma o som", () => {
  const novo = { id: "c", kind: "video", name: "C", src: "", dur: 2, tin: 0, tout: 2, x: 600, y: 180, mute: false, vol: 1 };
  const q = { ...p, blocks: [...p.blocks, novo] };
  const s = M.snap(q, "c", 600, 180, 12);
  assert.equal(s.mode, "cover");
  assert.equal(s.y, 192 - M.height(novo));
  const a = { id: "a", kind: "audio", name: "A", src: "", dur: 5, tin: 0, tout: 5, x: 30, y: 250, mute: false, vol: 1 };
  const q2 = { ...p, blocks: [...p.blocks, a] };
  assert.equal(M.snap(q2, "a", 30, 250, 12).mode, null);
  assert.equal(M.snap(q2, "a", 450, 250, 12).mode, "audio");
});

test("linha em ciclo não trava", () => {
  const q = { ...p, edges: [...p.edges, { id: "x", from: "ctaa", to: "g1" }] };
  assert.equal(M.versions(q, "final").length, 6);
});

test("vídeo com áudio vinculado é mais alto e a música fica embaixo da faixa dele", () => {
  const corpo = M.groups(p).find((g) => g.id === "corpo");
  assert.equal(corpo.h, M.VIS_H + M.LINK_H);
  assert.deepEqual(corpo.audios.map((b) => b.id), ["musica"]);
  assert.deepEqual(corpo.covers.map((b) => b.id), ["broll"]);
});

test("desvincular: o som vira um bloco de áudio logo embaixo e a música desce", () => {
  const { project: q, audioId } = M.unlinkAudio(p, "corpo");
  const g = M.groups(q).find((g) => g.id === "corpo");
  const a = q.blocks.find((b) => b.id === audioId);
  const v = q.blocks.find((b) => b.id === "corpo");
  assert.equal(v.audio, "unlinked");
  assert.equal(M.sounds(v), false);
  assert.equal(g.h, M.VIS_H);
  assert.equal(a.y, v.y + M.VIS_H);
  assert.equal(q.blocks.find((b) => b.id === "musica").y, a.y + M.AUD_H);
  assert.deepEqual(g.audios.map((b) => b.id).sort(), [audioId, "musica"].sort());
  assert.deepEqual([a.tin, a.tout, a.kind], [0, 8, "audio"]);
});

test("vincular de novo: o vídeo volta a tocar o próprio som e a cópia não muda", () => {
  const { project: q, audioId } = M.unlinkAudio(p, "corpo");
  const copia = q.blocks.find((b) => b.id === audioId);
  const r = M.relinkVideo(q, "corpo");
  const v = r.blocks.find((b) => b.id === "corpo");
  assert.equal(M.linked(v), true);
  assert.deepEqual(r.blocks.find((b) => b.id === audioId), { ...copia, y: copia.y + M.LINK_H });
  assert.equal(M.doubledSound(r), true);
  // A cópia de áudio vira vídeo de novo, sem mexer no vídeo original.
  const { project: s2, videoId } = M.audioToVideo(r, audioId);
  const nv = s2.blocks.find((b) => b.id === videoId);
  assert.deepEqual([nv.kind, nv.name, nv.audio, nv.tin, nv.tout], ["video", "Corpo", "linked", 0, 8]);
  assert.deepEqual(s2.blocks.find((b) => b.id === "corpo"), v);
  assert.equal(M.audioToVideo(s2, "musica").videoId, null);
});

test("a faixa que fica vazia fecha e a música continua no grupo", () => {
  const { project: q, audioId } = M.unlinkAudio(p, "corpo");
  const { project: r } = M.audioToVideo(q, audioId);
  const g = M.groups(r).find((g) => g.id === "corpo");
  assert.deepEqual(g.audios.map((b) => b.id), ["musica"]);
  assert.equal(r.blocks.find((b) => b.id === "musica").y, g.y + g.h);
});

test("o Final exporta na resolução e no formato escolhidos (e lê o tamanho de antes)", () => {
  assert.deepEqual(M.output({}), { resolution: "720p", format: "9:16", width: 720, height: 1280 });
  assert.deepEqual(M.output({ resolution: "1080p", format: "16:9" }), { resolution: "1080p", format: "16:9", width: 1920, height: 1080 });
  assert.deepEqual(M.output({ resolution: "480p", format: "4:3" }), { resolution: "480p", format: "4:3", width: 640, height: 480 });
  assert.deepEqual(M.output({ resolution: "480p", format: "9:16" }), { resolution: "480p", format: "9:16", width: 480, height: 854 });
  assert.deepEqual(M.output({ size: "1080x1920" }), { resolution: "1080p", format: "9:16", width: 1080, height: 1920 });
});

test("o card Final escreve o nome inteiro até 2 colunas, V. com 3 e só o número depois", () => {
  assert.deepEqual([1, 5, 10, 11, 15, 16, 50, 200].map(M.variantLabel), ["full", "full", "full", "short", "short", "number", "number", "number"]);
});

test("cada Final tem até 50 variações, e o que passa disso só avisa", () => {
  const bloco = (id, y) => ({ id, kind: "image", name: id, src: "a", dur: 5, tin: 0, tout: 5, x: 0, y, mute: false, vol: 1, tone: 1 });
  const ganchos = Array.from({ length: 51 }, (_, i) => `g${i}`);
  const p = { blocks: ganchos.map((id, i) => bloco(id, i * 400)), finals: [{ id: "final", x: 900, y: 0 }], edges: ganchos.map((id) => ({ id: `e-${id}`, from: id, to: "final" })) };
  assert.equal(M.versions(p, "final").length, 50);
  assert.equal(M.overLimit(p, "final"), true);
  assert.equal(M.exportWork(p, "final").versoes.length, 50);
  p.edges.pop();
  assert.equal(M.overLimit(p, "final"), false);
});

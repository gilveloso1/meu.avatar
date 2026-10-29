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
  assert.equal(M.versionName(vs[0]), "Gancho 1 → Corpo + Produto → CTA A");
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

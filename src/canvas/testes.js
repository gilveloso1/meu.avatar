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

test("encaixar no meio abre espaço; encurtar puxa o que vem depois", () => {
  const novo = { id: "n", kind: "video", name: "N", src: "", dur: 2, tin: 0, tout: 2, x: 0, y: 600, mute: false, vol: 1 };
  let q = { ...p, blocks: [...p.blocks, novo] };
  const s = M.snap(q, "n", 690, 200, 12);
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
  const s = M.snap(q, "c", 600, 60, 12);
  assert.equal(s.mode, "cover");
  assert.equal(s.y, 192 - M.VIS_H);
  const a = { id: "a", kind: "audio", name: "A", src: "", dur: 5, tin: 0, tout: 5, x: 30, y: 250, mute: false, vol: 1 };
  const q2 = { ...p, blocks: [...p.blocks, a] };
  assert.equal(M.snap(q2, "a", 30, 2000, 12).mode, null);
  assert.equal(M.snap(q2, "a", 450, 100, 12).mode, "audio");
  assert.equal(M.snap(q2, "a", 450, 250, 12).mode, "audio");
});

const dois = () => {
  const b = (id, x, y, dur = 5, kind = "image") => ({ id, kind, name: id, src: id, dur, tin: 0, tout: dur, x, y, mute: false, vol: 1, tone: 1 });
  return { blocks: [b("a", 0, 0), b("b", 200, 0), b("n", 2000, 2000, 2), b("s", 2000, 3000, 2, "audio")], finals: [], edges: [] };
};

test("o bloco puxa o elemento ao entrar na área, sem precisar ir ao meio", () => {
  const q = dois();
  const em = M.snap(q, "n", 10, -90 - 40, 16);
  assert.deepEqual([em.mode, em.x, em.y], ["cover", 0, -M.VIS_H]);
  assert.equal(M.snap(q, "n", 10, -500, 16).mode, null);
  const som = M.snap(q, "s", 100, 96 + 30, 16);
  assert.deepEqual([som.mode, som.y], ["audio", 96]);
});

test("com o botão apertado, o elemento corre dentro do bloco até o limite", () => {
  const q = dois();
  const keep = { group: "a" };
  assert.equal(M.snap(q, "n", 120, -96, 16, keep).x, 120);
  // Passa do fim do que há embaixo enquanto a ponta dele ainda está no bloco.
  const passando = M.snap(q, "n", 390, -96, 16, { ...keep, mode: "cover" });
  assert.deepEqual([passando.mode, passando.x], ["cover", 390]);
  // A ponta saiu: desce para o lado.
  const fora = M.snap(q, "n", 400, -96, 16, { ...keep, mode: "cover" });
  assert.deepEqual([fora.mode, fora.x, fora.y, fora.target], ["after", 400, 0, "b"]);
});

test("pela esquerda o elemento corre até a própria ponta sair, e então sai do bloco", () => {
  const q = dois();
  const keep = { group: "a", mode: "cover" };
  const passando = M.snap(q, "n", -70, -96, 16, keep);
  assert.deepEqual([passando.mode, passando.x], ["cover", -70]);
  assert.equal(M.snap(q, "n", -79, -96, 16, keep).mode, null);
  // Na borda, voltar pede um pouco mais que sair.
  assert.equal(M.snap(q, "n", -70, -96, 16).mode, null);
  assert.equal(M.snap(q, "n", -60, -96, 16).mode, "cover");
});

test("o elemento de cima que passa do começo expande o bloco e empurra a sequência no tempo", () => {
  const q = dois();
  Object.assign(q.blocks.find((b) => b.id === "n"), { x: -40, y: -M.VIS_H });
  const g = M.groups(q).find((g) => g.id === "a");
  assert.deepEqual([g.x, g.w, g.seqX, g.seq, g.dur], [-40, 440, 0, 400, 11]);
  const tl = M.timeline([g]);
  assert.equal(tl.duration, 11);
  assert.deepEqual(tl.items.filter((i) => i.layer === 0).map((i) => i.start), [1, 6]);
  assert.equal(tl.items.find((i) => i.layer === 1).start, 0);
  const areas = [["a", -40, 440]];
  assert.deepEqual(M.groups(M.moveGroup(q, "a", 100, 0)).filter((o) => o.id === "a").map((o) => [o.id, o.x, o.w]), areas.map(([i, x, w]) => [i, x + 100, w]));
});

test("o elemento de cima que passa do fim expande o bloco e toca até o fim dele", () => {
  const q = dois();
  const n = q.blocks.find((b) => b.id === "n");
  Object.assign(n, { x: 380, y: -M.VIS_H });
  const g = M.groups(q).find((g) => g.id === "a");
  assert.deepEqual([g.w, g.dur, g.seq], [460, 11.5, 400]);
  const tl = M.timeline([g]);
  assert.equal(tl.duration, 11.5);
  assert.equal(tl.items.find((i) => i.block === g.covers[0]).len, 2);
});

test("na fileira, o lugar só muda na metade de cada elemento, sem piscar nas emendas", () => {
  const q = dois();
  const lugar = (x) => {
    const s = M.snap(q, "n", x, 0, 16, { group: "a", mode: "after" });
    return [s.mode, s.target];
  };
  const antes = [];
  for (let x = 60; x <= 300; x += 5) antes.push(lugar(x).join());
  assert.equal(new Set(antes).size, 2);
  assert.equal(antes.lastIndexOf("after,a") < antes.indexOf("after,b") || antes.indexOf("after,b") < 0, true);
  assert.deepEqual(lugar(-30), ["before", "a"]);
  assert.deepEqual(lugar(150), ["after", "a"]);
  assert.deepEqual(lugar(300), ["after", "b"]);
});

test("mexer devagar na fronteira entre em cima e na fileira não fica trocando", () => {
  const q = dois();
  let keep = { group: "a", mode: "cover" };
  const trocas = [];
  for (const y of [-40, -34, -36, -30, -34, -28]) {
    const s = M.snap(q, "n", 100, y, 16, keep);
    trocas.push(s.mode);
    keep = { group: s.group?.id, mode: s.mode };
  }
  assert.equal(new Set(trocas).size, 1);
});

test("som também expande o bloco nos dois lados, e sai sem trepidar", () => {
  const q = dois();
  const keep = { group: "a", mode: "audio" };
  const som = q.blocks.find((b) => b.id === "s");
  // Do lado esquerdo: um movimento por vez, sem alternar entre preso e solto.
  let k = { ...keep };
  const modos = [];
  for (let x = 60; x >= -90; x -= 5) {
    const s = M.snap(q, "s", x, 110, 16, k);
    modos.push(s.mode);
    k = { group: s.group?.id, mode: s.mode };
  }
  assert.equal(modos.lastIndexOf("audio"), modos.indexOf(null) - 1);
  assert.equal(M.snap(q, "s", -70, 110, 16, keep).x, -70);
  assert.equal(M.snap(q, "s", 390, 110, 16, keep).x, 390);
  assert.equal(M.snap(q, "s", 400, 110, 16, keep).mode, null);
  Object.assign(som, { x: -40, y: 96 });
  const g = M.groups(q).find((g) => g.id === "a");
  assert.deepEqual([g.x, g.w, g.seqX, g.seq], [-40, 440, 0, 400]);
  Object.assign(som, { x: 380, y: 96 });
  assert.equal(M.groups(q).find((g) => g.id === "a").w, 460);
});

test("som sobe para a faixa de cima quando há espaço, e nunca fica sobre outro", () => {
  const b = (id, x, y, dur = 5, kind = "audio", extra = {}) => ({ id, kind, name: id, src: id, dur, tin: 0, tout: dur, x, y, mute: false, vol: 1, tone: 1, ...extra });
  const q = { blocks: [b("v", 0, 0, 5, "video"), b("i", 200, 0, 5, "image"), b("m", 0, 136, 2), b("s", 240, 176, 2)], finals: [], edges: [] };
  const y = (x, top) => M.snap(q, "s", x, top, 16, { group: "v", mode: "audio" }).y;
  // Embaixo da imagem não há som: a primeira faixa está livre ali.
  assert.equal(y(240, 96), 96);
  // Embaixo do vídeo, a primeira tem o som dele: desce para a mais perto com espaço.
  assert.equal(y(100, 96), 136);
  // Sobre "m" não fica: vai para a seguinte.
  assert.equal(y(40, 96), 176);
  assert.equal(y(40, 136), 176);
  // O mouse pode escolher uma faixa de baixo.
  assert.equal(y(100, 176), 176);
  const sobe = M.dropBlock(q, "s", M.snap(q, "s", 240, 96, 16, { group: "v", mode: "audio" }));
  const g = M.groups(sobe)[0];
  assert.deepEqual(g.audios.map((a) => a.id).sort(), ["m", "s"]);
  assert.equal(g.bottom, 176);
});

test("todo elemento é magnético: encosta nas pontas dos outros", () => {
  const b = (id, x, y, dur = 2, kind = "audio") => ({ id, kind, name: id, src: id, dur, tin: 0, tout: dur, x, y, mute: false, vol: 1, tone: 1, audio: "none" });
  const q = { blocks: [b("v", 0, 0, 10, "image"), b("m", 0, 96), b("c", 40, -96, 2, "image"), b("s", 900, 900), b("n", 900, 1200, 2, "image"), b("l", 2000, 500), b("r", 2100, 900)], finals: [], edges: [] };
  const som = (x) => M.snap(q, "s", x, 96, 16, { group: "v", mode: "audio" });
  assert.deepEqual([som(90).x, som(90).y], [80, 96]);
  assert.equal(M.snap(q, "n", 130, -96, 16, { group: "v", mode: "cover" }).x, 120);
  const encosta = M.snap(q, "s", 2090, 510, 16);
  assert.deepEqual([encosta.x, encosta.y, encosta.mode], [2080, 500, null]);
  assert.equal(M.snap(q, "s", 2000, 700, 16).y, 700);
});

test("vídeo corre até o limite do bloco inteiro, contando o som que passou, e continua nele", () => {
  const b = (id, x, y, dur, kind) => ({ id, kind, name: id, src: id, dur, tin: 0, tout: dur, x, y, mute: false, vol: 1, tone: 1, audio: "none" });
  const q = { blocks: [b("v", 0, 0, 5, "image"), b("m", 100, 96, 10, "audio"), b("n", 900, 900, 2, "image")], finals: [], edges: [] };
  const keep = { group: "v", mode: "cover" };
  const s = M.snap(q, "n", 450, -96, 16, keep);
  assert.deepEqual([s.mode, s.x], ["cover", 450]);
  assert.equal(M.snap(q, "n", 510, -96, 16, keep).mode, "after");
  const o = M.dropBlock(q, "n", s);
  const g = M.groups(o).find((g) => g.id === "v");
  assert.deepEqual(g.covers.map((c) => c.id), ["n"]);
  assert.equal(g.w, 530);
});

test("som encostado no som que está no bloco expande o bloco, dos dois lados", () => {
  const b = (id, x, y, dur, kind = "audio") => ({ id, kind, name: id, src: id, dur, tin: 0, tout: dur, x, y, mute: false, vol: 1, tone: 1, audio: "none" });
  const q = { blocks: [b("v", 0, 0, 5, "image"), b("m", 100, 96, 5), b("s", 900, 900, 2)], finals: [], edges: [] };
  const direita = M.snap(q, "s", 310, 100, 16);
  assert.deepEqual([direita.x, direita.y], [300, 96]);
  assert.deepEqual([M.groups(M.dropBlock(q, "s", direita))[0].x, M.groups(M.dropBlock(q, "s", direita))[0].w], [0, 380]);
  const r = { ...q, blocks: q.blocks.map((o) => (o.id === "m" ? { ...o, x: -60 } : o)) };
  const esquerda = M.snap(r, "s", -150, 100, 16);
  assert.deepEqual([esquerda.x, esquerda.y], [-140, 96]);
  const g = M.groups(M.dropBlock(r, "s", esquerda))[0];
  assert.deepEqual([g.x, g.w, g.audios.length], [-140, 340, 2]);
  assert.equal(M.groups(M.dropBlock(q, "s", { x: 500, y: 96 })).length, 2);
});

test("cada tipo vai para a sua área, venha de onde vier", () => {
  const q = dois();
  const video = M.snap(q, "n", 100, 110, 16);
  assert.deepEqual([video.mode, video.y], ["after", 0]);
  const som = M.snap(q, "s", 100, -60, 16);
  assert.deepEqual([som.mode, som.y], ["audio", 96]);
});

test("quem está em cima leva o som para a área de som, depois dos somados", () => {
  const v = (id, x, y, audio = "linked", kind = "video") => ({ id, kind, name: id, src: id, dur: 5, tin: 0, tout: 5, x, y, mute: false, vol: 1, tone: 1, audio });
  const q = { blocks: [v("a", 0, 0), v("b", 200, 0), v("c1", 0, -M.VIS_H), v("c2", 100, -M.VIS_H), v("c3", 300, -M.VIS_H), v("som", 0, 136, undefined, "audio")], finals: [], edges: [] };
  const g = M.groups(q)[0];
  assert.deepEqual(g.covers.map((c) => c.id), ["c1", "c2", "c3"]);
  assert.deepEqual(g.coverSounds.map((s) => [s.block.id, s.y]), [["c1", 176], ["c2", 216], ["c3", 176]]);
  assert.equal(g.bottom, 256);
  const tl = M.timeline([g]);
  assert.ok(tl.items.filter((i) => i.layer === 1).every((i) => M.sounds(i.block)));
});

test("projeto antigo: a faixa de quem está em cima sai do meio e nada mais muda", () => {
  const v = (id, x, y) => ({ id, kind: "video", name: id, src: id, dur: 5, tin: 0, tout: 5, x, y, mute: false, vol: 1, tone: 1 });
  const q = { blocks: [v("a", 0, 0), v("c", 40, -136), v("solto", 0, 900)], finals: [], edges: [] };
  assert.deepEqual(M.groups(q).map((g) => g.covers.map((c) => c.id)), [["c"], []].sort((a, b) => b.length - a.length));
  const o = M.upgrade(q);
  assert.equal(o.blocks.find((b) => b.id === "c").y, -M.VIS_H);
  assert.equal(o.blocks.find((b) => b.id === "solto").y, 900);
  assert.deepEqual(M.groups(o).find((g) => g.id === "a").covers.map((c) => c.id), ["c"]);
  assert.deepEqual(M.upgrade(o).blocks, o.blocks);
});

test("o encaixe à direita é magnético", () => {
  const q = dois();
  assert.equal(M.snap(q, "n", 440, 0, 16).mode, "after");
  assert.equal(M.snap(q, "n", 440, 0, 16).x, 400);
  assert.equal(M.snap(q, "n", 460, 0, 16).mode, null);
});

test("o bloco segura o elemento numa área maior, sem piscar na borda", () => {
  const q = dois();
  assert.equal(M.snap(q, "n", 100, -96 - 50, 16).mode, null);
  assert.equal(M.snap(q, "n", 100, -96 - 50, 16, { group: "a" }).mode, "cover");
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

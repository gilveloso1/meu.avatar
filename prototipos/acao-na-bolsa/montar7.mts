import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { aplicar } from "/Users/user/Documents/GitHub/meu.avatar/src/comandos";
import { exportWork, groups, finalRate } from "/Users/user/Documents/GitHub/meu.avatar/src/canvas/modelo.js";
const A = "/private/tmp/claude-501/-Users-user-Documents-GitHub-meu-avatar/41c90abf-f300-4af1-91c5-351de817f2dc/scratchpad/abolsa";
const d = JSON.parse(readFileSync(A + "/data-v4.json", "utf8"));
const OVER = "/projetos/x/arquivos/over", MUS = "/projetos/x/arquivos/musica", MOTION = "/projetos/x/arquivos/motion";
const file = (src: string) => (src === OVER ? A + "/over.webm" : src === MUS ? A + "/trilha.m4a" : src === MOTION ? A + "/motion.mp4" : A + "/v/" + /videos\/(.+)$/.exec(src)![1]);
const ctx = {
  fonte: async (c: any) => (c.arquivo === "over" ? { src: OVER, kind: "video" as const, dur: 40.3, name: "Gráficos" } : { src: MUS, kind: "audio" as const, dur: 41, name: "Trilha" }),
  silencios: async () => null,
  rosto: async () => null,
};
const rate = finalRate(d.finals[0]);
// A camada e a trilha foram feitas no tempo final: cada grupo pega o pedaço dele, sem o Final acelerar de novo.
let t = 0;
const lista: any[] = [];
const ordem = groups(d).filter((g) => g.blocks.length).sort((a, b) => a.x - b.x);
for (const g of ordem) {
  const dur = g.dur / rate;
  const fim = t + dur;
  lista.push({ tipo: "adicionar", arquivo: "over", inicio: Math.min(t, 40.29 - dur), fim: Math.min(fim, 40.29), sobre: g.blocks[0]!.id, em: 0, semSom: true });
  lista.push({ tipo: "adicionar", arquivo: "musica", inicio: t, fim, sobre: g.blocks[0]!.id, em: 0 });
  t = fim;
}
const a = await aplicar(d, lista, ctx);
const por = a.criados.flatMap((id, i) => [{ tipo: "velocidade", bloco: id, velocidade: 1 / rate }, ...(i % 2 ? [{ tipo: "som", bloco: id, volume: 0.13 }] : [])]);
const r = await aplicar(a.project, por, ctx);
writeFileSync(A + "/data-v7.json", JSON.stringify(r.project, null, 1));
const work = exportWork(r.project, "final")!;
console.log(work.trechos.map((x) => x.duracao), work.trechos.map((x) => x.itens.filter((i) => i.camada === "cobertura").length));
const saidas: string[] = [];
const t0 = Date.now();
work.trechos.forEach((tr, i) => {
  const arquivos: string[] = [];
  const itens = tr.itens.map(({ src, ...item }) => { const f = file(src); if (!arquivos.includes(f)) arquivos.push(f); return { ...item, arquivo: arquivos.indexOf(f) }; });
  const plano = A + "/t8/p" + i + ".json";
  writeFileSync(plano, JSON.stringify({ largura: work.largura, altura: work.altura, duracao: tr.duracao, itens }));
  const saida = A + "/t8/t" + i + ".mkv";
  execFileSync("python3", ["container/exportar.py", "trecho", plano, saida, ...arquivos], { stdio: "inherit" });
  saidas.push(saida);
});
console.log("trechos s", (Date.now() - t0) / 1000);
execFileSync("python3", ["container/exportar.py", "emendar", A + "/acao-na-bolsa-v7.mp4", ...work.versoes[0]!.trechos.map((i) => saidas[i]!)], { stdio: "inherit" });
console.log("total s", (Date.now() - t0) / 1000);

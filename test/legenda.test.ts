import { describe, expect, it } from "vitest";
import type { Block, Group } from "../src/canvas/modelo.js";
import { ESTILO_PADRAO, falantes, html, noGrupo, trechos } from "../src/legenda";

const p = (palavra: string, inicio: number, fim: number) => ({ palavra, inicio, fim });
const bloco = (o: Partial<Block>): Block => ({ id: "b", kind: "video", name: "v", src: "/videos/x.mp4", dur: 10, tin: 0, tout: 10, x: 0, y: 0, mute: false, vol: 1, tone: 0, ...o });
const grupo = (blocks: Block[], extra: Partial<Group> = {}): Group => ({ id: blocks[0]!.id, x: blocks[0]!.x, y: 0, dur: 10, bottom: 0, label: "", blocks, covers: [], audios: [], ...extra });

describe("legenda", () => {
  it("leva as palavras para o tempo do grupo, com o corte e a velocidade do bloco", () => {
    // Segundo bloco: entra aos 2 s do grupo (80 px), usa de 1,5 s a 6 s do arquivo, em 2×.
    const a = bloco({ id: "a", tout: 2 });
    const b = bloco({ id: "b", x: 80, tin: 1.5, tout: 6, speed: 2 });
    const g = grupo([a, b]);
    const fala = [p("Oi,", 0.2, 0.5), p("é,", 1.6, 2), p("hoje", 2.5, 2.8), p("fora", 6.5, 7)];
    expect(noGrupo(g, b, fala)).toEqual([
      { palavra: "é,", bloco: "b", inicio: 2.05, fim: 2.25 },
      { palavra: "hoje", bloco: "b", inicio: 2.5, fim: 2.65 },
    ]);
  });

  it("só falam os blocos de vídeo da sequência com som, salvo pedido", () => {
    const a = bloco({ id: "a" });
    const mudo = bloco({ id: "m", mute: true, x: 400 });
    const g = grupo([a, mudo], { audios: [bloco({ id: "s", kind: "audio" })] });
    expect(falantes(g).map((b) => b.id)).toEqual(["a"]);
    expect(falantes(g, ["s"]).map((b) => b.id)).toEqual(["s"]);
  });

  it("quebra na pontuação e na pausa; palavra curta junta à anterior; some onde há texto", () => {
    const fala = [p("Sabe", 0, 0.3), p("qual", 0.3, 0.5), p("é", 0.5, 0.6), p("a", 0.62, 0.7), p("dica?", 0.7, 1), p("Vou", 1.6, 1.8), p("dar", 1.8, 2), p("uma", 2, 2.2), p("dica.", 2.2, 2.5), p("já", 2.55, 2.7)];
    expect(trechos(fala, [], 5).map((t) => [t.palavras.map((w) => w.palavra).join(" "), t.inicio, t.fim])).toEqual([
      ["Sabe qual é a", 0, 0.7],
      ["dica?", 0.7, 1.35],
      ["Vou dar uma dica. já", 1.6, 3.05],
    ]);
    // De 1,5 s a 2,1 s já há texto: "Vou" e "dar" saem, e o trecho antes acaba quando o texto entra.
    const sem = trechos(fala, [[1.5, 2.1]], 5);
    expect(sem.map((t) => t.palavras.map((w) => w.palavra).join(" "))).toEqual(["Sabe qual é a", "dica?", "uma dica. já"]);
    expect(sem[1]!.fim).toBe(1.35);
    expect(trechos([p("Oi", 0, 0.4), p("gente", 0.4, 0.8)], [[0.5, 3]], 5)[0]!.fim).toBe(0.5);
  });

  it("o HTML segue o tamanho do Final, escapa o texto e destaca a palavra dita", () => {
    const out = html(trechos([p("<b>Oi</b>", 0, 0.4), p("gente", 0.4, 0.8)], [], 2), ESTILO_PADRAO, 1080, 1920);
    expect(out).toContain("font-size:66px");
    expect(out).toContain("width:630px");
    expect(out).toContain("&lt;B&gt;OI&lt;/B&gt;");
    expect(out).not.toContain("<b>");
    expect(out).toContain(`tl.set("#w0_1",{color:"#46ff96"},0.4);`);
    expect(out).toContain(`tl.set("#w0_0",{color:"#ffffff"},0.4);`);
    expect(out).toContain(`tl.set("#c0",{autoAlpha:0},1.15);`);
  });
});

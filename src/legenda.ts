/**
 * Legenda palavra a palavra de um grupo (docs/api.md): as palavras da transcrição de cada bloco
 * vão para o tempo do grupo, viram blocos curtos de legenda e um HTML que o contêiner de render
 * (src/render.ts) transforma em WebM transparente. As regras padrão são as do caso real aprovado
 * em 01/11/2026 (prototipos/acao-na-bolsa/gerar.py): Inter Black, coluna central, a palavra dita
 * em destaque, e nada onde já há texto na tela.
 */
import { len, PX, sounds } from "./canvas/modelo.js";
import type { Block, Group } from "./canvas/modelo.js";
import type { Palavra } from "./transcricao";

/** Uma palavra no tempo do grupo, com o bloco de onde veio. */
export interface PalavraNoGrupo extends Palavra {
  bloco: string;
}

/** Um pedaço da legenda: as palavras que aparecem juntas e quando ele sai. */
export interface Trecho {
  palavras: Palavra[];
  inicio: number;
  fim: number;
}

export interface Estilo {
  fonte: string;
  /** Tamanho da letra numa tela de 720 de largura; cresce com o Final. */
  tamanho: number;
  cor: string;
  destaque: string;
  maiusculas: boolean;
  /** Onde fica o meio da legenda, de 0 (topo) a 1 (base). */
  altura: number;
}

export const ESTILO_PADRAO: Estilo = { fonte: "Inter", tamanho: 44, cor: "#ffffff", destaque: "#46ff96", maiusculas: true, altura: 0.8 };
/** A coluna da legenda numa tela de 720: no máximo duas linhas nesse tamanho. */
const COLUNA = 420;
const BASE = 720;
const PAUSA = 0.25;
const MAX_PALAVRAS = 4;
const MAX_LETRAS = 24;
/** Quanto a legenda fica depois da última palavra, se ninguém entrar antes. */
const SOBRA = 0.35;
const POP = 0.12;

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Os blocos que falam no grupo: os de vídeo da sequência com som, ou os pedidos. */
export function falantes(g: Group, ids?: string[]): Block[] {
  const todos = [...g.blocks, ...g.covers, ...g.audios];
  if (ids) return todos.filter((b) => ids.includes(b.id) && b.kind !== "image");
  return g.blocks.filter((b) => b.kind === "video" && sounds(b));
}

/** As palavras do trecho que o bloco usa, no tempo do grupo (o corte e a velocidade do bloco valem). */
export function noGrupo(g: Group, b: Block, palavras: Palavra[]): PalavraNoGrupo[] {
  const entra = (b.x - g.x) / PX;
  const vel = b.speed ?? 1;
  const fim = entra + len(b);
  return palavras
    .filter((p) => (p.inicio + p.fim) / 2 >= b.tin && (p.inicio + p.fim) / 2 < b.tout)
    .map((p) => ({ palavra: p.palavra, bloco: b.id, inicio: r3(entra + (Math.max(p.inicio, b.tin) - b.tin) / vel), fim: r3(Math.min(fim, entra + (Math.min(p.fim, b.tout) - b.tin) / vel)) }));
}

/**
 * Os pedaços da legenda: quebra na pontuação, numa pausa, com 4 palavras ou 24 letras; palavra
 * curta sozinha entra na anterior. Some onde já há texto (semTexto, em segundos do grupo).
 */
export function trechos(palavras: Palavra[], semTexto: number[][], duracao: number): Trecho[] {
  const dentro = (t: number) => semTexto.some(([a, b]) => t > a! && t < b!);
  const fala = [...palavras].sort((a, b) => a.inicio - b.inicio).filter((p) => !dentro((p.inicio + p.fim) / 2));
  const grupos: Palavra[][] = [];
  let atual: Palavra[] = [];
  fala.forEach((p, i) => {
    atual.push(p);
    const prox = fala[i + 1];
    const texto = atual.map((w) => w.palavra).join(" ");
    if (!prox || /[.,?!:;]$/.test(p.palavra) || prox.inicio - p.fim > PAUSA || atual.length >= MAX_PALAVRAS || texto.length + prox.palavra.length > MAX_LETRAS) {
      grupos.push(atual);
      atual = [];
    }
  });
  for (let n = grupos.length - 1; n > 0; n--) {
    const g = grupos[n]!;
    if (g.length === 1 && g[0]!.palavra.length <= 3 && g[0]!.inicio - grupos[n - 1]!.at(-1)!.fim < 0.3) grupos[n - 1]!.push(...grupos.splice(n, 1)[0]!);
  }
  return grupos.map((g, n) => {
    const inicio = g[0]!.inicio;
    const proximo = grupos[n + 1]?.[0]!.inicio ?? duracao;
    const texto = semTexto.map(([a]) => a!).filter((a) => a > inicio);
    return { palavras: g, inicio, fim: r3(Math.min(proximo, g.at(-1)!.fim + SOBRA, duracao, ...texto)) };
  });
}

const escapa = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** O conteúdo que vai ao render: a página, o tamanho e a linha do tempo `tl` já existem lá. */
export function html(ts: Trecho[], estilo: Estilo, largura: number, altura: number): string {
  const k = largura / BASE;
  const coluna = Math.min(largura - 32, Math.round(COLUNA * k));
  const fonte = Math.round(estilo.tamanho * k);
  const contorno = Math.max(2, Math.round(3 * k));
  const css = `<style>
.cap{position:absolute;left:${Math.round((largura - coluna) / 2)}px;width:${coluna}px;top:${Math.round(estilo.altura * altura)}px;transform:translateY(-50%);text-align:center;font-family:"${estilo.fonte}",sans-serif;font-size:${fonte}px;font-weight:900;line-height:1.14;letter-spacing:-.3px;text-wrap:balance;color:${estilo.cor};visibility:hidden;text-shadow:0 0 ${Math.round(8 * k)}px #000,0 ${contorno}px 0 #000,${contorno}px 0 0 #000,-${contorno}px 0 0 #000,0 -${contorno}px 0 #000}
</style>`;
  const divs = ts.map((t, n) => `<div class="cap" id="c${n}">${t.palavras.map((p, i) => `<span id="w${n}_${i}">${escapa(estilo.maiusculas ? p.palavra.toLocaleUpperCase("pt-BR") : p.palavra)}</span>`).join(" ")}</div>`);
  const js = ts.flatMap((t, n) => [
    `tl.set("#c${n}",{autoAlpha:1},${t.inicio});`,
    `tl.fromTo("#c${n}",{scale:.88},{scale:1,duration:${POP},ease:"back.out(3)",immediateRender:false},${t.inicio});`,
    `tl.set("#c${n}",{autoAlpha:0},${t.fim});`,
    ...t.palavras.flatMap((p, i) => [`tl.set("#w${n}_${i}",{color:${JSON.stringify(estilo.destaque)}},${p.inicio});`, ...(t.palavras[i + 1] ? [`tl.set("#w${n}_${i}",{color:${JSON.stringify(estilo.cor)}},${t.palavras[i + 1]!.inicio});`] : [])]),
  ]);
  return `${css}\n${divs.join("\n")}\n<script>\n${js.join("\n")}\n</script>`;
}

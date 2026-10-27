/**
 * Edição rápida: o plano que o contêiner segue (container/editar.py) e as
 * opções da prévia. A prévia no navegador acha os silêncios no áudio, monta
 * os trechos com as mesmas regras do editar.py e manda a lista pronta: o
 * vídeo final sai igual ao que a pessoa viu. Sem a lista (o navegador não
 * conseguiu ler o áudio), o contêiner acha os silêncios sozinho.
 *
 * As regras de silêncio e de enquadramento estão aqui e no editar.py; mudou
 * uma, mude a outra.
 */
import { InputError, type Option } from "./structures/types";

/**
 * Pausas: o tamanho de referência da pausa que sobra num corte, em segundos.
 * Cada pausa varia em volta dele (planParts): as que eram maiores no original
 * e as que ficam em volta de falas curtas sobram mais longas.
 */
export const PAUSES: (Option & { pause: number })[] = [
  { value: "curta", label: "Curtas", pause: 0.1, description: "Ritmo rápido, de Reels e TikTok. As pausas que eram maiores e as em volta de falas curtas ficam um pouco mais longas." },
  { value: "media", label: "Médias", pause: 0.2, description: "Respiro curto entre as frases. As pausas seguem o ritmo da fala: o fim de uma ideia respira mais que uma vírgula." },
  { value: "longa", label: "Longas", pause: 0.35, description: "Só encurta as pausas grandes. A fala fica mais calma." },
];

/** Câmera: os enquadramentos, em ordem, um a cada corte (1 é o quadro todo; "Close" alterna zoom e close). */
export const CAMERAS: (Option & { zooms: number[] })[] = [
  { value: "parada", label: "Parada", zooms: [1], description: "Sem zoom: só tira as pausas. Nos cortes, a pessoa pode dar um pulinho na tela." },
  { value: "zoom", label: "Zoom", zooms: [1, 1.25], description: "Em alguns cortes, alterna entre o quadro inteiro e um pouco mais perto, no máximo a cada 2,5 s. Parece troca de câmera." },
  { value: "close", label: "Close", zooms: [1, 1.25, 1, 1.5], description: "Como o Zoom, mas de vez em quando chega bem perto do rosto. O mais dinâmico." },
];

export const DEFAULT_PAUSE = "media";
export const DEFAULT_CAMERA = "close";

/** As regras da prévia, iguais às do editar.py. */
export const RULES = {
  /** Silêncio: abaixo disso (dBFS) por pelo menos `minSilence` segundos. */
  noiseDb: -35,
  minSilence: 0.25,
  /** Menos que isso entre dois silêncios é estalo ou respiração, não fala. */
  minSpeech: 0.15,
  /** Trecho mais curto que isso entra no anterior (não vale um corte). */
  minPart: 0.6,
  /** Pausa que sobra: entre metade e 2,5 vezes a de referência, nunca mais que a original. */
  minPause: 0.5,
  maxPause: 2.5,
  /** Fala mais curta que isso de um dos lados ganha pausa extra (até mais uma de referência). */
  shortBlock: 1.2,
  /** Cortar menos que isso não vale: a pausa fica inteira e não há corte. */
  minCut: 0.08,
  /** Da pausa que sobra, esta parte fica depois da fala; o resto, antes da seguinte. */
  tail: 0.6,
  /** A câmera só muda de enquadramento depois de pelo menos isso no mesmo (s). */
  minShot: 2.5,
  /**
   * Sem rosto achado: onde os olhos costumam ficar (fração do quadro). O zoom
   * amplia em torno do ponto entre os olhos: ele fica no mesmo lugar da tela
   * no aberto e com zoom, e a linha dos olhos não pula no corte.
   */
  eyesX: 0.5,
  eyesY: 0.22,
};

/** Um trecho do vídeo final: começo e fim no original (s) e o zoom. */
export type Part = [number, number, number];

/**
 * Ritmo orgânico: dos silêncios do áudio aos trechos do vídeo final, com o
 * zoom de cada um. A página roda esta mesma função na prévia (o código vai no
 * script dela, por isso não usa nada de fora); o editar.py tem uma cópia.
 *
 * - Cada pausa que sobra segue a original, comprimida pela raiz: a pausa de
 *   fim de ideia continua maior que a de vírgula, mas todas encurtam.
 * - Fala curta de um dos lados (abaixo de `shortBlock`) ganha pausa extra:
 *   blocos curtos não ficam espremidos um no outro.
 * - Se quase nada sairia (menos que `minCut`), não corta: a pausa fica inteira.
 * - A câmera só muda de enquadramento depois de `minShot` segundos no mesmo;
 *   os outros cortes ficam no enquadramento de antes.
 */
export function planParts(silences: number[][], duration: number, pause: number, zooms: number[], r: typeof RULES): Part[] {
  const blocks: number[][] = [];
  let end = 0;
  for (const [a, b] of silences) {
    if (a - end > r.minSpeech) blocks.push([end, a]);
    end = b;
  }
  if (duration - end > r.minSpeech) blocks.push([end, duration]);
  if (!blocks.length) return [];
  const gaps = blocks.slice(1).map((b, i) => b[0] - blocks[i]![1]!);
  const sorted = gaps.slice().sort((x, y) => x - y);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 1;
  const keep = gaps.map((g, i) => {
    const short = Math.min(blocks[i]![1]! - blocks[i]![0]!, blocks[i + 1]![1]! - blocks[i + 1]![0]!);
    let p = pause * Math.sqrt(g / median);
    if (short < r.shortBlock) p += (pause * (r.shortBlock - short)) / r.shortBlock;
    return Math.min(g, Math.max(pause * r.minPause, Math.min(pause * r.maxPause, p)));
  });
  const cuts: number[][] = [];
  let from = Math.max(0, blocks[0]![0]! - pause * (1 - r.tail));
  for (let i = 0; i < blocks.length; i++) {
    if (i === blocks.length - 1) {
      cuts.push([from, Math.min(duration, blocks[i]![1]! + pause * r.tail)]);
    } else if (gaps[i]! - keep[i]! >= r.minCut) {
      cuts.push([from, blocks[i]![1]! + keep[i]! * r.tail]);
      from = blocks[i + 1]![0]! - keep[i]! * (1 - r.tail);
    }
  }
  const merged: number[][] = [];
  for (const c of cuts) {
    const last = merged[merged.length - 1];
    if (last && c[1]! - c[0]! < r.minPart) last[1] = c[1]!;
    else merged.push([c[0]!, c[1]!]);
  }
  const parts: Part[] = [];
  let shot = 0;
  let since = 0;
  merged.forEach((c, k) => {
    if (k > 0 && since >= r.minShot) {
      shot++;
      since = 0;
    }
    parts.push([Math.round(c[0]! * 1000) / 1000, Math.round(c[1]! * 1000) / 1000, zooms[shot % zooms.length]!]);
    since += c[1]! - c[0]!;
  });
  return parts;
}

export interface EditPlan {
  pause: string;
  camera: string;
  /** Os trechos da prévia; null para o contêiner achar os silêncios. */
  parts: Part[] | null;
}

export const MAX_PARTS = 200;
const ZOOMS = new Set(CAMERAS.flatMap((c) => c.zooms));

/** Lê e confere o plano que veio do formulário; lança InputError. */
export function parsePlan(pause: string, camera: string, parts: string): EditPlan {
  if (!PAUSES.some((p) => p.value === pause)) throw new InputError("Escolha o tamanho das pausas.");
  if (!CAMERAS.some((c) => c.value === camera)) throw new InputError("Escolha a câmera.");
  if (!parts.trim()) return { pause, camera, parts: null };
  let list: unknown;
  try {
    list = JSON.parse(parts);
  } catch {
    throw new InputError("Os cortes da prévia vieram ilegíveis.");
  }
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_PARTS) throw new InputError("Os cortes da prévia vieram ilegíveis.");
  let end = 0;
  for (const p of list) {
    const ok =
      Array.isArray(p) &&
      p.length === 3 &&
      p.every((n) => typeof n === "number" && Number.isFinite(n)) &&
      p[0] >= end &&
      p[1] > p[0] &&
      p[1] <= 3600 &&
      ZOOMS.has(p[2]);
    if (!ok) throw new InputError("Os cortes da prévia vieram ilegíveis.");
    end = p[1];
  }
  return { pause, camera, parts: list as Part[] };
}

/** O que vai para o contêiner (cabeçalho x-plano do POST /editar). */
export function containerPlan(
  plan: EditPlan,
  face: { x: number; y: number } | null = null,
): { pausa: number; zooms: number[]; trechos?: Part[]; rosto?: { x: number; y: number } } {
  const pause = PAUSES.find((p) => p.value === plan.pause)?.pause ?? 0.2;
  const zooms = CAMERAS.find((c) => c.value === plan.camera)?.zooms ?? [1];
  return { pausa: pause, zooms, ...(plan.parts ? { trechos: plan.parts } : {}), ...(face ? { rosto: face } : {}) };
}

/** O rosto guardado no vídeo (coluna face), se tem centro; senão null. */
export function storedFace(json: string | null): { x: number; y: number } | null {
  try {
    const f = json ? (JSON.parse(json) as { x?: unknown; y?: unknown }) : null;
    return f && typeof f.x === "number" && typeof f.y === "number" ? { x: f.x, y: f.y } : null;
  } catch {
    return null;
  }
}

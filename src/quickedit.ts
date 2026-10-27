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

/** Pausas: quanto sobra de cada lado de um corte, em segundos. */
export const PAUSES: (Option & { pad: number })[] = [
  { value: "curta", label: "Curtas", pad: 0.04 },
  { value: "media", label: "Médias", pad: 0.08 },
  { value: "longa", label: "Longas", pad: 0.15 },
];

/** Câmera: os enquadramentos, em ordem, um a cada corte (1 é o quadro todo; "Close" alterna zoom e close). */
export const CAMERAS: (Option & { zooms: number[] })[] = [
  { value: "parada", label: "Parada", zooms: [1] },
  { value: "zoom", label: "Zoom", zooms: [1, 1.25] },
  { value: "close", label: "Close", zooms: [1, 1.25, 1, 1.5] },
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
  /** Altura do rosto no quadro (fração) e onde ele fica no quadro com zoom. */
  faceY: 0.25,
  faceInFrame: 1 / 3,
};

/** Um trecho do vídeo final: começo e fim no original (s) e o zoom. */
export type Part = [number, number, number];

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
export function containerPlan(plan: EditPlan): { folga: number; zooms: number[]; trechos?: Part[] } {
  const pad = PAUSES.find((p) => p.value === plan.pause)?.pad ?? 0.08;
  const zooms = CAMERAS.find((c) => c.value === plan.camera)?.zooms ?? [1];
  return plan.parts ? { folga: pad, zooms, trechos: plan.parts } : { folga: pad, zooms };
}

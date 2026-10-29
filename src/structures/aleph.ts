/**
 * Runway Aleph 2 (runway/aleph-2), troca de avatar: o mesmo vídeo com a pessoa
 * da foto no lugar, mantendo cena, gestos e o áudio original. Receita do
 * terceiro teste (docs/modelos/runway-aleph-2.md), que o pedido não faz
 * sozinho: o vídeo entra na fila de preparo (Studio.prepareNext), que
 *
 *   1. corta as faixas pretas e amplia o vídeo até 1080p no contêiner
 *      (container/aleph.py): quanto maior o rosto, mais firme a troca;
 *   2. tira 5 quadros e troca o rosto em cada um com um modelo de imagem
 *      (FACE_MODEL), com a foto inteira e o recorte do rosto como referência;
 *   3. confere com um modelo de visão (CHECK_MODEL) se o fundo do quadro ficou
 *      igual ao original: o modelo de imagem às vezes redesenha a parede, e o
 *      Aleph faz o objeto inventado andar. Reprovado, refaz uma vez; de novo
 *      reprovado, o quadro fica de fora;
 *   4. pede ao Aleph 2 com o vídeo preparado e os quadros que passaram como
 *      quadros-chave (provider.options.runway.keyframes).
 *
 * O Aleph cobra por segundo (US$ 0,28) e mantém o áudio do vídeo. Não aceita
 * foto de referência solta nem `aspect_ratio` (que expande o quadro).
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { WORDS_PER_SECOND } from "../prompt";
import { InputError, type Option, type Structure } from "./types";

export const MAX_ALEPH_EXTRA = 400;
/** Duração aceita no vídeo de origem (segundos). */
export const ALEPH_SECONDS = { min: 2, max: 30 };
/** Quantos quadros-chave (o Aleph aceita até 5). */
export const KEYFRAMES = 5;
/** Modelo que troca o rosto nos quadros (pelo chat: 768 px no lado menor; maior não ajudou). */
export const FACE_MODEL = "google/gemini-nano-banana-2.1";
/** Custo de uma troca de rosto, para a estimativa (o real vem do OpenRouter). */
export const FACE_COST = 0.04;
/** Modelo de visão que confere o fundo de cada quadro. */
export const CHECK_MODEL = "anthropic/claude-haiku-5.5";
/** Tentativas por quadro (a primeira e uma refeita). */
export const FACE_TRIES = 2;
/** O maior vídeo que o Aleph aceita. */
export const MAX_PREPARED_BYTES = 16 * 1024 * 1024;

export const USES: Option[] = [{ value: "trocar-avatar", label: "Trocar avatar", description: "Troca a pessoa do vídeo pela da foto." }];

/** O prompt do Aleph: curto, como pede o guia da Runway; as instruções extras entram depois. */
export function alephPrompt(extra: string): string {
  return [
    "Replace the person with the person from the keyframes. Their face, hair and skin stay identical to the keyframes in every frame.",
    "Keep the scene, objects, caption, gestures, lip movements and timing unchanged.",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

/** O pedido ao modelo de imagem: o quadro, a foto inteira e (se houver) o recorte do rosto. */
export function facePrompt(withCrop: boolean): string {
  return [
    `Image 1 is a frame from a video. ${withCrop ? "Images 2 and 3 show one person: a full photo and a close-up of the face." : "Image 2 shows another person."}`,
    `Replace the person in image 1 with this person. The face must be identical to ${withCrop ? "images 2 and 3" : "image 2"}, sharp and detailed: the same eye shape and color, eyebrows, nose, lips, jawline, skin tone and hair.`,
    "Keep everything else in image 1 exactly the same: head angle, pose, hand position, expression, mouth opening, clothing, objects (anything in front of the face stays in front of it), caption text, background, lighting, framing and format.",
  ].join(" ");
}

/** O pedido ao modelo de visão; só "fundo" reprova (nos testes, mãos e objetos davam alarme falso). */
export const CHECK_PROMPT = `Image 1 is a frame from a video. Image 2 should be the same frame with only the person's face and hair replaced by another person's. Check, one by one:
1. "fundo": compare the background region by region (walls, doors, shelves, lamps, furniture, things on the walls). Is anything there added, removed or moved in image 2?
2. "objetos": compare each product and object (bottles, jars, anything held in the hands). Is any of them in a clearly different place, at a different height, removed or added?
3. "maos": are the hands in a clearly different place or gesture (not just small differences in finger detail)?
Ignore the face, hair, skin tone, sharpness, lighting and color. Answer only JSON: {"fundo": true|false, "objetos": true|false, "maos": true|false, "detalhes": "..."} where true means changed.`;

/** A resposta do modelo de visão; null se não veio o JSON esperado. */
export function parseCheck(text: string): { fundo: boolean; objetos: boolean; maos: boolean; detalhes: string } | null {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) return null;
  try {
    const r = JSON.parse(json) as Record<string, unknown>;
    if (typeof r.fundo !== "boolean") return null;
    return { fundo: r.fundo, objetos: r.objetos === true, maos: r.maos === true, detalhes: typeof r.detalhes === "string" ? r.detalhes : "" };
  } catch {
    return null;
  }
}

/**
 * Os instantes dos quadros-chave, espalhados do começo ao fim. O último vai no
 * máximo na duração em segundos inteiros (o Aleph recusa além: "at most 5" num
 * vídeo de 5,5 s).
 */
export function keyframeTimes(seconds: number, count = KEYFRAMES): number[] {
  const last = Math.max(0, Math.floor(seconds));
  return Array.from({ length: count }, (_, i) => Math.round(((last * i) / (count - 1)) * 100) / 100);
}

/** O formato do vídeo preparado: o nome comum mais perto, ou a conta exata. */
export function aspectLabel(width: number, height: number): string {
  const ratio = width / height;
  const known = ["9:16", "16:9", "1:1", "4:5", "3:4", "4:3", "2:3", "3:2", "21:9", "9:21"];
  const near = known.find((k) => {
    const [w, h] = k.split(":").map(Number) as [number, number];
    return Math.abs(w / h - ratio) / ratio < 0.03;
  });
  return near ?? `${width}:${height}`;
}

export const ALEPH: Structure = {
  id: "aleph",
  name: "Aleph 2",
  model: "runway/aleph-2",
  summary: "Troca a pessoa de um vídeo pela da foto, mantendo cena, gestos e a voz original.",
  icon: "switch_account",
  access: "admin",
  // O Aleph devolve o áudio do vídeo de origem, sem mudança.
  treatAudio: false,
  quickEdit: true,
  wordsPerSecond: WORDS_PER_SECOND,
  cost: { sku: "segundo", seconds: { video: "video" }, extra: KEYFRAMES * FACE_COST },

  sections() {
    return [
      { title: "Uso", lead: true, fields: [{ kind: "select", name: "uso", label: "Uso", options: USES, value: USES[0]!.value }] },
      {
        title: "Origem",
        fields: [
          { kind: "video", name: "video", label: "Vídeo de origem", supporting: `MP4 ou MOV, de ${ALEPH_SECONDS.min} a ${ALEPH_SECONDS.max} s.` },
          { kind: "image", name: "imagem", label: "Foto do avatar", required: true, supporting: "A pessoa que entra no vídeo." },
        ],
      },
      {
        title: "Troca",
        fields: [
          {
            kind: "text",
            name: "instrucoes",
            label: "Instruções extras",
            maxLength: MAX_ALEPH_EXTRA,
            placeholder: "Ex.: mantém os óculos",
            supporting: "Opcional: algo a mais sobre a troca.",
          },
        ],
      },
    ];
  },

  prices(model: VideoModel): Record<string, string> {
    // O preço vem em centavos por segundo (`cents_per_second_output`).
    const cents = Number(model.pricing_skus?.cents_per_second_output);
    return cents ? { segundo: String(cents / 100) } : {};
  },

  build(values, hasImage, _model, video) {
    const use = USES.find((u) => u.value === values("uso"));
    if (!use) throw new InputError(ERROS.uso);
    if (!video) throw new InputError(ERROS.videoOrigem);
    if (video.seconds < ALEPH_SECONDS.min || video.seconds > ALEPH_SECONDS.max + 0.5) throw new InputError(ERROS.videoDuracao(ALEPH_SECONDS.min, ALEPH_SECONDS.max));
    if (!hasImage) throw new InputError(ERROS.foto);
    const extra = values("instrucoes").replace(/\s+/g, " ").trim();
    if (extra.length > MAX_ALEPH_EXTRA) throw new InputError(ERROS.instrucoesLongas(MAX_ALEPH_EXTRA));

    const prompt = alephPrompt(extra);
    return {
      request: { prompt },
      image: "reference",
      video: true,
      prepare: true,
      record: {
        prompt: extra,
        duration: Math.round(video.seconds),
        // Resolução e formato de verdade só depois do preparo (seguem o vídeo).
        resolution: "1080p",
        aspect_ratio: "9:16",
        request_prompt: prompt,
        style: null,
        language: null,
        extra: extra || null,
        settings: { use: use.value, source_seconds: video.seconds.toFixed(1) },
      },
    };
  },

  details(video) {
    let settings: Record<string, string> = {};
    try {
      settings = JSON.parse(video.settings ?? "{}");
    } catch {
      // Configurações ilegíveis: mostra só o que der.
    }
    return [
      { term: "Uso", description: USES.find((u) => u.value === settings.use)?.label ?? "—" },
      { term: "Vídeo de origem", description: settings.source_seconds ? `${settings.source_seconds.replace(".", ",")} s` : "—" },
      { term: "Quadros-chave", description: settings.keyframes ? `${settings.keyframes} de ${KEYFRAMES}` : "—" },
      { term: "Instruções extras", description: video.extra ?? "—" },
    ];
  },
};

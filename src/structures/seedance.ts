/**
 * Seedance 2.0 (bytedance/seedance-2.0). O campo "Uso" escolhe o que fazer com
 * o modelo; hoje há um só, a troca de avatar: recebe um vídeo pronto e a foto
 * de outra pessoa e devolve o mesmo vídeo com a pessoa da foto no lugar,
 * mantendo cena, câmera, gestos e fala. Um uso novo é uma opção nova em USES,
 * com os seus campos e o seu prompt.
 *
 * Pedido pelo OpenRouter (conferido em 28/10/2026): o vídeo e a foto vão em
 * `input_references` (`video_url` e `image_url`); só o Seedance 2 em diante
 * usa referência de vídeo. No prompt, eles são "video 1" e "image 1". O vídeo
 * de referência tem de 2 a 15 s; a duração pedida segue a dele.
 *
 * Em teste: o áudio é o que o modelo gerar (o prompt pede a mesma fala). Se a
 * voz mudar, o próximo passo é o contêiner pôr de volta o áudio original.
 *
 * Custo: o Seedance cobra por tokens de vídeo, (altura × largura × segundos ×
 * 24) / 1024, num preço menor quando há vídeo na entrada. A estimativa conta
 * os segundos do vídeo enviado junto com os do gerado; o custo real vem do
 * OpenRouter quando o vídeo fica pronto.
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { WORDS_PER_SECOND } from "../prompt";
import { InputError, type Option, type Structure } from "./types";
import { options } from "./wan";

export const MAX_SWAP_EXTRA = 500;
/** Duração aceita no vídeo de referência (segundos). */
export const SOURCE_SECONDS = { min: 2, max: 15 };

/** O que fazer com o modelo. */
export const USES: Option[] = [{ value: "trocar-avatar", label: "Trocar avatar", description: "Troca a pessoa do vídeo pela da foto." }];

/** De onde vem a roupa: do vídeo (só o rosto e o corpo mudam) ou da foto. */
export const OUTFITS: Option[] = [
  { value: "video", label: "Do vídeo" },
  { value: "foto", label: "Da foto" },
];

/** O prompt de sistema da troca de avatar; as instruções extras entram depois. */
export function swapPrompt(outfit: string, extra: string): string {
  const clothes = outfit === "foto" ? "Dress them in the clothes from image 1." : "Keep the clothes from video 1.";
  return [
    "Replace the person in video 1 with the person from image 1: the same face, hair, skin tone and body as image 1.",
    clothes,
    "Keep everything else from video 1 exactly the same: scene, background, lighting, framing, camera movement, gestures, facial expressions and timing.",
    "Keep the same speech as video 1: the same words, voice, tone and pace, with the lips in sync.",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export const SEEDANCE: Structure = {
  id: "seedance",
  name: "Seedance 2.0",
  model: "bytedance/seedance-2.0",
  summary: "Vários usos a partir de vídeos e fotos de referência. Hoje: trocar o avatar de um vídeo.",
  icon: "switch_account",
  access: "admin",
  // Em teste: ouvir antes de decidir se a voz passa pelo contêiner.
  treatAudio: false,
  quickEdit: true,
  wordsPerSecond: WORDS_PER_SECOND,
  cost: { sku: "{resolucao}_{formato}", seconds: { video: "video" } },

  sections(model: VideoModel | null, d) {
    const resolutions = model?.supported_resolutions ?? ["720p"];
    const ratios = model?.supported_aspect_ratios ?? [d.aspectRatio];
    return [
      {
        title: "Uso",
        lead: true,
        fields: [{ kind: "select", name: "uso", label: "Uso", options: USES, value: USES[0]!.value }],
      },
      {
        title: "Origem",
        fields: [
          { kind: "video", name: "video", label: "Vídeo de origem", supporting: `MP4 ou MOV, de ${SOURCE_SECONDS.min} a ${SOURCE_SECONDS.max} s.` },
          { kind: "image", name: "imagem", label: "Foto do avatar", required: true, supporting: "A pessoa que entra no vídeo." },
        ],
      },
      {
        title: "Troca",
        fields: [
          { kind: "segmented", name: "roupa", label: "Roupa", options: OUTFITS, value: "video" },
          {
            kind: "text",
            name: "instrucoes",
            label: "Instruções extras",
            maxLength: MAX_SWAP_EXTRA,
            placeholder: "Ex.: mantém os óculos",
            supporting: "Opcional: algo a mais sobre a troca.",
          },
        ],
      },
      {
        title: "Vídeo",
        fields: [
          { kind: "segmented", name: "resolucao", label: "Resolução", options: options(resolutions), value: resolutions.includes("720p") ? "720p" : resolutions[0]! },
          // Sete formatos não cabem num botão segmentado: vai como lista.
          { kind: "select", name: "formato", label: "Formato", options: options(ratios), value: ratios.includes(d.aspectRatio) ? d.aspectRatio : ratios[0]!, supporting: "Use o mesmo formato do vídeo de origem." },
        ],
      },
    ];
  },

  prices(model) {
    const out: Record<string, string> = {};
    for (const resolution of model.supported_resolutions ?? []) {
      const token = Number(model.pricing_skus?.[tokenSku(resolution)] ?? model.pricing_skus?.video_tokens);
      if (!token) continue;
      for (const ratio of model.supported_aspect_ratios ?? []) {
        const pixels = framePixels(model, resolution, ratio);
        // Por segundo gerado: os tokens dele e os do mesmo segundo do vídeo enviado.
        if (pixels) out[`${resolution}_${ratio}`] = String(((pixels * 24) / 1024) * token * 2);
      }
    }
    return out;
  },

  build(values, hasImage, model, video) {
    const use = USES.find((u) => u.value === values("uso"));
    if (!use) throw new InputError(ERROS.uso);
    if (!video) throw new InputError(ERROS.videoOrigem);
    if (video.seconds < SOURCE_SECONDS.min || video.seconds > SOURCE_SECONDS.max + 0.5) throw new InputError(ERROS.videoDuracao(SOURCE_SECONDS.min, SOURCE_SECONDS.max));
    if (!hasImage) throw new InputError(ERROS.foto);
    const outfit = OUTFITS.find((o) => o.value === values("roupa"));
    if (!outfit) throw new InputError(ERROS.roupa);
    const extra = values("instrucoes").replace(/\s+/g, " ").trim();
    if (extra.length > MAX_SWAP_EXTRA) throw new InputError(ERROS.instrucoesLongas(MAX_SWAP_EXTRA));

    const duration = outputSeconds(video.seconds, model.supported_durations);
    const resolution = values("resolucao");
    const aspectRatio = values("formato");
    const prompt = swapPrompt(outfit.value, extra);
    return {
      request: { prompt, duration, resolution, aspect_ratio: aspectRatio, generate_audio: true },
      image: "reference",
      video: true,
      record: {
        // Não há fala escrita: o texto do vídeo é o que foi pedido a mais.
        prompt: extra,
        duration,
        resolution,
        aspect_ratio: aspectRatio,
        request_prompt: prompt,
        style: null,
        language: null,
        extra: extra || null,
        settings: { use: use.value, outfit: outfit.value, source_seconds: video.seconds.toFixed(1) },
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
      { term: "Roupa", description: OUTFITS.find((o) => o.value === settings.outfit)?.label ?? "—" },
      { term: "Instruções extras", description: video.extra ?? "—" },
    ];
  },
};

/** A duração aceita pelo modelo mais perto da do vídeo enviado. */
export function outputSeconds(seconds: number, supported: number[] | null): number {
  const rounded = Math.round(seconds);
  if (!supported?.length) return rounded;
  return supported.reduce((best, s) => (Math.abs(s - rounded) < Math.abs(best - rounded) ? s : best));
}

/** O preço do token com vídeo na entrada, por resolução. */
function tokenSku(resolution: string): string {
  if (resolution === "1080p") return "video_tokens_1080p_with_video_input";
  if (resolution === "4K") return "video_tokens_4k_with_video_input";
  return "video_tokens_with_video_input";
}

/** Pixels de um quadro: o tamanho exato da lista do modelo ou, sem ele, a conta pelo lado menor. */
export function framePixels(model: VideoModel, resolution: string, ratio: string): number | undefined {
  const short = resolution === "4K" ? 2160 : resolution === "2K" ? 1440 : Number.parseInt(resolution, 10);
  const [w, h] = ratio.split(":").map(Number) as [number, number];
  if (!short || !w || !h) return undefined;
  const size = (model.supported_sizes ?? [])
    .map((s) => s.split("x").map(Number) as [number, number])
    .find(([sw, sh]) => Math.min(sw, sh) === short && Math.abs(sw / sh - w / h) < 0.03);
  if (size) return size[0] * size[1];
  return Math.round(short * short * (Math.max(w, h) / Math.min(w, h)));
}

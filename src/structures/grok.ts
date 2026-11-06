/**
 * Grok Imagine Video 1.5 Lite (x-ai/grok-imagine-video-1.5-lite): anima a foto
 * do avatar com o movimento descrito, sem fala. Serve para as cenas em que o
 * avatar só reage, que o HeyGen não faz (ele sempre fala o que recebe). Testes e
 * custo em docs/modelos/grok-imagine-video-1.5-lite.md.
 *
 * Pedido pelo OpenRouter (conferido em 06/11/2026): a foto vai como primeiro
 * quadro (`frame_images`), a duração de 1 a 15 s. Mesmo com `generate_audio:
 * false` o vídeo vem com uma faixa de som (ambiente ou quase silêncio).
 *
 * Custo: em centavos por segundo, por resolução (`cents_per_video_output_second_<r>`),
 * mais centavos pela foto (`cents_per_image_input`); `prices` converte para dólar.
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { WORDS_PER_SECOND } from "../prompt";
import { InputError, type Structure } from "./types";
import { options } from "./wan";

export const MAX_GROK_MOTION = 1000;

/**
 * O prompt de sistema: a pessoa não fala e a cena fica a da foto. O movimento
 * escrito no formulário vem antes dele.
 */
export const GROK_GUIDE =
  "The person does not speak: lips stay closed, no dialogue. Keep the same face, hair, clothes, scene and lighting as the first frame. No camera cuts, no text on screen.";

/** Duração padrão: a da configuração, se o modelo aceitar; senão 6 s, ou a primeira aceita. */
function defaultDuration(durations: number[], preferred: number): number {
  return durations.includes(preferred) ? preferred : durations.includes(6) ? 6 : durations[0]!;
}

export const GROK: Structure = {
  id: "grok",
  name: "Grok Imagine 1.5 Lite",
  model: "x-ai/grok-imagine-video-1.5-lite",
  summary: "Anima a foto com o movimento que você descreve, sem fala.",
  icon: "animation",
  access: "admin",
  // Sem fala para tratar nem pausas para cortar.
  treatAudio: false,
  quickEdit: false,
  wordsPerSecond: WORDS_PER_SECOND,
  cost: { sku: "{resolucao}", seconds: { field: "duracao" }, extraSku: "foto" },

  prices(model) {
    const skus = model.pricing_skus ?? {};
    const out: Record<string, string> = {};
    for (const resolution of model.supported_resolutions ?? []) {
      const cents = Number(skus[`cents_per_video_output_second_${resolution}`]);
      if (cents) out[resolution] = String(cents / 100);
    }
    const image = Number(skus.cents_per_image_input);
    if (image) out.foto = String(image / 100);
    return out;
  },

  sections(model: VideoModel | null, d) {
    const durations = model?.supported_durations ?? [d.duration];
    const resolutions = model?.supported_resolutions ?? ["720p"];
    const ratios = model?.supported_aspect_ratios ?? [d.aspectRatio];
    return [
      {
        title: "Cena",
        fields: [
          {
            kind: "textarea",
            name: "movimento",
            label: "Movimento",
            maxLength: MAX_GROK_MOTION,
            placeholder: "Ex.: sorri, olha para o produto na mesa e volta para a câmera",
            supporting: "O que o avatar faz no vídeo, sem falar.",
          },
        ],
      },
      {
        title: "Avatar",
        fields: [{ kind: "image", name: "imagem", label: "Foto do avatar", required: true, supporting: "Vira o primeiro quadro do vídeo." }],
      },
      {
        title: "Vídeo",
        fields: [
          {
            kind: "select",
            name: "duracao",
            label: "Duração",
            options: durations.map((s) => ({ value: String(s), label: `${s} s` })),
            value: String(defaultDuration(durations, d.duration)),
          },
          { kind: "segmented", name: "resolucao", label: "Resolução", options: options(resolutions), value: resolutions.includes("720p") ? "720p" : resolutions[0]! },
          // Sete formatos não cabem num botão segmentado: vai como lista, como no Wan.
          { kind: "select", name: "formato", label: "Formato", options: options(ratios), value: ratios.includes(d.aspectRatio) ? d.aspectRatio : ratios[0]! },
        ],
      },
    ];
  },

  build(values, hasImage) {
    const motion = values("movimento").replace(/\s+/g, " ").trim();
    if (!motion) throw new InputError(ERROS.movimento);
    if (motion.length > MAX_GROK_MOTION) throw new InputError(ERROS.movimentoLongo(MAX_GROK_MOTION));
    if (!hasImage) throw new InputError(ERROS.foto);

    const duration = Number(values("duracao"));
    const resolution = values("resolucao");
    const aspectRatio = values("formato");
    const prompt = `${motion} ${GROK_GUIDE}`;
    return {
      request: { prompt, duration, resolution, aspect_ratio: aspectRatio, generate_audio: false },
      image: "first_frame",
      record: {
        // Sem fala: o texto do vídeo fica vazio e o movimento tem bloco próprio.
        prompt: "",
        duration,
        resolution,
        aspect_ratio: aspectRatio,
        request_prompt: prompt,
        style: null,
        language: null,
        extra: motion,
        settings: null,
      },
    };
  },

  details(video) {
    return [{ term: "Movimento", description: video.extra ?? "—" }];
  },
};

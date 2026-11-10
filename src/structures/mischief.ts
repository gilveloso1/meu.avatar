/**
 * mischief 1 (tbc/mischief-1), da The Biological Computing Co.: anima a foto com o movimento
 * descrito, sem som. Feito a partir do Wan 2.2, cinco vezes mais rápido que ele, segundo a empresa;
 * o "derivado de neurônios" é da pesquisa, não do que roda. O mais barato do OpenRouter (meio
 * centavo por segundo em 480p, um em 720p), mas só em 16:9, com 3 ou 5 s, e sem fala: serve para
 * cenas de apoio horizontais (produto, ambiente, mãos). Testes e custo em docs/modelos/mischief-1.md.
 *
 * Pedido como o do Grok (src/structures/grok.ts): a foto como primeiro quadro e o preço em
 * centavos por segundo, por resolução.
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { WORDS_PER_SECOND } from "../prompt";
import { GROK } from "./grok";
import { InputError, type Structure } from "./types";
import { options } from "./wan";

export const MAX_MISCHIEF_MOTION = 1000;

/** Vai depois do movimento: a cena da foto, sem fala, sem corte e sem texto. */
export const MISCHIEF_GUIDE =
  "No one speaks: lips stay closed. Keep the same subject, scene and lighting as the first frame. No camera cuts, no text on screen.";

export const MISCHIEF: Structure = {
  id: "mischief",
  name: "mischief 1",
  model: "tbc/mischief-1",
  summary: "Anima a foto com o movimento que você descreve, sem som. O mais barato, só na horizontal.",
  icon: "animation",
  access: "admin",
  // Sem fala para tratar nem pausas para cortar.
  treatAudio: false,
  quickEdit: false,
  wordsPerSecond: WORDS_PER_SECOND,
  cost: { sku: "{resolucao}", seconds: { field: "duracao" } },
  // Os mesmos SKUs do Grok: centavos por segundo de cada resolução.
  prices: GROK.prices,

  sections(model: VideoModel | null, d) {
    const durations = model?.supported_durations ?? [5];
    const resolutions = model?.supported_resolutions ?? ["720p"];
    const ratios = model?.supported_aspect_ratios ?? ["16:9"];
    return [
      {
        title: "Cena",
        fields: [
          {
            kind: "textarea",
            name: "movimento",
            label: "Movimento",
            maxLength: MAX_MISCHIEF_MOTION,
            placeholder: "Ex.: a câmera se aproxima devagar do frasco na mesa",
            supporting: "O que acontece no vídeo, sem fala.",
          },
        ],
      },
      {
        title: "Avatar",
        fields: [{ kind: "image", name: "imagem", label: "Foto", required: true, supporting: "Vira o primeiro quadro do vídeo." }],
      },
      {
        title: "Vídeo",
        fields: [
          {
            kind: "select",
            name: "duracao",
            label: "Duração",
            options: durations.map((s) => ({ value: String(s), label: `${s} s` })),
            value: String(durations.includes(5) ? 5 : durations[durations.length - 1]!),
          },
          { kind: "segmented", name: "resolucao", label: "Resolução", options: options(resolutions), value: resolutions.includes("720p") ? "720p" : resolutions[0]! },
          { kind: "select", name: "formato", label: "Formato", options: options(ratios), value: ratios[0]!, supporting: ratios.length === 1 ? "O modelo só faz este formato." : undefined },
        ],
      },
    ];
  },

  build(values, hasImage) {
    const motion = values("movimento").replace(/\s+/g, " ").trim();
    if (!motion) throw new InputError(ERROS.movimento);
    if (motion.length > MAX_MISCHIEF_MOTION) throw new InputError(ERROS.movimentoLongo(MAX_MISCHIEF_MOTION));
    if (!hasImage) throw new InputError(ERROS.foto);

    const duration = Number(values("duracao"));
    const resolution = values("resolucao");
    const aspectRatio = values("formato");
    const prompt = `${motion} ${MISCHIEF_GUIDE}`;
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

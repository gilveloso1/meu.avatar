/**
 * Nano Banana 2.1 (google/gemini-nano-banana-2.1): a imagem inicial do vídeo (o esboço), com
 * ou sem foto de referência. Pela API de imagens do OpenRouter (POST /images), que responde na
 * hora; a imagem fica na tabela dos vídeos, marcada pela estrutura (`output: "image"`).
 * Comparação com outros modelos e custo em docs/modelos/gemini-nano-banana-2.1.md.
 *
 * Custo: o OpenRouter cobra por token de saída (`output_image_token`); quantos tokens cada
 * resolução gera vem do que se mediu (1K ≈ 1.300, 2K ≈ 2.000). Só essas duas resoluções
 * aparecem: 4K é demais para um esboço e não foi medida.
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { WORDS_PER_SECOND } from "../prompt";
import { InputError, type Structure } from "./types";
import { options } from "./wan";

export const MAX_IMAGE_DESCRIPTION = 2000;

/** Tokens de saída por resolução (medidos em 28/10 e 06/11/2026). */
const IMAGE_TOKENS: Record<string, number> = { "1K": 1300, "2K": 2000 };

/** Vai depois da descrição: foto realista e sem texto. */
export const IMAGE_GUIDE = "Photorealistic photo. No text, captions, logos added or watermarks on the image.";
/** Com foto de referência: a pessoa e o que a descrição não muda ficam como nela. */
export const IMAGE_REFERENCE_GUIDE = "Follow the reference image: keep the same person (face, hair, clothes) and everything the description does not change.";

export const NANO_BANANA: Structure = {
  id: "nano-banana",
  name: "Nano Banana 2.1",
  model: "google/gemini-nano-banana-2.1",
  summary: "Cria a imagem inicial do vídeo, com ou sem foto de referência.",
  icon: "image",
  access: "admin",
  output: "image",
  treatAudio: false,
  quickEdit: false,
  wordsPerSecond: WORDS_PER_SECOND,
  cost: { sku: "{resolucao}", seconds: { fixed: 1 } },

  prices(model) {
    const perToken = Number(model.pricing_skus?.output_image_token);
    const out: Record<string, string> = {};
    if (!perToken) return out;
    for (const [resolution, tokens] of Object.entries(IMAGE_TOKENS)) out[resolution] = String(perToken * tokens);
    return out;
  },

  sections(model: VideoModel | null, d) {
    const accepted = model?.supported_resolutions ?? Object.keys(IMAGE_TOKENS);
    const resolutions = Object.keys(IMAGE_TOKENS).filter((r) => accepted.includes(r));
    const ratios = model?.supported_aspect_ratios ?? [d.aspectRatio];
    return [
      {
        title: "Cena",
        fields: [
          {
            kind: "textarea",
            name: "descricao",
            label: "Descrição",
            maxLength: MAX_IMAGE_DESCRIPTION,
            placeholder: "Ex.: mulher de 30 anos na cozinha, segurando um sérum roxo e sorrindo para a câmera",
            supporting: "Quem aparece, onde, a luz e o enquadramento.",
          },
        ],
      },
      {
        title: "Referência",
        fields: [{ kind: "image", name: "imagem", label: "Foto de referência", required: false, supporting: "Opcional. O rosto ou a cena a seguir." }],
      },
      {
        title: "Imagem",
        fields: [
          { kind: "segmented", name: "resolucao", label: "Resolução", options: options(resolutions), value: resolutions[0] ?? "1K" },
          { kind: "select", name: "formato", label: "Formato", options: options(ratios), value: ratios.includes(d.aspectRatio) ? d.aspectRatio : ratios[0]! },
        ],
      },
    ];
  },

  build(values, hasImage) {
    const description = values("descricao").replace(/\s+/g, " ").trim();
    if (!description) throw new InputError(ERROS.descricao);
    if (description.length > MAX_IMAGE_DESCRIPTION) throw new InputError(ERROS.descricaoLonga(MAX_IMAGE_DESCRIPTION));
    const resolution = values("resolucao");
    const aspectRatio = values("formato");
    const prompt = [description, IMAGE_GUIDE, hasImage ? IMAGE_REFERENCE_GUIDE : ""].filter(Boolean).join(" ");
    return {
      request: { prompt, resolution, aspect_ratio: aspectRatio },
      image: hasImage ? "reference" : null,
      record: {
        // A descrição fica no lugar da fala: é o texto da lista e da busca.
        prompt: description,
        duration: 0,
        resolution,
        aspect_ratio: aspectRatio,
        request_prompt: prompt,
        style: null,
        language: null,
        extra: null,
        settings: null,
      },
    };
  },

  details() {
    return [];
  },
};

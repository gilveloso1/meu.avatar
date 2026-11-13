/**
 * HeyGen Video 1 (heygen/heygen-video-1): vídeo geral da HeyGen, com o som gerado junto (fala,
 * ambiente, efeitos), de 5 a 30 s, a partir da cena, do primeiro quadro ou de imagens de referência.
 * Não é o Avatar IV (heygen.ts), que anima uma foto falando um texto: aqui a cena é escrita inteira,
 * com a fala entre aspas, como no Wan livre, e as peças são as das versões livres (`livre.ts`). Sem
 * último quadro e sem a escolha do som (o OpenRouter não aceita `generate_audio` nele). Só o
 * administrador, enquanto em teste (docs/modelos/heygen-video-1.md).
 *
 * Custo (lista do OpenRouter, 13/11/2026): por segundo e por resolução, com um preço acima de 15 s
 * (`long_`) e outro com imagens de referência (`reference_`). As imagens de referência ainda têm um
 * preço por imagem (`reference_input_images`) que a estimativa não conta.
 */
import type { VideoModel } from "../openrouter";
import { WORDS_PER_SECOND } from "../prompt";
import { freeAgent, freeBuild, freeDetails, freeSections, type FreeOptions } from "./livre";
import type { Structure } from "./types";

/** Acima disso, o preço por segundo é o `long_` (a página do modelo: "over 15 s"). */
export const LONG_AFTER = 15;
/** Abre em 8 s (US$ 0,16 em 480p): a duração padrão do site, 25 s, passa dos 15 s e custa mais por segundo. */
const OPTIONS: FreeOptions = { lastFrame: false, sound: false, duration: 8 };

/** O preço por segundo, por `<resolução>_<duração>` e a entrada (`_ref`, com imagens de referência). */
export function heygenVideoPrices(model: VideoModel): Record<string, string> {
  const skus = model.pricing_skus ?? {};
  const out: Record<string, string> = {};
  for (const resolution of model.supported_resolutions ?? []) {
    const tier = resolution.toLowerCase();
    for (const seconds of model.supported_durations ?? []) {
      const long = seconds > LONG_AFTER ? "long_" : "";
      const plain = skus[`${long}duration_seconds_${tier}`];
      const reference = skus[`${long}reference_duration_seconds_${tier}`];
      if (plain) out[`${resolution}_${seconds}`] = plain;
      if (reference) out[`${resolution}_${seconds}_ref`] = reference;
    }
  }
  return out;
}

export const HEYGEN_VIDEO: Structure = {
  id: "heygen-video",
  name: "HeyGen Video 1",
  model: "heygen/heygen-video-1",
  summary: "A cena escrita inteira, com fala e som, de 5 a 30 s, pelo menor preço.",
  icon: "videocam",
  access: "admin",
  agent: freeAgent(
    "A cena escrita inteira, com a fala entre aspas e o idioma (a voz e o som saem do modelo, sempre com som), de 5 a 30 s: só texto, a partir de um primeiro quadro ou de referências. O vídeo com fala mais barato; acima de 15 s, o segundo custa mais.",
    OPTIONS,
  ),
  // Em teste: ouvir antes de decidir se a voz passa pelo contêiner.
  treatAudio: false,
  quickEdit: false,
  wordsPerSecond: WORDS_PER_SECOND,
  cost: { sku: "{resolucao}_{duracao}{entrada}", seconds: { field: "duracao" } },
  sections: (model, d) => freeSections(model, d, OPTIONS),
  prices: heygenVideoPrices,
  build: (values, hasImage) => freeBuild(values, hasImage, null, OPTIONS),
  details: freeDetails,
};

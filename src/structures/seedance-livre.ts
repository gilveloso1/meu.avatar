/**
 * Seedance livre (bytedance/seedance-2.0): o Seedance com tudo o que ele aceita no OpenRouter, para
 * o agente e como versão "Livre" do Seedance no site: a cena escrita inteira, primeiro e último
 * quadro, imagens de referência, um vídeo de referência (editar, estender, seguir o movimento),
 * som e semente. As peças são as do Wan livre (`livre.ts`).
 *
 * A ByteDance recusa foto ou vídeo com rosto que pareça real (docs/modelos/seedance-2.0.md): serve
 * para cena, produto, cenário e personagem estilizado. Não contornar o filtro.
 *
 * Custo: tokens do quadro por segundo (`tokenPrices`); com vídeo na entrada, o preço do token é
 * menor e conta também o vídeo enviado (o SKU com `_video`, que o agente escolhe ao mandar vídeo).
 */
import { WORDS_PER_SECOND } from "../prompt";
import { CAMPOS } from "./agente";
import { freeAgent, freeBuild, freeDetails, freeSections } from "./livre";
import { SEEDANCE, SOURCE_SECONDS, tokenPrices } from "./seedance";
import type { Structure } from "./types";

export const SEEDANCE_LIVRE: Structure = {
  id: "seedance-livre",
  family: SEEDANCE.id,
  version: "Livre",
  name: "Seedance 2.0 livre",
  model: "bytedance/seedance-2.0",
  summary: "A cena escrita inteira, com quadros, referências, vídeo de referência, som e semente.",
  icon: "movie",
  access: "admin",
  agent: freeAgent(
    `A cena escrita inteira, sem rosto realista (o provedor recusa pessoa que pareça real na foto e no vídeo): cena, produto, cenário ou personagem estilizado; só texto, entre um primeiro e um último quadro, a partir de referências ou de um vídeo (editar, estender, seguir o movimento), com ou sem som, 4 a 15 s.`,
    `src do vídeo de referência (MP4 ou MOV, de ${SOURCE_SECONDS.min} a ${SOURCE_SECONDS.max} s): ${CAMPOS.video} Na cena, é o "video 1"; a foto e as referencias vão junto como imagens. Não vai com ultimoQuadro. Opcional.`,
  ),
  treatAudio: false,
  quickEdit: false,
  wordsPerSecond: WORDS_PER_SECOND,
  cost: { sku: "{resolucao}_{formato}{entrada}", seconds: { field: "duracao" } },
  sections: freeSections,
  prices(model) {
    const withVideo = Object.entries(tokenPrices(model, true)).map(([k, v]) => [`${k}_video`, v]);
    return { ...tokenPrices(model, false), ...Object.fromEntries(withVideo) };
  },
  build: (values, hasImage, _model, video) => freeBuild(values, hasImage, video, SOURCE_SECONDS),
  details: freeDetails,
};

/**
 * Seedance livre (bytedance/seedance-2.0) e Seedance 2.0 Mini (bytedance/seedance-2.0-mini): o Seedance com tudo o que ele aceita no OpenRouter, para
 * o agente e no site (o card do Seedance; o Mini é a outra versão): a cena escrita inteira, primeiro e último
 * quadro, imagens de referência, um vídeo de referência (editar, estender, seguir o movimento),
 * som e semente. As peças são as do Wan livre (`livre.ts`).
 *
 * A ByteDance recusa foto ou vídeo com rosto que pareça real (docs/modelos/seedance-2.0.md): serve
 * para cena, produto, cenário e personagem estilizado. Não contornar o filtro.
 *
 * Custo: tokens do quadro por segundo (`tokenPrices`); com vídeo na entrada, o preço do token é
 * menor e conta também o vídeo enviado (o SKU com `_video`, que o agente escolhe ao mandar vídeo).
 */
import type { VideoModel } from "../openrouter";
import { WORDS_PER_SECOND } from "../prompt";
import { CAMPOS } from "./agente";
import { freeAgent, freeBuild, freeDetails, freeSections } from "./livre";
import { SOURCE_SECONDS, tokenPrices } from "./seedance";
import type { Structure } from "./types";

/**
 * O preço por segundo do Seedance livre, por `<resolução>_<formato>` e a entrada: sem nada ou com
 * imagens de referência (`_ref`, o mesmo token), e com vídeo (`_video`, o token menor, contando o enviado).
 */
export function freePrices(model: VideoModel): Record<string, string> {
  const base = tokenPrices(model, false);
  const suffix = (prices: Record<string, string>, s: string) => Object.fromEntries(Object.entries(prices).map(([k, v]) => [`${k}${s}`, v]));
  return { ...base, ...suffix(base, "_ref"), ...suffix(tokenPrices(model, true), "_video") };
}

/** Uma versão livre do Seedance: a mesma estrutura, com o modelo e o nome de cada uma. */
function seedanceFree(v: { id: string; family?: string; version?: string; name: string; model: string; summary: string; use: string }): Structure {
  return {
    id: v.id,
    ...(v.family ? { family: v.family } : {}),
    ...(v.version ? { version: v.version } : {}),
    name: v.name,
    model: v.model,
    summary: v.summary,
    icon: "movie",
    access: "admin",
    agent: freeAgent(
      `${v.use} Sem rosto realista (o provedor recusa pessoa que pareça real na foto e no vídeo): cena, produto, cenário ou personagem estilizado; só texto, entre um primeiro e um último quadro, a partir de referências ou de um vídeo (editar, estender, seguir o movimento), com ou sem som, 4 a 15 s.`,
      { video: `src do vídeo de referência (MP4 ou MOV, de ${SOURCE_SECONDS.min} a ${SOURCE_SECONDS.max} s): ${CAMPOS.video} Na cena, é o "video 1"; a foto e as referencias vão junto como imagens. Não vai com ultimoQuadro. Opcional.` },
    ),
    treatAudio: false,
    quickEdit: false,
    wordsPerSecond: WORDS_PER_SECOND,
    cost: { sku: "{resolucao}_{formato}{entrada}", seconds: { field: "duracao" } },
    sections: (model, d) => freeSections(model, d),
    prices: freePrices,
    build: (values, hasImage, _model, video) => freeBuild(values, hasImage, video, { range: SOURCE_SECONDS }),
    details: freeDetails,
  };
}

/** A versão principal do Seedance (o card e a página): a troca de avatar (`seedance.ts`) está desativada. */
export const SEEDANCE_LIVRE = seedanceFree({
  id: "seedance-livre",
  name: "Seedance 2.0",
  model: "bytedance/seedance-2.0",
  summary: "A cena escrita inteira, com quadros, referências, vídeo de referência, som e semente.",
  use: "A cena escrita inteira, até 4K.",
});

/** O Seedance 2.0 Mini: o mesmo pedido, metade do preço do token, só 480p e 720p. */
export const SEEDANCE_MINI = seedanceFree({
  id: "seedance-mini",
  family: "seedance-livre",
  version: "Mini",
  name: "Seedance 2.0 Mini",
  model: "bytedance/seedance-2.0-mini",
  summary: "O Seedance livre pela metade do preço, em 480p e 720p.",
  use: "O mesmo do seedance-livre pela metade do preço, só 480p e 720p.",
});

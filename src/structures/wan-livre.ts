/**
 * Wan 3.0 livre (alibaba/wan-3.0): o mesmo modelo do Wan, com tudo o que ele aceita no OpenRouter,
 * para o agente (gerar_video com modelo "wan-livre", no MCP). As peças comuns às versões livres
 * (cena, quadros, referências de imagem, som e semente) ficam em `livre.ts`. Fica como versão do
 * Wan (a mesma página e a mesma lista no site) e só para o administrador, enquanto em teste. Sem
 * som, o áudio não passa pelo contêiner.
 */
import { WORDS_PER_SECOND } from "../prompt";
import { freeAgent, freeBuild, freeDetails, freeSections } from "./livre";
import type { Structure } from "./types";
import { WAN } from "./wan";

export const WAN_LIVRE: Structure = {
  id: "wan-livre",
  family: WAN.id,
  version: "Livre",
  name: "Wan 3.0 livre",
  model: "alibaba/wan-3.0",
  summary: "A cena escrita inteira, com quadros, referências, som e semente.",
  icon: "movie",
  access: "admin",
  agent: freeAgent(
    "A cena escrita inteira (com a fala entre aspas e o idioma, se alguém fala; a voz sai do modelo): só texto, entre um primeiro e um último quadro ou a partir de referências, com ou sem som, 2 a 30 s.",
  ),
  treatAudio: true,
  quickEdit: false,
  wordsPerSecond: WORDS_PER_SECOND,
  // Abaixo de 5 s, o provedor cobra 5 s (docs/modelos/wan-3.0.md, teste de 10/11/2026).
  cost: { sku: "duration_seconds_{resolucao}", seconds: { field: "duracao" }, billed: { min: 5 } },
  sections: freeSections,
  build: (values, hasImage) => freeBuild(values, hasImage, null),
  details: freeDetails,
};

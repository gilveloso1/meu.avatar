/**
 * Peças dos descritores do agente (AgentSpec): os campos que se repetem entre os modelos, com a
 * mesma frase, e a leitura dos valores. Cada estrutura diz quais aceita.
 */
import type { AgentArgs, Lists } from "./types";

/** O texto de um campo, ou "". */
export const txt = (a: AgentArgs, k: string): string => (typeof a[k] === "string" ? (a[k] as string) : "");
/** Um número ou texto de um campo, como texto ("" sem ele). */
export const num = (a: AgentArgs, k: string): string => (typeof a[k] === "number" || typeof a[k] === "string" ? String(a[k]) : "");

/** Os campos comuns, com o que são; a estrutura completa a frase quando precisa. */
export const CAMPOS = {
  foto: "src de imagem (jpeg, png ou webp) que vira o primeiro quadro: a foto de um ativo de listar_avatares, um arquivo do projeto ou uma imagem gerada.",
  duracao: "Segundos (os aceitos em duracoes).",
  resolucao: "Uma das resolucoes.",
  formato: "Um dos formatos; sem isso, o do Final.",
};

/**
 * A voz: uma clonada da lista vai como "Voz clonada"; o resto, como voz pronta (a estrutura confere).
 * O mesmo molde no HeyGen e nos modelos de fala.
 */
export function voz(a: AgentArgs, lists: Lists, audio = false): Record<string, string> {
  const id = txt(a, "voz");
  const clonada = !audio && !!lists.clones?.some((c) => c.value === id);
  return {
    fonte: audio ? "audio" : clonada ? "clonada" : "pronta",
    voz: clonada || audio ? "" : id,
    clone: clonada ? id : "",
    consentimento: a.consentimento === true ? "sim" : "",
  };
}

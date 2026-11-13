/**
 * FLUX Video Edit (black-forest-labs/flux-video-edit): edita um vídeo pronto pelo texto. Tira, põe
 * ou troca objetos e pessoas, refaz o cenário, mexe no texto da tela; o resto do vídeo fica. O
 * pedido é só o texto e o vídeo de origem (em `input_references`, `video_url`); o OpenRouter não
 * aceita duração, resolução nem formato: o vídeo sai com os do original. Para o agente, pelo
 * gerar_video com `video` e `cena`; só o administrador, enquanto em teste.
 *
 * Custo: US$ 0,03 por segundo do vídeo gerado (`cents_per_second_output`); a estimativa conta os
 * segundos do original. Limites do vídeo de origem e se o som fica: ainda não documentados, a
 * conferir no primeiro teste real (docs/modelos/flux-video-edit.md).
 */
import { ERROS } from "../erros";
import { WORDS_PER_SECOND } from "../prompt";
import { CAMPOS, txt } from "./agente";
import { aspectLabel } from "./aleph";
import { centsPerSecond, sourceWithin } from "./origem";
import { InputError, type Structure } from "./types";

export const MAX_FLUX_EDIT = 1000;
/** Duração aceita no vídeo de origem (segundos): provisória, até o primeiro teste real. */
export const FLUX_SECONDS = { min: 2, max: 15 };

export const FLUX_EDIT: Structure = {
  id: "flux-edit",
  name: "FLUX Video Edit",
  model: "black-forest-labs/flux-video-edit",
  summary: "Edita um vídeo pronto pelo texto: tira, põe ou troca objetos, pessoas e o cenário.",
  icon: "edit",
  access: "admin",
  agent: {
    use: `Editar um vídeo que já existe pelo texto: tirar, pôr ou trocar objetos e pessoas, refazer o cenário; o resto fica igual. O vídeo sai com a duração e o formato do original (${FLUX_SECONDS.min} a ${FLUX_SECONDS.max} s).`,
    fields: {
      video: `src do vídeo de origem (MP4 ou MOV, de ${FLUX_SECONDS.min} a ${FLUX_SECONDS.max} s): ${CAMPOS.video} Obrigatório.`,
      cena: `O que mudar no vídeo, e o que fica igual. Até ${MAX_FLUX_EDIT.toLocaleString("pt-BR")} caracteres. Obrigatória.`,
    },
    required: ["video", "cena"],
    values: (a) => ({ cena: txt(a, "cena") }),
  },
  // Não gera som; o que o vídeo pronto traz do original se confere no primeiro teste.
  treatAudio: false,
  quickEdit: false,
  wordsPerSecond: WORDS_PER_SECOND,
  cost: { sku: "segundo", seconds: { video: "video" } },

  sections() {
    return [
      {
        title: "Origem",
        fields: [{ kind: "video", name: "video", label: "Vídeo de origem", supporting: `MP4 ou MOV, de ${FLUX_SECONDS.min} a ${FLUX_SECONDS.max} s.` }],
      },
      {
        title: "Edição",
        fields: [
          {
            kind: "textarea",
            name: "cena",
            label: "O que mudar",
            maxLength: MAX_FLUX_EDIT,
            placeholder: "Ex.: troca a caneca da mesa por uma garrafa verde",
            supporting: "O que tirar, pôr ou trocar; o resto fica igual.",
          },
        ],
      },
    ];
  },

  prices: centsPerSecond,

  build(values, _hasImage, _model, video) {
    const source = sourceWithin(video, FLUX_SECONDS);
    const edit = values("cena").replace(/\s+/g, " ").trim();
    if (!edit) throw new InputError(ERROS.edicao);
    if (edit.length > MAX_FLUX_EDIT) throw new InputError(ERROS.edicaoLonga(MAX_FLUX_EDIT));
    const { width, height } = source;
    return {
      request: { prompt: edit },
      image: null,
      video: true,
      record: {
        // O pedido fica no lugar da fala: é o texto da lista e da busca.
        prompt: edit,
        duration: Math.max(1, Math.round(source.seconds)),
        // O vídeo sai no quadro do original; sem o tamanho no cabeçalho, o padrão dos vídeos.
        resolution: width && height ? `${Math.min(width, height)}p` : "720p",
        aspect_ratio: width && height ? aspectLabel(width, height) : "9:16",
        request_prompt: edit,
        style: null,
        language: null,
        extra: null,
        settings: { source_seconds: source.seconds.toFixed(1) },
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
    return [{ term: "Vídeo de origem", description: settings.source_seconds ? `${settings.source_seconds.replace(".", ",")} s` : "—" }];
  },
};

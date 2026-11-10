/**
 * Wan 3.0 livre (alibaba/wan-3.0): o mesmo modelo do Wan, com tudo o que ele aceita no OpenRouter,
 * para o agente (gerar_video_wan do MCP). A cena é escrita inteira por quem pede, com a fala
 * dentro dela se houver; o pedido pode levar o primeiro e o último quadro (imagem para vídeo) ou
 * imagens de referência (referência para vídeo), som ou não, e a semente. Fica como versão do Wan
 * (a mesma página e a mesma lista no site) e só para o administrador, enquanto em teste.
 *
 * Quadros e referências não vão juntos: com os dois, o OpenRouter trata o pedido como imagem para
 * vídeo (docs/modelos/wan-3.0.md). Sem som, o áudio não passa pelo contêiner.
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { WORDS_PER_SECOND } from "../prompt";
import { InputError, type Structure } from "./types";
import { CAMPOS, num, txt, voz } from "./agente";
import { options, WAN } from "./wan";

export const MAX_WAN_SCENE = 2000;
/** Até quantas imagens de referência (o OpenRouter não diz o limite do Wan 3.0). */
export const MAX_WAN_REFERENCES = 4;

export const WAN_LIVRE: Structure = {
  id: "wan-livre",
  family: WAN.id,
  version: "Livre",
  name: "Wan 3.0 livre",
  model: "alibaba/wan-3.0",
  summary: "A cena escrita inteira, com quadros, referências, som e semente.",
  icon: "movie",
  access: "admin",
  agent: {
    use: "A cena escrita inteira (com a fala entre aspas e o idioma, se alguém fala; a voz sai do modelo): só texto, entre um primeiro e um último quadro ou a partir de referências, com ou sem som, 2 a 30 s.",
    fields: {
      cena: "O prompt inteiro: quem aparece, o que faz, a câmera, a luz e a fala entre aspas com o idioma. Até 2.000 caracteres. Obrigatória.",
      foto: `${CAMPOS.foto} Opcional.`,
      ultimoQuadro: "src da imagem do último quadro: o vídeo termina nela. Opcional.",
      referencias: `Até ${MAX_WAN_REFERENCES} src de imagem que guiam a cena (a pessoa, o produto, o lugar), sem virar quadro; diga na cena o que vem de cada uma. Não vai com foto nem ultimoQuadro.`,
      som: "false para sair sem som (para pôr outro áudio por cima). Padrão: com som.",
      semente: "Inteiro, para repetir um resultado parecido. Opcional.",
      duracao: CAMPOS.duracao,
      resolucao: CAMPOS.resolucao,
      formato: CAMPOS.formato,
    },
    required: ["cena"],
    maxReferences: MAX_WAN_REFERENCES,
    values: (a) => ({
      cena: txt(a, "cena"),
      foto: Array.isArray(a.referencias) && a.referencias.length ? "referencia" : "quadro",
      som: a.som === false ? "nao" : "sim",
      semente: num(a, "semente"),
      duracao: num(a, "duracao"),
      resolucao: txt(a, "resolucao"),
      formato: txt(a, "formato"),
    }),
  },
  treatAudio: true,
  quickEdit: false,
  wordsPerSecond: WORDS_PER_SECOND,
  cost: { sku: "duration_seconds_{resolucao}", seconds: { field: "duracao" } },

  sections(model: VideoModel | null, d) {
    const durations = model?.supported_durations ?? [d.duration];
    return [
      {
        title: "Cena",
        fields: [
          {
            kind: "textarea",
            name: "cena",
            label: "Cena",
            maxLength: MAX_WAN_SCENE,
            placeholder: 'Ex.: mulher na cozinha olha para a câmera e diz em português: "Oi, gente!"',
            supporting: "Quem aparece, o que faz, a câmera e a fala entre aspas.",
          },
        ],
      },
      {
        title: "Avatar",
        fields: [{ kind: "image", name: "imagem", label: "Primeiro quadro", required: false, supporting: "Opcional. Vira o primeiro quadro do vídeo." }],
      },
      {
        title: "Vídeo",
        fields: [
          { kind: "select", name: "duracao", label: "Duração", options: durations.map((s) => ({ value: String(s), label: `${s} s` })), value: String(d.duration) },
          { kind: "segmented", name: "resolucao", label: "Resolução", options: options(model?.supported_resolutions ?? [d.resolution]), value: d.resolution },
          { kind: "select", name: "formato", label: "Formato", options: options(model?.supported_aspect_ratios ?? [d.aspectRatio]), value: d.aspectRatio },
          { kind: "segmented", name: "som", label: "Som", options: [{ value: "sim", label: "Com som" }, { value: "nao", label: "Sem som" }], value: "sim" },
        ],
      },
    ];
  },

  build(values, hasImage) {
    const scene = values("cena").replace(/\s+/g, " ").trim();
    if (!scene) throw new InputError(ERROS.cena);
    if (scene.length > MAX_WAN_SCENE) throw new InputError(ERROS.cenaLonga(MAX_WAN_SCENE));
    const duration = Number(values("duracao"));
    const resolution = values("resolucao");
    const aspectRatio = values("formato");
    const sound = values("som") !== "nao";
    if (values("semente") && !(/^\d{1,10}$/.test(values("semente")) && Number(values("semente")) < 2 ** 32)) throw new InputError(ERROS.semente);
    const seed = values("semente") ? Number(values("semente")) : undefined;
    // "referencia" (o gerar_video_wan com referencias): a foto é a primeira referência; senão, o primeiro quadro.
    const reference = values("foto") === "referencia";
    return {
      request: { prompt: scene, duration, resolution, aspect_ratio: aspectRatio, generate_audio: sound, ...(seed !== undefined ? { seed } : {}) },
      image: hasImage ? (reference ? "reference" : "first_frame") : null,
      lastFrame: !reference,
      record: {
        // A cena fica no lugar da fala: é o texto da lista e da busca.
        prompt: scene,
        duration,
        resolution,
        aspect_ratio: aspectRatio,
        request_prompt: scene,
        style: null,
        language: null,
        extra: null,
        settings: { som: sound ? "sim" : "nao", ...(hasImage ? { foto: reference ? "referencia" : "quadro" } : {}), ...(seed !== undefined ? { semente: String(seed) } : {}) },
      },
    };
  },

  details(video) {
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(video.settings ?? "{}") as Record<string, unknown>;
    } catch {}
    const reference = settings.foto === "referencia";
    const refs = reference ? 1 + (Array.isArray(settings.referencias) ? settings.referencias.length : 0) : 0;
    const frames = [settings.foto === "quadro" ? "primeiro" : "", settings.ultimo_quadro ? "último" : ""].filter(Boolean).join(" e ");
    return [
      { term: "Som", description: settings.som === "nao" ? "Sem som" : "Com som" },
      { term: "Quadros", description: frames ? frames[0]!.toUpperCase() + frames.slice(1) : "—" },
      { term: "Referências", description: refs ? String(refs) : "—" },
      { term: "Semente", description: typeof settings.semente === "string" ? settings.semente : "—" },
    ];
  },
};

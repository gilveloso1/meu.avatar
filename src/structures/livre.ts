/**
 * Peças das versões "Livre" (Wan 3.0 livre, Seedance livre): o modelo com tudo o que o OpenRouter
 * aceita dele, para o agente e, no site, como versão do modelo. A cena é o prompt inteiro, com a
 * fala dentro dela se houver; o pedido pode levar o primeiro e o último quadro (imagem para vídeo)
 * ou referências (referência para vídeo: imagens e, onde o modelo aceita, um vídeo), som ou não, e
 * a semente. Cada estrutura diz o seu modelo, o uso e o preço; o resto é daqui.
 *
 * Quadros e referências não vão juntos: com os dois, o OpenRouter trata o pedido como imagem para
 * vídeo (docs/modelos/wan-3.0.md). O vídeo de referência leva a foto junto como referência.
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { CAMPOS, num, txt } from "./agente";
import { sourceWithin } from "./origem";
import { type AgentSpec, type Built, type Defaults, type Detail, InputError, type Section, type SourceVideo, type Values } from "./types";
import { options } from "./wan";
import type { Video as VideoRow } from "../db";

export const MAX_SCENE = 2000;
/** Até quantas imagens de referência (o OpenRouter não diz o limite dos modelos). */
export const MAX_REFERENCES = 4;

/**
 * O que muda de um modelo livre para outro, pelo que o OpenRouter aceita dele: `video`, a frase do
 * vídeo de referência, onde ele aceita; `lastFrame: false`, sem último quadro; `sound: false`, sem a
 * escolha do som (o modelo não tem `generate_audio`: o som vem sempre); `duration`, a duração com
 * que o formulário abre, quando a padrão do site não serve ao modelo.
 */
export interface FreeOptions {
  video?: string;
  duration?: number;
  lastFrame?: boolean;
  sound?: boolean;
}

/** O descritor do agente: o uso é do modelo; os campos, os que ele aceita (`FreeOptions`). */
export function freeAgent(use: string, opts: FreeOptions = {}): AgentSpec {
  const last = opts.lastFrame !== false;
  return {
    use,
    fields: {
      cena: "O prompt inteiro: quem aparece, o que faz, a câmera, a luz e a fala entre aspas com o idioma. Até 2.000 caracteres. Obrigatória.",
      foto: `${CAMPOS.foto} Opcional.`,
      ...(last ? { ultimoQuadro: "src da imagem do último quadro: o vídeo termina nela. Opcional." } : {}),
      referencias: `Até ${MAX_REFERENCES} src de imagem que guiam a cena (a pessoa, o produto, o lugar), sem virar quadro; diga na cena o que vem de cada uma. Não vai com foto${last ? " nem ultimoQuadro" : ""}.`,
      ...(opts.video ? { video: opts.video } : {}),
      ...(opts.sound !== false ? { som: "false para sair sem som (para pôr outro áudio por cima). Padrão: com som." } : {}),
      semente: "Inteiro, para repetir um resultado parecido. Opcional.",
      duracao: CAMPOS.duracao,
      resolucao: CAMPOS.resolucao,
      formato: CAMPOS.formato,
    },
    required: ["cena"],
    maxReferences: MAX_REFERENCES,
    values: (a) => ({
      cena: txt(a, "cena"),
      // Com referências ou vídeo, a foto vai como referência; senão, como primeiro quadro.
      foto: (Array.isArray(a.referencias) && a.referencias.length) || txt(a, "video") ? "referencia" : "quadro",
      // O preço com vídeo ou imagens de referência na entrada pode ser outro: o SKU com "_video" ou "_ref".
      entrada: txt(a, "video") ? "_video" : Array.isArray(a.referencias) && a.referencias.length ? "_ref" : "",
      som: a.som === false ? "nao" : "sim",
      semente: num(a, "semente"),
      duracao: num(a, "duracao"),
      resolucao: txt(a, "resolucao"),
      formato: txt(a, "formato"),
    }),
  };
}

/** O formulário do site: a cena, o primeiro quadro e as opções do vídeo, da lista do modelo. */
export function freeSections(model: VideoModel | null, d: Defaults, opts: FreeOptions = {}): Section[] {
  const durations = model?.supported_durations ?? [d.duration];
  const resolutions = model?.supported_resolutions ?? [d.resolution];
  const ratios = model?.supported_aspect_ratios ?? [d.aspectRatio];
  const pick = <T>(list: T[], value: T) => (list.includes(value) ? value : list[0]!);
  return [
    {
      title: "Cena",
      fields: [
        {
          kind: "textarea",
          name: "cena",
          label: "Cena",
          maxLength: MAX_SCENE,
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
        { kind: "select", name: "duracao", label: "Duração", options: durations.map((s) => ({ value: String(s), label: `${s} s` })), value: String(pick(durations, opts.duration ?? d.duration)) },
        { kind: "segmented", name: "resolucao", label: "Resolução", options: options(resolutions), value: pick(resolutions, d.resolution) },
        { kind: "select", name: "formato", label: "Formato", options: options(ratios), value: pick(ratios, d.aspectRatio) },
        ...(opts.sound !== false ? [{ kind: "segmented" as const, name: "som", label: "Som", options: [{ value: "sim", label: "Com som" }, { value: "nao", label: "Sem som" }], value: "sim" }] : []),
      ],
    },
  ];
}

/** Monta o pedido livre; `video`, o vídeo de referência, se veio, na duração aceita (`range`). */
export function freeBuild(values: Values, hasImage: boolean, video: SourceVideo | null, opts: FreeOptions & { range?: { min: number; max: number } } = {}): Built {
  const range = opts.range;
  const scene = values("cena").replace(/\s+/g, " ").trim();
  if (!scene) throw new InputError(ERROS.cena);
  if (scene.length > MAX_SCENE) throw new InputError(ERROS.cenaLonga(MAX_SCENE));
  const source = video && range ? sourceWithin(video, range) : null;
  const duration = Number(values("duracao"));
  const resolution = values("resolucao");
  const aspectRatio = values("formato");
  // Sem a escolha do som, o pedido não leva `generate_audio` (o modelo não aceita o campo).
  const sound = opts.sound === false ? null : values("som") !== "nao";
  if (values("semente") && !(/^\d{1,10}$/.test(values("semente")) && Number(values("semente")) < 2 ** 32)) throw new InputError(ERROS.semente);
  const seed = values("semente") ? Number(values("semente")) : undefined;
  // "referencia" (o gerar_video com referencias ou vídeo): a foto é a primeira referência; senão, o primeiro quadro.
  const reference = values("foto") === "referencia" || source !== null;
  return {
    request: { prompt: scene, duration, resolution, aspect_ratio: aspectRatio, ...(sound !== null ? { generate_audio: sound } : {}), ...(seed !== undefined ? { seed } : {}) },
    image: hasImage ? (reference ? "reference" : "first_frame") : null,
    lastFrame: !reference && opts.lastFrame !== false,
    video: source !== null,
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
      settings: {
        ...(sound !== null ? { som: sound ? "sim" : "nao" } : {}),
        ...(hasImage ? { foto: reference ? "referencia" : "quadro" } : {}),
        ...(seed !== undefined ? { semente: String(seed) } : {}),
        ...(source ? { source_seconds: source.seconds.toFixed(1) } : {}),
      },
    },
  };
}

/** Os detalhes do vídeo livre: som, quadros, referências, vídeo de referência e semente. */
export function freeDetails(video: VideoRow): Detail[] {
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
    ...(typeof settings.source_seconds === "string" ? [{ term: "Vídeo de referência", description: `${settings.source_seconds.replace(".", ",")} s` }] : []),
    { term: "Semente", description: typeof settings.semente === "string" ? settings.semente : "—" },
  ];
}

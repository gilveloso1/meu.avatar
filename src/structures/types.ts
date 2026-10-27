/**
 * Estrutura de um modelo: tudo o que o estúdio precisa para gerar vídeos com
 * ele, separado do resto. Cada estrutura tem os seus campos de formulário, o
 * seu prompt de sistema, o jeito de montar o pedido ao OpenRouter, a regra de
 * custo e se o áudio passa pelo contêiner. Cada vídeo guarda o id da
 * estrutura que o gerou (coluna `structure`).
 *
 * Os valores aceitos pelo modelo (duração, resolução, formato, preço) vêm
 * sempre de GET /videos/models; a estrutura só escolhe o padrão.
 */
import type { Video } from "../db";
import type { VideoModel, VideoRequest } from "../openrouter";

export class InputError extends Error {}

export interface Option {
  value: string;
  label: string;
  /** Explicação da opção, mostrada abaixo do campo quando ela está escolhida. */
  description?: string;
}

/** Uma linha do cartão de detalhes do vídeo. */
export interface Detail {
  term: string;
  description: string;
}

export type Field =
  | {
      kind: "textarea";
      name: string;
      label: string;
      maxLength: number;
      placeholder: string;
      /** Texto de apoio enquanto o campo está vazio. */
      supporting: string;
      /** É a fala: o contador mostra palavras e quanto tempo de vídeo elas dão. */
      speech?: boolean;
    }
  | { kind: "text"; name: string; label: string; maxLength: number; placeholder: string; supporting: string }
  | { kind: "select"; name: string; label: string; options: Option[]; value: string; supporting?: string }
  | { kind: "segmented"; name: string; label: string; options: Option[]; value: string }
  | { kind: "image"; name: string; label: string; required: boolean; supporting: string };

export interface Section {
  title: string;
  fields: Field[];
}

/** Padrões do formulário que vêm da configuração (wrangler.jsonc). */
export interface Defaults {
  duration: number;
  resolution: string;
  aspectRatio: string;
}

/**
 * Custo estimado: o preço por segundo (o SKU pode citar campos, como
 * "duration_seconds_{resolucao}") vezes os segundos, que vêm de um campo ou
 * da quantidade de palavras da fala.
 */
export interface CostRule {
  sku: string;
  seconds: { field: string } | { speech: string };
}

/** O que o formulário mandou, já sem a foto. */
export type Values = (name: string) => string;

export interface Built {
  /** O pedido sem modelo, foto e callback (o estúdio completa). */
  request: Omit<VideoRequest, "model" | "callback_url" | "frame_images" | "input_references">;
  /** Como a foto vai para o modelo: primeiro quadro ou referência. */
  image: "first_frame" | "reference" | null;
  /** O que fica guardado no banco. */
  record: {
    /** A fala. */
    prompt: string;
    duration: number;
    resolution: string;
    aspect_ratio: string;
    /** O prompt exatamente como foi para o modelo. */
    request_prompt: string;
    style: string | null;
    language: string | null;
    extra: string | null;
    /** Configurações próprias da estrutura. */
    settings: Record<string, string> | null;
  };
}

export interface Structure {
  id: string;
  /** Nome no cartão e no título da página. */
  name: string;
  /** Id do modelo no OpenRouter. */
  model: string;
  /** Uma ou duas linhas para o cartão de escolha. */
  summary: string;
  /** Ícone do cartão (Material Symbols; precisa estar em ICONS, src/site/site.ts). */
  icon: string;
  /** "admin": só o administrador vê e usa (modelo em teste). */
  access: "all" | "admin";
  /** O áudio pronto passa pelo contêiner (src/audio.ts). */
  treatAudio: boolean;
  /** O vídeo pronto tem o botão "Edição rápida" (container/editar.py). */
  quickEdit: boolean;
  /** Palavras por segundo da fala, para o contador e o custo. */
  wordsPerSecond: { min: number; max: number };
  cost: CostRule;
  sections(model: VideoModel | null, defaults: Defaults): Section[];
  /** Valida o formulário e monta o pedido; lança InputError. */
  build(values: Values, hasImage: boolean, model: VideoModel): Built;
  /** As configurações próprias de um vídeo, para o cartão de detalhes. */
  details(video: Video): Detail[];
}

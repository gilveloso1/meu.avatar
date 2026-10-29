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
  | { kind: "image"; name: string; label: string; required: boolean; supporting: string }
  /** Vídeo enviado do computador (MP4 ou MOV); a duração é lida do arquivo. */
  | { kind: "video"; name: string; label: string; supporting: string };

export interface Section {
  title: string;
  fields: Field[];
  /** Vem antes da foto e do vídeo, no topo da configuração (como o "Uso" do Seedance). */
  lead?: boolean;
}

/** Padrões do formulário que vêm da configuração (wrangler.jsonc). */
export interface Defaults {
  duration: number;
  resolution: string;
  aspectRatio: string;
}

/**
 * Custo estimado: o preço por segundo (o SKU pode citar campos, como
 * "duration_seconds_{resolucao}") vezes os segundos, que vêm de um campo, da
 * quantidade de palavras da fala ou da duração do vídeo enviado.
 */
export interface CostRule {
  sku: string;
  seconds: { field: string } | { speech: string } | { video: string };
  /** US$ fixos por vídeo, além do preço por segundo (as imagens dos quadros-chave do Aleph 2). */
  extra?: number;
}

/** O vídeo enviado, já lido: quantos segundos tem. */
export interface SourceVideo {
  seconds: number;
}

/** O que o formulário mandou, já sem a foto. */
export type Values = (name: string) => string;

export interface Built {
  /** O pedido sem modelo, foto e callback (o estúdio completa). */
  request: Omit<VideoRequest, "model" | "callback_url" | "frame_images" | "input_references">;
  /** Como a foto vai para o modelo: primeiro quadro ou referência. */
  image: "first_frame" | "reference" | null;
  /** O vídeo enviado vai como referência (só o Seedance 2 em diante aceita). */
  video?: boolean;
  /**
   * O pedido não sai na hora: o vídeo entra na fila de preparo (Studio.prepareNext),
   * que monta as referências e envia. A foto e o vídeo ficam guardados no R2.
   */
  prepare?: boolean;
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
  /**
   * O vídeo pronto passa pela composição no contêiner antes de aparecer (o
   * Aleph 2: o original com só a cabeça e o cabelo do Aleph por cima).
   */
  compose?: boolean;
  /** Palavras por segundo da fala, para o contador e o custo. */
  wordsPerSecond: { min: number; max: number };
  cost: CostRule;
  sections(model: VideoModel | null, defaults: Defaults): Section[];
  /**
   * Preço por segundo, por SKU (os nomes que `cost.sku` cita). Sem isto, os
   * SKUs do próprio modelo; o Seedance cobra por tokens e converte aqui.
   */
  prices?(model: VideoModel): Record<string, string>;
  /** Valida o formulário e monta o pedido; lança InputError. `video`: o vídeo enviado, se houver. */
  build(values: Values, hasImage: boolean, model: VideoModel, video: SourceVideo | null): Built;
  /** As configurações próprias de um vídeo, para o cartão de detalhes. */
  details(video: Video): Detail[];
}

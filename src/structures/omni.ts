/**
 * Gemini Omni 1.2 Flash (google/gemini-omni-1.2-flash): o avatar da foto fala o texto, com a
 * voz e a boca saindo juntas do modelo, ou só faz a cena, sem fala (clipes curtos). Sem estilo
 * fixo: a cena e o estilo vêm das instruções, que são obrigatórias e voltam preenchidas com
 * as últimas usadas com o avatar. A orientação de som e imagem do Wan fica (ver `omniPrompt`).
 * Testes e custo em docs/modelos/gemini-omni-1.2-flash.md. O 1.1 sai em 03/12/2026 (o
 * Google passa os pedidos dele para o 1.2), por isso a estrutura já nasce no 1.2.
 *
 * Pelo OpenRouter (conferido em 07/11/2026): foto como primeiro quadro (`frame_images`),
 * 3 a 15 s, 360p, 720p, 1080p e 4K, só 16:9 e 9:16; só há preço com áudio.
 *
 * Custo: dólar por segundo, um SKU por resolução (`duration_seconds_with_audio_<r>`); o
 * 1080p é o SKU sem sufixo (`duration_seconds_with_audio`) e o do 4K vem em minúsculas
 * (`_4k`). `prices` põe tudo pelo nome da resolução. Conferido com o preço do Google
 * (tokens por segundo de cada resolução vezes US$ 12/M): o OpenRouter não cobra a mais.
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { cleanSpeech, type Language, LANGUAGES, languageById, MAX_EXTRA, qualityGuide, SPEECH_LEAD, WORDS_PER_SECOND } from "../prompt";
import { InputError, type Structure } from "./types";
import { options } from "./wan";

/** Fala curta: o modelo faz no máximo 15 s (cerca de 39 palavras). */
export const MAX_OMNI_SPEECH = 250;

const SKU = "duration_seconds_with_audio";
/** A resolução cujo preço é o SKU sem sufixo. */
const BASE_RESOLUTION = "1080p";

/** O valor do idioma quando o avatar não fala (fica gravado no vídeo, para o Refazer). */
export const NO_SPEECH = "sem-fala";
/** Um plano só: sem isto, o Omni monta vários planos e cortes por conta própria (guia do Google). */
export const OMNI_SINGLE_SHOT = "In a single continuous shot, no scene cuts.";
/** Sem fala, na frase do guia do Google (o Omni não tem negative prompt: a negativa vai no texto). */
export const OMNI_SILENT = "No dialogue or voiceover.";
/** Sem fala: o som e a imagem, no molde da orientação do Wan, sem as linhas da voz. */
export const OMNI_SILENT_GUIDE = [
  "Audio: only the quiet natural ambient sound of the scene.",
  "No background music, no sound effects, no echo, no distortion, no clipping.",
  "Video: photorealistic, steady framing, natural skin texture. No on-screen text, subtitles, captions or watermark.",
].join("\n");

/**
 * O prompt longo, o único formato que o Omni 1.2 aceitou com constância nos testes de
 * 07/11/2026 (docs/modelos/gemini-omni-1.2-flash.md): o do Wan, com as instruções de quem usa
 * no lugar do estilo. Com fala: a fala citada (`SPEECH_LEAD`) e a orientação de qualidade
 * (`qualityGuide`: voz, sincronia, idioma, imagem, nada de texto na tela). Sem fala: o aviso
 * de que não há fala e a orientação sem as linhas da voz. Prompts curtos, só com a mecânica,
 * falharam em 15 de 17 pedidos.
 */
export function omniPrompt(extra: string, speech: string, language: Language | null): string {
  const scene = `${extra}\n${OMNI_SINGLE_SHOT}`;
  return speech && language
    ? `${scene}\n${SPEECH_LEAD} "${speech}"\n\n${qualityGuide(language)}`
    : `${scene}\n${OMNI_SILENT}\n\n${OMNI_SILENT_GUIDE}`;
}

/** Da menor resolução para a maior (o modelo lista 720p, 1080p, 4K, 360p). */
function byHeight(resolutions: string[]): string[] {
  const height = (r: string) => (/^(\d+)k$/i.test(r) ? Number(r.slice(0, -1)) * 540 : parseInt(r, 10) || 0);
  return [...resolutions].sort((a, b) => height(a) - height(b));
}

/** Duração padrão: a da configuração, se o modelo aceitar; senão 8 s, ou a maior aceita. */
function defaultDuration(durations: number[], preferred: number): number {
  return durations.includes(preferred) ? preferred : durations.includes(8) ? 8 : durations[durations.length - 1]!;
}

/**
 * As duas versões são a mesma estrutura com outro modelo: a 1.2 é a principal (o card e a
 * página); a 1.1 fica no seletor Versão enquanto a 1.2 estiver instável (o Google passa a 1.1
 * para a 1.2 em 03/12/2026). Durações e preços vêm de cada modelo no OpenRouter.
 */
function omniVersion(v: { id: string; version: string; family?: string }): Structure {
  return {
  id: v.id,
  family: v.family,
  version: v.version,
  name: `Gemini Omni ${v.version} Flash`,
  model: `google/gemini-omni-${v.version}-flash`,
  summary: "O avatar da foto fala o seu texto, ou só faz a cena que você descreve. Clipes curtos.",
  icon: "auto_awesome",
  access: "admin",
  // O áudio veio limpo no primeiro teste (−20 LUFS, sem clipping): sai como o modelo entrega.
  treatAudio: false,
  quickEdit: false,
  wordsPerSecond: WORDS_PER_SECOND,
  cost: { sku: "{resolucao}", seconds: { field: "duracao" } },

  prices(model) {
    const skus = model.pricing_skus ?? {};
    const out: Record<string, string> = {};
    for (const resolution of model.supported_resolutions ?? []) {
      const price = skus[resolution === BASE_RESOLUTION ? SKU : `${SKU}_${resolution.toLowerCase()}`];
      if (price) out[resolution] = price;
    }
    return out;
  },

  sections(model: VideoModel | null, d) {
    const durations = model?.supported_durations ?? [8];
    const resolutions = byHeight(model?.supported_resolutions ?? ["720p"]);
    const ratios = model?.supported_aspect_ratios ?? [d.aspectRatio];
    return [
      {
        title: "Cena",
        fields: [
          {
            kind: "textarea",
            name: "instrucoes",
            label: "Instruções",
            maxLength: MAX_EXTRA,
            placeholder: "Ex.: apresentadora animada num estúdio, gesticula e sorri no final",
            supporting: "A cena, o jeito de falar e o estilo do vídeo.",
            perAvatar: true,
          },
        ],
      },
      {
        title: "Fala",
        fields: [
          {
            kind: "select",
            name: "idioma",
            label: "Idioma da fala",
            options: [...LANGUAGES.map((l) => ({ value: l.id, label: l.label })), { value: NO_SPEECH, label: "Sem fala", divider: true }],
            value: LANGUAGES[0]!.id,
          },
          {
            kind: "textarea",
            name: "fala",
            label: "Texto",
            maxLength: MAX_OMNI_SPEECH,
            placeholder: "Só o que a pessoa fala, sem aspas. Ex.: Oi, gente! Hoje eu vou mostrar…",
            supporting: "Só o que a pessoa fala, sem aspas.",
            speech: true,
            showIf: { idioma: LANGUAGES.map((l) => l.id) },
          },
        ],
      },
      {
        title: "Avatar",
        fields: [{ kind: "image", name: "imagem", label: "Foto do avatar", required: true, supporting: "Vira o primeiro quadro do vídeo." }],
      },
      {
        title: "Vídeo",
        fields: [
          {
            kind: "select",
            name: "duracao",
            label: "Duração",
            options: durations.map((s) => ({ value: String(s), label: `${s} s` })),
            value: String(defaultDuration(durations, d.duration)),
          },
          { kind: "segmented", name: "resolucao", label: "Resolução", options: options(resolutions), value: resolutions.includes("720p") ? "720p" : resolutions[0]! },
          { kind: "segmented", name: "formato", label: "Formato", options: options(ratios), value: ratios.includes(d.aspectRatio) ? d.aspectRatio : ratios[0]! },
        ],
      },
    ];
  },

  build(values, hasImage) {
    const extra = values("instrucoes").replace(/\s+/g, " ").trim();
    if (!extra) throw new InputError(ERROS.instrucoes);
    if (extra.length > MAX_EXTRA) throw new InputError(ERROS.instrucoesLongas(MAX_EXTRA));
    const silent = values("idioma") === NO_SPEECH;
    const language = silent ? null : languageById(values("idioma"));
    if (!silent && !language) throw new InputError(ERROS.idioma);
    const speech = silent ? "" : cleanSpeech(values("fala"));
    if (!silent && !speech) throw new InputError(ERROS.fala);
    if (speech.length > MAX_OMNI_SPEECH) throw new InputError(ERROS.falaLonga(MAX_OMNI_SPEECH));
    if (!hasImage) throw new InputError(ERROS.foto);

    const duration = Number(values("duracao"));
    const resolution = values("resolucao");
    const aspectRatio = values("formato");
    const prompt = omniPrompt(extra, speech, language ?? null);
    return {
      request: { prompt, duration, resolution, aspect_ratio: aspectRatio, generate_audio: true },
      image: "first_frame",
      record: {
        prompt: speech,
        duration,
        resolution,
        aspect_ratio: aspectRatio,
        request_prompt: prompt,
        style: null,
        language: language?.id ?? NO_SPEECH,
        extra: extra || null,
        settings: null,
      },
    };
  },

  details(video) {
    return [
      { term: "Idioma da fala", description: video.language === NO_SPEECH ? "Sem fala" : video.language ? (languageById(video.language)?.label ?? video.language) : "—" },
      { term: "Instruções", description: video.extra ?? "—" },
    ];
  },
  };
}

export const OMNI = omniVersion({ id: "omni", version: "1.2" });
export const OMNI_11 = omniVersion({ id: "omni-11", version: "1.1", family: OMNI.id });


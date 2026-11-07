/**
 * Gemini Omni 1.2 Flash (google/gemini-omni-1.2-flash): o avatar da foto fala o texto, com a
 * voz e a boca saindo juntas do modelo, ou só faz a cena, sem fala (clipes curtos). Sem estilo
 * fixo nem orientação padrão: a cena, o jeito de falar e o estilo vêm das instruções, que são
 * obrigatórias e voltam preenchidas com as últimas usadas com o avatar.
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
import { cleanSpeech, type Language, LANGUAGES, languageById, MAX_EXTRA, WORDS_PER_SECOND } from "../prompt";
import { InputError, type Structure } from "./types";
import { options } from "./wan";

/** Fala curta: o modelo faz no máximo 15 s (cerca de 39 palavras). */
export const MAX_OMNI_SPEECH = 250;

const SKU = "duration_seconds_with_audio";
/** A resolução cujo preço é o SKU sem sufixo. */
const BASE_RESOLUTION = "1080p";

/** O valor do idioma quando o avatar não fala (fica gravado no vídeo, para o Refazer). */
export const NO_SPEECH = "sem-fala";
/** Sem fala: a pessoa não fala. */
export const OMNI_SILENT = "The person does not speak: lips stay closed, no dialogue, no voice-over.";
/** A única orientação fixa: a legenda e o texto vêm depois, na edição. */
export const OMNI_NO_TEXT = "No on-screen text, subtitles, captions or watermark.";

/** A fala para o modelo: só a mecânica (idioma, sincronia, as palavras exatas), nada de estilo. */
export function omniSpeech(speech: string, language: Language): string {
  return `The person speaks in ${language.english}, with lip sync, and says exactly: "${speech}"`;
}

/**
 * O prompt: as instruções de quem usa (a cena, o jeito de falar e o estilo), a fala (ou o
 * aviso de que não há fala) e o pedido de nada de texto na tela. Sem outra orientação padrão.
 */
export function omniPrompt(extra: string, speech: string, language: Language | null): string {
  return [extra, speech && language ? omniSpeech(speech, language) : OMNI_SILENT, OMNI_NO_TEXT].join("\n");
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

export const OMNI: Structure = {
  id: "omni",
  name: "Gemini Omni 1.2 Flash",
  model: "google/gemini-omni-1.2-flash",
  summary: "O avatar da foto fala o seu texto, ou só faz a cena que você descreve. Clipes de até 15 s.",
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
            options: [...LANGUAGES.map((l) => ({ value: l.id, label: l.label })), { value: NO_SPEECH, label: "Sem fala" }],
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

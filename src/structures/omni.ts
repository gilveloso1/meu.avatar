/**
 * Gemini Omni 1.2 Flash (google/gemini-omni-1.2-flash): o avatar da foto fala o texto, com a
 * voz e a boca saindo juntas do modelo, ou só faz a cena, sem fala (clipes curtos). Sem estilo
 * fixo: a cena, o jeito de falar e o estilo vêm das instruções, escritas por quem usa.
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
import { cleanSpeech, LANGUAGES, languageById, MAX_EXTRA, qualityGuide, SPEECH_LEAD, WORDS_PER_SECOND } from "../prompt";
import { InputError, type Structure } from "./types";
import { options } from "./wan";

/** Fala curta: o modelo faz no máximo 15 s (cerca de 39 palavras). */
export const MAX_OMNI_SPEECH = 250;

const SKU = "duration_seconds_with_audio";
/** A resolução cujo preço é o SKU sem sufixo. */
const BASE_RESOLUTION = "1080p";

/** Sem fala: a pessoa não fala, e o fim do prompt fica só com a orientação da imagem. */
export const OMNI_SILENT = "The person does not speak: lips stay closed, no dialogue, no voice-over.";
export const OMNI_VIDEO_GUIDE = "Video: photorealistic, steady framing, natural skin texture. No on-screen text, subtitles, captions or watermark.";

/**
 * O prompt: as instruções, a fala (ou o aviso de que não há fala) e a orientação de
 * qualidade. Com fala, a do Wan (voz, sincronia e idioma), que deu áudio limpo no teste.
 */
export function omniPrompt(extra: string, speech: string, language: (typeof LANGUAGES)[number]): string {
  const said = speech ? `${SPEECH_LEAD} "${speech}"` : OMNI_SILENT;
  return `${[extra, said].filter(Boolean).join("\n")}\n\n${speech ? qualityGuide(language) : OMNI_VIDEO_GUIDE}`;
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
            optional: true,
          },
        ],
      },
      {
        title: "Fala",
        fields: [
          { kind: "select", name: "idioma", label: "Idioma da fala", options: LANGUAGES.map((l) => ({ value: l.id, label: l.label })), value: LANGUAGES[0]!.id },
          {
            kind: "textarea",
            name: "fala",
            label: "Texto",
            maxLength: MAX_OMNI_SPEECH,
            placeholder: "Só o que a pessoa fala, sem aspas. Ex.: Oi, gente! Hoje eu vou mostrar…",
            supporting: "Opcional. Sem texto, o avatar não fala.",
            speech: true,
            optional: true,
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
    const language = languageById(values("idioma"));
    if (!language) throw new InputError(ERROS.idioma);
    const speech = cleanSpeech(values("fala"));
    if (speech.length > MAX_OMNI_SPEECH) throw new InputError(ERROS.falaLonga(MAX_OMNI_SPEECH));
    const extra = values("instrucoes").replace(/\s+/g, " ").trim();
    if (extra.length > MAX_EXTRA) throw new InputError(ERROS.instrucoesLongas(MAX_EXTRA));
    if (!speech && !extra) throw new InputError(ERROS.falaOuInstrucoes);
    if (!hasImage) throw new InputError(ERROS.foto);

    const duration = Number(values("duracao"));
    const resolution = values("resolucao");
    const aspectRatio = values("formato");
    const prompt = omniPrompt(extra, speech, language);
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
        // Sem fala, o idioma não diz nada do vídeo.
        language: speech ? language.id : null,
        extra: extra || null,
        settings: null,
      },
    };
  },

  details(video) {
    return [
      { term: "Idioma da fala", description: video.language ? (languageById(video.language)?.label ?? video.language) : "—" },
      { term: "Instruções", description: video.extra ?? "—" },
    ];
  },
};

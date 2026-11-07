/**
 * Gemini Omni 1.1 Flash (google/gemini-omni-1.1-flash): avatar falando, a partir da foto e
 * da fala, com a voz e a boca saindo juntas do modelo (como o Wan, mas em clipes curtos).
 * Testes e custo em docs/modelos/gemini-omni-1.1-flash.md.
 *
 * Pelo OpenRouter (conferido em 07/11/2026): foto como primeiro quadro (`frame_images`),
 * 3 a 10 s, 360p, 720p, 1080p e 4K, só 16:9 e 9:16; só há preço com áudio.
 *
 * Custo: dólar por segundo, um SKU por resolução (`duration_seconds_with_audio_<r>`); o
 * 1080p é o SKU sem sufixo (`duration_seconds_with_audio`) e o do 4K vem em minúsculas
 * (`_4k`). `prices` põe tudo pelo nome da resolução.
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { buildPrompt, cleanSpeech, languageById, MAX_EXTRA, styleById, WORDS_PER_SECOND } from "../prompt";
import { InputError, type Structure } from "./types";
import { options, WAN } from "./wan";

/** Fala curta: o modelo faz no máximo 10 s (cerca de 25 palavras). */
export const MAX_OMNI_SPEECH = 300;

const SKU = "duration_seconds_with_audio";
/** A resolução cujo preço é o SKU sem sufixo. */
const BASE_RESOLUTION = "1080p";

/** Duração padrão: a da configuração, se o modelo aceitar; senão 8 s, ou a maior aceita. */
function defaultDuration(durations: number[], preferred: number): number {
  return durations.includes(preferred) ? preferred : durations.includes(8) ? 8 : durations[durations.length - 1]!;
}

export const OMNI: Structure = {
  id: "omni",
  name: "Gemini Omni 1.1 Flash",
  model: "google/gemini-omni-1.1-flash",
  summary: "O avatar fala o seu texto a partir da foto, com a voz feita pelo modelo. Clipes de até 10 s.",
  icon: "auto_awesome",
  access: "admin",
  // Ainda sem teste real: o áudio sai como o modelo entrega e não há Edição rápida.
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
    // Cena e Fala iguais às do Wan; a fala aqui é mais curta.
    const [cena, fala] = WAN.sections(null, d);
    const durations = model?.supported_durations ?? [8];
    const resolutions = model?.supported_resolutions ?? ["720p"];
    const ratios = model?.supported_aspect_ratios ?? [d.aspectRatio];
    return [
      cena!,
      { ...fala!, fields: fala!.fields.map((f) => (f.kind === "textarea" ? { ...f, maxLength: MAX_OMNI_SPEECH } : f)) },
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
    const style = styleById(values("estilo"));
    if (!style) throw new InputError(ERROS.estilo);
    const language = languageById(values("idioma"));
    if (!language) throw new InputError(ERROS.idioma);
    const speech = cleanSpeech(values("fala"));
    if (!speech) throw new InputError(ERROS.fala);
    if (speech.length > MAX_OMNI_SPEECH) throw new InputError(ERROS.falaLonga(MAX_OMNI_SPEECH));
    const extra = values("instrucoes").replace(/\s+/g, " ").trim();
    if (extra.length > MAX_EXTRA) throw new InputError(ERROS.instrucoesLongas(MAX_EXTRA));
    if (!hasImage) throw new InputError(ERROS.foto);

    const duration = Number(values("duracao"));
    const resolution = values("resolucao");
    const aspectRatio = values("formato");
    const prompt = buildPrompt({ style, language, speech, extra });
    return {
      request: { prompt, duration, resolution, aspect_ratio: aspectRatio, generate_audio: true },
      image: "first_frame",
      record: {
        prompt: speech,
        duration,
        resolution,
        aspect_ratio: aspectRatio,
        request_prompt: prompt,
        style: style.id,
        language: language.id,
        extra: extra || null,
        settings: null,
      },
    };
  },

  details(video) {
    return WAN.details(video);
  },
};

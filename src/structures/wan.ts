/**
 * Wan 3.0 (alibaba/wan-3.0): o formulário de sempre, em partes (estilo, fala,
 * instruções e idioma), com o prompt montado por src/prompt.ts. A voz sai na
 * mesma geração do vídeo, alta e com chiado pelo OpenRouter, por isso o áudio
 * passa pelo contêiner (docs/prompt.md e docs/operacao.md).
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { buildPrompt, cleanSpeech, LANGUAGES, languageById, MAX_EXTRA, MAX_SPEECH, STYLES, styleById, WORDS_PER_SECOND } from "../prompt";
import { InputError, type Structure } from "./types";

export const WAN: Structure = {
  id: "wan",
  name: "Wan 3.0",
  model: "alibaba/wan-3.0",
  summary: "A cena, a voz e a boca saem juntas do modelo, a partir da foto e da fala. O áudio passa pelo tratamento depois.",
  icon: "movie",
  access: "all",
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
            kind: "select",
            name: "estilo",
            label: "Estilo",
            options: STYLES.map((s) => ({ value: s.id, label: s.label, description: s.description })),
            value: STYLES[0]!.id,
          },
          {
            kind: "text",
            name: "instrucoes",
            label: "Instruções extras",
            maxLength: MAX_EXTRA,
            placeholder: "Ex.: ela sorri no final",
            supporting: "Opcional: algo a mais sobre a cena, além do estilo.",
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
            options: LANGUAGES.map((l) => ({ value: l.id, label: l.label })),
            value: LANGUAGES[0]!.id,
          },
          {
            kind: "textarea",
            name: "fala",
            label: "Texto",
            maxLength: MAX_SPEECH,
            placeholder: "Só o que a pessoa fala, sem aspas. Ex.: Oi, gente! Hoje eu vou mostrar…",
            supporting: "Só o que a pessoa fala, sem aspas.",
            speech: true,
          },
        ],
      },
      {
        title: "Avatar",
        fields: [{ kind: "image", name: "imagem", label: "Foto do avatar", required: false, supporting: "Vira o primeiro quadro do vídeo." }],
      },
      {
        title: "Vídeo",
        fields: [
          { kind: "select", name: "duracao", label: "Duração", options: durations.map((s) => ({ value: String(s), label: `${s} s` })), value: String(d.duration) },
          { kind: "segmented", name: "resolucao", label: "Resolução", options: options(model?.supported_resolutions ?? [d.resolution]), value: d.resolution },
          // Cinco formatos não cabem num botão segmentado na tela do celular: vai como lista.
          { kind: "select", name: "formato", label: "Formato", options: options(model?.supported_aspect_ratios ?? [d.aspectRatio]), value: d.aspectRatio },
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
    if (speech.length > MAX_SPEECH) throw new InputError(ERROS.falaLonga(MAX_SPEECH));
    const extra = values("instrucoes").replace(/\s+/g, " ").trim();
    if (extra.length > MAX_EXTRA) throw new InputError(ERROS.instrucoesLongas(MAX_EXTRA));

    const duration = Number(values("duracao"));
    const resolution = values("resolucao");
    const aspectRatio = values("formato");
    const prompt = buildPrompt({ style, language, speech, extra });
    return {
      request: { prompt, duration, resolution, aspect_ratio: aspectRatio, generate_audio: true },
      image: hasImage ? "first_frame" : null,
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
    return [
      { term: "Estilo", description: video.style ? (styleById(video.style)?.label ?? video.style) : "—" },
      { term: "Idioma da fala", description: video.language ? (languageById(video.language)?.label ?? video.language) : "—" },
      { term: "Instruções extras", description: video.extra ?? "—" },
    ];
  },
};

export function options(values: string[]): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: v }));
}

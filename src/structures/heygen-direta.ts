/**
 * HeyGen Avatar IV pela API direta da HeyGen (src/heygen.ts), quando a config
 * 'plataforma.heygen' do banco diz 'heygen'. É o mesmo modelo e o mesmo card
 * do HeyGen pelo OpenRouter (heygen.ts, que fica como está), com o que só a
 * API direta faz: a voz vem de três lugares.
 *
 * - Voz pronta: uma voz do catálogo da HeyGen lê o texto (com sotaque pt-BR
 *   quando a voz aceita).
 * - Voz clonada: a voz da pessoa, clonada de uma gravação (clone instantâneo),
 *   lê o texto. O texto vira áudio na HeyGen (texto para fala) e o áudio vai
 *   para o vídeo, o caminho que a documentação garante.
 * - Meu áudio: o áudio enviado é a fala do vídeo.
 *
 * Preço da API direta (tabela da conta, 29/10/2026): US$ 0,0385/s com foto, em
 * 720p e 1080p. A HeyGen não informa o custo do vídeo: ele sai da duração.
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { WORDS_PER_SECOND } from "../prompt";
import { EXPRESSIVENESS, HEYGEN_AVATAR, MAX_MOTION, MAX_SCRIPT, MOTION_GUIDE, speechSeconds, VOICES } from "./heygen";
import { InputError, type Option, type Structure, type VoiceOption } from "./types";
import { options } from "./wan";

/** Preço por segundo do Avatar IV com foto na API direta (US$). */
export const PRICE_PER_SECOND = 0.0385;

/** O que a API direta aceita no Avatar IV com foto, no formato que o formulário já usa. */
export const HEYGEN_MODEL: VideoModel = {
  id: HEYGEN_AVATAR.model,
  name: "HeyGen: Avatar IV",
  supported_durations: null,
  supported_resolutions: ["720p", "1080p"],
  supported_aspect_ratios: ["9:16", "16:9", "1:1", "4:5"],
  supported_frame_images: null,
  generate_audio: false,
  pricing_skus: { duration_seconds: String(PRICE_PER_SECOND) },
};

export const SOURCES: Option[] = [
  { value: "pronta", label: "Voz pronta" },
  { value: "clonada", label: "Voz clonada" },
  { value: "audio", label: "Meu áudio" },
];

/** Opção da lista de vozes clonadas que abre os campos para clonar uma voz nova. */
export const NEW_CLONE = "nova";
/** Na lista de vozes clonadas, a voz de um avatar: `avatar:<id>`. */
export const AVATAR_VOICE = "avatar:";
export const MAX_CLONE_NAME = 64;

/** Marca, no valor da voz pronta, que ela aceita o sotaque pt-BR (voice_settings.locale). */
const LOCALE_MARK = "|pt-BR";

/** Os idiomas do catálogo (a HeyGen os escreve em inglês) na língua de quem usa. */
const LANGUAGES: Record<string, string> = {
  Arabic: "Árabe", Bulgarian: "Búlgaro", Chinese: "Chinês", Croatian: "Croata", Czech: "Tcheco", Danish: "Dinamarquês", Dutch: "Holandês",
  English: "Inglês", Filipino: "Filipino", Finnish: "Finlandês", French: "Francês", German: "Alemão", Greek: "Grego", Hebrew: "Hebraico",
  Hindi: "Hindi", Hungarian: "Húngaro", Indonesian: "Indonésio", Italian: "Italiano", Japanese: "Japonês", Korean: "Coreano", Malay: "Malaio",
  Norwegian: "Norueguês", Polish: "Polonês", Portuguese: "Português", Romanian: "Romeno", Russian: "Russo", Slovak: "Eslovaco", Spanish: "Espanhol",
  Swedish: "Sueco", Tamil: "Tâmil", Thai: "Tailandês", Turkish: "Turco", Ukrainian: "Ucraniano", Vietnamese: "Vietnamita",
};
const SAME_LANGUAGE: Record<string, string> = { en: "English", es: "Spanish", Turkey: "Turkish" };
const NO_LANGUAGE = "Sem idioma definido";
/** O catálogo escreve o mesmo idioma de jeitos diferentes, e 188 vozes vêm sem idioma. */
function languageName(language: string): string {
  const name = language.trim();
  if (!name || name === "unknown") return NO_LANGUAGE;
  if (/multi/i.test(name)) return "Multilíngue";
  const english = SAME_LANGUAGE[name] ?? name;
  return LANGUAGES[english] ?? english;
}
/** Português vem primeiro, depois Multilíngue, os outros em ordem alfabética e, por último, as vozes sem idioma. */
const languageRank = (language: string) => (language === "Português" ? 0 : language === "Multilíngue" ? 1 : language === NO_LANGUAGE ? 3 : 2);

/**
 * As vozes do catálogo como opções; as que o OpenRouter mostra (também são da HeyGen) ficam
 * sempre na lista, com o idioma delas. Sem catálogo, são só elas.
 */
export function voiceOptions(voices: { voice_id: string; name: string; language: string; gender: string; support_locale: boolean; preview_audio_url?: string | null }[]): VoiceOption[] {
  if (!voices.length) return VOICES;
  const gender = (g: string) => (g === "female" ? "feminina" : g === "male" ? "masculina" : "");
  const known = new Map(VOICES.map((v) => [v.value, v]));
  const catalog = voices.map((v): VoiceOption => {
    const language = known.get(v.voice_id)?.language ?? languageName(v.language);
    return {
      value: v.voice_id + (v.support_locale ? LOCALE_MARK : ""),
      label: [v.name, gender(v.gender), language.toLowerCase()].filter(Boolean).join(" · "),
      name: v.name,
      gender: v.gender === "female" || v.gender === "male" ? v.gender : "",
      language,
      preview: Boolean(v.preview_audio_url),
    };
  });
  const ids = new Set(voices.map((v) => v.voice_id));
  return [...catalog, ...VOICES.filter((v) => !ids.has(v.value))].sort(
    (a, b) => languageRank(a.language) - languageRank(b.language) || a.language.localeCompare(b.language, "pt") || a.name.localeCompare(b.name, "pt"),
  );
}

const onlyText = { fonte: ["pronta", "clonada"] };
const newClone = { fonte: ["clonada"], clone: [NEW_CLONE] };

export const HEYGEN_DIRECT: Structure = {
  ...HEYGEN_AVATAR,
  platform: "heygen",
  summary: "Anima a foto falando com uma voz pronta, a sua voz clonada ou o seu áudio.",
  cost: { sku: "duration_seconds", seconds: { speech: "fala", audio: "audio" } },

  sections(model, d, lists = {}) {
    const resolutions = model?.supported_resolutions ?? ["720p"];
    const ratios = model?.supported_aspect_ratios ?? [d.aspectRatio];
    const voices = lists.voices?.length ? lists.voices : VOICES;
    const clones = [...(lists.clones ?? []), { value: NEW_CLONE, label: "Clonar uma voz nova" }];
    const consent: Record<string, string[]> = { fonte: ["clonada"], clone: [NEW_CLONE, ...(lists.newClones ?? [])] };
    return [
      {
        title: "Fala",
        fields: [
          { kind: "segmented", name: "fonte", label: "Voz", options: SOURCES, value: "pronta", hideLabel: true },
          { kind: "voice", name: "voz", label: "Voz pronta", voices, value: voices[0]!.value, showIf: { fonte: ["pronta"] } },
          { kind: "select", name: "clone", label: "Voz clonada", options: clones, value: clones[0]!.value, showIf: { fonte: ["clonada"] } },
          { kind: "audio", name: "amostra", label: "Gravação da voz", supporting: "MP3 ou WAV, 1 a 3 min de fala limpa.", showIf: newClone },
          { kind: "text", name: "nome_voz", label: "Nome da voz", maxLength: MAX_CLONE_NAME, placeholder: "Ex.: Minha voz", supporting: "Para achar a voz na lista depois.", showIf: newClone },
          { kind: "checkbox", name: "consentimento", label: "A voz é minha ou tenho autorização para cloná-la.", showIf: consent },
          {
            kind: "textarea",
            name: "fala",
            label: "Texto",
            maxLength: MAX_SCRIPT,
            placeholder: "O texto que a voz lê. Ex.: Oi, gente! Hoje eu vou mostrar…",
            supporting: "O texto que a voz lê. A duração do vídeo segue a fala.",
            speech: true,
            showIf: onlyText,
          },
          { kind: "audio", name: "audio", label: "Áudio da fala", supporting: "MP3 ou WAV. A duração do vídeo segue o áudio.", showIf: { fonte: ["audio"] } },
        ],
      },
      {
        title: "Expressividade",
        fields: [
          { kind: "image", name: "imagem", label: "Foto do avatar", required: true, supporting: "" },
          { kind: "segmented", name: "expressividade", label: "Expressividade", options: EXPRESSIVENESS, value: "low", hideLabel: true },
          {
            kind: "text",
            name: "movimento",
            label: "Movimento",
            maxLength: MAX_MOTION,
            placeholder: "Ex.: aponta para a câmera no final",
            supporting: "Opcional. Gestos que o avatar faz enquanto fala.",
          },
        ],
      },
      {
        title: "Vídeo",
        fields: [
          { kind: "segmented", name: "resolucao", label: "Resolução", options: options(resolutions), value: resolutions.includes("720p") ? "720p" : resolutions[0]! },
          { kind: "segmented", name: "formato", label: "Formato", options: options(ratios), value: ratios.includes(d.aspectRatio) ? d.aspectRatio : ratios[0]! },
        ],
      },
    ];
  },

  build(values, hasImage, model, _video, lists = {}) {
    const source = SOURCES.find((s) => s.value === values("fonte"))?.value as "pronta" | "clonada" | "audio" | undefined;
    if (!source) throw new InputError(ERROS.fonteVoz);
    if (!hasImage) throw new InputError(ERROS.foto);

    let script: string | null = null;
    if (source !== "audio") {
      script = values("fala").replace(/\s+/g, " ").trim();
      if (!script) throw new InputError(ERROS.fala);
      if (script.length > MAX_SCRIPT) throw new InputError(ERROS.falaLonga(MAX_SCRIPT));
    }

    let voiceId: string | null = null;
    let locale: string | null = null;
    let voiceLabel: string | null = null;
    if (source === "pronta") {
      const voices = lists.voices?.length ? lists.voices : VOICES;
      const voice = voices.find((v) => v.value === values("voz"));
      if (!voice) throw new InputError(ERROS.voz);
      voiceId = voice.value.replace(LOCALE_MARK, "");
      locale = voice.value.endsWith(LOCALE_MARK) ? "pt-BR" : null;
      voiceLabel = voice.label;
    }

    let clone: string | null = null;
    let cloneName: string | null = null;
    if (source === "clonada") {
      clone = values("clone");
      if (clone === NEW_CLONE) {
        cloneName = values("nome_voz").replace(/\s+/g, " ").trim().slice(0, MAX_CLONE_NAME);
        if (!cloneName) throw new InputError(ERROS.nomeVoz);
        if (values("consentimento") !== "sim") throw new InputError(ERROS.consentimentoVoz);
      } else {
        const known = lists.clones?.find((c) => c.value === clone);
        if (!known) throw new InputError(ERROS.vozClonada);
        if (lists.newClones?.includes(clone) && values("consentimento") !== "sim") throw new InputError(ERROS.consentimentoVoz);
        voiceLabel = known.label;
      }
    }

    const expressiveness = EXPRESSIVENESS.find((e) => e.value === values("expressividade"));
    if (!expressiveness) throw new InputError(ERROS.expressividade);
    const extra = values("movimento").replace(/\s+/g, " ").trim();
    if (extra.length > MAX_MOTION) throw new InputError(ERROS.movimentoLongo(MAX_MOTION));
    const motion = [MOTION_GUIDE, extra].filter(Boolean).join(" ");
    const resolution = values("resolucao");
    const aspectRatio = values("formato");
    if (!model.supported_resolutions?.includes(resolution) || !model.supported_aspect_ratios?.includes(aspectRatio)) {
      throw new InputError(ERROS.ajustesNaoAceitos);
    }

    const sourceLabel = SOURCES.find((s) => s.value === source)!.label;
    return {
      request: { prompt: script ?? "" },
      image: "reference",
      heygen: { source, script, voiceId, locale, clone, cloneName, resolution, aspectRatio, expressiveness: expressiveness.value, motionPrompt: motion },
      record: {
        // Com o áudio enviado não há texto: a lista mostra "Meu áudio".
        prompt: script ?? sourceLabel,
        // Estimativa pela fala; a duração certa vem da HeyGen quando o vídeo fica pronto.
        duration: script ? speechSeconds(script, WORDS_PER_SECOND) : 0,
        resolution,
        aspect_ratio: aspectRatio,
        request_prompt: script ?? "",
        style: null,
        language: null,
        extra: extra || null,
        settings: {
          platform: "heygen",
          source,
          source_label: sourceLabel,
          ...(voiceId ? { voice_id: voiceId } : {}),
          ...(voiceLabel ? { voice: voiceLabel } : {}),
          ...(cloneName ? { voice: cloneName } : {}),
          expressiveness: expressiveness.value,
          motion_prompt: motion,
        },
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
    return [
      { term: "Voz", description: [settings.source_label, settings.voice].filter(Boolean).join(" · ") || "—" },
      { term: "Expressividade", description: EXPRESSIVENESS.find((e) => e.value === settings.expressiveness)?.label ?? "—" },
      { term: "Movimento", description: video.extra ?? "—" },
    ];
  },
};

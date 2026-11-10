/**
 * Gemini Omni 1.2 Flash (google/gemini-omni-1.2-flash), clipes curtos, em dois usos, pelo que o
 * modelo aceitou nos testes (docs/modelos/gemini-omni-1.2-flash.md, 10/11/2026):
 * - Com fala: o avatar da foto fala o texto, com a voz e a boca saindo juntas do modelo, parado e
 *   olhando para a câmera. É o pedido do estilo Selfie do Wan, sem instruções de quem usa: com a
 *   foto de uma pessoa, qualquer instrução a mais derrubou o pedido (`omniTalkPrompt`).
 * - Sem fala: uma cena sem pessoa (produto, objeto, cenário), pelas instruções de quem usa, com
 *   ou sem foto (`omniPrompt`).
 * O 1.1 mantém o formulário antigo (instruções com a pessoa) até sair, em 03/12/2026, quando o
 * Google passa os pedidos dele para o 1.2.
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
import { buildPrompt, cleanSpeech, type Language, LANGUAGES, languageById, MAX_EXTRA, qualityGuide, SPEECH_LEAD, styleById, WORDS_PER_SECOND } from "../prompt";
import { CAMPOS, num, txt } from "./agente";
import { type AgentSpec, type Field, InputError, type Structure } from "./types";
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
 * O prompt das instruções de quem usa: elas no lugar do estilo, um plano só e, com fala (só na
 * 1.1), a fala citada (`SPEECH_LEAD`) e a orientação de qualidade do Wan; sem fala, o aviso de
 * que não há fala e a orientação sem as linhas da voz. Na 1.2 só vai sem fala, para a cena sem
 * pessoa, que passou de primeira em 10/11/2026; com a foto de uma pessoa, falhou sempre
 * (docs/modelos/gemini-omni-1.2-flash.md).
 */
export function omniPrompt(extra: string, speech: string, language: Language | null): string {
  const scene = `${extra}\n${OMNI_SINGLE_SHOT}`;
  return speech && language
    ? `${scene}\n${SPEECH_LEAD} "${speech}"\n\n${qualityGuide(language)}`
    : `${scene}\n${OMNI_SILENT}\n\n${OMNI_SILENT_GUIDE}`;
}

/**
 * O pedido com fala do 1.2: o do estilo Selfie do Wan, exato e sem instruções de quem usa. É o
 * único que o 1.2 aceitou com a foto de uma pessoa (6 de 6 até 10/11/2026); com instruções no
 * lugar da frase do Selfie ou depois dela, falhou (0 de 4 no dia).
 */
export function omniTalkPrompt(speech: string, language: Language): string {
  return buildPrompt({ style: styleById("selfie")!, language, speech });
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

/** O Omni para o agente: só a versão principal (a 1.1 sai em 03/12/2026). */
const OMNI_AGENT: AgentSpec = {
  use: "Dois usos, clipes de 3 a 15 s, só 9:16 e 16:9. Com fala: o avatar da foto fala o texto (voz e boca do próprio modelo), parado e olhando para a câmera; não aceita cena. Sem fala: uma cena sem pessoas (produto, objeto, cenário) descrita em cena, com ou sem foto.",
  fields: {
    cena: `Só sem fala, e então obrigatória: a cena sem pessoas (o que aparece, o movimento, a câmera). Até ${MAX_EXTRA} caracteres.`,
    fala: `Só o que a pessoa fala, sem aspas, até ${MAX_OMNI_SPEECH} caracteres. Com fala, a foto é obrigatória e a cena não entra.`,
    idioma: '"pt-BR" (padrão), "en-US" ou "es", com fala.',
    foto: `${CAMPOS.foto} Com fala, a foto do avatar (obrigatória). Sem fala, opcional e sem pessoas.`,
    duracao: CAMPOS.duracao,
    resolucao: CAMPOS.resolucao,
    formato: CAMPOS.formato,
  },
  // Com fala pede a foto; sem fala, a cena: quem confere é o `build`, com a frase do site.
  required: [],
  values: (a) => ({
    instrucoes: txt(a, "cena"),
    idioma: txt(a, "fala").trim() ? txt(a, "idioma") : NO_SPEECH,
    fala: txt(a, "fala"),
    duracao: num(a, "duracao"),
    resolucao: txt(a, "resolucao"),
    formato: txt(a, "formato"),
  }),
};

/**
 * As versões são a mesma estrutura com outro modelo: a 1.2 é a principal (o card e a página); a
 * 1.1 fica no seletor Versão até 03/12/2026. `split`: os dois usos da 1.2 (com fala, a selfie sem
 * instruções; sem fala, a cena sem pessoa); sem ele, o formulário antigo, com instruções sempre.
 */
function omniVersion(v: { id: string; version: string; family?: string; split?: boolean }): Structure {
  const split = v.split ?? false;
  const instructions: Field = {
    kind: "textarea",
    name: "instrucoes",
    label: "Instruções",
    maxLength: MAX_EXTRA,
    ...(split
      ? {
          placeholder: "Ex.: frasco de perfume sobre uma mesa de mármore, a câmera se aproxima devagar",
          supporting: "A cena, sem pessoas: o que aparece e o movimento.",
          showIf: { idioma: [NO_SPEECH] },
        }
      : {
          placeholder: "Ex.: apresentadora animada num estúdio, gesticula e sorri no final",
          supporting: "A cena, o jeito de falar e o estilo do vídeo.",
          perAvatar: true,
        }),
  };
  return {
  ...(v.family ? {} : { agent: OMNI_AGENT }),
  id: v.id,
  family: v.family,
  version: v.version,
  name: `Gemini Omni ${v.version} Flash`,
  model: `google/gemini-omni-${v.version}-flash`,
  summary: split ? "O avatar da foto fala o seu texto, ou uma cena sem pessoas que você descreve. Clipes curtos." : "O avatar da foto fala o seu texto, ou só faz a cena que você descreve. Clipes curtos.",
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
    const speech: Field[] = [
      {
        kind: "select",
        name: "idioma",
        label: "Idioma da fala",
        options: [...LANGUAGES.map((l) => ({ value: l.id, label: l.label })), { value: NO_SPEECH, label: split ? "Sem fala: cena sem pessoa" : "Sem fala", divider: true }],
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
    ];
    return [
      // Na 1.2, as instruções só existem sem fala: ficam no bloco da Fala, no lugar do Texto.
      ...(split ? [{ title: "Fala", fields: [...speech, instructions] }] : [{ title: "Cena", fields: [instructions] }, { title: "Fala", fields: speech }]),
      {
        title: "Avatar",
        fields: [
          split
            ? { kind: "image" as const, name: "imagem", label: "Foto", required: false, supporting: "Com fala, a foto do avatar. Sem fala, opcional e sem pessoas." }
            : { kind: "image" as const, name: "imagem", label: "Foto do avatar", required: true, supporting: "Vira o primeiro quadro do vídeo." },
        ],
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
    const silent = values("idioma") === NO_SPEECH;
    // Na 1.2 com fala não há instruções: o campo fica escondido e, se vier (o agente), é recusado.
    const scene = !split || silent;
    const extra = values("instrucoes").replace(/\s+/g, " ").trim();
    if (scene && !extra) throw new InputError(ERROS.instrucoes);
    if (!scene && extra) throw new InputError(ERROS.cenaComFala);
    if (extra.length > MAX_EXTRA) throw new InputError(ERROS.instrucoesLongas(MAX_EXTRA));
    const language = silent ? null : languageById(values("idioma"));
    if (!silent && !language) throw new InputError(ERROS.idioma);
    const speech = silent ? "" : cleanSpeech(values("fala"));
    if (!silent && !speech) throw new InputError(ERROS.fala);
    if (speech.length > MAX_OMNI_SPEECH) throw new InputError(ERROS.falaLonga(MAX_OMNI_SPEECH));
    // A cena sem pessoa da 1.2 sai só do texto, se não houver foto.
    if (!hasImage && !(split && silent)) throw new InputError(ERROS.foto);

    const duration = Number(values("duracao"));
    const resolution = values("resolucao");
    const aspectRatio = values("formato");
    const prompt = split && language ? omniTalkPrompt(speech, language) : omniPrompt(extra, speech, language ?? null);
    return {
      request: { prompt, duration, resolution, aspect_ratio: aspectRatio, generate_audio: true },
      image: hasImage ? "first_frame" : null,
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
      // Na 1.2 com fala não há instruções a mostrar.
      ...(video.extra || !split ? [{ term: "Instruções", description: video.extra ?? "—" }] : []),
    ];
  },
  };
}

export const OMNI = omniVersion({ id: "omni", version: "1.2", split: true });
export const OMNI_11 = omniVersion({ id: "omni-11", version: "1.1", family: OMNI.id });


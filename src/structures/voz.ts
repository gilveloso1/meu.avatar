/**
 * Modelos de fala: o texto vira áudio (MP3) pela API de fala do OpenRouter (POST /audio/speech),
 * que responde na hora. O áudio fica na tabela dos vídeos, marcado pela estrutura
 * (`output: "audio"`), e entra no HeyGen Avatar como "Meu áudio" para virar o vídeo falado.
 * Cada modelo é uma estrutura feita por `speechStructure`, que só muda o modelo e as vozes.
 *
 * Custo: o OpenRouter cobra por caractere do texto (`pricing.prompt` em GET /models); a resposta
 * não traz o custo, que sai do preço vezes os caracteres enviados.
 * Comparação e testes em docs/modelos/elevenlabs-v4.md e docs/modelos/fish-audio-drama-3.md.
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { WORDS_PER_SECOND } from "../prompt";
import { speechSeconds } from "./heygen";
import type { FishVoice } from "../fish";
import { MAX_CLONE_NAME, NEW_CLONE, SOURCES } from "./heygen-direta";
import { type Built, type Field, InputError, type Lists, type Option, type Structure, type VoiceOption } from "./types";
import { CAMPOS, num, txt, voz } from "./agente";

/** O ElevenLabs v4 aceita 10.000 caracteres por pedido; a metade basta para vídeo curto. */
export const MAX_SPEECH = 5000;

/** O texto da amostra de cada voz (gerada uma vez e guardada no R2). */
export const PREVIEW_TEXT = "Oi! Essa é a minha voz. Posso falar no seu vídeo, no seu anúncio ou onde você quiser.";

/**
 * As emoções da fala: na tela, em português (a pessoa digita # no Texto e escolhe); no texto que vai
 * para o modelo e para o agente, a marcação em inglês entre colchetes, a que o ElevenLabs e o Fish
 * entendem. `value` é a marcação; `label`, o nome na tela.
 */
export const EMOTIONS: Option[] = [
  { value: "excited", label: "animação" },
  { value: "happy", label: "alegria" },
  { value: "calm", label: "calma" },
  { value: "serious", label: "seriedade" },
  { value: "sad", label: "tristeza" },
  { value: "angry", label: "raiva" },
  { value: "nervous", label: "nervosismo" },
  { value: "curious", label: "curiosidade" },
  { value: "sarcastic", label: "ironia" },
  { value: "whispers", label: "sussurro" },
  { value: "shouts", label: "grito" },
  { value: "laughs", label: "risada" },
  { value: "sighs", label: "suspiro" },
  { value: "short pause", label: "pausa" },
];

/** Sem acento e em minúsculas: a emoção escrita à mão ("[Risada]", "[sussurro]") também vale. */
const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const BY_NAME = new Map(EMOTIONS.flatMap((e) => [[plain(e.label), e.value], [plain(e.value), e.value]]));
const BRACKET = /\[([^\]\[]{1,120})\]/g;

/** As emoções de um colchete ("sussurro, risada"), já em inglês; null se alguma não é da lista. */
export function speechTags(content: string): string[] | null {
  const tags = content.split(",").map((part) => BY_NAME.get(plain(part)));
  return tags.every((t): t is string => t !== undefined) ? tags : null;
}

/**
 * O texto como vai para o modelo: os espaços e as quebras de linha viram um espaço só, cada emoção da
 * lista, em português ou em inglês, vira a marcação em inglês, e as emoções seguidas vão juntas num
 * colchete só (`[whispers, laughs]`), como o ElevenLabs pede. Outro texto entre colchetes segue igual.
 */
export function speechText(text: string): string {
  const out: string[] = [];
  let last = 0, open: string[] | null = null;
  const flush = () => {
    if (open) out.push(`[${open.join(", ")}]`);
    open = null;
  };
  for (const m of text.matchAll(BRACKET)) {
    const between = text.slice(last, m.index);
    const tags = speechTags(m[1]!);
    // Só espaço entre esta emoção e a anterior: entram no mesmo colchete.
    if (tags && open && !between.trim()) open.push(...tags.filter((t) => !open!.includes(t)));
    else {
      flush();
      out.push(between);
      if (tags) open = [...tags];
      else out.push(m[0]);
    }
    last = m.index! + m[0].length;
  }
  flush();
  out.push(text.slice(last));
  return out.join("").replace(/\s+/g, " ").trim();
}

/** A fala sem as emoções da lista: o que a voz diz (títulos, contagem de palavras, Copiar). */
export const spokenText = (text: string) =>
  text
    .replace(BRACKET, (all, content: string) => (speechTags(content) ? " " : all))
    .replace(/\s+/g, " ")
    .trim();

/** O preço do texto: os caracteres enviados vezes o preço de cada um. */
export function speechCost(model: Pick<VideoModel, "pricing_skus">, text: string): number | null {
  const price = Number(model.pricing_skus?.character);
  return price ? Math.round(price * speechText(text).length * 10_000) / 10_000 : null;
}

interface SpeechModel {
  id: string;
  name: string;
  model: string;
  summary: string;
  /** As vozes do modelo: o que o OpenRouter informa (ElevenLabs) ou o catálogo do provedor, nas listas (Fish). */
  voices(model: VideoModel | null, lists?: Lists): VoiceOption[];
  /** Clona voz (Voz pronta | Voz clonada, como a HeyGen direta); a gravação vai em cada pedido. */
  clone?: boolean;
  /** Quando o agente usa este modelo (listar_modelos). */
  use: string;
}

/** A fonte da voz nos modelos que clonam: a mesma escolha da HeyGen, sem o "Meu áudio". */
const SPEECH_SOURCES = SOURCES.filter((s) => s.value !== "audio");
/** O Fish recebe a gravação em cada pedido: até 15 MB (o limite do OpenRouter para a referência). */
export const MAX_CLONE_BYTES = 15 * 1024 * 1024;

export function speechStructure(o: SpeechModel): Structure {
  return {
    id: o.id,
    name: o.name,
    model: o.model,
    summary: o.summary,
    icon: "record_voice_over",
    access: "admin",
    output: "audio",
    agent: {
      use: o.use,
      fields: {
        texto: `O que a voz lê, até ${MAX_SPEECH} caracteres. Emoções entre colchetes, em inglês, antes do trecho: ${EMOTIONS.map((e) => `[${e.value}]`).join(", ")}; duas seguidas, como [whispers, laughs]. Obrigatório.`,
        voz: `Id de uma voz de listar_vozes {modelo: "${o.id}"}${o.clone ? " (pronta ou clonada, como a de um avatar)" : ""}. Obrigatória.`,
        ...(o.clone ? { consentimento: "true quando a pessoa confirmou que a voz é dela ou que tem autorização: a voz de um avatar no primeiro uso." } : {}),
      },
      required: ["texto", "voz"],
      values: (a, lists) => ({ ...voz(a, lists), texto: txt(a, "texto") }),
    },
    treatAudio: false,
    quickEdit: false,
    wordsPerSecond: WORDS_PER_SECOND,
    cost: { sku: "character", seconds: { characters: "texto" } },

    sections(model, _defaults, lists = {}) {
      const voices = o.voices(model, lists);
      const voice = voices.length ? [{ kind: "voice" as const, name: "voz", label: "Voz pronta", voices, value: voices[0]!.value, ...(o.clone ? { showIf: { fonte: ["pronta"] } } : {}) }] : [];
      // A voz clonada, no molde da HeyGen direta: a lista das vozes da pessoa e dos avatares, e a nova.
      const clones = [...(lists.clones ?? []), { value: NEW_CLONE, label: "Clonar uma voz nova" }];
      const newClone = { fonte: ["clonada"], clone: [NEW_CLONE] };
      const clone: Field[] = o.clone
        ? [
            { kind: "segmented", name: "fonte", label: "Voz", options: SPEECH_SOURCES, value: "pronta", hideLabel: true },
            ...voice,
            { kind: "select", name: "clone", label: "Voz clonada", options: clones, value: clones[0]!.value, showIf: { fonte: ["clonada"] } },
            { kind: "audio", name: "amostra", label: "Gravação da voz", supporting: "MP3 ou WAV, de 15 s a 3 min de fala limpa.", showIf: newClone },
            { kind: "text", name: "nome_voz", label: "Nome da voz", maxLength: MAX_CLONE_NAME, placeholder: "Ex.: Minha voz", supporting: "Para achar a voz na lista depois.", showIf: newClone },
            { kind: "checkbox", name: "consentimento", label: "A voz é minha ou tenho autorização para cloná-la.", showIf: { fonte: ["clonada"], clone: [NEW_CLONE, ...(lists.newClones ?? [])] } },
          ]
        : voice;
      return [
        {
          title: "Fala",
          fields: [
            ...clone,
            {
              kind: "textarea",
              name: "texto",
              label: "Texto",
              maxLength: MAX_SPEECH,
              placeholder: "O texto que a voz lê. Ex.: Gente, eu preciso contar uma coisa!",
              supporting: "Digite # para escolher uma emoção.",
              speech: true,
              tags: EMOTIONS,
            },
          ],
        },
      ];
    },

    build(values, _hasImage, model, _video, lists = {}) {
      const text = speechText(values("texto"));
      // Só emoções, sem nada para a voz dizer, não vale.
      if (!spokenText(text)) throw new InputError(ERROS.textoFala);
      if (text.length > MAX_SPEECH) throw new InputError(ERROS.falaLonga(MAX_SPEECH));
      const source = o.clone ? SPEECH_SOURCES.find((s) => s.value === values("fonte"))?.value : "pronta";
      if (!source) throw new InputError(ERROS.fonteVoz);
      let settings: Record<string, string>;
      let speech: Built["speech"];
      if (source === "pronta") {
        const voice = o.voices(model, lists).find((v) => v.value === values("voz"));
        if (!voice) throw new InputError(ERROS.voz);
        settings = { voice_id: voice.value, voice: voice.name };
      } else {
        // A voz clonada: a nova (gravação, nome e consentimento), uma da pessoa ou a de um avatar.
        const clone = values("clone");
        let cloneName: string | null = null;
        if (clone === NEW_CLONE) {
          cloneName = values("nome_voz").replace(/\s+/g, " ").trim().slice(0, MAX_CLONE_NAME);
          if (!cloneName) throw new InputError(ERROS.nomeVoz);
          if (values("consentimento") !== "sim") throw new InputError(ERROS.consentimentoVoz);
        } else {
          const known = lists.clones?.find((c) => c.value === clone);
          if (!known) throw new InputError(ERROS.vozClonada);
          if (lists.newClones?.includes(clone) && values("consentimento") !== "sim") throw new InputError(ERROS.consentimentoVoz);
          cloneName = known.label;
        }
        speech = { clone, cloneName };
        settings = { source: "clonada", voice: cloneName };
      }
      return {
        request: { prompt: text },
        image: null,
        ...(speech ? { speech } : {}),
        record: {
          prompt: text,
          // Estimativa pela fala; a duração certa sai do MP3 quando ele fica pronto.
          duration: speechSeconds(spokenText(text), WORDS_PER_SECOND),
          resolution: "",
          aspect_ratio: "",
          request_prompt: text,
          style: null,
          language: null,
          extra: null,
          settings,
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
      const voice = settings.voice ?? "—";
      return [{ term: "Voz", description: settings.source === "clonada" ? `Voz clonada · ${voice}` : voice }];
    },
  };
}

/**
 * As vozes prontas do ElevenLabs pelo OpenRouter (as 21 de `supported_voices`). O OpenRouter só dá
 * o id; o gênero vem da biblioteca do ElevenLabs. Todas falam português (multilíngues).
 */
const ELEVEN_GENDERS: Record<string, "female" | "male"> = {
  alice: "female", bella: "female", jessica: "female", laura: "female", lily: "female", matilda: "female", sarah: "female",
  adam: "male", bill: "male", brian: "male", callum: "male", charlie: "male", chris: "male", daniel: "male", eric: "male",
  george: "male", harry: "male", liam: "male", roger: "male", will: "male",
};

export function elevenVoices(model: VideoModel | null): VoiceOption[] {
  const ids = model?.supported_voices ?? [];
  return ids
    .map((id): VoiceOption => {
      const name = id.charAt(0).toUpperCase() + id.slice(1);
      const gender = ELEVEN_GENDERS[id] ?? "";
      return { value: id, label: [name, gender === "female" ? "feminina" : gender === "male" ? "masculina" : "", "multilíngue"].filter(Boolean).join(" · "), name, gender, language: "Multilíngue", preview: true };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

export const ELEVENLABS = speechStructure({
  id: "elevenlabs",
  name: "ElevenLabs v4",
  model: "elevenlabs/eleven-v4",
  summary: "Transforma o texto em fala, com direção de atuação.",
  use: "Fala com um pouco mais de qualidade e direção de atuação (uns US$ 0,08 por minuto); só vozes prontas.",
  voices: elevenVoices,
});

/** Ordem das línguas no menu do Fish: português do Brasil primeiro. */
const FISH_LANGUAGE_RANK = ["Português (Brasil)", "Português (Portugal)", "Inglês", "Espanhol"];

/**
 * As vozes do Fish Audio: só as oficiais (a conta "Fish Official", lidas do Fish em src/fish.ts), não
 * a biblioteca aberta, em que muitas imitam gente famosa ou trazem a descrição errada. O id é o
 * `reference_id` do Fish (o `voice` do OpenRouter).
 */
export function fishVoices(voices: FishVoice[]): VoiceOption[] {
  const rank = (language: string) => FISH_LANGUAGE_RANK.indexOf(language);
  return voices
    .map((v): VoiceOption => ({
      value: v.id,
      label: [v.name, v.gender === "female" ? "feminina" : v.gender === "male" ? "masculina" : "", v.language.toLowerCase()].filter(Boolean).join(" · "),
      name: v.name,
      gender: v.gender,
      language: v.language,
      preview: true,
    }))
    .sort((a, b) => rank(a.language) - rank(b.language) || a.name.localeCompare(b.name, "pt"));
}

export const FISH = speechStructure({
  id: "fish",
  name: "Fish Audio",
  model: "fish-audio/drama-3",
  summary: "Transforma o texto em fala, com vozes em português, inglês e espanhol.",
  use: "Fala barata (uns US$ 0,002 por minuto), vozes prontas em português, inglês e espanhol ou a voz clonada de um avatar (como a de um personagem).",
  // As vozes vêm do catálogo do Fish (Studio.lists), já em VoiceOption.
  voices: (_model, lists) => lists?.voices ?? [],
  clone: true,
});

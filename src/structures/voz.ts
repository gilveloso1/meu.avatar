/**
 * Modelos de fala: o texto vira áudio (MP3) pela API de fala do OpenRouter (POST /audio/speech),
 * que responde na hora. O áudio fica na tabela dos vídeos, marcado pela estrutura
 * (`output: "audio"`), e entra no HeyGen Avatar como "Meu áudio" para virar o vídeo falado.
 * Cada modelo é uma estrutura feita por `speechStructure`, que só muda o modelo e as vozes.
 *
 * Custo: o OpenRouter cobra por caractere do texto (`pricing.prompt` em GET /models); a resposta
 * não traz o custo, que sai do preço vezes os caracteres enviados.
 * Comparação e testes em docs/modelos/elevenlabs-v4.md.
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { WORDS_PER_SECOND } from "../prompt";
import { speechSeconds } from "./heygen";
import { InputError, type Option, type Structure, type VoiceOption } from "./types";

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
  /** As vozes do modelo, a partir do que o OpenRouter informa (ou a lista própria da estrutura). */
  voices(model: VideoModel | null): VoiceOption[];
}

export function speechStructure(o: SpeechModel): Structure {
  return {
    id: o.id,
    name: o.name,
    model: o.model,
    summary: o.summary,
    icon: "record_voice_over",
    access: "admin",
    output: "audio",
    treatAudio: false,
    quickEdit: false,
    wordsPerSecond: WORDS_PER_SECOND,
    cost: { sku: "character", seconds: { characters: "texto" } },

    sections(model) {
      const voices = o.voices(model);
      return [
        {
          title: "Fala",
          fields: [
            ...(voices.length ? [{ kind: "voice" as const, name: "voz", label: "Voz", voices, value: voices[0]!.value }] : []),
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

    build(values, _hasImage, model) {
      const text = speechText(values("texto"));
      // Só emoções, sem nada para a voz dizer, não vale.
      if (!spokenText(text)) throw new InputError(ERROS.textoFala);
      if (text.length > MAX_SPEECH) throw new InputError(ERROS.falaLonga(MAX_SPEECH));
      const voice = o.voices(model).find((v) => v.value === values("voz"));
      if (!voice) throw new InputError(ERROS.voz);
      return {
        request: { prompt: text },
        image: null,
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
          settings: { voice_id: voice.value, voice: voice.name },
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
      return [{ term: "Voz", description: settings.voice ?? "—" }];
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
  voices: elevenVoices,
});

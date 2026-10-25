/**
 * Monta o prompt que vai para o modelo a partir do formulário: o estilo
 * escolhido (direção pronta, em inglês), as instruções extras, a fala entre
 * aspas e, no fim, a orientação fixa de qualidade (o "system prompt" do
 * estúdio). Mantém tudo curto: o Higgsfield recomenda prompts de até ~200
 * tokens, porque os modelos distorcem com textos longos.
 *
 * Por que cada parte (pesquisa de 25/10/2026, ver docs/prompt.md):
 * - Direção em inglês e só a fala no idioma do vídeo: é como o Higgsfield monta
 *   os prompts (skills/higgsfield-video-explainer/references/prompts.md).
 * - Fala como `<quem> says: "<fala>"`: o formato de diálogo do guia oficial do
 *   Wan 3.0; sem aspas o modelo não sabe onde a fala começa e termina.
 * - Áudio descrito por extenso e música/efeitos negados: no Wan 3.0 o áudio sai
 *   na mesma geração do vídeo, e o modelo preenche a trilha sozinho quando o
 *   prompt não diz nada.
 * - Voz baixa, pedida duas vezes (no verbo da fala e na orientação de áudio):
 *   pelo OpenRouter o Wan devolve a voz uns 8 dB acima do padrão e cortada
 *   (1º vídeo: 8,8% das amostras, −5 LUFS; 2º, só com "moderate volume": 4,8%,
 *   −6,5 LUFS), enquanto o mesmo pedido no Higgsfield saiu a −14 LUFS. O verbo
 *   com o jeito de falar fica colado na fala, onde o modelo mais presta atenção.
 * - "Lip sync" e "no subtitles": a sincronia labial é pedida assim no guia
 *   oficial, e sem legenda a fala fica no áudio em vez de virar texto na tela.
 */

export interface Style {
  id: string;
  /** Nome na lista do formulário. */
  label: string;
  /** Uma linha, em português, para quem escolhe. */
  description: string;
  /** A direção que vai para o modelo, em inglês. */
  direction: string;
}

/** Estilos prontos. O primeiro é o padrão do formulário. */
export const STYLES: Style[] = [
  {
    id: "selfie",
    label: "Selfie para a câmera",
    description: "Câmera parada, olhar fixo, fala natural de rede social.",
    direction:
      "Vertical selfie-style video. The person in the photo looks straight into the camera, keeps the starting position and talks calmly and naturally, " +
      "like a casual social media update. Locked-off static camera, medium close-up, no zoom, no cuts. Subtle natural head movement and blinking.",
  },
  {
    id: "apresentador",
    label: "Apresentador",
    description: "Estúdio limpo, postura firme, tom de quem apresenta.",
    direction:
      "The person in the photo is a confident presenter speaking straight to the camera in a clean, softly lit studio. " +
      "Static camera on a tripod, medium shot, no zoom, no cuts. Composed posture, measured hand gestures, natural blinking.",
  },
  {
    id: "review",
    label: "Review de produto (UGC)",
    description: "Filmado no celular, mostrando o produto, com entusiasmo real.",
    direction:
      "Authentic user-generated product review filmed on a phone. The person in the photo talks to the camera with warm, genuine interest, " +
      "holding and showing the product mentioned in the speech. Steady handheld framing, medium close-up, natural daylight, no cuts. " +
      "Natural expressions and hand gestures.",
  },
];

export interface Language {
  id: string;
  label: string;
  /** Como o idioma vai escrito no prompt. */
  english: string;
}

/** Idiomas da fala. O primeiro é o padrão. */
export const LANGUAGES: Language[] = [
  { id: "pt-BR", label: "Português", english: "Brazilian Portuguese" },
  { id: "en-US", label: "Inglês", english: "American English" },
  { id: "es", label: "Espanhol", english: "Latin American Spanish" },
];

/** Fala natural: umas 2,2 a 2,6 palavras por segundo. */
export const WORDS_PER_SECOND = { min: 2.2, max: 2.6 };
export const MAX_SPEECH = 1500;
export const MAX_EXTRA = 500;

/** Como a fala é apresentada: o verbo já diz o jeito de falar (baixo e calmo). */
export const SPEECH_LEAD = "The person on camera says softly, in a calm, low voice:";

/** A orientação fixa de qualidade, no fim de todo prompt. */
export function qualityGuide(language: Language): string {
  return [
    "Audio: a single soft-spoken voice at low volume, recorded close on a lavalier microphone in a quiet room, mixed quietly with headroom.",
    "The speaker talks gently, as if to someone sitting close, never raising the voice: natural warm mid-range timbre at the real pitch, relaxed pace, soft sibilants.",
    "No background music, no sound effects, no echo, no distortion, no clipping.",
    `Lip sync. The speech is in ${language.english} and says exactly the quoted words.`,
    "Video: photorealistic, steady framing, natural skin texture. No on-screen text, subtitles, captions or watermark.",
  ].join("\n");
}

export interface PromptParts {
  style: Style;
  language: Language;
  /** O que a pessoa fala, sem aspas. */
  speech: string;
  /** Instruções extras sobre o vídeo (opcional). */
  extra?: string;
}

/** O prompt que vai para o modelo. */
export function buildPrompt({ style, language, speech, extra }: PromptParts): string {
  const direction = [style.direction, oneLine(extra ?? "")].filter(Boolean).join("\n");
  return `${direction}\n${SPEECH_LEAD} "${cleanSpeech(speech)}"\n\n${qualityGuide(language)}`;
}

/**
 * A fala numa linha só e sem aspas duplas (que fechariam a citação antes da
 * hora): as de fora saem, as de dentro viram aspas simples.
 */
export function cleanSpeech(speech: string): string {
  return oneLine(speech)
    .replace(/^["“”«»]+|["“”«»]+$/g, "")
    .replace(/["“”«»]/g, "'")
    .trim();
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function styleById(id: string): Style | undefined {
  return STYLES.find((s) => s.id === id);
}

export function languageById(id: string): Language | undefined {
  return LANGUAGES.find((l) => l.id === id);
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

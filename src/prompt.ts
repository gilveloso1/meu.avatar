/**
 * Orientação fixa que vai no fim de todo prompt de vídeo (o "system prompt"
 * do estúdio). Curta de propósito: o Higgsfield recomenda prompts de até
 * ~200 tokens, porque os modelos distorcem com textos longos.
 *
 * Por que cada parte (pesquisa de 25/10/2026, ver docs/prompt.md):
 * - Em inglês, com só a fala no idioma do vídeo: é como o Higgsfield monta os
 *   prompts (skills/higgsfield-video-explainer/references/prompts.md).
 * - Áudio descrito por extenso e música/efeitos negados: no Wan 3.0 o áudio sai
 *   na mesma geração do vídeo, e o modelo preenche a trilha sozinho quando o
 *   prompt não diz nada (guia oficial e guias da Runware e da Scenario).
 * - Voz em volume moderado, sem distorção: o primeiro vídeo saiu com 8,8% das
 *   amostras cortadas (clipping), RMS de −8 dB e agudos fortes entre 8 e 12 kHz.
 * - "Lip sync" e "no subtitles": a sincronia labial é pedida assim no guia
 *   oficial, e sem legenda a fala fica no áudio em vez de virar texto na tela.
 */
export const QUALITY_GUIDE = [
  "Audio: a single clear voice, recorded close on a lavalier microphone in a quiet, acoustically treated room.",
  "Natural warm mid-range timbre at the speaker's real pitch, relaxed conversational pace, moderate even volume, soft sibilants.",
  "No background music, no sound effects, no echo, no distortion, no clipping.",
  "Lip sync. The speech is in Brazilian Portuguese and says exactly the quoted words.",
  "Video: photorealistic, steady framing, natural skin texture. No on-screen text, no subtitles, no captions, no watermark.",
].join("\n");

/** O prompt que vai para o modelo: o da pessoa, e a orientação fixa no fim. */
export function buildPrompt(userPrompt: string): string {
  return `${userPrompt.trim()}\n\n${QUALITY_GUIDE}`;
}

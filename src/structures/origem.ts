/**
 * Peças das estruturas que recebem um vídeo de origem (Seedance, Aleph 2, FLUX Video Edit): a
 * conferência da duração e o preço em centavos por segundo que os modelos de edição publicam.
 */
import type { VideoModel } from "../openrouter";
import { ERROS } from "../erros";
import { InputError, type SourceVideo } from "./types";

/** O vídeo de origem, se veio e tem a duração aceita (meio segundo de folga no fim); senão, InputError. */
export function sourceWithin(video: SourceVideo | null, range: { min: number; max: number }): SourceVideo {
  if (!video) throw new InputError(ERROS.videoOrigem);
  if (video.seconds < range.min || video.seconds > range.max + 0.5) throw new InputError(ERROS.videoDuracao(range.min, range.max));
  return video;
}

/** O preço por segundo (`segundo`, em US$) de quem publica em centavos (`cents_per_second_output`). */
export function centsPerSecond(model: VideoModel): Record<string, string> {
  const cents = Number(model.pricing_skus?.cents_per_second_output);
  return cents ? { segundo: String(cents / 100) } : {};
}

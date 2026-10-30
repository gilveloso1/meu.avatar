import type { Platform, Role, Video } from "../db";
import { ALEPH } from "./aleph";
import type { VideoModel } from "../openrouter";
import { HEYGEN_AVATAR, speechSeconds } from "./heygen";
import { HEYGEN_DIRECT } from "./heygen-direta";
import { SEEDANCE } from "./seedance";
import type { CostRule, Structure, Values } from "./types";
import { WAN } from "./wan";

export * from "./types";

/** As estruturas, na ordem dos cartões. O Wan é a primeira. */
export const STRUCTURES: Structure[] = [WAN, HEYGEN_AVATAR, SEEDANCE, ALEPH];

export function structureById(id: string | null | undefined): Structure | undefined {
  return STRUCTURES.find((s) => s.id === id);
}

/**
 * A estrutura na plataforma escolhida: o HeyGen Avatar IV pela API direta da
 * HeyGen quando a config manda; as outras não mudam.
 */
export function onPlatform(structure: Structure, platform: Platform): Structure {
  return structure.id === HEYGEN_AVATAR.id && platform === "heygen" ? HEYGEN_DIRECT : structure;
}

/** A estrutura que gerou o vídeo, na plataforma em que ele foi feito. */
export function videoStructure(video: Video): Structure | undefined {
  const structure = structureById(video.structure);
  return structure && onPlatform(structure, videoPlatform(video));
}

/** Por onde o vídeo foi feito (guardado nas configurações dele); os antigos, pelo OpenRouter. */
export function videoPlatform(video: Video): Platform {
  try {
    return (JSON.parse(video.settings ?? "{}") as { platform?: string }).platform === "heygen" ? "heygen" : "openrouter";
  } catch {
    return "openrouter";
  }
}

/** A estrutura pode ser vista e usada por quem tem esse papel? */
export function canUse(structure: Structure, role: Role): boolean {
  return structure.access === "all" || role === "admin";
}

/** Preço por segundo de cada SKU da estrutura. */
export function prices(structure: Structure, model: VideoModel): Record<string, string> {
  return structure.prices?.(model) ?? model.pricing_skus ?? {};
}

/**
 * Custo estimado em US$ pela regra da estrutura; undefined se o modelo não tem
 * o preço ou se os segundos só se sabem no navegador (duração do vídeo enviado).
 */
export function estimate(structure: Structure, model: VideoModel, values: Values): number | undefined {
  const rule: CostRule = structure.cost;
  const price = Number(prices(structure, model)[rule.sku.replace(/\{(\w+)\}/g, (_, name: string) => values(name))]);
  const seconds =
    "speech" in rule.seconds && rule.seconds.audio && values("fonte") === "audio"
      ? 0
      : "field" in rule.seconds ? Number(values(rule.seconds.field)) : "speech" in rule.seconds ? speechSeconds(values(rule.seconds.speech), structure.wordsPerSecond) : 0;
  return price && seconds ? price * seconds + (rule.extra ?? 0) : undefined;
}

/** O menor preço por segundo do modelo, para o cartão de escolha. */
export function lowestPrice(model: VideoModel): number | undefined {
  const prices = Object.entries(model.pricing_skus ?? {})
    .filter(([sku]) => sku.startsWith("duration_seconds"))
    .map(([, value]) => Number(value))
    .filter((n) => n > 0);
  return prices.length ? Math.min(...prices) : undefined;
}

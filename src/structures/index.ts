import type { Role } from "../db";
import type { VideoModel } from "../openrouter";
import { HEYGEN_AVATAR, speechSeconds } from "./heygen";
import type { CostRule, Structure, Values } from "./types";
import { WAN } from "./wan";

export * from "./types";

/** As estruturas, na ordem dos cartões. O Wan é a primeira. */
export const STRUCTURES: Structure[] = [WAN, HEYGEN_AVATAR];

export function structureById(id: string | null | undefined): Structure | undefined {
  return STRUCTURES.find((s) => s.id === id);
}

/** A estrutura pode ser vista e usada por quem tem esse papel? */
export function canUse(structure: Structure, role: Role): boolean {
  return structure.access === "all" || role === "admin";
}

/** Custo estimado em US$ pela regra da estrutura; undefined se o modelo não tem o preço. */
export function estimate(structure: Structure, model: VideoModel, values: Values): number | undefined {
  const rule: CostRule = structure.cost;
  const price = Number(model.pricing_skus?.[rule.sku.replace(/\{(\w+)\}/g, (_, name: string) => values(name))]);
  const seconds = "field" in rule.seconds ? Number(values(rule.seconds.field)) : speechSeconds(values(rule.seconds.speech), structure.wordsPerSecond);
  return price && seconds ? price * seconds : undefined;
}

/** O menor preço por segundo do modelo, para o cartão de escolha. */
export function lowestPrice(model: VideoModel): number | undefined {
  const prices = Object.entries(model.pricing_skus ?? {})
    .filter(([sku]) => sku.startsWith("duration_seconds"))
    .map(([, value]) => Number(value))
    .filter((n) => n > 0);
  return prices.length ? Math.min(...prices) : undefined;
}

import { resolveItemStats } from "./stats";
import type { GearItem, HybridScalingRule, ScoredItem } from "./types";
import type { StatKey, StatMap } from "./vocabulary";

export const SYSTEM_POWER_KEYS = ["pve_power", "pvp_power"] as const satisfies readonly StatKey[];
const systemPowerKeys = new Set<StatKey>(SYSTEM_POWER_KEYS);

export type PowerContext = "pve" | "pvp";

export interface WeightProfile {
  weights: StatMap;
  context?: PowerContext;
  caps?: Partial<Record<StatKey, { soft?: number; hard?: number; afterSoftCapWeight?: number }>>;
  hybridRules?: HybridScalingRule[];
}

export function calculateEp(stats: StatMap, profile: WeightProfile): number {
  let score = 0;
  for (const [key, value] of Object.entries(stats) as Array<[StatKey, number]>) {
    // Ascension Power is an endgame progression system, not a normal EP stat.
    // It is compared separately so a guessed conversion cannot distort EP.
    if (systemPowerKeys.has(key)) continue;
    const weight = profile.weights[key] ?? 0;
    const cap = profile.caps?.[key];
    if (!cap?.soft) {
      score += Math.min(value, cap?.hard ?? Number.POSITIVE_INFINITY) * weight;
      continue;
    }
    const below = Math.min(value, cap.soft);
    const above = Math.max(0, Math.min(value, cap.hard ?? Number.POSITIVE_INFINITY) - cap.soft);
    score += below * weight + above * weight * (cap.afterSoftCapWeight ?? 0.25);
  }
  return score;
}

export function isSystemPowerKey(key: StatKey): key is (typeof SYSTEM_POWER_KEYS)[number] {
  return systemPowerKeys.has(key);
}

export function withoutSystemPowerWeights(weights: StatMap): StatMap {
  return Object.fromEntries((Object.entries(weights) as Array<[StatKey, number]>)
    .filter(([key]) => !isSystemPowerKey(key))) as StatMap;
}

export function contextualPower(stats: StatMap, level: number, context?: PowerContext): number {
  if (level < 60 || !context) return 0;
  return stats[context === "pve" ? "pve_power" : "pvp_power"] ?? 0;
}

export function scoreItem(item: GearItem, level: number, profile: WeightProfile): ScoredItem {
  const resolvedStats = resolveItemStats(item, level, profile.hybridRules);
  const scale = item.scaleSnapshots?.find((snapshot) => snapshot.effectiveLevel === level);
  return {
    ...item,
    ...(scale ? { itemLevel: scale.itemLevel, requiredLevel: scale.requiredLevel, armor: scale.armor } : {}),
    resolvedStats,
    ep: calculateEp(resolvedStats, profile),
  };
}

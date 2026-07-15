import { contextualPower, type PowerContext } from "./scoring";
import type { GearItem, ScoredItem } from "./types";
import type { StatKey, StatMap } from "./vocabulary";

/**
 * At max level, compare the matching Ascension progression power first and
 * use normal EP as the tie-breaker. Below max level, ranking is EP-only.
 */
export function compareScoredItems(a: ScoredItem, b: ScoredItem, level: number, context?: PowerContext): number {
  // Cache templates are valuable for discovery but can disagree with the live
  // tooltip. Never let provisional values displace directly verified gear.
  const confidence = (item: GearItem) => item.dataSource === "COA_INGAME_SCAN" || item.dataSource === "USER_VERIFIED" ? 2
    : item.dataSource === "PLAYER_IMPORT" ? 1 : 0;
  const confidenceDifference = confidence(b) - confidence(a);
  if (confidenceDifference) return confidenceDifference;
  const powerDifference = contextualPower(b.resolvedStats, level, context) - contextualPower(a.resolvedStats, level, context);
  return Math.abs(powerDifference) > 0.001 ? powerDifference : b.ep - a.ep;
}

export function statDelta(candidate: ScoredItem, equipped?: ScoredItem): StatMap {
  const result: StatMap = {};
  const keys = new Set<StatKey>([
    ...Object.keys(candidate.resolvedStats) as StatKey[],
    ...Object.keys(equipped?.resolvedStats ?? {}) as StatKey[],
  ]);
  for (const key of keys) {
    const delta = (candidate.resolvedStats[key] ?? 0) - (equipped?.resolvedStats[key] ?? 0);
    if (Math.abs(delta) > 0.001) result[key] = delta;
  }
  return result;
}

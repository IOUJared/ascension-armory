import { calculateEp, isSystemPowerKey, resolveItemStats, type GearItem, type StatKey, type StatMap, type WeightProfile } from "@/domain/gear";
import { FALLBACK_WEIGHTS } from "./planner.constants";
import type { PlannerLoadout } from "./planner.reducer";

export interface LoadoutTotals {
  ep: number;
  stats: StatMap;
}

export function selectActiveWeightKeys(weights: StatMap): StatKey[] {
  return (Object.entries(weights) as Array<[StatKey, number]>)
    .filter(([key, value]) => value > 0 && !isSystemPowerKey(key))
    .sort((left, right) => right[1] - left[1])
    .map(([key]) => key);
}

export function selectEditableWeightKeys(weights: StatMap, profileWeights: StatMap = FALLBACK_WEIGHTS): StatKey[] {
  const keys = [...new Set([...Object.keys(profileWeights), ...Object.keys(weights)] as StatKey[])]
    .filter((key) => !isSystemPowerKey(key));
  const originalOrder = new Map(keys.map((key, index) => [key, index]));
  return keys.sort((left, right) =>
    (weights[right] ?? 0) - (weights[left] ?? 0)
      || (originalOrder.get(left) ?? 0) - (originalOrder.get(right) ?? 0));
}

export function selectLoadoutTotals(loadout: PlannerLoadout, level: number, profile: WeightProfile): LoadoutTotals {
  return Object.values(loadout).reduce<LoadoutTotals>((totals, item) => {
    const resolved = resolveItemStats(item, level, profile.hybridRules);
    totals.ep += calculateEp(resolved, profile);
    for (const [key, value] of Object.entries(resolved) as Array<[StatKey, number]>) {
      totals.stats[key] = (totals.stats[key] ?? 0) + value;
    }
    return totals;
  }, { ep: 0, stats: {} });
}

export function selectSummaryKeys(activeWeightKeys: StatKey[], stats: StatMap): StatKey[] {
  return activeWeightKeys
    .filter((key) => key !== "weapon_dps" && (stats[key] ?? 0) > 0)
    .slice(0, 6);
}

export function selectHasGearEnchants(loadout: PlannerLoadout): boolean {
  return Object.values(loadout).some((item: GearItem) =>
    item.enhancements?.some((enhancement) => enhancement.kind === "ENCHANT"));
}

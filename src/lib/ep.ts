import type { GearItem, HybridScalingRule, ScoredItem, StatKey, StatMap } from "@/types/gear";

export interface WeightProfile {
  weights: StatMap;
  caps?: Partial<Record<StatKey, { soft?: number; hard?: number; afterSoftCapWeight?: number }>>;
  hybridRules?: HybridScalingRule[];
}

function addStats(target: StatMap, source: StatMap, multiplier = 1): void {
  for (const [key, value] of Object.entries(source) as Array<[StatKey, number]>) {
    target[key] = (target[key] ?? 0) + value * multiplier;
  }
}

export function resolveItemStats(item: GearItem, level: number, profileRules: HybridScalingRule[] = []): StatMap {
  const resolved: StatMap = { ...item.stats };
  if (item.armor) resolved.armor = (resolved.armor ?? 0) + item.armor;
  if (item.weaponDamage) resolved.weapon_dps = (resolved.weapon_dps ?? 0) + item.weaponDamage.dps;
  for (const effect of item.effects ?? []) if (effect.estimatedStats) addStats(resolved, effect.estimatedStats);
  for (const enhancement of item.enhancements ?? []) {
    addStats(resolved, enhancement.stats);
    if (enhancement.perLevel) addStats(resolved, enhancement.perLevel, level);
    applyHybridRules(resolved, enhancement.hybridScaling ?? []);
  }
  applyHybridRules(resolved, profileRules);
  return resolved;
}

function applyHybridRules(stats: StatMap, rules: HybridScalingRule[]): void {
  for (const rule of rules) {
    const converted = Math.min((stats[rule.source] ?? 0) * rule.coefficient, rule.cap ?? Number.POSITIVE_INFINITY);
    if (rule.mode === "HIGHEST_OF") stats[rule.target] = Math.max(stats[rule.target] ?? 0, converted);
    else stats[rule.target] = (stats[rule.target] ?? 0) + converted;
  }
}

export function calculateEp(stats: StatMap, profile: WeightProfile): number {
  let score = 0;
  for (const [key, value] of Object.entries(stats) as Array<[StatKey, number]>) {
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

export function scoreItem(item: GearItem, level: number, profile: WeightProfile): ScoredItem {
  const resolvedStats = resolveItemStats(item, level, profile.hybridRules);
  return { ...item, resolvedStats, ep: calculateEp(resolvedStats, profile) };
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

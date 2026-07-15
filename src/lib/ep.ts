import type { GearItem, HybridScalingRule, ScoredItem, StatKey, StatMap } from "@/types/gear";
import type { GearContext } from "@/types/coa";

export const SYSTEM_POWER_KEYS = ["pve_power", "pvp_power"] as const satisfies readonly StatKey[];
const systemPowerKeys = new Set<StatKey>(SYSTEM_POWER_KEYS);

export interface WeightProfile {
  weights: StatMap;
  context?: GearContext;
  caps?: Partial<Record<StatKey, { soft?: number; hard?: number; afterSoftCapWeight?: number }>>;
  hybridRules?: HybridScalingRule[];
}

function addStats(target: StatMap, source: StatMap, multiplier = 1): void {
  for (const [key, value] of Object.entries(source) as Array<[StatKey, number]>) {
    target[key] = (target[key] ?? 0) + value * multiplier;
  }
}

export function resolveItemStats(item: GearItem, level: number, profileRules: HybridScalingRule[] = []): StatMap {
  const scale = item.scaleSnapshots?.find((snapshot) => snapshot.effectiveLevel === level);
  const resolved: StatMap = { ...(scale?.stats ?? item.stats) };
  const armor = scale ? scale.armor : item.armor;
  const weaponDps = scale ? scale.weaponDps : item.weaponDamage?.dps;
  if (armor) resolved.armor = (resolved.armor ?? 0) + armor;
  if (weaponDps) resolved.weapon_dps = (resolved.weapon_dps ?? 0) + weaponDps;
  for (const effect of item.effects ?? []) if (effect.estimatedStats) addStats(resolved, effect.estimatedStats);
  for (const enhancement of item.enhancements ?? []) {
    addStats(resolved, enhancement.stats);
    if (enhancement.perLevel) addStats(resolved, enhancement.perLevel, level);
    applyHybridRules(resolved, enhancement.hybridScaling ?? []);
  }
  applyHybridRules(resolved, profileRules);
  return resolved;
}

export function requiredLevelAt(item: GearItem, level: number): number {
  return item.scaleSnapshots?.find((snapshot) => snapshot.effectiveLevel === level)?.requiredLevel
    ?? item.requiredLevel;
}

export function canEquipItemAtLevel(item: GearItem, level: number): boolean {
  return requiredLevelAt(item, level) <= level && (item.availableAtLevel ?? 1) <= level;
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

export function contextualPower(stats: StatMap, level: number, context?: GearContext): number {
  if (level < 60 || !context) return 0;
  return stats[context === "pve" ? "pve_power" : "pvp_power"] ?? 0;
}

/**
 * At max level, compare the matching Ascension progression power first and
 * use normal EP as the tie-breaker. Below max level, ranking is EP-only.
 */
export function compareScoredItems(a: ScoredItem, b: ScoredItem, level: number, context?: GearContext): number {
  // Cache templates are valuable for discovery but can disagree with the live
  // tooltip. Never let provisional values displace directly verified gear.
  const confidence = (item: GearItem) => item.dataSource === "COA_INGAME_SCAN" || item.dataSource === "USER_VERIFIED" ? 2
    : item.dataSource === "PLAYER_IMPORT" ? 1 : 0;
  const confidenceDifference = confidence(b) - confidence(a);
  if (confidenceDifference) return confidenceDifference;
  const powerDifference = contextualPower(b.resolvedStats, level, context) - contextualPower(a.resolvedStats, level, context);
  return Math.abs(powerDifference) > 0.001 ? powerDifference : b.ep - a.ep;
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

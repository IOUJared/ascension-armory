import type { GearItem, HybridScalingRule } from "./types";
import type { StatKey, StatMap } from "./vocabulary";

function addStats(target: StatMap, source: StatMap, multiplier = 1): void {
  for (const [key, value] of Object.entries(source) as Array<[StatKey, number]>) {
    target[key] = (target[key] ?? 0) + value * multiplier;
  }
}

function applyHybridRules(stats: StatMap, rules: HybridScalingRule[]): void {
  for (const rule of rules) {
    const converted = Math.min((stats[rule.source] ?? 0) * rule.coefficient, rule.cap ?? Number.POSITIVE_INFINITY);
    if (rule.mode === "HIGHEST_OF") stats[rule.target] = Math.max(stats[rule.target] ?? 0, converted);
    else stats[rule.target] = (stats[rule.target] ?? 0) + converted;
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

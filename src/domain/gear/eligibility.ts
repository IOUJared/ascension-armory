import type { GearItem } from "./types";

export function requiredLevelAt(item: GearItem, level: number): number {
  return item.scaleSnapshots?.find((snapshot) => snapshot.effectiveLevel === level)?.requiredLevel
    ?? item.requiredLevel;
}

export function canEquipItemAtLevel(item: GearItem, level: number): boolean {
  return requiredLevelAt(item, level) <= level && (item.availableAtLevel ?? 1) <= level;
}

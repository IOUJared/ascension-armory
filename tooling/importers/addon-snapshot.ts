import type { StatMap } from "../../src/domain/gear";
import { API_STAT_KEYS } from "../../src/lib/gear-import";

export function decodeAddonField(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function finiteNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseAddonStats(value: string): { stats: StatMap; rawStats: Record<string, number> } {
  const stats: StatMap = {};
  const rawStats: Record<string, number> = {};
  for (const pair of value.split(",")) {
    const separator = pair.lastIndexOf(":");
    if (separator < 1) continue;
    const rawKey = pair.slice(0, separator);
    const amount = finiteNumber(pair.slice(separator + 1));
    const key = API_STAT_KEYS[rawKey];
    rawStats[rawKey] = amount;
    if (key && amount) stats[key] = (stats[key] ?? 0) + amount;
  }
  return { stats, rawStats };
}

export function renderedTooltipArmor(tooltip: string): number | undefined {
  const clean = tooltip.replace(/\|c[0-9a-f]{8}/gi, "").replaceAll("|r", "");
  for (const column of clean.split(/[\n\t]/)) {
    const match = column.match(/^\s*(\d+)\s+armor\s*$/i);
    if (match) return finiteNumber(match[1]);
  }
  return undefined;
}

import { isCoASelection } from "@/lib/coa";
import type { CoASelection } from "@/types/coa";
import {
  EQUIPMENT_SLOTS,
  STAT_LABELS,
  type EquipmentSlot,
  type GearEffect,
  type GearEnhancement,
  type GearAcquisitionSource,
  type GearItem,
  type GearScaleSnapshot,
  type HybridScalingRule,
  type StatKey,
  type StatMap,
} from "@/domain/gear";

export const BUILD_STORAGE_KEY = "ascension-armory:planner-build";
export const LEGACY_BUILD_STORAGE_KEY = "conquest-gear:planner-build";
export const LEGACY_PROFILE_STORAGE_KEY = "conquest-gear:coa-profile";

export interface PlannerBuild {
  version: 1;
  savedAt: string;
  level: number;
  selection?: CoASelection;
  weights: StatMap;
  loadout: Record<string, GearItem>;
}

const slots = new Set<string>(EQUIPMENT_SLOTS);
const statKeys = new Set<string>(Object.keys(STAT_LABELS));
const qualities = new Set<GearItem["quality"]>(["POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "ARTIFACT", "HEIRLOOM"]);
const effectKinds = new Set<GearEffect["kind"]>(["EQUIP", "USE", "PROC", "SET_BONUS", "ASCENSION"]);
const enhancementKinds = new Set<GearEnhancement["kind"]>(["ENCHANT", "MYSTIC_ENCHANT", "GEM", "SOCKET_BONUS", "CUSTOM"]);
const scalingModes = new Set<HybridScalingRule["mode"]>(["ADD", "HIGHEST_OF", "PERCENT_OF"]);
const acquisitionTypes = new Set<GearAcquisitionSource["type"]>(["DUNGEON", "RAID", "CRAFTING", "FACTION", "PVP", "WORLD_EVENT", "COLLECTION", "WORLD_DROP", "WORLDFORGED"]);
const acquisitionConfidences = new Set<GearAcquisitionSource["confidence"]>(["EXACT", "CATEGORY"]);
const dataSources = new Set<NonNullable<GearItem["dataSource"]>>(["COA_INGAME_SCAN", "COA_REALM_CACHE", "USER_VERIFIED", "PLAYER_IMPORT"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeStats(value: unknown): StatMap {
  if (!isRecord(value)) return {};
  const result: StatMap = {};
  for (const [key, amount] of Object.entries(value)) {
    if (statKeys.has(key) && finiteNumber(amount)) result[key as StatKey] = amount;
  }
  return result;
}

function sanitizeRules(value: unknown): HybridScalingRule[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rules = value.flatMap((entry): HybridScalingRule[] => {
    if (!isRecord(entry) || !statKeys.has(String(entry.source)) || !statKeys.has(String(entry.target))
      || !finiteNumber(entry.coefficient) || !scalingModes.has(entry.mode as HybridScalingRule["mode"])) return [];
    return [{
      source: entry.source as StatKey,
      target: entry.target as StatKey,
      coefficient: entry.coefficient,
      mode: entry.mode as HybridScalingRule["mode"],
      ...(finiteNumber(entry.cap) ? { cap: entry.cap } : {}),
    }];
  });
  return rules.length ? rules : undefined;
}

function sanitizeEffects(value: unknown): GearEffect[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const effects = value.flatMap((entry): GearEffect[] => {
    if (!isRecord(entry) || !effectKinds.has(entry.kind as GearEffect["kind"]) || typeof entry.description !== "string") return [];
    return [{
      kind: entry.kind as GearEffect["kind"],
      description: entry.description,
      ...(isRecord(entry.estimatedStats) ? { estimatedStats: sanitizeStats(entry.estimatedStats) } : {}),
    }];
  });
  return effects.length ? effects : undefined;
}

function sanitizeEnhancements(value: unknown): GearEnhancement[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const enhancements = value.flatMap((entry): GearEnhancement[] => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string"
      || !enhancementKinds.has(entry.kind as GearEnhancement["kind"])) return [];
    const hybridScaling = sanitizeRules(entry.hybridScaling);
    return [{
      id: entry.id,
      name: entry.name,
      kind: entry.kind as GearEnhancement["kind"],
      stats: sanitizeStats(entry.stats),
      ...(isRecord(entry.perLevel) ? { perLevel: sanitizeStats(entry.perLevel) } : {}),
      ...(hybridScaling ? { hybridScaling } : {}),
    }];
  });
  return enhancements.length ? enhancements : undefined;
}

function sanitizeScaleSnapshots(value: unknown): GearScaleSnapshot[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const snapshots = value.flatMap((entry): GearScaleSnapshot[] => {
    if (!isRecord(entry) || !finiteNumber(entry.effectiveLevel) || !finiteNumber(entry.itemLevel)
      || !finiteNumber(entry.requiredLevel) || !isRecord(entry.stats)) return [];
    return [{
      effectiveLevel: Math.max(1, Math.min(60, Math.round(entry.effectiveLevel))),
      itemLevel: Math.max(0, Math.round(entry.itemLevel)),
      requiredLevel: Math.max(1, Math.min(60, Math.round(entry.requiredLevel))),
      stats: sanitizeStats(entry.stats),
      ...(finiteNumber(entry.armor) ? { armor: entry.armor } : {}),
      ...(finiteNumber(entry.weaponDps) ? { weaponDps: entry.weaponDps } : {}),
    }];
  });
  return snapshots.length ? snapshots : undefined;
}

function sanitizeAcquisition(value: unknown): GearAcquisitionSource | undefined {
  if (!isRecord(value) || !acquisitionTypes.has(value.type as GearAcquisitionSource["type"])
    || typeof value.name !== "string" || !acquisitionConfidences.has(value.confidence as GearAcquisitionSource["confidence"])
    || value.provenance !== "ATLASLOOT_ASCENSION") return undefined;
  return {
    type: value.type as GearAcquisitionSource["type"],
    name: value.name,
    confidence: value.confidence as GearAcquisitionSource["confidence"],
    provenance: "ATLASLOOT_ASCENSION",
    ...(typeof value.encounter === "string" ? { encounter: value.encounter } : {}),
    ...(typeof value.note === "string" ? { note: value.note } : {}),
  };
}

function sanitizeItem(value: unknown, slot: EquipmentSlot): GearItem | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string"
    || !qualities.has(value.quality as GearItem["quality"]) || !finiteNumber(value.itemLevel)
    || !finiteNumber(value.requiredLevel)) return undefined;

  const weapon = isRecord(value.weaponDamage) && finiteNumber(value.weaponDamage.min)
    && finiteNumber(value.weaponDamage.max) && finiteNumber(value.weaponDamage.speed) && finiteNumber(value.weaponDamage.dps)
    ? { min: value.weaponDamage.min, max: value.weaponDamage.max, speed: value.weaponDamage.speed, dps: value.weaponDamage.dps }
    : undefined;
  const effects = sanitizeEffects(value.effects);
  const enhancements = sanitizeEnhancements(value.enhancements);
  const scaleSnapshots = sanitizeScaleSnapshots(value.scaleSnapshots);
  const acquisition = sanitizeAcquisition(value.acquisition);

  return {
    id: value.id,
    name: value.name,
    slot,
    quality: value.quality as GearItem["quality"],
    itemLevel: value.itemLevel,
    requiredLevel: value.requiredLevel,
    ...(finiteNumber(value.availableAtLevel) ? { availableAtLevel: value.availableAtLevel } : {}),
    stats: sanitizeStats(value.stats),
    ...(typeof value.armorType === "string" ? { armorType: value.armorType } : {}),
    ...(finiteNumber(value.armor) ? { armor: value.armor } : {}),
    ...(weapon ? { weaponDamage: weapon } : {}),
    ...(typeof value.weaponType === "string" ? { weaponType: value.weaponType } : {}),
    ...(value.twoHanded === true ? { twoHanded: true } : {}),
    ...(typeof value.icon === "string" ? { icon: value.icon } : {}),
    ...(finiteNumber(value.displayId) ? { displayId: value.displayId } : {}),
    ...(effects ? { effects } : {}),
    ...(enhancements ? { enhancements } : {}),
    ...(scaleSnapshots ? { scaleSnapshots } : {}),
    ...(finiteNumber(value.socketCount) ? { socketCount: value.socketCount } : {}),
    ...(typeof value.source === "string" ? { source: value.source } : {}),
    ...(dataSources.has(value.dataSource as NonNullable<GearItem["dataSource"]>) ? { dataSource: value.dataSource as NonNullable<GearItem["dataSource"]> } : {}),
    ...(value.worldforged === true ? { worldforged: true } : {}),
    ...(typeof value.worldforgedBaseId === "string" ? { worldforgedBaseId: value.worldforgedBaseId } : {}),
    ...(value.dungeonTier === "NORMAL" || value.dungeonTier === "HEROIC" || value.dungeonTier === "MYTHIC" ? { dungeonTier: value.dungeonTier } : {}),
    ...(typeof value.dungeonBaseId === "string" ? { dungeonBaseId: value.dungeonBaseId } : {}),
    ...(acquisition ? { acquisition } : {}),
  };
}

function sanitizeLoadout(value: unknown): Record<string, GearItem> {
  if (!isRecord(value)) return {};
  const result: Record<string, GearItem> = {};
  for (const [slotName, itemValue] of Object.entries(value)) {
    if (!slots.has(slotName)) continue;
    const slot = slotName as EquipmentSlot;
    const item = sanitizeItem(itemValue, slot);
    if (item) result[slot] = item;
  }
  return result;
}

export function parsePlannerBuild(raw: string | null): PlannerBuild | undefined {
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1) return undefined;
    const selection = isCoASelection(value.selection) ? value.selection : undefined;
    const level = finiteNumber(value.level) ? Math.max(1, Math.min(60, Math.round(value.level))) : 60;
    return {
      version: 1,
      savedAt: typeof value.savedAt === "string" ? value.savedAt : new Date(0).toISOString(),
      level,
      ...(selection ? { selection } : {}),
      weights: sanitizeStats(value.weights),
      loadout: sanitizeLoadout(value.loadout),
    };
  } catch {
    return undefined;
  }
}

export function makePlannerBuild(level: number, selection: CoASelection | undefined, weights: StatMap, loadout: Record<string, GearItem>): PlannerBuild {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    level,
    ...(selection ? { selection } : {}),
    weights,
    loadout,
  };
}

import type { EquipmentSlot, GearItem } from "@/domain/gear";

export const CATALOG_SCHEMA_VERSION = 1 as const;

export const CATALOG_SHARD_SLOTS = [
  "HEAD", "NECK", "SHOULDERS", "BACK", "CHEST", "WRISTS", "HANDS", "WAIST",
  "LEGS", "FEET", "FINGER_1", "TRINKET_1", "MAIN_HAND", "OFF_HAND", "RANGED",
] as const;

export type CatalogShardSlot = (typeof CATALOG_SHARD_SLOTS)[number];

export interface CatalogDocument {
  generatedAt: string;
  items: GearItem[];
}

export interface CatalogShardDocument extends CatalogDocument {
  schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  slot: CatalogShardSlot;
}

export interface CatalogShardDescriptor {
  path: string;
  itemCount: number;
}

export interface CatalogManifest {
  schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  generatedAt: string;
  itemCount: number;
  idIndexPath: string;
  shards: Record<CatalogShardSlot, CatalogShardDescriptor>;
}

export interface CatalogIdIndex {
  schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  generatedAt: string;
  items: Record<string, CatalogShardSlot>;
}

export function canonicalCatalogSlot(slot: EquipmentSlot): CatalogShardSlot {
  if (slot === "FINGER_2") return "FINGER_1";
  if (slot === "TRINKET_2") return "TRINKET_1";
  return slot;
}

export function catalogShardFilename(slot: CatalogShardSlot): string {
  return `${slot.toLowerCase().replaceAll("_", "-")}.json`;
}

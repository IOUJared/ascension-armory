import type { EquipmentSlot, StatKey, StatMap } from "./vocabulary";

export interface GearEffect {
  kind: "EQUIP" | "USE" | "PROC" | "SET_BONUS" | "ASCENSION";
  description: string;
  estimatedStats?: StatMap;
}

export interface GearEnhancement {
  id: string;
  name: string;
  kind: "ENCHANT" | "MYSTIC_ENCHANT" | "GEM" | "SOCKET_BONUS" | "CUSTOM";
  stats: StatMap;
  perLevel?: StatMap;
  hybridScaling?: HybridScalingRule[];
}

export interface HybridScalingRule {
  source: StatKey;
  target: StatKey;
  coefficient: number;
  mode: "ADD" | "HIGHEST_OF" | "PERCENT_OF";
  cap?: number;
}

export interface GearScaleSnapshot {
  effectiveLevel: number;
  itemLevel: number;
  requiredLevel: number;
  stats: StatMap;
  armor?: number;
  weaponDps?: number;
}

export interface GearAcquisitionSource {
  type: "DUNGEON" | "RAID" | "CRAFTING" | "FACTION" | "PVP" | "WORLD_EVENT" | "COLLECTION" | "WORLD_DROP" | "WORLDFORGED";
  name: string;
  encounter?: string;
  confidence: "EXACT" | "CATEGORY";
  provenance: "ATLASLOOT_ASCENSION";
  note?: string;
}

export interface GearItem {
  id: string;
  name: string;
  slot: EquipmentSlot;
  quality: "POOR" | "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY" | "ARTIFACT" | "HEIRLOOM";
  itemLevel: number;
  requiredLevel: number;
  /** Lowest character level at which this content-tier version is obtainable. */
  availableAtLevel?: number;
  armorType?: string;
  armor?: number;
  weaponDamage?: { min: number; max: number; speed: number; dps: number };
  weaponType?: string;
  twoHanded?: boolean;
  icon?: string;
  /** WoW ItemDisplayInfo ID used to dress the 3D character model. */
  displayId?: number;
  stats: StatMap;
  effects?: GearEffect[];
  enhancements?: GearEnhancement[];
  socketCount?: number;
  source?: string;
  /** Provenance used to distinguish current CoA data from imported fallbacks. */
  dataSource?: "COA_INGAME_SCAN" | "COA_REALM_CACHE" | "USER_VERIFIED" | "PLAYER_IMPORT";
  /** Identified by LootCollector as an upgradeable Worldforged item. */
  worldforged?: boolean;
  /** Base discovery item for a server-verified Worldforged upgrade record. */
  worldforgedBaseId?: string;
  /** Generated CoA dungeon difficulty version verified from the live realm. */
  dungeonTier?: "NORMAL" | "HEROIC" | "MYTHIC";
  /** AtlasLoot dungeon item from which this generated difficulty version derives. */
  dungeonBaseId?: string;
  /** Exact current-client snapshots keyed by the item link's effective level. */
  scaleSnapshots?: GearScaleSnapshot[];
  /** Structured, provenance-aware directions for obtaining the item. */
  acquisition?: GearAcquisitionSource;
}

export interface ScoredItem extends GearItem {
  ep: number;
  resolvedStats: StatMap;
}

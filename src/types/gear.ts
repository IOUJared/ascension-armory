export const EQUIPMENT_SLOTS = [
  "HEAD", "NECK", "SHOULDERS", "BACK", "CHEST", "WRISTS", "HANDS", "WAIST",
  "LEGS", "FEET", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2", "MAIN_HAND",
  "OFF_HAND", "RANGED",
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export type StatKey =
  | "strength" | "agility" | "stamina" | "intellect" | "spirit" | "health" | "mana" | "armor"
  | "attack_power" | "spell_power" | "healing_power" | "crit_rating" | "haste_rating"
  | "hit_rating" | "expertise_rating" | "defense_rating" | "dodge_rating"
  | "parry_rating" | "block_rating" | "block_value" | "armor_penetration"
  | "spell_penetration" | "resilience_rating" | "mp5" | "hp5" | "pve_power" | "pvp_power"
  | "weapon_dps" | "custom_power";

export type StatMap = Partial<Record<StatKey, number>>;

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

export const STAT_LABELS: Record<StatKey, string> = {
  strength: "Strength",
  agility: "Agility",
  stamina: "Stamina",
  intellect: "Intellect",
  spirit: "Spirit",
  health: "Health",
  mana: "Mana",
  armor: "Armor",
  attack_power: "Attack Power",
  spell_power: "Spell Power",
  healing_power: "Healing Power",
  crit_rating: "Critical Strike",
  haste_rating: "Haste",
  hit_rating: "Hit",
  expertise_rating: "Expertise",
  defense_rating: "Defense",
  dodge_rating: "Dodge",
  parry_rating: "Parry",
  block_rating: "Block Rating",
  block_value: "Block Value",
  armor_penetration: "Armor Penetration",
  spell_penetration: "Spell Penetration",
  resilience_rating: "Resilience",
  mp5: "Mana / 5 sec",
  hp5: "Health / 5 sec",
  pve_power: "PvE Power (hidden)",
  pvp_power: "PvP Power (hidden)",
  weapon_dps: "Weapon DPS",
  custom_power: "Custom Power",
};

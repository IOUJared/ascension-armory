import { EQUIPMENT_SLOTS, type EquipmentSlot, type GearItem, type StatKey, type StatMap } from "@/types/gear";

interface ImportedItemSnapshot {
  name: string;
  quality: GearItem["quality"];
  itemLevel: number;
  requiredLevel: number;
  icon?: string;
  stats: StatMap;
}

export interface ImportedGearEntry {
  slot: EquipmentSlot;
  itemId: string;
  itemString: string;
  snapshot?: ImportedItemSnapshot;
}

export interface ParsedGearImport {
  version: 1 | 2;
  level: number;
  gear: ImportedGearEntry[];
}

const validSlots = new Set<string>(EQUIPMENT_SLOTS);
const qualities: GearItem["quality"][] = ["POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "ARTIFACT", "HEIRLOOM"];
export const API_STAT_KEYS: Record<string, StatKey> = {
  ITEM_MOD_STRENGTH_SHORT: "strength", ITEM_MOD_AGILITY_SHORT: "agility", ITEM_MOD_STAMINA_SHORT: "stamina",
  ITEM_MOD_INTELLECT_SHORT: "intellect", ITEM_MOD_SPIRIT_SHORT: "spirit", ITEM_MOD_ARMOR_SHORT: "armor",
  ITEM_MOD_ATTACK_POWER_SHORT: "attack_power", ITEM_MOD_RANGED_ATTACK_POWER_SHORT: "attack_power",
  ITEM_MOD_SPELL_POWER_SHORT: "spell_power", ITEM_MOD_SPELL_HEALING_DONE_SHORT: "healing_power",
  ITEM_MOD_SPELL_DAMAGE_DONE_SHORT: "spell_power",
  ITEM_MOD_CRIT_RATING_SHORT: "crit_rating", ITEM_MOD_HIT_RATING_SHORT: "hit_rating", ITEM_MOD_HASTE_RATING_SHORT: "haste_rating",
  ITEM_MOD_CRIT_MELEE_RATING_SHORT: "crit_rating", ITEM_MOD_CRIT_RANGED_RATING_SHORT: "crit_rating", ITEM_MOD_CRIT_SPELL_RATING_SHORT: "crit_rating",
  ITEM_MOD_HIT_MELEE_RATING_SHORT: "hit_rating", ITEM_MOD_HIT_RANGED_RATING_SHORT: "hit_rating", ITEM_MOD_HIT_SPELL_RATING_SHORT: "hit_rating",
  ITEM_MOD_HASTE_MELEE_RATING_SHORT: "haste_rating", ITEM_MOD_HASTE_RANGED_RATING_SHORT: "haste_rating", ITEM_MOD_HASTE_SPELL_RATING_SHORT: "haste_rating",
  ITEM_MOD_EXPERTISE_RATING_SHORT: "expertise_rating", ITEM_MOD_DEFENSE_SKILL_RATING_SHORT: "defense_rating",
  ITEM_MOD_DODGE_RATING_SHORT: "dodge_rating", ITEM_MOD_PARRY_RATING_SHORT: "parry_rating",
  ITEM_MOD_BLOCK_RATING_SHORT: "block_rating", ITEM_MOD_BLOCK_VALUE_SHORT: "block_value",
  ITEM_MOD_ARMOR_PENETRATION_RATING_SHORT: "armor_penetration", ITEM_MOD_SPELL_PENETRATION_SHORT: "spell_penetration",
  ITEM_MOD_RESILIENCE_RATING_SHORT: "resilience_rating", ITEM_MOD_RESILIENCE_RATING: "resilience_rating",
  ITEM_MOD_POWER_REGEN0_SHORT: "mp5", ITEM_MOD_HEALTH_REGEN_SHORT: "hp5", ITEM_MOD_DAMAGE_PER_SECOND_SHORT: "weapon_dps",
  PVE_POWER: "pve_power", PVP_POWER: "pvp_power",
  RESISTANCE0_NAME: "armor",
};

function decode(value: string): string {
  try { return decodeURIComponent(value); } catch { throw new Error("The AA2 item metadata is malformed."); }
}

function parseSnapshot(fields: string[]): ImportedItemSnapshot {
  if (fields.length < 6) throw new Error("The AA2 item snapshot is incomplete.");
  const quality = qualities[Number(fields[1])];
  const itemLevel = Number(fields[2]);
  const requiredLevel = Number(fields[3]);
  if (!quality || !Number.isFinite(itemLevel) || !Number.isFinite(requiredLevel)) throw new Error("The AA2 item snapshot has invalid item metadata.");
  const stats: StatMap = {};
  for (const pair of fields[6].split(",")) {
    if (!pair) continue;
    const separator = pair.lastIndexOf(":");
    const key = API_STAT_KEYS[pair.slice(0, separator)];
    const amount = Number(pair.slice(separator + 1));
    if (separator > 0 && key && Number.isFinite(amount)) stats[key] = (stats[key] ?? 0) + amount;
  }
  return {
    name: decode(fields[5]), quality, itemLevel, requiredLevel, stats,
    ...(fields[4] ? { icon: decode(fields[4]).toLowerCase() } : {}),
  };
}

export function parseGearImport(raw: string): ParsedGearImport {
  const text = raw.trim();
  if (!text) throw new Error("Paste the export string created by /aaexport.");
  if (text.length > 20_000) throw new Error("The export string is too large.");

  const [format, rawLevel, ...gearParts] = text.split("|");
  if (format !== "AA1" && format !== "AA2") throw new Error("This is not an Ascension Armory AA1 or AA2 export.");
  const level = Number(rawLevel);
  if (!Number.isInteger(level) || level < 1 || level > 60) throw new Error("The exported character level is invalid.");

  const gearPayload = gearParts.join("|");
  const bySlot = new Map<EquipmentSlot, ImportedGearEntry>();
  for (const pair of gearPayload.split(";")) {
    if (!pair) continue;
    const separator = pair.indexOf("=");
    if (separator < 1) throw new Error("The exported gear list is malformed.");
    const slotName = pair.slice(0, separator);
    const itemFields = pair.slice(separator + 1).split("~");
    const itemString = itemFields[0];
    const itemId = itemString.split(":", 1)[0];
    if (!validSlots.has(slotName) || !/^\d+$/.test(itemId)) throw new Error("The export contains an invalid equipment slot or item ID.");
    const slot = slotName as EquipmentSlot;
    bySlot.set(slot, { slot, itemId, itemString, ...(format === "AA2" ? { snapshot: parseSnapshot(itemFields) } : {}) });
  }

  return { version: format === "AA2" ? 2 : 1, level, gear: [...bySlot.values()] };
}

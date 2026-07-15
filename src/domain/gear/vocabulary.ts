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

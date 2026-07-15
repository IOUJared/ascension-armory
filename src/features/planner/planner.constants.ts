import type { EquipmentSlot, StatMap } from "@/domain/gear";

export const LEFT_EQUIPMENT_SLOTS: EquipmentSlot[] = [
  "HEAD", "NECK", "SHOULDERS", "BACK", "CHEST", "WRISTS", "MAIN_HAND", "RANGED",
];

export const RIGHT_EQUIPMENT_SLOTS: EquipmentSlot[] = [
  "HANDS", "WAIST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2", "OFF_HAND",
];

export const FALLBACK_WEIGHTS: StatMap = {
  strength: 1,
  attack_power: 0.48,
  crit_rating: 0.72,
  haste_rating: 0.64,
  hit_rating: 0.86,
  weapon_dps: 2.4,
};

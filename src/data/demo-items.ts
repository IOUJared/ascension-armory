import type { EquipmentSlot, GearItem, StatMap } from "@/domain/gear";

const slotNames: Record<EquipmentSlot, string> = {
  HEAD: "Crown of the Unbound", NECK: "Chain of the First Flame", SHOULDERS: "Mantle of Conquest",
  BACK: "Duskweave Shroud", CHEST: "Battleplate of Many Paths", WRISTS: "Runed Warbands",
  HANDS: "Gauntlets of the Disobedient", WAIST: "Girdle of Endless Trials", LEGS: "Legguards of Ascension",
  FEET: "Treads of the Wayfarer", FINGER_1: "Band of Wild Magic", FINGER_2: "Loop of the Vanguard",
  TRINKET_1: "Heart of the Storm", TRINKET_2: "Hourglass of Unmaking", MAIN_HAND: "Conqueror's Spellblade",
  OFF_HAND: "Bulwark of the Classless", RANGED: "Relic of Azeroth",
};

const slotStats: Partial<Record<EquipmentSlot, StatMap>> = {
  HEAD: { strength: 42, stamina: 58, crit_rating: 28, haste_rating: 22 },
  NECK: { strength: 24, stamina: 31, hit_rating: 19, attack_power: 36 },
  SHOULDERS: { strength: 36, stamina: 46, crit_rating: 24, pve_power: 10 },
  BACK: { agility: 28, stamina: 32, haste_rating: 21, attack_power: 42 },
  CHEST: { strength: 54, stamina: 72, hit_rating: 32, attack_power: 48 },
  WRISTS: { strength: 27, stamina: 32, expertise_rating: 18 },
  HANDS: { strength: 41, stamina: 53, crit_rating: 26, haste_rating: 19 },
  WAIST: { strength: 38, stamina: 49, hit_rating: 21, attack_power: 31 },
  LEGS: { strength: 52, stamina: 69, crit_rating: 31, expertise_rating: 25 },
  FEET: { strength: 35, stamina: 44, hit_rating: 23, haste_rating: 18 },
  FINGER_1: { strength: 25, stamina: 28, crit_rating: 17, attack_power: 34 },
  FINGER_2: { agility: 24, stamina: 29, haste_rating: 19, attack_power: 35 },
  TRINKET_1: { attack_power: 110, crit_rating: 35 },
  TRINKET_2: { strength: 48, haste_rating: 32 },
  MAIN_HAND: { strength: 45, stamina: 52, crit_rating: 29, spell_power: 55 },
  OFF_HAND: { strength: 32, stamina: 55, defense_rating: 27, block_rating: 24 },
  RANGED: { agility: 31, stamina: 29, hit_rating: 24, attack_power: 39 },
};

export const SLOT_ICON: Record<EquipmentSlot, string> = {
  HEAD: "♜", NECK: "◇", SHOULDERS: "♞", BACK: "◩", CHEST: "♛", WRISTS: "⊏", HANDS: "✊",
  WAIST: "▰", LEGS: "♝", FEET: "♟", FINGER_1: "○", FINGER_2: "○", TRINKET_1: "✦",
  TRINKET_2: "✦", MAIN_HAND: "⚔", OFF_HAND: "⬟", RANGED: "➶",
};

const armorSlots = new Set<EquipmentSlot>(["HEAD", "SHOULDERS", "CHEST", "WRISTS", "HANDS", "WAIST", "LEGS", "FEET"]);
const slotIcons: Record<EquipmentSlot, string> = {
  HEAD: "inv_helmet_96", NECK: "inv_jewelry_necklace_30", SHOULDERS: "inv_shoulder_29",
  BACK: "inv_misc_cape_20", CHEST: "inv_chest_plate08", WRISTS: "inv_bracer_15",
  HANDS: "inv_gauntlets_62", WAIST: "inv_belt_27", LEGS: "inv_pants_plate_21",
  FEET: "inv_boots_plate_06", FINGER_1: "inv_jewelry_ring_55", FINGER_2: "inv_jewelry_ring_35",
  TRINKET_1: "inv_misc_gem_bloodstone_02", TRINKET_2: "inv_misc_pocketwatch_02",
  MAIN_HAND: "inv_sword_2h_ashbringercorrupt", OFF_HAND: "inv_shield_06", RANGED: "inv_weapon_bow_17",
};

// Known Classic-compatible ItemDisplayInfo IDs. Slots that are not rendered by
// WoW's character model (neck, rings and trinkets) intentionally have no value.
const slotDisplayIds: Partial<Record<EquipmentSlot, number>> = {
  HEAD: 1170, SHOULDERS: 4925, BACK: 17238, CHEST: 9575, WRISTS: 14618,
  HANDS: 9534, WAIST: 25235, LEGS: 2311, FEET: 21154,
  MAIN_HAND: 20379, OFF_HAND: 28787,
};

export const equippedItems: GearItem[] = Object.entries(slotNames).map(([slot, name], index) => ({
  id: `equipped-${slot.toLowerCase()}`,
  name,
  slot: slot as EquipmentSlot,
  quality: index % 6 === 0 ? "LEGENDARY" : "EPIC",
  itemLevel: 58 + (index % 5),
  requiredLevel: 55,
  icon: slotIcons[slot as EquipmentSlot],
  displayId: slotDisplayIds[slot as EquipmentSlot],
  armorType: armorSlots.has(slot as EquipmentSlot) ? "Plate" : undefined,
  armor: armorSlots.has(slot as EquipmentSlot) ? 170 + index * 11 : undefined,
  weaponDamage: slot === "MAIN_HAND" ? { min: 104, max: 168, speed: 2.6, dps: 52.3 } : undefined,
  stats: slotStats[slot as EquipmentSlot] ?? {},
  socketCount: index % 3 === 0 ? 1 : 0,
  enhancements: index % 4 === 0 ? [{
    id: `re-${slot}`, name: "RE: Echo of the Crusader", kind: "MYSTIC_ENCHANT",
    stats: { attack_power: 12, pve_power: 4 },
  }] : undefined,
  source: index % 2 ? "Blackwing Lair" : "Mystic Cache",
}));

const variations: Array<{ suffix: string; quality: GearItem["quality"]; scale: number; pivot: StatMap; source: string }> = [
  { suffix: "of the Spellblade", quality: "EPIC", scale: 0.93, pivot: { spell_power: 48, intellect: 18 }, source: "Molten Core" },
  { suffix: "of Endless Fury", quality: "LEGENDARY", scale: 1.08, pivot: { attack_power: 36, crit_rating: 14 }, source: "Ascended Raid" },
  { suffix: "of the Wind", quality: "RARE", scale: 0.88, pivot: { agility: 25, haste_rating: 24 }, source: "World Drop" },
  { suffix: "of the Bulwark", quality: "EPIC", scale: 1.02, pivot: { stamina: 34, defense_rating: 28 }, source: "Naxxramas" },
];

export const demoItems: GearItem[] = [
  ...equippedItems,
  ...equippedItems.flatMap((base, slotIndex) => variations.map((variant, index) => ({
    ...base,
    id: `candidate-${base.slot.toLowerCase()}-${index}`,
    name: `${base.name.split(" of ")[0]} ${variant.suffix}`,
    quality: variant.quality,
    itemLevel: base.itemLevel + index + 1,
    stats: Object.fromEntries(Object.entries(base.stats).map(([key, value]) => [key, Math.round((value ?? 0) * variant.scale)])) as StatMap,
    armor: base.armor ? Math.round(base.armor * variant.scale) : undefined,
    source: variant.source,
    socketCount: index % 2,
    enhancements: index === 1 ? [{
      id: `re-candidate-${slotIndex}`, name: "RE: Elemental Convergence", kind: "MYSTIC_ENCHANT" as const,
      stats: { custom_power: 16 },
      hybridScaling: [{ source: "strength" as const, target: "spell_power" as const, coefficient: 0.22, mode: "ADD" as const }],
    }] : undefined,
    effects: Object.keys(variant.pivot).length ? [{
      kind: "ASCENSION" as const,
      description: "Ascension-tuned secondary allocation",
      estimatedStats: variant.pivot,
    }] : undefined,
  }))),
];

export const demoCandidates = demoItems.filter((item) => item.id.startsWith("candidate-"));

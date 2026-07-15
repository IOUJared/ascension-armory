import enchantData from "@/data/coa-enchants.json";
import { calculateEp, type EquipmentSlot, type GearEnhancement, type GearItem, type StatMap, type WeightProfile } from "@/domain/gear";

export interface CoAEnchant {
  id: string;
  spellId: number;
  enchantmentId: number;
  name: string;
  description: string;
  slots: EquipmentSlot[];
  constraint?: "SHIELD" | "TWO_HANDED" | "WEAPON";
  minimumItemLevel: number;
  stats: StatMap;
  modeled: boolean;
  source: "COA_CLIENT_DBC_ATLASLOOT";
}

const enchants = enchantData.items as CoAEnchant[];

function matchesItem(enchant: CoAEnchant, item: GearItem): boolean {
  if (!enchant.slots.includes(item.slot) || item.itemLevel < enchant.minimumItemLevel) return false;
  if (enchant.constraint === "SHIELD") return item.armorType?.toLowerCase() === "shield";
  if (enchant.constraint === "TWO_HANDED") return item.twoHanded === true;
  if (enchant.constraint === "WEAPON") return Boolean(item.weaponDamage) && item.armorType?.toLowerCase() !== "shield";
  return true;
}

export function findEnchantsForItem(item: GearItem): CoAEnchant[] {
  return enchants.filter((enchant) => matchesItem(enchant, item));
}

export function findEnchantByEnchantmentId(item: GearItem, enchantmentId?: number): CoAEnchant | undefined {
  if (!enchantmentId) return undefined;
  return findEnchantsForItem(item).find((enchant) => enchant.enchantmentId === enchantmentId);
}

export function enchantEp(enchant: CoAEnchant, profile: WeightProfile): number {
  return enchant.modeled ? calculateEp(enchant.stats, profile) : 0;
}

export function recommendEnchant(item: GearItem, profile: WeightProfile): CoAEnchant | undefined {
  return findEnchantsForItem(item)
    .filter((enchant) => enchant.modeled)
    .map((enchant) => ({ enchant, ep: enchantEp(enchant, profile) }))
    .filter(({ ep }) => ep > 0)
    .sort((left, right) => right.ep - left.ep || right.enchant.minimumItemLevel - left.enchant.minimumItemLevel)[0]?.enchant;
}

export function enchantEnhancement(enchant: CoAEnchant): GearEnhancement {
  return {
    id: enchant.id,
    name: enchant.name,
    kind: "ENCHANT",
    stats: enchant.stats,
  };
}

export function applyRecommendedEnchant(item: GearItem, profile: WeightProfile, replace = false): GearItem {
  const current = item.enhancements?.find((enhancement) => enhancement.kind === "ENCHANT");
  if (current && !replace) return item;
  const recommendation = recommendEnchant(item, profile);
  if (!recommendation) return item;
  const enhancements = [
    ...(item.enhancements ?? []).filter((enhancement) => enhancement.kind !== "ENCHANT"),
    enchantEnhancement(recommendation),
  ];
  return { ...item, enhancements };
}

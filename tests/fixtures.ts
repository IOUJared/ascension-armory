import type { EquipmentSlot, GearItem } from "../src/types/gear";

export function makeGearItem(overrides: Partial<GearItem> = {}): GearItem {
  return {
    id: "1000",
    name: "Test Item",
    slot: "HEAD" as EquipmentSlot,
    quality: "RARE",
    itemLevel: 40,
    requiredLevel: 35,
    stats: {},
    dataSource: "COA_INGAME_SCAN",
    ...overrides,
  };
}

import type { EquipmentSlot, GearItem } from "@/domain/gear";

export interface CatalogRepository {
  findForSlot(slot: EquipmentSlot, level: number): Promise<GearItem[]>;
  findByIds(itemIds: Iterable<string>): Promise<Map<string, GearItem>>;
}

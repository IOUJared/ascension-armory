import type { EquipmentSlot, GearItem } from "@/types/gear";

interface StaticCatalog {
  generatedAt: string;
  items: GearItem[];
}

let catalogPromise: Promise<StaticCatalog> | undefined;

function catalogUrl(): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/coa-items.json`;
}

function loadCatalog(): Promise<StaticCatalog> {
  catalogPromise ??= fetch(catalogUrl()).then(async (response) => {
    if (!response.ok) throw new Error(`Static item catalog failed with ${response.status}`);
    return response.json() as Promise<StaticCatalog>;
  }).catch((error: unknown) => {
    catalogPromise = undefined;
    throw error;
  });
  return catalogPromise;
}

function matchesSlot(itemSlot: EquipmentSlot, requestedSlot: EquipmentSlot): boolean {
  if (requestedSlot.startsWith("FINGER")) return itemSlot.startsWith("FINGER");
  if (requestedSlot.startsWith("TRINKET")) return itemSlot.startsWith("TRINKET");
  return itemSlot === requestedSlot;
}

export async function findStaticItemsForSlot(slot: EquipmentSlot, level: number): Promise<GearItem[]> {
  const catalog = await loadCatalog();
  return catalog.items
    .filter((item) => matchesSlot(item.slot, slot) && item.requiredLevel <= level)
    .map((item) => item.slot === slot ? item : { ...item, slot });
}

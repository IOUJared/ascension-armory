import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { EquipmentSlot, ItemQuality, Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import atlasLoot from "../src/data/atlasloot-coa-items.json";

type DungeonTier = "NORMAL" | "HEROIC" | "MYTHIC";

interface AtlasEntry {
  id: string;
  name: string;
  sourceFile: string;
  section: string;
  kind: string;
  sourceType?: string;
}

interface ItemRow {
  id: bigint;
  name: string;
  slot: EquipmentSlot | null;
  itemLevel: number;
  quality: ItemQuality;
  rawTooltipHtml: string;
  rawPayload: Prisma.JsonValue;
}

function displayId(item: ItemRow): number | null {
  const payload = item.rawPayload as { item?: { displayId?: unknown } } | null;
  const value = Number(payload?.item?.displayId);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function tier(item: ItemRow): DungeonTier | null {
  // Direct live scans replace the client marker tooltip, so difficulty must
  // remain recoverable from the generated tier's fixed item level.
  if (item.itemLevel === 57) return "NORMAL";
  if (item.itemLevel === 61) return "HEROIC";
  if (item.itemLevel === 64) return "MYTHIC";
  return null;
}

async function main(): Promise<void> {
  const outputPath = resolve(process.argv[2] ?? "src/data/dungeon-variants.json");
  const entries = (atlasLoot.items as AtlasEntry[]).filter((item) =>
    item.kind === "atlasloot-entry" && item.sourceType === "DUNGEON" && item.section);
  const sectionById = new Map(entries.map((item) => [item.id, item.section]));
  const baseRows = await prisma.item.findMany({
    where: { id: { in: entries.map((item) => BigInt(item.id)) }, slot: { not: null } },
    select: {
      id: true, name: true, slot: true, itemLevel: true, quality: true,
      rawTooltipHtml: true, rawPayload: true,
    },
  }) as ItemRow[];

  const baseFamilies = new Map<string, ItemRow[]>();
  const baseFamiliesByNameSlot = new Map<string, ItemRow[]>();
  for (const item of baseRows) {
    const key = `${item.name}\u0000${item.slot}\u0000${displayId(item) ?? 0}`;
    const family = baseFamilies.get(key) ?? [];
    family.push(item);
    baseFamilies.set(key, family);
    const nameSlotKey = `${item.name}\u0000${item.slot}`;
    const nameSlotFamily = baseFamiliesByNameSlot.get(nameSlotKey) ?? [];
    nameSlotFamily.push(item);
    baseFamiliesByNameSlot.set(nameSlotKey, nameSlotFamily);
  }
  const names = [...new Set(baseRows.map((item) => item.name))];
  const possibleVariants: ItemRow[] = [];
  for (let offset = 0; offset < names.length; offset += 500) {
    possibleVariants.push(...await prisma.item.findMany({
      where: {
        name: { in: names.slice(offset, offset + 500) },
        slot: { not: null },
        itemLevel: { in: [57, 61, 64] },
      },
      select: {
        id: true, name: true, slot: true, itemLevel: true, quality: true,
        rawTooltipHtml: true, rawPayload: true,
      },
    }) as ItemRow[]);
  }

  const variants = new Map<string, {
    id: string;
    baseId: string;
    name: string;
    slot: EquipmentSlot;
    itemLevel: number;
    quality: ItemQuality;
    tier: DungeonTier;
    section: string;
  }>();
  for (const item of possibleVariants) {
    if (!item.slot) continue;
    const dungeonTier = tier(item);
    if (!dungeonTier) continue;
    const key = `${item.name}\u0000${item.slot}\u0000${displayId(item) ?? 0}`;
    // A live scan replaces rawPayload and can omit ItemDisplayInfo. Fall back
    // to the exact name/slot family so rescanning does not erase a known tier.
    const family = (baseFamilies.get(key)
      ?? baseFamiliesByNameSlot.get(`${item.name}\u0000${item.slot}`))
      ?.filter((base) => base.id !== item.id);
    if (!family?.length) continue;
    const base = family.sort((left, right) => left.itemLevel - right.itemLevel || Number(left.id - right.id))[0];
    variants.set(item.id.toString(), {
      id: item.id.toString(),
      baseId: base.id.toString(),
      name: item.name,
      slot: item.slot,
      itemLevel: item.itemLevel,
      quality: item.quality,
      tier: dungeonTier,
      section: sectionById.get(base.id.toString()) ?? "CoA dungeon",
    });
  }

  const items = [...variants.values()].sort((left, right) =>
    left.baseId.localeCompare(right.baseId, undefined, { numeric: true })
      || left.itemLevel - right.itemLevel
      || left.id.localeCompare(right.id, undefined, { numeric: true }));
  const payload = {
    source: "Current Ascension client generated dungeon variants matched to the AtlasLoot CoA instance index",
    generatedAt: new Date().toISOString(),
    rules: [
      "Exact name, equipment slot, and ItemDisplayInfo match to an AtlasLoot instance item",
      "Normal item level 57, Heroic item level 61, or Mythic item level 64",
      "Stats require verification from the current CoA realm",
    ],
    items,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({
    output: outputPath,
    atlasInstanceEntries: entries.length,
    matchedBaseItems: baseRows.length,
    variants: items.length,
    families: new Set(items.map((item) => item.baseId)).size,
    tiers: Object.fromEntries(["NORMAL", "HEROIC", "MYTHIC"].map((name) =>
      [name, items.filter((item) => item.tier === name).length])),
  }));
}

main().finally(() => prisma.$disconnect());

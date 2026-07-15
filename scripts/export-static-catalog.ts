import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { prisma } from "../src/lib/db";
import type { GearItem, StatMap } from "../src/types/gear";
import catalogAdditions from "../src/data/catalog-additions.json";
import worldforgedItems from "../src/data/worldforged-items.json";

const outputPath = resolve(process.cwd(), process.argv[2] ?? "public/data/coa-items.json");

async function main(): Promise<void> {
  const worldforgedIds = new Set(worldforgedItems.itemIds);
  const addedIds = [...catalogAdditions.items.map((item) => item.id), ...worldforgedItems.itemIds].map((id) => BigInt(id));
  const overrides = new Map(catalogAdditions.items.map((item) => [item.id, item.overrides]));
  const rows = await prisma.item.findMany({
    where: { slot: { not: null }, OR: [{ sourceUpdatedAt: { not: null } }, { id: { in: addedIds } }] },
    include: { stats: true, effects: true, sockets: true },
    orderBy: [{ slot: "asc" }, { itemLevel: "desc" }, { name: "asc" }],
  });

  const items: GearItem[] = rows.flatMap((item): GearItem[] => {
    if (!item.slot) return [];
    const override = overrides.get(item.id.toString());
    const payload = item.rawPayload as { item?: { displayId?: unknown } } | null;
    const displayId = Number(payload?.item?.displayId);
    const stats = Object.fromEntries(item.stats.map((stat) => [stat.statKey, stat.value])) as StatMap;
    Object.assign(stats, override?.stats ?? {});
    return [{
      id: item.id.toString(),
      name: item.name,
      slot: item.slot,
      quality: item.quality,
      itemLevel: item.itemLevel,
      requiredLevel: override?.requiredLevel ?? item.requiredLevel,
      stats,
      ...(override?.armorType ?? item.armorType ? { armorType: override?.armorType ?? item.armorType ?? undefined } : {}),
      ...(override?.armor ?? item.armor ? { armor: override?.armor ?? item.armor } : {}),
      ...(item.weaponMinDamage !== null && item.weaponMaxDamage !== null && item.weaponSpeed !== null
        ? { weaponDamage: { min: item.weaponMinDamage, max: item.weaponMaxDamage, speed: item.weaponSpeed, dps: item.weaponDps ?? 0 } }
        : {}),
      ...(item.icon ? { icon: item.icon } : {}),
      ...(Number.isInteger(displayId) && displayId > 0 ? { displayId } : {}),
      ...(item.effects.length ? { effects: item.effects.map((effect) => ({ kind: effect.kind, description: effect.description })) } : {}),
      ...(item.sockets.length ? { socketCount: item.sockets.length } : {}),
      source: worldforgedIds.has(item.id.toString()) ? "LootCollector · Worldforged" : item.sourceUrl,
      ...(worldforgedIds.has(item.id.toString()) ? { worldforged: true } : {}),
    }];
  });

  const payload = JSON.stringify({ generatedAt: new Date().toISOString(), items });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, payload);
  console.log(JSON.stringify({ output: outputPath, items: items.length, bytes: Buffer.byteLength(payload) }));
}

main().finally(() => prisma.$disconnect());

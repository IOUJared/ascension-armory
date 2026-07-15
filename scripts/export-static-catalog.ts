import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { prisma } from "../src/lib/db";
import type { GearItem, StatMap } from "../src/types/gear";

const outputPath = resolve(process.cwd(), process.argv[2] ?? "public/data/coa-items.json");

async function main(): Promise<void> {
  const rows = await prisma.item.findMany({
    where: { slot: { not: null }, sourceUpdatedAt: { not: null } },
    include: { stats: true, effects: true, sockets: true },
    orderBy: [{ slot: "asc" }, { itemLevel: "desc" }, { name: "asc" }],
  });

  const items: GearItem[] = rows.flatMap((item): GearItem[] => {
    if (!item.slot) return [];
    const payload = item.rawPayload as { item?: { displayId?: unknown } } | null;
    const displayId = Number(payload?.item?.displayId);
    return [{
      id: item.id.toString(),
      name: item.name,
      slot: item.slot,
      quality: item.quality,
      itemLevel: item.itemLevel,
      requiredLevel: item.requiredLevel,
      stats: Object.fromEntries(item.stats.map((stat) => [stat.statKey, stat.value])) as StatMap,
      ...(item.armorType ? { armorType: item.armorType } : {}),
      ...(item.armor ? { armor: item.armor } : {}),
      ...(item.weaponMinDamage !== null && item.weaponMaxDamage !== null && item.weaponSpeed !== null
        ? { weaponDamage: { min: item.weaponMinDamage, max: item.weaponMaxDamage, speed: item.weaponSpeed, dps: item.weaponDps ?? 0 } }
        : {}),
      ...(item.icon ? { icon: item.icon } : {}),
      ...(Number.isInteger(displayId) && displayId > 0 ? { displayId } : {}),
      ...(item.effects.length ? { effects: item.effects.map((effect) => ({ kind: effect.kind, description: effect.description })) } : {}),
      ...(item.sockets.length ? { socketCount: item.sockets.length } : {}),
      source: item.sourceUrl,
    }];
  });

  const payload = JSON.stringify({ generatedAt: new Date().toISOString(), items });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, payload);
  console.log(JSON.stringify({ output: outputPath, items: items.length, bytes: Buffer.byteLength(payload) }));
}

main().finally(() => prisma.$disconnect());

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/db";

interface UpgradeRow {
  id: string;
  baseId: string;
  itemLevel: number;
}

async function main(): Promise<void> {
  const outputPath = resolve(process.argv[2] ?? "src/data/worldforged-upgrades.json");
  const previousPath = resolve(process.argv[3] ?? outputPath);
  const previousUpgrades = JSON.parse(await readFile(previousPath, "utf8")) as {
    items: UpgradeRow[];
  };
  const discoveredRows = await prisma.$queryRaw<UpgradeRow[]>(Prisma.sql`
    WITH base AS (
      SELECT id
      FROM "Item"
      WHERE "sourceUrl" LIKE 'ingame-scan://%'
        AND slot IS NOT NULL
    )
    SELECT i.id::text AS id,
           (i."rawPayload"->'addon'->'values'->>1) AS "baseId",
           i."itemLevel" AS "itemLevel"
    FROM "Item" i
    JOIN base b ON b.id = (i."rawPayload"->'addon'->'values'->>1)::bigint
    WHERE i."rawPayload"->>'source' = 'ascension-client-mpq'
      AND i."rawPayload"->'addon'->'values'->>1 ~ '^[0-9]+$'
      AND i.id <> b.id
    ORDER BY b.id, i."itemLevel", i.id
  `);
  // Direct tooltip scans intentionally replace the client-MPQ raw payload.
  // Preserve previously proven base relationships after that authority
  // upgrade, refreshing their item levels from the current database.
  const rowsById = new Map<string, UpgradeRow>();
  const previous = previousUpgrades.items;
  for (let offset = 0; offset < previous.length; offset += 500) {
    const batch = previous.slice(offset, offset + 500);
    const currentRows = await prisma.item.findMany({
      where: { id: { in: batch.map((item) => BigInt(item.id)) } },
      select: { id: true, itemLevel: true },
    });
    const currentById = new Map(currentRows.map((item) => [item.id.toString(), item]));
    for (const item of batch) {
      const current = currentById.get(item.id);
      if (current) rowsById.set(item.id, { ...item, itemLevel: current.itemLevel });
    }
  }
  for (const row of discoveredRows) rowsById.set(row.id, row);
  const rows = [...rowsById.values()].sort((left, right) =>
    Number(BigInt(left.baseId) - BigInt(right.baseId))
      || left.itemLevel - right.itemLevel
      || Number(BigInt(left.id) - BigInt(right.id)));
  await writeFile(outputPath, `${JSON.stringify({
    source: "Ascension client generated variants with family mappings preserved across direct CoA scans",
    generatedAt: new Date().toISOString(),
    items: rows,
  }, null, 2)}\n`);
  console.log(JSON.stringify({
    output: outputPath,
    upgrades: rows.length,
    preserved: rows.length - discoveredRows.length,
    newlyDiscoverable: discoveredRows.length,
    bases: new Set(rows.map((row) => row.baseId)).size,
  }));
}

main().finally(() => prisma.$disconnect());

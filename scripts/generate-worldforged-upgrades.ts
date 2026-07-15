import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";

interface UpgradeRow {
  id: string;
  baseId: string;
  itemLevel: number;
}

async function main(): Promise<void> {
  const outputPath = resolve(process.argv[2] ?? "src/data/worldforged-upgrades.json");
  const rows = await prisma.$queryRaw<UpgradeRow[]>(Prisma.sql`
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
  await writeFile(outputPath, `${JSON.stringify({
    source: "Ascension client generated variants, awaiting current CoA verification",
    generatedAt: new Date().toISOString(),
    items: rows,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ output: outputPath, upgrades: rows.length, bases: new Set(rows.map((row) => row.baseId)).size }));
}

main().finally(() => prisma.$disconnect());

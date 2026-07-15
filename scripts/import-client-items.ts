import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { EquipmentSlot, ItemQuality, Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";

interface ExtractedItem {
  id: string;
  name: string;
  quality: ItemQuality;
  itemLevel: number;
  requiredLevel: number;
  slot: EquipmentSlot | null;
  inventoryType: number;
  armorType: string | null;
  armor: number;
  icon: string | null;
  sourceUrl: string;
  sourceRealm: string;
  rawTooltipHtml: string;
  rawPayload: Prisma.InputJsonValue;
  contentHash: string;
}

async function main(): Promise<void> {
  const fileIndex = process.argv.indexOf("--file");
  const filename = fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined;
  if (!filename) throw new Error("Usage: npm run ingest:client-items -- --file ascension-items.ndjson.gz");
  const source = filename.endsWith(".gz") ? createReadStream(filename).pipe(createGunzip()) : createReadStream(filename);
  const lines = createInterface({ input: source, crlfDelay: Number.POSITIVE_INFINITY });
  let batch: Prisma.ItemCreateManyInput[] = [];
  let read = 0;
  let inserted = 0;

  async function flush(): Promise<void> {
    if (!batch.length) return;
    const result = await prisma.item.createMany({ data: batch, skipDuplicates: true });
    inserted += result.count;
    batch = [];
    if (read % 25_000 === 0) console.log(`processed ${read.toLocaleString()} · inserted ${inserted.toLocaleString()}`);
  }

  for await (const line of lines) {
    if (!line.trim()) continue;
    const item = JSON.parse(line) as ExtractedItem;
    batch.push({
      ...item,
      id: BigInt(item.id),
      ingestedAt: new Date(),
    });
    read += 1;
    if (batch.length >= 1_000) await flush();
  }
  await flush();
  const pveStats = await prisma.$executeRaw`
    INSERT INTO "ItemStat" ("itemId", "statKey", "value", "source")
    SELECT id, 'pve_power', (("rawPayload"->'addon'->>'ascensionPower')::double precision), CAST('BASE' AS "StatSource")
    FROM "Item"
    WHERE "sourceRealm" = 'ASCENSION_CLIENT_ALL_REALMS'
      AND ("rawPayload"->'addon'->>'ascensionPower')::double precision > 0
    ON CONFLICT ("itemId", "statKey", "source") DO UPDATE SET "value" = EXCLUDED."value"
  `;
  console.log(JSON.stringify({ read, inserted, skipped: read - inserted, pveStats }));
}

main().finally(() => prisma.$disconnect());

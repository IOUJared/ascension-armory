import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { EquipmentSlot, ItemQuality, Prisma, SocketColor } from "@prisma/client";
import { prisma } from "../src/lib/db";

interface RealmCacheItem {
  id: string;
  name: string;
  quality: ItemQuality;
  itemLevel: number;
  requiredLevel: number;
  slot: EquipmentSlot | null;
  inventoryType: number;
  armorType: string | null;
  armor: number;
  displayId: number;
  weaponMinDamage: number | null;
  weaponMaxDamage: number | null;
  weaponSpeed: number | null;
  weaponDps: number | null;
  stats: Record<string, number>;
  sockets: Array<{ position: number; color: SocketColor }>;
  sourceUrl: string;
  sourceRealm: string;
  rawTooltipHtml: string;
  rawPayload: Prisma.InputJsonValue;
  contentHash: string;
}

const BATCH_SIZE = 100;

async function main(): Promise<void> {
  const fileIndex = process.argv.indexOf("--file");
  const filename = fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined;
  if (!filename) throw new Error("Usage: npm run ingest:realm-cache -- --file coa-realm-items.ndjson.gz");
  const source = filename.endsWith(".gz") ? createReadStream(filename).pipe(createGunzip()) : createReadStream(filename);
  const lines = createInterface({ input: source, crlfDelay: Number.POSITIVE_INFINITY });
  let batch: RealmCacheItem[] = [];
  let imported = 0;

  async function flush(): Promise<void> {
    if (!batch.length) return;
    const current = batch;
    batch = [];
    await prisma.$transaction(current.flatMap((item) => {
      const id = BigInt(item.id);
      const data = {
        name: item.name,
        quality: item.quality,
        itemLevel: item.itemLevel,
        requiredLevel: item.requiredLevel,
        slot: item.slot,
        inventoryType: item.inventoryType,
        armorType: item.armorType,
        armor: item.armor,
        weaponMinDamage: item.weaponMinDamage,
        weaponMaxDamage: item.weaponMaxDamage,
        weaponSpeed: item.weaponSpeed,
        weaponDps: item.weaponDps,
        sourceUrl: item.sourceUrl,
        sourceRealm: item.sourceRealm,
        rawTooltipHtml: item.rawTooltipHtml,
        rawPayload: { ...(item.rawPayload as object), item: { displayId: item.displayId } } as Prisma.InputJsonValue,
        contentHash: item.contentHash,
        ingestedAt: new Date(),
      };
      return [
        prisma.item.upsert({
          where: { id },
          update: data,
          create: { id, ...data },
        }),
        // The all-realms client DBC contains legacy Ascension power values. A
        // current CoA realm response supersedes those along with the old stats.
        prisma.itemStat.deleteMany({ where: { itemId: id } }),
        prisma.itemSocket.deleteMany({ where: { itemId: id } }),
      ];
    }));

    await prisma.$transaction(current.flatMap((item) => {
      const itemId = BigInt(item.id);
      const operations: Prisma.PrismaPromise<unknown>[] = [];
      const stats = Object.entries(item.stats).filter(([, value]) => Number.isFinite(value) && value !== 0);
      if (stats.length) {
        operations.push(prisma.itemStat.createMany({
          data: stats.map(([statKey, value]) => ({ itemId, statKey, value, source: "BASE" })),
          skipDuplicates: true,
        }));
      }
      if (item.sockets.length) {
        operations.push(prisma.itemSocket.createMany({
          data: item.sockets.map((socket) => ({ itemId, position: socket.position, color: socket.color })),
          skipDuplicates: true,
        }));
      }
      return operations;
    }));
    imported += current.length;
    if (imported % 1_000 === 0 || current.length < BATCH_SIZE) console.log(`imported ${imported.toLocaleString()} current-realm items`);
  }

  for await (const line of lines) {
    if (!line.trim()) continue;
    const item = JSON.parse(line) as RealmCacheItem;
    if (!item.slot) continue;
    batch.push(item);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  console.log(JSON.stringify({ imported, source: "Rexxar - Conquest of Azeroth itemcache.wdb" }));
}

main().finally(() => prisma.$disconnect());

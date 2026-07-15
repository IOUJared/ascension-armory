import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GearItem } from "../../src/domain/gear";
import {
  CATALOG_SCHEMA_VERSION,
  CATALOG_SHARD_SLOTS,
  canonicalCatalogSlot,
  catalogShardFilename,
  type CatalogDocument,
  type CatalogIdIndex,
  type CatalogManifest,
  type CatalogShardDocument,
  type CatalogShardSlot,
} from "../../src/lib/items/catalog-schema";

export async function writeCatalogAssets(outputPath: string, document: CatalogDocument): Promise<void> {
  const dataDirectory = dirname(outputPath);
  const catalogDirectory = join(dataDirectory, "catalog");
  const slotsDirectory = join(catalogDirectory, "slots");
  const grouped = new Map(CATALOG_SHARD_SLOTS.map((slot) => [slot, [] as GearItem[]]));
  const indexItems: CatalogIdIndex["items"] = {};

  await mkdir(slotsDirectory, { recursive: true });

  for (const item of document.items) {
    const slot = canonicalCatalogSlot(item.slot);
    grouped.get(slot)?.push(item);
    indexItems[item.id] = slot;
  }

  const shards = {} as Record<CatalogShardSlot, CatalogManifest["shards"][CatalogShardSlot]>;
  const writes: Promise<void>[] = [];
  for (const slot of CATALOG_SHARD_SLOTS) {
    const items = grouped.get(slot) ?? [];
    const filename = catalogShardFilename(slot);
    const relativePath = `data/catalog/slots/${filename}`;
    const shard: CatalogShardDocument = {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      generatedAt: document.generatedAt,
      slot,
      items,
    };
    shards[slot] = { path: relativePath, itemCount: items.length };
    writes.push(writeFile(join(slotsDirectory, filename), JSON.stringify(shard)));
  }

  const idIndex: CatalogIdIndex = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    generatedAt: document.generatedAt,
    items: indexItems,
  };
  const manifest: CatalogManifest = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    generatedAt: document.generatedAt,
    itemCount: document.items.length,
    idIndexPath: "data/catalog/item-index.json",
    shards,
  };

  await Promise.all([
    writeFile(outputPath, JSON.stringify(document)),
    writeFile(join(catalogDirectory, "manifest.json"), JSON.stringify(manifest, null, 2)),
    writeFile(join(catalogDirectory, "item-index.json"), JSON.stringify(idIndex)),
    ...writes,
  ]);
}

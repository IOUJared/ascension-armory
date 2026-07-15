import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  CATALOG_SCHEMA_VERSION,
  CATALOG_SHARD_SLOTS,
  canonicalCatalogSlot,
  catalogShardFilename,
  type CatalogDocument,
  type CatalogIdIndex,
  type CatalogManifest,
  type CatalogShardDocument,
} from "../../src/lib/items/catalog-schema";
import { validateCatalogDocument } from "./catalog-validator";

const catalogPath = resolve(process.argv[2] ?? "public/data/coa-items.json");
const minimumItemCount = Number(process.env.MIN_CATALOG_ITEMS ?? 30_000);

async function main(): Promise<void> {
  const raw = await readFile(catalogPath, "utf8");
  const document: unknown = JSON.parse(raw);
  const result = validateCatalogDocument(document, minimumItemCount);

  if (result.errors.length === 0) {
    const canonicalItems = new Map((document as CatalogDocument).items.map((item) => [item.id, JSON.stringify(item)]));
    const publishedRoot = dirname(dirname(catalogPath));
    const manifest = JSON.parse(await readFile(resolve(publishedRoot, "data/catalog/manifest.json"), "utf8")) as CatalogManifest;
    const idIndex = JSON.parse(await readFile(resolve(publishedRoot, "data/catalog/item-index.json"), "utf8")) as CatalogIdIndex;
    const distributedItems: CatalogShardDocument["items"] = [];
    const distributedIds = new Set<string>();

    if (manifest.schemaVersion !== CATALOG_SCHEMA_VERSION) result.errors.push({ path: "manifest.schemaVersion", message: "is unsupported" });
    if (idIndex.schemaVersion !== CATALOG_SCHEMA_VERSION) result.errors.push({ path: "itemIndex.schemaVersion", message: "is unsupported" });
    if (manifest.generatedAt !== idIndex.generatedAt) result.errors.push({ path: "itemIndex.generatedAt", message: "does not match the manifest" });
    if (manifest.idIndexPath !== "data/catalog/item-index.json") result.errors.push({ path: "manifest.idIndexPath", message: "does not identify the published index" });

    for (const slot of CATALOG_SHARD_SLOTS) {
      const expectedPath = `data/catalog/slots/${catalogShardFilename(slot)}`;
      const descriptor = manifest.shards[slot];
      if (!descriptor || descriptor.path !== expectedPath) {
        result.errors.push({ path: `manifest.shards.${slot}`, message: "does not identify the expected shard" });
        continue;
      }
      const shard = JSON.parse(await readFile(resolve(publishedRoot, expectedPath), "utf8")) as CatalogShardDocument;
      if (shard.schemaVersion !== CATALOG_SCHEMA_VERSION) result.errors.push({ path: `${slot}.schemaVersion`, message: "is unsupported" });
      if (shard.generatedAt !== manifest.generatedAt) result.errors.push({ path: `${slot}.generatedAt`, message: "does not match the manifest" });
      if (shard.slot !== slot) result.errors.push({ path: `${slot}.slot`, message: "does not match its shard" });
      if (!Array.isArray(shard.items) || shard.items.length !== descriptor.itemCount) {
        result.errors.push({ path: `${slot}.items`, message: "count does not match the manifest" });
        continue;
      }
      for (const item of shard.items) {
        if (canonicalCatalogSlot(item.slot) !== slot) result.errors.push({ path: `${slot}.items.${item.id}.slot`, message: "belongs to a different shard" });
        if (distributedIds.has(item.id)) result.errors.push({ path: `${slot}.items.${item.id}`, message: "duplicates an item in another shard" });
        distributedIds.add(item.id);
        distributedItems.push(item);
        if (canonicalItems.get(item.id) !== JSON.stringify(item)) {
          result.errors.push({ path: `${slot}.items.${item.id}`, message: "does not match the canonical catalog" });
        }
      }
    }

    const distributedResult = validateCatalogDocument({ generatedAt: manifest.generatedAt, items: distributedItems }, minimumItemCount);
    result.errors.push(...distributedResult.errors.map((issue) => ({ ...issue, path: `shards.${issue.path}` })));
    if (manifest.itemCount !== distributedItems.length) result.errors.push({ path: "manifest.itemCount", message: "does not match shard contents" });
    if (canonicalItems.size !== distributedItems.length) result.errors.push({ path: "shards.items", message: "count does not match the canonical catalog" });
    const indexedIds = Object.keys(idIndex.items);
    if (indexedIds.length !== distributedItems.length) result.errors.push({ path: "itemIndex.items", message: "count does not match shard contents" });
    for (const item of distributedItems) {
      if (idIndex.items[item.id] !== canonicalCatalogSlot(item.slot)) {
        result.errors.push({ path: `itemIndex.items.${item.id}`, message: "does not identify the item's shard" });
      }
    }
  }

  if (result.errors.length) {
    console.error(`Catalog validation failed with ${result.errors.length.toLocaleString()} error(s):`);
    for (const issue of result.errors.slice(0, 50)) console.error(`- ${issue.path}: ${issue.message}`);
    if (result.errors.length > 50) console.error(`- ...and ${(result.errors.length - 50).toLocaleString()} more`);
    process.exitCode = 1;
    return;
  }

  console.log(`Catalog valid: ${result.itemCount.toLocaleString()} items`);
  console.log(`Sources: ${Object.entries(result.sourceCounts).map(([source, count]) => `${source}=${count.toLocaleString()}`).join(", ")}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

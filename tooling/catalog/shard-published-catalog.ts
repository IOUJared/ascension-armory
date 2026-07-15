import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CatalogDocument } from "../../src/lib/items/catalog-schema";
import { writeCatalogAssets } from "./write-catalog-assets";

const catalogPath = resolve(process.argv[2] ?? "public/data/coa-items.json");

async function main(): Promise<void> {
  const document = JSON.parse(await readFile(catalogPath, "utf8")) as CatalogDocument;
  await writeCatalogAssets(catalogPath, document);
  console.log(`Published ${document.items.length.toLocaleString()} items as slot-specific catalog shards.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

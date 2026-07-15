import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateCatalogDocument } from "./catalog-validator";

const catalogPath = resolve(process.argv[2] ?? "public/data/coa-items.json");
const minimumItemCount = Number(process.env.MIN_CATALOG_ITEMS ?? 30_000);

async function main(): Promise<void> {
  const raw = await readFile(catalogPath, "utf8");
  const document: unknown = JSON.parse(raw);
  const result = validateCatalogDocument(document, minimumItemCount);

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

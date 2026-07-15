import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

interface WorldforgedCatalogSource {
  source: "LootCollector";
  generatedAt: string;
  discoveryCount: number;
  itemIds: string[];
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const configuredSource = option("--file") ?? process.env.LOOTCOLLECTOR_SAVED_VARIABLES;
  if (!configuredSource) throw new Error("Pass LootCollector.lua with --file or LOOTCOLLECTOR_SAVED_VARIABLES.");
  const sourcePath = resolve(configuredSource);
  const outputPath = resolve(option("--output") ?? "src/data/worldforged-items.json");
  const savedVariables = await readFile(sourcePath, "utf8");

  // LootCollector writes dt (discovery type) immediately before i (item ID).
  // Type 1 is WORLDFORGED. Parsing these data lines avoids executing a Lua
  // SavedVariables file and works for every realm bucket in schema v8.
  const matches = [...savedVariables.matchAll(/\["dt"\]\s*=\s*1,\s*\["i"\]\s*=\s*(\d+),/g)];
  if (!matches.length) throw new Error(`No Worldforged discoveries were found in ${sourcePath}`);

  const itemIds = [...new Set(matches.map((match) => match[1]))]
    .sort((left, right) => Number(left) - Number(right));
  const payload: WorldforgedCatalogSource = {
    source: "LootCollector",
    generatedAt: new Date().toISOString(),
    discoveryCount: matches.length,
    itemIds,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ source: sourcePath, output: outputPath, discoveries: matches.length, uniqueItems: itemIds.length }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

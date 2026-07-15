import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface CandidateSource {
  items?: Array<{ id: string; link?: string }>;
  itemIds: string[];
}

async function main(): Promise<void> {
  const sourcePath = resolve(process.argv[2] ?? "src/data/worldforged-items.json");
  const outputPath = resolve(process.argv[3] ?? "addon/AscensionArmoryExporter/WorldforgedCandidates.lua");
  const source = JSON.parse(await readFile(sourcePath, "utf8")) as CandidateSource;
  const byId = new Map((source.items ?? []).map((item) => [item.id, item.link]));
  const rows = source.itemIds.map((id) => {
    const link = byId.get(id);
    return `  { id = ${Number(id)}, link = ${link ? JSON.stringify(link) : "nil"} },`;
  });
  const output = [
    "-- Generated from the current LootCollector SavedVariables database.",
    "-- Discovery metadata only; the scanner asks the CoA realm for item data.",
    "AscensionArmoryWorldforgedCandidates = {",
    ...rows,
    "}",
    "",
  ].join("\n");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
  console.log(JSON.stringify({ source: sourcePath, output: outputPath, candidates: rows.length }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

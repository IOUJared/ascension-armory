import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

interface AtlasItem {
  id: string;
  name?: string;
  sourceFile: string;
  line: number;
  section?: string;
  kind: "atlasloot-entry" | "worldforged-variant";
  baseId?: string;
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return resolve(index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback);
}

function sourceName(line: string): string | undefined {
  const comment = line.match(/--\s*(.+?)\s*$/)?.[1];
  return comment && !comment.startsWith("[") ? comment : undefined;
}

function lineNumber(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

async function main(): Promise<void> {
  const atlasDir = argument("--atlas-dir", "/tmp/atlasloot-ascension");
  const outputPath = argument("--output", "src/data/atlasloot-coa-items.json");
  const classicDir = join(atlasDir, "AtlasLoot/Databases/Items/Classic");
  const classicFiles = (await readdir(classicDir))
    .filter((file) => file.endsWith(".lua"))
    .sort()
    .map((file) => join(classicDir, file));
  const sourceFiles = [
    ...classicFiles,
    join(atlasDir, "AtlasLoot/Databases/Items/Worldevents.lua"),
    join(atlasDir, "AtlasLoot/Databases/Databases.lua"),
  ];

  const itemsById = new Map<string, AtlasItem>();
  const worldforgedBaseIds = new Set<string>();

  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    const sourceFile = relative(atlasDir, file).split(sep).join("/");
    const lines = source.split("\n");
    let section: string | undefined;
    let inWorldforged = false;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const sectionMatch = line.match(/^\s*\["([^"]+)"\]\s*=\s*\{/);
      if (sectionMatch) section = sectionMatch[1];
      if (/^\s*WorldforgedClassic\s*=\s*\{/.test(line)) {
        section = "WorldforgedClassic";
        inWorldforged = true;
        continue;
      }
      if (inWorldforged && /^\s*if AtlasLoot_Data_Cache/.test(line)) {
        inWorldforged = false;
        section = undefined;
      }
      const match = line.match(/\bitemID\s*=\s*(\d+)/);
      if (!match || match[1] === "0") continue;
      const id = match[1];
      if (inWorldforged) worldforgedBaseIds.add(id);
      if (!itemsById.has(id)) {
        itemsById.set(id, {
          id,
          ...(sourceName(line) ? { name: sourceName(line) } : {}),
          sourceFile,
          line: index + 1,
          ...(section ? { section } : {}),
          kind: "atlasloot-entry",
        });
      }
    }
  }

  const correctionFile = join(atlasDir, "AtlasLoot_Cache/ItemIDsDatabaseFixes.lua");
  const correctionSource = await readFile(correctionFile, "utf8");
  const correctionSourceFile = relative(atlasDir, correctionFile).split(sep).join("/");
  const correctionPattern = /ItemIDsDatabaseCorrectedIDs\[(\d+)\]\s*=\s*\{([^}]*)\}[^\n]*/g;
  for (const match of correctionSource.matchAll(correctionPattern)) {
    const baseId = match[1];
    if (!worldforgedBaseIds.has(baseId)) continue;
    // Explicit numeric table indexes are difficulty keys, not item IDs.
    const values = match[2].replace(/\[\d+\]\s*=/g, "");
    const name = sourceName(match[0]);
    for (const value of values.matchAll(/\b\d+\b/g)) {
      const id = value[0];
      if (id === "0" || id === baseId || itemsById.has(id)) continue;
      itemsById.set(id, {
        id,
        ...(name ? { name } : {}),
        sourceFile: correctionSourceFile,
        line: lineNumber(correctionSource, match.index ?? 0),
        section: "WorldforgedClassic",
        kind: "worldforged-variant",
        baseId,
      });
    }
  }

  let commit = "unknown";
  try {
    commit = execFileSync("git", ["-C", atlasDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    // Extraction also works from an unpacked AtlasLoot release archive.
  }
  const items = [...itemsById.values()].sort((a, b) => Number(a.id) - Number(b.id));
  const payload = {
    source: "AtlasLoot Ascension Edition CoA candidate index; stats require current-realm verification",
    repository: "https://github.com/Szyler/AtlasLootAscension",
    commit,
    generatedAt: new Date().toISOString(),
    scope: [
      "AtlasLoot/Databases/Items/Classic/*.lua",
      "AtlasLoot/Databases/Items/Worldevents.lua",
      "AtlasLoot/Databases/Databases.lua",
      "Worldforged variants for WorldforgedClassic bases from AtlasLoot_Cache/ItemIDsDatabaseFixes.lua",
    ],
    worldforgedBases: worldforgedBaseIds.size,
    itemIds: items.map((item) => item.id),
    items,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({
    atlasDir,
    output: outputPath,
    commit,
    candidates: items.length,
    worldforgedBases: worldforgedBaseIds.size,
    worldforgedVariants: items.filter((item) => item.kind === "worldforged-variant").length,
  }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

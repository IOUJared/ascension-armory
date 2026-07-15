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
  sourceType?: "DUNGEON" | "RAID" | "CRAFTING" | "FACTION" | "PVP" | "WORLD_EVENT" | "COLLECTION" | "WORLD_DROP" | "WORLDFORGED";
  sourceName?: string;
  encounter?: string;
  sourceConfidence?: "EXACT" | "CATEGORY";
}

interface AtlasMenu {
  name?: string;
  type?: string;
  groups: string[];
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

function braceDelta(line: string): number {
  const code = line.replace(/--.*$/, "").replace(/"(?:\\.|[^"\\])*"/g, "");
  return (code.match(/\{/g)?.length ?? 0) - (code.match(/\}/g)?.length ?? 0);
}

function humanize(value: string): string {
  return value
    .replace(/CLASSIC$/i, "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim();
}

function menuValue(line: string): string | undefined {
  return line.match(/"([^"]+)"/)?.[1]
    ?? line.match(/AL\["([^"]+)"\]/)?.[1]
    ?? (line.match(/^\s*\{\s*([A-Z][A-Z0-9_]*)\s*,/)?.[1]?.replaceAll("_", " "));
}

async function extractMenus(atlasDir: string): Promise<Map<string, AtlasMenu>> {
  const menuDir = join(atlasDir, "AtlasLoot/UI/Menus");
  const files = (await readdir(menuDir)).filter((file) => file.endsWith(".lua")).sort();
  const menus = new Map<string, AtlasMenu>();
  for (const file of files) {
    const lines = (await readFile(join(menuDir, file), "utf8")).split("\n");
    let depth = 0;
    let section: string | undefined;
    let sectionDepth = -1;
    for (const line of lines) {
      const before = depth;
      const sectionMatch = line.match(/^\s*\["([^"]+)"\]\s*=\s*\{/);
      if (sectionMatch) {
        section = sectionMatch[1];
        sectionDepth = before;
        menus.set(section, { groups: [] });
      }
      if (section) {
        const menu = menus.get(section)!;
        const name = line.match(/^\s*Name\s*=\s*"([^"]+)"/)?.[1];
        const type = line.match(/^\s*Type\s*=\s*"([^"]+)"/)?.[1];
        if (name) menu.name = name;
        if (type) menu.type = type;
        if (before === sectionDepth + 1 && /^\s*\{/.test(line)) {
          const group = menuValue(line);
          if (group) menu.groups.push(group);
        }
      }
      depth += braceDelta(line);
      if (section && depth <= sectionDepth) {
        section = undefined;
        sectionDepth = -1;
      }
    }
  }
  return menus;
}

function sourceMetadata(sourceFile: string, section: string | undefined, groupIndex: number, menus: Map<string, AtlasMenu>): Partial<AtlasItem> {
  if (!section) return {};
  const menu = menus.get(section);
  const file = sourceFile.split("/").at(-1) ?? "";
  let sourceType: AtlasItem["sourceType"];
  if (section === "WorldforgedClassic") sourceType = "WORLDFORGED";
  else if (section === "AQOpening") sourceType = "WORLD_EVENT";
  else if (/WorldEpics/i.test(section)) sourceType = "WORLD_DROP";
  else if (file === "Instances.lua") sourceType = /Raid/i.test(menu?.type ?? "") ? "RAID" : "DUNGEON";
  else if (file === "Crafting.lua") sourceType = "CRAFTING";
  else if (file === "Factions.lua") sourceType = "FACTION";
  else if (file === "PvP.lua") sourceType = "PVP";
  else if (file === "Worldevents.lua") sourceType = "WORLD_EVENT";
  else if (file === "Collections.lua") sourceType = "COLLECTION";
  if (!sourceType) return {};
  const encounter = groupIndex > 0 ? menu?.groups[groupIndex - 1] : undefined;
  return {
    sourceType,
    sourceName: section === "AQOpening" ? "Ahn'Qiraj Opening Event" : menu?.name ?? humanize(section),
    ...(encounter ? { encounter } : {}),
    sourceConfidence: encounter && (sourceType === "DUNGEON" || sourceType === "RAID") ? "EXACT" : "CATEGORY",
  };
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
  const menus = await extractMenus(atlasDir);

  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    const sourceFile = relative(atlasDir, file).split(sep).join("/");
    const lines = source.split("\n");
    let section: string | undefined;
    let sectionDepth = -1;
    let depth = 0;
    let groupIndex = 0;
    let inWorldforged = false;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const before = depth;
      const sectionMatch = line.match(/^\s*\["([^"]+)"\]\s*=\s*\{/);
      if (sectionMatch) {
        section = sectionMatch[1];
        sectionDepth = before;
        groupIndex = 0;
      }
      if (/^\s*WorldforgedClassic\s*=\s*\{/.test(line)) {
        section = "WorldforgedClassic";
        sectionDepth = before;
        groupIndex = 0;
        inWorldforged = true;
      }
      if (inWorldforged && /^\s*if AtlasLoot_Data_Cache/.test(line)) {
        inWorldforged = false;
        section = undefined;
      }
      if (section && before === sectionDepth + 1 && /^\s*\{\s*(?:--.*)?$/.test(line)) groupIndex += 1;
      const match = line.match(/\bitemID\s*=\s*(\d+)/);
      if (match && match[1] !== "0") {
        const id = match[1];
        if (inWorldforged) worldforgedBaseIds.add(id);
        if (!itemsById.has(id)) {
          itemsById.set(id, {
            id,
            ...(sourceName(line) ? { name: sourceName(line) } : {}),
            sourceFile,
            line: index + 1,
            ...(section ? { section } : {}),
            ...sourceMetadata(sourceFile, section, groupIndex, menus),
            kind: "atlasloot-entry",
          });
        }
      }
      depth += braceDelta(line);
      if (section && !inWorldforged && depth <= sectionDepth) {
        section = undefined;
        sectionDepth = -1;
        groupIndex = 0;
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
      const baseSource = itemsById.get(baseId);
      itemsById.set(id, {
        id,
        ...(name ? { name } : {}),
        sourceFile: correctionSourceFile,
        line: lineNumber(correctionSource, match.index ?? 0),
        section: "WorldforgedClassic",
        kind: "worldforged-variant",
        baseId,
        ...(baseSource?.sourceType ? {
          sourceType: baseSource.sourceType,
          sourceName: baseSource.sourceName,
          encounter: baseSource.encounter,
          sourceConfidence: baseSource.sourceConfidence,
        } : {
          sourceType: "WORLDFORGED",
          sourceName: "Worldforged discovery",
          sourceConfidence: "CATEGORY",
        }),
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

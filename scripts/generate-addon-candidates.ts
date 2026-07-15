import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface CandidateSource {
  items?: Array<{ id: string; link?: string }>;
  itemIds: string[];
}

interface UpgradeSource {
  items: Array<{ id: string; baseId: string; itemLevel: number }>;
}

interface AtlasLootSource {
  items: Array<{ id: string; baseId?: string; kind: string }>;
}

interface DungeonVariantSource {
  items: Array<{ id: string; baseId: string; itemLevel: number; tier: string }>;
}

interface CurrentCatalog {
  items: Array<{ id: string; dataSource?: string; armor?: number }>;
}

async function main(): Promise<void> {
  const sourcePath = resolve(process.argv[2] ?? "src/data/worldforged-items.json");
  const outputPath = resolve(process.argv[3] ?? "addon/AscensionArmoryExporter/WorldforgedCandidates.lua");
  const source = JSON.parse(await readFile(sourcePath, "utf8")) as CandidateSource;
  let upgrades: UpgradeSource = { items: [] };
  let atlasLoot: AtlasLootSource = { items: [] };
  let dungeonVariants: DungeonVariantSource = { items: [] };
  let currentCatalog: CurrentCatalog = { items: [] };
  try {
    upgrades = JSON.parse(await readFile(resolve("src/data/worldforged-upgrades.json"), "utf8")) as UpgradeSource;
  } catch {
    // Base discovery scanning remains available before upgrade candidates exist.
  }
  try {
    atlasLoot = JSON.parse(await readFile(resolve("src/data/atlasloot-coa-items.json"), "utf8")) as AtlasLootSource;
  } catch {
    // AtlasLoot is an optional additional discovery index.
  }
  try {
    dungeonVariants = JSON.parse(await readFile(resolve("src/data/dungeon-variants.json"), "utf8")) as DungeonVariantSource;
  } catch {
    // Generated dungeon variants are optional until the client index is imported.
  }
  try {
    currentCatalog = JSON.parse(await readFile(resolve("public/data/coa-items.json"), "utf8")) as CurrentCatalog;
  } catch {
    // A first-time scanner can be generated before the static catalog exists.
  }
  const alreadyCurrent = new Set(currentCatalog.items.map((item) => item.id));
  const byId = new Map((source.items ?? []).map((item) => [item.id, item.link]));
  const candidates = new Map<string, string>();
  for (const id of source.itemIds) {
    const link = byId.get(id);
    candidates.set(id, `  { id = ${Number(id)}, link = ${link ? JSON.stringify(link) : "nil"}, source = "lootcollector" },`);
  }
  for (const item of upgrades.items) {
    candidates.set(item.id, `  { id = ${Number(item.id)}, baseId = ${Number(item.baseId)}, itemLevel = ${item.itemLevel}, source = "client-variant" },`);
  }
  for (const item of dungeonVariants.items) {
    candidates.set(item.id, `  { id = ${Number(item.id)}, baseId = ${Number(item.baseId)}, itemLevel = ${item.itemLevel}, source = "dungeon-${item.tier.toLowerCase()}" },`);
  }
  for (const item of currentCatalog.items) {
    // Realm WDB rows are discovery data, not final tooltip verification. Queue
    // every cache-only item so GetItemStats can supersede it on the live realm.
    if (item.dataSource !== "COA_REALM_CACHE" || candidates.has(item.id)) continue;
    candidates.set(item.id, `  { id = ${Number(item.id)}, source = "realm-cache-validation" },`);
  }
  for (const item of atlasLoot.items) {
    // Existing LootCollector/client candidates remain in the list so an
    // interrupted scan can resume. Atlas-only IDs already verified by the
    // realm cache do not need another in-game query.
    if (candidates.has(item.id) || alreadyCurrent.has(item.id)) continue;
    candidates.set(item.id, `  { id = ${Number(item.id)}${item.baseId ? `, baseId = ${Number(item.baseId)}` : ""}, source = "atlasloot" },`);
  }
  const armorCandidates = currentCatalog.items
    .filter((item) => Number(item.armor) > 0)
    .map((item) => Number(item.id));
  const output = [
    "-- Generated from LootCollector, client variants, generated dungeon tiers, and the current CoA AtlasLoot index.",
    "-- Discovery metadata only; the scanner asks the CoA realm for item data.",
    "AscensionArmoryWorldforgedCandidates = {",
    ...candidates.values(),
    "}",
    "",
    "-- Existing armor-bearing catalog entries for rendered-tooltip verification.",
    "AscensionArmoryArmorCandidates = {",
    ...Array.from({ length: Math.ceil(armorCandidates.length / 20) }, (_, index) =>
      `  ${armorCandidates.slice(index * 20, index * 20 + 20).join(", ")},`),
    "}",
    "",
  ].join("\n");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
  console.log(JSON.stringify({
    source: sourcePath,
    output: outputPath,
    candidates: candidates.size,
    lootCollector: source.itemIds.length,
    upgrades: upgrades.items.length,
    dungeonVariants: dungeonVariants.items.length,
    realmCacheValidation: currentCatalog.items.filter((item) => item.dataSource === "COA_REALM_CACHE").length,
    atlasLoot: atlasLoot.items.length,
    atlasLootAlreadyCurrent: atlasLoot.items.filter((item) => alreadyCurrent.has(item.id)).length,
    armorRefresh: armorCandidates.length,
  }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

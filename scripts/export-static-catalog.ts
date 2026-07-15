import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { prisma } from "../src/lib/db";
import type { GearAcquisitionSource, GearItem, StatMap } from "../src/types/gear";
import catalogAdditions from "../src/data/catalog-additions.json";
import worldforgedItems from "../src/data/worldforged-items.json";
import worldforgedUpgrades from "../src/data/worldforged-upgrades.json";
import atlasLootItems from "../src/data/atlasloot-coa-items.json";
import dungeonVariants from "../src/data/dungeon-variants.json";

const outputPath = resolve(process.cwd(), process.argv[2] ?? "public/data/coa-items.json");

interface AtlasSourceEntry {
  sourceType?: GearAcquisitionSource["type"];
  sourceName?: string;
  encounter?: string;
  sourceConfidence?: GearAcquisitionSource["confidence"];
}

function acquisition(entry: AtlasSourceEntry | undefined, note?: string): GearAcquisitionSource | undefined {
  if (!entry?.sourceType || !entry.sourceName || !entry.sourceConfidence) return undefined;
  return {
    type: entry.sourceType,
    name: entry.sourceName,
    ...(entry.encounter ? { encounter: entry.encounter } : {}),
    confidence: entry.sourceConfidence,
    provenance: "ATLASLOOT_ASCENSION",
    ...(note ? { note } : {}),
  };
}

async function main(): Promise<void> {
  const upgradeBase = new Map(worldforgedUpgrades.items.map((item) => [item.id, item.baseId]));
  const worldforgedIds = new Set([...worldforgedItems.itemIds, ...worldforgedUpgrades.items.map((item) => item.id)]);
  const atlasLootById = new Map(atlasLootItems.items.map((item) => [item.id, item]));
  const dungeonVariantById = new Map(dungeonVariants.items.map((item) => [item.id, item]));
  // LootCollector identifies discovery candidates, including non-gear
  // Worldforged scrolls. It must not make a stale all-realms DBC row eligible
  // for export by itself; current realm data or a verified source must do that.
  const addedIds = catalogAdditions.items.map((item) => BigInt(item.id));
  const overrides = new Map(catalogAdditions.items.map((item) => [item.id, item.overrides]));
  const rows = await prisma.item.findMany({
    where: {
      slot: { not: null },
      OR: [
        { sourceUrl: { startsWith: "realm-cache://" } },
        { sourceUrl: { startsWith: "ingame-scan://" } },
        { id: { in: addedIds } },
      ],
    },
    include: { stats: true, effects: true, sockets: true, scaleSnapshots: { orderBy: { effectiveLevel: "asc" } } },
    orderBy: [{ slot: "asc" }, { itemLevel: "desc" }, { name: "asc" }],
  });

  const items: GearItem[] = rows.flatMap((item): GearItem[] => {
    if (!item.slot) return [];
    const override = overrides.get(item.id.toString());
    const dataSource = override
      ? "USER_VERIFIED"
      : item.sourceUrl.startsWith("ingame-scan://")
        ? "COA_INGAME_SCAN"
        : item.sourceUrl.startsWith("realm-cache://")
          ? "COA_REALM_CACHE"
          : "PLAYER_IMPORT";
    const payload = item.rawPayload as {
      item?: { displayId?: unknown; inventoryType?: unknown };
      scalingStatDistribution?: unknown;
      equipLocation?: unknown;
      inventoryType?: unknown;
      itemSubType?: unknown;
      sheath?: unknown;
    } | null;
    const displayId = Number(payload?.item?.displayId);
    const inventoryType = Number(payload?.inventoryType ?? payload?.item?.inventoryType);
    const sheath = Number(payload?.sheath);
    const twoHanded = payload?.equipLocation === "INVTYPE_2HWEAPON" || inventoryType === 17 || sheath === 1 || sheath === 2;
    // Armor and weapon DPS are represented by dedicated GearItem fields and
    // resolveItemStats adds them to the EP map. Keeping them here too would
    // score those values twice.
    const stats = Object.fromEntries(item.stats
      .filter((stat) => stat.statKey !== "armor" && stat.statKey !== "weapon_dps")
      .map((stat) => [stat.statKey, stat.value])) as StatMap;
    Object.assign(stats, override?.stats ?? {});
    const snapshotSignatures = new Set(item.scaleSnapshots.map((snapshot) => JSON.stringify([
      snapshot.itemLevel, snapshot.requiredLevel, snapshot.stats, snapshot.armor, snapshot.weaponDps,
    ])));
    // A calibration capture may prove that an item is fixed. Keep those rows
    // in PostgreSQL as evidence, but only publish snapshots that truly vary.
    const varyingScaleSnapshots = snapshotSignatures.size > 1 ? item.scaleSnapshots : [];
    const scalingStatDistribution = Number(payload?.scalingStatDistribution ?? 0);
    // Scaling templates do not contain their resolved primary stats. Publishing
    // one before exact live snapshots exist makes it look like a DPS-only item.
    if (scalingStatDistribution > 0 && varyingScaleSnapshots.length === 0) return [];
    const itemId = item.id.toString();
    const dungeonVariant = dungeonVariantById.get(itemId);
    const worldforgedBase = upgradeBase.get(itemId);
    const atlasSource = atlasLootById.get(itemId)
      ?? (dungeonVariant ? atlasLootById.get(dungeonVariant.baseId) : undefined)
      ?? (worldforgedBase ? atlasLootById.get(worldforgedBase) : undefined);
    const sourceNote = dungeonVariant
      ? `${dungeonVariant.tier} level-cap version; acquisition follows the base dungeon item.`
      : worldforgedBase
        ? "Worldforged upgrade; acquisition follows the base item."
        : undefined;
    const acquisitionSource = acquisition(atlasSource, sourceNote);
    return [{
      id: itemId,
      name: item.name,
      slot: item.slot,
      quality: item.quality,
      itemLevel: item.itemLevel,
      requiredLevel: override?.requiredLevel ?? item.requiredLevel,
      ...(dungeonVariant ? { availableAtLevel: 60 } : {}),
      stats,
      ...(override?.armorType ?? item.armorType ? { armorType: override?.armorType ?? item.armorType ?? undefined } : {}),
      ...(override?.armor ?? item.armor ? { armor: override?.armor ?? item.armor } : {}),
      ...(item.weaponMinDamage !== null && item.weaponMaxDamage !== null && item.weaponSpeed !== null
        ? { weaponDamage: { min: item.weaponMinDamage, max: item.weaponMaxDamage, speed: item.weaponSpeed, dps: item.weaponDps ?? 0 } }
        : {}),
      ...(item.weaponMinDamage !== null && typeof payload?.itemSubType === "string" ? { weaponType: payload.itemSubType } : {}),
      ...(twoHanded ? { twoHanded: true } : {}),
      ...(item.icon ? { icon: item.icon } : {}),
      ...(Number.isInteger(displayId) && displayId > 0 ? { displayId } : {}),
      ...(item.effects.length ? { effects: item.effects.map((effect) => ({ kind: effect.kind, description: effect.description })) } : {}),
      ...(item.sockets.length ? { socketCount: item.sockets.length } : {}),
      ...(varyingScaleSnapshots.length ? { scaleSnapshots: varyingScaleSnapshots.map((snapshot) => ({
        effectiveLevel: snapshot.effectiveLevel,
        itemLevel: snapshot.itemLevel,
        requiredLevel: snapshot.requiredLevel,
        stats: snapshot.stats as StatMap,
        ...(snapshot.armor ? { armor: snapshot.armor } : {}),
        ...(snapshot.weaponDps !== null ? { weaponDps: snapshot.weaponDps } : {}),
      })) } : {}),
      ...(acquisitionSource ? { acquisition: acquisitionSource } : {}),
      source: dungeonVariantById.has(itemId)
        ? `${dataSource === "COA_INGAME_SCAN" ? "Current in-game scan" : "CoA realm cache"} · ${dungeonVariantById.get(itemId)?.tier} dungeon · ${dungeonVariantById.get(itemId)?.section}`
        : upgradeBase.has(itemId)
        ? `${dataSource === "COA_INGAME_SCAN" ? "Current in-game scan" : "CoA realm cache"} · Worldforged upgrade of ${upgradeBase.get(itemId)}`
        : worldforgedIds.has(itemId)
        ? `${dataSource === "COA_INGAME_SCAN" ? "Current in-game scan" : "CoA realm cache"} · LootCollector discovery`
        : atlasLootById.has(itemId)
        ? `${dataSource === "COA_INGAME_SCAN" ? "Current in-game scan" : "CoA realm cache"} · AtlasLoot ${atlasLootById.get(itemId)?.section ?? "CoA index"}`
        : item.sourceUrl,
      dataSource,
      ...(worldforgedIds.has(itemId) ? { worldforged: true } : {}),
      ...(upgradeBase.has(itemId) ? { worldforgedBaseId: upgradeBase.get(itemId) } : {}),
      ...(dungeonVariantById.has(itemId) ? {
        dungeonTier: dungeonVariantById.get(itemId)?.tier as GearItem["dungeonTier"],
        dungeonBaseId: dungeonVariantById.get(itemId)?.baseId,
      } : {}),
    }];
  });

  const payload = JSON.stringify({ generatedAt: new Date().toISOString(), items });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, payload);
  console.log(JSON.stringify({ output: outputPath, items: items.length, bytes: Buffer.byteLength(payload) }));
}

main().finally(() => prisma.$disconnect());

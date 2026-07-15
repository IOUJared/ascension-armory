import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { EquipmentSlot, ItemQuality, Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/db";
import type { StatKey } from "../../src/domain/gear";
import { decodeAddonField, finiteNumber, parseAddonStats, renderedTooltipArmor } from "./addon-snapshot";

const QUALITY: ItemQuality[] = ["POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "ARTIFACT", "HEIRLOOM"];
const SLOT: Record<string, EquipmentSlot> = {
  INVTYPE_HEAD: "HEAD", INVTYPE_NECK: "NECK", INVTYPE_SHOULDER: "SHOULDERS",
  INVTYPE_CLOAK: "BACK", INVTYPE_CHEST: "CHEST", INVTYPE_ROBE: "CHEST",
  INVTYPE_WRIST: "WRISTS", INVTYPE_HAND: "HANDS", INVTYPE_WAIST: "WAIST",
  INVTYPE_LEGS: "LEGS", INVTYPE_FEET: "FEET", INVTYPE_FINGER: "FINGER_1",
  INVTYPE_TRINKET: "TRINKET_1", INVTYPE_WEAPON: "MAIN_HAND",
  INVTYPE_2HWEAPON: "MAIN_HAND", INVTYPE_WEAPONMAINHAND: "MAIN_HAND",
  INVTYPE_SHIELD: "OFF_HAND", INVTYPE_HOLDABLE: "OFF_HAND", INVTYPE_WEAPONOFFHAND: "OFF_HAND",
  INVTYPE_RANGED: "RANGED", INVTYPE_RANGEDRIGHT: "RANGED", INVTYPE_THROWN: "RANGED", INVTYPE_RELIC: "RANGED",
};

interface Snapshot {
  id: string;
  link: string;
  quality: ItemQuality;
  itemLevel: number;
  requiredLevel: number;
  itemType: string;
  itemSubType: string;
  equipLocation: string;
  icon: string;
  name: string;
  pvePower: number;
  pvpPower: number;
  playerLevel: number;
  stats: Partial<Record<StatKey, number>>;
  rawStats: Record<string, number>;
  tooltip: string;
  inventoryType: number;
  classID: number;
  subClassID: number;
}

function parse(line: string): Snapshot | null {
  const fields = line.split("~");
  if (fields[0] !== "AAI1" || !/^\d+$/.test(fields[1] ?? "") || fields.length < 19) return null;
  const quality = QUALITY[finiteNumber(fields[3])] ?? "COMMON";
  const { stats, rawStats } = parseAddonStats(fields[14] ?? "");
  return {
    id: fields[1], link: decodeAddonField(fields[2]), quality,
    itemLevel: finiteNumber(fields[4]), requiredLevel: finiteNumber(fields[5]),
    itemType: decodeAddonField(fields[6]), itemSubType: decodeAddonField(fields[7]),
    equipLocation: decodeAddonField(fields[8]), icon: decodeAddonField(fields[9]).toLowerCase(),
    name: decodeAddonField(fields[10]), pvePower: finiteNumber(fields[11]), pvpPower: finiteNumber(fields[12]),
    playerLevel: finiteNumber(fields[13]), stats, rawStats, tooltip: decodeAddonField(fields[15]),
    inventoryType: finiteNumber(fields[16]), classID: finiteNumber(fields[17]), subClassID: finiteNumber(fields[18]),
  };
}

async function main(): Promise<void> {
  const fileIndex = process.argv.indexOf("--file");
  const filename = fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined;
  if (!filename) throw new Error("Usage: npm run ingest:addon-catalog -- --file AscensionArmoryExporter.lua");
  const savedVariables = await readFile(filename, "utf8");
  const snapshots = [...savedVariables.matchAll(/=\s*"(AAI1~[^"]+)"/g)]
    .map((match) => parse(match[1]))
    .filter((snapshot): snapshot is Snapshot => snapshot !== null);
  if (!snapshots.length) throw new Error(`No AAI1 catalog snapshots were found in ${filename}. Run /aacatalog and /reload in game first.`);

  let imported = 0;
  let cacheArmorConflicts = 0;
  let cacheStatConflicts = 0;
  for (let offset = 0; offset < snapshots.length; offset += 100) {
    const batch = snapshots.slice(offset, offset + 100);
    const existingRows = await prisma.item.findMany({
      where: { id: { in: batch.map((snapshot) => BigInt(snapshot.id)) } },
      include: { stats: true },
    });
    const existingById = new Map(existingRows.map((item) => [item.id.toString(), item]));
    for (const snapshot of batch) {
      const existing = existingById.get(snapshot.id);
      if (!existing?.sourceUrl.startsWith("realm-cache://")) continue;
      const scannedArmor = renderedTooltipArmor(snapshot.tooltip) ?? snapshot.stats.armor ?? 0;
      if ((existing.armor ?? 0) !== scannedArmor) cacheArmorConflicts += 1;
      const cachedStats = new Map(existing.stats.map((stat) => [stat.statKey, stat.value]));
      if ((Object.entries(snapshot.stats) as Array<[StatKey, number]>).some(([key, value]) =>
        key !== "armor" && key !== "weapon_dps" && cachedStats.has(key) && cachedStats.get(key) !== value)) cacheStatConflicts += 1;
    }
    await prisma.$transaction(batch.flatMap((snapshot) => {
      const id = BigInt(snapshot.id);
      const previousPayload = existingById.get(snapshot.id)?.rawPayload as { item?: { displayId?: unknown } } | null | undefined;
      const displayId = Number(previousPayload?.item?.displayId);
      const tooltipArmor = renderedTooltipArmor(snapshot.tooltip);
      const armor = tooltipArmor ?? snapshot.stats.armor ?? 0;
      const weaponDps = snapshot.stats.weapon_dps ?? null;
      const rawPayload = {
        source: "ascension-armory-ingame-scanner", link: snapshot.link,
        capturedAtPlayerLevel: snapshot.playerLevel, itemType: snapshot.itemType,
        itemSubType: snapshot.itemSubType, equipLocation: snapshot.equipLocation,
        inventoryType: snapshot.inventoryType, classID: snapshot.classID,
        subClassID: snapshot.subClassID, apiStats: snapshot.stats, apiStatsRaw: snapshot.rawStats,
        armorAuthority: tooltipArmor === undefined ? "game-api" : "rendered-tooltip",
        ...(Number.isInteger(displayId) && displayId > 0 ? { item: { displayId } } : {}),
      } satisfies Prisma.InputJsonObject;
      const data = {
        name: snapshot.name || `Unknown Item ${snapshot.id}`,
        quality: snapshot.quality,
        itemLevel: snapshot.itemLevel,
        requiredLevel: snapshot.requiredLevel || 1,
        slot: SLOT[snapshot.equipLocation] ?? null,
        inventoryType: snapshot.inventoryType || null,
        armorType: ["Cloth", "Leather", "Mail", "Plate", "Shields"].includes(snapshot.itemSubType) ? snapshot.itemSubType : null,
        armor,
        weaponDps,
        icon: snapshot.icon || null,
        sourceUrl: `ingame-scan://item/${snapshot.id}`,
        sourceRealm: "CONQUEST_OF_AZEROTH",
        rawTooltipHtml: snapshot.tooltip,
        rawPayload,
        contentHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
        ingestedAt: new Date(),
      };
      const stats = Object.entries(snapshot.stats)
        .filter(([key, value]) => key !== "armor" && key !== "weapon_dps" && value)
        .map(([statKey, value]) => ({ itemId: id, statKey, value: value as number, source: "BASE" as const }));
      if (snapshot.pvePower && !snapshot.stats.pve_power) stats.push({ itemId: id, statKey: "pve_power", value: snapshot.pvePower, source: "BASE" });
      if (snapshot.pvpPower && !snapshot.stats.pvp_power) stats.push({ itemId: id, statKey: "pvp_power", value: snapshot.pvpPower, source: "BASE" });
      return [
        prisma.item.upsert({ where: { id }, update: data, create: { id, ...data } }),
        prisma.itemStat.deleteMany({ where: { itemId: id } }),
        ...(stats.length ? [prisma.itemStat.createMany({ data: stats })] : []),
      ];
    }));
    imported += batch.length;
  }
  console.log(JSON.stringify({ imported, cacheArmorConflicts, cacheStatConflicts, source: filename, authority: "current in-game CoA API and tooltip" }));
}

main().finally(() => prisma.$disconnect());

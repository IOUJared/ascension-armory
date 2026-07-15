import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { EquipmentSlot, ItemQuality, Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { API_STAT_KEYS } from "../src/lib/gear-import";
import type { StatKey } from "../src/types/gear";

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
  tooltip: string;
  inventoryType: number;
  classID: number;
  subClassID: number;
}

function decode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function number(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parse(line: string): Snapshot | null {
  const fields = line.split("~");
  if (fields[0] !== "AAI1" || !/^\d+$/.test(fields[1] ?? "") || fields.length < 19) return null;
  const quality = QUALITY[number(fields[3])] ?? "COMMON";
  const stats: Partial<Record<StatKey, number>> = {};
  for (const pair of (fields[14] ?? "").split(",")) {
    const separator = pair.lastIndexOf(":");
    const key = API_STAT_KEYS[pair.slice(0, separator)];
    const value = number(pair.slice(separator + 1));
    if (separator > 0 && key && value) stats[key] = (stats[key] ?? 0) + value;
  }
  return {
    id: fields[1], link: decode(fields[2]), quality,
    itemLevel: number(fields[4]), requiredLevel: number(fields[5]),
    itemType: decode(fields[6]), itemSubType: decode(fields[7]),
    equipLocation: decode(fields[8]), icon: decode(fields[9]).toLowerCase(),
    name: decode(fields[10]), pvePower: number(fields[11]), pvpPower: number(fields[12]),
    playerLevel: number(fields[13]), stats, tooltip: decode(fields[15]),
    inventoryType: number(fields[16]), classID: number(fields[17]), subClassID: number(fields[18]),
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
  for (let offset = 0; offset < snapshots.length; offset += 100) {
    const batch = snapshots.slice(offset, offset + 100);
    await prisma.$transaction(batch.flatMap((snapshot) => {
      const id = BigInt(snapshot.id);
      const armor = snapshot.stats.armor ?? 0;
      const weaponDps = snapshot.stats.weapon_dps ?? null;
      const rawPayload = {
        source: "ascension-armory-ingame-scanner", link: snapshot.link,
        capturedAtPlayerLevel: snapshot.playerLevel, itemType: snapshot.itemType,
        itemSubType: snapshot.itemSubType, equipLocation: snapshot.equipLocation,
        inventoryType: snapshot.inventoryType, classID: snapshot.classID,
        subClassID: snapshot.subClassID, apiStats: snapshot.stats,
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
      if (snapshot.pvePower) stats.push({ itemId: id, statKey: "pve_power", value: snapshot.pvePower, source: "BASE" });
      if (snapshot.pvpPower) stats.push({ itemId: id, statKey: "pvp_power", value: snapshot.pvpPower, source: "BASE" });
      return [
        prisma.item.upsert({ where: { id }, update: data, create: { id, ...data } }),
        prisma.itemStat.deleteMany({ where: { itemId: id } }),
        ...(stats.length ? [prisma.itemStat.createMany({ data: stats })] : []),
      ];
    }));
    imported += batch.length;
  }
  console.log(JSON.stringify({ imported, source: filename, authority: "current in-game CoA API and tooltip" }));
}

main().finally(() => prisma.$disconnect());

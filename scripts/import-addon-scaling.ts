import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { API_STAT_KEYS } from "../src/lib/gear-import";
import type { StatKey, StatMap } from "../src/domain/gear";

interface ScaleSnapshot {
  itemId: string;
  effectiveLevel: number;
  link: string;
  itemLevel: number;
  requiredLevel: number;
  stats: StatMap;
  rawStats: Record<string, number>;
  capturedPlayerLevel: number;
  sourceRealm: string;
}

function decode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function number(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parse(line: string): ScaleSnapshot | null {
  const fields = line.split("~");
  if (fields[0] !== "AAS1" || !/^\d+$/.test(fields[1] ?? "") || fields.length < 12) return null;
  const stats: StatMap = {};
  const rawStats: Record<string, number> = {};
  for (const pair of (fields[7] ?? "").split(",")) {
    const separator = pair.lastIndexOf(":");
    if (separator < 1) continue;
    const rawKey = pair.slice(0, separator);
    const value = number(pair.slice(separator + 1));
    const key = API_STAT_KEYS[rawKey];
    rawStats[rawKey] = value;
    if (key && value) stats[key] = (stats[key] ?? 0) + value;
  }
  return {
    itemId: fields[1],
    effectiveLevel: number(fields[2]),
    link: decode(fields[3]),
    itemLevel: number(fields[4]),
    requiredLevel: Math.max(1, number(fields[5])),
    capturedPlayerLevel: number(fields[6]),
    stats,
    rawStats,
    sourceRealm: decode(fields[8]),
  };
}

async function main(): Promise<void> {
  const fileIndex = process.argv.indexOf("--file");
  const filename = fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined;
  if (!filename) throw new Error("Usage: npm run ingest:addon-scaling -- --file AscensionArmoryExporter.lua");
  const savedVariables = await readFile(filename, "utf8");
  const snapshots = [...savedVariables.matchAll(/=\s*"(AAS1~[^"]+)"/g)]
    .map((match) => parse(match[1]))
    .filter((snapshot): snapshot is ScaleSnapshot => snapshot !== null)
    .filter((snapshot) => snapshot.effectiveLevel >= 1 && snapshot.effectiveLevel <= 60);
  if (!snapshots.length) throw new Error(`No AAS1 scaling snapshots were found in ${filename}. Run /aascale test and /reload first.`);

  const existing = new Set((await prisma.item.findMany({
    where: { id: { in: [...new Set(snapshots.map((snapshot) => BigInt(snapshot.itemId)))] } },
    select: { id: true },
  })).map((item) => item.id.toString()));
  const eligible = snapshots.filter((snapshot) => existing.has(snapshot.itemId));
  for (let offset = 0; offset < eligible.length; offset += 200) {
    await prisma.$transaction(eligible.slice(offset, offset + 200).map((snapshot) => {
      const armor = snapshot.stats.armor ?? 0;
      const weaponDps = snapshot.stats.weapon_dps ?? null;
      const stats = Object.fromEntries((Object.entries(snapshot.stats) as Array<[StatKey, number]>)
        .filter(([key]) => key !== "armor" && key !== "weapon_dps")) as StatMap;
      const contentHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
      return prisma.itemScaleSnapshot.upsert({
        where: { itemId_effectiveLevel: { itemId: BigInt(snapshot.itemId), effectiveLevel: snapshot.effectiveLevel } },
        update: {
          itemLevel: snapshot.itemLevel, requiredLevel: snapshot.requiredLevel, stats: stats as Prisma.InputJsonObject,
          armor, weaponDps, sourceLink: snapshot.link, capturedPlayerLevel: snapshot.capturedPlayerLevel,
          sourceRealm: snapshot.sourceRealm || null, rawStats: snapshot.rawStats, contentHash, capturedAt: new Date(),
        },
        create: {
          itemId: BigInt(snapshot.itemId), effectiveLevel: snapshot.effectiveLevel,
          itemLevel: snapshot.itemLevel, requiredLevel: snapshot.requiredLevel, stats: stats as Prisma.InputJsonObject,
          armor, weaponDps, sourceLink: snapshot.link, capturedPlayerLevel: snapshot.capturedPlayerLevel,
          sourceRealm: snapshot.sourceRealm || null, rawStats: snapshot.rawStats, contentHash,
        },
      });
    }));
  }
  console.log(JSON.stringify({ parsed: snapshots.length, imported: eligible.length, skippedUnknownItems: snapshots.length - eligible.length, source: filename }));
}

main().finally(() => prisma.$disconnect());

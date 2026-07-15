import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";

interface ScalingCandidate {
  id: string;
  name: string;
  distribution: number;
  value: number;
}

async function main(): Promise<void> {
  const outputPath = resolve(process.argv[2] ?? "addon/AscensionArmoryExporter/ScalingCandidates.lua");
  const candidates = await prisma.$queryRaw<ScalingCandidate[]>(Prisma.sql`
    SELECT id::text AS id,
           name,
           ("rawPayload"->>'scalingStatDistribution')::int AS distribution,
           ("rawPayload"->>'scalingStatValue')::int AS value
    FROM "Item"
    WHERE slot IS NOT NULL
      AND ("sourceUrl" LIKE 'realm-cache://%' OR "sourceUrl" LIKE 'ingame-scan://%')
      AND COALESCE(("rawPayload"->>'scalingStatDistribution')::int, 0) > 0
    ORDER BY id
  `);
  const lines = [
    "-- Generated from current-realm item templates with ScalingStatDistribution.",
    "-- Stats must be resolved by the live client at each effective level.",
    "AscensionArmoryScalingCandidates = {",
    ...candidates.map((item) => `  ${item.id}, -- ${item.name.replace(/[\r\n]/g, " ")} (distribution ${item.distribution}, value ${item.value})`),
    "}",
    "",
  ];
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, lines.join("\n"));
  console.log(JSON.stringify({ output: outputPath, candidates: candidates.length }));
}

main().finally(() => prisma.$disconnect());

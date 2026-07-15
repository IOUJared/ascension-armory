import { readFile } from "node:fs/promises";
import { AscensionDbClient } from "../src/lib/ascension/client";
import { storeAscensionItem } from "../src/lib/ascension/store";
import { prisma } from "../src/lib/db";

function parseArgs(argv: string[]): string[] {
  const idsIndex = argv.indexOf("--ids");
  if (idsIndex >= 0 && argv[idsIndex + 1]) return argv[idsIndex + 1].split(",").map((id) => id.trim());
  return [];
}

async function main(): Promise<void> {
  let ids = parseArgs(process.argv.slice(2));
  const fileIndex = process.argv.indexOf("--file");
  if (fileIndex >= 0 && process.argv[fileIndex + 1]) {
    ids = (await readFile(process.argv[fileIndex + 1], "utf8")).split(/[\s,]+/).filter(Boolean);
  }
  if (!ids.length) throw new Error("Usage: npm run ingest:items -- --ids 40188,40200 OR --file item-ids.txt");

  const client = new AscensionDbClient();
  for (const [index, id] of ids.entries()) {
    try {
      const item = await client.fetchItem(id);
      await storeAscensionItem(prisma, item);
      console.log(`[${index + 1}/${ids.length}] stored ${item.name} (${id})`);
    } catch (error) {
      console.error(`[${index + 1}/${ids.length}] failed ${id}:`, error);
    }
  }
}

main().finally(() => prisma.$disconnect());

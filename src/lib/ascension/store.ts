import type { Prisma, PrismaClient } from "@prisma/client";
import type { ParsedAscensionItem } from "./parser";

const QUALITY = ["POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "ARTIFACT", "HEIRLOOM"] as const;

function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item)) as Prisma.InputJsonValue;
}

export async function storeAscensionItem(db: PrismaClient, parsed: ParsedAscensionItem): Promise<void> {
  await db.$transaction(async (tx) => {
    await Promise.all(parsed.stats.map(({ key }) => tx.statDefinition.upsert({
      where: { key },
      update: {},
      create: { key, label: key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()), category: "ITEM", isCustom: key.startsWith("pve_") || key.startsWith("pvp_") || key === "custom_power" },
    })));

    await tx.item.upsert({
      where: { id: parsed.id },
      update: {
        name: parsed.name, quality: QUALITY[parsed.quality] ?? "COMMON", itemLevel: parsed.itemLevel,
        requiredLevel: parsed.requiredLevel, slot: parsed.slot, inventoryType: parsed.inventoryType,
        armorType: parsed.armorType, armor: parsed.armor, weaponMinDamage: parsed.weaponMinDamage,
        weaponMaxDamage: parsed.weaponMaxDamage, weaponSpeed: parsed.weaponSpeed, weaponDps: parsed.weaponDps,
        icon: parsed.icon, rawTooltipHtml: parsed.tooltipHtml, rawPayload: jsonSafe(parsed.rawPayload),
        contentHash: parsed.contentHash, ingestedAt: new Date(),
      },
      create: {
        id: parsed.id, name: parsed.name, quality: QUALITY[parsed.quality] ?? "COMMON",
        itemLevel: parsed.itemLevel, requiredLevel: parsed.requiredLevel, slot: parsed.slot,
        inventoryType: parsed.inventoryType, armorType: parsed.armorType, armor: parsed.armor,
        weaponMinDamage: parsed.weaponMinDamage, weaponMaxDamage: parsed.weaponMaxDamage,
        weaponSpeed: parsed.weaponSpeed, weaponDps: parsed.weaponDps, icon: parsed.icon,
        sourceUrl: parsed.sourceUrl, rawTooltipHtml: parsed.tooltipHtml, rawPayload: jsonSafe(parsed.rawPayload),
        contentHash: parsed.contentHash,
      },
    });

    await tx.itemStat.deleteMany({ where: { itemId: parsed.id } });
    await tx.itemSocket.deleteMany({ where: { itemId: parsed.id } });
    await tx.itemEffect.deleteMany({ where: { itemId: parsed.id } });
    if (parsed.stats.length) await tx.itemStat.createMany({ data: parsed.stats.map((stat) => ({ itemId: parsed.id, statKey: stat.key, value: stat.value })) });
    if (parsed.sockets.length) await tx.itemSocket.createMany({ data: parsed.sockets.map((socket) => ({ itemId: parsed.id, ...socket })) });
    if (parsed.effects.length) await tx.itemEffect.createMany({ data: parsed.effects.map((effect) => ({
      itemId: parsed.id, kind: effect.kind, description: effect.description, spellId: effect.spellId,
    })) });
  });
}

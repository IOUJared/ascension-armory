import { prisma } from "@/lib/db";
import type { EquipmentSlot, GearItem, StatMap } from "@/types/gear";

function baseSlot(slot: EquipmentSlot): EquipmentSlot[] {
  if (slot.startsWith("FINGER")) return ["FINGER_1", "FINGER_2"];
  if (slot.startsWith("TRINKET")) return ["TRINKET_1", "TRINKET_2"];
  return [slot];
}

export async function findItemsForSlot(slot: EquipmentSlot, level: number, search = ""): Promise<GearItem[]> {
  const rows = await prisma.item.findMany({
    where: {
      slot: { in: baseSlot(slot) },
      requiredLevel: { lte: level },
      sourceUpdatedAt: { not: null },
      name: search ? { contains: search, mode: "insensitive" } : undefined,
    },
    include: { stats: true, effects: true, sockets: true },
    orderBy: [{ itemLevel: "desc" }],
    take: 100,
  });

  return rows.map((item) => {
    const payload = item.rawPayload as { item?: { displayId?: unknown } } | null;
    const displayId = Number(payload?.item?.displayId);

    return {
      id: item.id.toString(), name: item.name, slot, quality: item.quality,
      itemLevel: item.itemLevel, requiredLevel: item.requiredLevel,
      armorType: item.armorType ?? undefined, armor: item.armor || undefined,
      weaponDamage: item.weaponMinDamage !== null && item.weaponMaxDamage !== null && item.weaponSpeed !== null
        ? { min: item.weaponMinDamage, max: item.weaponMaxDamage, speed: item.weaponSpeed, dps: item.weaponDps ?? 0 }
        : undefined,
      icon: item.icon ?? undefined,
      displayId: Number.isInteger(displayId) && displayId > 0 ? displayId : undefined,
      stats: Object.fromEntries(item.stats.map((stat) => [stat.statKey, stat.value])) as StatMap,
      effects: item.effects.map((effect) => ({ kind: effect.kind, description: effect.description })),
      socketCount: item.sockets.length,
      source: item.sourceUrl,
    };
  });
}

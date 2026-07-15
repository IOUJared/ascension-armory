import { StatSource } from "@prisma/client";
import { prisma } from "../src/lib/db";

const SOURCE_URL = "https://ascensionsidekick.com/data.js";
const PREFIX = "window.ASC = ";

const statKeys: Record<string, string> = {
  Strength: "strength", Agility: "agility", Stamina: "stamina", Intellect: "intellect", Spirit: "spirit",
  "Attack Power": "attack_power", "Ranged AP": "attack_power", "Spell Power": "spell_power",
  "Spell Healing": "healing_power", Crit: "crit_rating", "Melee Crit": "crit_rating",
  Haste: "haste_rating", "Melee Haste": "haste_rating", "Spell Haste": "haste_rating",
  Hit: "hit_rating", "Melee Hit": "hit_rating", Expertise: "expertise_rating", Defense: "defense_rating",
  Dodge: "dodge_rating", Parry: "parry_rating", Block: "block_rating", "Block Value": "block_value",
  "Armor Pen": "armor_penetration", "Spell Pen": "spell_penetration", "Mana Regen": "mp5",
};

const definitions: Record<string, [string, string]> = {
  strength: ["Strength", "PRIMARY"], agility: ["Agility", "PRIMARY"], stamina: ["Stamina", "PRIMARY"],
  intellect: ["Intellect", "PRIMARY"], spirit: ["Spirit", "PRIMARY"], attack_power: ["Attack Power", "OFFENSE"],
  spell_power: ["Spell Power", "OFFENSE"], healing_power: ["Healing Power", "OFFENSE"],
  crit_rating: ["Critical Strike Rating", "RATING"], haste_rating: ["Haste Rating", "RATING"],
  hit_rating: ["Hit Rating", "RATING"], expertise_rating: ["Expertise Rating", "RATING"],
  defense_rating: ["Defense Rating", "RATING"], dodge_rating: ["Dodge Rating", "RATING"],
  parry_rating: ["Parry Rating", "RATING"], block_rating: ["Block Rating", "RATING"],
  block_value: ["Block Value", "DEFENSE"], armor_penetration: ["Armor Penetration", "RATING"],
  spell_penetration: ["Spell Penetration", "RATING"], mp5: ["Mana per 5 seconds", "REGEN"],
};

async function main(): Promise<void> {
  const response = await fetch(SOURCE_URL, { headers: { "user-agent": "ConquestGearPlanner/0.1 gear sync" } });
  if (!response.ok) throw new Error(`Sidekick data request failed: ${response.status}`);
  let text = (await response.text()).trim();
  if (!text.startsWith(PREFIX)) throw new Error("Unexpected Sidekick data format");
  text = text.slice(PREFIX.length);
  if (text.endsWith(";")) text = text.slice(0, -1);
  const source = JSON.parse(text) as { wf: { items: Record<string, SidekickItem> }; prov?: { build?: { date?: string } } };
  const sourceDate = new Date(`${source.prov?.build?.date ?? new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

  await Promise.all(Object.entries(definitions).map(([key, [label, category]]) => prisma.statDefinition.upsert({
    where: { key }, update: { label, category }, create: { key, label, category },
  })));

  let synced = 0;
  for (const [id, item] of Object.entries(source.wf.items)) {
    const found = item.found;
    if (!found) continue;
    const damage = found.damage?.match(/([\d.]+)\s*-\s*([\d.]+)/);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.item.updateMany({
        where: { id: BigInt(id) },
        data: {
          name: item.name,
          icon: item.icon,
          itemLevel: found.ilvl ?? 0,
          requiredLevel: found.reqLevel ?? 1,
          armor: found.armor ?? 0,
          weaponMinDamage: damage ? Number(damage[1]) : null,
          weaponMaxDamage: damage ? Number(damage[2]) : null,
          weaponSpeed: found.speed ?? null,
          weaponDps: found.dps ?? null,
          sourceUpdatedAt: sourceDate,
        },
      });
      if (!updated.count) return;
      await tx.itemStat.deleteMany({ where: { itemId: BigInt(id), statKey: { not: "pve_power" } } });
      const merged = new Map<string, number>();
      for (const [label, value] of Object.entries(found.stats ?? {})) {
        const key = statKeys[label];
        if (key) merged.set(key, (merged.get(key) ?? 0) + Number(value));
      }
      if (merged.size) await tx.itemStat.createMany({
        data: [...merged].map(([statKey, value]) => ({ itemId: BigInt(id), statKey, value, source: StatSource.BASE })),
      });
      synced += 1;
    });
    if (synced && synced % 250 === 0) console.log(`synced ${synced} verified items`);
  }
  console.log(JSON.stringify({ source: SOURCE_URL, available: Object.keys(source.wf.items).length, synced }));
}

interface SidekickItem {
  name: string;
  icon: string;
  found?: {
    ilvl?: number;
    reqLevel?: number;
    armor?: number;
    damage?: string;
    speed?: number;
    dps?: number;
    stats?: Record<string, number>;
  };
}

main().finally(() => prisma.$disconnect());

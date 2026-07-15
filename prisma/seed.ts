import { prisma } from "../src/lib/db";

const definitions = [
  ["strength", "Strength", "PRIMARY"], ["agility", "Agility", "PRIMARY"],
  ["stamina", "Stamina", "PRIMARY"], ["intellect", "Intellect", "PRIMARY"],
  ["spirit", "Spirit", "PRIMARY"], ["health", "Health", "RESOURCE"],
  ["mana", "Mana", "RESOURCE"], ["armor", "Armor", "DEFENSE"],
  ["attack_power", "Attack Power", "OFFENSE"], ["spell_power", "Spell Power", "OFFENSE"],
  ["healing_power", "Healing Power", "OFFENSE"], ["crit_rating", "Critical Strike Rating", "RATING"],
  ["haste_rating", "Haste Rating", "RATING"], ["hit_rating", "Hit Rating", "RATING"],
  ["expertise_rating", "Expertise Rating", "RATING"], ["defense_rating", "Defense Rating", "RATING"],
  ["dodge_rating", "Dodge Rating", "RATING"], ["parry_rating", "Parry Rating", "RATING"],
  ["block_rating", "Block Rating", "RATING"], ["block_value", "Block Value", "DEFENSE"],
  ["armor_penetration", "Armor Penetration", "RATING"], ["spell_penetration", "Spell Penetration", "RATING"],
  ["resilience_rating", "Resilience Rating", "RATING"],
  ["mp5", "Mana per 5 seconds", "REGEN"], ["hp5", "Health per 5 seconds", "REGEN"],
  ["pve_power", "PvE Power", "ASCENSION"], ["pvp_power", "PvP Power", "ASCENSION"],
  ["weapon_dps", "Weapon DPS", "WEAPON"], ["custom_power", "Custom Power", "ASCENSION"],
] as const;

async function main(): Promise<void> {
  await Promise.all(definitions.map(([key, label, category]) => prisma.statDefinition.upsert({
    where: { key }, update: { label, category },
    create: { key, label, category, isCustom: category === "ASCENSION" },
  })));
}

main().finally(() => prisma.$disconnect());

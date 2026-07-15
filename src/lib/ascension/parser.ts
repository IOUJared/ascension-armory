import { createHash } from "node:crypto";
import type { EquipmentSlot, StatKey } from "@/types/gear";

export interface ParsedAscensionItem {
  id: bigint;
  name: string;
  quality: number;
  icon: string | null;
  itemLevel: number;
  requiredLevel: number;
  slot: EquipmentSlot;
  inventoryType: number | null;
  armorType: string | null;
  armor: number;
  weaponMinDamage: number | null;
  weaponMaxDamage: number | null;
  weaponSpeed: number | null;
  weaponDps: number | null;
  stats: Array<{ key: StatKey; value: number; sourceMarker?: string }>;
  sockets: Array<{ position: number; color: "META" | "RED" | "YELLOW" | "BLUE" | "PRISMATIC" | "ASCENSION" }>;
  effects: Array<{ kind: "EQUIP" | "USE" | "ASCENSION"; description: string; spellId?: bigint }>;
  tooltipHtml: string;
  sourceUrl: string;
  contentHash: string;
  rawPayload: Record<string, unknown>;
}

const SLOT_LABELS: Record<string, EquipmentSlot> = {
  Head: "HEAD", Neck: "NECK", Shoulder: "SHOULDERS", Shoulders: "SHOULDERS",
  Back: "BACK", Chest: "CHEST", Wrist: "WRISTS", Wrists: "WRISTS", Hands: "HANDS",
  Waist: "WAIST", Legs: "LEGS", Feet: "FEET", Finger: "FINGER_1", Trinket: "TRINKET_1",
  "Main Hand": "MAIN_HAND", "One-Hand": "MAIN_HAND", "Two-Hand": "MAIN_HAND",
  "Off Hand": "OFF_HAND", "Held In Off-hand": "OFF_HAND", Ranged: "RANGED", Relic: "RANGED",
};

const STAT_MARKERS: Record<string, StatKey> = {
  "3": "agility", "4": "strength", "5": "intellect", "6": "spirit", "7": "stamina",
};

const RATING_MARKERS: Record<string, StatKey> = {
  "12": "defense_rating", "13": "dodge_rating", "14": "parry_rating", "15": "block_rating",
  "31": "hit_rating", "32": "crit_rating", "35": "resilience_rating" as StatKey,
  "36": "haste_rating", "37": "expertise_rating", "44": "armor_penetration", "48": "block_value",
};

const NAMED_STATS: Array<[RegExp, StatKey]> = [
  [/\battack power by\s+(\d+(?:\.\d+)?)/i, "attack_power"],
  [/\bspell power by\s+(\d+(?:\.\d+)?)/i, "spell_power"],
  [/\bhealing(?: done)? by(?: up to)?\s+(\d+(?:\.\d+)?)/i, "healing_power"],
  [/\bPvE Power by\s+(\d+(?:\.\d+)?)/i, "pve_power"],
  [/\bPvP Power by\s+(\d+(?:\.\d+)?)/i, "pvp_power"],
  [/\barmor penetration rating by\s+(\d+(?:\.\d+)?)/i, "armor_penetration"],
  [/\bspell penetration by\s+(\d+(?:\.\d+)?)/i, "spell_penetration"],
  [/\b(\d+(?:\.\d+)?) mana (?:per|every) 5 sec/i, "mp5"],
  [/\b(?:restores|regenerates) (\d+(?:\.\d+)?) health (?:per|every) 5 sec/i, "hp5"],
];

function decodeJavaScriptString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replaceAll("\\/", "/").replaceAll('\\"', '"');
  }
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? `&${entity};`;
  });
}

function toText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/td>/gi, " | ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n"),
  ).trim();
}

function extractMetadata(page: string, id: string): { quality: number; icon: string | null; name_enus: string } {
  const pattern = new RegExp(`_\\[${id}\\]\\s*=\\s*(\\{[^;]+\\});`);
  const match = page.match(pattern);
  if (!match) throw new Error(`Ascension item ${id}: metadata payload was not found`);
  return JSON.parse(match[1]) as { quality: number; icon: string | null; name_enus: string };
}

function extractTooltip(page: string, id: string): string {
  const pattern = new RegExp(`_\\[${id}\\]\\.tooltip_enus\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const match = page.match(pattern);
  if (!match) throw new Error(`Ascension item ${id}: tooltip payload was not found`);
  return decodeJavaScriptString(match[1]);
}

function mergeStat(stats: Map<StatKey, number>, key: StatKey, value: number): void {
  stats.set(key, (stats.get(key) ?? 0) + value);
}

export function parseAscensionItemPage(page: string, sourceUrl: string): ParsedAscensionItem {
  const id = new URL(sourceUrl).searchParams.get("item");
  if (!id || !/^\d+$/.test(id)) throw new Error(`Invalid Ascension item URL: ${sourceUrl}`);

  const metadata = extractMetadata(page, id);
  const tooltipHtml = extractTooltip(page, id);
  const text = toText(tooltipHtml);
  const stats = new Map<StatKey, number>();

  for (const match of tooltipHtml.matchAll(/<!--stat(\d+)-->\+([\d.]+)\s+([^<]+)/gi)) {
    const key = STAT_MARKERS[match[1]];
    if (key) mergeStat(stats, key, Number(match[2]));
  }
  for (const match of tooltipHtml.matchAll(/<!--rtg(\d+)-->([\d.]+)/gi)) {
    const key = RATING_MARKERS[match[1]];
    if (key) mergeStat(stats, key, Number(match[2]));
  }
  for (const [pattern, key] of NAMED_STATS) {
    const match = text.match(pattern);
    if (match) mergeStat(stats, key, Number(match[1]));
  }

  const armor = Number(text.match(/\b([\d.]+) Armor\b/i)?.[1] ?? 0);
  const itemLevel = Number(text.match(/Item Level\s+(\d+)/i)?.[1] ?? 0);
  const requiredLevel = Number(text.match(/Requires Level\s+(\d+)/i)?.[1] ?? 1);
  const slotLabel = Object.keys(SLOT_LABELS).find((label) => new RegExp(`\\b${label}\\s*\\|`, "i").test(text));
  if (!slotLabel) throw new Error(`Ascension item ${id}: unsupported or missing equipment slot`);

  const armorType = text.match(/(?:Head|Shoulders?|Chest|Wrists?|Hands|Waist|Legs|Feet)\s*\|\s*(Cloth|Leather|Mail|Plate)/i)?.[1] ?? null;
  const damage = text.match(/([\d.]+)\s*-\s*([\d.]+)\s+(?:\w+\s+)?Damage/i);
  const speed = Number(text.match(/Speed\s+([\d.]+)/i)?.[1] ?? 0) || null;
  const minDamage = damage ? Number(damage[1]) : null;
  const maxDamage = damage ? Number(damage[2]) : null;
  const weaponDps = minDamage !== null && maxDamage !== null && speed ? (minDamage + maxDamage) / 2 / speed : null;
  if (weaponDps) mergeStat(stats, "weapon_dps", weaponDps);

  const sockets = Array.from(text.matchAll(/(Meta|Red|Yellow|Blue|Prismatic|Ascension) Socket/gi)).map((match, position) => ({
    position,
    color: match[1].toUpperCase() as ParsedAscensionItem["sockets"][number]["color"],
  }));
  const effects = Array.from(text.matchAll(/(?:^|\n)(Equip|Use):\s*([^\n]+)/gi)).map((match) => ({
    kind: match[1].toUpperCase() as "EQUIP" | "USE",
    description: match[2].replace(/\s*\(\s*'.*$/i, "").trim(),
  }));

  const contentHash = createHash("sha256").update(tooltipHtml).digest("hex");
  return {
    id: BigInt(id), name: metadata.name_enus, quality: metadata.quality, icon: metadata.icon,
    itemLevel, requiredLevel, slot: SLOT_LABELS[slotLabel], inventoryType: null, armorType, armor,
    weaponMinDamage: minDamage, weaponMaxDamage: maxDamage, weaponSpeed: speed, weaponDps,
    stats: [...stats.entries()].map(([key, value]) => ({ key, value })), sockets, effects,
    tooltipHtml, sourceUrl, contentHash, rawPayload: { metadata, text },
  };
}

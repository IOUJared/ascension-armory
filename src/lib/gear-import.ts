import { EQUIPMENT_SLOTS, type EquipmentSlot } from "@/types/gear";

export interface ImportedGearEntry {
  slot: EquipmentSlot;
  itemId: string;
  itemString: string;
}

export interface ParsedGearImport {
  version: 1;
  level: number;
  gear: ImportedGearEntry[];
}

const validSlots = new Set<string>(EQUIPMENT_SLOTS);

export function parseGearImport(raw: string): ParsedGearImport {
  const text = raw.trim();
  if (!text) throw new Error("Paste the export string created by /aaexport.");
  if (text.length > 20_000) throw new Error("The export string is too large.");

  const [format, rawLevel, ...gearParts] = text.split("|");
  if (format !== "AA1") throw new Error("This is not an Ascension Armory AA1 export.");
  const level = Number(rawLevel);
  if (!Number.isInteger(level) || level < 1 || level > 60) throw new Error("The exported character level is invalid.");

  const gearPayload = gearParts.join("|");
  const bySlot = new Map<EquipmentSlot, ImportedGearEntry>();
  for (const pair of gearPayload.split(";")) {
    if (!pair) continue;
    const separator = pair.indexOf("=");
    if (separator < 1) throw new Error("The exported gear list is malformed.");
    const slotName = pair.slice(0, separator);
    const itemString = pair.slice(separator + 1);
    const itemId = itemString.split(":", 1)[0];
    if (!validSlots.has(slotName) || !/^\d+$/.test(itemId)) throw new Error("The export contains an invalid equipment slot or item ID.");
    const slot = slotName as EquipmentSlot;
    bySlot.set(slot, { slot, itemId, itemString });
  }

  return { version: 1, level, gear: [...bySlot.values()] };
}

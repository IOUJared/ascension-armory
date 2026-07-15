import { EQUIPMENT_SLOTS, STAT_LABELS, type EquipmentSlot, type GearItem } from "../../src/domain/gear";

const equipmentSlots = new Set<string>(EQUIPMENT_SLOTS);
const statKeys = new Set<string>(Object.keys(STAT_LABELS));
const qualities = new Set<GearItem["quality"]>([
  "POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "ARTIFACT", "HEIRLOOM",
]);
const dataSources = new Set<NonNullable<GearItem["dataSource"]>>([
  "COA_INGAME_SCAN", "COA_REALM_CACHE", "USER_VERIFIED", "PLAYER_IMPORT",
]);

export interface CatalogDocument {
  generatedAt: string;
  items: GearItem[];
}

export interface CatalogIssue {
  path: string;
  message: string;
}

export interface CatalogValidationResult {
  errors: CatalogIssue[];
  itemCount: number;
  slotCounts: Partial<Record<EquipmentSlot, number>>;
  sourceCounts: Record<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateStats(value: unknown, path: string, errors: CatalogIssue[]): void {
  if (!isRecord(value)) {
    errors.push({ path, message: "must be an object" });
    return;
  }
  for (const [key, amount] of Object.entries(value)) {
    if (!statKeys.has(key)) errors.push({ path: `${path}.${key}`, message: "is not a recognized stat key" });
    if (!isFiniteNumber(amount)) errors.push({ path: `${path}.${key}`, message: "must be a finite number" });
  }
}

function validateWeaponDamage(value: unknown, path: string, errors: CatalogIssue[]): void {
  if (!isRecord(value)) {
    errors.push({ path, message: "must be an object" });
    return;
  }
  for (const field of ["min", "max", "speed", "dps"] as const) {
    if (!isFiniteNumber(value[field]) || value[field] < 0) {
      errors.push({ path: `${path}.${field}`, message: "must be a non-negative finite number" });
    }
  }
  if (isFiniteNumber(value.min) && isFiniteNumber(value.max) && value.max < value.min) {
    errors.push({ path, message: "maximum damage cannot be lower than minimum damage" });
  }
  if (isFiniteNumber(value.speed) && value.speed <= 0) {
    errors.push({ path: `${path}.speed`, message: "must be greater than zero" });
  }
}

function validateScaleSnapshots(value: unknown, path: string, errors: CatalogIssue[]): void {
  if (!Array.isArray(value)) {
    errors.push({ path, message: "must be an array" });
    return;
  }
  const levels = new Set<number>();
  value.forEach((snapshot, index) => {
    const snapshotPath = `${path}[${index}]`;
    if (!isRecord(snapshot)) {
      errors.push({ path: snapshotPath, message: "must be an object" });
      return;
    }
    if (!Number.isInteger(snapshot.effectiveLevel) || (snapshot.effectiveLevel as number) < 1) {
      errors.push({ path: `${snapshotPath}.effectiveLevel`, message: "must be a positive integer" });
    } else if (levels.has(snapshot.effectiveLevel as number)) {
      errors.push({ path: `${snapshotPath}.effectiveLevel`, message: "duplicates another scale snapshot" });
    } else {
      levels.add(snapshot.effectiveLevel as number);
    }
    if (!Number.isInteger(snapshot.itemLevel) || (snapshot.itemLevel as number) < 0) {
      errors.push({ path: `${snapshotPath}.itemLevel`, message: "must be a non-negative integer" });
    }
    if (!Number.isInteger(snapshot.requiredLevel) || (snapshot.requiredLevel as number) < 1) {
      errors.push({ path: `${snapshotPath}.requiredLevel`, message: "must be a positive integer" });
    }
    validateStats(snapshot.stats, `${snapshotPath}.stats`, errors);
    for (const field of ["armor", "weaponDps"] as const) {
      if (snapshot[field] !== undefined && (!isFiniteNumber(snapshot[field]) || snapshot[field] < 0)) {
        errors.push({ path: `${snapshotPath}.${field}`, message: "must be a non-negative finite number" });
      }
    }
  });
}

export function validateCatalogDocument(value: unknown, minimumItemCount = 1): CatalogValidationResult {
  const errors: CatalogIssue[] = [];
  const slotCounts: Partial<Record<EquipmentSlot, number>> = {};
  const sourceCounts: Record<string, number> = {};

  if (!isRecord(value)) {
    return { errors: [{ path: "catalog", message: "must be an object" }], itemCount: 0, slotCounts, sourceCounts };
  }
  if (typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))) {
    errors.push({ path: "generatedAt", message: "must be a valid ISO date string" });
  }
  if (!Array.isArray(value.items)) {
    errors.push({ path: "items", message: "must be an array" });
    return { errors, itemCount: 0, slotCounts, sourceCounts };
  }
  if (value.items.length < minimumItemCount) {
    errors.push({ path: "items", message: `must contain at least ${minimumItemCount.toLocaleString()} items` });
  }

  const ids = new Set<string>();
  value.items.forEach((item, index) => {
    const path = `items[${index}]`;
    if (!isRecord(item)) {
      errors.push({ path, message: "must be an object" });
      return;
    }

    if (typeof item.id !== "string" || !/^\d+$/.test(item.id)) {
      errors.push({ path: `${path}.id`, message: "must be a numeric string" });
    } else if (ids.has(item.id)) {
      errors.push({ path: `${path}.id`, message: `duplicates item ID ${item.id}` });
    } else {
      ids.add(item.id);
    }
    if (typeof item.name !== "string" || !item.name.trim()) errors.push({ path: `${path}.name`, message: "must be a non-empty string" });
    if (!equipmentSlots.has(String(item.slot))) {
      errors.push({ path: `${path}.slot`, message: "must be a recognized equipment slot" });
    } else {
      const slot = item.slot as EquipmentSlot;
      slotCounts[slot] = (slotCounts[slot] ?? 0) + 1;
    }
    if (!qualities.has(item.quality as GearItem["quality"])) errors.push({ path: `${path}.quality`, message: "must be a recognized item quality" });
    if (!Number.isInteger(item.itemLevel) || (item.itemLevel as number) < 0) errors.push({ path: `${path}.itemLevel`, message: "must be a non-negative integer" });
    if (!Number.isInteger(item.requiredLevel) || (item.requiredLevel as number) < 1) errors.push({ path: `${path}.requiredLevel`, message: "must be a positive integer" });
    if (item.availableAtLevel !== undefined && (!Number.isInteger(item.availableAtLevel) || (item.availableAtLevel as number) < 1)) {
      errors.push({ path: `${path}.availableAtLevel`, message: "must be a positive integer" });
    }
    validateStats(item.stats, `${path}.stats`, errors);
    if (item.armor !== undefined && (!isFiniteNumber(item.armor) || item.armor < 0)) errors.push({ path: `${path}.armor`, message: "must be a non-negative finite number" });
    if (item.weaponDamage !== undefined) validateWeaponDamage(item.weaponDamage, `${path}.weaponDamage`, errors);
    if (item.scaleSnapshots !== undefined) validateScaleSnapshots(item.scaleSnapshots, `${path}.scaleSnapshots`, errors);
    if (!dataSources.has(item.dataSource as NonNullable<GearItem["dataSource"]>)) {
      errors.push({ path: `${path}.dataSource`, message: "must identify the item provenance" });
    } else {
      const source = item.dataSource as string;
      sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
    }
  });

  return { errors, itemCount: value.items.length, slotCounts, sourceCounts };
}

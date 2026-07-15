import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isSystemPowerKey, type GearItem, type StatMap } from "../src/domain/gear";

interface CatalogDocument {
  generatedAt: string;
  items: GearItem[];
}

const catalog = JSON.parse(readFileSync("public/data/coa-items.json", "utf8")) as CatalogDocument;
const itemsById = new Map(catalog.items.map((item) => [item.id, item]));

function item(id: string): GearItem {
  const found = itemsById.get(id);
  assert.ok(found, `Expected catalog item ${id}`);
  return found;
}

function visibleStats(entry: GearItem): StatMap {
  return Object.fromEntries(Object.entries(entry.stats).filter(([key]) => !isSystemPowerKey(key as keyof StatMap))) as StatMap;
}

test("the published catalog retains the current verified CoA corpus", () => {
  assert.ok(catalog.items.length >= 35_000);
  assert.ok(Number.isFinite(Date.parse(catalog.generatedAt)));
  assert.equal(catalog.items.some((entry) => entry.dataSource === "COA_REALM_CACHE"), false);
});

test("rendered-tooltip armor corrections cannot regress to template values", () => {
  assert.equal(item("354178").name, "Water Seer's Headdress");
  assert.equal(item("354178").armor, 14);
  assert.equal(item("354178").dataSource, "USER_VERIFIED");

  assert.equal(item("7691").name, "Embalmed Shroud");
  assert.equal(item("7691").armor, 42);
  assert.deepEqual(visibleStats(item("7691")), { intellect: 11, spell_power: 14, stamina: 7 });

  assert.equal(item("6688").name, "Whisperwind Headdress");
  assert.equal(item("6688").armor, 84);
});

test("Black Velvet Robes retains its in-game armor and primary stats", () => {
  const robes = item("2800");
  assert.equal(robes.name, "Black Velvet Robes");
  assert.equal(robes.armor, 50);
  assert.deepEqual(visibleStats(robes), { intellect: 15, stamina: 6 });
});

test("Staff of Jordan retains caster stats as well as weapon damage", () => {
  const staff = item("873");
  assert.equal(staff.name, "Staff of Jordan");
  assert.equal(staff.stats.intellect, 10);
  assert.equal(staff.stats.spirit, 11);
  assert.equal(staff.stats.spell_power, 26);
  assert.ok((staff.weaponDamage?.dps ?? 0) > 25);
});

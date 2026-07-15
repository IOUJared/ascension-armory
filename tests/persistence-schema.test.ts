import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const initialMigration = readFileSync("prisma/migrations/20260715210000_initial/migration.sql", "utf8");

test("the initial migration can create the complete catalog and profile schema", () => {
  for (const table of [
    "Item", "ItemScaleSnapshot", "StatDefinition", "ItemStat", "ItemSocket", "ItemEffect",
    "Gem", "MysticEnchant", "User", "CharacterProfile", "ProfileStatWeight", "Loadout", "EquippedItem",
  ]) {
    assert.match(initialMigration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(initialMigration, /CREATE TYPE "BuildContext" AS ENUM \('PVE', 'PVP'\)/);
});

test("stored profiles identify the CoA class, specialization, and content context", () => {
  assert.match(schema, /classKey\s+String\?/);
  assert.match(schema, /specializationKey\s+String\?/);
  assert.match(schema, /context\s+BuildContext\s+@default\(PVE\)/);
  assert.match(initialMigration, /"classKey" TEXT/);
  assert.match(initialMigration, /"specializationKey" TEXT/);
  assert.match(initialMigration, /"context" "BuildContext" NOT NULL DEFAULT 'PVE'/);
});

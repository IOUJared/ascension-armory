import assert from "node:assert/strict";
import test from "node:test";
import { parseGearImport } from "../src/lib/gear-import";

test("AA1 imports character level, slots, item strings, and enchant IDs", () => {
  const parsed = parseGearImport("AA1|35|HEAD=7691:0:0:0:0:0:0:0:35;BACK=4732:903:0:0:0:0:0:0:35");

  assert.equal(parsed.version, 1);
  assert.equal(parsed.level, 35);
  assert.equal(parsed.gear.length, 2);
  assert.deepEqual(parsed.gear[0], {
    slot: "HEAD",
    itemId: "7691",
    itemString: "7691:0:0:0:0:0:0:0:35",
  });
  assert.equal(parsed.gear[1].enchantmentId, 903);
});

test("AA2 decodes item metadata and combines equivalent API stat keys", () => {
  const parsed = parseGearImport(
    "AA2|35|HEAD=7691:0:0:0:0:0:0:0:35~3~35~35~inv_helmet_15~Embalmed%20Shroud~ITEM_MOD_INTELLECT_SHORT:11,ITEM_MOD_STAMINA_SHORT:7,ITEM_MOD_ATTACK_POWER_SHORT:4,ITEM_MOD_RANGED_ATTACK_POWER_SHORT:6",
  );
  const snapshot = parsed.gear[0].snapshot;

  assert.equal(parsed.version, 2);
  assert.equal(snapshot?.name, "Embalmed Shroud");
  assert.equal(snapshot?.quality, "RARE");
  assert.equal(snapshot?.icon, "inv_helmet_15");
  assert.deepEqual(snapshot?.stats, { intellect: 11, stamina: 7, attack_power: 10 });
});

test("duplicate slots use the last exported entry", () => {
  const parsed = parseGearImport("AA1|60|FINGER_1=100:0;FINGER_1=200:0");
  assert.equal(parsed.gear.length, 1);
  assert.equal(parsed.gear[0].itemId, "200");
});

test("malformed formats, levels, and slots are rejected", () => {
  assert.throws(() => parseGearImport("OTHER|35|HEAD=7691:0"), /not an Ascension Armory/);
  assert.throws(() => parseGearImport("AA1|61|HEAD=7691:0"), /level is invalid/);
  assert.throws(() => parseGearImport("AA1|35|HELM=7691:0"), /invalid equipment slot/);
});

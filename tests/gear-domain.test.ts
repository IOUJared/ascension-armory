import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateEp,
  canEquipItemAtLevel,
  compareScoredItems,
  contextualPower,
  resolveItemStats,
  scoreItem,
  statDelta,
} from "../src/domain/gear";
import { makeGearItem } from "./fixtures";

test("exact level snapshots replace base stats, armor, and weapon DPS", () => {
  const item = makeGearItem({
    stats: { strength: 5 },
    armor: 10,
    weaponDamage: { min: 10, max: 20, speed: 2, dps: 7.5 },
    scaleSnapshots: [{
      effectiveLevel: 35,
      itemLevel: 42,
      requiredLevel: 35,
      stats: { strength: 8 },
      armor: 14,
      weaponDps: 9,
    }],
  });

  assert.deepEqual(resolveItemStats(item, 35), { strength: 8, armor: 14, weapon_dps: 9 });
  assert.deepEqual(resolveItemStats(item, 36), { strength: 5, armor: 10, weapon_dps: 7.5 });
});

test("effects, enhancements, per-level stats, and hybrid rules compose deterministically", () => {
  const item = makeGearItem({
    stats: { intellect: 10 },
    effects: [{ kind: "EQUIP", description: "Test effect", estimatedStats: { spell_power: 4 } }],
    enhancements: [{
      id: "test-enchant",
      name: "Test Enchant",
      kind: "ENCHANT",
      stats: { intellect: 2 },
      perLevel: { attack_power: 0.5 },
      hybridScaling: [{ source: "intellect", target: "spell_power", coefficient: 0.5, mode: "ADD" }],
    }],
  });

  assert.deepEqual(resolveItemStats(item, 20, [
    { source: "intellect", target: "healing_power", coefficient: 0.25, mode: "HIGHEST_OF" },
  ]), {
    intellect: 12,
    spell_power: 10,
    attack_power: 10,
    healing_power: 3,
  });
});

test("EP applies caps and never converts hidden Ascension Power", () => {
  const ep = calculateEp(
    { strength: 3, crit_rating: 15, pve_power: 9_999 },
    {
      weights: { strength: 1, crit_rating: 2, pve_power: 100 },
      caps: { crit_rating: { soft: 10, hard: 14, afterSoftCapWeight: 0.5 } },
    },
  );

  assert.equal(ep, 27);
  assert.equal(contextualPower({ pve_power: 38, pvp_power: 21 }, 59, "pve"), 0);
  assert.equal(contextualPower({ pve_power: 38, pvp_power: 21 }, 60, "pve"), 38);
  assert.equal(contextualPower({ pve_power: 38, pvp_power: 21 }, 60, "pvp"), 21);
});

test("level eligibility respects content gates and exact snapshot requirements", () => {
  const item = makeGearItem({
    requiredLevel: 20,
    availableAtLevel: 40,
    scaleSnapshots: [{ effectiveLevel: 45, itemLevel: 50, requiredLevel: 46, stats: {} }],
  });

  assert.equal(canEquipItemAtLevel(item, 39), false);
  assert.equal(canEquipItemAtLevel(item, 40), true);
  assert.equal(canEquipItemAtLevel(item, 45), false);
  assert.equal(canEquipItemAtLevel(item, 46), true);
});

test("verified items rank above provisional data, then matching Power and EP break ties", () => {
  const profile = { weights: { intellect: 1 } };
  const verified = scoreItem(makeGearItem({ id: "1", stats: { intellect: 10 }, dataSource: "COA_INGAME_SCAN" }), 60, profile);
  const provisional = scoreItem(makeGearItem({ id: "2", stats: { intellect: 100, pve_power: 100 }, dataSource: "COA_REALM_CACHE" }), 60, profile);
  assert.ok(compareScoredItems(verified, provisional, 60, "pve") < 0);

  const lowerPower = scoreItem(makeGearItem({ id: "3", stats: { intellect: 100, pve_power: 20 } }), 60, profile);
  const higherPower = scoreItem(makeGearItem({ id: "4", stats: { intellect: 1, pve_power: 38 } }), 60, profile);
  assert.ok(compareScoredItems(higherPower, lowerPower, 60, "pve") < 0);
  assert.ok(compareScoredItems(lowerPower, higherPower, 59, "pve") < 0);
});

test("stat deltas contain gains and losses but omit unchanged values", () => {
  const profile = { weights: { intellect: 1, stamina: 0.5 } };
  const equipped = scoreItem(makeGearItem({ stats: { intellect: 10, stamina: 5 } }), 35, profile);
  const candidate = scoreItem(makeGearItem({ stats: { intellect: 14, stamina: 3 } }), 35, profile);
  assert.deepEqual(statDelta(candidate, equipped), { intellect: 4, stamina: -2 });
});

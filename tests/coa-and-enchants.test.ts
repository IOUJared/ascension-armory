import assert from "node:assert/strict";
import test from "node:test";
import { COA_CLASSES, resolveCoAProfile, weightsFromPriority } from "../src/lib/coa";
import { applyRecommendedEnchant, recommendEnchant } from "../src/lib/enchants";
import type { CoASpec } from "../src/types/coa";
import { makeGearItem } from "./fixtures";

test("the class catalog retains all 21 CoA classes and 70 specializations", () => {
  assert.equal(COA_CLASSES.length, 21);
  assert.equal(COA_CLASSES.reduce((count, classInfo) => count + classInfo.specs.length, 0), 70);
});

test("priority explanations in parentheses do not create ranked stats", () => {
  const spec = {
    roles: ["Ranged DPS"],
    weapon: { style: "Caster", main: "Bow", off: "—", note: "" },
  } as CoASpec;
  const weights = weightsFromPriority(
    "Intellect (also grants attack power and hit) > Spell Power > Critical Strike",
    spec,
  );

  assert.equal(weights.intellect, 1);
  assert.equal(weights.spell_power, 0.89);
  assert.equal(weights.crit_rating, 0.78);
  assert.equal(weights.attack_power, undefined);
  assert.equal(weights.hit_rating, undefined);
});

test("Starcaller Sentinel keeps its Intellect priority and bow restriction", () => {
  const profile = resolveCoAProfile({ classSlug: "starcaller", specName: "Sentinel", context: "pve" });
  assert.ok(profile);
  assert.deepEqual(profile.spec.weapon.allowedTypes, ["Bows"]);
  assert.equal(profile.weights.intellect, 1);
  assert.ok((profile.weights.spell_power ?? 0) > (profile.weights.agility ?? 0));
});

test("recommended enchants honor item level and the active EP profile", () => {
  const chest = makeGearItem({ slot: "CHEST", itemLevel: 35 });
  const recommendation = recommendEnchant(chest, { weights: { intellect: 1 } });
  assert.equal(recommendation?.name, "Enchant Chest - Greater Stats");

  const existing = { id: "custom", name: "Existing", kind: "ENCHANT" as const, stats: { stamina: 1 } };
  const equipped = { ...chest, enhancements: [existing] };
  assert.equal(applyRecommendedEnchant(equipped, { weights: { intellect: 1 } }), equipped);
  assert.equal(applyRecommendedEnchant(equipped, { weights: { intellect: 1 } }, true).enhancements?.[0].name, "Enchant Chest - Greater Stats");
});

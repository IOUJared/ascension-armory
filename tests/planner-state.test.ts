import assert from "node:assert/strict";
import test from "node:test";
import type { GearEnhancement } from "../src/domain/gear";
import { createInitialPlannerState, plannerReducer, type PlannerState } from "../src/features/planner/planner.reducer";
import {
  selectActiveWeightKeys,
  selectEditableWeightKeys,
  selectHasGearEnchants,
  selectLoadoutTotals,
  selectSummaryKeys,
} from "../src/features/planner/planner.selectors";
import { makeGearItem } from "./fixtures";

const selection = { classSlug: "starcaller", specName: "Sentinel", context: "pve" } as const;

test("hydration restores persisted state and requires a class when none is saved", () => {
  const initial = createInitialPlannerState();
  const empty = plannerReducer(initial, { type: "HYDRATE" });
  assert.equal(empty.activeDialog?.type, "class");

  const hydrated = plannerReducer(initial, {
    type: "HYDRATE",
    snapshot: { level: 35, selection, weights: { intellect: 1 }, loadout: { HEAD: makeGearItem() } },
  });
  assert.equal(hydrated.level, 35);
  assert.deepEqual(hydrated.selection, selection);
  assert.equal(hydrated.activeDialog, null);
});

test("class and import dialogs toggle while required class selection cannot close", () => {
  let state = plannerReducer(createInitialPlannerState(), { type: "HYDRATE" });
  state = plannerReducer(state, { type: "TOGGLE_DIALOG", dialog: "class" });
  assert.equal(state.activeDialog?.type, "class");

  state = plannerReducer(state, { type: "SELECT_PROFILE", selection, weights: { intellect: 1 } });
  state = plannerReducer(state, { type: "TOGGLE_DIALOG", dialog: "import" });
  assert.equal(state.activeDialog?.type, "import");
  state = plannerReducer(state, { type: "TOGGLE_DIALOG", dialog: "import" });
  assert.equal(state.activeDialog, null);
});

test("equipment and enchant actions update only their target slot", () => {
  const helm = makeGearItem({ id: "1", slot: "HEAD" });
  const chest = makeGearItem({ id: "2", slot: "CHEST" });
  const enchant: GearEnhancement = { id: "ench", name: "Test Enchant", kind: "ENCHANT", stats: { stamina: 5 } };
  let state = createInitialPlannerState();
  state = plannerReducer(state, { type: "EQUIP_ITEM", slot: "HEAD", item: helm });
  state = plannerReducer(state, { type: "EQUIP_ITEM", slot: "CHEST", item: chest });
  state = plannerReducer(state, { type: "APPLY_ENCHANT", slot: "HEAD", enchant });
  assert.equal(state.loadout.HEAD.enhancements?.[0].name, "Test Enchant");
  assert.equal(state.loadout.CHEST.enhancements, undefined);

  state = plannerReducer(state, { type: "REMOVE_ENCHANT", slot: "HEAD" });
  assert.equal(state.loadout.HEAD.enhancements, undefined);
  state = plannerReducer(state, { type: "CLEAR_SLOT", slot: "CHEST" });
  assert.equal(state.loadout.CHEST, undefined);
});

test("clearing enchants preserves other enhancements and closes the enchant dialog", () => {
  const enchant: GearEnhancement = { id: "ench", name: "Enchant", kind: "ENCHANT", stats: { stamina: 5 } };
  const gem: GearEnhancement = { id: "gem", name: "Gem", kind: "GEM", stats: { intellect: 3 } };
  const helm = makeGearItem({ enhancements: [enchant, gem] });
  let state: PlannerState = { ...createInitialPlannerState(), loadout: { HEAD: helm }, activeDialog: { type: "enchant", slot: "HEAD" } };
  state = plannerReducer(state, { type: "CLEAR_ENCHANTS" });
  assert.deepEqual(state.loadout.HEAD.enhancements, [gem]);
  assert.equal(state.activeDialog, null);
});

test("planner selectors preserve live weight ordering and aggregate loadout totals", () => {
  const weights = { intellect: 1, spell_power: 0.89, crit_rating: 0.78, weapon_dps: 2.4 };
  const activeKeys = selectActiveWeightKeys(weights);
  assert.deepEqual(activeKeys, ["weapon_dps", "intellect", "spell_power", "crit_rating"]);
  assert.deepEqual(selectEditableWeightKeys({ ...weights, spell_power: 3 }, weights), ["spell_power", "weapon_dps", "intellect", "crit_rating"]);

  const enchanted = makeGearItem({
    id: "1",
    stats: { intellect: 10, spell_power: 5 },
    enhancements: [{ id: "ench", name: "Enchant", kind: "ENCHANT", stats: { intellect: 2 } }],
  });
  const second = makeGearItem({ id: "2", stats: { intellect: 3, stamina: 4 } });
  const totals = selectLoadoutTotals({ HEAD: enchanted, CHEST: second }, 35, { weights });
  assert.deepEqual(totals.stats, { intellect: 15, spell_power: 5, stamina: 4 });
  assert.equal(totals.ep, 19.45);
  assert.deepEqual(selectSummaryKeys(activeKeys, totals.stats), ["intellect", "spell_power"]);
  assert.equal(selectHasGearEnchants({ HEAD: enchanted }), true);
});

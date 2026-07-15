import assert from "node:assert/strict";
import test from "node:test";
import { makePlannerBuild, parsePlannerBuild } from "../src/lib/planner-storage";
import { makeGearItem } from "./fixtures";

test("saved planner builds round-trip without losing loadout data", () => {
  const selection = { classSlug: "starcaller", specName: "Sentinel", context: "pve" } as const;
  const item = makeGearItem({
    id: "873",
    name: "Staff of Jordan",
    slot: "MAIN_HAND",
    stats: { intellect: 10, spell_power: 26 },
    acquisition: {
      type: "WORLD_DROP",
      name: "World drop",
      confidence: "CATEGORY",
      provenance: "ATLASLOOT_ASCENSION",
    },
  });
  const saved = makePlannerBuild(35, selection, { intellect: 1, spell_power: 0.89 }, { MAIN_HAND: item });
  const restored = parsePlannerBuild(JSON.stringify(saved));

  assert.equal(restored?.level, 35);
  assert.deepEqual(restored?.selection, selection);
  assert.deepEqual(restored?.weights, { intellect: 1, spell_power: 0.89 });
  assert.deepEqual(restored?.loadout.MAIN_HAND, item);
});

test("storage parsing rejects unknown fields and clamps unsafe level values", () => {
  const raw = JSON.stringify({
    version: 1,
    savedAt: "2026-07-15T00:00:00.000Z",
    level: 900,
    weights: { intellect: 1, made_up_stat: 999, haste_rating: "fast" },
    loadout: {
      HEAD: { ...makeGearItem(), stats: { stamina: 5, made_up_stat: 999 } },
      INVALID_SLOT: makeGearItem(),
    },
  });
  const restored = parsePlannerBuild(raw);

  assert.equal(restored?.level, 60);
  assert.deepEqual(restored?.weights, { intellect: 1 });
  assert.deepEqual(restored?.loadout.HEAD.stats, { stamina: 5 });
  assert.equal(restored?.loadout.INVALID_SLOT, undefined);
});

test("invalid JSON and unsupported storage versions are ignored", () => {
  assert.equal(parsePlannerBuild("not-json"), undefined);
  assert.equal(parsePlannerBuild(JSON.stringify({ version: 2 })), undefined);
  assert.equal(parsePlannerBuild(null), undefined);
});

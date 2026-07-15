import assert from "node:assert/strict";
import test from "node:test";
import { decodeAddonField, parseAddonStats, renderedTooltipArmor } from "../tooling/importers/addon-snapshot";

test("addon snapshot helpers decode fields and combine equivalent API stats", () => {
  assert.equal(decodeAddonField("Black%20Velvet%20Robes"), "Black Velvet Robes");
  assert.deepEqual(parseAddonStats("ITEM_MOD_ATTACK_POWER_SHORT:10,ITEM_MOD_RANGED_ATTACK_POWER_SHORT:5,ITEM_MOD_STAMINA_SHORT:6,bad"), {
    stats: { attack_power: 15, stamina: 6 },
    rawStats: { ITEM_MOD_ATTACK_POWER_SHORT: 10, ITEM_MOD_RANGED_ATTACK_POWER_SHORT: 5, ITEM_MOD_STAMINA_SHORT: 6 },
  });
});

test("rendered tooltip armor remains authoritative over template armor", () => {
  assert.equal(renderedTooltipArmor("|cff0070ddWater Seer's Headdress|r\nHead\tCloth\n14 Armor\n+8 Intellect"), 14);
  assert.equal(renderedTooltipArmor("No armor line"), undefined);
});

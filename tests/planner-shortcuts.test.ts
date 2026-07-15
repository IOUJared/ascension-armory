import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlannerShortcut } from "../src/features/planner/hooks/use-planner-shortcuts";

test("planner shortcuts toggle class and import dialogs", () => {
  assert.equal(resolvePlannerShortcut({ key: "c", activeDialog: null }), "toggle-class");
  assert.equal(resolvePlannerShortcut({ key: "c", activeDialog: { type: "class" } }), "toggle-class");
  assert.equal(resolvePlannerShortcut({ key: "i", activeDialog: null }), "toggle-import");
  assert.equal(resolvePlannerShortcut({ key: "i", activeDialog: { type: "import" } }), "toggle-import");
});

test("modal and editing context prevents conflicting shortcuts", () => {
  assert.equal(resolvePlannerShortcut({ key: "i", activeDialog: { type: "item", slot: "HEAD" } }), undefined);
  assert.equal(resolvePlannerShortcut({ key: "c", editing: true, activeDialog: null }), undefined);
  assert.equal(resolvePlannerShortcut({ key: "Escape", activeDialog: { type: "enchant", slot: "HEAD" } }), "close");
  assert.equal(resolvePlannerShortcut({ key: "s", ctrlKey: true, editing: true, activeDialog: null }), "save");
});

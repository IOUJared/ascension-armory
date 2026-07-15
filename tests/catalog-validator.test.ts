import assert from "node:assert/strict";
import test from "node:test";
import { validateCatalogDocument } from "../tooling/validation/catalog-validator";

const validItem = {
  id: "1000",
  name: "Valid Helm",
  slot: "HEAD",
  quality: "RARE",
  itemLevel: 40,
  requiredLevel: 35,
  stats: { intellect: 10 },
  armor: 42,
  dataSource: "COA_INGAME_SCAN",
};

test("a structurally valid catalog passes", () => {
  const result = validateCatalogDocument({ generatedAt: "2026-07-15T00:00:00.000Z", items: [validItem] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.itemCount, 1);
  assert.equal(result.slotCounts.HEAD, 1);
  assert.equal(result.sourceCounts.COA_INGAME_SCAN, 1);
});

test("duplicate IDs, invalid stats, and malformed snapshots are reported with paths", () => {
  const result = validateCatalogDocument({
    generatedAt: "not-a-date",
    items: [
      validItem,
      {
        ...validItem,
        name: "",
        stats: { imaginary_stat: 10, intellect: Number.NaN },
        scaleSnapshots: [
          { effectiveLevel: 35, itemLevel: 40, requiredLevel: 35, stats: {} },
          { effectiveLevel: 35, itemLevel: -1, requiredLevel: 0, stats: [] },
        ],
      },
    ],
  });
  const paths = result.errors.map((issue) => issue.path);

  assert.ok(paths.includes("generatedAt"));
  assert.ok(paths.includes("items[1].id"));
  assert.ok(paths.includes("items[1].name"));
  assert.ok(paths.includes("items[1].stats.imaginary_stat"));
  assert.ok(paths.includes("items[1].stats.intellect"));
  assert.ok(paths.includes("items[1].scaleSnapshots[1].effectiveLevel"));
  assert.ok(paths.includes("items[1].scaleSnapshots[1].stats"));
});

test("minimum item count protects against accidentally truncated exports", () => {
  const result = validateCatalogDocument({ generatedAt: "2026-07-15T00:00:00.000Z", items: [validItem] }, 10);
  assert.match(result.errors[0].message, /at least 10 items/);
});

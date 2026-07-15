import assert from "node:assert/strict";
import test from "node:test";
import { StaticCatalogRepository } from "../src/lib/items/static-catalog";
import {
  CATALOG_SCHEMA_VERSION,
  canonicalCatalogSlot,
  type CatalogIdIndex,
  type CatalogManifest,
  type CatalogShardDocument,
} from "../src/lib/items/catalog-schema";
import { makeGearItem } from "./fixtures";

const generatedAt = "2026-07-15T00:00:00.000Z";
const helm = makeGearItem({ id: "100", slot: "HEAD", requiredLevel: 35 });
const ring = makeGearItem({ id: "200", slot: "FINGER_1", requiredLevel: 20 });
const manifest: CatalogManifest = {
  schemaVersion: CATALOG_SCHEMA_VERSION,
  generatedAt,
  itemCount: 2,
  idIndexPath: "data/catalog/item-index.json",
  shards: {
    HEAD: { path: "data/catalog/slots/head.json", itemCount: 1 },
    NECK: { path: "data/catalog/slots/neck.json", itemCount: 0 },
    SHOULDERS: { path: "data/catalog/slots/shoulders.json", itemCount: 0 },
    BACK: { path: "data/catalog/slots/back.json", itemCount: 0 },
    CHEST: { path: "data/catalog/slots/chest.json", itemCount: 0 },
    WRISTS: { path: "data/catalog/slots/wrists.json", itemCount: 0 },
    HANDS: { path: "data/catalog/slots/hands.json", itemCount: 0 },
    WAIST: { path: "data/catalog/slots/waist.json", itemCount: 0 },
    LEGS: { path: "data/catalog/slots/legs.json", itemCount: 0 },
    FEET: { path: "data/catalog/slots/feet.json", itemCount: 0 },
    FINGER_1: { path: "data/catalog/slots/finger-1.json", itemCount: 1 },
    TRINKET_1: { path: "data/catalog/slots/trinket-1.json", itemCount: 0 },
    MAIN_HAND: { path: "data/catalog/slots/main-hand.json", itemCount: 0 },
    OFF_HAND: { path: "data/catalog/slots/off-hand.json", itemCount: 0 },
    RANGED: { path: "data/catalog/slots/ranged.json", itemCount: 0 },
  },
};
const idIndex: CatalogIdIndex = {
  schemaVersion: CATALOG_SCHEMA_VERSION,
  generatedAt,
  items: { "100": "HEAD", "200": "FINGER_1" },
};

function shard(slot: CatalogShardDocument["slot"], items: CatalogShardDocument["items"]): CatalogShardDocument {
  return { schemaVersion: CATALOG_SCHEMA_VERSION, generatedAt, slot, items };
}

function repository() {
  const requested: string[] = [];
  const documents: Record<string, unknown> = {
    "/armory/data/catalog/manifest.json": manifest,
    "/armory/data/catalog/item-index.json": idIndex,
    "/armory/data/catalog/slots/head.json": shard("HEAD", [helm]),
    "/armory/data/catalog/slots/finger-1.json": shard("FINGER_1", [ring]),
  };
  const fetcher = async (url: string) => {
    requested.push(url);
    const document = documents[url];
    return { ok: document !== undefined, status: document === undefined ? 404 : 200, json: async () => document };
  };
  return { catalog: new StaticCatalogRepository("/armory", fetcher), requested };
}

test("catalog slots canonicalize duplicate ring and trinket positions", () => {
  assert.equal(canonicalCatalogSlot("FINGER_2"), "FINGER_1");
  assert.equal(canonicalCatalogSlot("TRINKET_2"), "TRINKET_1");
  assert.equal(canonicalCatalogSlot("MAIN_HAND"), "MAIN_HAND");
});

test("slot browsing fetches one shard, applies level rules, and maps duplicate slots", async () => {
  const { catalog, requested } = repository();
  assert.deepEqual(await catalog.findForSlot("HEAD", 34), []);
  assert.deepEqual((await catalog.findForSlot("FINGER_2", 60)).map((item) => item.slot), ["FINGER_2"]);
  assert.deepEqual(requested, [
    "/armory/data/catalog/manifest.json",
    "/armory/data/catalog/slots/head.json",
    "/armory/data/catalog/slots/finger-1.json",
  ]);
});

test("ID lookup uses the compact index and fetches only required shards", async () => {
  const { catalog, requested } = repository();
  const matches = await catalog.findByIds(["200", "missing"]);
  assert.equal(matches.get("200")?.name, ring.name);
  assert.equal(matches.has("missing"), false);
  assert.deepEqual(requested, [
    "/armory/data/catalog/manifest.json",
    "/armory/data/catalog/item-index.json",
    "/armory/data/catalog/slots/finger-1.json",
  ]);
});

test("catalog lookup falls back to the canonical document when shard delivery fails", async () => {
  const requested: string[] = [];
  const documents: Record<string, unknown> = {
    "/armory/data/catalog/manifest.json": manifest,
    "/armory/data/coa-items.json": { generatedAt, items: [helm, ring] },
  };
  const fetcher = async (url: string) => {
    requested.push(url);
    const document = documents[url];
    return { ok: document !== undefined, status: document === undefined ? 404 : 200, json: async () => document };
  };
  const catalog = new StaticCatalogRepository("/armory", fetcher);

  assert.deepEqual((await catalog.findForSlot("HEAD", 60)).map((item) => item.id), ["100"]);
  assert.equal((await catalog.findByIds(["200"])).get("200")?.name, ring.name);
  assert.deepEqual(requested, [
    "/armory/data/catalog/manifest.json",
    "/armory/data/catalog/slots/head.json",
    "/armory/data/coa-items.json",
    "/armory/data/catalog/item-index.json",
  ]);
});

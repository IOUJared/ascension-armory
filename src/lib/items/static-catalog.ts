import { canEquipItemAtLevel, type EquipmentSlot, type GearItem } from "@/domain/gear";
import type { CatalogRepository } from "./catalog-repository";
import {
  CATALOG_SCHEMA_VERSION,
  canonicalCatalogSlot,
  type CatalogIdIndex,
  type CatalogManifest,
  type CatalogShardDocument,
  type CatalogShardSlot,
} from "./catalog-schema";

type Fetcher = (input: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class StaticCatalogRepository implements CatalogRepository {
  private manifestPromise?: Promise<CatalogManifest>;
  private idIndexPromise?: Promise<CatalogIdIndex>;
  private readonly shardPromises = new Map<CatalogShardSlot, Promise<CatalogShardDocument>>();

  constructor(
    private readonly basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "",
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async findForSlot(slot: EquipmentSlot, level: number): Promise<GearItem[]> {
    const shard = await this.loadShard(canonicalCatalogSlot(slot));
    return shard.items
      .filter((item) => canEquipItemAtLevel(item, level))
      .map((item) => item.slot === slot ? item : { ...item, slot });
  }

  async findByIds(itemIds: Iterable<string>): Promise<Map<string, GearItem>> {
    const wanted = new Set(itemIds);
    if (!wanted.size) return new Map();

    const index = await this.loadIdIndex();
    const requiredSlots = new Set<CatalogShardSlot>();
    for (const id of wanted) {
      const slot = index.items[id];
      if (slot) requiredSlots.add(slot);
    }

    const shards = await Promise.all([...requiredSlots].map((slot) => this.loadShard(slot)));
    return new Map(shards.flatMap((shard) => shard.items
      .filter((item) => wanted.has(item.id))
      .map((item) => [item.id, item] as const)));
  }

  private assetUrl(path: string): string {
    return `${this.basePath}/${path}`;
  }

  private loadManifest(): Promise<CatalogManifest> {
    this.manifestPromise ??= this.loadJson<CatalogManifest>("data/catalog/manifest.json", "catalog manifest")
      .then((manifest) => {
        if (manifest.schemaVersion !== CATALOG_SCHEMA_VERSION) throw new Error("Unsupported static catalog schema");
        return manifest;
      })
      .catch((error: unknown) => {
        this.manifestPromise = undefined;
        throw error;
      });
    return this.manifestPromise;
  }

  private loadIdIndex(): Promise<CatalogIdIndex> {
    this.idIndexPromise ??= this.loadManifest()
      .then((manifest) => this.loadJson<CatalogIdIndex>(manifest.idIndexPath, "catalog item index"))
      .then((index) => {
        if (index.schemaVersion !== CATALOG_SCHEMA_VERSION) throw new Error("Unsupported catalog item index schema");
        return index;
      })
      .catch((error: unknown) => {
        this.idIndexPromise = undefined;
        throw error;
      });
    return this.idIndexPromise;
  }

  private loadShard(slot: CatalogShardSlot): Promise<CatalogShardDocument> {
    const cached = this.shardPromises.get(slot);
    if (cached) return cached;

    const promise = this.loadManifest()
      .then((manifest) => this.loadJson<CatalogShardDocument>(manifest.shards[slot].path, `${slot} catalog shard`))
      .then((shard) => {
        if (shard.schemaVersion !== CATALOG_SCHEMA_VERSION || shard.slot !== slot) {
          throw new Error(`Invalid ${slot} catalog shard`);
        }
        return shard;
      })
      .catch((error: unknown) => {
        this.shardPromises.delete(slot);
        throw error;
      });
    this.shardPromises.set(slot, promise);
    return promise;
  }

  private async loadJson<T>(path: string, label: string): Promise<T> {
    const response = await this.fetcher(this.assetUrl(path));
    if (!response.ok) throw new Error(`${label} failed with ${response.status}`);
    return response.json() as Promise<T>;
  }
}

export const staticCatalogRepository: CatalogRepository = new StaticCatalogRepository();

export function findStaticItemsForSlot(slot: EquipmentSlot, level: number): Promise<GearItem[]> {
  return staticCatalogRepository.findForSlot(slot, level);
}

export function findStaticItemsById(itemIds: Iterable<string>): Promise<Map<string, GearItem>> {
  return staticCatalogRepository.findByIds(itemIds);
}

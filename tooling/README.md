# Catalog pipeline

The catalog tools are grouped by responsibility. Every command is still exposed through `package.json`; callers should use the npm command rather than depending on a tool's file path.

```text
extraction/  game-client, realm-cache and addon indexes -> portable source files
importers/   portable source files -> normalized PostgreSQL records
enrichment/  normalized records + discovery indexes -> derived candidates and metadata
exporters/   normalized PostgreSQL records -> canonical browser catalog
catalog/     canonical catalog -> manifest, item index and slot shards
validation/  canonical catalog + distributed assets -> integrity report
```

## Source authority

Current rendered in-game tooltips and current-realm item responses are the stat authority. AtlasLoot and LootCollector provide discovery and acquisition metadata; old all-realm client tables and the Ascension web database are candidate sources only. The exporter enforces that boundary before an item reaches the published catalog.

## Publishing

After source data has been imported and enriched, publish and validate every browser asset with:

```bash
npm run publish:catalog
```

This writes `public/data/coa-items.json`, the catalog manifest, ID index, and every slot shard, then checks their schema, provenance, counts, IDs, and content equality. To rebuild shards from an already committed canonical catalog without PostgreSQL, run `npm run publish:catalog-existing`.

The individual extraction and import commands accept their existing source-specific arguments. See the root README for the current realm-cache, addon-scan, AtlasLoot, and Worldforged workflows.

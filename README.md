# Ascension Armory

An EP-based character and gear planner for Project Ascension: Conquest of Azeroth. The first slice includes an interactive paper doll, slot-specific item ranking, side-by-side upgrade deltas, Mystic Enchant and custom socket modeling, an AoWoW-tooltip importer, and a normalized PostgreSQL schema.

## Quick start

```bash
npm ci
npm run dev
```

The browser loads the committed `public/data/coa-items.json` catalog and ranks it locally, so the complete planner works as a static site. PostgreSQL is used by the ingestion and catalog-generation tools, but it is not required to serve the UI.

## Importing a character

GitHub Pages cannot read a running game process, and Ascension does not expose a public character-equipment API for the planner. The included Wrath 3.3.5-compatible addon provides a small, explicit bridge instead:

1. Download `AscensionArmoryExporter.zip` from the site’s **Import gear** dialog.
2. Extract `AscensionArmoryExporter` into the Ascension client’s `Interface/AddOns` directory.
3. Log into the character and run `/aaexport`.
4. Copy the highlighted `AA1` string and paste it into the site.

The import updates the planner’s character level and equipped slots, then the existing local build persistence saves the result. AA2 exports include the game client’s item metadata and current stat snapshot, so an equipped item can be imported even when it is not yet in the published catalog. The export contains no login or account credentials.

## GitHub Pages deployment

The app uses Next.js static export and deploys through `.github/workflows/deploy-pages.yml`. The workflow automatically accounts for the repository subpath, builds the `out/` directory, and publishes it through GitHub Pages whenever `main` is pushed.

To refresh the catalog after importing or syncing database items:

```bash
cp .env.example .env
docker compose up -d postgres
npm run db:generate
npm run export:catalog
```

Worldforged discoveries can be refreshed from LootCollector's account-level
SavedVariables database before exporting the catalog:

```bash
npm run import:worldforged -- --file "/path/to/WTF/Account/YOUR_ACCOUNT/SavedVariables/LootCollector.lua"
npm run generate:worldforged-upgrades
npm run generate:addon-candidates
npm run export:catalog
```

The importer reads discovery type `1` (Worldforged) as data without executing
the Lua file. LootCollector is used as discovery metadata only: CoA's current
realm response must identify an item as equippable before it enters the gear
catalog. This avoids treating Worldforged scroll IDs as gear because an old
all-realms DBC reused the same numeric ID.

Commit the regenerated `public/data/coa-items.json` file so GitHub Pages can serve it without database access.

## Current CoA item ingestion

The public Ascension database is an older fallback, not the catalog authority.
The primary extractor decodes the Rexxar `itemcache.wdb` written from current
server item-query responses. It rejects partial records and verifies that the
entire packet payload was understood.

```bash
npm run extract:realm-cache -- \
  --cache "/path/to/Cache/WDB/enUS/Rexxar - Conquest of Azeroth/itemcache.wdb" \
  --output ./data/coa-realm-items.ndjson.gz \
  --equippable-only
npm run ingest:realm-cache -- --file ./data/coa-realm-items.ndjson.gz
npm run export:catalog
```

Base realm templates do not contain every level-scaled Worldforged result. The
included addon can query LootCollector candidates through the current realm and
capture `GetItemStats`, the rendered tooltip, PvE/PvP power, inventory type and
the player level used for the snapshot. In game, run `/aacatalog`; use
`/aacatalog status` or `/aacatalog stop` as needed, and `/reload` after it
finishes. Then import the saved snapshots:

```bash
npm run ingest:addon-catalog -- \
  --file "/path/to/WTF/Account/ACCOUNT/SavedVariables/AscensionArmoryExporter.lua"
npm run export:catalog
```

After the base discoveries are verified, `generate:worldforged-upgrades` finds
their generated item IDs in the installed client index. A subsequent
`generate:addon-candidates` and `/aacatalog` pass asks the current realm to
verify each level-60, dungeon, raid and later upgrade record. Client-index
values alone never enter the published catalog.

AtlasLoot Ascension Edition is a second discovery index. Its current CoA
Classic, world-event and Worldforged tables contain source-aware item IDs, but
AtlasLoot itself renders stats from the live game APIs rather than storing a
complete stat database. Extract its candidate IDs from a checked-out copy and
then regenerate the addon queue:

```bash
npm run extract:atlasloot -- --atlas-dir /path/to/AtlasLootAscension
npm run generate:dungeon-variants
npm run generate:addon-candidates
```

The generated JSON records the exact AtlasLoot commit, source file and line.
Atlas-only IDs already present in the current-realm catalog are skipped, and
new IDs still require a successful `/aacatalog` response before publication.

`generate:dungeon-variants` matches AtlasLoot instance gear to generated
Normal (item level 57), Heroic (61), and Mythic (64) client items by exact
name, equipment slot, and display model. These are discovery candidates only;
the current CoA realm remains the authority for their stats.

### Exact level-scaling calibration

The addon can capture the same item link at every effective level without
assuming a generic item-budget formula. Run `/aascale test` to compare a fixed
dungeon base, its generated Normal version, and a true scaling item, then `/reload` and
import the saved snapshots:

```bash
npm run ingest:addon-scaling -- \
  --file "/path/to/WTF/Account/ACCOUNT/SavedVariables/AscensionArmoryExporter.lua"
npm run export:catalog
```

Use `/aascale ITEM_ID [MIN_LEVEL] [MAX_LEVEL]` for another item, and
`/aascale status` or `/aascale stop` while it runs. The planner selects an
exact captured snapshot for its current character level and labels it as
scaled; it never interpolates missing levels.

To resolve every current-realm item backed by `ScalingStatDistribution`,
generate the compact list and run the bulk exact-level scan:

```bash
npm run generate:scaling-candidates
# In game: /reload, /aascale all, /aascale status, then /reload when complete
npm run ingest:addon-scaling -- \
  --file "/path/to/WTF/Account/ACCOUNT/SavedVariables/AscensionArmoryExporter.lua"
```

Unresolved scaling templates are withheld from the published catalog so an
empty base row cannot be mistaken for a complete set of character-level stats.

## Legacy and client-wide sources

Ascension DB does not expose a documented item JSON API. Its public item pages contain an embedded AoWoW metadata object and tooltip payload. The importer retains this adapter for explicitly requested fallback records, but these records are not exported into the current CoA catalog unless current-realm or player-import evidence also exists.

```bash
npm run ingest:items -- --ids 40188,40200
npm run ingest:items -- --file ./item-ids.txt
```

For a complete, version-matched catalog, extract the locally installed Ascension client instead of requesting hundreds of thousands of web pages:

```bash
npm run extract:client-items -- \
  --data-dir "$HOME/Games/ascension-wow/drive_c/Program Files/Ascension Launcher/resources/ascension-live/Data" \
  --output ./data/ascension-items.ndjson.gz \
  --icon-map-output ./data/ascension-item-icons.tsv
npm run ingest:client-items -- --file ./data/ascension-items.ndjson.gz
```

The extractor joins Ascension's custom `Item.dbc`, `ItemAddon.dbc`, and `ItemDisplayInfo.dbc` tables and preserves their source fields in `rawPayload`. Item display IDs are resolved to the exact in-game icon names; the UI serves those textures through Ascension DB's public icon CDN. The local client catalog spans every installed Ascension realm; records are marked `ASCENSION_CLIENT_ALL_REALMS` until realm availability is confirmed from a drop/vendor source.

Only import IDs you are entitled to use. The client identifies itself, times out requests, retries transient failures, and defaults to one request every 850 ms. Keep imports cache-friendly and review the source site's current robots policy and terms before running a large corpus job.

## Architecture

```text
src/
├── app/
│   ├── globals.css              Tailwind plus the armory theme
│   ├── layout.tsx
│   └── page.tsx
├── components/gear/
│   ├── gear-planner.tsx         Profile, paper doll and live EP weights
│   ├── gear-import-modal.tsx    Addon instructions and AA1 import flow
│   └── item-picker-modal.tsx    Ranking and side-by-side comparison
├── data/demo-items.ts           Zero-setup development fixture
├── lib/
│   ├── ascension/               Fetch, parse and transactional store adapter
│   ├── items/static-catalog.ts  Browser-side static catalog lookup
│   ├── items/repository.ts      PostgreSQL catalog-generation lookup
│   ├── db.ts                    Shared Prisma client
│   └── ep.ts                    EP, caps, enhancements and hybrid scaling
└── types/gear.ts                Domain types and slot/stat vocabulary
prisma/
├── schema.prisma                PostgreSQL schema
└── seed.ts                      Stat definitions
scripts/ingest-items.ts          Rate-limited ingestion CLI
scripts/export-static-catalog.ts PostgreSQL-to-static-catalog exporter
addon/AscensionArmoryExporter/   In-game level and equipment exporter
```

## Calculation model

`resolveItemStats` composes base stats, armor/weapon DPS, effect estimates, inserted gems/REs, per-level scaling and hybrid conversion rules. `calculateEp` then applies user weights and optional soft/hard caps. This separates raw item truth from specialization-specific interpretation across Conquest of Azeroth's original classes.

Mystic Enchants and gems are normalized in PostgreSQL. `scalingFormula`, `hybridRule`, and `customData` are JSONB escape hatches for mechanics that cannot be represented as flat stats; deterministic mechanics should be promoted into typed rules in `src/lib/ep.ts` as they are verified in-game.

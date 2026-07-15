# Ascension Armory

An EP-based character and gear planner for Project Ascension: Conquest of Azeroth. The first slice includes an interactive paper doll, slot-specific item ranking, side-by-side upgrade deltas, Mystic Enchant and custom socket modeling, an AoWoW-tooltip importer, and a normalized PostgreSQL schema.

## Quick start

```bash
npm ci
npm run dev
```

The browser loads the committed `public/data/coa-items.json` catalog and ranks it locally, so the complete planner works as a static site. PostgreSQL is used by the ingestion and catalog-generation tools, but it is not required to serve the UI.

## GitHub Pages deployment

The app uses Next.js static export and deploys through `.github/workflows/deploy-pages.yml`. The workflow automatically accounts for the repository subpath, builds the `out/` directory, and publishes it through GitHub Pages whenever `main` is pushed.

To refresh the catalog after importing or syncing database items:

```bash
cp .env.example .env
docker compose up -d postgres
npm run db:generate
npm run export:catalog
```

Commit the regenerated `public/data/coa-items.json` file so GitHub Pages can serve it without database access.

## Item ingestion

Ascension DB does not expose a documented item JSON API. Its public item pages contain an embedded AoWoW metadata object and tooltip payload. The importer keeps that source detail inside `src/lib/ascension`, parses the payload, retains the original HTML and JSON for future reparsing, then transactionally upserts normalized stats, sockets, effects, armor and weapon damage.

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
```

## Calculation model

`resolveItemStats` composes base stats, armor/weapon DPS, effect estimates, inserted gems/REs, per-level scaling and hybrid conversion rules. `calculateEp` then applies user weights and optional soft/hard caps. This separates raw item truth from specialization-specific interpretation across Conquest of Azeroth's original classes.

Mystic Enchants and gems are normalized in PostgreSQL. `scalingFormula`, `hybridRule`, and `customData` are JSONB escape hatches for mechanics that cannot be represented as flat stats; deterministic mechanics should be promoted into typed rules in `src/lib/ep.ts` as they are verified in-game.

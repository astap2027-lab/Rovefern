# Rovefern

An AI-powered planner for hiking and backpacking trips. You describe a trip and get a day-by-day itinerary, a gear list with pack weights, a packing guide, a food and water plan, a budget, weather and a safety checklist. All of it can be edited, by hand or by asking the assistant.

## What works today

- **Planning**: type one prompt ("Describe it") or answer a guide's questions one at a time ("Chat with a guide"). The AI pulls out destination, dates, group, budget, currency, experience, scenery and gear you already own, and asks targeted questions about anything important that's missing.
- **Trip dashboard** with eight tabs: overview, itinerary, map, gear, packing, food and water, budget, preparation. An assistant drawer changes the trip in plain language ("make it seven days", "add Sam", "I own a 1.2 kg tent"), shows what changed and lets you undo it.
- **Explore trails**: six established trails whose figures come from official sources, with filters, detail pages and "Plan this trip".
- **Gear library**: manual entry, quick add ("Titanium mug 110 g"), AI entry from a description or a photo, search, filters, favourites, duplicate, delete with undo, and a "to get" list.
- **Pack weights**: base, consumable, worn, total carried and all-up weight, at the start and end of the trip, per person, with shared group gear.
- **AI gear optimisation**: suggestions you can accept or reject. Essential safety gear is never removed.
- **Packing assistant**: a backpack zone diagram built from your actual items, a checklist and progress.
- **Food plan**: a rotating menu, day-by-day overrides, resupply days, a spare day, a shopping list and a fuel estimate. **Water**: estimates given as ranges with the assumptions shown.
- **Budget**: estimates vs actual spending, per person and per day, remaining budget, settling up between people, and currency conversion using ECB rates.
- **Weather**: an Open-Meteo forecast within 16 days. Further out it shows the same dates in a past year, clearly labelled as climate context.
- **Safety**: official authority links for each country, emergency numbers, trip intentions and a checklist.
- **GPX** import with preview, elevation profile and export. **Trip pack**: print or save as PDF, an offline HTML copy, or JSON export and import.
- **Guest mode**: everything is saved in IndexedDB and survives refreshes. A backup and restore file moves data between devices.
- **PWA**: the app shell is cached by a service worker, so saved trips open offline.
- **Metric or imperial**, any currency, locale-aware dates, and each country's own grading system.

## Not done yet

- **Cloud accounts and sync.** The UI says this plainly, and backup/restore covers moving between devices for now. Adding accounts means a `SyncProvider` (for example Supabase auth and Postgres) that uploads the same `AppState` JSON the backup uses, which also gives guest-to-account migration.
- **Live park alerts.** No single source covers every country, so Rovefern links to the official authority for each country and region instead of claiming coverage it doesn't have.
- **Offline maps.** These aren't offered, and the app says so.

## Accuracy rules (built into the code)

- Every important figure carries a provenance label: Official, Third-party, Your input, AI suggestion, Estimate or Unverified (`src/lib/domain/types.ts`).
- Catalogue trail facts (`src/lib/domain/trails.ts`) were taken from official pages on 5 Nov 2026. Fields a source didn't state are left `null`.
- When a trip uses a catalogue trail, official stage data overrides the AI's numbers (`daysForTrail`).
- AI-suggested routes are flagged as unverified. Route lines are only drawn from GPX files you import.
- Gear weights are never invented. Unknown weights are excluded from totals and flagged.

## Architecture

```
src/lib/engine/   Deterministic logic: weights, budget (integer cents), food, fuel, water, Naismith times, packing
src/lib/engine/tripOps.ts   The only way the AI can change a trip: validated, atomic operations
src/lib/domain/   Types, trail catalogue, authorities, gear defaults
src/lib/ai/       Rule-based fallback parser (used when no API key is set)
src/server/       Anthropic client (fetch, tool use), prompts, zod schemas, API routes (runtime-neutral run())
src/worker.ts     Cloudflare Worker entry for /api/*
src/web/          React app (no framework): pages, trip tabs, store (IndexedDB), adapters
worker/           Built Cloudflare Worker (generated)
api/              Built Node functions for the local server / Vercel (generated)
public/           Static site + built bundle (generated assets/)
```

**Why not Next.js?** The build environment couldn't download npm packages, so the app uses React plus esbuild with a small router instead. It deploys to Cloudflare Workers as static assets plus one Worker for the API. The calculation engine and API code don't depend on the framework, so moving to Next.js later would mean moving the files, not rewriting them.

**AI flow.** The server asks Claude to answer through a single tool whose input schema is generated from zod. The output is validated on the server, and again on the client by `applyOps` against the current trip. If any operation fails, nothing changes. Derived values such as food, fuel, weights and totals aren't stored. They are recomputed on every change, so changing the trip length always flows through.

## Run locally

```bash
npm install
npm run build
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local   # optional; without it the app runs in offline mode
npm start            # http://localhost:3000
npm test             # 23 tests: engine, planning scenarios, ops
```

## Deploy (Cloudflare Workers)

The site is served from `public/` by Cloudflare's static assets. A small Worker (`worker/index.js`, built from `src/worker.ts`) handles `/api/*`. `wrangler.jsonc` contains the config.

1. In the Cloudflare dashboard go to **Workers & Pages → Create → Import a repository**, and pick this repo.
2. The project name must match `"name"` in `wrangler.jsonc` (`rovefern`). Leave the build command empty. The deploy command is `npx wrangler deploy`.
3. After the first deploy, open the Worker's **Settings → Variables and Secrets** and add `ANTHROPIC_API_KEY` as a **Secret** (runtime, not the build variables). You can also add `ANTHROPIC_MODEL`.
4. After changing code, run `npm run build` and commit the regenerated `public/assets`, `public/sw.js`, `worker/` and `api/`. Pushing to `main` redeploys.

From your own computer you can deploy with `npx wrangler login` followed by `npm run deploy`.

`vercel.json` and `api/` are still included, so the same code can also deploy to Vercel.

The API routes have a basic per-instance rate limit and input size caps. For a busy public site, add Cloudflare's rate limiting rules to protect your API key's spend.

## Data providers and terms

- **AI**: Anthropic Messages API (server-side key only).
- **Maps**: OpenTopoMap and OpenStreetMap tiles, both credited on the map. Their tile servers are for light use only. For real traffic, switch `TILE_LAYERS` in `MapView.tsx` to a keyed provider such as MapTiler or Thunderforest.
- **Weather**: Open-Meteo. Its free tier is for non-commercial use, so get an API plan if you monetise.
- **Currency**: Frankfurter (ECB reference rates).
- **Photos**: Wikimedia Commons via `Special:FilePath`, with a credit link that appears only once the photo has loaded. Before launch, check each file's licence and author on Commons.

## Branding

The name, tagline and logo live in `src/web/brand.tsx`. Colours and type are tokens at the top of `public/styles.css`.

# Architecture

**Key files:** `src/hooks.server.ts`, `src/lib/server/`, `src/routes/`, `scripts/start.js`,
`Dockerfile`, `docker-compose.yml`

## The pieces

```
browser (PWA, iPhone/iPad/desktop)
   │  HTTPS
   ▼
reverse proxy (TLS)            ← required: passkeys only work over HTTPS
   │  HTTP, X-Forwarded-For / -Proto
   ▼
Node 22 · SvelteKit (adapter-node) ── SQLite file (better-sqlite3, WAL)
   │                                   └─ change_log triggers ──▶ daily backup job ──▶ BACKUP_DIR
   ├─▶ Open Food Facts API   (barcodes, online search; cached locally)
   └─▶ USDA FoodData Central (optional, needs an API key)
```

There is **no separate database server**: SQLite is embedded in the app process and lives in one
file (`DATABASE_PATH`). There is no queue, cache server or cron either. The backup job runs as a
timer inside the app.

## Startup sequence (`scripts/start.js`)

1. In production, refuse to start without `ORIGIN` or with a `SESSION_SECRET` shorter than 32
   characters.
2. Open the database and apply the Drizzle migrations from `drizzle/`.
3. Load `data/swissfcd.json` into the `foods` table (`import-swissfcd.js --load`, idempotent by
   dataset version).
4. Start the SvelteKit server (`build/index.js`). Its `init` hook prints a setup link when no
   passkey exists yet and starts the backup job.

## Request flow (`src/hooks.server.ts`)

- `/api/auth/*` is rate limited (30 requests per 5 minutes per client IP).
- The session cookie is validated and extended. Without a session, pages redirect to `/login`
  (or `/setup` if no passkey exists) and API calls get `401`.
- Public routes: `/login`, `/setup`, `/api/auth/*`, `/api/health`.
- Every response gets security headers. API responses are `Cache-Control: no-store`.

## Source map

```
src/
  hooks.server.ts            auth gate, rate limit, security headers, startup init
  lib/
    nutrients.ts             nutrient registry (keys, units, groups)
    nutrition.ts             pure maths: scaling, recipes, aggregation, missing data, moving avg
    slider.ts                portion slider maths (range, magnetic snapping)
    dates.ts                 local dates and times (Europe/Zurich)
    i18n/                    typed catalogues (de = source of truth, en) + Swiss formatting
    api.ts                   typed client for the JSON API
    components/              PortionPicker, PortionSlider, Sheet, AddPanel, BarcodeScanner, …
    stores/                  UI state (sheets, picker, toasts), app settings, viewport tier
    server/
      config.ts              all runtime configuration from process.env
      db/                    Drizzle schema + connection (migrations in /drizzle)
      auth/                  sessions, setup/recovery tokens, WebAuthn
      foods/                 FoodSource adapters (OFF, USDA), local FTS search, portions
      log.ts weights.ts insights.ts customFoods.ts settings.ts
      backup.ts              JSON export/import, CSV export
      backupJob.ts           daily incremental backup (base snapshot + change journal)
  routes/                    pages + JSON API under /api
  service-worker/            caches immutable build assets only
scripts/                     plain-JS CLI: start, import-swissfcd, recovery, backup, restore
  lib/journal.js             change journal: triggers, snapshot, replay
data/                        portion presets, search aliases (Swiss DB is downloaded, not committed)
drizzle/                     SQL migrations
e2e/                         Playwright specs + mock Open Food Facts server
```

## Conventions worth knowing before editing

- Imports use **Node subpath imports** (`#lib/...` with explicit `.ts`), not `$lib`.
- Configuration is read through `src/lib/server/config.ts` (from `process.env`), not
  `$app/env`, so the same modules run in SvelteKit, Vitest and the CLI scripts.
- CLI scripts in `scripts/` are **plain ESM JavaScript** with JSDoc types, because the runtime
  image has no TypeScript toolchain.
- The API client always sends a JSON body on mutations (Kit's CSRF guard, see DECISIONS.md).

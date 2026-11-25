# Decisions

Decisions made during implementation, especially where the brief left room or reality differed.

## Platform and tooling

- **SvelteKit 3.1 / Svelte 5.57 / Vite 8** (latest stable at build time). Kit 3 changes I
  followed:
  - `$lib` is replaced by **Node subpath imports** (`#lib/...` with explicit `.ts`
    extensions; the deprecated `alias` config isn't used).
  - Hook types live in `@sveltejs/kit/hooks`, and `goto()` options are `replace`/`reset`.
  - The service worker uses `$app/manifest` + `$app/env` (`$service-worker` was removed).
  - Kit's CSRF guard also rejects body-less mutating requests whose Origin doesn't match, so
    the API client always sends JSON for mutations (also CSRF-safe: JSON needs a CORS
    preflight, and the session cookie is `SameSite=Lax`).
- **Configuration via `process.env`** (`src/lib/server/config.ts`) rather than Kit's
  `$app/env/*`, so the same modules run in SvelteKit, Vitest and the plain-JS CLI scripts
  (`start`, `recovery`, `backup`, `import-swissfcd`).
- **npm 11** for installs: npm 10.9 crashes (`Cannot read properties of null (reading
'edgesOut')`) on this dependency tree. The Dockerfile installs npm 11.
  `package.json#allowScripts` approves the native/esbuild install scripts.
- **CLI scripts are plain ESM JavaScript** (JSDoc-typed) so the slim runtime image needs no TS
  toolchain.

## Data

- **Nutrients as JSON per 100 g/ml** (`foods.nutrients`). Missing key = unknown (never 0).
  Aggregates report the per-key missing count, recipes carry a `partial` list, and the UI
  shows `≥` / "unvollständig" hints.
- **Swiss Food Composition DB v7.1**: the official German and English XLSX files are joined by ID.
  They are not committed: the FSVO's terms allow use in apps with attribution, but its legal page
  requires written permission to reproduce material and the data cites third-party tables, so
  they are downloaded from the FSVO on import and checked against pinned SHA-256 hashes
  (`SWISSFCD_URL_DE`/`_EN` override the URLs). For the same reason, don't publish prebuilt
  images, which contain the converted data, without the FSVO's agreement. Value mapping: `n.d.`/`k.A.` → unknown, `Sp.`/`tr.` (traces) → 0,
  `<x` (below detection limit) → 0. Generic and branded sheets are imported (1'246 foods).
  XLSX → JSON conversion runs at Docker build time (exceljs stays a dev dependency), and
  JSON → SQLite at container start, idempotent by dataset version.
- **Search aliases** (`data/search-aliases.json`) add common synonyms the dataset lacks
  (Ei → Hühnerei, Nudeln → Teigwaren, Hähnchen → Poulet, Sahne → Rahm, Rüebli → Karotte, …).
- **Search**: two FTS5 indexes, `unicode61 remove_diacritics` for word prefixes and `trigram`
  for substrings in German compounds. Typing "ue/ae/oe" also matches ü/ä/ö. Candidates are
  re-ranked in JS (exact first word, prefix, favourites, usage frequency, source, "roh"
  preference, name length).
- **Log entries snapshot** the food name and per-100 values, so editing a custom food doesn't
  rewrite history. Recipes, however, _are_ recomputed when an ingredient custom food changes.
- **Portion presets** (`data/portion-presets.json`, 204 rules) match food names by regex. German
  names are tried against all rules first, then English (USDA). They're applied at read time,
  so editing the file needs no re-import. `ml` presets are converted with the food's density.
  OFF products use their own serving size; seed rules apply to OFF only when no serving exists.
- **Default slider position**: last amount used for that food, else the preset marked
  `default`, else the serving, else 150 g.
- **Slider range**: `max(300, 3 × largest preset, 1.25 × value)`, rounded to a nice number,
  extendable ×2 per "Skala erweitern". Free values snap to 1 g (≤ 400), 5 g (≤ 1500), else 10 g.
  Magnetic radius is 14 px.
- **±buttons**: four buttons (−5, −1, +1, +5). Long-press repeats with acceleration (×2 after
  6 repeats, ×5 after 16).

## Backups

- **Incremental, on the server**: a daily job (`src/lib/server/backupJob.ts`) writes to a host
  directory outside the Docker volume. A chain is one gzipped JSON base snapshot of the user data
  (not the database file, whose bulk is reproducible Swiss reference data) plus an append-only
  journal of changes, so unchanged data is never stored twice. The journal comes from SQLite triggers
  (`change_log`, generated from `scripts/lib/journal.js`), so every write path is covered: API,
  import and scripts. Rows that reference foods carry `source:sourceId`, because food ids differ
  between installations. Exported journal rows are kept in the database for 30 days.
- A new chain starts each year, when the journal format changes, or when the database doesn't know
  the chain on disk (e.g. after a restore). A crash between appending and recording the position only
  repeats lines; the restore replays by sequence number, skipping repeats and a torn last line.
- The deploy-time SQLite copies in `/data/backups` stay as a quick pre-deploy safety net.

## External services (usage rules checked)

- **Open Food Facts** (API docs + terms of use):
  - Custom `User-Agent: Nutrition/1.0 (<OFF_CONTACT_EMAIL>)`, with a startup warning if unset.
  - Local limiters at **12 product reads/min** and **8 searches/min** (documented limits:
    15 and 10).
  - **Online search only on explicit action** (Enter key or "Online suchen" button), never
    per keystroke ("don't use it for a search-as-you-type feature"). Local results show
    instantly.
  - Every fetched product is cached in SQLite, searches for 7 days, barcode misses for 24 h.
  - Uses the `search.openfoodfacts.org` (search-a-licious) full-text search with
    `countries_tags:"en:switzerland"`, under the same conservative limiter.
  - **ODbL attribution**: each OFF food links to its product page, and credits name ODbL/DbCL.
    **Product images are not displayed**, which avoids CC BY-SA image attribution and
    hotlinking.
  - The local cache is a private, single-user derivative. If you ever publish the database,
    ODbL share-alike applies to the OFF-derived part.
- **USDA FoodData Central**: enabled only with your own free `USDA_API_KEY` (no `DEMO_KEY`
  fallback), capped at 300 req/h (limit 1'000). The key stays in `.env` and is never committed.
  FDC is cited in credits.
- **Swiss FCD**: source acknowledged in _Über & Quellen_ (required by the terms).
- Test fixtures were recorded once from the live APIs (4 OFF requests, 1 USDA `DEMO_KEY`
  request) with a generic User-Agent. Tests never touch the network: E2E uses a local mock
  OFF server serving these fixtures.

## Auth and security

- WebAuthn with **discoverable credentials** (`residentKey: required`), `userVerification:
preferred`, attestation `none`. Single user, with a random user handle in settings.
- **Setup**: the `SETUP_TOKEN` env token is valid only while no passkey exists. Without one, a
  random token is generated and printed on start. Recovery tokens (`scripts/recovery.js`)
  are HMAC-hashed in the DB, single-use and expire after 1 h.
- **Sessions**: a 256-bit random cookie token stored as HMAC(`SESSION_SECRET`). 90 days, sliding
  (extended at most once a day). `HttpOnly`, `Secure` (also on `localhost`), `SameSite=Lax`.
  The production start refuses to run with a `SESSION_SECRET` shorter than 32 chars.
- **Rate limit**: 30 requests per 5 min per client IP on `/api/auth/*`, with the IP taken from
  `X-Forwarded-For` (last hop) via adapter-node `ADDRESS_HEADER`/`XFF_DEPTH=1`.
- The last passkey can't be deleted (prevents lockout). Passkeys and sessions are never
  included in exports.
- Security headers: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`,
  `Permissions-Policy` (camera self only). API responses are `no-store`.

## UX

- **Add sheet stays open** after logging, so several foods can be added in a row. A toast
  confirms each one.
- **iOS keyboard on open**: iOS only shows the keyboard for `focus()` inside the tap handler,
  so the FAB focuses an off-screen proxy input first and focus then moves to the sheet's
  search field.
- **Copy entries**: multi-select by day and time-of-day groups (morning, midday, afternoon,
  evening), optionally keeping the original times. On past days, the swipe action
  "Nach heute kopieren" copies a single entry.
- **Adherence** = days within ±10 % of the kcal target, among logged days.
- **Kcal ring centre**: shows what's left by default; tapping the ring switches to what's been
  eaten "von {Ziel}" and back. The choice isn't saved, so the page always opens on "übrig".
- **One period switch** (Woche | Monat | Jahr | Gesamt) drives the whole Verlauf page, including
  "Wer liefert was?", whose total names the period. The list used to have its own Tag/period/Gesamt
  switch, which made an empty "Tag" look like missing data. "Gesamt" runs from the first entry to
  today, in monthly bars up to two years and yearly bars beyond; tapping a bar opens that month or
  year. It opens on Monat the first time; after that the last choice is remembered.
- **Verlauf periods**: week, month and year, paged with the chevrons, ←/→ or a horizontal swipe
  on the chart. Paging back stops at the period of the first entry; "Heute" jumps back. The year
  shows 12 monthly bars (average kcal per logged day); tapping one opens that month. An empty period
  offers a jump to the last entry before it. Only the latest request's answer is shown, so quick
  paging never shows another period's numbers.
- **Target history**: every target change is stored with the date it takes effect
  (`target_history`, one row per day, the first change also stores the previous targets from
  `0000-01-01`). Verlauf compares with the current targets by default; a quiet text button under the
  adherence tiles switches to the targets that applied then (stepped, solid target line). It only
  appears once targets were changed. Both comparisons come in one response, with one indexed query
  for the targets of the period.
- **Macro targets in percent**: the targets page switches protein, carbs and fat together between
  grams and % of the kcal target (fibre isn't a share of calories, so it stays in grams). Percent
  mode is remembered: the shares are stored and the grams are recalculated whenever the kcal target
  changes, which is the point of setting them that way. The grams stay the stored target, so the
  Today rings, Verlauf and the target history keep working unchanged and past days aren't
  re-judged. Shares that don't add up to 100 % only get a warning, like grams that don't match
  the kcal target. A backup without a split predates the feature and restores as gram targets.
- **Weight**: the chart covers 30 days, 90 days (default), a year or everything (weekly averages
  beyond a year); the change tile follows that range. The history list loads 50 rows at a time
  (keyset pagination over date and id), so every weigh-in stays reachable. Deleting offers undo.
- **Colours**: iOS system colours, with the light-mode tint deepened to `#0066d6` and separate red tokens for text (`--danger-text`/`--over-text`); bright reds stay for rings and buttons. The light-mode secondary label is darkened to `#6c6c72`, the
  source badges and the active tab label are darker too, so small text passes WCAG AA.
  Lighthouse (production build, authenticated pages): performance 90–98, accessibility 100,
  best practices 100.
- **Online-only PWA**: the service worker caches only immutable build assets and icons. The API
  is never cached.
- The **barcode scanner** uses native `BarcodeDetector` where it supports EAN/UPC, else the
  ZXing WASM ponyfill. The WASM binary is **self-hosted** (the library defaults to a CDN). A
  code must be read twice identically and pass its check digit to be accepted.

## iPad layouts

- **Three layout classes, CSS first** (breakpoints in `src/app.css`, mirrored in
  `src/lib/stores/viewport.svelte.ts`):
  - _phone_ (unchanged): bottom tab bar, bottom sheets, single column.
  - _tablet_ = `min-width: 640px and min-height: 560px` (iPad portrait, Split View): floating
    tab bar, centred form sheets, wider cards, two-column Insights.
  - _wide_ = tablet + `min-width: 900px` + landscape (iPad landscape): sidebar navigation,
    Today as a split view with the add panel inline, Settings as a master/detail split view.
- **Why these numbers**: the `min-height` keeps iPhones in landscape (≤ 932 × 430) on the phone
  UI. 640/900 rather than 744/1024 because Playwright's "iPad (gen 11)" profile reports
  656 × 944 CSS px, and iPad Split View windows get narrow too. At 944 px the Today log column
  is still ≥ 343 px wide, the iPhone SE content width the phone layout already handles.
- Layout is pure CSS. The JS flags only decide whether **extra panes are mounted** (inline add
  panel, settings list), so phones never load or render hidden UI. SSR renders the phone
  markup and the panes mount on hydration. Rotating the device switches layouts live.
- Today's summary card uses a **container query**, so it widens in portrait but keeps the
  compact layout inside the narrower landscape log column.
- **Stacked sheets** (portion picker over the add sheet): on iPad the sheet behind is
  recessed (scaled and dimmed) like iPadOS, because two same-sized form sheets look broken.
- The sidebar's **quick add** logs to the day being viewed on Today, otherwise to today.

## Phone, laptop and ultrawide layouts

- **The iPad design is the reference**, so everything else follows it and iPad itself stays
  pixel-identical. Larger screens **add panes** instead of stretching rows.
- **Two tiers above iPad**, both landscape only:
  - _desktop_ = `min-width: 1400px`: two-column food, recipe, weight and `/add` pages, taller charts.
  - _ultra_ = `min-width: 1800px`: Today gets a third pane (all nutrients), Insights three columns.
- **Why 1400**: the largest iPad is 1376 CSS px wide (iPad Pro 13"), so no iPad can reach these
  tiers. Laptops below 1400 px simply get the iPad landscape layout.
- **Full-width shell on ultrawides**: an earlier version centred the whole app past 2560 px, which
  left empty bands on both sides and a detached-looking sidebar on a 3440 px monitor. The sidebar
  now stays at the left edge; Today and Insights fill the width, and from 1800 px the detail pages
  get larger caps (Add 2200, food 2400 with nutrients in three columns, recipe and weight 2000).
  Past 2560 px Today's log stops at 960 px so names stay near their kcal. Settings and forms keep
  their width caps, because forms don't improve by getting wider.
- **`min-width: 1000px` clause on tablet and wide**: a 1280 × 720 laptop can drop below the 560 px
  height gate once browser chrome is counted, and got the phone UI. No phone is that wide (largest
  iPhone landscape: 956 px).
- **Phone uses the floating tab bar** too, with the icon above the label so the German labels fit
  at 320 px. Bottom sheets stay: form sheets don't suit a phone-width screen.
- **Mouse and keyboard**: on `(hover: hover) and (pointer: fine)`, entries get a delete button on
  hover or focus, because the swipe action is unreachable by keyboard. Hover must never reserve
  space, so an iPad with a trackpad keeps its layout.
- The manifest uses `"orientation": "any"`, since `portrait` conflicts with the landscape layouts
  on platforms that honour it.
- **Container query traps**: `.day-main` is an unnamed container that reaches about 780 px on iPad
  portrait, so `NutrientTable` matches a _named_ container (`nutrients`). `/add` columns come from
  the page rather than a container on `AddPanel`, because `container-type` stops margins collapsing
  and would shift the sheets.

## Testing

- E2E runs Chromium with **iPhone 14 emulation** (viewport, touch, UA), because the CDP virtual
  WebAuthn authenticator is Chromium-only. Real iOS Safari behaviour (Face ID, camera) still
  needs a manual check on the device.
- The iPad layouts run in two extra projects, `ipad-portrait` and `ipad-landscape` (iPad Pro 11,
  Chromium). `e2e/ipad.e2e.ts` checks geometry (sidebar, floating bar, form sheets, grid
  placement, no horizontal scroll), logging through the inline panel, the settings split view,
  live rotation, the smallest iPad landscape (944 × 656) and that iPhone landscape stays on the
  phone layout.
- Laptop, monitor and ultrawide run `e2e/desktop.e2e.ts` in the `laptop`, `desktop` and `ultrawide`
  projects (1440, 1920, 3440 px, mouse input). `e2e/phone.e2e.ts` covers the floating bar and every
  route from 320 to 430 px.
- The camera is mocked via Chromium's fake media stream plus a test hook
  (`window.__NUTRITION_TEST_BARCODE__`) that stands in for the detector.

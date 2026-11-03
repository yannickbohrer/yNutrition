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
- **Swiss Food Composition DB v7.1**: the official German and English XLSX files are committed
  (≈2 MB) and joined by ID. Value mapping: `n.d.`/`k.A.` → unknown, `Sp.`/`tr.` (traces) → 0,
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
- **Insights breakdown** periods: today, or the selected week or month.
- **Colours**: iOS system colours, with the light-mode tint deepened to `#0066d6` and separate red tokens for text (`--danger-text`/`--over-text`); bright reds stay for rings and buttons. The light-mode secondary label is darkened to `#6c6c72`, the
  source badges and the active tab label are darker too, so small text passes WCAG AA.
  Lighthouse (production build, authenticated pages): performance 90–98, accessibility 100,
  best practices 100.
- **Online-only PWA**: the service worker caches only immutable build assets and icons. The API
  is never cached.
- The **barcode scanner** uses native `BarcodeDetector` where it supports EAN/UPC, else the
  ZXing WASM ponyfill. The WASM binary is **self-hosted** (the library defaults to a CDN). A
  code must be read twice identically and pass its check digit to be accepted.

## Testing

- E2E runs Chromium with **iPhone 14 emulation** (viewport, touch, UA), because the CDP virtual
  WebAuthn authenticator is Chromium-only. Real iOS Safari behaviour (Face ID, camera) still
  needs a manual check on the device.
- The camera is mocked via Chromium's fake media stream plus a test hook
  (`window.__NUTRITION_TEST_BARCODE__`) that stands in for the detector.
- `deploy.sh` was tested end-to-end against a simulated Debian 12 VM (privileged container with
  sshd and a sudo user that requires a password): the first deploy installed Docker, built,
  passed the healthcheck and printed the setup link; the redeploy backed up and kept the
  secrets. It's also ShellCheck-clean.

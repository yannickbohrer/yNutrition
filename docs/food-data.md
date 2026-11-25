# Food data and search

**Key files:** `scripts/import-swissfcd.js`, `scripts/lib/swissfcd.js`,
`src/lib/server/foods/` (`search.ts`, `service.ts`, `off.ts`, `usda.ts`, `portions.ts`),
`data/portion-presets.json`, `data/search-aliases.json`

Licence terms of each source: [DATA_NOTICE.md](../DATA_NOTICE.md).

## Sources

| Source                         | How it gets in                            | Network at runtime    |
| ------------------------------ | ----------------------------------------- | --------------------- |
| Swiss Food Composition DB v7.1 | downloaded + converted at build time      | no                    |
| Open Food Facts (OFF)          | barcode lookup, explicit online search    | yes, cached in SQLite |
| USDA FoodData Central          | fallback search, only with `USDA_API_KEY` | yes                   |
| Custom foods and recipes       | created in the app                        | no                    |

### Swiss Food Composition DB

The FSVO's XLSX files are **not in the repository**. `import-swissfcd.js` has three modes:

- `--download`: (re)download the German and English XLSX into `data/swissfcd/`, checked against
  pinned SHA-256 hashes. `SWISSFCD_URL_DE` / `_EN` replace the URLs (the hash pin is then skipped).
- `--convert`: XLSX → `data/swissfcd.json` (needs the dev dependency `exceljs`; runs in the
  Docker build stage).
- `--load`: JSON → SQLite, idempotent by dataset version (runs at every container start).

Without flags it does whatever is missing. Value mapping: `n.d.`/`k.A.` → unknown, traces and
`<x` → 0.

### Open Food Facts rules (keep these)

Custom User-Agent with `OFF_CONTACT_EMAIL`, local limits below OFF's (12 reads/min, 8
searches/min), **no search-as-you-type** (online search only on Enter or the button), every
product cached, product images not shown. Details in DECISIONS.md.

## Search

Two FTS5 indexes: `unicode61 remove_diacritics` for word prefixes and `trigram` for substrings in
German compounds (`brot` → _Vollkornbrot_). `ue/ae/oe` also match ü/ä/ö. Candidates are re-ranked
in JS (exact first word, prefix, favourites, usage, source, "roh", name length).
`data/search-aliases.json` adds synonyms the dataset lacks (Ei → Hühnerei, Sahne → Rahm, …).

## Portions

`data/portion-presets.json` (≈200 regex rules) gives typical portions by food name: German names
first, then English. They're applied at read time, so editing the file needs no re-import. OFF
products use their own serving size first. Slider range and snapping maths are in
`src/lib/slider.ts` (unit-tested).

## Adding a source

Implement the `FoodSource` interface in `src/lib/server/foods/types.ts` (`search`,
`lookupBarcode`, `sourceUrl`), add it to `service.ts`, record API responses as fixtures in
`foods/fixtures/` (with their licence in `NOTICE.md`) and test against them. Tests never touch the
network. Add the credit to _Über & Quellen_ and DATA_NOTICE.md.

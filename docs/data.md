# Data model

**Key files:** `src/lib/server/db/schema.ts`, `drizzle/`, `scripts/lib/journal.js`,
`src/lib/server/backup.ts`, `src/lib/nutrients.ts`

## Tables

| Table            | Holds                                                       | User data? |
| ---------------- | ----------------------------------------------------------- | ---------- |
| `foods`          | all foods: Swiss DB, OFF, USDA, custom, recipes (`source`)  | partly¹    |
| `food_portions`  | user-defined portions of a food                             | yes        |
| `recipes`        | recipe metadata (servings, cooked weight); one row per food | yes        |
| `recipe_items`   | ingredients of a recipe                                     | yes        |
| `favorites`      | favourite foods                                             | yes        |
| `log_entries`    | what was eaten, when and how much                           | yes        |
| `weights`        | weigh-ins                                                   | yes        |
| `target_history` | targets, one row per local date a change takes effect       | yes        |
| `settings`       | key/value JSON (current targets, preferences, job state)    | yes        |
| `change_log`     | journal of every write to user data, filled by triggers     | backup     |
| `credentials`    | passkeys                                                    | auth²      |
| `sessions`       | login sessions (HMAC of the cookie token)                   | auth²      |
| `setup_tokens`   | first-run and recovery tokens (hashed)                      | auth²      |
| `search_cache`   | OFF search results (7 days)                                 | cache      |
| `barcode_misses` | barcodes OFF didn't know (24 h)                             | cache      |

¹ Swiss DB rows (`source = 'swissfcd'`) are reference data, reloaded at every start and left out
of backups. ² Never exported.

## Invariants

- **Nutrients are JSON per 100 g or 100 ml** (`basis`). A missing key means _unknown_, never 0.
  Aggregates report how many items lack each nutrient; recipes carry a `partial` list.
- **Log entries snapshot the food** (`food_name`, `food_brand`, `per100`), so editing or deleting
  a food never rewrites history. `food_id` becomes `NULL` when the food is gone.
- **Foods are soft-deleted** (`deleted_at`), because entries and recipes may still refer to them.
- **Dates are local strings** (`YYYY-MM-DD`, `HH:MM`) in Europe/Zurich. A day is local midnight
  to midnight.
- **Target history** starts with a `0000-01-01` row holding the targets before the first change,
  so past periods are judged against the targets of the time.
- **Macro targets in percent**: `settings.user.macroSplit` (`{ protein, carbs, fat }`, whole
  percent of the kcal target, or `null` for grams). When set, every save derives the gram targets
  from it (`src/lib/macros.ts`, 4/4/9 kcal per g, rounded to whole grams), so `targets` and the
  target history always hold grams. Fibre always stays in grams.
- **Entries and weigh-ins are never purged.** Deletes are explicit user actions with undo.

## Changing the schema

Do all of these in one change, otherwise backups silently miss data:

1. Edit `src/lib/server/db/schema.ts`, then `npm run db:generate` to write the migration in
   `drizzle/`. Check the generated SQL by hand.
2. If the table is journaled (see `JOURNAL_TABLES` in `scripts/lib/journal.js`), add the new
   columns to its JSON expression there, then regenerate the trigger migration with
   `node scripts/dev/journal-triggers.mjs`. A new user-data table needs a `JOURNAL_TABLES` entry.
3. Update `exportBackup` and `importBackup` in `src/lib/server/backup.ts`. If the file format
   changes, bump `BACKUP_VERSION` and keep accepting older versions.
4. If the journal row format changes, bump `JOURNAL_FORMAT` in `src/lib/server/backupJob.ts`
   (forces a new backup chain).
5. Add or extend unit tests (`src/lib/server/db/db.spec.ts`, `history.spec.ts`) so a round trip
   (export → import, snapshot + journal → restore) keeps the new data.

Migrations run automatically at start. They must never drop or truncate user data.

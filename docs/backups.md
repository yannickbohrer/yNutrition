# Backups, export and import

**Key files:** `src/lib/server/backup.ts`, `src/lib/server/backupJob.ts`,
`scripts/lib/journal.js`, `scripts/restore.js`, `scripts/backup.js`

There are three independent mechanisms. Operators should use at least the first one.

## 1. Incremental backups (automatic)

Enabled when `BACKUP_DIR` is set. The Docker Compose file sets it to `/backups` and bind-mounts a
host directory there (`BACKUP_HOST_DIR`, default `/var/backups/nutrition`).

- Runs 30 s after start, then every 24 h, inside the app process.
- Writes one folder per chain:

  ```
  BACKUP_DIR/
    status.json              last run (for monitoring)
    chain-2026-01-01/
      base.json.gz           snapshot of all user data when the chain started
      journal.jsonl          every change since, append-only (fsynced)
  ```

- The journal comes from SQLite triggers into `change_log`, so every write path (API, import,
  scripts) is covered. Food references are stored as `source:sourceId` because ids differ between
  installations. Exported rows stay in `change_log` for 30 days.
- A new chain starts on the first run, each new year, when `JOURNAL_FORMAT` changes, or when the
  database doesn't know the chain on disk (e.g. after a restore). Old chains are kept.
- The host directory **must exist and belong to uid 1000** (the container's `node` user) before
  the container starts. Docker would otherwise create it as root and the job would fail.

### Restore from incremental backups

```sh
node scripts/restore.js /var/backups/nutrition restore.json          # newest chain
node scripts/restore.js /var/backups/nutrition restore.json --chain chain-2026-01-01
```

This needs only Node, no dependencies. Then import `restore.json` in the app under
_Einstellungen → Daten → Importieren_. On a fresh install, register a passkey first.

## 2. JSON export and import (manual)

_Einstellungen → Daten_. The export (`/api/export.json`) holds all user data: foods except the
Swiss DB, portions, recipes, favourites, entries, weights, targets and their history, settings.
Passkeys and sessions are never included. Import **replaces** the user data and keeps the Swiss
reference data. `BACKUP_VERSION` (currently 2) is checked; older files are accepted.

CSV exports exist for entries and weights (read-only, for spreadsheets).

## 3. SQLite file copies (safety net)

`node scripts/backup.js [dir] [keep]` makes an online-safe copy of the database file with
SQLite's backup API (default: `backups/` next to the DB, keeps 10). Useful before an update:

```sh
docker compose exec app node scripts/backup.js
```

## Off-site copies

All three write to the same machine. Copy `BACKUP_HOST_DIR` somewhere else regularly (rsync,
restic, your hoster's snapshots). See the [V-Server example](deployment/vserver.md#8-off-site-backups).

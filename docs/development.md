# Development

**Key files:** `package.json`, `.env.example`, `vite.config.ts`, `playwright.config.ts`

## Setup

Requirements: Node ≥ 22. Use **npm 11** for installs; npm 10 crashes on this dependency tree.

```sh
npx npm@11 install
cp .env.example .env
```

Then set these in `.env` for local use:

```sh
ORIGIN=http://localhost:5173
RP_ID=localhost
SETUP_TOKEN=dev-setup-token
DATABASE_PATH=data/nutrition.db
```

```sh
npm run import:swissfcd     # download + convert + load the Swiss food DB (idempotent)
npm run dev                 # http://localhost:5173
```

Open `http://localhost:5173/setup?token=dev-setup-token` to register a passkey. WebAuthn works on
`localhost` without HTTPS. To try the incremental backups locally, set
`BACKUP_DIR=data/incremental-backups`.

## Scripts

| Script                            | Purpose                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                     | Vite dev server                                            |
| `npm run build` / `npm start`     | production build / start (migrations + data load + server) |
| `npm run check`                   | `svelte-check` (TypeScript)                                |
| `npm run lint` / `npm run format` | Prettier + ESLint                                          |
| `npm run test:unit`               | Vitest                                                     |
| `npm run test:e2e`                | Playwright on iPhone, iPad, laptop, desktop and ultrawide  |
| `npm run import:swissfcd`         | Swiss food DB (`--download`, `--convert`, `--load`)        |
| `npm run recovery`                | one-time passkey registration link                         |
| `npm run backup`                  | online SQLite file copy                                    |
| `node scripts/restore.js <dir>`   | rebuild a backup JSON from incremental backups             |
| `npm run db:generate`             | Drizzle migration after a schema change                    |
| `npm run icons`                   | re-render PWA icons from `static/favicon.svg`              |

`npm run build` first regenerates `static/third-party-licenses.txt` and fails on a dependency
licence outside the allowlist in `scripts/dev/third-party-notices.mjs`.

## Testing

- **After every change:** `npm run check` and `npm run test:unit -- --run` (a few seconds).
- **Unit tests** belong to data, backup and calculation logic, where silent bugs lose data:
  `nutrition.spec.ts`, `slider.spec.ts`, `server/db/db.spec.ts`, `server/history.spec.ts`,
  `server/domain.spec.ts`, `server/foods/*.spec.ts`, `server/auth/auth.spec.ts`, `i18n.spec.ts`.
- **E2E** (`npm run test:e2e`) builds the app and runs Chromium with a virtual WebAuthn
  authenticator and a mock OFF server (`e2e/`). It's slow and runs only when explicitly asked
  for. `npm test` includes it.
- Tests never touch the network: food sources are tested against recorded fixtures.
- Real iOS behaviour (Face ID, camera) needs a manual check on a device.

## Working with Claude Code

`CLAUDE.md` holds the agent rules. In short: read the wiki page for the area first, keep
verification light (check + unit tests), never run E2E unprompted, update the docs page you
affected.

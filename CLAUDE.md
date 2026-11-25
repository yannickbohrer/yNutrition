# Working on yNutrition

Single-user nutrition tracker (SvelteKit 3, Svelte 5, SQLite via drizzle).

## Documentation

`docs/README.md` is the wiki index: a table from task to page. Before working on an area, read
only the page it points to (each lists its key files), not the whole folder. `DECISIONS.md` holds
the reasoning behind data, auth and UX choices; read the relevant section before changing them.

- When a change alters behaviour, configuration, the schema or deployment, update the matching
  page in the same change. Record new non-obvious choices in `DECISIONS.md`.
- The docs are public. Never write real hostnames, IP addresses, e-mail addresses, server paths or
  secrets into them; use `example.com` and placeholders. The owner's own deployment setup
  (`private/`, `deploy.sh`, `deploy.env*`) is gitignored and must not be referenced or copied into
  tracked files.

## Frontend work

Whenever you plan or change frontend code (Svelte components, routes, `src/app.css`):

- First load the `frontend-design:frontend-design` skill and apply it, both while planning and
  while building.
- Work within the existing iOS-style design system in `src/app.css` (tokens, `.group`/`.row`,
  `.segmented`, `.nav-row`, `.section-footer`). Don't introduce new palettes or typefaces.
- Optimise for a polished UI and an intuitive UX: plain sentence-case copy (German primary, English
  mirrored in `src/lib/i18n/`), visible keyboard focus, `prefers-reduced-motion` respected.
- Layout tiers (phone, iPad, desktop, ultra; see the top of `src/app.css`) and light/dark matter,
  but reason about them from the CSS. Don't take screenshots unless asked.

## Data

The user's history must never be lost. Never purge log entries or weights. Keep exports, backups
and imports in sync whenever the schema changes (`src/lib/server/backup.ts`, change journal).

## Testing

Single user and single developer: the user tests in production. Keep verification light.

- After a change: `npm run check` and `npm run test:unit -- --run` (a few seconds).
- Run the E2E suite (`npm run test:e2e`, all platforms) only when the user explicitly tells you
  to: never after a change, before a commit or before a push. `npm test` includes it, so don't use
  `npm test` either. Keep the suite itself; it covers every platform and is worth having on demand.
- No screenshots unless asked.
- Add unit tests for data, backup and calculation logic (where silent bugs would lose data).
  Don't add E2E tests for UI changes.

## Commands

`npm run check`, `npm run test:unit -- --run`, `npm run test:e2e`, `npm run lint`.

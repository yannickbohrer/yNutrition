# Working on yNutrition

Single-user nutrition tracker (SvelteKit 3, Svelte 5, SQLite via drizzle). Read `DECISIONS.md`
for the reasoning behind data, auth and UX choices before changing them.

## Frontend work

Whenever you plan or change frontend code (Svelte components, routes, `src/app.css`):

- First load the `frontend-design:frontend-design` skill and apply it, both while planning and
  while building.
- Work within the existing iOS-style design system in `src/app.css` (tokens, `.group`/`.row`,
  `.segmented`, `.nav-row`, `.section-footer`). Don't introduce new palettes or typefaces.
- Optimise for a polished UI and an intuitive UX: plain sentence-case copy (German primary, English
  mirrored in `src/lib/i18n/`), visible keyboard focus, `prefers-reduced-motion` respected.
- Check every layout tier (phone, iPad portrait/landscape, desktop, ultra; see the comment at the
  top of `src/app.css`) in light and dark mode.

## Data

The user's history must never be lost. Never purge log entries or weights. Keep exports, backups
and imports in sync whenever the schema changes (`src/lib/server/backup.ts`, change journal).

## Commands

`npm run check`, `npm run test:unit -- --run`, `npm run test:e2e`, `npm run lint`.

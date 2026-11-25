# Frontend

**Key files:** `src/app.css`, `src/lib/components/`, `src/routes/`, `src/lib/stores/`,
`src/lib/i18n/`

Svelte 5 with runes. When working with Claude Code, load the `frontend-design` skill first (see
`CLAUDE.md`).

## Design system

iOS-style, all in `src/app.css`: colour tokens (`--tint`, `--label-2`, `--kcal`, …), grouped lists
(`.group` / `.row`), `.segmented`, `.nav-row`, `.section-footer`. Use these. Don't add palettes or
typefaces. Light and dark come from `prefers-color-scheme`. Small text must pass WCAG AA (that's
why some iOS colours are darkened, see DECISIONS.md → UX).

## Layout tiers

Breakpoints live in `src/app.css` and are mirrored in `src/lib/stores/viewport.svelte.ts`.

| Tier    | Condition (simplified)          | Looks like                                     |
| ------- | ------------------------------- | ---------------------------------------------- |
| phone   | default                         | floating tab bar, bottom sheets, one column    |
| tablet  | ≥ 640 × 560, or ≥ 1000 wide     | centred form sheets, two-column Insights       |
| wide    | tablet + ≥ 900 wide + landscape | sidebar, Today split view, Settings split view |
| desktop | ≥ 1400 wide (landscape)         | two-column detail pages                        |
| ultra   | ≥ 1800 wide (landscape)         | third Today pane, three-column Insights        |

Layout is CSS. The JS flags only decide whether extra panes are mounted, so phones never render
hidden UI. iPad is the reference design: bigger screens add panes rather than stretching rows.

## Copy and i18n

German (Swiss spelling, no ß) is the source in `src/lib/i18n/de.ts`; `en.ts` must have the same
keys (checked by `i18n.spec.ts` and the type checker). Plain sentence case.

## Accessibility and motion

Visible keyboard focus everywhere. Swipe actions need a keyboard or hover alternative (entries
show a delete button on `(hover: hover) and (pointer: fine)`). Respect `prefers-reduced-motion`.

## Testing UI changes

`npm run check`. The E2E suite covers every tier but runs only on request (see
[Development](development.md#testing)). No new E2E tests for UI changes.

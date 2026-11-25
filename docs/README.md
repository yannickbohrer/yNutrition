# Documentation

This is the project wiki. Every page is short, covers one topic and starts with the files it
describes, so you (or Claude Code) can read only the page a task needs.

## Start here

| I want to …                                       | Read                                                       |
| ------------------------------------------------- | ---------------------------------------------------------- |
| Understand how the pieces fit together            | [Architecture](architecture.md)                            |
| Run the app locally, use the scripts, run tests   | [Development](development.md)                              |
| Change the schema, a table or stored data         | [Data model](data.md), then [Backups](backups.md)          |
| Touch export, import or the incremental backups   | [Backups](backups.md)                                      |
| Work on search, Open Food Facts, USDA or portions | [Food data](food-data.md)                                  |
| Work on passkeys, sessions, setup or recovery     | [Auth](auth.md)                                            |
| Change a page, a component or the styling         | [Frontend](frontend.md)                                    |
| Find out what has to run in production            | [Deployment: components](deployment/README.md)             |
| Deploy to a fresh server step by step             | [Deployment: example on a V-Server](deployment/vserver.md) |
| Know _why_ something is the way it is             | [DECISIONS.md](../DECISIONS.md) (the decision log)         |
| Check the licence terms of the food data          | [DATA_NOTICE.md](../DATA_NOTICE.md)                        |

## Rules that apply everywhere

- **User history is never lost.** Log entries and weigh-ins are never purged. Any schema change
  must keep export, import and the incremental backups in sync (see
  [Data model](data.md#changing-the-schema)).
- **Missing nutrient = unknown, never 0.**
- **German is the source language** for UI copy; English mirrors it in `src/lib/i18n/`.
- **Single user.** There are no accounts, roles or multi-tenancy, and none should be added by
  accident.

## Keeping the wiki useful

- Update the page for the area you changed in the same commit. If a page and the code disagree,
  the code wins: fix the page.
- Record the _why_ of a non-obvious choice in [DECISIONS.md](../DECISIONS.md), and the _what_
  and _how_ on the topic page.
- Keep pages focused: link to another page instead of repeating it.
- Never put real hostnames, IP addresses, e-mail addresses or secrets in these pages. Use
  `example.com` and placeholders.

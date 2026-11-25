# Deployment: what has to run

**Key files:** `Dockerfile`, `docker-compose.yml`, `.env.example`, `scripts/start.js`

This page describes every component a production install needs and how to set each one up,
independent of where you host it. For a complete walkthrough on a rented Linux server, see the
[V-Server example](vserver.md).

## Overview

| #   | Component            | Required             | What it is                                                        |
| --- | -------------------- | -------------------- | ----------------------------------------------------------------- |
| 1   | Domain name          | yes                  | a hostname (e.g. `nutrition.example.com`) pointing at your server |
| 2   | Reverse proxy + TLS  | yes                  | HTTPS in front of the app; passkeys don't work without it         |
| 3   | App container        | yes                  | Node 22 + SvelteKit, built from this repo's `Dockerfile`          |
| 4   | Database             | yes                  | SQLite file inside the app container's volume, no separate server |
| 5   | Swiss food data      | yes                  | downloaded from the FSVO while the image builds                   |
| 6   | Backup directory     | strongly recommended | host directory for the incremental backups                        |
| 7   | Off-site backup copy | strongly recommended | anything that copies the backup directory elsewhere               |
| 8   | Outbound internet    | yes                  | Open Food Facts (and USDA) at runtime, FSVO at build time         |
| 9   | USDA API key         | optional             | enables the USDA FoodData Central fallback                        |

```
Internet ──443──▶ reverse proxy (TLS) ──127.0.0.1:3000──▶ app container
                                                           ├─ volume: /data/nutrition.db (SQLite)
                                                           └─ bind:   /backups ◀── host backup dir ──▶ off-site copy
```

## 1. Domain name

Create a DNS `A` (and `AAAA` if you have IPv6) record for the hostname. Choose it carefully:
passkeys are bound to it (`RP_ID`), so moving to another hostname later means registering new
passkeys through the recovery link.

## 2. Reverse proxy with TLS

Any proxy works (Caddy, nginx, Apache, Traefik, a hoster's load balancer) if it:

- terminates **HTTPS** with a valid certificate for the hostname;
- forwards to the app's host port (default `127.0.0.1:3000`);
- **appends** the client IP to `X-Forwarded-For` and sets `X-Forwarded-Proto: https`. The app
  reads the last `X-Forwarded-For` hop (`XFF_DEPTH=1`), so exactly one proxy should sit in front
  of it. With more hops, raise `XFF_DEPTH` in `docker-compose.yml`;
- allows request bodies of **at least 50 MB** (backup imports). nginx needs
  `client_max_body_size 50m;`, Caddy has no limit by default.

Caddy does all of this with a two-line config and fetches certificates automatically, which is
why the V-Server example uses it.

## 3. App container

Built from the `Dockerfile` (two stages, `node:22-bookworm-slim`):

- **Build stage:** `npm ci`, `npm run build`, downloads and converts the Swiss food DB, prunes dev
  dependencies. Needs internet access, and more than 1 GB of RAM (add swap on small servers).
- **Runtime stage:** runs as the unprivileged `node` user (uid 1000) and listens on port 3000.
  Its health check calls `GET /api/health`.
- **Entrypoint** (`scripts/start.js`): applies migrations, loads the Swiss data, starts the server.
  Restarting the container is always safe.

`docker-compose.yml` runs it with `restart: unless-stopped`, a 384 MB memory limit, log rotation
and the proxy settings (`ADDRESS_HEADER`, `XFF_DEPTH`, `PROTOCOL_HEADER`, `BODY_SIZE_LIMIT`).

### Configuration (`.env`, next to `docker-compose.yml`)

| Variable             | Required | Meaning                                                                          |
| -------------------- | -------- | -------------------------------------------------------------------------------- |
| `ORIGIN`             | yes      | public URL exactly as the browser shows it, e.g. `https://nutrition.example.com` |
| `RP_ID`              | yes      | the hostname alone, e.g. `nutrition.example.com`                                 |
| `SESSION_SECRET`     | yes      | ≥ 32 random characters (`openssl rand -base64 48`); start fails otherwise        |
| `OFF_CONTACT_EMAIL`  | yes¹     | your contact address, sent to Open Food Facts in the User-Agent                  |
| `SETUP_TOKEN`        | no       | first-run token; leave empty and a random one is printed to the logs             |
| `PORT`               | no       | **host** port the container is published on (default 3000)                       |
| `BIND_ADDRESS`       | no       | host interface to publish on. `127.0.0.1` when the proxy runs on the same host   |
| `BACKUP_HOST_DIR`    | no       | host directory for incremental backups (default `/var/backups/nutrition`)        |
| `USDA_API_KEY`       | no       | free key from [fdc.nal.usda.gov](https://fdc.nal.usda.gov/api-key-signup)        |
| `TZ`                 | no       | container time zone (default `Europe/Zurich`), see the note below                |
| `SWISSFCD_URL_DE/EN` | no       | replacement download URLs after the FSVO publishes a new version                 |

¹ The app starts without it but logs a warning; Open Food Facts' API rules ask for it.

> **Bind address:** Docker's published ports bypass host firewalls such as `ufw`. If the proxy
> runs on the same machine, set `BIND_ADDRESS=127.0.0.1` so port 3000 is never reachable from the
> internet. Use `0.0.0.0` only when the proxy is on another machine and a firewall in front
> restricts the port.

> **Time zone:** the day boundary is currently fixed to Europe/Zurich in several places
> (`src/lib/dates.ts`), so `TZ` doesn't fully move it yet.

## 4. Database

SQLite in WAL mode at `DATABASE_PATH` (`/data/nutrition.db` in the container), stored in the
Docker volume `nutrition-data`. There's nothing to install or configure: the schema is created
and migrated on every start. Don't put the volume on a network file system (SQLite locking).
Only one app instance may use the file.

## 5. Swiss food data

The FSVO's files aren't in the repository. The image build downloads them, checks their SHA-256
and converts them; every start loads them into the database. If the FSVO moves the files, the
build fails with a hint: set `SWISSFCD_URL_DE` / `_EN` as build args or in `.env`. Because the
image contains converted FSVO data, don't publish built images without the FSVO's agreement (see
[DATA_NOTICE.md](../../DATA_NOTICE.md)).

## 6. Backup directory

Create it **before** the first start, owned by uid 1000:

```sh
sudo install -d -m 750 -o 1000 -g 1000 /var/backups/nutrition
```

The compose file refuses to create it (`create_host_path: false`), because a root-owned directory
would make every backup fail. How the backups work: [Backups](../backups.md).

## 7. Off-site copy

The backup directory lives on the same disk as the database. Copy it elsewhere on a schedule:
rsync to another machine, restic/borg to object storage, or your hoster's snapshots.

## 8. Network access

Inbound: only 80 and 443 to the proxy (plus SSH for you). Outbound HTTPS to
`world.openfoodfacts.org`, `search.openfoodfacts.org`, `api.nal.usda.gov` (if enabled) and, during
builds, the FSVO (`naehrwertdaten.ch`) and the npm registry.

## Operating it

| Task                     | Command (in the repo directory)                                                       |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Start / rebuild          | `docker compose up -d --build`                                                        |
| Logs (setup link)        | `docker compose logs -f app`                                                          |
| Health                   | `curl -fsS http://127.0.0.1:3000/api/health`                                          |
| Recovery link            | `docker compose exec app node scripts/recovery.js`                                    |
| DB copy before an update | `docker compose exec app node scripts/backup.js`                                      |
| Restore from backups     | `node scripts/restore.js /var/backups/nutrition restore.json`, then import in the app |

## Without Docker

Possible, but not tested as a deployment path: Node ≥ 22 and npm 11, then `npm ci`,
`npm run build`, `node scripts/import-swissfcd.js`, and run `NODE_ENV=production npm start` under
a process manager (e.g. systemd). In production the app doesn't read `.env`, so pass the
variables through the environment (systemd: `EnvironmentFile=`), plus the ones the compose file
would otherwise set: `DATABASE_PATH`, `BACKUP_DIR`, `ADDRESS_HEADER=x-forwarded-for`,
`XFF_DEPTH=1`, `PROTOCOL_HEADER=x-forwarded-proto` and `BODY_SIZE_LIMIT=50M`. Here `PORT` is the
port the server itself listens on.

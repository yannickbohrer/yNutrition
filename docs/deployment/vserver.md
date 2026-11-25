# Deployment example: a standard V-Server

> **This example assumes a standard V-Server (VPS):** a rented virtual machine with a fresh
> Debian 12 or Ubuntu 24.04, a public IPv4 address, root or sudo access over SSH and nothing else
> installed. Everything runs on this one machine. On other setups, take the components from
> [What has to run](README.md) and adapt the steps.

Placeholders used below. Replace them with your own values:

| Placeholder             | Meaning                                       |
| ----------------------- | --------------------------------------------- |
| `nutrition.example.com` | the hostname you'll use for the app           |
| `203.0.113.10`          | your server's public IP address               |
| `you@example.com`       | your contact e-mail (sent to Open Food Facts) |
| `deploy`                | the non-root user you work as on the server   |

Sizing: 1 vCPU, 2 GB RAM and 10 GB disk are plenty. With 1 GB RAM, add swap (step 2) or the
image build may be killed.

## 1. DNS

At your DNS provider, create an `A` record `nutrition.example.com → 203.0.113.10` (and `AAAA` for
IPv6). Check it from your computer before continuing, because the TLS certificate in step 5 needs
it:

```sh
dig +short nutrition.example.com
```

## 2. Prepare the server

Log in as root (or a sudo user), update, and create a working user:

```sh
apt update && apt full-upgrade -y
apt install -y git curl ufw unattended-upgrades
adduser deploy
usermod -aG sudo deploy
```

Copy your SSH key to the new user (from your computer: `ssh-copy-id deploy@203.0.113.10`) and log
in as `deploy` from now on.

Firewall: allow only SSH and web traffic.

```sh
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443
sudo ufw enable
```

Optional, for servers with 1 GB RAM:

```sh
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. Install Docker

Follow Docker's official guide for [Debian](https://docs.docker.com/engine/install/debian/) or
[Ubuntu](https://docs.docker.com/engine/install/ubuntu/) (it installs Docker Engine and the
Compose plugin), or use Docker's convenience script:

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy      # log out and back in afterwards
docker compose version              # check
```

## 4. Get the app and configure it

```sh
sudo mkdir -p /opt/nutrition && sudo chown deploy: /opt/nutrition
git clone <repository-url> /opt/nutrition
cd /opt/nutrition
cp .env.example .env
chmod 600 .env
```

Edit `.env` (`nano .env`) and set at least:

```sh
ORIGIN=https://nutrition.example.com
RP_ID=nutrition.example.com
PORT=3000
BIND_ADDRESS=127.0.0.1          # the proxy runs on this host: never expose 3000 directly
SESSION_SECRET=<output of: openssl rand -base64 48>
OFF_CONTACT_EMAIL=you@example.com
SETUP_TOKEN=                    # empty: a random one is printed on first start
USDA_API_KEY=                   # optional
TZ=Europe/Zurich
```

Create the backup directory, owned by the container's user (uid 1000):

```sh
sudo install -d -m 750 -o 1000 -g 1000 /var/backups/nutrition
```

## 5. Reverse proxy with HTTPS (Caddy)

Caddy fetches and renews a Let's Encrypt certificate on its own and sets the forwarding headers
the app expects.

```sh
sudo apt install -y caddy
```

(Distribution packages can lag behind; Caddy's [install page](https://caddyserver.com/docs/install)
has its own apt repository.) Replace `/etc/caddy/Caddyfile` with:

```
nutrition.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

```sh
sudo systemctl reload caddy
```

Until the app runs in step 6, Caddy answers with `502`, which is expected.

## 6. Build and start

```sh
cd /opt/nutrition
docker compose up -d --build        # first build takes a few minutes
docker compose ps                   # wait for "healthy"
curl -fsS http://127.0.0.1:3000/api/health    # {"ok":true}
```

## 7. Register your passkey

```sh
docker compose logs app | grep -A1 'No passkey'
```

Open the printed `https://nutrition.example.com/setup?token=…` link on your phone, register a
passkey with Face ID or Touch ID, and add the app to the home screen (Safari → Share → _Zum
Home-Bildschirm_). Then remove `SETUP_TOKEN` from `.env` if you set one; it stops working once a
passkey exists anyway.

## 8. Off-site backups

The app writes incremental backups to `/var/backups/nutrition` every day (see
[Backups](../backups.md)). Copy that directory off the server. A simple option is a nightly
rsync pulled from another machine you control:

```sh
# on the other machine, in its crontab (crontab -e):
30 3 * * * rsync -a --delete deploy@203.0.113.10:/var/backups/nutrition/ ~/nutrition-backups/
```

The directory belongs to uid 1000 with mode 750, so give `deploy` read access first (the `d:`
entry covers files created later):

```sh
sudo apt install -y acl
sudo setfacl -R -m u:deploy:rX -m d:u:deploy:rX /var/backups/nutrition
```

Alternatives: restic or borg to object storage, or your hoster's snapshot feature.

Test a restore once, so you know it works:

```sh
node scripts/restore.js ~/nutrition-backups /tmp/restore.json   # needs Node ≥ 22 only
```

## 9. Updates

```sh
cd /opt/nutrition
docker compose exec app node scripts/backup.js     # quick DB copy inside the volume
git pull
docker compose up -d --build
docker compose ps                                   # healthy again?
docker image prune -f                               # remove the old image
```

Migrations run automatically on start. Keep the OS patched (`unattended-upgrades` installed in
step 2 handles security updates).

## 10. When something goes wrong

| Symptom                                     | Likely cause and fix                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| Container exits: `SESSION_SECRET must be…`  | secret missing or shorter than 32 characters in `.env`                            |
| `docker compose up` fails on the bind mount | `/var/backups/nutrition` doesn't exist: create it (step 4)                        |
| Backups don't appear                        | directory not owned by uid 1000: `sudo chown -R 1000:1000 /var/backups/nutrition` |
| Build fails downloading the Swiss data      | the FSVO moved the files: set `SWISSFCD_URL_DE` / `_EN` (see `.env.example`)      |
| Build is killed                             | not enough RAM: add swap (step 2)                                                 |
| Passkey prompt fails or errors              | `ORIGIN` / `RP_ID` don't match the URL in the browser, or the page isn't on HTTPS |
| Caddy shows no certificate                  | DNS doesn't point at the server yet, or ports 80/443 are blocked                  |
| Locked out (lost every device)              | `docker compose exec app node scripts/recovery.js` prints a one-time link         |

Logs: `docker compose logs -f app` and `sudo journalctl -u caddy -f`.

# Deploying SplitLedger with PM2

This guide runs the project directly on a Linux host with PM2, no Docker.

Three pieces:

- **PM2** runs the API in cluster mode from the compiled bundle (`apps/api/dist`).
- **nginx** (installed on the host) serves the built web app from `apps/web/dist`, terminates TLS,
  and reverse-proxies `/api/` to the API on `127.0.0.1:4000`.
- **Postgres 16** is external — your own instance, reached through `DATABASE_URL`.

nginx is not optional here. The web app must be served from the **same origin** as the API: the
refresh cookie is `HttpOnly; Secure; SameSite=Strict` and its path is scoped to `/api/v1/auth`. Put
the SPA on one origin with `/api/` proxied and everything works with no CORS involved. Serving the
built files with `pm2 serve` instead would give the pages no `/api/` proxy, breaking the session —
use nginx.

---

## Prerequisites

| Requirement      | Notes                                                          |
| ---------------- | -------------------------------------------------------------- |
| Linux server     | Tested layout: `/srv/splitledger`, deployed as a non-root user |
| Node.js 22       | Matches `.nvmrc`. 20+ works                                    |
| pnpm             | `corepack enable` picks up the `packageManager` version        |
| Postgres 16      | Reachable from this host                                       |
| nginx            | Serving the SPA and proxying the API                           |
| A domain + DNS   | Pointing at this server, for TLS                               |
| SMTP credentials | Verification, password-reset and security emails               |
| ~1 GB RAM free   | For the build                                                  |

`@node-rs/argon2` ships prebuilt binaries, so no compiler toolchain is needed.

## Step 1 — Install Node, pnpm and PM2

With nvm (adjust to taste):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
corepack enable

npm install -g pm2
pm2 --version
```

Create the deploy user and clone location if the server is fresh:

```bash
sudo useradd --create-home --shell /bin/bash deploy
sudo mkdir -p /srv/splitledger && sudo chown deploy:deploy /srv/splitledger
```

Every command below runs as that user, and PM2 must run as the same user that owns the files.

## Step 2 — Get the code and build it

```bash
sudo -iu deploy
git clone <your-repo-url> /srv/splitledger
cd /srv/splitledger
git checkout v1.0.0
```

Deploy a tag, not a moving branch. Then install and build:

```bash
pnpm install --frozen-lockfile
pnpm build          # or: make build
```

A full install is required — the build needs the dev dependencies (TypeScript, Vite), and the API
needs its runtime dependencies at run time.

## Step 3 — Write the environment file

The API loads its configuration from **`.env` in the repository root** (`apps/api/src/load-env.ts`
resolves it relative to the compiled file). Keep it next to `package.json`:

```bash
cp .env.production.example .env
chmod 600 .env
```

Now edit `.env`:

- `NODE_ENV=production`
- `DATABASE_URL` — point it at your Postgres, e.g.
  `postgres://splitledger:secret@127.0.0.1:5432/splitledger`. Use `127.0.0.1`, not
  `host.docker.internal` (that name only means something inside Docker).
- `CORS_ORIGIN` and `APP_WEB_URL` — the public HTTPS origin, e.g.
  `https://splitledger.example.com`. `APP_WEB_URL` is used in email links, so a wrong value sends
  users to a broken page.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — generate both, and make them different:

  ```bash
  openssl rand -base64 48
  openssl rand -base64 48
  ```

- The `SMTP_*` values for your provider.

`NODE_ENV` is also forced to `production` by `ecosystem.config.cjs`, and `dotenv` never overrides a
variable that is already set — so the API runs in production mode regardless of what this file says.

## Step 4 — Run the migrations

Migrations are hand-written SQL, applied by `node-pg-migrate`. Run them once, before starting the
new code — never from inside the app, and never from two places at once:

```bash
pnpm --filter api migrate up
```

Check what is applied:

```bash
pnpm --filter api migrate status
```

## Step 5 — Start the API with PM2

[`ecosystem.config.cjs`](../ecosystem.config.cjs) is already in the repository. It runs
`apps/api/dist/index.js` in cluster mode.

```bash
cd /srv/splitledger
pm2 start ecosystem.config.cjs
pm2 list
pm2 logs --lines 50
```

You should see one line per worker:

```
{"level":30,"msg":"api listening on http://localhost:4000"}
```

`pm2 reload` is zero-downtime: PM2 restarts workers one at a time and waits for each to be
listening again. The API closes its database pool on `SIGTERM`/`SIGINT`, so in-flight requests
finish.

## Step 6 — Survive a reboot

```bash
pm2 save
pm2 startup systemd -u deploy --hp /home/deploy
```

`pm2 startup` prints a `sudo` command — run it. Then `pm2 save` records the current process list so
that same list comes back on boot. Run `pm2 save` again whenever the list changes.

## Step 7 — Configure nginx

Install nginx and create `/etc/nginx/sites-available/splitledger`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name splitledger.example.com;

    root /srv/splitledger/apps/web/dist;
    index index.html;

    server_tokens off;
    client_max_body_size 1m;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json application/manifest+json image/svg+xml;

    # Same origin as the SPA, so the refresh cookie is first-party and no CORS is involved.
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        add_header Cache-Control "no-store" always;
    }

    # The service worker must be revalidated, or a new deploy is never detected.
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    }

    location = /manifest.webmanifest {
        add_header Cache-Control "no-cache" always;
    }

    # Vite emits content-hashed filenames.
    location /assets/ {
        expires 1y;
    }

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache" always;
    }
}
```

Enable it and reload:

```bash
sudo ln -s /etc/nginx/sites-available/splitledger /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

nginx (running as `www-data`) must be able to read the build. `/srv/splitledger` and every directory
below it up to `dist` need `o+x`, and the files need `o+r`:

```bash
sudo chmod o+x /srv /srv/splitledger /srv/splitledger/apps /srv/splitledger/apps/web
```

## Step 8 — Firewall the API port

The API binds every interface (`PORT` in `.env`), so without a firewall rule port 4000 would be
reachable from the internet, bypassing nginx and TLS. That would let anyone talk to the API over
plain HTTP, and `Secure` cookies would be dropped.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw deny 4000
sudo ufw enable
```

Only nginx should reach the API, over loopback.

## Step 9 — TLS

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d splitledger.example.com
```

Certbot rewrites the server block to add the `443` listener and an HTTP redirect, and installs a
renewal timer. **This step is required**: with `NODE_ENV=production` the refresh cookie is marked
`Secure`, and over plain HTTP the browser drops it — login appears to succeed and then immediately
forgets the session.

## Step 10 — Verify

```bash
curl -fsS https://splitledger.example.com/api/v1/health
# {"data":{"status":"ok"}}

curl -fsSI https://splitledger.example.com/sw.js | head -1
pm2 list
```

Then in a browser:

1. Register an account and confirm the verification email arrives.
2. Log in, create an account with parts, make a deposit.
3. Reload the page — the session must survive, which proves the refresh cookie round-trips.
4. DevTools → Application → Cookies: `sl_refresh` is `HttpOnly`, `Secure`, `SameSite=Strict`.

---

## Day-2 operations

### Deploying a new version

```bash
cd /srv/splitledger
git fetch --tags && git checkout v1.1.0

pnpm install --frozen-lockfile
pnpm build
pnpm --filter api migrate up     # before the new code starts
pm2 reload ecosystem.config.cjs
pm2 list
```

`pm2 reload` keeps serving during the swap. Always build before reloading: the running workers keep
using the old bundle until they are replaced.

nginx needs no change for an app deploy, but if you changed `apps/web/nginx.conf` (the container
variant) remember this host config is separate.

### Rolling back

```bash
git checkout v1.0.0
pnpm install --frozen-lockfile
pnpm build
pm2 reload ecosystem.config.cjs
```

Database: roll back one migration at a time, only if it is reversible (every
`apps/api/migrations/*.sql` ships an `up`/`down` pair) and no data written since depends on it. Take
a backup first:

```bash
pg_dump "$DATABASE_URL" -Fc -f "/var/backups/splitledger-$(date +%F).dump"
pnpm --filter api migrate down
```

### Logs and rotation

```bash
pm2 logs --lines 200          # follow all workers
pm2 logs splitledger-api --err
pm2 flush                     # truncate
```

PM2 does not rotate by default, so install the rotation module once:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

The API logs structured JSON via `pino` and never logs balances or tokens, so its output is safe to
ship elsewhere.

### Monitoring

```bash
pm2 status                 # health and restart count
pm2 monit                  # live CPU/memory
pm2 describe splitledger-api
```

Watch the restart counter (`↺`). A number climbing on its own means the app is crashing and PM2 is
restarting it — read `pm2 logs` for the reason.

### What to know about cluster mode

- **Rate limits are per worker and in memory.** `express-rate-limit` keeps counters in each process,
  so with `instances: 2` the effective limit is twice the configured value, and a restart resets it.
  Two workers is a deliberate choice for this app; raising it weakens rate limiting further.
- **Each worker opens its own Postgres pool** (10 connections by default). Two workers means up to 20
  connections. Keep `instances` well below the database's `max_connections`.
- **Migrations never run in the app.** They are a one-off command, so workers cannot race.
- The API trusts exactly one proxy hop (`app.set("trust proxy", 1)` in `apps/api/src/app.ts`), which
  is what keeps per-IP rate limiting correct behind nginx. Don't add another proxy without updating
  that number.

---

## Troubleshooting

| Symptom                                                                   | Cause                                                                | Fix                                                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Login succeeds, then the user is logged out on the next request           | Not on HTTPS, so the `Secure` refresh cookie is dropped              | Finish [Step 9](#step-9--tls)                                                             |
| nginx returns 502 on `/api/`                                              | The API is not listening, or is on another port                      | `pm2 list`, `pm2 logs`, and check `PORT` in `.env` matches the `proxy_pass`               |
| Every API call returns 500                                                | The database is unreachable                                          | Verify `DATABASE_URL`; `pg_isready -h 127.0.0.1`                                          |
| The API exits immediately with `Invalid environment configuration`        | A missing or too-short variable                                      | The message names it; fix `.env` and `pm2 restart ecosystem.config.cjs`                   |
| The JS bundle is ~2x the expected size, React dev warnings in the console | The bundle was built with `NODE_ENV=development`, which Vite honours | Rebuild with `NODE_ENV` unset or `production`. `ecosystem.config.cjs` only covers runtime |
| PM2 processes gone after a reboot                                         | The process list was never saved                                     | `pm2 save` (after `pm2 startup`)                                                          |
| `↺` climbing on its own                                                   | The app is crash-looping                                             | `pm2 logs --err --lines 100`                                                              |
| Browser 404s a deep link                                                  | nginx is not doing the SPA fallback                                  | Confirm the `location /` block with `try_files`                                           |
| The PWA keeps serving an old build                                        | A stale `sw.js`                                                      | Config sends `no-store` for it; hard-reload once                                          |
| nginx 403 on the web root                                                 | nginx cannot read `/srv/splitledger/apps/web/dist`                   | Fix the directory permissions in [Step 7](#step-7--configure-nginx)                       |

---

## Security checklist

- [ ] `.env` is `chmod 600` and never committed; it lives at the repository root.
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are long, random and different.
- [ ] The site is HTTPS-only; HTTP redirects to HTTPS.
- [ ] Port `4000` is blocked by the firewall — only nginx reaches the API.
- [ ] Postgres is not exposed to the internet.
- [ ] Backups run and have been restore-tested.
- [ ] `pm2 save` has been run, and `pm2 list` shows the API online after a reboot.
- [ ] `pm2-logrotate` is installed.

---

## Docker alternative

If the host has Docker, the container setup in [`deployment.md`](./deployment.md) avoids installing
Node, pnpm and PM2 at all. Both paths use the same `.env` values and the same migration command.

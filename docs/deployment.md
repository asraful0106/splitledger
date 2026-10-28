# Deploying SplitLedger to production

This is the step-by-step guide for deploying the stack with Docker Compose.

- **`api`** — the Express API (`apps/api/Dockerfile`), listening on `:4000`, **not published** to the
  host. It is reachable only from the compose network.
- **`web`** — nginx serving the built React app on `:80` (`apps/web/Dockerfile`) and reverse-proxying
  `/api/` to `api:4000`. This port is published (`WEB_PORT`, default `8080`).
- **Database** — **external**. There is no Postgres service in `docker-compose.yml`; the API reaches
  Postgres through `DATABASE_URL`.

Because nginx serves the app and the API under one origin, the browser makes same-origin requests:
no CORS preflight, and the `httpOnly` refresh cookie (`SameSite=Strict`) is sent as expected.

---

## Prerequisites

| Requirement                       | Notes                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Docker Engine 24+ with Compose v2 | `docker compose version` must work                                                                                           |
| A Postgres 16 database            | Managed (RDS, Neon, Supabase…), or self-hosted on the host/another VM                                                        |
| A TLS-terminating proxy           | **Required.** See [Step 7](#step-7--terminate-tls). The refresh cookie is `Secure` in production, so plain HTTP breaks login |
| A DNS record                      | e.g. `splitledger.example.com` → this server                                                                                 |
| An SMTP account                   | Verification, password-reset and security emails are sent with it                                                            |
| 2 GB RAM                          | Two images, one build                                                                                                        |

> The database must be reachable **from inside the containers**. For a Postgres running on the Docker
> host itself, use `host.docker.internal` — the compose file already maps it via `extra_hosts`.
> For a Postgres in another compose stack, put both on a shared external network and use its service
> name instead.

---

## Step 1 — Get the code onto the server

```bash
git clone <your-repo-url> /srv/splitledger
cd /srv/splitledger
```

Deploy a tag or commit rather than a moving branch:

```bash
git checkout v1.0.0
```

## Step 2 — Make sure the database exists

If you are using a managed Postgres, create the database and keep its connection string.

If Postgres runs on this host, the Makefile can create it (needs the local `psql` client):

```bash
make env            # creates .env from .env.example
$EDITOR .env        # set DATABASE_URL to your real database
make db-ping        # confirms the connection works
make db-create      # creates the database if it does not exist
```

## Step 3 — Create the production environment file

```bash
cp .env.production.example .env.production
```

Fill in every value. The API refuses to boot if a required variable is missing or invalid, and says
which one — read the error from `docker compose logs api`.

**Generate the two JWT secrets properly.** Both must be at least 16 characters and must differ:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
```

Set `CORS_ORIGIN` and `APP_WEB_URL` to the **public HTTPS origin**, e.g.
`https://splitledger.example.com`. `APP_WEB_URL` is used for the links inside verification and
password-reset emails, so a wrong value sends users to a broken link.

`.env.production` holds secrets — it is git-ignored. `chmod 600 .env.production`.

## Step 4 — Build the images

```bash
docker compose build
```

`VITE_API_BASE_URL` is baked into the web bundle at build time and defaults to `/api/v1`, which is
correct because nginx proxies the API on the same origin. Only override it if the API lives on a
different origin:

```bash
VITE_API_BASE_URL=https://api.example.com/api/v1 docker compose build web
```

## Step 5 — Run the migrations

Migrations are hand-written SQL applied by `node-pg-migrate` from inside the API image. Run them
**before** starting the new code, and never from two places at once.

```bash
docker compose run --rm api \
  node node_modules/node-pg-migrate/bin/node-pg-migrate.js -m migrations -j sql up
```

Check what would run without applying it:

```bash
docker compose run --rm api \
  node node_modules/node-pg-migrate/bin/node-pg-migrate.js -m migrations -j sql status
```

> `docker compose run` starts the `api` service's dependencies only; it does not touch the running
> containers. The command above must be run from the repository root.

## Step 6 — Start the stack

```bash
docker compose up -d
docker compose ps          # both services should become "healthy"
```

The `web` container waits for the API healthcheck (`depends_on: service_healthy`), so the first
request never lands on an API that is still booting.

To publish the web app on a different port, set it before starting:

```bash
WEB_PORT=80 docker compose up -d web
```

## Step 7 — Terminate TLS

**Do not skip this.** With `NODE_ENV=production` the API sets `Secure` on the refresh cookie, and
`SameSite=Strict`. Over plain HTTP the browser silently drops it, so login appears to succeed and
then immediately forgets the session.

Put a TLS terminator in front of the published `web` port. With Caddy on the same host:

```
# /etc/caddy/Caddyfile
splitledger.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:8080
}
```

`caddy reload --config /etc/caddy/Caddyfile` — Caddy obtains and renews the certificate
automatically. nginx, Traefik or a cloud load balancer work equally well; forward to `web:80` (or
`127.0.0.1:$WEB_PORT` from the host) and pass the request through unchanged.

The API trusts exactly one proxy hop (`app.set("trust proxy", 1)`), which is what keeps per-IP rate
limiting accurate behind nginx. Keep the API port unpublished — it is not meant to be reachable
directly.

## Step 8 — Verify the deployment

```bash
# Through the public origin
curl -fsS https://splitledger.example.com/api/v1/health
# {"data":{"status":"ok"}}

# The SPA shell and the service worker
curl -fsSI https://splitledger.example.com/ | head -1
curl -fsSI https://splitledger.example.com/sw.js | head -1
```

Then, in a browser:

1. Register a new account.
2. Confirm the verification email arrives (if not, check the SMTP values and the API logs).
3. Log in, create an account with parts, and make a deposit.
4. Reload the page — the session must survive, which proves the refresh cookie round-trips.
5. Open DevTools → Application → Cookies: `sl_refresh` must be `HttpOnly`, `Secure`, `SameSite=Strict`.

---

## Day-2 operations

### Deploying a new version

```bash
cd /srv/splitledger
git fetch --tags && git checkout v1.1.0

docker compose build
docker compose run --rm api \
  node node_modules/node-pg-migrate/bin/node-pg-migrate.js -m migrations -j sql up
docker compose up -d
docker compose ps
```

Migrations run first so the old code never sees a schema that is ahead of it. Stop here if a
migration fails and read its output — do not start the new containers.

### Rolling back

Code: check out the previous tag, rebuild, `docker compose up -d`.

Database: roll back one migration at a time. Only do this if that migration is reversible (all
`apps/api/migrations/*.sql` files ship an `up`/`down` pair) **and** no data written since the deploy
depends on it:

```bash
docker compose run --rm api \
  node node_modules/node-pg-migrate/bin/node-pg-migrate.js -m migrations -j sql down
```

Take a fresh backup first. Never roll back across a migration that has been in production for a
while without checking what it did.

### Backups

The database is the only stateful part of this stack — image containers hold nothing. Back it up on
the database host:

```bash
pg_dump "$DATABASE_URL" -Fc -f "/var/backups/splitledger-$(date +%F).dump"
```

Restore with `pg_restore -d "$DATABASE_URL" --clean --if-exists <file>`. Verify a restore on a
scratch database at least once, and keep backups off the machine that runs Postgres.

### Logs

```bash
docker compose logs -f --tail=200 api
docker compose logs -f --tail=200 web
```

Both services use the `json-file` driver capped at 3 × 10 MB, so logs cannot fill the disk. The API
emits structured JSON via `pino`. It never logs money balances or tokens, so logs are safe to ship
elsewhere.

### Restarting

`restart: unless-stopped` brings both containers back after a reboot or crash. The API handles
`SIGTERM` by draining in-flight requests and closing the pool. `docker compose restart api` is safe
at any time — it holds no state and reconnects to the database on demand.

---

## Troubleshooting

| Symptom                                                                             | Cause                                                           | Fix                                                                                        |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Login succeeds, then the user is logged out on the next request                     | Page is not on HTTPS, so the `Secure` refresh cookie is dropped | Complete [Step 7](#step-7--terminate-tls)                                                  |
| `Invalid environment configuration: DATABASE_URL is required` (or another variable) | Missing key in `.env.production`                                | Add it, then `docker compose up -d --force-recreate api`                                   |
| `web` stays `created`, never starts                                                 | The `api` healthcheck never passes                              | `docker compose logs api`; usually a bad env value or an unreachable database host         |
| Every user shares one rate-limit bucket                                             | A second proxy hop was added in front of nginx                  | Set `trust proxy` in `apps/api/src/app.ts` to the number of trusted hops (currently `1`)   |
| Emails never arrive, API logs `mail send failed`                                    | Wrong SMTP host/credentials, or the provider blocks the port    | Re-check `SMTP_*` in `.env.production`; port 587 with `SMTP_SECURE=false` is the usual fix |
| `migration … is already running`                                                    | Two migration commands overlapped                               | Wait for the lock to clear in `pgmigrations`, then re-run                                  |
| PWA keeps serving an old build                                                      | Browser cached `sw.js`                                          | nginx sends `no-store` for it; hard-reload once to clear an already-poisoned cache         |
| `port is already allocated`                                                         | `WEB_PORT` is in use                                            | `WEB_PORT=8080 docker compose up -d web`                                                   |

To inspect the API container without the internet:

```bash
docker compose exec api sh
docker compose exec api node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>r.text()).then(console.log)"
```

---

## Security checklist

- [ ] `NODE_ENV=production` is set (the API forces it in compose).
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are long, random, and different.
- [ ] `.env.production` is `chmod 600` and never committed.
- [ ] The site is served over HTTPS only.
- [ ] The API port (`4000`) is not published to the host.
- [ ] Postgres is not exposed to the internet; only this host can reach it.
- [ ] Database backups run and have been restore-tested.
- [ ] `docker compose ps` shows both services healthy.

---

## Running without Docker

For local development, or a host where Docker is not available, the root `Makefile` drives the same
stack natively — see the "Getting started" section of the [README](../README.md) and `make help`.

```bash
make env        # create .env
make install    # pnpm install
make db-create  # create the database
make migrate    # apply migrations
make dev        # api + web dev servers
```

For a production-like run without Docker, build and start the compiled output instead:

```bash
make build
make start      # built API + a static preview of the built web app
```

The API needs a reachable Postgres and valid secrets in `.env` in both cases.

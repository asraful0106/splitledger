# SplitLedger

A personal-finance **tracking** platform for people in Bangladesh who juggle multiple bank
accounts. Each account's deposits are automatically split by percentage into named "parts"
(e.g. Spending 60%, Savings 25%, Tax reserve 15%) and tracked. A user can also deposit into a
single part after acknowledging a warning. Withdrawals are tracked too.

> This app **does not move real money** and has **no bank integration**. It is a ledger the user
> keeps in sync with their real bank accounts. Never build features that imply otherwise.

The full product spec, rules, and roadmap live in [`.clude/CLAUDE.md`](./.clude/CLAUDE.md).

## Stack

- **Monorepo**: pnpm workspaces — `apps/api`, `apps/web`, `packages/shared`.
- **Language**: TypeScript everywhere, `strict: true`.
- **Backend**: Node.js 20+, Express, PostgreSQL 16, `pg`, `node-pg-migrate`, `zod`, `pino`.
- **Frontend**: React 18 + Vite + React Router, TanStack Query, React Hook Form, Tailwind CSS v4.
- **Money**: integer paisa (`bigint` in TS, `BIGINT` in Postgres). Percentages are basis points.

## Getting started

You need Node 20+, pnpm, and a **Postgres 16 database you can reach** — the project does not ship a
database container, `DATABASE_URL` points at your own Postgres (local, or managed).

```bash
pnpm install
make env                      # copies .env.example to .env
# edit .env: DATABASE_URL and the two JWT secrets
make db-create                # create the database (needs the psql client)
make migrate                  # run migrations
make dev                      # api + web together
```

- API: http://localhost:4000/api/v1/health
- Web: http://localhost:5173

Run `make help` for every target. Since there is no mail server in the stack, run one locally to see
verification and reset emails:

```bash
docker run --rm -p 1025:1025 -p 8025:8025 axllent/mailpit
```

The defaults in `.env.example` (`SMTP_HOST=localhost`, `SMTP_PORT=1025`) match it, and its UI is on
http://localhost:8025. The API never blocks on email, so the app works without it.

## Commands

The `Makefile` wraps the common tasks; the raw `pnpm` scripts work too.

```bash
make dev              # api + web together          pnpm dev
make build            # build api + web            pnpm build
make test             # all tests                  pnpm test
make lint             # eslint                     pnpm lint
make typecheck        # tsc --noEmit               pnpm typecheck
make verify           # lint + typecheck + test
make migrate          # apply migrations           pnpm --filter api migrate up
make migrate-create name=<name>                    # pnpm --filter api migrate create <name>
make start            # run the built output (no Docker)
make icons            # regenerate the PWA icons
```

Always run `make verify` before declaring a task done.

## Deployment

Two supported paths. Both run against an **external Postgres**, and on both the built web app is
served by nginx that also proxies `/api/` — so the app and the API share one origin and the refresh
cookie stays first-party.

- **Docker** — [docs/deployment.md](./docs/deployment.md). Two images; nginx runs in a container.
- **PM2 on a host** — [docs/deployment-pm2.md](./docs/deployment-pm2.md). PM2 runs the API in
  cluster mode via [`ecosystem.config.cjs`](./ecosystem.config.cjs); system nginx serves the web app.
- **Local machine, under a subpath** — [docs/deployment-local.md](./docs/deployment-local.md). The
  same two images published on ports `8080`/`4001`, fronted by an nginx you already run, serving
  `/ap/splitledger/` next to another site.

Hosting under a subpath needs a build that knows its base:

```bash
VITE_BASE_PATH=/ap/splitledger/ pnpm --filter web build   # default is /
```

That value also drives the router basename, the PWA `start_url`/`scope` and the service worker
fallback. The API is deliberately **not** moved under the subpath — the refresh cookie's
`Path=/api/v1/auth` has to match the browser's requests.

Docker, short version:

```bash
cp .env.production.example .env.production   # then fill in real values
docker compose build
docker compose run --rm api \
  node node_modules/node-pg-migrate/bin/node-pg-migrate.js -m migrations -j sql up
docker compose up -d
```

PM2, short version (see the doc for the nginx, TLS and firewall steps):

```bash
pnpm install --frozen-lockfile && pnpm build
pnpm --filter api migrate up
pm2 start ecosystem.config.cjs && pm2 save
```

Production requires HTTPS on either path: the refresh cookie is `Secure`, so plain HTTP silently
drops the session.

## Progress

See [PROGRESS.md](./PROGRESS.md) for the phase plan and current status.

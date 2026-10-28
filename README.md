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

Production runs as two containers — nginx serving the built web app and proxying `/api/` to the API —
against an external Postgres. See [docs/deployment.md](./docs/deployment.md) for the full
step-by-step guide, or read the short version in [`docker-compose.yml`](./docker-compose.yml):

```bash
cp .env.production.example .env.production   # then fill in real values
docker compose build
docker compose run --rm api \
  node node_modules/node-pg-migrate/bin/node-pg-migrate.js -m migrations -j sql up
docker compose up -d
```

Production requires HTTPS: the refresh cookie is `Secure`, so plain HTTP silently drops the session.

## Progress

See [PROGRESS.md](./PROGRESS.md) for the phase plan and current status.

# SplitLedger — Progress

Live tracker for build progress. Source of truth for rules and architecture:
[`.clude/CLAUDE.md`](./.clude/CLAUDE.md). Update this file after every completed task.

## Status

**Current phase: Phase 5 — Insights (complete)**

| Phase | Description | Status |
|---|---|---|
| 0 | Foundations: monorepo, tooling, docker-compose, CI, shared `split()` + tests | Done |
| 1 | Auth: register, verify email, login, refresh rotation, forgot/reset, rate limits, audit log | Done (API + web UI) |
| 2 | Accounts & parts: CRUD, percentage editor with live 100% validation | Done (API + web UI) |
| 3 | Ledger: split deposit, single-part deposit + warning, withdrawal, reversal, history | Done (API + web UI) |
| 4 | Frontend polish: animations, bottom sheets, empty/loading states, PWA install | Done |
| 5 | Insights: monthly summaries, CSV export, fiscal-year reports, alerts | Done (API + web UI) |
| Later | TOTP 2FA, Bangla i18n, multi-currency, recurring income templates | Multi-currency done; rest not started |

## Phase 0 checklist

- [x] pnpm monorepo (`apps/api`, `apps/web`, `packages/shared`)
- [x] Strict TypeScript base config + per-package configs
- [x] ESLint (flat) + Prettier
- [x] `shared`: `split()` (largest-remainder) + `formatMoney()` with unit + property tests
- [x] `api`: Express skeleton, env validation, pino logger, pg pool, health route, error handler
- [x] `api`: `node-pg-migrate` wired to the `migrate` script, migrations dir
- [x] `web`: Vite + React shell with Tailwind CSS v4
- [x] `docker-compose.yml`: Postgres 16 + Mailpit _(replaced in Production deploy — now an app-only
      compose; the database is external)_
- [x] GitHub Actions CI (lint, typecheck, test, audit) with Postgres service
- [x] `.env.example`, README, docs/conventions.md
- [x] `git init`

## Phase 1 checklist (API)

- [x] Migrations: `users`, `email_tokens`, `refresh_tokens`, `audit_log` (reversible `.sql`)
- [x] `packages/shared`: auth zod schemas (register/login/verify/forgot/reset)
- [x] Layering: routes → controllers → services → repositories (casing mapped at repo boundary)
- [x] Passwords: argon2id (`@node-rs/argon2`), min 10, common-password denylist
- [x] Access token: JWT (HS256, `jose`), `Authorization: Bearer`; `requireAuth` middleware
- [x] Refresh token: opaque, hashed at rest, `family_id`, rotation, reuse→family revoke + audit
- [x] Refresh cookie: `httpOnly; SameSite=Strict; Secure` in prod, path-scoped; CSRF header check
- [x] Email: nodemailer + SMTP (Mailpit in dev), templates, `sendMail` w/ retry, never blocks
- [x] Endpoints: register, verify-email, login, refresh, logout, logout-all, me, forgot/reset
- [x] Rate limiting: `/auth` 30, login 10, forgot 5 per 15 min (per-app instances)
- [x] Audit log for register/verify/login/failed-login/reset/token-reuse
- [x] Tests: 38 API tests on a real Postgres (register, verify, login, rotation, reuse,
      reset, isolation, rate limit, audit); smoke-tested against Mailpit

## Phase 1 checklist (web auth UI)

- [x] API client: `credentials: "include"`, CSRF header, `ApiError`, **silent refresh on 401**
      via a single in-flight promise, retry once
- [x] In-memory access token store (never localStorage); session restored on load from cookie
- [x] `AuthProvider` + `useAuth`; `ProtectedRoute` / `PublicOnlyRoute` guards
- [x] Pages: login, register, verify-email (auto-submits `?token`), forgot, reset, protected Home, 404
- [x] Forms: React Hook Form + shared zod schemas; inline errors; password show/hide; generic
      auth error messages
- [x] Mobile baseline: `viewport-fit=cover`, safe-area insets, 16px inputs, `100dvh`,
      no tap highlight, `touch-action: manipulation`, hover gated on `(hover: hover)`
- [x] Motion: CSS transitions + `@starting-style` only; `transform`/`opacity`; strong `--ease-out`;
      press `scale(0.97)`; `prefers-reduced-motion` / `-transparency` / `-contrast` honoured
- [x] Tests: 9 web tests (api 401→refresh→retry, shared refresh, error mapping; routing redirect,
      session restore, login validation + success, register success)
- [ ] Verify on real hardware (sticky hover, tap highlight, safe areas, keyboard) — needs a phone

## Phase 2 checklist (accounts & parts)

- [x] Migrations: `accounts`, `parts` (last4 CHECK, `percentage_bp` 0..10000 CHECK, partial unique
      active part name, reversible `.sql`)
- [x] `packages/shared`: account/part zod schemas + `sumPercentageBp` + `PARTS_TOTAL_BP`
- [x] API: `GET/POST /accounts`, `GET/PATCH /accounts/:id`, `POST /accounts/:id/archive`,
      `GET/PUT /accounts/:id/parts` — layering + `user_id` scoping
- [x] Default `General` 100% part on create; optional explicit split
- [x] 100% invariant enforced in the service **and** re-verified inside the DB transaction
- [x] Removed parts soft-archived (history-safe); part ids scoped to the account
- [x] Audit events: `account_created`, `account_updated`, `account_archived`, `parts_updated`
- [x] Balances reported as `0` (accurate until Phase 3 adds entries); money over the wire is a string
- [x] Tests: 20 API tests (CRUD, isolation across every endpoint, soft-archive, sum/range/empty
      rejections, cross-account part id, audit) + 6 web tests (PartEditor live total, Home
      empty/list, create-account flow)
- [x] Web: Home (total + account cards + empty/loading/error), Add account, account detail with
      segmented bar, split editor with **live 100% validation**, archive with confirm

## Phase 3 checklist (ledger)

- [x] Migrations: `transactions`, `transaction_entries` (+ deferred **balance constraint trigger**,
      idempotency unique index, one-reversal-per-transaction unique index, history index)
- [x] `packages/shared`: deposit/withdraw/history zod schemas, `parseMajorToMinor`
- [x] `POST /accounts/:id/deposits` — split via `shared.split()` (snapshots stored) or single part
      with `acknowledgedWarning` (else **409 `warning_required`** + details)
- [x] `POST /accounts/:id/withdrawals` — per-part amounts, balance-checked (**400
      `insufficient_balance`**, nothing written)
- [x] `POST /transactions/:id/reverse` — opposite-type transaction, negated entries, original
      untouched; **409 `already_reversed`**
- [x] `GET /accounts/:id/transactions` — keyset cursor pagination + type/part/date filters
- [x] `GET /accounts/:id/summary`; account views now carry **real derived balances**
- [x] Account `FOR UPDATE` lock serializes money writes; optional `Idempotency-Key` (concurrent
      duplicates deduped by the unique index)
- [x] Audit: `transaction_created`, `transaction_reversed`
- [x] Tests: 32 ledger API tests (split sums, single-part warning, amount guards, archived account,
      idempotency incl. concurrent, concurrency, overdraw, reversal + original untouched, DB trigger
      rejects unbalanced entries, pagination/filters, summary reconciliation, isolation) + 4 web
      tests (live split preview, warning gate, overdraw block, history + reverse)
- [x] Web: deposit (live split preview + single-part warning), withdraw (per-part, capped),
      history (filters, load more, reverse with confirm), account detail actions + recent activity

## Phase 4 checklist (frontend polish)

- [x] `Sheet`: portal + scrim, drag-to-dismiss (distance **or** velocity past an 8px hysteresis),
      rubber-banding, Escape, focus move/trap/restore, body scroll lock, safe-area padding
- [x] Deposit and withdraw moved into sheets on the account page (routes removed); scrolling field
      area with a pinned action row so the CTA is always reachable
- [x] Motion pass: tokens (`--ease-drawer` added), press feedback, screen entry, list stagger,
      animated `SegmentedBar` (`scaleX`, never `width`), deposit success moment — all
      transform/opacity with `prefers-reduced-motion` variants
- [x] PWA: `vite-plugin-pwa` manifest + service worker (precache shell, **API never cached**),
      update prompt, iOS meta/touch icon
- [x] Dependency-free icon generator (`scripts/generate-icons.mjs`) → 192/512/maskable/apple-touch
- [x] Empty/loading/error states audited across screens
- [x] Tests: Sheet (open/focus/Escape/scrim/drag threshold/spring-back), deposit preview +
      single-part gate, withdraw overdraw block, history reverse, SegmentedBar (+27 web tests total)
- [x] Browser-verified: SW registered and activated, update prompt → reload, sheet open/Escape/drag,
      live preview, success moment, phone viewport (no horizontal overflow, CTA visible),
      reduced motion (opacity-only, drag disabled)

## Phase 5 checklist (insights)

- [x] Migrations: `parts.low_balance_threshold_minor` (+ CHECK) and
      `transactions (user_id, occurred_at DESC)`; reversible
- [x] Shared `insights/periods.ts`: Dhaka-correct month and **July–June fiscal-year** ranges,
      labels (`2026–27`), custom inclusive ranges — with unit tests
- [x] `GET /insights/summary?from&to[&accountId]` — totals, per-part inflow/outflow/net, monthly
      series grouped in Asia/Dhaka
- [x] `GET /insights/alerts` — per-part low-balance alerts (threshold < balance rule)
- [x] `GET /insights/export.csv` — one row per entry, RFC-4180 escaping, UTF-8 BOM, signed major +
      `amount_minor`, Dhaka timestamps, Dhaka-dated filename
- [x] Threshold editing on the account page (`PUT .../parts`); omitted ⇒ preserved, `null` ⇒ cleared
- [x] Web: Insights page (month / last month / fiscal year / custom presets, account filter, summary
      cards, part breakdown, CSS-only trend bars, alerts, CSV download); Home shows an alert count
- [x] Tests: 17 API insights/threshold tests + 8 shared period tests + 5 web tests
- [x] Browser-verified: October totals match the ledger exactly (in ৳136.00 / out ৳15.00 / net
      ৳121.00), fiscal-year label + range request, alert appears on Insights and Home, CSV export
      request fires and the file content/headers are correct

## Multi-currency checklist

- [x] Shared registry: 10 curated 2-decimal currencies with symbol + locale; `formatMoney` is
      currency-aware (per-locale formatter cache, safe fallback for unknown codes)
- [x] `createAccount`/`updateAccount` accept any supported currency; DB `CHECK` constraint
- [x] **Currency lock**: changing the currency after the first transaction ⇒ 400 `currency_locked`;
      `hasTransactions` exposed on the account view
- [x] Ledger `TransactionView.currency`; insights grouped into **one bucket per currency**
      (totals, parts, months) with no cross-currency summing; alerts carry currency; CSV gains a
      `currency` column
- [x] Web: currency select on create + account details (disabled with a hint when locked), Home
      totals per currency, amount-input prefix per currency, currency-aware formatting everywhere,
      Insights sections per currency
- [x] Tests: 6 account-currency API tests + 2 multi-currency insights/CSV tests + 9 shared
      registry/format tests + 4 web tests
- [x] Browser-verified: USD account created and funded, Home showed `৳121.00 · $50.00`, Insights
      rendered BDT and USD buckets, CSV had the `currency` column, the currency field was locked

## Production deploy checklist

- [x] `docker-compose.yml` rewritten as an app-only stack: `api` (internal `:4000`, unpublished) +
      `web` (nginx on `WEB_PORT`, default `8080`); the Postgres image is gone
- [x] `apps/api/Dockerfile`: pnpm monorepo build → tsup bundle, prod-only install, migrations
      copied in, runs as the non-root `node` user
- [x] `apps/web/Dockerfile`: Vite build with a baked `VITE_API_BASE_URL=/api/v1` → nginx
- [x] `apps/web/nginx.conf`: SPA fallback, `/api/` proxy to the API, `no-store` on API responses,
      `no-cache` on `sw.js`/`index.html`, immutable hashed assets, `/healthz`
- [x] `app.set("trust proxy", 1)` so rate limiting stays per-IP behind the reverse proxy
- [x] `.dockerignore`, `.env.production.example` (git-ignored, exception added), compose healthchecks
      and capped log rotation
- [x] `docs/deployment.md`: prerequisites, provisioning, TLS requirement, migrations, rollout,
      rollback, backups, troubleshooting table, security checklist
- [x] `Makefile`: full no-Docker workflow (`env`, `db-create`, `migrate`, `dev`, `build`, `start`,
      `verify`, `clean`) reading `.env`
- [x] `docs/deployment-pm2.md`: host deployment — PM2 (cluster) + system nginx (SPA, `/api/` proxy,
      TLS, cache headers, SPA fallback) + external Postgres; firewall the API port, `pm2 startup`
      and `save`, `pm2-logrotate`, zero-downtime `pm2 reload`, cluster-mode caveats
- [x] `ecosystem.config.cjs`: runs `apps/api/dist/index.js`, 2 cluster workers, `NODE_ENV=production`
- [x] Fixed `make build` emitting a **development** React bundle: `-include .env` set
      `NODE_ENV=development`, and because the variable came from the environment make kept it
      exported, so Vite built the dev bundle (634 kB vs 355 kB). `unexport NODE_ENV` + verified
      against the Docker build output
- [ ] Verify on a real host with a real domain and certificate

## Resolved decisions

- **Styling**: Tailwind CSS v4 (was open in CLAUDE.md §13).
- **Casing**: camelCase in TS, snake_case in SQL/JSON, converted at the repository boundary.
- **Money type in TS**: `bigint` paisa.
- **Withdrawal splitting**: always manual (never auto-split) — per §4/§13.
- **Package manager**: pnpm workspaces; package names `api`, `web`, `shared`.
- **Auth crypto**: `@node-rs/argon2` (argon2id), `jose` (HS256); refresh tokens opaque + hashed.
- **Login**: allowed before email verification; verification still gates money actions (later).
- **Migrations**: hand-written `.sql` files (node-pg-migrate auto-detects `.sql`).
- **Test DB**: derived `splitledger_test`, created + migrated in vitest global-setup.
- **Web session**: access token in memory only; refresh via httpOnly cookie; silent refresh on 401
  through one shared in-flight promise; direct cross-origin API calls with credentials.
- **Web UI motion**: CSS transitions + `@starting-style` (no motion library); design skills
  (`apple-design`, `emil-design-eng`, `mobile-native`, `animate`, `animation-performance`) applied.
- **Web tests**: React Testing Library + jsdom, `fetch` mocked.
- **Balances (Phase 2)**: returned as `0` — accounts genuinely hold nothing until Phase 3 adds
  transaction entries; no fabricated figures.
- **Parts**: `PUT` replaces the active set; omitted parts are soft-archived; a new account starts
  with a single `General` part at 100%.
- **Money over the wire**: string of minor units (JSON can't carry `bigint`).
- **Balances (Phase 3)**: derived `SUM(entries.amount_minor)` — real, no cached column.
- **Ledger writes**: one DB transaction each, locking the account/parts `FOR UPDATE`; optional
  `Idempotency-Key`; overdraw rejected (never clamped); append-only with reversal corrections.
- **Reversal shape**: new transaction of the **opposite type** with negated entries (see
  `docs/conventions.md`).
- **Bottom sheets**: hand-rolled (no library) — portal + pointer drag + focus trap; scrolling fields
  with a pinned action row.
- **Motion**: CSS transitions/animations only (`transform`/`opacity`), reduced-motion variants
  everywhere; no motion library.
- **PWA**: manifest + service worker precaching the shell; **API responses never cached**;
  icons generated by a dependency-free script.
- **Periods**: API takes an explicit `from`/`to`; Dhaka boundaries (`+06:00`), fiscal year Jul–Jun,
  `from` inclusive / `to` exclusive.
- **Alerts**: per-part `low_balance_threshold_minor`; alert when balance < threshold; omitted
  threshold in a parts save is preserved, `null` clears it.
- **CSV**: one row per entry, UTF-8 BOM, signed major + minor columns, Dhaka timestamps.
- **Multi-currency**: curated 2-decimal currencies; totals grouped per currency (never summed
  across currencies, no FX); currency locked once an account has transactions.
- **Deployment**: two containers, no database container — `api` (unpublished) and `web` (nginx).
  nginx serves the SPA and proxies `/api/` so the browser is same-origin: no CORS preflight, and the
  refresh cookie is first-party. TLS terminates in front and is **required** (the cookie is `Secure`
  in production). Migrations are an explicit one-off `docker compose run` step, never a container
  entrypoint, so replicas cannot race.
- **Docker build**: pnpm workspaces built inside the image (corepack pins the `packageManager`
  version); the API ships the tsup bundle plus a prod-only dependency install, runs as the non-root
  `node` user. `VITE_API_BASE_URL` is a build arg, defaulting to `/api/v1` for the proxied setup.
- **Native run**: root `Makefile` drives the same stack without Docker (`make dev` for the dev
  servers, `make build && make start` for the compiled output).
- **PM2 deploy**: PM2 owns the API (`ecosystem.config.cjs`, cluster mode, 2 workers) and system nginx
  serves the SPA and proxies `/api/` on one origin, same as the container setup. Cluster mode means
  rate-limit counters are per worker (effective limit = configured × workers) and each worker opens
  its own pg pool — documented rather than hidden.

## Open questions (need owner input before the relevant phase)

- Should the single-part deposit warning also send an email/push alert? (Currently in-app + recorded.)
- Transfers between parts — build in v1.5?

## Changelog

- PM2 deploy: `ecosystem.config.cjs` (cluster mode, 2 workers, `NODE_ENV=production`) plus
  `docs/deployment-pm2.md` — host deployment with system nginx serving the SPA and proxying `/api/`
  on one origin, TLS via certbot, a required firewall rule for the API port, `pm2 startup`/`save`,
  `pm2-logrotate`, zero-downtime `pm2 reload` (verified: 60/60 clean responses during a reload) and
  the cluster-mode caveats (per-worker rate limits and pg pools). Also fixed `make build` silently
  producing a development React bundle through `.env`'s `NODE_ENV`.
- Production deploy: `docker-compose.yml` is now an app-only stack (the Postgres image is gone; the
  database is external via `DATABASE_URL`), with `apps/api/Dockerfile` (pnpm monorepo build, tsup
  bundle, prod-only install, migrations included, non-root) and `apps/web/Dockerfile` (Vite build →
  nginx, which serves the SPA and proxies `/api/` so the browser is same-origin). Added
  `.dockerignore`, `.env.production.example`, an app-level `trust proxy` hop for accurate rate
  limiting behind the proxy, `docs/deployment.md` (provisioning → TLS → migrations → rollout,
  rollback, backups, troubleshooting), and a root `Makefile` for running the stack without Docker.
  Local dev now needs its own Postgres; the README and PROGRESS were updated to match.
- Multi-currency: curated 2-decimal currency registry, currency-aware formatting and amount inputs,
  per-currency totals on Home, one insights bucket per currency (never summed), `currency` column in
  the CSV, and a currency lock once an account has transactions. Verified in a real browser.
- Phase 5 — insights: Dhaka-correct period helpers with Bangladesh fiscal years; range-based summary
  API (totals, per-part breakdown, monthly series), per-part low-balance thresholds and alerts, and a
  per-entry CSV export (escaped, BOM, minor+major amounts); Insights page with presets, account
  filter, trend bars, alerts and download; Home alert hint. Verified against the database in a real
  browser.
- Phase 4 — frontend polish: hand-rolled bottom sheet (drag-to-dismiss, focus trap, Escape, reduced
  motion) used for deposits and withdrawals with a pinned action row; full motion pass with tokens,
  stagger and a deposit success moment; PWA manifest + service worker (shell precache, no API
  caching) with an update prompt; generated icons; empty/loading/error audit. Verified in a real
  browser, including a phone viewport and reduced-motion emulation.
- Phase 3 — ledger: `transactions`/`transaction_entries` with a deferred balance constraint trigger;
  split and single-part deposits (warning enforced server- and client-side); per-part withdrawals
  with overdraw rejection; append-only reversals; keyset-paginated history with filters; summary;
  real derived balances; account-level locking for concurrency; optional idempotency; audit events.
  Verified in a real browser and against the database (a 60/25/15 split, single-part warning,
  overdraw block, reversal with the original untouched, idempotent retry, cross-user 404s).
- Phase 2 — accounts & parts: `accounts`/`parts` migrations, account CRUD + archive, whole-set
  parts replacement with the 100% basis-point invariant enforced in the service and re-verified in
  the transaction, soft-archived removed parts, user-scoped endpoints with isolation tests, audit
  events, and a mobile-first web UI (Home with totals + segmented account cards, add account,
  account detail with a live 100% split editor and archive). Verified in a real browser.
- Web auth UI — API client with silent refresh, in-memory token store, auth context + route guards,
  login/register/verify/forgot/reset screens, protected Home shell, mobile-first styling with
  CSS-only motion and accessibility preferences, and 9 RTL tests. Verified: credentialed CORS
  preflight + responses from `:5173`, dev server serves the app, 70 tests green, production build.
- Phase 1 — auth API: schema migrations, shared schemas, argon2id passwords, JWT access tokens,
  rotating hashed refresh tokens with reuse detection, email verification + password reset via
  SMTP, rate limiting, audit logging, and a 38-test suite against a real Postgres.
- Phase 0 — foundations scaffolded: monorepo, tooling, shared money module with tests,
  API/web skeletons, docker-compose, CI, docs, progress tracker.

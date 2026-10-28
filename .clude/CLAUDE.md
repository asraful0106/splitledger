# CLAUDE.md — SplitLedger (working name)

A personal-finance **tracking** platform for people in Bangladesh who juggle multiple bank accounts.
Each user can add several bank accounts. Every deposit into an account is **automatically split by
percentage into "parts"** (e.g. Spending 60%, Savings 25%, Tax reserve 15%) and tracked. The user can
also deposit into a **single part only**, but the app shows a warning first. Withdrawals are tracked too.

> This app **does not move real money** and has **no bank integration**. It is a ledger the user keeps
> in sync with their real bank accounts. Never build features that imply otherwise.

---

## 1. Vocabulary (use these terms everywhere: code, DB, UI, commits)

| Term | Meaning |
|---|---|
| **User** | A person with a login. |
| **Account** | One of the user's real bank accounts, tracked here (nickname, bank name, optional last 4 digits). |
| **Part** | A named bucket inside an Account with a percentage (e.g. "Savings 25%"). An Account's active parts always sum to exactly 100%. |
| **Transaction** | A deposit or withdrawal on an Account. |
| **Entry** | The portion of a Transaction that lands on one Part. A Transaction has 1..n Entries. |
| **Split deposit** | Default. Amount is divided across all parts by percentage. |
| **Single-part deposit** | Whole amount goes to one Part. Requires an explicit warning acknowledgement. |

---

## 2. Stack & decisions

- **Monorepo** (pnpm workspaces): `apps/api`, `apps/web`, `packages/shared` (zod schemas + types shared by both).
- **Language:** TypeScript everywhere, `strict: true`. (Money code must be type-checked.)
- **Backend:** Node.js 20+, Express, PostgreSQL 16.
  - DB access: `pg` (node-postgres) with hand-written parameterized SQL. Migrations: `node-pg-migrate`.
  - Validation: `zod` on every request body, query, and param.
  - Auth: JWT **access + refresh** tokens (see §5).
  - Email: **SMTP via `nodemailer`** (config from env; works with any SMTP provider).
  - Logging: `pino`. Tests: `vitest` + `supertest`.
- **Frontend:** React 18 + Vite + React Router, TanStack Query for server state, React Hook Form + zod.
  - Styling: CSS variables + Tailwind or CSS Modules (pick one in phase 0, then stay consistent).
- **Timezone:** store all timestamps as `timestamptz` (UTC). Display in `Asia/Dhaka`.
- **Currency:** BDT only in v1 (`৳`). Keep a `currency` column on Account so more can be added later.

---

## 3. Commands

```bash
pnpm install
pnpm dev              # api + web together
pnpm --filter api dev
pnpm --filter web dev
pnpm test             # all tests
pnpm --filter api test:watch
pnpm lint && pnpm typecheck
pnpm --filter api migrate up      # run migrations
pnpm --filter api migrate create <name>
```

Always run `pnpm lint && pnpm typecheck && pnpm test` before declaring a task done.

---

## 4. Money rules (the most important section — never break these)

1. **Money is an integer count of paisa** (`BIGINT` in Postgres, `number` safe-integer or `bigint` in TS). **Never use floats.** 1 BDT = 100 paisa.
2. **Percentages are stored as basis points** (integer, 10000 = 100%). 25% → `2500`.
3. An Account's active parts must sum to **exactly 10000 bp**. Enforce in the service layer **and** verify inside the DB transaction before commit.
4. **Splitting uses the largest-remainder method** so the entries always sum to exactly the deposit amount (no lost or invented paisa). Ties broken by part `sort_order`. This function lives in `packages/shared/src/money/split.ts`, is pure, and has property-based tests (sum invariant, no negatives, deterministic).
5. **The ledger is append-only.** Never `UPDATE` or `DELETE` a transaction or entry. To correct a mistake, create a **reversal transaction** that links to the original (`reverses_transaction_id`).
6. **Balances are derived**: part balance = `SUM(entries.amount_minor)`. A cached balance column is allowed only if it is updated in the same DB transaction and covered by a reconciliation test.
7. **Every money write runs in a single DB transaction** with `SELECT … FOR UPDATE` on the affected parts/account to prevent race conditions.
8. **Idempotency:** deposit/withdraw endpoints accept an `Idempotency-Key` header; unique index on `(user_id, idempotency_key)`. A retried request must not double-post.
9. **A withdrawal can never take a Part below zero.** Reject with a clear error; do not silently clamp.
10. **Changing percentages only affects future deposits.** Each entry stores the `percentage_bp_snapshot` used at the time.
11. Amount must be `> 0` and below a sane max (configurable). Reject otherwise.

### Deposit behaviour

- **Default (`mode: "split"`)**: split across all active parts by percentage.
- **Single-part (`mode: "single_part"`, `part_id` required)**:
  - UI shows a warning: *"This skips your split rules. Part X will receive the full ৳Y instead of Z%."* User must confirm.
  - API requires `acknowledged_warning: true`; otherwise returns `409` with the warning payload. The transaction stores `mode = 'single_part'` and `warning_acknowledged_at`.
  - Single-part deposits are visibly flagged in history.

### Withdrawal behaviour

- Withdraw from a **specific Part** (default) or from several Parts explicitly (user enters amount per part). Always validate balance first.
- Optional `note`/`category` for tax and tracking purposes.

---

## 5. Security requirements (non-negotiable)

**Passwords & accounts**
- Hash with **argon2id**. Minimum length 10, check against a common-password list.
- Email verification required before the account can create transactions.
- Generic responses on login / forgot-password (don't reveal whether an email exists).

**Tokens**
- **Access token:** JWT, ~15 min, sent as `Authorization: Bearer`, kept **in memory only** on the frontend (never localStorage).
- **Refresh token:** opaque random value (or JWT with `jti`), 7–30 days, sent only as an **`httpOnly; Secure; SameSite=Strict` cookie** scoped to the refresh path.
- Store only a **hash** of the refresh token in the DB, with a `family_id`.
- **Rotate on every refresh.** If a revoked/used token is presented again → revoke the whole family (reuse detection) and force re-login.
- Logout revokes the current token; "log out everywhere" revokes all of the user's families. Changing password revokes all sessions.
- Use separate secrets for access and refresh; load from env; support rotation.

**Password reset & email tokens**
- Random 32-byte token, stored **hashed**, single use, expires in 30 min (reset) / 24 h (verify).
- Reset link goes via SMTP; invalidate other reset tokens on use. Never log tokens or full links.

**API hardening**
- `helmet`, strict CORS allow-list, `express-rate-limit` (stricter on `/auth/*`), request body size limits.
- Parameterized SQL only. No string-concatenated queries, ever.
- Authorization on **every** query: scope by `user_id` (no IDOR). Write a test per endpoint proving user A cannot read or write user B's data.
- Error responses never leak stack traces or SQL. Use a central error handler with stable error codes.
- CSRF: refresh endpoint uses SameSite=Strict cookie + custom header check.
- Secrets only from env (`.env` is git-ignored; commit `.env.example`).
- **Never store full bank account numbers, card numbers, PINs, or bank credentials.** Only a nickname and optional last 4 digits.
- Audit log table for sensitive events (login, failed login, password change, token reuse, account create/archive, percentage changes).
- Dependencies: lockfile committed, `pnpm audit` in CI.

**Later (v2)**: TOTP 2FA, device/session list, login alert emails.

---

## 6. Data model (starting point)

```
users(id uuid pk, email citext unique, password_hash, email_verified_at, created_at)
email_tokens(id, user_id, type 'verify'|'reset', token_hash, expires_at, used_at)
refresh_tokens(id, user_id, family_id, token_hash, expires_at, revoked_at, replaced_by, user_agent, ip)
accounts(id, user_id, name, bank_name, last4 null, currency default 'BDT', archived_at, created_at)
parts(id, account_id, name, percentage_bp int check 0..10000, sort_order, archived_at)
transactions(id, account_id, user_id, type 'deposit'|'withdrawal', amount_minor bigint check >0,
             mode 'split'|'single_part'|'manual', warning_acknowledged_at null,
             occurred_at, note, category null, idempotency_key,
             reverses_transaction_id null, created_at)
transaction_entries(id, transaction_id, part_id, amount_minor bigint /* + deposit, − withdrawal */,
                    percentage_bp_snapshot null)
audit_log(id, user_id null, event, metadata jsonb, ip, created_at)
```

Invariant: for every transaction, `SUM(entries.amount_minor) = ± transactions.amount_minor`. Add a test and a DB-level check/constraint trigger where practical.

---

## 7. API conventions

- REST, JSON, prefix `/api/v1`. Resource-oriented plural nouns.
- Layering in `apps/api/src`: `routes → controllers → services → repositories`. Controllers parse/validate and call services; **business logic lives in services**; SQL lives only in repositories.
- Response shape: `{ data }` on success, `{ error: { code, message, details? } }` on failure.
- Pagination: cursor-based for transaction history. Filters: account, part, type, date range.
- Core endpoints (v1):
  - `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password`
  - `GET/POST/PATCH /accounts`, `POST /accounts/:id/archive`
  - `GET/PUT /accounts/:id/parts` (PUT replaces the whole set; must sum to 100%)
  - `POST /accounts/:id/deposits`, `POST /accounts/:id/withdrawals`, `POST /transactions/:id/reverse`
  - `GET /accounts/:id/transactions`, `GET /accounts/:id/summary`

---

## 8. Frontend design — use these skills

Before building or changing **any** UI, invoke the relevant skills and follow them:

- `/apple-design` — overall visual language, hierarchy, spacing, typography, restraint.
- `/emil-design-eng` — design-engineering polish: details, feel, micro-interactions.
- `/mobile-native` — this must feel like a native mobile app: **mobile-first**, thumb-friendly targets (≥44px), bottom sheets, safe-area insets, no hover-only affordances.
- `/animate` — meaningful motion for transitions, deposit success, split visualisation.
- `/animation-performance` — animate only `transform` and `opacity`, respect `prefers-reduced-motion`, no layout thrash, keep 60fps.

**Product-specific UI rules**
- Home: total across accounts, then account cards; each card shows its parts as a segmented bar with balances.
- Deposit flow is a bottom sheet: amount keypad → live split preview (animated) → confirm. Single-part is a secondary option that triggers the warning step.
- Money display: `৳` + `Intl.NumberFormat('en-BD')`; amounts are always converted from paisa at the edge (one `formatMoney` helper, no ad-hoc math).
- Never compute splits on the client as the source of truth. The client may *preview* using the shared `split()` function; the server result is authoritative.
- Access token in memory, silent refresh on 401 via a single in-flight refresh promise.
- Accessibility: labels, focus states, contrast AA, full keyboard use, reduced-motion support.
- States: every screen has loading (skeleton), empty, and error states.

---

## 9. Email (SMTP)

- `nodemailer` transport from env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
- Emails in v1: verify email, forgot/reset password, password-changed notice, token-reuse security alert.
- Templates: plain HTML + text fallback, in `apps/api/src/mail/templates/`. Send via a queue-like wrapper (`sendMail()` with retry); never block a request on SMTP failure for non-critical mails.
- In dev, use Mailpit/MailHog (docker-compose) — never real SMTP.

---

## 10. Testing & definition of done

- **Must have tests:** split function (property-based), deposit/withdraw services (incl. concurrency and idempotency), reversal, overdraw rejection, auth (refresh rotation + reuse detection, reset token single-use), authorization isolation between users.
- Use a real Postgres in tests (docker / testcontainers), not mocks, for anything touching money.
- A task is done when: types pass, lint passes, tests pass, migrations are reversible, `.env.example` updated, and docs/this file updated if a rule changed.

---

## 11. Conventions

- Conventional commits (`feat:`, `fix:`, `chore:`…). Small, focused PRs.
- `camelCase` in TS, `snake_case` in SQL/JSON-over-the-wire is converted at the repository boundary (pick one and document it in phase 0).
- No `any`. No `console.log` (use the logger). No commented-out code.
- Prefer boring, explicit code over clever code, especially around money.
- When a requirement is ambiguous, **ask before guessing** — especially for anything involving money, auth, or data deletion.

---

## 12. Roadmap

1. **Phase 0 — Foundations:** monorepo, lint/TS config, docker-compose (Postgres + Mailpit), CI, shared `split()` + tests.
2. **Phase 1 — Auth:** register, verify email, login, refresh rotation, forgot/reset password, rate limits, audit log.
3. **Phase 2 — Accounts & parts:** CRUD, percentage editor with live 100% validation.
4. **Phase 3 — Ledger:** split deposit, single-part deposit + warning, withdrawal, reversal, history.
5. **Phase 4 — Frontend polish:** animations, bottom sheets, empty/loading states, PWA install.
6. **Phase 5 — Insights:** monthly summaries, CSV export, tax-year (Bangladesh fiscal year Jul–Jun) reports, alerts (e.g. part balance low).
7. **Later:** TOTP 2FA, Bangla language (i18n), multi-currency, recurring income templates.

---

## 13. Open questions (confirm with the owner before building)

- Should **withdrawals** ever be auto-split across parts, or always chosen manually? (Currently: manual.)
- Do users want **transfers between parts** (move ৳ from Savings to Spending)? (Suggested for v1.5.)
- Should the single-part warning also send an **email/push alert**, or in-app only? (Currently: in-app + recorded on the transaction.)
- Tailwind vs CSS Modules?
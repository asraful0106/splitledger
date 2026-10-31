# Local deployment behind your own nginx (subpath)

Runs the built app on your machine with Docker Compose, fronted by the nginx you already run, at
`http://asraful-alom.com/ap/splitledger/`.

| Piece                       | Where                                                                            |
| --------------------------- | -------------------------------------------------------------------------------- |
| Web app (nginx + built SPA) | container, published on `8080`                                                   |
| API                         | container, published on `4001`                                                   |
| Database                    | your own Postgres on this machine                                                |
| Public URL                  | your nginx, `/ap/splitledger/` → `127.0.0.1:8080` and `/api/` → `127.0.0.1:4001` |

Two ports are used that are not the defaults: your `pnpm dev` stack already owns `4000` (API) and
`5173` (Vite), so the containers publish `4001` and `8080` and the two setups can run at the same
time.

## Why the app had to change, and why `sub_filter` cannot work

You were proxying `/ap/splitledger/` to `127.0.0.1:5173` (the Vite **dev** server) and patching the
HTML with `sub_filter`. That works for dev only. In a production build:

- The JS bundle emits **absolute** `/assets/...` URLs and its own dynamic chunk imports. Rewriting
  two `src=`/`href=` patterns in the HTML document does not touch any of them.
- `BrowserRouter` had no `basename`, so every route would resolve against `/`.
- The PWA manifest and service worker were scoped to `/`, not to the subpath.

So the build itself now knows its base:

- `apps/web/vite.config.ts` reads `VITE_BASE_PATH` (default `/`) and passes it to Vite as `base`, and
  uses it for the manifest `start_url`/`scope`/icons and the Workbox `navigateFallback`.
- `apps/web/src/main.tsx` sets `basename={import.meta.env.BASE_URL}`, which is Vite's resolved base.
- Vite rewrites the asset and `apple-touch-icon` URLs in `index.html` for you.

`sub_filter` and its `proxy_set_header Accept-Encoding ""` are gone — with nothing to rewrite, that
header only disabled compression.

**The API stays at `/api/` and is not moved under the subpath.** The refresh cookie is issued with
`Path=/api/v1/auth`, and a browser only sends a cookie to request paths under that prefix. If the
browser called `/ap/splitledger/api/v1/auth/refresh`, the cookie would not be attached and
refreshing would fail silently. Keeping the API at `/api/v1/...` is what makes the session work.

## Step 1 — Prerequisites

Docker with Compose v2, your existing nginx, and a Postgres 16 reachable from a container. If your
Postgres runs in Docker on this machine, publishing its port is enough — the stack reaches the host
through `host.docker.internal`.

## Step 2 — Configure

```bash
cp .env.local.example .env.local
```

Then edit `.env.local`:

- **`NODE_ENV=development`** — leave this. Your nginx serves plain HTTP, and the API only marks the
  refresh cookie `Secure` when `NODE_ENV=production`. A browser silently drops a `Secure` cookie over
  `http://`, so login would appear to work and then immediately forget the session. Switch this only
  after you add TLS ([Step 7](#step-7--add-https)).
- **`APP_WEB_URL`** — the public origin **including the subpath, without a trailing slash**:
  `http://localhost:8080/ap/splitledger`, or `http://asraful-alom.com/ap/splitledger`. This is
  prefixed onto the links in verification and password-reset emails, and the app resolves those
  routes against its basename.
- **`DATABASE_URL`** — your Postgres, addressed as `host.docker.internal` plus its host port, e.g.
  `postgres://splitledger:splitledger@host.docker.internal:55432/splitledger`.
- **`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`** — replace the placeholders.
- **`SMTP_*`** — point at whatever mail catcher you run (Mailpit on the host is
  `host.docker.internal:1025`).

`CORS_ORIGIN` is not exercised here: everything is served from one origin, so no request is ever
cross-origin.

## Step 3 — Build, migrate, start

```bash
docker compose -f docker-compose.local.yml build

docker compose -f docker-compose.local.yml run --rm api \
  node node_modules/node-pg-migrate/bin/node-pg-migrate.js -m migrations -j sql up

docker compose -f docker-compose.local.yml up -d
docker compose -f docker-compose.local.yml ps
```

The API's `build` args are baked into the web image (`VITE_BASE_PATH=/ap/splitledger/` and
`VITE_API_BASE_URL=/api/v1`), so they are set once, at build time.

## Step 4 — Check the containers before touching nginx

```bash
curl -fsS http://localhost:8080/api/v1/health          # {"data":{"status":"ok"}}
curl -fsSI http://localhost:8080/ap/splitledger/       # 200, the app shell
curl -fsS  http://localhost:4001/api/v1/health         # 200, the API directly
```

`http://localhost:8080/` redirects to the app. If these fail, fix them here — a failure through the
domain afterwards is then definitely an nginx problem.

## Step 5 — Your nginx server block

Create `/etc/nginx/sites-available/asraful-alom` (or edit the file your config already lives in),
replacing the SplitLedger parts of your existing block:

```nginx
server {
    listen 80;
    server_name asraful-alom.com www.asraful-alom.com;

    # SplitLedger. The app is built with base=/ap/splitledger/, so the prefix must be
    # forwarded UNCHANGED. Note there is no trailing slash on proxy_pass: adding one
    # would strip /ap/splitledger/ and every asset would 404.
    location = /ap/splitledger {
        return 301 /ap/splitledger/;
    }

    location /ap/splitledger/ {
        proxy_pass http://127.0.0.1:8080;

        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SplitLedger's API, on its own path. Straight to the API container.
    #
    # Do NOT route this through the web container instead: the web container's nginx
    # appends its own address to X-Forwarded-For, and the API trusts exactly one hop,
    # so every visitor would end up sharing a single rate-limit bucket.
    location /api/ {
        proxy_pass http://127.0.0.1:4001;

        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Everything else stays your portfolio site, unchanged.
    location / {
        proxy_pass http://localhost:3000;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

What changed from your version: `sub_filter` is gone, the target is `8080` instead of `5173`, the
`proxy_pass` has no trailing slash, and `/api/` was added. `location /` is untouched.

Note that `/api/` on this domain now belongs to SplitLedger. If your portfolio ever needs it, route
the API elsewhere and give the API a different cookie path.

Reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Step 6 — Verify through the domain

```bash
curl -fsS  http://asraful-alom.com/ap/splitledger/          # the app shell
curl -fsSI http://asraful-alom.com/ap/splitledger/sw.js     # 200, no-store
curl -fsS  http://asraful-alom.com/api/v1/health            # {"data":{"status":"ok"}}
```

Then in a browser at `http://asraful-alom.com/ap/splitledger/`:

1. Register, then log in.
2. **Reload the page** — the session must survive. This is the check that proves the cookie path
   lines up; if it fails, see the troubleshooting table.
3. Create an account, deposit, then open Insights and download the CSV — that exercise covers the
   router, the API and a file download under the subpath.
4. DevTools → Network → the JS and CSS requests must be `/ap/splitledger/assets/...`, not
   `/assets/...`.

## Step 7 — Add HTTPS

Plain HTTP means the session cookie cannot be marked `Secure`. Once this domain has a certificate
(`certbot --nginx -d asraful-alom.com -d www.asraful-alom.com`), set `NODE_ENV=production` in
`.env.local` and recreate the API:

```bash
docker compose -f docker-compose.local.yml up -d --force-recreate api
```

Also update `APP_WEB_URL` and `CORS_ORIGIN` to `https://asraful-alom.com/ap/splitledger` and
`https://asraful-alom.com`. Then re-check that login survives a reload over HTTPS.

## Updating

```bash
git pull
docker compose -f docker-compose.local.yml build
docker compose -f docker-compose.local.yml run --rm api \
  node node_modules/node-pg-migrate/bin/node-pg-migrate.js -m migrations -j sql up
docker compose -f docker-compose.local.yml up -d
```

If you change `VITE_BASE_PATH` or `VITE_API_BASE_URL`, the web image must be rebuilt — they are
baked into the bundle, not read at run time.

The nginx config is bind-mounted as a **directory** (`deploy/local/nginx` → `/etc/nginx/conf.d`).
Editing a file inside it takes effect with a reload, no container rebuild:

```bash
docker compose -f docker-compose.local.yml exec web nginx -t
docker compose -f docker-compose.local.yml exec web nginx -s reload
```

## Troubleshooting

| Symptom                                              | Cause                                                                                                                                                  | Fix                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Assets 404, blank page                               | The web image was built without `VITE_BASE_PATH=/ap/splitledger/`                                                                                      | `docker compose -f docker-compose.local.yml build web`          |
| Assets 404 only through the domain                   | `proxy_pass` ends in a trailing slash, stripping the prefix                                                                                            | Remove the trailing slash                                       |
| Deep links 404 on the container but `/` works        | The SPA fallback is missing or written as a plain `/index.html` internal redirect                                                                      | Keep the `@splitledger_shell` named location                    |
| Login works, then the session is gone after a reload | HTTPS is not set up while `NODE_ENV=production`, so the `Secure` cookie is dropped; or the API is not at `/api/v1`, so the cookie's path never matches | See [Step 7](#step-7--add-https); keep the API at `/api/v1/...` |
| `address already in use` on `4000`                   | Your `pnpm dev` API is running                                                                                                                         | The stack uses `4001`; change it if you stop the dev server     |
| Editing `default.conf` has no effect                 | A single-file bind mount keeps the old inode when the file is replaced                                                                                 | This setup mounts the directory; reload with `nginx -s reload`  |
| Every user shares one rate-limit bucket              | `/api/` was routed through the web container, adding an `X-Forwarded-For` hop                                                                          | Proxy `/api/` straight to `127.0.0.1:4001`                      |
| Emails link to a broken page                         | `APP_WEB_URL` is missing the subpath or has a trailing slash                                                                                           | Set it to `http://asraful-alom.com/ap/splitledger`              |
| PWA opens the wrong URL                              | The bundle was built without the base path                                                                                                             | Rebuild the web image                                           |

## Limits of this setup

- Plain HTTP in Step 5 means no `Secure` cookie and no real security; this is a machine-local setup.
  Add TLS before exposing it.
- Only one instance of each container; a machine-local stack does not need more.
- The API's port is published on all interfaces so your nginx can reach it. Narrow it to
  `127.0.0.1:4001:4000` in `docker-compose.local.yml` if nothing else on your network should reach it.

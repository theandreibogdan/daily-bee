# DailyBee Cloud test server

> Running it on a Coolify server instead of a plain Docker host? Follow [DailyBee cloud testing.md](<../../DailyBee cloud testing.md>), which uses `apps/api/Dockerfile` with Coolify's own Postgres and proxy.

The hosted workspace the wizard calls **DailyBee Cloud** is the sync API (`apps/api`) running
with Postgres on a host you control. This folder runs both with Docker Compose. The desktop
app reaches it through the build-time address `VITE_DAILYBEE_CLOUD_URL`; while that is empty,
the wizard shows the option as not available yet.

## 1. Run it on the test host

Requirements: Docker with Compose (Docker Desktop on Windows or macOS, `docker-ce` on Linux),
a host that the desktop apps can reach on the chosen port, and a clone of this repository.

```bash
cd deploy/cloud
cp .env.example .env            # set POSTGRES_PASSWORD (letters and digits), API_PORT if 8787 is taken
docker compose up -d --build    # builds apps/api/Dockerfile from the repository root, starts Postgres + API
docker compose logs -f api      # "[api] using Postgres" then "[api] listening on http://localhost:8787/trpc"
```

Check it:

```bash
curl http://localhost:8787/trpc/health
```

```json
{"result":{"data":{"ok":true,"service":"dailybee-api","version":"0.1.0","db":"postgres","dbOk":true,"uptimeSeconds":12,"privacy":"aggregates only — no URLs or window titles are accepted or stored"}}}
```

`db` says which store the server runs on; `ok` is false when Postgres does not answer. The API
creates its schema on start, so there is nothing to migrate by hand.

## 2. Point the desktop at it

The address is baked into the desktop build:

```bash
# Windows PowerShell
$env:VITE_DAILYBEE_CLOUD_URL = 'http://cloud-test.example.com:8787'; corepack pnpm build
# macOS / Linux
VITE_DAILYBEE_CLOUD_URL=https://cloud-test.example.com pnpm build
```

or put the line in `apps/desktop/.env` (see `apps/desktop/.env.example`) and build as usual;
`pnpm package` uses the same variable. The wizard's **DailyBee Cloud** option then checks
`/trpc/health` before offering to sign in, and shows the server's store and version.

For a local end-to-end test on the same machine, use `http://127.0.0.1:8787`.

## 3. The update feed

`docker compose up -d` also starts a small static server for the desktop apps' updates: whatever
is in `deploy/cloud/updates/` is served at `http://<host>:8788/` (and at
`https://CLOUD_DOMAIN/updates/` with the TLS profile). Copy `latest.yml` and the installers from a
release build there; apps built with `DAILYBEE_UPDATE_URL` pointing at that address update themselves.
`RELEASING.md` in the repository root has the whole release and signing flow.

## 4. HTTPS

Anything beyond the same office network should run behind TLS. With a DNS name pointing at the
host and ports 80 and 443 open, the `tls` profile puts Caddy in front and fetches the certificate:

```bash
CLOUD_DOMAIN=cloud-test.example.com   # in .env
docker compose --profile tls up -d --build
```

The desktop address is then `https://cloud-test.example.com` (no port).

## 5. Day to day

| Task | Command |
| --- | --- |
| Update after a `git pull` | `docker compose up -d --build` |
| Logs | `docker compose logs -f api` |
| Back up the database | `docker compose exec db pg_dump -U dailybee dailybee > dailybee-$(date +%F).sql` |
| Restore | `docker compose exec -T db psql -U dailybee dailybee < dailybee-YYYY-MM-DD.sql` |
| Look inside | `docker compose exec db psql -U dailybee dailybee -c 'select email, role, workspace_id from users'` |
| Stop, keep the data | `docker compose down` |
| Stop and wipe the data | `docker compose down -v` |

What is stored: workspaces, users (passwords scrypt-hashed, tokens hashed), per-day aggregates
(tracked seconds, focus, category mix, app names), entries, check-in answers, projects and the
workspace policy. Never window titles or URLs; the schema has no column for them.

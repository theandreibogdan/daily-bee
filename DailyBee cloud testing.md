# DailyBee Cloud testing — running the cloud on Coolify and connecting the Electron app

This is the step-by-step for standing up **DailyBee Cloud** (the sync API with Postgres) on a
server managed by [Coolify](https://coolify.io), and for building the desktop app so that the
wizard's *DailyBee Cloud* option signs in there. Everything is real: the same `auth.*`, `sync.*`
and `admin.*` procedures the self-hosted option uses, the same schema, the same health check.

What is involved:

```
Electron app ──HTTPS──▶ Coolify proxy (Traefik, Let's Encrypt) ──▶ api container :8787 ──▶ db container :5432
   VITE_DAILYBEE_CLOUD_URL      https://cloud-test.example.com        apps/api/Dockerfile       PostgreSQL 16
```

You need:

- a Linux server (a small VPS is plenty: 2 vCPU, 2 GB RAM, Ubuntu 22.04 or 24.04) with Coolify installed;
- a DNS name you control, for example `cloud-test.example.com`;
- this repository on a Git host Coolify can reach (GitHub public or private);
- a machine that can build the desktop app (Node 22, pnpm, see `DEVELOPMENT.md`). Docker is **not** needed there.

Field names below are Coolify v4's. If your dashboard is newer and a label moved, the setting still exists; use the search in the resource page.

---

## Part 1 — The server and DNS

1. On a fresh server, as root:

   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```

   When it finishes it prints the dashboard address, `http://<server-ip>:8000`. Open it and create the first (admin) user.

2. Open the firewall for `22`, `80`, `443` and `8000` (the dashboard). Once you have given Coolify its own domain (Settings → *Instance domain*) you can close `8000` again and use that domain.

3. In your DNS, add an **A record** `cloud-test.example.com → <server-ip>`. Coolify checks DNS through 1.1.1.1 before requesting a certificate, so wait until `nslookup cloud-test.example.com` answers with the server's address.

4. In Coolify, **Servers → localhost**: the server must show as reachable and the **Proxy** (Traefik) as running. It is started by the installer; if it is stopped, press *Start* there.

## Part 2 — Let Coolify read the repository

- **Public repository**: nothing to do; you will paste the URL in Part 4.
- **Private repository on GitHub**: **Sources → + Add → GitHub App**, follow the flow (it creates a GitHub App with access to the chosen repositories). This also enables *deploy on push*. The alternative is **Deploy Key**: Coolify shows a public key that you add under the repository's *Settings → Deploy keys* on GitHub.

## Part 3 — Project and database

1. **Projects → + Add** → name it `DailyBee Cloud`. Open its **production** environment.

2. **+ New Resource → Databases → PostgreSQL** (16 or 17). Before you press *Start*:

   | Setting | Value |
   | --- | --- |
   | Name | `dailybee-db` |
   | Username | leave `postgres` |
   | Password | leave the generated one |
   | Initial Database | `dailybee` (any name works: the API creates its tables on start) |
   | Make it publicly available | **off** |

   Press **Start**.

3. On the database page copy the **Internal URL**. It looks like

   ```
   postgres://postgres:<generated-password>@<db-resource-uuid>:5432/dailybee
   ```

   That hostname only resolves inside Coolify's Docker network on this server, which is exactly where the API will run. Keep *Make it publicly available* off; nothing outside the server needs the database.

## Part 4 — The API application

1. **+ New Resource → Public Repository** (or *Private Repository (with GitHub App)*). Paste the repository URL and pick the branch you are testing (for example `master`).

2. Set the build:

   | Setting | Value | Why |
   | --- | --- | --- |
   | Build Pack | **Dockerfile** | the repository ships `apps/api/Dockerfile` |
   | Base Directory | `/` | the Dockerfile needs the repository root as build context (the pnpm workspace lockfile lives there); `.dockerignore` keeps the context small |
   | Dockerfile Location | `/apps/api/Dockerfile` | |
   | Ports Exposes | `8787` | the port the API listens on inside the container |
   | Domains | `https://cloud-test.example.com` | `https://` makes Coolify request a Let's Encrypt certificate. If you ever need to be explicit about the port, `https://cloud-test.example.com:8787` maps the domain to container port 8787 |

3. **Environment Variables** tab, both as runtime variables (the *Build Variable* box may stay ticked; they are harmless at build time):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the Internal URL from Part 3 |
   | `PORT` | `8787` |

   Nothing else is required. `SEED_TOKEN` and the other `SEED_*` variables from `apps/api/.env.example` are for provisioning an admin by hand; with the desktop wizard the first admin creates the workspace, so leave them out.

4. **Healthcheck** (under the application's advanced settings): enable it with path `/trpc/health`, port `8787`, expected return code `200`. The image already carries a Docker `HEALTHCHECK` for the same endpoint (Coolify's docs say a Dockerfile health check takes precedence when both exist) and it has `wget`, which Coolify's own check needs. With the check enabled, Traefik only routes traffic to a healthy container.

5. Press **Deploy**. The deployment log shows the image build (`pnpm install --filter @dailybee/api`), then the container log should read:

   ```
   [api] using Postgres
   [api] listening on http://localhost:8787/trpc
   ```

   If it says `[api] DATABASE_URL not set — using the in-memory repository`, the variable did not reach the container: check the Environment Variables tab and redeploy.

6. Verify from anywhere:

   ```bash
   curl https://cloud-test.example.com/trpc/health
   ```

   ```json
   {"result":{"data":{"ok":true,"service":"dailybee-api","version":"0.1.0","db":"postgres","dbOk":true,"uptimeSeconds":41,"privacy":"aggregates only — no URLs or window titles are accepted or stored"}}}
   ```

   `db` must say `postgres` and `ok` must be `true`. `ok: false` with `dbOk: false` means the API is up but cannot reach the database (see Part 8).

7. Later changes to the repository: with the GitHub App, every push to the branch redeploys; otherwise open the application and press **Redeploy**.

## Part 5 — What must change, and what must not

**In the API: nothing.** `apps/api/Dockerfile` is built as it is; the schema is created on start (`PostgresRepo.migrate`), tokens are stored hashed, passwords are scrypt-hashed. The version the wizard shows comes from `apps/api/src/version.ts`; bump it together with `apps/api/package.json` when you release.

**`deploy/cloud/docker-compose.yml` is for a plain Docker host, not for Coolify.** It brings its own Postgres and an optional Caddy for TLS, which Coolify already provides. If you would rather use Coolify's *Docker Compose* build pack with that file, change it first:

- delete the `ports:` block of the `api` service (Coolify's proxy routes the domain; a `ports:` entry binds host ports outside the proxy's control);
- delete the whole `caddy` service and the `caddy-data` / `caddy-config` volumes;
- do **not** add a `networks:` section (Coolify's docs warn it causes intermittent 504s; Coolify creates the network itself);
- set *Docker Compose Location* to `/deploy/cloud/docker-compose.yml` with *Base Directory* `/`;
- `POSTGRES_PASSWORD` appears in the Environment Variables tab automatically because the file declares it as `${POSTGRES_PASSWORD:?…}`; fill it in (letters and digits only, it is embedded in `DATABASE_URL`);
- after Coolify has loaded the file, assign the domain to the **api** service as `https://cloud-test.example.com:8787`.

The Dockerfile route in Part 4 is simpler and is the one this guide was written for.

**In the Electron app: one build-time setting.** The cloud address is compiled into the renderer as `VITE_DAILYBEE_CLOUD_URL` (`apps/desktop/src/renderer/src/cloud.ts`). It is deliberately not a runtime setting: an editable address would let any server present itself as "DailyBee Cloud". Every build that should offer the option needs the variable, and a change of address means a rebuild.

## Part 6 — Build the Electron app against the cloud

1. In `apps/desktop`, copy `.env.example` to `.env` and set the address, with `https://` and without a trailing slash:

   ```
   VITE_DAILYBEE_CLOUD_URL=https://cloud-test.example.com
   ```

   `.env` is ignored by git. The inline form works too:

   ```powershell
   # Windows PowerShell, from the repository root
   $env:VITE_DAILYBEE_CLOUD_URL = 'https://cloud-test.example.com'; corepack pnpm build
   ```

   ```bash
   # macOS / Linux
   VITE_DAILYBEE_CLOUD_URL=https://cloud-test.example.com pnpm build
   ```

2. `pnpm build` produces `apps/desktop/out/` for `pnpm start`; `pnpm package` (or `pnpm package:dir`) produces the distributable under `apps/desktop/release/` with the same address baked in. Give teammates that build.

3. Check that the address is inside the bundle before handing it out:

   ```powershell
   Select-String -Path apps\desktop\out\renderer\assets\*.js -Pattern "cloud-test.example.com" -SimpleMatch | Select-Object -First 1
   ```

   No match means the variable was not set when Vite ran; the wizard would show *DailyBee Cloud is not available in this build yet*.

## Part 7 — Test the whole loop

**First admin (machine A)**

1. Start the app with a fresh profile (first launch, or *Create a new profile* on the profile list). The wizard opens: **Team → Continue → Admin → Continue**.
2. On the sign-in card, **DailyBee Cloud** is selected and, after a moment, the status line reads
   *DailyBee Cloud is reachable · Postgres · v0.1.0 · https://cloud-test.example.com*.
   A warning with **Retry** instead means the app cannot reach the server (Part 8); *Sign in* stays disabled until it can.
3. Tab **Create a workspace**: workspace name, your name, email, password twice → **Create workspace**. The toast says *Signed in to <workspace> as an admin*, the sidebar shows `<workspace> · admin · synced` within a few seconds, and Team lists you.
4. **Settings → Account** shows `admin in <workspace> · DailyBee Cloud` and the **join code**; *Copy* puts the code and the server name on the clipboard for teammates.

**A teammate (machine B, or a second profile on A)**

5. Wizard: **Team → Team member → Join with a code**, DailyBee Cloud selected, paste the code, name, email, password → **Join workspace**. The member gets Today, Reports, Team and Tasks (no Admin).
6. Back on machine A, **Team** now lists both people; Admin → People shows their aggregates once they have tracked something and the 15-minute push (or a *Save & stop*) has run.

**Sign out and in**

7. Settings → bottom → **Sign out** → the profile list → the profile card. The sign-in form comes back with the cloud status and the email pre-filled; the password signs you in again.

**Look at the data on the server**

8. In Coolify open the PostgreSQL resource and use its **Terminal** (or SSH to the server and `docker exec -it <db-container> psql -U postgres -d dailybee`):

   ```sql
   select w.name as workspace, u.email, u.role from users u join workspaces w on w.id = u.workspace_id;
   select user_id, day, tracked_seconds, focus, report_status from days order by day desc limit 10;
   ```

   Expect one row per person, one `days` row per person per synced day, and rows in `entries` and `checkins`. There is no column for URLs or window titles, by design.

**Simulate an outage**

9. In Coolify, **Stop** the API application, open the wizard's sign-in form (or press *Retry* on one that is open): the line turns into a warning, *Sign in* is disabled. **Start** it again, press **Retry**: *reachable* again, sign-in works. Existing signed-in apps keep working locally meanwhile and show *sync failed* in the sidebar until the next successful push.

## Part 8 — Troubleshooting

| What you see | Cause and fix |
| --- | --- |
| Deployment log fails during `pnpm install` or `corepack` | The server has no outbound HTTPS to `registry.npmjs.org` / `nodejs.org`. Allow egress, or pin pnpm another way (`RUN npm i -g pnpm@10.34.5` in place of `corepack enable`). |
| Container log: `DATABASE_URL not set — using the in-memory repository` | The variable is missing or marked build-only. Set it under Environment Variables as a runtime variable, redeploy. |
| Health `ok: false`, wizard says *up, but its database is not answering* | The API cannot reach Postgres. Check the Internal URL, that the database is running, and turn on **Connect To Predefined Network** in the application's advanced settings if the resources are on different networks. |
| `502` or *No available server* from the domain | The container is unhealthy or *Ports Exposes* is not `8787`. Read the container log. |
| Browser warning about the certificate; the app says *Could not reach* | Let's Encrypt failed (DNS was not pointing at the server yet) and Coolify fell back to a self-signed certificate, which the desktop refuses. Fix DNS, then restart the proxy or redeploy so a real certificate is requested. |
| Wizard: *DailyBee Cloud is not available in this build yet* | The build ran without `VITE_DAILYBEE_CLOUD_URL`. Rebuild (Part 6). |
| Wizard: *An account with that email already exists* | The email already has an account on this server; use the **Sign in** tab. |
| Sidebar says *sync failed* | The token was revoked or the server is down. Settings → Account → **Sign out**, then sign in again. |

Where things are: application and deployment logs in Coolify under the resource; the API logs one line per failed request on the server; the desktop logs to `dailybee.log` in its data folder (`DEVELOPMENT.md` §8).

## Part 9 — Keeping the test server tidy

- **Reset the data**: delete the PostgreSQL resource and recreate it (then update `DATABASE_URL` and redeploy the API), or run `truncate workspaces cascade;` in its terminal.
- **Back up**: the database resource has scheduled backups in Coolify; a one-off is `pg_dump -U postgres dailybee > dailybee.sql` from its terminal.
- **Rotate the database password**: change it on the database resource, update `DATABASE_URL`, redeploy.
- **Keep it private**: the database stays unexposed, only `443` (and `80` for the certificate challenge) faces the internet, and the Coolify dashboard should sit behind its own domain with the `8000` port closed.
- **Costs**: the API image is about 250 MB and idles at a few tens of MB of RAM; Postgres for a test team fits comfortably in the smallest VPS tier.

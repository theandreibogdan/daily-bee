# DailyBee — developing, building and testing

Everything you need to run the desktop app and the sync API locally, build distributable binaries, and test each phase by hand or with the automated suites.

## 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 22 or newer (24 is what this repo was built with) | https://nodejs.org |
| pnpm | 10.34.5, pinned in `package.json` (`packageManager`) | `corepack pnpm …` needs nothing installed; or `npm install -g pnpm@10`. pnpm 11+ ships an unsigned native binary that Windows 11 Smart App Control blocks. |
| Git | any | |
| Windows | PowerShell 5.1 (built in) | the tracker's sidecar uses it for `user32` + UI Automation |
| macOS | nothing extra | Accessibility, Automation and Screen Recording are granted at runtime (Settings › System permissions) |
| Linux | `xdotool` on X11 | `sudo apt install xdotool`; Wayland exposes no foreground window, the app degrades to "Unknown app" |
| Postgres (optional) | 14+ | only for the API's persistent mode; the API runs in-memory without it |

No Python, Visual Studio or Xcode build tools are needed: there are no native Node modules (SQLite is `sql.js`, WebAssembly).

Fonts come from Google Fonts at runtime, so the first launch needs internet or the UI falls back to system fonts.

## 2. Install

```bash
pnpm install
```

No `pnpm` on PATH (typical on Windows, where npm's global folder is not on PATH and PowerShell blocks `.ps1` launchers)? Prefix every pnpm command with `corepack `: `corepack pnpm install`, `corepack pnpm dev`, and so on. Corepack ships with Node and reads the pinned version from `packageManager` in package.json. The root scripts go through `scripts/pnpm.mjs`, which does the same fallback for nested calls. [TESTING.md](TESTING.md) is the Windows step-by-step version of this guide.

pnpm blocks dependency build scripts until they are approved. They are pre-approved in `pnpm-workspace.yaml` (`onlyBuiltDependencies` for pnpm 10, `allowBuilds` for pnpm 12: electron, esbuild, electron-winstaller). If pnpm still reports "Ignored build scripts", run:

```bash
pnpm approve-builds electron esbuild electron-winstaller
```

pnpm does not reliably run Electron's own download step, so the root `postinstall` (`scripts/ensure-electron.mjs`) checks for the binary after every install and fetches it when missing. If you ever see "Electron failed to install correctly", run it yourself:

```bash
node scripts/ensure-electron.mjs
```

## 3. Start developing

### Desktop app (Electron + React, hot reload)

```bash
pnpm dev
```

This runs `electron-vite dev` in `apps/desktop`: the renderer is served by Vite on http://localhost:5173 with HMR, main and preload are rebuilt on change, and Electron is launched against the dev server. The main-process log prints the mode and the data folder on startup, e.g. `[dailybee] live mode · data in C:\Users\you\AppData\Roaming\DailyBee · dev server http://localhost:5173`.

Live mode starts the OS tracker immediately. Nothing is recorded until you start a task, but samples are stored from the moment the app opens so the Today activity list fills up while you work.

### Desktop app with the design kit's fake day (demo mode)

```bash
pnpm dev:demo
```

Demo mode seeds today with the exact data from the design system (`design_system/ui_kits/app/data.js`): a running task since ~80 minutes ago, four entries, two answered check-ins, the timeline and activity list, four past reports. The OS tracker is off in this mode; the seeded day is topped up each launch so it always reaches "now". Demo data lives in its own file (`dailybee-demo.sqlite`) and never mixes with real tracking data.

The same switch works as an environment variable if you launch Electron yourself: `DAILYBEE_DEMO=1`.

### Renderer only, in a normal browser

```bash
pnpm dev:renderer
```

Open http://localhost:5174 (plain Vite with `apps/desktop/vite.renderer.config.ts`; electron-vite's own `--rendererOnly` flag still launches Electron, it only skips rebuilding main/preload). Without Electron the renderer talks to an in-memory mock of the main process (`apps/desktop/src/renderer/src/bridge/mock.ts`) with the kit's data. Use it for quick UI work and design reviews; the mock has no tracker, no persistence and no API.

### Sync API

```bash
pnpm dev:api
```

Starts the tRPC server on http://localhost:8787/trpc with `tsx watch`. Without `DATABASE_URL` it uses the in-memory repository: the sample team from the kit is pre-seeded, **any bearer token is accepted**, and everyone is treated as a lead (so Team and Admin work). Tokens `demo-ml`, `demo-jk`, `demo-so`, `demo-ra`, `demo-tn`, `demo-pb` map to the six seeded members; any other token creates a new member on first push.

With Postgres:

```bash
cp apps/api/.env.example apps/api/.env      # edit DATABASE_URL, SEED_TOKEN, SEED_EMAIL …
export DATABASE_URL=postgres://dailybee:dailybee@localhost:5432/dailybee
SEED_TOKEN=change-me pnpm --filter @dailybee/api migrate   # creates the schema + an admin user with that token
pnpm dev:api
```

A quick local Postgres: `docker run --name dailybee-pg -e POSTGRES_USER=dailybee -e POSTGRES_PASSWORD=dailybee -e POSTGRES_DB=dailybee -p 5432:5432 -d postgres:16`.

Health check: `curl http://localhost:8787/trpc/health`.

### Connect the desktop app to the API

Either fill Settings › Workspace (API URL `http://localhost:8787`, access token, team) and press *Save changes*, or launch with environment overrides that are never persisted:

```bash
DAILYBEE_API_URL=http://localhost:8787 DAILYBEE_API_TOKEN=demo-ml pnpm dev:demo
```

The app pushes today's aggregate 3 seconds after launch, every 15 minutes, after *Save & stop* and after sending a report. Team and Admin then show live data (a footer line says "Sample team…" while no workspace is configured).

### Setting environment variables on Windows

The examples use POSIX syntax. In PowerShell:

```powershell
$env:DAILYBEE_DEMO = "1"; pnpm dev
```

In cmd: `set DAILYBEE_DEMO=1 && pnpm dev`. Git Bash accepts the POSIX form.

## 4. Build runnable artifacts

| Command | Result |
| --- | --- |
| `pnpm build` | `electron-vite build` → `apps/desktop/out/` (main, preload, renderer). This is what Electron loads in production. |
| `pnpm --filter @dailybee/desktop start` | Launches Electron on the built `out/` (no dev server). Add `DAILYBEE_DEMO=1` for the fake day. |
| `pnpm package` | Builds, then runs electron-builder: artifacts under `apps/desktop/release/` — `DailyBee-<version>-win.zip` on Windows, `.dmg` + `.zip` on macOS, `AppImage` + `.deb` on Linux. |
| `pnpm package:dir` | Unpacked app only (`release/win-unpacked/DailyBee.exe`, `release/mac/DailyBee.app`, `release/linux-unpacked/dailybee`) — fastest way to test the packaged layout. |
| `pnpm --filter @dailybee/desktop exec electron-builder --win nsis` | Windows NSIS installer (`DailyBee Setup <version>.exe`). Not buildable on machines with Windows 11 Smart App Control enabled: electron-builder executes the unsigned installer stub to extract the uninstaller and gets `spawn UNKNOWN`. Sign the build or use a machine without Smart App Control. |

Smart App Control also refuses to *run* unsigned binaries that were not built on the same machine ("An Application Control policy has blocked this file"): `release/win-unpacked/DailyBee.exe` runs on the build machine, but the same file extracted from the zip does not. Unsigned artifacts are therefore only testable on machines without Smart App Control; code-sign for anything wider.

Run packaging through pnpm (not `npx`): electron-builder detects the package manager from the invoking process and uses pnpm's dependency collector for the hoisted workspace layout. Electron is pinned to an exact version in `apps/desktop/package.json` because electron-builder refuses ranges; bump it there when upgrading. Only the main process's runtime dependencies (`sql.js`, `nodemailer`, `@anthropic-ai/sdk`, `@trpc/client`) are shipped inside the app — everything the renderer uses is bundled by Vite, so those packages live in `devDependencies`.

Build on the OS you are targeting (electron-builder cross-builds are unreliable). The first packaging run downloads electron-builder's helper tools (NSIS, code-signing utilities), so it needs internet. macOS builds use `apps/desktop/build/entitlements.mac.plist` (Apple Events entitlement for browser automation) and set the usage-description strings from `electron-builder.yml`; sign and notarize with your own Apple ID before distributing.

The packaged app honours the same environment variables as development, so the smoke-screenshot trick in section 7 also verifies a build: `DAILYBEE_DEMO=1 DAILYBEE_SMOKE=/tmp/packaged.png apps/desktop/release/win-unpacked/DailyBee.exe`.

The API has no build step: run it with `pnpm --filter @dailybee/api start` (tsx) on a server, or wrap it in a container. It needs `DATABASE_URL` and a port (`PORT`, default 8787).

## 5. Automated tests

```bash
pnpm typecheck     # tsc for ui, tracker, api, desktop (main + renderer)
pnpm test          # vitest: tracker (categorisation, aggregation, LZ4/session store, titles), api (privacy contract, router), desktop (sync scrubber, settings merge)
```

Per package: `pnpm --filter @dailybee/tracker test`, or watch mode with `pnpm --filter @dailybee/tracker exec vitest`.

## 6. Manual test plan

### Phase 1 — shell, Today, timer, dialogs

1. `pnpm dev:demo`. The Today screen must match `design_system/ui_kits/app/Today.jsx`: Tracking badge, task hero, 44px mono timer ticking every second, Stop button with honey glow.
2. Click **Stop** → *Wrapping up* dialog (time mix, "What did you get done?", outcome radio, size select, blocker checkbox). **Save & stop** merges the run into the entry for that task, shows the toast "Entry saved · 1h 21m", and the hero switches to "No active task".
3. Click **Start a task** → *Starting a task* dialog. Picking a task in the Task select fills title, project and size. **Start tracking** shows "Tracking “…”" and the timer restarts from 00:00:00.
4. Press **▶ Resume** on an entry: the dialog opens pre-filled with that entry.
5. Tick an entry's checkbox: it strikes through and counts as done in the report.
6. Navigation persists across restarts (`localStorage` key `db-screen`).

### Phase 2 — real capture, permissions, categories, check-ins, timeline

1. `pnpm dev` (live mode). Switch to another app and a browser for a minute, come back: the Activity card lists the apps you used with categories; browser rows expand into pages with durations. **Now in …** in the hero follows the foreground window.
2. Settings › System permissions:
   - Windows shows a single "UI Automation · Built in" row. **Test capture** prints the current foreground app, title and (for a browser) the address-bar URL.
   - macOS shows Accessibility, Automation per browser and Screen Recording with **Grant** buttons that open the right System Settings pane; the first Automation attempt makes macOS show its own consent dialog.
   - Deny a permission and confirm rows fall back to app names only.
3. Categories: open a page from a known distraction domain (youtube.com, reddit.com), then use the **tag** button on that page row → pick "Learning". The row, mix and Focus % update immediately, and the rule persists (Settings: none; rules live in the local database).
4. Drift check-in without waiting 8 minutes:

   ```bash
   DAILYBEE_DRIFT_MINUTES=0.5 pnpm dev
   ```

   Start a task, sit on youtube.com for 30 s. When the app window is focused the popup appears top-right inside the app; when another window is focused a small always-on-top window appears at the top-right of the screen. **Back to it** / **Taking a break** record the answer; **This is work** also recategorises the domain as work.
5. Halfway check-in: start a *Trivial* task (0.5 h) and wait 15 minutes, or trigger both variants instantly with the **Check-in** button in the Today top bar. Answers appear in the Check-ins card and in the report.
6. Timeline: segments follow the day's categories, gaps and idle time show as breaks; hover a segment for time, category and minutes.
7. Idle detection: leave the machine untouched for the configured minutes (Settings › Tracking, default 10) — samples are marked idle and appear as a break.

### Phase 3 — reports and delivery

1. Today › **Generate report** → loading list, then the drafted report (summary strip, Shipped, In progress, Where the time went, Blockers). **Copy markdown** puts the full report on the clipboard.
2. Reports screen: notes are saved on blur and become the Blockers section when no entry is flagged as a blocker. **Preview** reopens the dialog, **Send report** delivers.
3. Delivery targets (Settings › Delivery):
   - Slack: paste an incoming-webhook URL (https://api.slack.com/messaging/webhooks). The message uses Slack mrkdwn.
   - Email: run a local SMTP sink such as Mailpit (`docker run -p 1025:1025 -p 8025:8025 axllent/mailpit`), set SMTP URL `smtp://localhost:1025` and a recipient, then check http://localhost:8025.
   - Nothing configured: **Send report** shows the warning "Add a Slack webhook or email address…" (demo mode pretends success with "Report sent to 4 teammates", as in the kit).
4. Scheduler: the app drafts (and sends when Auto-send is on and a target exists) at the policy time on weekdays. Test it in a minute:

   ```bash
   DAILYBEE_REPORT_TIME=14:31 pnpm dev      # any HH:MM about a minute ahead
   ```

5. Optional Claude polish: enable **Polish wording with Claude** and paste an Anthropic API key. Generation then rewrites prose only; if the call fails the template report is kept.

### Phase 4 — sync, Team, Admin, privacy

1. Start the API (`pnpm dev:api`) and the app with `DAILYBEE_API_URL=http://localhost:8787 DAILYBEE_API_TOKEN=demo-ml`.
2. Team: your own row reflects local totals after the first push; the other five members come from the API's seed. Range tabs re-query the API.
3. Admin: Overview KPIs, category mix, alerts, focus by person; People has sortable columns and a drill-in panel with **Nudge** (recorded server-side); Projects and Policy tabs.
4. Privacy rule (URLs never leave the device):
   - Launch with `DAILYBEE_LOG_SYNC=1` and read the `[sync] payload …` line in the terminal: it contains entries, outcomes, check-in answers, category percentages and app names, and nothing else.
   - `pnpm --filter @dailybee/api test` covers the server side: any `url`, `title`, `tabs` field or URL-shaped text is rejected with a 400.
5. Unauthorised access: call any Team/Admin endpoint without a bearer token → `UNAUTHORIZED`; with a member token against a Postgres-backed API → `FORBIDDEN` (in-memory dev mode lifts this).

## 7. Environment variables (desktop)

| Variable | Effect |
| --- | --- |
| `DAILYBEE_DEMO=1` (or `--demo`) | Fake day from the design kit, tracker off, separate database |
| `DAILYBEE_API_URL`, `DAILYBEE_API_TOKEN` | Workspace API without touching saved settings |
| `DAILYBEE_DRIFT_MINUTES` | Minutes on a distraction site before the drift popup (default 8; fractions allowed) |
| `DAILYBEE_REPORT_TIME` | Policy time for the report scheduler, `HH:MM` |
| `DAILYBEE_LOG_SYNC=1` | Print every scrubbed sync payload |
| `DAILYBEE_USER_DATA=<folder>` | Isolated profile: own database and own single-instance lock, so a test instance can run next to your real one |
| `DAILYBEE_SMOKE=<file.png>` | Boot, screenshot the window, quit. Combine with `DAILYBEE_SMOKE_SCREEN=today\|reports\|team\|tasks\|admin\|settings`, `DAILYBEE_SMOKE_PROMPT=start\|end\|report\|checkin`, `DAILYBEE_SMOKE_WAIT=<ms>` |

Example of a full visual check without touching the mouse:

```bash
pnpm build
DAILYBEE_DEMO=1 DAILYBEE_SMOKE=/tmp/today.png pnpm --filter @dailybee/desktop exec electron .
DAILYBEE_DEMO=1 DAILYBEE_SMOKE=/tmp/report.png DAILYBEE_SMOKE_PROMPT=report pnpm --filter @dailybee/desktop exec electron .
```

## 8. Where data lives, how to reset

| OS | Folder |
| --- | --- |
| Windows | `%APPDATA%\DailyBee\` |
| macOS | `~/Library/Application Support/DailyBee/` |
| Linux | `~/.config/DailyBee/` |

`dailybee.sqlite` holds real data (samples, entries, check-ins, rules, reports, settings); `dailybee-demo.sqlite` holds the demo day. Delete a file to reset that mode. Samples are written every 30 seconds and on quit; entries, settings and reports within a second.

## 9. Troubleshooting

- **"Electron failed to install correctly"** — run `node node_modules/electron/install.js`.
- **`ERR_PNPM_IGNORED_BUILDS`** — `pnpm approve-builds electron esbuild electron-winstaller`, then `pnpm install`.
- **Port 5173 in use** — the renderer dev server uses `strictPort`; stop the other process or change `server.port` in `apps/desktop/electron.vite.config.ts`.
- **Blank activity list in live mode** — Windows: check the terminal for `[tracker/win32]` lines (the PowerShell sidecar prints errors there). macOS: grant Accessibility, then Automation for your browser. Linux: install `xdotool`; Wayland is not supported.
- **Browser rows show titles but no URLs** — the address bar could not be read (permission denied, or an unsupported browser). The row still carries the page title from the window title.
- **Team/Admin show the sample team** — no workspace configured, or the API is unreachable; Settings › Workspace shows the sync status and last error.
- **Fonts look wrong** — Google Fonts could not be loaded (offline); the UI falls back to the system stack.

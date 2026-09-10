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

A fresh profile starts with the setup wizard — Solo (local profile with a password) or Team (sign in to a workspace); see *Connect the desktop app to the API* below. Live mode starts the OS tracker immediately. Nothing is recorded until you start a task, but samples are stored from the moment the app opens so the Today activity list fills up while you work.

### Desktop app with the design kit's fake day (demo mode)

```bash
pnpm dev:demo
```

Demo mode seeds today with the exact data from the design system (`design_system/ui_kits/app/data.js`): a running task since ~80 minutes ago, four entries, two answered check-ins, the timeline and activity list, four past reports. The OS tracker is off in this mode; the seeded day is topped up each launch so it always reaches "now". Demo data lives in its own file (`dailybee-demo.sqlite`) and never mixes with real tracking data.

Demo mode skips the wizard and acts as a signed-in admin of the sample workspace. The same switch works as an environment variable if you launch Electron yourself: `DAILYBEE_DEMO=1`.

### Renderer only, in a normal browser

```bash
pnpm dev:renderer
```

Open http://localhost:5174 (plain Vite with `apps/desktop/vite.renderer.config.ts`; electron-vite's own `--rendererOnly` flag still launches Electron, it only skips rebuilding main/preload). Without Electron the renderer talks to an in-memory mock of the main process (`apps/desktop/src/renderer/src/bridge/mock.ts`) with the kit's data. Use it for quick UI work and design reviews; the mock has no tracker, no persistence and no API.

### Sync API

```bash
pnpm dev:api
```

Starts the tRPC server on http://localhost:8787/trpc with `tsx watch`. Without `DATABASE_URL` it uses the in-memory repository: the sample team from the kit is pre-seeded, the sample users' `demo-<initials>` tokens (`demo-ml` is the lead) and tokens issued by `auth.*` are accepted, anything else is `UNAUTHORIZED`, and everyone is treated as a lead (so Team and Admin work). Tokens `demo-ml`, `demo-jk`, `demo-so`, `demo-ra`, `demo-tn`, `demo-pb` map to the six seeded members; any other token creates a new member on first push.

With Postgres:

```bash
cp apps/api/.env.example apps/api/.env      # edit DATABASE_URL, SEED_TOKEN, SEED_EMAIL …
export DATABASE_URL=postgres://dailybee:dailybee@localhost:5432/dailybee
SEED_TOKEN=change-me pnpm --filter @dailybee/api migrate   # creates the schema + an admin user with that token
pnpm dev:api
```

A quick local Postgres: `docker run --name dailybee-pg -e POSTGRES_USER=dailybee -e POSTGRES_PASSWORD=dailybee -e POSTGRES_DB=dailybee -p 5432:5432 -d postgres:16`.

Health check: `curl http://localhost:8787/trpc/health`.

**Accounts.** `auth.createWorkspace` (workspace name + admin name, email, password → the workspace with a join code, its admin user and a token), `auth.join` (join code + name, email, password → a member and a token), `auth.login` (email + password → a new token) and `auth.me`. Passwords are scrypt-hashed and tokens are stored hashed (`apps/api/src/auth.ts`); join codes look like `K7Q2-M9XD`. The in-memory repository seeds the sample workspace with join code `DEMO-2026`; with Postgres, `migrate` adds the `invite_code` and `password_hash` columns. The workspace creator is `admin`, people who join with the code are `member`; the desktop hides Admin for members and the API's role checks on the admin procedures are unchanged.

### Connect the desktop app to the API

The first-run wizard does it (`renderer/src/screens/Onboarding.tsx`): **Team → Admin** offers *Sign in* or *Create a workspace*, **Team → Team member** offers *Sign in* or *Join with a code*; every form asks where the workspace lives: **DailyBee Cloud** (our hosted endpoints and database; the address comes from `VITE_DAILYBEE_CLOUD_URL` at build time and the option reads "not available yet" while that is empty, `renderer/src/cloud.ts`) or **Your own workspace server** (any address, `http://localhost:8787` locally). *How to set up your own server* under that field opens an in-app guide (`components/ServerGuide.tsx`) with copyable commands and a *Check server* button, which calls `account.checkServer`: a GET of `/trpc/health` from the main process. `AccountService` (`main/services/account.ts`) calls the API's `auth.*` procedures through a tRPC client, then stores the token in `settings.workspace` and the account record in the `account` kv row (`{ setupDone, mode: 'solo' | 'team', role: 'admin' | 'member', passwordHash?, workspace }`). **Solo** never touches the network: the profile is local, the password hash is scrypt (`node:crypto`), and the app opens on the lock screen (`screens/Lock.tsx`) at every launch. `navFor(account)` in `screens/Shell.tsx` decides the sidebar: Solo gets Today, Reports, Tasks, Projects and Settings; team members lose Admin; admins get everything. Sign out (the bottom of Settings, *Switch profile* on the lock screen, or the palette) closes the profile and shows the profile list (`screens/Profiles.tsx`); a team account drops its token and its card reopens on the pre-filled sign-in form (`AccountStatus.needsLogin`). *Forgot your password?* on the lock screen asks the profile's two security questions (chosen in the wizard or under Settings › Account; answers are normalised and scrypt-hashed like the password) and then sets a new password (`account.checkRecovery`, `account.resetPassword`; five misses block tries for 30 s). *Solo or Team…* on the account card runs the wizard again for the open profile, converting it in place.

Two shortcuts skip the wizard: demo mode pretends to be a signed-in admin of the sample workspace (join code `DEMO-2026`), and the environment overrides below sign in as a team admin for the session without persisting anything:

```bash
DAILYBEE_API_URL=http://localhost:8787 DAILYBEE_API_TOKEN=demo-ml pnpm dev:demo
```

The app pushes today's aggregate right after signing in, 3 seconds after launch, every 15 minutes, after *Save & stop* and after sending a report, and pulls the workspace's project list with every push. Team and Admin then show live data (a footer line says "Sample teammates…" while no workspace is configured).

### Setting environment variables on Windows

The examples use POSIX syntax. In PowerShell:

```powershell
$env:DAILYBEE_DEMO = "1"; pnpm dev
```

In cmd: `set DAILYBEE_DEMO=1 && pnpm dev`. Git Bash accepts the POSIX form.

### CLI and the git hook

While the desktop app runs it listens on `127.0.0.1:47831` (token in `<userData>/cli.json`, written at launch). `scripts/dailybee.mjs` talks to it:

```bash
node scripts/dailybee.mjs status
node scripts/dailybee.mjs start "Fix login form" --project web-app --size Small
node scripts/dailybee.mjs stop --summary "done" --outcome Done
node scripts/dailybee.mjs hook install      # inside a git repo: post-commit hook
```

With **Settings › Tracking › Start timer on git commit** on, a commit made while no task is running starts a task named after the commit subject (project matched from the repository folder name). `hook remove` takes the hook out again. `DAILYBEE_USER_DATA` points the CLI at another profile.

### Search, notifications, export

The top-bar search (Ctrl/⌘K) is a command palette over screens, actions, tasks and today's entries. The bell shows the profile's notification log (`main/services/notifications.ts`, kv `notifications`, 200 entries / 30 days): the main process pushes task starts and stops, pauses and resumes, check-in prompts, report sent / failed / drafted and sync failures (one keyed entry at a time), and raises a system notification for reports and sync while the window is not focused and Settings › Notifications allows it. The renderer marks rows read (`notifications:markRead`) and can clear the log; missing permissions stay pinned as derived state. Tasks carry an optional `priority` (Low, Normal, High, Urgent) and the Tasks screen filters by project, status, priority and size; Solo profiles hide owners. The idle *Start a task* button uses the kit Button's `pulse` prop (`db-pulse-btn` in ui.css). Admin › Export writes the visible people table to a CSV through the native save dialog.

### Corrections, the change log, time away

Entries can be corrected by hand from the Entries card on Today and on any day opened from Reports › History: **Correct** (task, project, start, duration, outcome, summary, blocker), **Split** (cut after n minutes; the second part continues from there, with a new title or the same one), **Delete**, **Add entry** (something the timer missed) and the done checkbox. Everything goes through `main/services/entries.ts`, which validates (a name, at least a minute, at most 24 hours), keeps a linked task's logged hours in step, marks the entry (`Entry.origin` timer | manual | split, `edits`, `editedAt`; `isEdited()` in `shared/types.ts`) and appends a line to `entry_log`. That table is append-only twice over: SQLite triggers refuse `UPDATE` and `DELETE`, and every line stores a SHA-256 over the previous line's hash and its own content (`Repo.appendLog`, `chainHash`), so `Repo.verifyLog()` notices any alteration made with another tool. The **Change log** button on the Entries card (`components/EntryDialogs.tsx`) shows the day's lines with the chain check; the badges *Edited ×n*, *Added by hand* and *Split off* mark touched entries in every list, the History table counts them per day (`ReportHistoryItem.edited`), and a rebuilt report says how many entries were corrected (`ReportDraft.edited`, plus a footnote in the markdown). After a correction the main process rebuilds that day's report from the corrected data (`ReportService.entriesChanged`); a report that had already been sent keeps its sent record and is marked `staleAt`, which Reports shows as *Changed since sent* with a **Send again** button (`reports:send` now takes a day).

Time away: `PresenceService` pauses the timer on idle, lock or sleep and resumes it when you are back, as before. `main/services/away.ts` then asks what to do when the stretch was at least two minutes and Settings › Tracking › *Ask about time away* is on: **Leave it out** (nothing changes), **Count it as work** (`SessionService.bank` puts the seconds back) or **Stop at hh:mm** (the End dialog opens "as of" the moment you left and `session.stop` saves the reading the timer showed then, `activeSeconds`; the minutes since coming back are dropped). The card (`components/AwayCard.tsx`) shows in the app when it is focused and in the floating popup window otherwise (`Windows.showAway`, the same window as check-ins); `ev:away` carries the pending `AwayPrompt`, and a stop or a new task withdraws it. Every decision is a line in the change log (`action: 'away'`) and in the bell.

### Tracking control, startup, backup, motion

**What is being recorded.** Today shows a status line under the task (`components/TrackingStatus.tsx`, `data-tour="tracking"`): what is captured, whether the system permission is in place, how many private apps are excluded, and **Pause tracking** / **Resume tracking**. Pausing flips `settings.tracking.enabled` (the tray has the same item, and Settings › Tracking the switch): the sampler stops, nothing is stored, `ActivitySummary.paused` is true, and the task timer keeps counting. **Private apps** (`settings.tracking.excludedApps`, matched case-insensitively on app or process name) are dropped in `TrackerService.ingest` before anything is stored; adding one also deletes today's captures of it (`Repo.deleteSamplesForApp`). Their minutes are only counted as a total (`ActivitySummary.privateSeconds`).

**Startup.** Settings › Startup: *Launch at login* and *Start in the tray* (`settings.startup`). The main process calls `app.setLoginItemSettings` with `--hidden` for whichever profile is open, only in packaged builds (a development build would register `electron.exe`; the card says so, and `settings:startup` reports `supported: false`). A launch carrying `--hidden` (or `DAILYBEE_HIDDEN=1`) boots the active profile without opening a window; the tray icon opens it.

**Backup.** Settings › Backup (`main/services/backup.ts`): **Export backup…** flushes and copies the profile's SQLite file to a `.dailybee` file through the native save dialog (`DAILYBEE_BACKUP_DIR` skips the dialog for scripts); **Restore…** picks a file, inspects it read-only (`inspectBackup`: name, mode, entries, days) and replaces the open profile's data after confirmation, keeping the old file beside it as `.before-restore`. The profile list has **Restore from a backup…**, which adds the file as a new profile. Both restores reboot the profile from the restored file, so its password, settings and change log come along. Solo profiles get a bell reminder (`key: 'backup'`, also a desktop notification) after a week without any backup and then every 30 days (`BackupService.reminderDue`).

**Reduce animations.** Settings › Appearance (`settings.appearance.reduceMotion`: null follows the operating system, true/false is explicit). `renderer/src/motion.ts` stamps `<html data-motion="reduce">` in every window from the setting and the `prefers-reduced-motion` media query, and `ui.css` cuts every animation and transition to a frame under it: the start button rests on its glow, dialogs appear in place, the tour's spotlight jumps. There is no blanket media-query rule any more; the switch is the one place that decides.

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
pnpm test          # vitest: tracker (categorisation, aggregation, LZ4/session store, titles), api (privacy contract, router), desktop (sync scrubber, settings merge, session, presence, entries + change log, time away, backup, profiles, notifications)
```

Per package: `pnpm --filter @dailybee/tracker test`, or watch mode with `pnpm --filter @dailybee/tracker exec vitest`.

## 6. Manual test plan

### Phase 0 — first run, accounts, lock screen

1. Fresh profile (`DAILYBEE_USER_DATA=<empty folder>`): the wizard offers *Solo* / *Team*. Solo → name, optional email, password twice (a mismatch or fewer than 6 characters is refused) → lands on Today; sidebar = Today, Reports, Tasks, Projects, Settings; Projects starts empty; a task created while there are no projects has no project tag.
2. Settings › Account → *Lock now* → lock screen; a wrong password is refused; a relaunch also opens locked. *Change password* needs the current one. The search palette lists *Lock DailyBee*.
3. Sign out → wizard again, data intact. Team → Admin → *Create a workspace* against `pnpm dev:api` → Admin and Team in the sidebar, the join code in Settings › Account and via Team › Invite.
4. Sign out → Team → Team member → *Join with a code* → no Admin in the sidebar or the palette; Team lists both members. Sign out → Team → Admin → *Sign in*: a wrong password says so.
5. `pnpm dev:demo` never shows the wizard (signed-in admin of the sample workspace); `pnpm dev:renderer` with `?wizard`, `?locked` (password `demo`) or `?profiles` previews those screens in the browser.
6. Profiles: sign out → the list; *Create a new profile* → a second Solo profile does not see the first one's tasks; *Back to profiles* from a new profile deletes it again; the bin icon removes a closed profile and its file; reopening a solo profile asks for its password and *Forgot your password?* asks the security questions before it sets a new one; a signed-out team profile reopens on its pre-filled sign-in form. A relaunch while signed out opens the list; with a profile open it opens that profile (locked for Solo).

### Phase 1 — shell, Today, timer, dialogs

1. `pnpm dev:demo`. The Today screen must match `design_system/ui_kits/app/Today.jsx`: Tracking badge, task hero, 44px mono timer ticking every second, Stop button with honey glow.
2. Click **Stop** → *Wrapping up* dialog (time mix, "What did you get done?", outcome radio, size select, blocker checkbox). **Save & stop** merges the run into the entry for that task, shows the toast "Entry saved · 1h 21m", and the hero switches to "No active task".
3. Click **Start a task** → *Starting a task* dialog. Picking a task in the Task select fills title, project and size. **Start tracking** shows "Tracking “…”" and the timer restarts from 00:00:00.
4. Press **▶ Resume** on an entry: the dialog opens pre-filled with that entry.
5. Tick an entry's checkbox: it strikes through and counts as done in the report — and, like every hand change, it appears in the change log with an *Edited* badge on the row.
6. Corrections: **Correct** an entry's duration (the badge says *Edited*, the header counts *n edited*), **Split** one after 20 minutes with a new title for the second part (*Split off*), **Add entry** for a call the timer missed (*Added by hand*), **Delete** the split-off part. Open the **Change log** (clock icon on the Entries card): every line, with its hash, and *Chain verified*. Reports › History shows *n edited* on the day; a rebuilt report ends with the footnote and, if it had been sent, shows *Changed since sent* with **Send again**.
7. Navigation persists across restarts (`localStorage` key `db-screen`).

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
7. Idle detection: leave the machine untouched for the configured minutes (Settings › Tracking, default 10) — samples are marked idle and appear as a break. With a task running, coming back after at least two minutes away brings the *Welcome back* card (in the app, or floating when another window is in front): **Leave it out**, **Count it as work** (the timer jumps by the away time) or **Stop at hh:mm** (the wrap-up dialog opens "as of" that moment and the entry gets the reading from then). The decision lands in the bell and in the change log. Without waiting, simulate it from the main-process inspector: `dailybee.presence.emit('away', { reason: 'idle', since: Date.now() - 25 * 60000 })` then `dailybee.presence.emit('back', Date.now())` with `DAILYBEE_DEBUG=1 --inspect=9334`.
8. Today's status line says what is recorded and whether the permission is in place. **Pause tracking** (also in the tray menu) stops the capture while the timer keeps counting; add a **Private app** in Settings › Tracking and its captures for today disappear, its future time shows as a gap.

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
| `DAILYBEE_API_URL`, `DAILYBEE_API_TOKEN` | Sign in to a workspace API as a team admin for this session: skips the wizard, saves nothing |
| `VITE_DAILYBEE_CLOUD_URL` (build time, renderer) | Address of DailyBee Cloud, the hosted workspace API. Empty, the default, shows the wizard's *DailyBee Cloud* option as not available yet |
| `DAILYBEE_DRIFT_MINUTES` | Minutes on a distraction site before the drift popup (default 8; fractions allowed; used when the full-screen warning is off) |
| `DAILYBEE_WARNING_SECONDS` | Seconds on a distraction site before the full-screen warning (default 20, minimum 3) |
| `DAILYBEE_REPORT_TIME` | Policy time for the report scheduler, `HH:MM` |
| `DAILYBEE_LOG_SYNC=1` | Print every scrubbed sync payload |
| `DAILYBEE_USER_DATA=<folder>` | Isolated profile: own database and own single-instance lock, so a test instance can run next to your real one |
| `DAILYBEE_HIDDEN=1` (or `--hidden`, which the login item passes) | Boot the active profile without opening a window when *Start in the tray* is on; the tray icon opens it |
| `DAILYBEE_BACKUP_DIR=<folder>` | Settings › Backup › Export writes `DailyBee-<name>-<date>.dailybee` there instead of asking where |
| `DAILYBEE_DEBUG=1` | Expose the services on the main-process global `dailybee` (`app`, `profiles`, `windows`, `repo`, `settings`, `session`, `tracker`, `checkins`, `reports`, `sync`, `presence`, `tray`, `account`, `entries`, `away`, `backup`, `notifications`) for `--inspect` sessions |
| `DAILYBEE_WIDGET=1` | Show the floating widget regardless of the saved setting (`0` hides it) |
| `DAILYBEE_SMOKE=<file.png>` | Boot, screenshot the window, quit. Combine with `DAILYBEE_SMOKE_SCREEN=today\|reports\|team\|tasks\|admin\|settings`, `DAILYBEE_SMOKE_PROMPT=start\|end\|report\|checkin`, `DAILYBEE_SMOKE_WAIT=<ms>`, `DAILYBEE_SMOKE_HOLD_MS=<ms>` (keep the window open after the capture; the log prints the window bounds so an OS-level screenshot can include the custom title bar and window controls, which `capturePage` leaves out) |

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

Each profile has its own database, `profiles/<id>.sqlite` (an install from before profiles keeps `dailybee.sqlite` as the adopted `default` profile), holding its samples, entries, check-ins, rules, reports, settings, account and the append-only `entry_log`; `profiles.json` lists them; `dailybee-demo.sqlite` holds the demo day. A restore leaves the replaced database beside the profile as `<id>.sqlite.before-restore`. Backups are plain copies of a profile's database under the `.dailybee` extension, wherever you saved them. Delete a file to reset that mode. Samples and the session heartbeat are written within 5 seconds and on quit (Ctrl+C in the dev terminal quits properly); entries, settings and reports within a second. `dailybee.log` (rotated at 1 MB) keeps everything the main process logs, including capture errors and uncaught exceptions.

**Profiles.** `main/services/profiles.ts` keeps `profiles.json`: every profile (id, database file, name, mode, workspace, `provisional` until its wizard finishes, `lastUsedAt`) and `active`, the one to open at launch (null = signed out, which shows the list). `main/index.ts` has `boot(profileId)` and `teardown()`: opening a profile creates its database, every service and the per-profile IPC handlers (`registerIpc`); closing it stops them, saves a running task as an entry, removes the handlers (`unregisterIpc`) and hides the widget, while the app-level handlers (`profiles:*`, window controls; `registerAppIpc`) stay. The renderer store reloads everything on `ev:profiles`. Signed out, closing the window quits (nothing to keep alive in the tray). Demo mode boots the demo day as profile `demo` and never shows the list.

**First-run tour.** `renderer/src/components/Tour.tsx` dims the app and spotlights elements carrying a `data-tour` attribute (`start-task`, `session`, `kpis`, `activity`, `generate-report`, `nav-<screen>`), switching screens per step; the steps adapt to Solo (Projects) or Team (Team, Admin for admins). It starts once per profile (`AccountStatus.tourDone`, set by `account.finishTour` on Done or Skip), never in demo mode, and replays from Settings › Show the tour or the palette's *Take the tour*; the browser mock shows it with `?tour`.

**Accounts.** The `account` kv row holds the wizard result; `AccountStatus` (`shared/types.ts`) is what the renderer sees: mode, role, name, `locked`, `hasPassword` and the workspace name, join code and server. A Solo profile with a password starts every launch locked; the lock is in-process only, the database itself is not encrypted. Team tokens live in `settings.workspace.token` as before. The profile picture is `settings.profile.avatar`, a 160 px square JPEG as a data URL made in the renderer (`components/AvatarPicker.tsx`: file input, drag-and-zoom crop, canvas); `AccountStatus.avatar` and `profiles.json` mirror it (`settings.on('change')` in `boot`) so the lock screen and the profile picker can show it before the database opens. The kit `Avatar` takes `src` and falls back to initials; `components/PersonAvatar.tsx` gives your own initials your picture in Team, Admin and Tasks. Pictures are never synced.

**Time accounting.** The session timer counts active time: `banked` seconds plus the stretch since `activeSince` (`shared/session.ts`). `PresenceService` pauses it on idle (backdated to the last input), screen lock and sleep, and resumes it on input, unlock and wake. `before-quit` stops the run and saves its entry (`stopOnQuit`); a run still open at launch (kill, crash, shutdown) is settled up to the last heartbeat or sample and closed into an entry on the day it started (`settleSession`, `SessionService.recovered` → toast). Demo mode discards it and re-seeds the kit's run. Entries store exact seconds; `tracking.roundTo5` is applied when the report is generated. Activity, focus mix, timeline and check-in streaks weight each sample by the real gap to the next one (capped at 3 × interval, `sampleSeconds`), so a slow tick is not lost.

**Admin without a workspace.** `services/admin.ts` (`buildLocalAdmin`) computes the Admin view from this device's day digests, entries, reports, tasks and projects for the chosen range and the period before it, mirroring the API's `adminOverview`; `SyncService.admin()` uses it whenever no workspace answers. Projects live in the `projects` kv list (`Repo.projects()`, `id`, `name`, `color`, `budgetHours`, `archived`); `data:saveProject` / `data:removeProject` change it (delete is refused while `Repo.projectUsage` finds tasks or entries) and mirror the change to a connected workspace through `admin.projects.save/remove`; `admin.projects.list` is pulled after each admin fetch and wins for names, colours and budgets. `team:setPolicy` calls `admin.policy.set` for leads.

**Day digests.** `day_digest` stores each finished day's breakdown (rows, mix, timeline, first/last sample, `DayDigest`). `TrackerService.maintain()` runs at start and at midnight: it digests every day that still has samples and prunes samples older than yesterday (`RAW_SAMPLE_DAYS`). `reports.day(day)` (`ReportService.day`) returns a `DaySummary` — the digest or live summary plus entries, check-ins and the report — which Reports › History renders with the same components as Today (`renderer/src/components/DayCards.tsx`). `reports.history()` lists every day with entries, a digest, a report or samples.

## 9. Troubleshooting

- **"Electron failed to install correctly"** — run `node node_modules/electron/install.js`.
- **`ERR_PNPM_IGNORED_BUILDS`** — `pnpm approve-builds electron esbuild electron-winstaller`, then `pnpm install`.
- **Port 5173 in use** — the renderer dev server uses `strictPort`; stop the other process or change `server.port` in `apps/desktop/electron.vite.config.ts`.
- **Blank activity list in live mode** — Windows: check the terminal for `[tracker/win32]` lines (the PowerShell sidecar prints errors there). macOS: grant Accessibility, then Automation for your browser. Linux: install `xdotool`; Wayland is not supported.
- **Browser rows show titles but no URLs** — the address bar could not be read (permission denied, or an unsupported browser). The row still carries the page title from the window title.
- **Team/Admin show the sample team** — no workspace configured, or the API is unreachable; Settings › Workspace shows the sync status and last error.
- **Fonts look wrong** — Google Fonts could not be loaded (offline); the UI falls back to the system stack.

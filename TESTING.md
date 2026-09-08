# How to test DailyBee on Windows

A plain step-by-step guide for **PowerShell** on Windows. Open the `daily-bee` folder in Explorer, right-click an empty spot → *Open in Terminal* (or open PowerShell and `cd` into the folder). Every step says what you should see.

**About the `corepack pnpm` prefix.** This project uses the pnpm package manager. On this machine plain `pnpm` is not on PowerShell's PATH, so every command below runs it through Corepack, which ships with Node: `corepack pnpm <command>`. Corepack picks the version pinned in `package.json` (pnpm 10.34.5, a pure-JavaScript release; newer pnpm versions ship an unsigned native `.exe` that this PC's Smart App Control blocks). If Corepack ever asks *"Do you want to continue? [Y/n]"*, answer `Y`. If you later make plain `pnpm` work (see the last section), just drop the `corepack ` prefix everywhere.

The long reference with every option is [DEVELOPMENT.md](DEVELOPMENT.md); you do not need it for this guide.

---

## Step 0 — one-time setup (about 3 minutes)

```powershell
node --version              # v22 or newer
corepack pnpm --version     # prints 10.34.5
corepack pnpm install
```

You should see `Done in …s` (or `Already up to date`). Internet is needed the first time (Electron is about 250 MB). If pnpm says the modules directory "will be removed and reinstalled from scratch" and asks to proceed, answer `Y`.

Check that everything is wired up:

```powershell
corepack pnpm typecheck
corepack pnpm test
```

Expected: four lines ending in `typecheck: Done`, then `Tests 18 passed`, `Tests 5 passed`, `Tests 2 passed`. If you see red `error` lines, stop here and send them to me.

---

## Step 1 — see the app with fake data (5 minutes)

```powershell
corepack pnpm dev:demo
```

A **DailyBee** window opens after a few seconds (the terminal keeps printing, leave it open). The day is pre-filled with the sample data from the design kit: a task running since about 80 minutes ago, four entries, a timeline, an activity list, two check-ins.

Try, in this order:

1. **Timer** — the big `01:2x:xx` number ticks every second.
2. **Stop** → *Wrapping up* dialog → **Save & stop**. Expected: toast "Entry saved · 1h 2xm", the card shows *Idle* / *No active task*, and the *Timer sync across devices* row in Entries grew by that time.
3. **Start a task** → dialog → set the size to *Small* → **Start tracking**. Expected: toast "Tracking “…”", the timer restarts at `00:00:00`.
4. In Entries, tick a checkbox → the task strikes through. Press the **▶** at the end of a row → the *Starting a task* dialog opens pre-filled with that task.
5. **Check-in** (top bar) → a popup appears top-right. Answer it. Expected: toast "Noted: …" and a new line in the *Check-ins* card.
6. In Activity, click a *Google Chrome* row → it expands into pages. Press the **tag** icon on a page → pick another category → the badge, the mix bar and the Focus % update.
7. **Generate report** (top bar) → a short loading list, then the drafted report. **Copy markdown** copies it (paste into Notepad to check). **Send report** → toast "Report sent to 4 teammates" (demo mode pretends).
8. Sidebar: open **Reports**, **Team**, **Tasks**, **Admin**, **Settings**. Everything renders with sample data; on Tasks click a row → **Save assessment** → toast.

Close the window to stop (or `Ctrl+C` in the terminal). Demo data is kept in its own file and never mixes with your real data.

---

## Step 2 — real tracking of what you do (5 minutes)

```powershell
corepack pnpm dev
```

The window opens empty: *No active task*, no entries.

1. **Start a task**, type anything, **Start tracking**.
2. Now actually work for two minutes: open Chrome or Edge, visit github.com, then youtube.com, switch to another program, come back to DailyBee.
3. Expected on **Today**:
   - *Now in …* under the task names the program you were in a moment ago.
   - **Activity** lists the programs with a category badge (VS Code/Terminal = Work, Slack = Communication, youtube.com = Distraction, github.com = Work …). Browser rows expand into the pages you visited **with their addresses** — that is the "no browser extension" capture, read through Windows UI Automation.
   - The **Timeline** grows to the right; the **Focus** mix bar changes.
4. **Settings → System permissions** shows *UI Automation · Built in* (Windows needs no permission). Press **Test capture**: it prints the program in front, its title and, for a browser, the page address.
5. **Stop** → fill the dialog → **Save & stop** → the entry appears in Entries and on **Reports**.
6. Close the window with the **×**: DailyBee keeps running and tracking in the system tray (honey square next to the clock; the first time Windows shows a small balloon saying so). Double-click the tray icon to open it again; right-click for the menu: status, **Open DailyBee**, **Start a task…** / **Stop task…**, **Generate report…**, **Floating widget**, **Quit DailyBee**. Quitting only works from that menu.
7. Tick **Floating widget** in the tray menu (or Settings → Tracking): a small translucent panel appears bottom-right with the timer, the task name and the app or page you are on with its category. Drag it anywhere (the spot is remembered), double-click it to open DailyBee, **×** hides it.

If a browser row shows a page title but no address, that browser is not supported yet (Chrome, Edge, Brave, Vivaldi, Opera and Firefox are).

---

## Step 3 — force a check-in popup without waiting 8 minutes

Close the app, then in the same terminal:

```powershell
$env:DAILYBEE_DRIFT_MINUTES = "0.5"
corepack pnpm dev
```

Start a task, then stay on **youtube.com** (or reddit.com) for 30 seconds:

- If the DailyBee window is active, the *Drifting?* popup appears in its top-right corner.
- If you are still in the browser, a small always-on-top popup appears at the top-right of the screen.

Press **Back to it**, **Taking a break** or **This is work** (the last one recategorises that site as work). The answer shows in the *Check-ins* card and in the report.

The halfway check-in fires at 50 % of the task size (Trivial = 15 min). The **Check-in** button in the top bar shows both popup variants instantly if you only want to see them.

Afterwards clear the override, or it stays set for the rest of that terminal session:

```powershell
Remove-Item Env:DAILYBEE_DRIFT_MINUTES
```

---

## Step 4 — the daily report

1. **Today → Generate report** (or the same button on **Reports**).
2. On **Reports**, type something in *Notes & blockers* — it becomes the Blockers section. **Preview** shows the final report.
3. **Send report** needs a destination. Without one you get the warning "Add a Slack webhook or email address in Settings › Delivery". To really send:
   - **Slack**: create an *Incoming Webhook* in your Slack workspace (Slack → Apps → Incoming WebHooks → Add), paste the `https://hooks.slack.com/…` URL into **Settings → Delivery → Slack incoming webhook**, **Save changes**, then **Send report**. The message lands in the channel you picked in Slack.
   - **Email without a mail server**: with Docker Desktop, run `docker run -p 1025:1025 -p 8025:8025 axllent/mailpit`, then set *SMTP URL* to `smtp://localhost:1025` and any *Email to*. Sent mails appear at http://localhost:8025.
4. Automatic sending happens at the time in **Settings → Delivery → Send at** (18:00 by default, weekdays). To test it in a minute, close the app and start it with the time set to a minute from now:

   ```powershell
   $env:DAILYBEE_REPORT_TIME = "14:31"
   corepack pnpm dev
   ```

   Expected within a minute: toast "Daily report drafted — review it in Reports" (or "Report sent to …" when a webhook is configured and *Auto-send* is on). Clear it afterwards: `Remove-Item Env:DAILYBEE_REPORT_TIME`.

---

## Step 5 — Team and Admin with the sync API (5 minutes)

You need **two** terminals in the project folder.

Terminal 1 — the API (no database needed, it runs in memory with a sample team):

```powershell
corepack pnpm dev:api
```

Expected: `[api] listening on http://localhost:8787/trpc`. Leave it running.

Terminal 2 — the app, connected to it:

```powershell
$env:DAILYBEE_API_URL = "http://localhost:8787"
$env:DAILYBEE_API_TOKEN = "demo-ml"
corepack pnpm dev:demo
```

1. Open **Team**. The "Sample team" footer line is gone; the six members come from the API and your own row (ML) shows your local hours a few seconds after launch (the app pushes today's totals 3 s after start, every 15 min, and after every *Save & stop* or report send).
2. Open **Admin**: KPIs, category mix, alerts. **People** tab → click a row → side panel → **Nudge** → toast.
3. Privacy check: nothing in terminal 1 contains a web address. To see exactly what leaves the machine, start the app with `$env:DAILYBEE_LOG_SYNC = "1"` as well: the terminal prints `[sync] payload …` with entries, outcomes, check-in answers, category percentages and program names, and nothing else.
4. Instead of the env vars you can type the URL and token into **Settings → Workspace** and press **Save changes**.

Stop both with `Ctrl+C`, then `Remove-Item Env:DAILYBEE_API_URL, Env:DAILYBEE_API_TOKEN`.

---

## Step 6 — run the real (built) app instead of the dev server

Production build, launched directly (about a minute the first time):

```powershell
corepack pnpm build
corepack pnpm start
```

Same app, no hot reload, no dev server. Add `$env:DAILYBEE_DEMO = "1"` before `corepack pnpm start` for the fake day. It uses the same data folder as `corepack pnpm dev`.

Standalone folder you can double-click:

```powershell
corepack pnpm package:dir
```

Then run `apps\desktop\release\win-unpacked\DailyBee.exe`. This works on this PC because Windows knows the file was built here.

Package for someone else:

```powershell
corepack pnpm package
```

Produces `apps\desktop\release\DailyBee-0.1.0-win.zip` (unzip, run `DailyBee.exe`).

**Important limitation on this PC.** Windows 11 **Smart App Control** is switched on here (Windows Security → App & browser control → Smart App Control). It only lets unsigned programs run when they were built on this machine, so:

- an unzipped copy of the zip is blocked with *"An Application Control policy has blocked this file"* — even on this same PC;
- a classic `Setup.exe` installer cannot even be built here: electron-builder runs the unsigned installer stub during the build and Smart App Control stops it (`spawn UNKNOWN`).

To distribute DailyBee to other people you need a code-signing certificate, or a build machine and test machines without Smart App Control (on those, `corepack pnpm --filter @dailybee/desktop exec electron-builder --win nsis` produces `DailyBee Setup 0.1.0.exe`, and the zip runs after a SmartScreen "Run anyway"). Turning Smart App Control off is a Windows security setting — your decision, and Windows does not let you turn it back on without reinstalling.

---

## Where your data is, and how to start over

Everything is in `%APPDATA%\DailyBee` (paste that into Explorer's address bar):

- `dailybee.sqlite` — real tracking data, entries, reports, settings
- `dailybee-demo.sqlite` — the demo day

Close the app and delete a file to reset that mode.

---

## Optional: make plain `pnpm` work

Two things stop `pnpm` from working in PowerShell on this machine: npm's global folder is not on PATH, and PowerShell's default policy blocks the `.ps1` launcher scripts that npm and pnpm install. Both are your settings to change, so run them yourself if you want them:

1. In a PowerShell opened **as Administrator**: `corepack enable pnpm` (adds `pnpm` next to `node.exe`, which is on PATH).
2. In a normal PowerShell: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (lets locally installed launcher scripts run).
3. Open a new terminal. `pnpm --version` now works and you can drop the `corepack ` prefix from every command above. Inside this project the shim runs the pinned pnpm 10; in other folders Corepack may pick a newer pnpm whose native binary Smart App Control blocks — that is expected, not a DailyBee problem.

Command Prompt (cmd.exe) is not affected by the execution policy, so after step 1 alone `pnpm` already works there.

---

## If something goes wrong

| What you see | What to do |
| --- | --- |
| `corepack` is not recognized | Node is too old or was installed without Corepack; install the current LTS from https://nodejs.org |
| `Could not run the pnpm binary at …\pnpm-native.exe: spawnSync … UNKNOWN` | Smart App Control blocked pnpm 12's native binary. The project now pins pnpm 10 (JavaScript, no binary): run `corepack pnpm --version` again from the project folder, it must print `10.34.5` |
| `Cannot find native binding` (rolldown / vite / vitest) | Smart App Control blocked a freshly downloaded native module. Run the command again (Windows usually allows it once its reputation is known); the project also ships rolldown's WebAssembly fallback |
| `The token '&&' is not a valid statement separator` | Windows PowerShell 5.1 has no `&&`; put the commands on separate lines or use `;` |
| "Electron failed to install correctly" | `node scripts\ensure-electron.mjs` |
| `ERR_PNPM_IGNORED_BUILDS` | `corepack pnpm approve-builds electron esbuild electron-winstaller`, then `corepack pnpm install` |
| Window opens blank / fonts look odd | wait a few seconds (fonts come from Google Fonts); check the terminal for red lines |
| Activity stays empty in `corepack pnpm dev` | look for `[tracker/win32]` lines in the terminal and send them to me |
| Port 5173 (or 5174, 8787) already in use | another copy is still running; close it or `Ctrl+C` in the other terminal |
| Team/Admin still say "Sample team" | the API terminal is not running, or the env vars were set in a different terminal window |
| `spawn UNKNOWN` while building an installer | Smart App Control is blocking the unsigned installer stub; use the zip package (Step 6) or build the installer on another machine |

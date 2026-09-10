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

A **DailyBee** window opens after a few seconds (the terminal keeps printing, leave it open). The day is pre-filled with the sample data from the design kit: a task running since about 80 minutes ago, four entries, a timeline, an activity list, two check-ins. Demo mode skips the setup wizard (Step 2) and behaves as a signed-in admin of the sample workspace.

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

The first time, DailyBee asks **how you will use it**:

- **Solo** — everything stays on this PC and works offline. The next screen asks for your name, an optional email, a password typed twice (at least 6 characters; *Create profile* refuses until both match) and two **security questions** with their answers. You land on **Today**, and the sidebar shows Today, Reports, Tasks, Projects and Settings — nothing team-related.
- **Team** — asks whether you are an **admin** or a **team member**, then shows the sign-in form for that role. It needs the sync API (Step 5 walks through it).

Pick **Solo** for now. From then on DailyBee opens on a **lock screen** asking for that password; tracking keeps running behind it. **Settings → Account → Lock now** (or *Lock DailyBee* in the search palette) locks it on demand, and **Change password** and **Solo or Team…** (switch the open profile between the two) sit on the same card. *Forgot your password?* on the lock screen asks your two security questions (answers are not case-sensitive; five wrong tries block it for 30 seconds) and then lets you set a new password. A profile made before security questions existed has none; add them under **Settings → Account → Security questions → Set up**, or its password cannot be reset.

**Profiles.** *Sign out* (the button at the bottom of Settings, *Switch profile* on the lock screen, or the search palette) closes your profile and shows the **profile list**: every profile on this PC with its name and whether it is Solo or a team account. Click yours to open it (Solo asks for its password), or **Create a new profile**: a second profile has its own tracked days, tasks, reports and settings, so someone else can use the same PC without seeing yours. *Back to profiles* while creating one throws the new profile away again. The bin icon on a card removes a profile and all its data after a confirmation. While the list is showing, nothing is tracked. A relaunch opens the profile that was open, or the list when you had signed out.

The window opens empty: *No active task*, no entries, no projects. **Projects** in the sidebar → **New project** creates one (name, colour, weekly budget); tasks without a project are fine too.

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

**How time is counted.** The task timer counts active time only. Leave the computer alone for 10 minutes (Settings → Tracking → Idle detection), lock the screen, or let it sleep, and the timer pauses: the badge changes to *Paused*, a toast says why, and the idle minutes before detection are taken off the clock. Any key or mouse movement resumes it. **Quitting the app stops the timer**: the running task is saved as an entry marked *Partly done*. Closing the window with **×** does not quit (the app keeps tracking in the tray). If the app dies without quitting (kill, crash, shutdown), the next launch closes the run with the time counted up to the last heartbeat and shows a toast saying so. Entries store exact seconds; **Round entries to 5 min** only rounds the daily report. Activity and Timeline are measured from 3-second samples of the window in front, so their totals can differ from the timer by a few seconds.

**Past days.** Reports → History lists every day with tracked time. Open a row and you get the whole Today layout for that day: tracked time, focus mix, check-ins, timeline, apps and pages, entries, plus the report if one was generated (or a button to generate one). Today's row is there too, and **Full breakdown** on the Today tab opens the same view. Raw captures are kept for today and yesterday; older days are stored as a saved breakdown, so the history stays complete without the database growing.

Anything the app logs (capture problems, database writes) also lands in `%APPDATA%\DailyBee\dailybee.log`. Paste its last lines when something looks off.

---

## Step 3 — the distraction warning and check-ins

Start a task with `corepack pnpm dev`, then open **tiktok.com** (or youtube.com, reddit.com — anything categorised as distraction) and stay there for 20 seconds. The whole screen dims and a *Drifting?* card appears on top of whatever you were doing, naming the site and your task:

- **Back to it** — closes it; it can warn again after a couple of minutes if you are still there.
- **Taking a break** — closes it and stays quiet for 15 minutes.
- **This is work** — recategorises that site as work, so it never warns for it again.
- **Esc** dismisses.

Tune it in **Settings → Check-ins**: switch the full-screen warning off (then the small drift popup after N minutes is used instead), change the seconds before it appears, the quiet time after a break, the drift minutes, and the halfway check-in. To test faster than 20 seconds start with `$env:DAILYBEE_WARNING_SECONDS = "5"` (clear it afterwards with `Remove-Item Env:DAILYBEE_WARNING_SECONDS`).

The halfway check-in fires at 50 % of the task size (Trivial = 15 min). The **Check-in** button in the Today top bar shows the three variants one after another (popup, halfway, full-screen warning) if you only want to see them. Every answer shows in the *Check-ins* card and in the report.

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

Terminal 2 — the app, in a second profile so your Solo data stays untouched:

```powershell
$env:DAILYBEE_USER_DATA = "$env:TEMP\dailybee-team"
corepack pnpm dev
```

1. The wizard appears (new profile). Pick **Team → Admin → Create a workspace**: under *Workspace location* pick **Your own workspace server** (*DailyBee Cloud* is listed but not available in this build yet; *How to set up your own server* opens a step-by-step guide whose *Check server* button tells you whether an API answers at an address), server `http://localhost:8787`, a workspace name, your name, email and a password twice → **Create workspace**. Toast "Signed in to … as an admin", the sidebar footer reads "<workspace> · admin · synced" a few seconds later, and **Team** and **Admin** are in the sidebar.
2. **Settings → Account** shows the **join code** for teammates (**Team → Invite** copies it together with the server address). Note it down.
3. Open **Team**: only you for now, with your local hours (the app pushes today's totals right after signing in, every 15 min, and after every *Save & stop*). Open **Admin**: KPIs, category mix, alerts; **People** tab → click a row → side panel → **Nudge** → toast; **Projects** tab → **New project** is saved to the workspace, so every member gets it.
4. Now be a teammate: **Sign out** at the bottom of Settings (your admin profile stays in the list), then **Create a new profile** and pick **Team → Team member → Join with a code**: server, the join code, name, email, password → **Join workspace**. The sidebar has **no Admin** (nor the search palette), **Team** lists both members, and **Settings → Account** says *member*.
5. Sign out again and click the admin profile in the list: its sign-in form comes back with the server and email filled in. A wrong password says "Wrong email or password"; the right one brings Admin back.
6. Privacy check: nothing in terminal 1 contains a web address. To see exactly what leaves the machine, start the app with `$env:DAILYBEE_LOG_SYNC = "1"` as well: the terminal prints `[sync] payload …` with entries, outcomes, check-in answers, category percentages and app names, and nothing else.
7. Without the wizard: `$env:DAILYBEE_API_URL = "http://localhost:8787"` and `$env:DAILYBEE_API_TOKEN = "demo-ml"` before launching sign you in as the sample team's lead for that session only (the wizard is skipped, nothing is saved).

Stop both with `Ctrl+C`, then `Remove-Item Env:DAILYBEE_USER_DATA`.

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

## Step 7 — search, notifications, tasks, export, CLI

- **Search** (magnifier in the top bar, or Ctrl+K): type a task name, an entry, or "report" and press Enter. Actions at the top start or stop a task, generate a report, or simulate a check-in.
- **Bell**: today's check-ins with your answers, the report's status, sync state and timer pauses. The honey dot means something new since you last opened it.
- **Tasks → New task** creates a real backlog item (it appears in the Start-task list). In **Board** view drag a card to another column to change its status. The owner list is you plus whoever already owns a task.
- **Reports → History → a row** opens that day's report read-only; **Preview** shows the saved draft without rebuilding it.
- **Admin** works without a workspace: Overview, People and the alerts are computed from your own days, entries, tasks and projects for the week, the last 30 days or the last 90 days, compared with the period before. **Projects** has **New project** (name, colour, weekly budget); click a card to edit, archive or delete it (delete is refused while tasks or entries still use it). Archived projects disappear from the task pickers. **Export** saves the people or the projects table as CSV, depending on the tab. **Policy** shows this device's switches. With a workspace connected (Step 5) all of it switches to team data: projects you add are pushed to the workspace, the workspace's budgets come back, the team selector lists the teams, and leads can flip the workspace policy.
- **CLI**: with the app running, `node scripts/dailybee.mjs status`, `start "name"`, `stop`. Turn on **Start timer on git commit**, run `node scripts/dailybee.mjs hook install` inside a repository, and the next commit starts a task named after it.

Team and Admin show a clearly labelled sample team until Settings → Workspace points at the API (Step 5); only your own row is real before that.

## Where your data is, and how to start over

Everything is in `%APPDATA%\DailyBee` (paste that into Explorer's address bar):

- `dailybee.sqlite` — real tracking data, entries, reports, settings
- `dailybee-demo.sqlite` — the demo day
- `profiles.json` — the profile list and which profile is open; `profiles<id>.sqlite` — one database per profile made from the list (name, password hash or workspace token, tracked days, tasks, reports, settings). An install from before profiles keeps its `dailybee.sqlite` as the *default* profile. Removing a profile from the list deletes its file.

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

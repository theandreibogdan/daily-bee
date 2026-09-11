<p align="center"><img src="assets/dailybee-logo.svg" width="96" alt="DailyBee"></p>

# DailyBee

Developer time tracking that runs on your own machine. DailyBee watches which app and browser tab
is in front (through the operating system's accessibility and automation interfaces, no browser
extension), keeps a timer per task, asks you at the right moments, and turns the day into a report
you can correct by hand and send to your team. Everything is stored locally in SQLite; a team
server is optional and only ever receives aggregates, never page URLs or window titles.

Free and open source. Build it yourself in a few minutes, or download a release.

## What it does

- **Track** a task with one click, a tray click or a global shortcut. The timer counts active time only: idle, lock and sleep pause it, and when you come back DailyBee asks what to do with the time away.
- **See where the time went**: apps and browser pages sorted into Work, Research, Learning, Communication and Distraction, a timeline, focus percentage, check-ins on distraction sites.
- **Correct the record**: edit, split, delete or add entries. Every change lands in an append-only, hash-chained change log, and corrected entries carry a badge.
- **Report**: a daily report generated from entries, activity and check-ins, sent to Slack or email or copied as Markdown; a week view; history for every day.
- **Tasks and projects** with estimates, logged time, priorities and weekly budgets.
- **Solo or team**: a local profile with a password, or a workspace on a server you run (`deploy/cloud`) where leads see team and admin views built from aggregates only.
- **Runs like an app**: tray icon, launch at login, start in the tray, backup and restore, profile picture, self-updates from a feed you host.

## Quick start (any platform)

Requirements: [Node.js 22](https://nodejs.org) or newer, git, and the platform's build tools listed below for packaging. pnpm comes with Node through Corepack.

```bash
git clone <this repository> daily-bee
cd daily-bee
corepack enable            # once; makes the pinned pnpm available
pnpm install
pnpm dev                   # runs DailyBee with real tracking (hot reload)
```

`corepack enable` needs an administrator terminal on Windows. Without it, prefix every pnpm command with `corepack ` (`corepack pnpm install`, `corepack pnpm dev`), as the Windows commands below do; the build scripts handle the rest themselves.

`pnpm dev:demo` starts it with a sample day instead of real tracking, which is the quickest way to see every screen.

## Build it as a desktop app

The desktop app is built per platform: build on Windows for Windows, on macOS for macOS, on Linux for Linux. There are no native modules to compile; the trackers are scripts and system tools.

### Windows

```powershell
corepack pnpm package:zip
```

produces `apps/desktop/release/DailyBee-<version>-win.zip`. Unzip it anywhere (for example `%LOCALAPPDATA%\Programs\DailyBee`) and run `DailyBee.exe`; pin it to the taskbar or Start from there. The zip is what a machine with **Smart App Control** can build: the NSIS installer build (`corepack pnpm package`) runs an unsigned installer stub that Smart App Control blocks, so the installer is built elsewhere or in CI.

```powershell
corepack pnpm package
```

produces `apps/desktop/release/DailyBee-Setup-<version>.exe`, a one-click per-user installer that adds a Start menu entry and is what the self-updater updates.

When you first run an unsigned build, SmartScreen shows *Windows protected your PC*; choose *More info → Run anyway*. Machines with Smart App Control on refuse unsigned programs entirely; RELEASING.md covers signing (SignPath Foundation signs open-source releases for free).

Tracking needs nothing beyond Windows itself: window titles and the browser address bar come from UI Automation, which is built in.

### macOS

Requires Xcode Command Line Tools (`xcode-select --install`).

```bash
pnpm package
```

produces `apps/desktop/release/DailyBee-<version>.dmg` and a `.zip`. Open the dmg and drag DailyBee to Applications.

An unsigned app is refused by Gatekeeper. For your own machine: open System Settings › Privacy & Security after the first attempt and choose *Open Anyway*. For other people, sign and notarize with an Apple Developer ID (RELEASING.md).

On first run DailyBee asks for **Accessibility** (window titles and the address bar), **Automation** per browser (the active tab) and **Screen Recording** (titles of other apps); Settings › System permissions opens the right panes. Without a permission it falls back to app names.

### Linux

```bash
pnpm package
```

produces `apps/desktop/release/DailyBee-<version>.AppImage` and a `.deb`.

- **AppImage**: `chmod +x DailyBee-*.AppImage` and run it. It needs `libfuse2` on some distributions (`sudo apt install libfuse2`). Integrate it into the menu with a tool such as AppImageLauncher, or just keep it in `~/Applications`.
- **deb**: `sudo apt install ./DailyBee-<version>.deb` adds a menu entry and pulls the dependencies.

Tracking reads the active window with `xdotool` on X11 (`sudo apt install xdotool`). A Wayland session exposes no foreground window to applications, so there DailyBee keeps the timer and reports but cannot see apps and tabs; Settings › System permissions says which case you are in.

### Running the built app without packaging

`pnpm build` compiles everything into `apps/desktop/out/`; `pnpm start` runs Electron on it. That is the fastest loop for trying a build on your own machine.

## Make it behave like an installed app

- **Tray**: closing the window keeps DailyBee tracking in the tray. Right-click the tray icon to resume the last task, start a recent one, stop, generate the report, pause tracking or quit.
- **Launch at login and start in the tray**: Settings › Startup. Registration with the operating system happens in packaged builds.
- **Global shortcut**: Ctrl+Alt+D (⌘⌥D on macOS) stops the running task or resumes the last one; change it under Settings › Keyboard shortcut.
- **Notifications**: everything that lands in the bell also shows as a system notification; switch it off under Settings › Notifications.
- **Backups**: Settings › Backup exports the profile as one file; the profile list restores one as a new profile.
- **Updates**: a packaged app checks the feed it was built with (`DAILYBEE_UPDATE_URL`) twice a day and installs on quit. See RELEASING.md for hosting a feed; the cloud stack serves one.

## Team use (optional)

The sync API lives in `apps/api` and runs with Postgres. `deploy/cloud` starts API, database and the update feed with one `docker compose up -d --build`; [deploy/cloud/README.md](deploy/cloud/README.md) has the steps and [DailyBee cloud testing.md](<DailyBee cloud testing.md>) walks through the same on Coolify. Point the desktop build at it with `VITE_DAILYBEE_CLOUD_URL` and the wizard's *DailyBee Cloud* option becomes real, or enter any server address under *Your own workspace server*.

## Layout

pnpm monorepo:

| Package | What |
| --- | --- |
| `apps/desktop` | Electron main + preload + React renderer (electron-vite, Vite, React 19). Local store is SQLite via `sql.js` in the user data folder, one database per profile. |
| `apps/api` | tRPC over HTTP with Postgres for team and admin sync. Falls back to an in-memory repository with a sample team when `DATABASE_URL` is unset. |
| `packages/ui` | The design-system primitives in TypeScript (Button, Dialog, Timer, MixBar, Logo, …) plus the token CSS. |
| `packages/tracker` | Activity capture: foreground app and window title every few seconds, browser URL via UI Automation (Windows), AppleScript and Accessibility (macOS), xdotool and the Firefox session store (Linux); categorisation rules and aggregation. Pure TypeScript. |
| `deploy/cloud` | Docker Compose for the team server, its database and the update feed. |
| `assets` | The logo. `pnpm icons` renders it to every icon size the app needs. |
| `landing` | The project website: landing page with screenshots and an interactive demo, plus the install-and-use guide. Static HTML, CSS and JavaScript; `pnpm site` serves it locally. See [landing/README.md](landing/README.md). |

Design source of truth: the DailyBee design system under `DailyBee Design System/`.

## Development

```bash
pnpm dev                 # desktop app, real tracking
pnpm dev:demo            # desktop app with the sample day
pnpm dev:renderer        # renderer only in a browser, with mock data
pnpm dev:api             # sync API on http://localhost:8787/trpc
pnpm site                # the website on http://localhost:8790
pnpm typecheck && pnpm test
```

[DEVELOPMENT.md](DEVELOPMENT.md) is the developer guide (architecture notes per feature, environment variables, manual test plan), [TESTING.md](TESTING.md) a plain walkthrough for testing on Windows, [RELEASING.md](RELEASING.md) the release, signing and update-feed guide.

## Privacy

Per-page URLs and window titles never leave the device. The sync code scrubs every payload (forbidden keys dropped, URL-shaped text redacted) and the server rejects them again with strict schemas. Managers see app names and categories only. Solo profiles never touch the network.

## Contributing and licence

Issues and pull requests are welcome; `pnpm typecheck && pnpm test` must pass, and the design kit is the reference for anything visual. The licence file is still to be added by the project owner.

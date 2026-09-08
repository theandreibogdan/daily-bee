# DailyBee

Developer time tracking, daily reports, task assessment and team dashboards — a desktop app that watches the app in front and the browser tab you are on (through OS accessibility and automation, no browser extension), turns the day into a shareable report, and gives leads a calm overview.

Design source of truth: the DailyBee design system installed as a Claude Code skill at `.claude/skills/dailybee-design/` (tokens, React primitives, UI kits). The handoff package is kept verbatim under `DailyBee Design System/`.

## Layout

pnpm monorepo:

| Package | What |
| --- | --- |
| `apps/desktop` | Electron main + preload + React renderer (electron-vite, Vite 8, React 19). Local store is SQLite via `sql.js` in `userData`. |
| `apps/api` | tRPC over HTTP with Postgres for team/admin sync. Falls back to an in-memory repository with the sample team when `DATABASE_URL` is unset. |
| `packages/ui` | The design-system primitives ported to TypeScript (Button, Dialog, Timer, MixBar, CategoryBadge, …) plus the token CSS copied from the design system. `pnpm sync-tokens` re-copies the tokens. |
| `packages/tracker` | Activity capture: foreground app + window title every 3 s, browser URL via UI Automation (Windows) / AppleScript-JXA + Accessibility (macOS) / xdotool + Firefox session store (Linux), window-title fallback, categorisation rules, aggregation into activity rows, category mix and timeline. Pure TypeScript, no native modules. |

## Run

```bash
pnpm install
pnpm dev                 # desktop app, real OS tracking
pnpm dev:demo            # desktop app seeded with the kit's fake day
pnpm dev:renderer        # renderer only at http://localhost:5174 with mock data (no Electron)
pnpm dev:api             # sync API on http://localhost:8787/trpc (in-memory unless DATABASE_URL is set)
pnpm typecheck && pnpm test
pnpm package             # electron-builder installers under apps/desktop/release (pnpm package:dir for an unpacked build)
```

No `pnpm` on PATH? Prefix the commands with `corepack ` (`corepack pnpm dev:demo`); Corepack ships with Node.

The full developer guide — dev servers, environment overrides, building installers, the automated suites and a phase-by-phase manual test plan — is in [DEVELOPMENT.md](DEVELOPMENT.md). A plain Windows walkthrough is in [TESTING.md](TESTING.md).

The Windows / macOS / Linux capture paths live in `packages/tracker/src/sampler/`. macOS needs Accessibility, Automation (per browser) and Screen Recording; the checklist in Settings › System permissions opens the right panes. Without a permission DailyBee degrades to app names only.

## Privacy

Per-page URLs and window titles never leave the device. `apps/desktop/src/main/services/sync.ts` scrubs payloads (forbidden keys dropped, URL-shaped text redacted) and `apps/api/src/schemas.ts` rejects them again on the server with strict zod schemas. Managers see app names and categories only.

## Verification hooks

`DAILYBEE_SMOKE=<png> DAILYBEE_DEMO=1 electron .` boots the built app, optionally navigates (`DAILYBEE_SMOKE_SCREEN=reports`) or opens a dialog (`DAILYBEE_SMOKE_PROMPT=start|end|report|checkin`), captures the window and quits. Opening the renderer dev server in a plain browser uses an in-memory mock of the main process (`apps/desktop/src/renderer/src/bridge/mock.ts`).

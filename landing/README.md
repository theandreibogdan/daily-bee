# DailyBee website

The public site for the open-source project: a landing page (`index.html`) and the install-and-use guide (`tutorial.html`). Plain HTML, CSS and JavaScript, no build step, no dependencies. It follows the DailyBee design language (dark hive hero with the honeycomb pattern, honey accent, Bricolage Grotesque headlines, Instrument Sans body, JetBrains Mono numbers).

## Before publishing

1. **Repository address**: `repo` in [`config.js`](config.js) (currently the GitHub repository). Every GitHub and Issues link is built from it.
2. Keep `version` in `config.js` in step with `apps/desktop/package.json`; the download names on both pages use it.
3. `contact` in `config.js` is where every Contact button and link goes (currently a Google Form). Leave it empty to hide them.
4. **Site address**: the canonical and Open Graph tags in both pages, `sitemap.xml` and `robots.txt` use `https://dailybee.dev`. If the site lives at another address (for example a `*.pages.dev` domain), replace it in those four files; search for `dailybee.dev`.

## Metadata and search

Both pages carry a full head: title and description, canonical URL, Open Graph and Twitter card tags pointing at `assets/og.png` (1200×630), icons, and JSON-LD structured data (`WebSite` and `SoftwareApplication` on the landing page, `TechArticle` on the guide). `sitemap.xml` and `robots.txt` sit at the folder root.

The Open Graph image is rendered from `scripts/og-template.html` with `pnpm og` (Electron draws it with the site's fonts and the current Today screenshot, at 2× and downscaled). Re-run it after changing the headline or the screenshot.

## Preview locally

From the repository root:

```bash
pnpm site
```

serves it on http://localhost:8790 with no dependencies (`scripts/serve-landing.mjs`). Any other static server works too, and `landing/index.html` also opens straight from the file system (the honeycomb, demo and links all work without a server; only the copy buttons need `https` or `localhost`).

## Publish

The folder is static, so GitHub Pages, Netlify, Cloudflare Pages or any web host can serve it as is. For GitHub Pages: Settings › Pages › *Deploy from a branch*, folder `/landing` (or copy the folder to the `gh-pages` branch root).

## Files

| Path | What |
| --- | --- |
| `index.html` | Landing page: hero, product, a tour with screenshots, the interactive demo, privacy, open source, footer. |
| `tutorial.html` | Install and use: building from source per platform, first run and permissions, tracking, corrections, reports, tray and shortcuts, backups and updates, team server, troubleshooting. |
| `css/site.css` | The app's design tokens plus the site's components and animations. |
| `js/site.js` | Links from `config.js`, platform detection, honeycomb canvas, reveal-on-scroll, tilt, copy buttons, OS tabs, table-of-contents highlighting. |
| `js/demo.js` | The interactive demo: a timer, invented activity samples, check-ins, wrap-up, a drafted report. Sample data only; it reads nothing. |
| `assets/logo.svg` | The DailyBee mark (same file as `assets/dailybee-logo.svg` at the repository root). |
| `assets/screens/*.webp` | Screenshots of the app. |

## Screenshots

They are real captures of the desktop app running the sample day (`pnpm dev:demo`) in a 1440×900 window, rendered at 2× and saved as WebP (about 100 KB each). To refresh them after a UI change, run the app with `--remote-debugging-port=9333`, size the window to 1440×900 and capture each screen through the Chrome DevTools Protocol (`Page.captureScreenshot` with `format: "webp"` after `Emulation.setDeviceMetricsOverride({ deviceScaleFactor: 2 })`), or simply take a screenshot by hand at the same size and convert it. Keep the file names: the pages reference them directly.

| File | Screen |
| --- | --- |
| `today.webp` | Today with a running task |
| `warning.webp` | The full-screen distraction warning over Today (a screen capture, since the overlay is its own window) |
| `reports-week.webp` | Reports, Week tab |
| `report-dialog.webp` | Generate report |
| `stop-dialog.webp` | Wrapping up (stop) |
| `correct-entry.webp`, `changelog.webp` | Entry correction and the change log |
| `checkin.webp` | The check-in popup window |
| `tasks-board.webp` | Tasks, Board view |
| `team.webp`, `admin.webp` | Team and Admin with the sample team |
| `settings-startup.webp`, `settings-backup.webp` | Settings |
| `onboarding-1.webp`, `onboarding-2.webp`, `profiles.webp` | First run and the profile list |

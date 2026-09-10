#!/usr/bin/env node
// Renders the DailyBee mark (assets/dailybee-logo.svg) to every PNG the desktop app needs, using
// Electron's own renderer so the result matches the in-app logo exactly:
//   apps/desktop/build/icon.png            1024 px  electron-builder makes .ico / .icns from it
//   apps/desktop/resources/icon.png         256 px  window and taskbar icon in development
//   apps/desktop/resources/tray/tray-*.png  16/32/64 px tray icon (Windows, Linux)
//   apps/desktop/resources/tray/trayTemplate*.png  16/32 px black template icon (macOS menu bar)
//
//   pnpm icons        (or: node scripts/render-icons.cjs)
const { spawnSync } = require('node:child_process');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

const root = join(__dirname, '..');
const svgFile = join(root, 'assets', 'dailybee-logo.svg');
const targets = [
  ['apps/desktop/build/icon.png', 1024, 'honey'],
  ['apps/desktop/resources/icon.png', 256, 'honey'],
  ['apps/desktop/resources/tray/tray-64.png', 64, 'honey'],
  ['apps/desktop/resources/tray/tray-32.png', 32, 'honey'],
  ['apps/desktop/resources/tray/tray-16.png', 16, 'honey'],
  ['apps/desktop/resources/tray/trayTemplate@2x.png', 32, 'black'],
  ['apps/desktop/resources/tray/trayTemplate.png', 16, 'black'],
];

if (!process.versions.electron) {
  // Plain Node: relaunch this file under Electron, which brings the renderer.
  const electron = require('electron');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // even an empty value would make Electron run as plain Node
  const r = spawnSync(electron, [__filename], { stdio: 'inherit', env });
  process.exit(r.status ?? 1);
}

const { app, BrowserWindow } = require('electron');
app.disableHardwareAcceleration();

/** The SVG with the fill swapped: honey for the app icon and tray, black for the macOS template (alpha carries the shape). */
function svgFor(tone) {
  const svg = readFileSync(svgFile, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  return tone === 'black' ? svg.replace(/#F5B400/g, '#000000') : svg;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One offscreen, transparent window, resized per target; a fresh window per size made Chromium refuse the next load. */
async function render(win, size, tone) {
  win.setContentSize(size, size);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svgFor(tone)}</body></html>`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)); break; }
    catch (e) { if (attempt === 2) throw e; await sleep(300); }
  }
  await sleep(250);
  let img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  const got = img.getSize();
  if (got.width !== size || got.height !== size) img = img.resize({ width: size, height: size, quality: 'best' });
  return img;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, useContentSize: true, transparent: true, frame: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  try {
    for (const [rel, size, tone] of targets) {
      const img = await render(win, size, tone);
      const file = join(root, rel);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, img.toPNG());
      const bmp = img.toBitmap();
      const corner = bmp[3], centre = bmp[(Math.floor(size / 2) * size + Math.floor(size / 2)) * 4 + 3];
      console.log(`${rel.padEnd(52)} ${String(size).padStart(4)} px  corner alpha ${corner}  centre alpha ${centre}`);
    }
    console.log('icons rendered from ' + svgFile);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    win.destroy();
  }
  app.quit();
});

#!/usr/bin/env node
// Renders the website's Open Graph image, landing/assets/og.png (1200×630), from scripts/og-template.html with the
// site's real fonts and the current Today screenshot, drawn at 2× and downscaled so text stays crisp in previews.
//
//   pnpm og        (or: node scripts/render-og.cjs)
//
// Electron's renderer does the drawing. On a machine that refuses to run the Electron binary (Windows Smart App
// Control does that for unsigned executables now and then) the script drives a headless Edge or Chrome over the
// DevTools protocol instead; set DAILYBEE_BROWSER to a browser executable to pick one yourself.
const { spawn, spawnSync } = require('node:child_process');
const { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');

const root = join(__dirname, '..');
const OUT = join(root, 'landing', 'assets', 'og.png');
const W = 1200, H = 630, SCALE = 2;
// Resolves once the fonts are in and every image is decoded, so a capture shows the finished page.
const READY = `Promise.all([document.fonts.ready, ...Array.from(document.images, (i) => i.decode().catch(() => null))]).then(() => document.fonts.status)`;

/** Writes the template and the screenshot it shows into `dir`; returns the page's path. */
function writePage(dir) {
  copyFileSync(join(root, 'landing', 'assets', 'screens', 'today.webp'), join(dir, 'shot.webp'));
  const page = join(dir, 'og.html');
  writeFileSync(page, readFileSync(join(root, 'scripts', 'og-template.html'), 'utf8').replaceAll('{{SHOT}}', 'shot.webp'));
  return page;
}

if (!process.versions.electron) {
  // Plain Node: relaunch this file under Electron, which brings the renderer; fall back to a headless browser.
  const electron = require('electron');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // even an empty value would make Electron run as plain Node
  const r = spawnSync(electron, [__filename], { stdio: 'inherit', env });
  if (r.status === 0) process.exit(0);
  console.warn(`Electron could not render the image (${r.error ? r.error.message : 'exit code ' + r.status}); trying a headless browser.`);
  renderWithBrowser().then((ok) => process.exit(ok ? 0 : 1), (e) => { console.error(e); process.exit(1); });
}

function findBrowser() {
  if (process.env.DAILYBEE_BROWSER) return process.env.DAILYBEE_BROWSER;
  const candidates = process.platform === 'win32'
    ? [
        join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];
  return candidates.find((c) => (c.includes('/') || c.includes('\\') ? existsSync(c) : true));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A very small DevTools-protocol client: send commands, wait for events. */
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('could not connect to ' + url)); });
  let id = 0;
  const pending = new Map();
  const waiting = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
    else if (msg.method && waiting.has(msg.method)) { waiting.get(msg.method)(msg.params); waiting.delete(msg.method); }
  };
  return {
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
    once: (method) => new Promise((res) => waiting.set(method, res)),
    close: () => ws.close(),
  };
}

async function renderWithBrowser() {
  const browser = findBrowser();
  if (!browser) { console.error('no Edge or Chrome found; set DAILYBEE_BROWSER to a browser executable'); return false; }
  const dir = mkdtempSync(join(tmpdir(), 'dailybee-og-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, `--remote-debugging-port=${port}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
  let cdp = null;
  try {
    const page = writePage(dir);
    // wait for the browser to answer on its debugging port
    let targets = null;
    for (let i = 0; i < 60 && !targets; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(250); }
    }
    if (!targets) throw new Error('the headless browser did not start');
    const target = targets.find((t) => t.type === 'page') ?? (await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json());
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    const shoot = async (url, scale) => {
      // an exact 1200×630 viewport at the wanted device scale, whatever window the browser opened
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: scale, mobile: false });
      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', { url });
      await loaded;
      const fonts = await cdp.send('Runtime.evaluate', { expression: READY, awaitPromise: true, returnByValue: true });
      if (fonts.result && fonts.result.value !== 'loaded') console.warn('warning: fonts reported', fonts.result && fonts.result.value);
      await sleep(200);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      return Buffer.from(shot.data, 'base64');
    };
    // 1. the page at 2×; 2. that image shown at 1200×630 so the browser downsamples it with proper filtering
    const big = join(dir, 'og@2x.png');
    writeFileSync(big, await shoot(pathToFileURL(page).href, SCALE));
    const down = join(dir, 'down.html');
    writeFileSync(down, `<!doctype html><html><body style="margin:0;background:#1B1915"><img src="og@2x.png" style="display:block;width:${W}px;height:${H}px"></body></html>`);
    const png = await shoot(pathToFileURL(down).href, 1);
    writeFileSync(OUT, png);
    console.log(`wrote ${OUT}  ${W}x${H} (headless ${browser}, ${(png.length / 1024).toFixed(0)} KB)`);
    return true;
  } finally {
    if (cdp) cdp.close();
    child.kill();
    await sleep(300);
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.versions.electron) {
  const { app, BrowserWindow } = require('electron');
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dailybee-og-'));
    const page = writePage(dir);
    const win = new BrowserWindow({ show: false, width: W * SCALE, height: H * SCALE, useContentSize: true, frame: false, webPreferences: { offscreen: true, backgroundThrottling: false, zoomFactor: SCALE } });
    try {
      await win.loadFile(page);
      const fonts = await win.webContents.executeJavaScript(READY);
      if (fonts !== 'loaded') console.warn('warning: fonts reported', fonts);
      await sleep(500);
      let img = await win.webContents.capturePage();
      const rendered = img.getSize();
      if (rendered.width !== W || rendered.height !== H) img = img.resize({ width: W, height: H, quality: 'best' });
      const png = img.toPNG();
      writeFileSync(OUT, png);
      console.log(`wrote ${OUT}  ${W}x${H} (Electron, rendered at ${rendered.width}x${rendered.height}, ${(png.length / 1024).toFixed(0)} KB)`);
    } catch (e) {
      console.error(e);
      process.exitCode = 1;
    } finally {
      win.destroy();
      rmSync(dir, { recursive: true, force: true });
    }
    app.quit();
  });
}

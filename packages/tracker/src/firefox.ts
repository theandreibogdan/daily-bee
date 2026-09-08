import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** LZ4 block decoder (no framing). Enough for Mozilla's mozlz4 session files. */
export function lz4BlockDecode(src: Uint8Array, dstSize: number): Uint8Array {
  const dst = new Uint8Array(dstSize);
  let si = 0, di = 0;
  while (si < src.length) {
    const token = src[si++]!;
    let lit = token >> 4;
    if (lit === 15) { let b: number; do { b = src[si++]!; lit += b; } while (b === 255); }
    dst.set(src.subarray(si, si + lit), di);
    si += lit; di += lit;
    if (si >= src.length) break;
    const offset = src[si]! | (src[si + 1]! << 8);
    si += 2;
    let mlen = token & 15;
    if (mlen === 15) { let b: number; do { b = src[si++]!; mlen += b; } while (b === 255); }
    mlen += 4;
    let ref = di - offset;
    for (let i = 0; i < mlen; i++) dst[di++] = dst[ref++]!;
  }
  return dst.subarray(0, di);
}

const MAGIC = 'mozLz40\0';

/** Decode a `.jsonlz4` file buffer to its JSON string. */
export function decodeMozLz4(buf: Uint8Array): string {
  const magic = Buffer.from(buf.subarray(0, 8)).toString('latin1');
  if (magic !== MAGIC) throw new Error('Not a mozlz4 file');
  const size = buf[8]! | (buf[9]! << 8) | (buf[10]! << 16) | (buf[11]! << 24);
  const out = lz4BlockDecode(buf.subarray(12), size >>> 0);
  return Buffer.from(out).toString('utf8');
}

export function firefoxProfileRoots(platform: NodeJS.Platform = process.platform): string[] {
  const home = homedir();
  if (platform === 'win32') {
    const appdata = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return [join(appdata, 'Mozilla', 'Firefox', 'Profiles'), join(appdata, 'zen', 'Profiles')];
  }
  if (platform === 'darwin') return [join(home, 'Library', 'Application Support', 'Firefox', 'Profiles'), join(home, 'Library', 'Application Support', 'zen', 'Profiles')];
  return [join(home, '.mozilla', 'firefox'), join(home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'), join(home, '.zen')];
}

export interface FirefoxActiveTab { url: string; title: string | null; mtime: number }

/**
 * Active tab of the most recently written Firefox profile, read from
 * sessionstore-backups/recovery.jsonlz4 (Firefox writes it every ~15s).
 * Used when no scripting/automation path exists (macOS Firefox, Linux).
 */
export function readFirefoxActiveTab(platform: NodeJS.Platform = process.platform): FirefoxActiveTab | null {
  let best: { file: string; mtime: number } | null = null;
  for (const root of firefoxProfileRoots(platform)) {
    let profiles: string[] = [];
    try { profiles = readdirSync(root); } catch { continue; }
    for (const p of profiles) {
      const file = join(root, p, 'sessionstore-backups', 'recovery.jsonlz4');
      try {
        const st = statSync(file);
        if (!best || st.mtimeMs > best.mtime) best = { file, mtime: st.mtimeMs };
      } catch { /* no session in this profile */ }
    }
  }
  if (!best) return null;
  try {
    const json = JSON.parse(decodeMozLz4(readFileSync(best.file))) as {
      selectedWindow?: number;
      windows?: Array<{ selected?: number; tabs?: Array<{ index?: number; entries?: Array<{ url?: string; title?: string }> }> }>;
    };
    const win = json.windows?.[(json.selectedWindow ?? 1) - 1] ?? json.windows?.[0];
    const tab = win?.tabs?.[(win.selected ?? 1) - 1];
    const entry = tab?.entries?.[(tab.index ?? tab.entries?.length ?? 1) - 1];
    if (!entry?.url) return null;
    return { url: entry.url, title: entry.title ?? null, mtime: best.mtime };
  } catch {
    return null;
  }
}

// Generates the tray and app icons from the design system's honey mark (a rounded honey square),
// with no image dependencies: raw RGBA → PNG (zlib + CRC32). Run: node scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HONEY = [0xf5, 0xb4, 0x00];
const INK = [0x12, 0x11, 0x0e];

function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Anti-aliased rounded square (inset and corner radius as fractions of size), optional inner dot. */
function mark(size, color, { inset = 0.06, radius = 0.22, dot = null } = {}) {
  const ss = 4;
  const rgba = Buffer.alloc(size * size * 4);
  const lo = inset * size, hi = size - inset * size, r = radius * size;
  const inside = (px, py) => {
    if (px < lo || px > hi || py < lo || py > hi) return false;
    const cx = px < lo + r ? lo + r : px > hi - r ? hi - r : px;
    const cy = py < lo + r ? lo + r : py > hi - r ? hi - r : py;
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
  };
  const inDot = (px, py) => dot && (px - size / 2) ** 2 + (py - size / 2) ** 2 <= (dot * size) ** 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let cover = 0, dotCover = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const px = x + (sx + 0.5) / ss, py = y + (sy + 0.5) / ss;
      if (inside(px, py)) { cover++; if (inDot(px, py)) dotCover++; }
    }
    const i = (y * size + x) * 4;
    const a = cover / (ss * ss);
    const d = dotCover / (ss * ss);
    const c = dot ? [0, 1, 2].map((k) => Math.round(color[k] * (1 - d / Math.max(a, 1e-6)) + INK[k] * (d / Math.max(a, 1e-6)))) : color;
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = Math.round(255 * a);
  }
  return png(size, rgba);
}

const tray = join(root, 'apps', 'desktop', 'resources', 'tray');
const build = join(root, 'apps', 'desktop', 'build');
mkdirSync(tray, { recursive: true });
mkdirSync(build, { recursive: true });
// Windows / Linux tray: honey mark. macOS: black template image (the system tints it).
writeFileSync(join(tray, 'tray-16.png'), mark(16, HONEY));
writeFileSync(join(tray, 'tray-32.png'), mark(32, HONEY));
writeFileSync(join(tray, 'tray-64.png'), mark(64, HONEY));
writeFileSync(join(tray, 'trayTemplate.png'), mark(16, [0, 0, 0]));
writeFileSync(join(tray, 'trayTemplate@2x.png'), mark(32, [0, 0, 0]));
// App icon (electron-builder picks build/icon.png): honey mark with an ink dot, like the tracking dot.
writeFileSync(join(build, 'icon.png'), mark(512, HONEY, { inset: 0.04, radius: 0.22, dot: 0.12 }));
console.log('icons written to', tray, 'and', build);

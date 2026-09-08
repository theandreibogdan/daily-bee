import { describe, expect, it } from 'vitest';
import { decodeMozLz4, lz4BlockDecode } from '../firefox';
import { parseBrowserTitle, stripAppSuffix } from '../title';
import { BROWSERS } from '../browsers';
import { isSelf, selfSample } from '../sampler/provider';

describe('self detection', () => {
  it('recognises its own process id and other DailyBee windows', () => {
    expect(isSelf(process.pid, {})).toBe(true);
    expect(isSelf(1, {}, 'electron', 'DailyBee')).toBe(true);
    expect(isSelf(1, {}, 'DailyBee.exe', 'DailyBee')).toBe(true);
    expect(isSelf(1, {}, 'electron', 'Some other Electron app')).toBe(false);
    expect(isSelf(1, {}, 'chrome', 'DailyBee')).toBe(false);
    expect(selfSample('DailyBee', {}).app).toBe('DailyBee');
  });
});

describe('lz4BlockDecode', () => {
  it('decodes literal-only blocks', () => {
    // token 0x50 → 5 literals, no match
    const block = new Uint8Array([0x50, ...Buffer.from('hello')]);
    expect(Buffer.from(lz4BlockDecode(block, 5)).toString()).toBe('hello');
  });
  it('decodes matches (back-references)', () => {
    // "abcd" literal, then copy 8 bytes from offset 4 → "abcdabcdabcd"; final literal "!"
    // token1: lit=4, mlen=8-4=4 → 0x44 ; offset LE 4,0 ; token2: lit=1, 0 match → 0x10 '!'
    const block = new Uint8Array([0x44, ...Buffer.from('abcd'), 0x04, 0x00, 0x10, ...Buffer.from('!')]);
    expect(Buffer.from(lz4BlockDecode(block, 13)).toString()).toBe('abcdabcdabcd!');
  });
  it('rejects non-mozlz4 buffers', () => {
    expect(() => decodeMozLz4(new Uint8Array(Buffer.from('nope')))).toThrow();
  });
});

describe('title parsing', () => {
  const chrome = BROWSERS.find((b) => b.id === 'chrome')!;
  it('strips browser suffixes', () => {
    expect(parseBrowserTitle('PR #412 · dailybee/api - Google Chrome', chrome)).toBe('PR #412 · dailybee/api');
    expect(parseBrowserTitle('Web Locks API — Mozilla Firefox', null)).toBe('Web Locks API');
  });
  it('strips app suffixes from native window titles', () => {
    expect(stripAppSuffix('timer-sync.ts - api-gateway - Visual Studio Code', ['Visual Studio Code'])).toBe('timer-sync.ts - api-gateway');
    expect(stripAppSuffix('pnpm test --watch', ['Windows Terminal'])).toBe('pnpm test --watch');
  });
});

import { describe, expect, it } from 'vitest';
import { friendlyAppName } from '../title';

describe('friendlyAppName', () => {
  it('never shows an executable suffix, and prefers the known name, then the description', () => {
    expect(friendlyAppName('Notepad', 'Notepad.exe')).toBe('Notepad');
    expect(friendlyAppName('notepad.exe', null)).toBe('notepad');
    expect(friendlyAppName('Code', 'Visual Studio Code')).toBe('VS Code');
    expect(friendlyAppName('chrome', 'Google Chrome')).toBe('Google Chrome');
    expect(friendlyAppName(null, 'Something.EXE')).toBe('Something');
    expect(friendlyAppName(null, null)).toBe('Unknown app');
  });
});

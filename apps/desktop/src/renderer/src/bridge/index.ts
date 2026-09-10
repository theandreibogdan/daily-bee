import type { DailyBeeApi } from '@shared/api';
import { createElectronApi } from './electron';
import { createMockApi } from './mock';

/**
 * In Electron the preload exposes `window.dailybee`; in a plain browser (Vite dev server opened
 * directly, design reviews) we fall back to an in-memory mock with the kit's fake data.
 */
export const api: DailyBeeApi = window.dailybee ? createElectronApi(window.dailybee) : createMockApi();
export const isElectron = !!window.dailybee;

/** The message of an error thrown in the main process, without Electron's "Error invoking remote method" wrapper. */
export function errorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '');
}

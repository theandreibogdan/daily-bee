/**
 * DailyBee Cloud: the workspace API (endpoints and database) hosted by us. Its address is the
 * build-time setting VITE_DAILYBEE_CLOUD_URL; while that is empty the wizard shows the option as
 * not available yet. Signing in to it uses the same auth.* procedures as a self-hosted server.
 */
export const CLOUD_URL: string = ((import.meta.env.VITE_DAILYBEE_CLOUD_URL as string | undefined) ?? '').trim().replace(/\/$/, '');
export const cloudAvailable = (): boolean => CLOUD_URL.length > 0;
/** "DailyBee Cloud" for the hosted address, otherwise the address itself. */
export const describeServer = (apiUrl: string | null | undefined): string => (apiUrl && CLOUD_URL && apiUrl.replace(/\/$/, '') === CLOUD_URL ? 'DailyBee Cloud' : apiUrl || '');
export type Hosting = 'cloud' | 'self';

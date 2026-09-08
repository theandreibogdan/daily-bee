import type { Sampler, SamplerOptions, WindowSample } from '../types';
import { createDarwinProvider } from './darwin';
import { createLinuxProvider } from './linux';
import type { Provider } from './provider';
import { createWin32Provider } from './win32';

export type { Provider, RawSample } from './provider';

export function createProvider(opts: SamplerOptions = {}, platform: NodeJS.Platform = process.platform): Provider {
  if (platform === 'win32') return createWin32Provider(opts);
  if (platform === 'darwin') return createDarwinProvider(opts);
  return createLinuxProvider(opts);
}

/**
 * Polls the foreground window every `intervalMs` (default 3s) and hands each sample to the host.
 * Idle detection is injected by the host (Electron's powerMonitor) so this package stays Electron-free.
 */
export function createSampler(opts: SamplerOptions = {}, platform: NodeJS.Platform = process.platform, provider: Provider = createProvider(opts, platform)): Sampler {
  const intervalMs = opts.intervalMs ?? 3000;
  const idleSec = opts.idleThresholdSec ?? 600;
  const log = opts.log ?? (() => {});
  let timer: NodeJS.Timeout | null = null;
  let busy = false;

  const take = async (): Promise<WindowSample> => {
    const idle = opts.getIdleSeconds ? opts.getIdleSeconds() >= idleSec : false;
    const raw = await provider.sample(opts.captureBrowser ?? true);
    return { ...raw, ts: Date.now(), idle };
  };

  return {
    platform,
    start(onSample) {
      if (timer) return;
      const tick = async () => {
        if (busy) return;
        busy = true;
        try { onSample(await take()); } catch (e) { log('[tracker] ' + String(e)); } finally { busy = false; }
      };
      void tick();
      timer = setInterval(tick, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      provider.dispose();
    },
    sampleOnce: take,
    permissions: () => provider.permissions(),
  };
}

import { createHTTPServer } from '@trpc/server/adapters/standalone';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MemoryRepo } from './db/memory';
import { PostgresRepo } from './db/postgres';
import { appRouter } from './router';
import { dayKey } from './time';
import type { Context } from './trpc';
import type { Repo } from './types';

const port = Number(process.env.PORT ?? 8787);
const databaseUrl = process.env.DATABASE_URL;

async function makeRepo(): Promise<Repo> {
  if (databaseUrl) {
    const repo = new PostgresRepo(databaseUrl);
    await repo.migrate();
    console.log('[api] using Postgres');
    return repo;
  }
  console.log('[api] DATABASE_URL not set — using the in-memory repository with the sample team (any token is accepted)');
  process.env.DAILYBEE_EVERYONE_IS_LEAD ??= '1';
  return new MemoryRepo();
}

const repo = await makeRepo();

const cors = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-trpc-source');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  next();
};

const server = createHTTPServer({
  router: appRouter,
  basePath: '/trpc/',
  middleware: cors,
  createContext: async ({ req }): Promise<Context> => {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    return { repo, user: token ? await repo.authenticate(token) : null, today: dayKey() };
  },
  onError: ({ error, path }) => { if (error.code === 'INTERNAL_SERVER_ERROR') console.error('[api]', path, error); },
});

server.listen(port);
console.log(`[api] listening on http://localhost:${port}/trpc`);

const shutdown = async () => { server.close(); await repo.close(); process.exit(0); };
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

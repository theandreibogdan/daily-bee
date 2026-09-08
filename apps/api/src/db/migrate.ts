import { PostgresRepo } from './postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set — nothing to migrate (the API runs in-memory without it).');
  process.exit(1);
}
const repo = new PostgresRepo(url);
await repo.migrate();
if (process.env.SEED_TOKEN) {
  await repo.provision({ id: process.env.SEED_WORKSPACE ?? 'ws_default', name: process.env.SEED_WORKSPACE_NAME ?? 'DailyBee' }, { id: 'u_seed_admin', email: process.env.SEED_EMAIL ?? 'admin@example.com', name: process.env.SEED_NAME ?? 'Admin', initials: 'AD', team: process.env.SEED_TEAM ?? 'Platform', role: 'admin' }, process.env.SEED_TOKEN);
  console.log('Provisioned admin user with SEED_TOKEN');
}
await repo.close();
console.log('Migration complete');

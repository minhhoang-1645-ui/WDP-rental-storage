import { defineConfig } from 'prisma/config';
const raw = process.env.NESTBOX_RECOVERY_DATABASE_URL ?? '',
  url = new URL(raw || 'https://invalid.test');
if (
  process.env.NESTBOX_RECOVERY_ENABLED !== '1' ||
  url.protocol !== 'postgresql:' ||
  url.hostname !== '127.0.0.1' ||
  url.port !== '55440' ||
  url.pathname !== '/nestbox_foundation_restore' ||
  url.search ||
  process.env.DATABASE_URL !== raw ||
  process.env.DIRECT_URL !== raw
)
  throw new Error(
    'Only the freshly restored local foundation database is allowed.',
  );
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: raw },
});

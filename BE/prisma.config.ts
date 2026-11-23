import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';
import { assertMigrationTarget } from './scripts/migration-command-safety.mjs';

const directUrl = env('DIRECT_URL');
assertMigrationTarget(directUrl, process.argv.slice(2));

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Prisma CLI operations use the direct/session connection. Runtime access
  // remains configured with DATABASE_URL in PrismaService.
  datasource: { url: directUrl },
});

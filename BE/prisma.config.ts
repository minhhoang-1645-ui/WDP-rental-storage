import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Prisma CLI operations use the direct/session connection. Runtime access
  // remains configured with DATABASE_URL in PrismaService.
  datasource: { url: env('DIRECT_URL') },
});

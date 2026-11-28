// Only for local validation/generation. Never reads .env or connects to a database.
import { defineConfig } from 'prisma/config';
export default defineConfig({ schema: 'prisma/schema.prisma', datasource: { url: 'postgresql://offline:offline@127.0.0.1:1/offline' } });

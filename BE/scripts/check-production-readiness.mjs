import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { productionReadiness, formatProductionReadiness } from './production-readiness.mjs';

// Host environment wins over the local file. No Nest bootstrap, sweepers or DB writes.
config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const result = productionReadiness(process.env);
process.stdout.write(`${formatProductionReadiness(result)}\n`);
process.exitCode = result.ready ? 0 : 1;

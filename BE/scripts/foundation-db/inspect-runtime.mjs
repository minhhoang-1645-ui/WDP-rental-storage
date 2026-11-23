import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { root } from './common.mjs';
const base = 'https://wdp-rental-storage.onrender.com/api',
  result = { base, probes: [] };
for (const endpoint of [
  '/health',
  '/health/ready',
  '/docs-json',
  '/booking/catalog',
]) {
  try {
    const response = await fetch(base + endpoint, {
      signal: AbortSignal.timeout(25000),
    });
    const text = await response.text();
    const item = { endpoint, status: response.status };
    if (endpoint === '/docs-json' && response.ok) {
      const doc = JSON.parse(text),
        paths = Object.keys(doc.paths || {});
      item.paths = paths;
      item.hasFiveRoleOperations = paths.some((p) =>
        p.includes('/operations/'),
      );
      item.sha256 = crypto.createHash('sha256').update(text).digest('hex');
    }
    if (endpoint === '/health' || endpoint === '/health/ready')
      item.body = JSON.parse(text);
    if (endpoint === '/booking/catalog' && response.ok) {
      const data = JSON.parse(text);
      item.products = data.products?.length;
      item.addons = data.addons?.length;
    }
    result.probes.push(item);
  } catch (error) {
    result.probes.push({ endpoint, error: error.name });
  }
}
const file = path.join(
  root,
  'artifacts',
  'foundation-runtime-compatibility.json',
);
fs.writeFileSync(file, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    ...result,
    probes: result.probes.map(({ paths, ...p }) => ({
      ...p,
      pathCount: paths?.length,
    })),
  }),
);

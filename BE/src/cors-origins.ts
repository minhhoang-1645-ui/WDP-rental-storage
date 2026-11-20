import { isIP } from 'node:net';

export function corsOrigins(configured: string | undefined, development: boolean, localAddresses: string[] = []) {
  if (configured?.trim()) return [...new Set(configured.split(',').flatMap(value => {
    try { const url = new URL(value.trim()); return ['http:', 'https:'].includes(url.protocol) ? [url.origin] : []; } catch { return []; }
  }))];
  const hosts = ['localhost', '127.0.0.1', ...(development ? localAddresses.filter(address => isIP(address) === 4) : [])];
  return [...new Set(hosts.flatMap(host => [5173, 8081].map(port => `http://${host}:${port}`)))];
}

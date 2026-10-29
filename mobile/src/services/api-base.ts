/** Explicit deployment configuration wins; local development follows the actual Expo/browser host. */
export function resolveApiBase(input: { configured?: string; hostUri?: string | null; webHost?: string; platform?: string; development: boolean }) {
  if (input.configured?.trim()) return input.configured.trim().replace(/\/$/, '');
  if (input.development) {
    const host = input.webHost || input.hostUri;
    if (host) {
      try { const url = new URL(host.includes('://') ? host : `http://${host}`); if (url.hostname) return `http://${url.hostname}:3000/api`; } catch { /* Use the platform fallback if no valid dev host is available. */ }
    }
  }
  return input.platform === 'android' ? 'http://10.0.2.2:3000/api' : 'http://127.0.0.1:3000/api';
}

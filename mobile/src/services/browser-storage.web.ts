/** Keep Expo web usable when browser persistence is denied or full. */
const fallback = new Map<string, string | null>();
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === null) fallback.clear();
  else fallback.delete(event.key);
});
export const browserStorage = {
  getItem(key: string): string | null {
    if (fallback.has(key)) return fallback.get(key) ?? null;
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  setItem(key: string, value: string) {
    try {
      if (!globalThis.localStorage) { fallback.set(key, value); return; }
      globalThis.localStorage.setItem(key, value); fallback.delete(key);
    } catch { fallback.set(key, value); }
  },
  removeItem(key: string) {
    try {
      if (!globalThis.localStorage) { fallback.set(key, null); return; }
      globalThis.localStorage.removeItem(key); fallback.delete(key);
    } catch { fallback.set(key, null); }
  },
};

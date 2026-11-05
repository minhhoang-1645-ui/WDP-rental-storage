/** Browser storage may be blocked, full or unavailable. Keep the active tab usable. */
function createSafeStorage(kind: 'localStorage' | 'sessionStorage') {
  const fallback = new Map<string, string | null>();
  const native = () => window[kind];
  const keys = () => {
    const result = new Set<string>();
    try {
      const storage = native();
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key !== null) result.add(key);
      }
    } catch { /* Use the current tab's fallback when browser storage is blocked. */ }
    for (const [key, value] of fallback) {
      if (value === null) result.delete(key);
      else result.add(key);
    }
    return [...result];
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', event => {
    // A change from another document is authoritative, including logout.
    try { if (event.storageArea && event.storageArea !== native()) return; } catch { /* A blocked area cannot be compared. */ }
    if (event.key === null) fallback.clear();
    else fallback.delete(event.key);
  });
  return {
    getItem(key: string): string | null {
      if (fallback.has(key)) return fallback.get(key) ?? null;
      try { return native().getItem(key); } catch { return null; }
    },
    setItem(key: string, value: string): void {
      try { native().setItem(key, value); fallback.delete(key); }
      catch { fallback.set(key, value); }
    },
    removeItem(key: string): void {
      try { native().removeItem(key); fallback.delete(key); }
      catch { fallback.set(key, null); }
    },
    key(index: number): string | null { return keys()[index] ?? null; },
    get length() { return keys().length; },
  };
}

export const safeLocalStorage = createSafeStorage('localStorage');
export const safeSessionStorage = createSafeStorage('sessionStorage');

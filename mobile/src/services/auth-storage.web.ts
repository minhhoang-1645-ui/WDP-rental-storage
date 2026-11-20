import { browserStorage } from './browser-storage.web';
const tokenKey = 'wdp-mobile-auth-token';

export const authStorage = {
  getToken: async () => browserStorage.getItem(tokenKey),
  setToken: async (token: string) => { browserStorage.setItem(tokenKey, token); },
  clearToken: async () => { browserStorage.removeItem(tokenKey); },
  subscribe: (listener: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== tokenKey && event.key !== null) return;
      try { if (event.storageArea && event.storageArea !== globalThis.localStorage) return; } catch { /* Storage can be blocked after the event was queued. */ }
      listener();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  },
};

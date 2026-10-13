const tokenKey = 'wdp-mobile-auth-token';

export const authStorage = {
  getToken: async () => globalThis.localStorage?.getItem(tokenKey) ?? null,
  setToken: async (token: string) => { globalThis.localStorage?.setItem(tokenKey, token); },
  clearToken: async () => { globalThis.localStorage?.removeItem(tokenKey); },
};

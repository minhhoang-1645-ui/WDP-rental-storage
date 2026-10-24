export const activityStorage = {
  get: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
  set: async (key: string, value: string) => { globalThis.localStorage?.setItem(key, value); },
};

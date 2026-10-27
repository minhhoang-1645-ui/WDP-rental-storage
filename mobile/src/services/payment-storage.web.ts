export const paymentStorage = {
  get: async (key: string) => localStorage.getItem(key),
  set: async (key: string, value: string) => { localStorage.setItem(key, value); },
  remove: async (key: string) => { localStorage.removeItem(key); },
};

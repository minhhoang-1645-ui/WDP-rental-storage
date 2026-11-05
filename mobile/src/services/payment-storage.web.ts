import { browserStorage } from './browser-storage.web';
export const paymentStorage = {
  get: async (key: string) => browserStorage.getItem(key),
  set: async (key: string, value: string) => { browserStorage.setItem(key, value); },
  remove: async (key: string) => { browserStorage.removeItem(key); },
};

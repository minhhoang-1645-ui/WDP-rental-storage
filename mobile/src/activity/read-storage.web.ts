import { browserStorage } from '../services/browser-storage.web';
export const activityStorage = {
  get: async (key: string) => browserStorage.getItem(key),
  set: async (key: string, value: string) => { browserStorage.setItem(key, value); },
};

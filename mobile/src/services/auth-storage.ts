import * as SecureStore from 'expo-secure-store';

const tokenKey = 'wdp-mobile-auth-token';

export const authStorage = {
  getToken: () => SecureStore.getItemAsync(tokenKey),
  setToken: (token: string) => SecureStore.setItemAsync(tokenKey, token),
  clearToken: () => SecureStore.deleteItemAsync(tokenKey),
};

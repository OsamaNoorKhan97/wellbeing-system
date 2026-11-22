import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Sensitive values (the session token) live in the OS keychain/keystore through expo-secure-store.
 * The browser build used for automated UI tests has no keychain, so it falls back to sessionStorage.
 */
const isWeb = Platform.OS === 'web';

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    try {
      if (isWeb) return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (isWeb) return sessionStorage.setItem(key, value);
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    try {
      if (isWeb) return sessionStorage.removeItem(key);
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* nothing stored */
    }
  },
};

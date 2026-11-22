import AsyncStorage from '@react-native-async-storage/async-storage';

/** Unsent form input (survey answers, request messages). Kept per user, cleared after a confirmed submit or logout. */
const key = (userId: number, name: string) => `draft:${userId}:${name}`;

export const drafts = {
  async load<T>(userId: number, name: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key(userId, name));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  async save(userId: number, name: string, value: unknown): Promise<void> {
    try {
      await AsyncStorage.setItem(key(userId, name), JSON.stringify(value));
    } catch {
      /* drafts are a convenience only */
    }
  },
  async clear(userId: number, name: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key(userId, name));
    } catch {
      /* ignore */
    }
  },
  async clearAll(): Promise<void> {
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('draft:'));
      if (keys.length) await AsyncStorage.multiRemove(keys);
    } catch {
      /* ignore */
    }
  },
};

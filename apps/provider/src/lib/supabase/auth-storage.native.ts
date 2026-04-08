/**
 * Auth storage for iOS/Android — prefers expo-secure-store; falls back to AsyncStorage
 * when the session JSON exceeds SecureStore's per-value size limit (~2048 bytes), which
 * otherwise caused silent persistence failures and Sentry noise.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/** Leave margin under iOS Keychain / expo-secure-store documented 2048-byte value limit */
const SECURE_VALUE_MAX_BYTES = 2040;

const ASYNC_FLAG_PREFIX = "__sb_auth_async_";

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).length;
}

export const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const useAsync = await SecureStore.getItemAsync(ASYNC_FLAG_PREFIX + key);
      if (useAsync === "1") {
        return await AsyncStorage.getItem(key);
      }
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (byteLengthUtf8(value) > SECURE_VALUE_MAX_BYTES) {
        await AsyncStorage.setItem(key, value);
        await SecureStore.setItemAsync(ASYNC_FLAG_PREFIX + key, "1");
        await SecureStore.deleteItemAsync(key).catch(() => {});
        return;
      }
      await SecureStore.deleteItemAsync(ASYNC_FLAG_PREFIX + key).catch(() => {});
      await AsyncStorage.removeItem(key).catch(() => {});
      await SecureStore.setItemAsync(key, value);
    } catch {
      try {
        await AsyncStorage.setItem(key, value);
        await SecureStore.setItemAsync(ASYNC_FLAG_PREFIX + key, "1");
        await SecureStore.deleteItemAsync(key).catch(() => {});
      } catch {
        /* ignore */
      }
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(ASYNC_FLAG_PREFIX + key).catch(() => {});
      await SecureStore.deleteItemAsync(key).catch(() => {});
      await AsyncStorage.removeItem(key).catch(() => {});
    } catch {
      /* ignore */
    }
  },
};

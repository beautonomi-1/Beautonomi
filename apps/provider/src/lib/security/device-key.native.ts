import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "bn_provider_device_key";

export async function getStoredDeviceKey(): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(STORAGE_KEY);
    return v?.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export async function setStoredDeviceKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, key.trim());
}

export async function clearStoredDeviceKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // no-op
  }
}

/** Header value for authenticated API requests (null when unset). */
export async function getDeviceKeyHeaderValue(): Promise<string | null> {
  return getStoredDeviceKey();
}

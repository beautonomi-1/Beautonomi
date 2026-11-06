const STORAGE_KEY = "bn_provider_device_key";

export async function getStoredDeviceKey(): Promise<string | null> {
  if (typeof localStorage === "undefined") return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v?.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export async function setStoredDeviceKey(key: string): Promise<void> {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, key.trim());
}

export async function clearStoredDeviceKey(): Promise<void> {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

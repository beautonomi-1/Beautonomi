const STORAGE_KEY = "bn_provider_device_key";

export function getStoredDeviceKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v?.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setStoredDeviceKey(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, key.trim());
}

export async function ensureDeviceKeyRegistered(
  register: (path: string, body?: unknown) => Promise<{ device_key?: string } | null | undefined>,
): Promise<string | null> {
  const existing = getStoredDeviceKey();
  if (existing) return existing;
  const data = await register("/api/auth/device/register", {});
  const key =
    data?.device_key?.trim() ??
    (data as { data?: { device_key?: string } } | null | undefined)?.data?.device_key?.trim();
  if (key) {
    setStoredDeviceKey(key);
    return key;
  }
  return null;
}

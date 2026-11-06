import { api } from "@/lib/api-client";
import { getStoredDeviceKey, setStoredDeviceKey } from "@/lib/security/device-key";

/** Ensure a device key exists locally; register with the API when missing. */
export async function ensureDeviceKeyRegistered(): Promise<string | null> {
  const existing = await getStoredDeviceKey();
  if (existing) return existing;
  const res = await api.post<{ device_key?: string }>("/api/auth/device/register", {});
  const key = res.data?.device_key?.trim();
  if (key) {
    await setStoredDeviceKey(key);
    return key;
  }
  return null;
}

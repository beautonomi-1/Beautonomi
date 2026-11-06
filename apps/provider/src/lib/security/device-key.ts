/**
 * Device trust key for X-Device-Key — native uses SecureStore; web uses localStorage.
 */
export {
  getStoredDeviceKey,
  setStoredDeviceKey,
  clearStoredDeviceKey,
} from "./device-key.native";

import { getStoredDeviceKey } from "./device-key.native";

/** Header value for authenticated API requests (null when unset). */
export async function getDeviceKeyHeaderValue(): Promise<string | null> {
  return getStoredDeviceKey();
}

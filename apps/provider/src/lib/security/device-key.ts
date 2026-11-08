/**
 * Device trust key for X-Device-Key — native uses SecureStore; web uses localStorage.
 *
 * Metro resolves `device-key.native.ts` / `device-key.web.ts` before this file, so
 * every export here must also exist in both platform files. This file only serves
 * TypeScript and Jest.
 */
export {
  getStoredDeviceKey,
  setStoredDeviceKey,
  clearStoredDeviceKey,
  getDeviceKeyHeaderValue,
} from "./device-key.native";

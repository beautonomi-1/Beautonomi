/**
 * Auth storage - platform-specific implementations in auth-storage.web.ts and auth-storage.native.ts
 * This default export is used when no platform-specific file matches (fallback for TypeScript).
 */
export { authStorage } from "./auth-storage.native";

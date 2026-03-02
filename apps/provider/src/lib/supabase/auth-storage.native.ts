/**
 * Auth storage for iOS/Android - uses expo-secure-store.
 */

import * as SecureStore from "expo-secure-store";

export const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const out = await SecureStore.getItemAsync(key);
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "auth-storage.native.ts:getItem",
          message: "getItem",
          data: { key, hasValue: out != null, valueLength: out?.length ?? 0 },
          timestamp: Date.now(),
          hypothesisId: "A",
        }),
      }).catch(() => {});
      // #endregion
      return out;
    } catch (e) {
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "auth-storage.native.ts:getItem",
          message: "getItem failed",
          data: { key, error: String(e) },
          timestamp: Date.now(),
          hypothesisId: "D",
        }),
      }).catch(() => {});
      // #endregion
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "auth-storage.native.ts:setItem",
          message: "setItem ok",
          data: { key, valueLength: value?.length ?? 0 },
          timestamp: Date.now(),
          hypothesisId: "A",
        }),
      }).catch(() => {});
      // #endregion
    } catch (e) {
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "auth-storage.native.ts:setItem",
          message: "setItem failed",
          data: { key, valueLength: value?.length ?? 0, error: String(e) },
          timestamp: Date.now(),
          hypothesisId: "D",
        }),
      }).catch(() => {});
      // #endregion
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  },
};

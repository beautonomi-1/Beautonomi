/**
 * Auth storage for web - uses localStorage. No expo-secure-store import.
 */

export const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },
};

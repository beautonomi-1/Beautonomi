import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "beautonomi_guest_fp";

let cachedFp: string | null = null;

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Stable per-device fingerprint for booking hold de-duplication.
 * Persisted in AsyncStorage so it survives restarts but is unique per install.
 */
export async function getGuestFingerprintHash(): Promise<string | null> {
  if (cachedFp) return cachedFp;
  try {
    let fp = await AsyncStorage.getItem(STORAGE_KEY);
    if (!fp) {
      fp = generateUUID();
      await AsyncStorage.setItem(STORAGE_KEY, fp);
    }
    cachedFp = fp;
    return fp;
  } catch {
    return null;
  }
}

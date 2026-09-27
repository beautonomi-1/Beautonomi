import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "hint:v1:";

export function hintStorageKey(id: string, userId?: string | null): string {
  if (userId) return `${PREFIX}${userId}:${id}`;
  return `${PREFIX}${id}`;
}

export async function isHintDismissed(key: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw === "1";
  } catch {
    return false;
  }
}

export async function dismissHint(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, "1");
  } catch {
    // non-fatal
  }
}

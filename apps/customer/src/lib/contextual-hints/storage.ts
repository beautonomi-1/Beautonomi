import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "hint:v1:";

/** Device-scoped: guests book too, so customer dismissals are not tied to an account. */
export function hintStorageKey(id: string): string {
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

/**
 * While the user has an active slot hold and returns to the book flow to change time,
 * availability must pass excludeHoldId (parity with web). Survives navigation via AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export const BOOK_FLOW_EXCLUDE_HOLD_KEY = "beautonomi_book_exclude_hold_id";

type Stored = { holdId: string; slug: string; at: number };

export async function setPendingExcludeHoldId(holdId: string, slug: string): Promise<void> {
  const payload: Stored = { holdId, slug, at: Date.now() };
  await AsyncStorage.setItem(BOOK_FLOW_EXCLUDE_HOLD_KEY, JSON.stringify(payload));
}

/** Returns hold id to exclude for this provider slug, or null if none / stale / mismatch. */
export async function getPendingExcludeHoldId(slug: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(BOOK_FLOW_EXCLUDE_HOLD_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Stored>;
    if (!o?.holdId || !o.slug || o.slug !== slug) return null;
    if (o.at && Date.now() - o.at > 20 * 60 * 1000) {
      await AsyncStorage.removeItem(BOOK_FLOW_EXCLUDE_HOLD_KEY);
      return null;
    }
    return o.holdId;
  } catch {
    return null;
  }
}

export async function clearPendingExcludeHoldId(): Promise<void> {
  await AsyncStorage.removeItem(BOOK_FLOW_EXCLUDE_HOLD_KEY);
}

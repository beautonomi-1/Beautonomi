/**
 * Client-built checkout chrome after POST /api/public/booking-holds (hold_id only).
 * Used for first paint on book-checkout; server GET remains authoritative for pay/totals.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "beautonomi.checkoutHandoff.v1";

export type CheckoutHandoffServiceLine = {
  offering_id: string;
  staff_id?: string | null;
  duration_minutes: number;
  price: number;
  currency: string;
  service_name?: string;
  title?: string;
};

export type CheckoutHandoffSnapshot = {
  hold_id: string;
  provider_id: string;
  provider_name?: string;
  provider_thumbnail?: string;
  slug?: string;
  start_at: string;
  end_at: string;
  location_type: string;
  location_id?: string | null;
  location_name?: string;
  staff_id?: string | null;
  staff_name?: string;
  expires_at?: string;
  booking_services_snapshot: CheckoutHandoffServiceLine[];
  package_id?: string;
  ts: number;
};

const memory = new Map<string, CheckoutHandoffSnapshot>();

function key(userId: string, holdId: string): string {
  return `${userId}:${holdId}`;
}

export function setCheckoutHandoffSnapshot(
  userId: string,
  snapshot: Omit<CheckoutHandoffSnapshot, "ts">,
): void {
  const entry: CheckoutHandoffSnapshot = { ...snapshot, ts: Date.now() };
  memory.set(key(userId, snapshot.hold_id), entry);
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, entry })).catch(() => {});
}

export function getCheckoutHandoffSnapshot(
  userId: string | undefined,
  holdId: string | undefined,
): CheckoutHandoffSnapshot | null {
  if (!userId?.trim() || !holdId?.trim()) return null;
  const mem = memory.get(key(userId, holdId));
  if (mem) return mem;
  return null;
}

export async function hydrateCheckoutHandoffSnapshot(
  userId: string,
  holdId: string,
): Promise<CheckoutHandoffSnapshot | null> {
  const mem = getCheckoutHandoffSnapshot(userId, holdId);
  if (mem) return mem;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; entry?: CheckoutHandoffSnapshot };
    if (
      parsed?.userId === userId &&
      parsed.entry?.hold_id === holdId &&
      typeof parsed.entry.ts === "number"
    ) {
      memory.set(key(userId, holdId), parsed.entry);
      return parsed.entry;
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearCheckoutHandoffCache(): void {
  memory.clear();
  void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

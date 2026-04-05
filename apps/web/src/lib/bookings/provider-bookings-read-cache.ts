import type { Booking } from "@/types/beautonomi";

const BOOKINGS_READ_CACHE_TTL_MS = 5000;

const bookingsReadCache = new Map<string, { expiresAt: number; data: Booking[] }>();

export function createBookingsReadCacheKey(providerId: string, search: string): string {
  return `${providerId}::${search}`;
}

/** Returns cached list if still fresh; otherwise null. */
export function getCachedProviderBookingsList(cacheKey: string): Booking[] | null {
  const cached = bookingsReadCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as Booking[];
  }
  return null;
}

export function setCachedProviderBookingsList(cacheKey: string, data: Booking[]): void {
  bookingsReadCache.set(cacheKey, {
    expiresAt: Date.now() + BOOKINGS_READ_CACHE_TTL_MS,
    data,
  });
}

/** Invalidate all cached GET /api/provider/bookings responses for this provider (any query string). */
export function invalidateProviderBookingsReadCache(providerId: string): void {
  const prefix = `${providerId}::`;
  for (const key of bookingsReadCache.keys()) {
    if (key.startsWith(prefix)) {
      bookingsReadCache.delete(key);
    }
  }
}

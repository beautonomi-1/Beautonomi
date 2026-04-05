import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getProviderBookings } from "@/app/api/provider/bookings/route";
import type { ProviderBookingListItem } from "./bookings-types";

function apiMessage(json: unknown): string {
  if (!json || typeof json !== "object") return "Invalid response";
  const e = (json as { error?: { message?: string } | string }).error;
  if (typeof e === "object" && e?.message) return e.message;
  if (typeof e === "string") return e;
  return "Request failed";
}

/**
 * Server-side load for /provider/bookings — default list (no filters, no location_id).
 * Matches client first paint before localStorage `selectedLocationId` is applied.
 */
export async function fetchBookingsInitial(): Promise<{
  bookings: ProviderBookingListItem[] | null;
  error: string | null;
}> {
  try {
    const req = await createNextRequestFromHeaders("/api/provider/bookings");
    const res = await getProviderBookings(req);
    let json: { data?: ProviderBookingListItem[]; error?: unknown } = {};
    try {
      json = (await res.json()) as { data?: ProviderBookingListItem[]; error?: unknown };
    } catch {
      return { bookings: null, error: "Invalid response from bookings API" };
    }
    if (!res.ok) {
      return { bookings: null, error: apiMessage(json) };
    }
    const bookings = json.data ?? [];
    return { bookings, error: null };
  } catch (e) {
    return {
      bookings: null,
      error: e instanceof Error ? e.message : "Failed to load bookings",
    };
  }
}

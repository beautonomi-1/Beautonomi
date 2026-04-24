import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getBookings } from "@/app/api/me/bookings/route";
import type { Booking } from "@/types/beautonomi";

export async function fetchBookingsUpcomingInitial(): Promise<Booking[]> {
  const req = await createNextRequestFromHeaders(
    "/api/me/bookings?status=upcoming&limit=100&page=1&sort_by=scheduled_at&sort_dir=desc",
  );
  const res = await getBookings(req);
  const json = (await res.json().catch(() => ({}))) as {
    data?: { items?: Booking[] };
  };
  if (!res.ok) return [];
  const items = json?.data?.items;
  return Array.isArray(items) ? items : [];
}

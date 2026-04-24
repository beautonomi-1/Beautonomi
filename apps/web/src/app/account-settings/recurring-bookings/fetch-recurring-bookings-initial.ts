import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getRecurringBookings } from "@/app/api/recurring-bookings/route";
import type { RecurringBookingListItem } from "./recurring-list-types";

export async function fetchRecurringBookingsInitial(): Promise<RecurringBookingListItem[] | null> {
  const req = await createNextRequestFromHeaders("/api/recurring-bookings");
  const res = await getRecurringBookings(req);
  const json = (await res.json().catch(() => ({}))) as {
    data?: { recurring?: RecurringBookingListItem[] };
  };
  if (!res.ok) return null;
  const recurring = json.data?.recurring;
  return Array.isArray(recurring) ? recurring : [];
}

import { api } from "@/lib/api-client";
import type { Booking } from "@/types/api";

export const CUSTOMER_BOOKINGS_PAGE_SIZE = 100;

export type CustomerBookingsStatus = "upcoming" | "past" | "cancelled";
export type CustomerBookingsSortBy = "scheduled_at" | "created_at";
export type CustomerBookingsSortDir = "asc" | "desc";

interface BookingsResponse {
  data?: Booking[];
  items?: Booking[];
  has_more?: boolean;
}

export function extractBookingsList(body: BookingsResponse | Booking[] | null | undefined): Booking[] {
  if (body == null) return [];
  if (Array.isArray(body)) return body;
  const items = body.items ?? body.data;
  return Array.isArray(items) ? items : [];
}

export function hasMoreBookingsPage(
  body: BookingsResponse | Booking[] | null | undefined,
  list: Booking[],
): boolean {
  if (Array.isArray(body)) return list.length >= CUSTOMER_BOOKINGS_PAGE_SIZE;
  if (typeof body?.has_more === "boolean") return body.has_more;
  return list.length >= CUSTOMER_BOOKINGS_PAGE_SIZE;
}

export async function fetchAllBookingsPages({
  status,
  sortBy,
  sortDir,
}: {
  status?: CustomerBookingsStatus;
  sortBy: CustomerBookingsSortBy;
  sortDir: CustomerBookingsSortDir;
}): Promise<{ data: Booking[] | null; error?: { message?: string } }> {
  const all: Booking[] = [];

  for (let page = 1; ; page += 1) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("sort_by", sortBy);
    params.set("sort_dir", sortDir);
    params.set("limit", String(CUSTOMER_BOOKINGS_PAGE_SIZE));
    params.set("page", String(page));

    const res = await api.get<BookingsResponse | Booking[]>(`/api/me/bookings?${params.toString()}`);
    if (res.error) {
      return { data: null, error: res.error };
    }

    const body = res.data as BookingsResponse | Booking[] | undefined;
    const list = extractBookingsList(body);
    all.push(...list);

    if (!hasMoreBookingsPage(body, list)) {
      return { data: all };
    }
  }
}

/**
 * Customer-app API paths that are **not** under `/api/me/`.
 * The shared `api` client (`@/lib/api-client`) attaches the Supabase **Bearer** token to every request.
 *
 * - **Booking reviews:** `apps/web/src/app/api/bookings/[id]/review/route.ts` — POST create, PATCH update, DELETE (customer role; ownership checked server-side).
 * - **Recurring bookings:** `apps/web/src/app/api/recurring-bookings/route.ts` and `[id]/route.ts` — `requireAuthInApi`; rows scoped by `customer_id = user.id`.
 */
export function apiBookingReviewPath(bookingId: string): string {
  return `/api/bookings/${encodeURIComponent(bookingId)}/review`;
}

/** List (GET) and create (POST) recurring series for the signed-in customer. */
export const API_RECURRING_BOOKINGS = "/api/recurring-bookings" as const;

export function apiRecurringBookingPath(id: string): string {
  return `/api/recurring-bookings/${encodeURIComponent(id)}`;
}

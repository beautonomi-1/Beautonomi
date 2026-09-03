import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffPermissions } from "@/lib/auth/permissions";
import { getStaffPermissions, getStaffMember, isProviderOwner } from "@/lib/auth/permissions";

export type CalendarScope = "own" | "all";

export function resolveCalendarScope(permissions: StaffPermissions | null | undefined): CalendarScope {
  const raw = (permissions as Record<string, unknown> | null | undefined)?.calendar_scope;
  return raw === "all" ? "all" : "own";
}

export async function getCalendarScopeForUser(
  userId: string,
  request?: NextRequest | Request,
): Promise<{ scope: CalendarScope; staffId: string | null; isOwner: boolean }> {
  const isOwner = await isProviderOwner(userId, request);
  if (isOwner) {
    return { scope: "all", staffId: null, isOwner: true };
  }

  const [permissions, staff] = await Promise.all([
    getStaffPermissions(userId, undefined, request),
    getStaffMember(userId, request),
  ]);

  return {
    scope: resolveCalendarScope(permissions),
    staffId: staff?.id ?? null,
    isOwner: false,
  };
}

export type ScopedBookingLike = {
  /** Legacy single-assignee column (nullable / absent on some schemas). */
  staff_id?: string | null;
  booking_services?: Array<{ staff_id?: string | null }> | null;
};

/** Filter booking rows to those assigned to staffId when scope is own. */
export function filterBookingsByCalendarScope<T extends ScopedBookingLike>(
  bookings: T[],
  scope: CalendarScope,
  staffId: string | null,
): T[] {
  if (scope === "all" || !staffId) return bookings;
  return bookings.filter((b) => bookingIncludesStaff(b, staffId));
}

/** True when the booking is assigned to the staff on the booking row or any service line. */
export function bookingIncludesStaff(booking: ScopedBookingLike, staffId: string): boolean {
  if (!staffId) return false;
  if (booking.staff_id && booking.staff_id === staffId) return true;
  return (booking.booking_services ?? []).some((s) => s.staff_id === staffId);
}

export const CALENDAR_SCOPE_FORBIDDEN_CODE = "CALENDAR_SCOPE_FORBIDDEN";

export type CalendarScopeGate =
  | { allowed: true; scope: CalendarScope; staffId: string | null }
  | { allowed: false; scope: "own"; staffId: string | null; response: NextResponse };

/**
 * Server-side gate for single-booking routes: when the caller's scope is
 * `own`, the booking must include their staff id (booking.staff_id or any
 * booking_services.staff_id). Returns a ready 403 response otherwise.
 * Fails closed when the staff row cannot be resolved for an `own` scope.
 */
export async function assertCalendarScopeAllowsBooking(
  admin: SupabaseClient,
  userId: string,
  providerId: string,
  bookingId: string,
  request?: NextRequest | Request,
): Promise<CalendarScopeGate> {
  const { scope, staffId } = await getCalendarScopeForUser(userId, request);
  if (scope === "all") return { allowed: true, scope, staffId };

  const forbidden = (): CalendarScopeGate => ({
    allowed: false,
    scope: "own",
    staffId,
    response: NextResponse.json(
      {
        error: "Forbidden",
        code: CALENDAR_SCOPE_FORBIDDEN_CODE,
        message: "This appointment is assigned to another team member. Your calendar access is limited to your own appointments.",
      },
      { status: 403 },
    ),
  });

  if (!staffId) return forbidden();

  const { data, error } = await admin
    .from("bookings")
    .select("id, staff_id, booking_services(staff_id)")
    .eq("id", bookingId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (error) {
    // bookings.staff_id may not exist on older schemas — retry without it.
    const { data: fallback } = await admin
      .from("bookings")
      .select("id, booking_services(staff_id)")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!fallback) return { allowed: true, scope, staffId }; // let the route 404
    return bookingIncludesStaff(fallback as ScopedBookingLike, staffId)
      ? { allowed: true, scope, staffId }
      : forbidden();
  }

  if (!data) return { allowed: true, scope, staffId }; // route will 404
  return bookingIncludesStaff(data as ScopedBookingLike, staffId) ? { allowed: true, scope, staffId } : forbidden();
}

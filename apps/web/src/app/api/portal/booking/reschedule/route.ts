import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { validatePortalToken } from "@/lib/portal/token";
import {
  executeReschedule,
  httpStatusForRescheduleError,
} from "@/lib/bookings/reschedule-core";
import { z } from "zod";

const rescheduleSchema = z.object({
  new_datetime: z.string().datetime("Invalid datetime format"),
});

/**
 * POST /api/portal/booking/reschedule
 *
 * Reschedule a booking via a portal token (passwordless access).
 *
 * §Cross-app audit 2026-04 (reschedule unification): previously this
 * route re-implemented ~350 lines of the same flow the customer route
 * used — with one important divergence that caused a real production
 * incident: the portal version silently fell open on a missing conflict
 * RPC (customer failed closed), letting portal users sometimes double-
 * book past the last defence. It also differed on timezone handling in
 * places. Both routes now share `executeReschedule` so those bugs can't
 * come back.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const body = await request.json();

    if (!token) {
      return handleApiError(
        new Error("Token required"),
        "Access token is required",
        "TOKEN_REQUIRED",
        400,
      );
    }

    const validated = rescheduleSchema.parse(body);
    const newDatetime = new Date(validated.new_datetime);

    const supabase = await getSupabaseServer();
    const adminSupabase = getSupabaseAdmin();

    const validation = await validatePortalToken(supabase, token);
    if (!validation.isValid || !validation.bookingId) {
      return handleApiError(
        new Error(validation.reason || "Invalid token"),
        validation.reason || "Invalid or expired access token",
        "INVALID_TOKEN",
        401,
      );
    }

    // ── Core flow. Portal has no authenticated user, so `actorUserId` is
    // null — the core inserts the booking_event without a `created_by`
    // reference in that case.
    const result = await executeReschedule({
      supabase,
      adminSupabase,
      bookingId: validation.bookingId,
      newDatetime,
      actor: "portal",
      actorUserId: null,
    });

    if (result.ok === false) {
      const { status, code } = httpStatusForRescheduleError(result.error);
      return handleApiError(
        new Error(result.error.message),
        result.error.message,
        code,
        status,
      );
    }

    // ── Portal post-flight: notify customer + provider of the new time.
    try {
      const { sendRescheduleNotification } = await import(
        "@/lib/bookings/notifications"
      );
      await sendRescheduleNotification(
        validation.bookingId,
        new Date(result.oldScheduledAt),
        new Date(result.newScheduledAt),
      );
    } catch (notifyErr) {
      console.error(
        "[portal-reschedule] notification dispatch failed:",
        notifyErr,
      );
    }

    return successResponse({
      booking: result.booking,
      message: "Booking rescheduled successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400,
      );
    }
    return handleApiError(error, "Failed to reschedule booking");
  }
}

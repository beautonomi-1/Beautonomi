import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  requireAuthInApi,
} from "@/lib/supabase/api-helpers";
import {
  executeReschedule,
  httpStatusForRescheduleError,
} from "@/lib/bookings/reschedule-core";
import { z } from "zod";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { EVENT_BOOKING_RESCHEDULED } from "@/lib/analytics/amplitude/types";

const rescheduleSchema = z.object({
  new_datetime: z.string().datetime("Invalid datetime format"),
});

/**
 * POST /api/me/bookings/[id]/reschedule
 *
 * Reschedule a booking (subject to cancellation policy and availability).
 *
 * §Cross-app audit 2026-04 (reschedule unification): this route used to
 * re-implement ~400 lines of availability, timezone, conflict-check, and
 * booking_services cascade logic inline. All of that now lives in
 * `lib/bookings/reschedule-core.ts#executeReschedule` so the customer,
 * portal, and provider surfaces share a single implementation. Divergence
 * (e.g. the old portal fail-open bug, or missing `timezone` option on
 * `calculateAvailableSlots`) is no longer possible. The only logic left
 * here is the customer-specific pre-flight (ownership + group-booking
 * primary-contact gate) and post-flight (notification + Amplitude).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { id: bookingId } = await params;
    const body = await request.json();

    const validated = rescheduleSchema.parse(body);
    const newDatetime = new Date(validated.new_datetime);

    const supabase = await getSupabaseServer(request);
    const adminSupabase = getSupabaseAdmin();

    // ── Customer-only pre-flight: ownership + group-booking gating.
    // The core engine doesn't know about `customer_id` (it's intentionally
    // actor-agnostic), so we check it here before entering the shared flow.
    const { data: bookingMeta, error: bookingMetaError } = await supabase
      .from("bookings")
      .select("id, customer_id, scheduled_at, provider_id")
      .eq("id", bookingId)
      .single();

    if (bookingMetaError || !bookingMeta) {
      return handleApiError(
        new Error("Booking not found"),
        "Booking not found",
        "NOT_FOUND",
        404,
      );
    }

    if ((bookingMeta as { customer_id?: string }).customer_id !== user.id) {
      return handleApiError(
        new Error("Unauthorized"),
        "You can only reschedule your own bookings",
        "UNAUTHORIZED",
        403,
      );
    }

    // If the booking is part of a group, only the primary contact can
    // reschedule it (same rule as before — enforced here so the core
    // engine can stay single-booking).
    const { data: participant } = await supabase
      .from("booking_participants")
      .select("group_booking_id, is_primary_contact")
      .eq("booking_id", bookingId)
      .single();

    if (participant?.group_booking_id && !participant.is_primary_contact) {
      const { data: groupBooking } = await supabase
        .from("group_bookings")
        .select(
          "primary_contact_booking_id, bookings!primary_contact_booking_id(customer_id, users!inner(email))",
        )
        .eq("id", participant.group_booking_id)
        .single();

      const primaryContactEmail =
        (groupBooking as { bookings?: { users?: { email?: string } } })?.bookings?.users?.email ||
        "the primary contact";

      return handleApiError(
        new Error("Only the primary contact can reschedule group bookings"),
        `Only the primary contact can reschedule group bookings. Please contact ${primaryContactEmail}.`,
        "GROUP_BOOKING_RESTRICTION",
        403,
      );
    }

    // ── Core flow.
    const result = await executeReschedule({
      supabase,
      adminSupabase,
      bookingId,
      newDatetime,
      actor: "customer",
      actorUserId: user.id,
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

    // ── Customer-only post-flight: reschedule notification + Amplitude.
    try {
      const { sendRescheduleNotification } = await import(
        "@/lib/bookings/notifications"
      );
      await sendRescheduleNotification(
        bookingId,
        new Date(result.oldScheduledAt),
        new Date(result.newScheduledAt),
      );
    } catch (notifyErr) {
      console.error("[me-reschedule] notification dispatch failed:", notifyErr);
    }

    try {
      await trackServer(
        EVENT_BOOKING_RESCHEDULED,
        {
          portal: "client",
          provider_id: result.providerId,
          booking_id: bookingId,
          old_scheduled_at: result.oldScheduledAt,
          new_scheduled_at: result.newScheduledAt,
        },
        user.id,
      );
    } catch (amplitudeError) {
      console.error(
        "[Amplitude] Failed to track booking reschedule:",
        amplitudeError,
      );
    }

    return successResponse({
      booking: result.booking,
      message: "Booking rescheduled successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(
          error.issues.map((e: { message: string }) => e.message).join(", "),
        ),
        "Validation failed",
        "VALIDATION_ERROR",
        400,
      );
    }
    return handleApiError(error, "Failed to reschedule booking");
  }
}

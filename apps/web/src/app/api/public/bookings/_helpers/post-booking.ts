import { SupabaseClient } from "@supabase/supabase-js";
import { trackServer } from "@/lib/analytics/amplitude/server";
import {
  EVENT_BOOKING_CONFIRMED,
  EVENT_BOOKING_HOLD_CREATED,
} from "@/lib/analytics/amplitude/types";
import type { BookingDraft } from "@/types/beautonomi";
import type { ValidatedBookingData } from "./validate-booking";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PostBookingInput {
  supabase: SupabaseClient;
  draft: BookingDraft;
  validatedDraft: Record<string, any>;
  v: ValidatedBookingData;
  booking: any;
  paymentUrl: string | null;
  savedPaymentMethodId?: string | null;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Execute post-booking side effects that should not block the booking
 * response (cache invalidation, waitlist matching, analytics).
 *
 * All errors are swallowed so a failed side-effect never breaks the booking.
 */
export async function postBookingEffects(input: PostBookingInput): Promise<void> {
  const { supabase, draft, validatedDraft, v, booking, savedPaymentMethodId } = input;

  // ── Invalidate availability cache ────────────────────────────────────────
  try {
    const { invalidateAvailabilityCache } = await import(
      "@/lib/availability/cache-invalidation"
    );
    const bookedDate = new Date(draft.selected_datetime).toISOString().split("T")[0];
    const firstStaffId = draft.services[0]?.staff_id;
    if (firstStaffId) {
      await invalidateAvailabilityCache(supabase, firstStaffId, bookedDate);
    }
  } catch (error) {
    console.error("Error invalidating availability cache:", error);
  }

  // ── Waitlist matching (background, non-blocking) ─────────────────────────
  Promise.resolve().then(async () => {
    try {
      const { findWaitlistMatches } = await import("@/lib/waitlist/matching");
      const { processWaitlistMatches } = await import("@/lib/waitlist/auto-booking");

      const matches = await findWaitlistMatches(supabase, draft.provider_id);
      await processWaitlistMatches(supabase, matches.slice(0, 5), draft.provider_id);
    } catch (error) {
      console.error("Error checking waitlist after booking creation:", error);
    }
  });

  // ── Amplitude analytics ──────────────────────────────────────────────────
  try {
    const userId = v.customerId || null;
    const holdId = validatedDraft.hold_id;

    if (holdId) {
      await trackServer(
        EVENT_BOOKING_HOLD_CREATED,
        {
          portal: "client",
          provider_id: draft.provider_id,
          hold_id: holdId,
          service_ids: draft.services.map((s) => s.offering_id),
          scheduled_at: draft.selected_datetime,
        },
        userId
      );
    }

    await trackServer(
      EVENT_BOOKING_CONFIRMED,
      {
        portal: "client",
        provider_id: draft.provider_id,
        booking_id: booking.id,
        total_amount: v.totalAmount,
        currency: v.currency,
        service_ids: draft.services.map((s) => s.offering_id),
        location_type: draft.location_type,
        payment_method: savedPaymentMethodId ? "saved_card" : "new_card",
      },
      userId
    );
  } catch (amplitudeError) {
    console.error("[Amplitude] Failed to track booking event:", amplitudeError);
  }
}

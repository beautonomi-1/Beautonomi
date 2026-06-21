import { SupabaseClient } from "@supabase/supabase-js";
import { trackServer } from "@/lib/analytics/amplitude/server";
import {
  EVENT_BOOKING_CONFIRMED,
  EVENT_BOOKING_HOLD_CREATED,
} from "@/lib/analytics/amplitude/types";
import { safely } from "@/lib/monitoring/route-metrics";
import type { PublicBookingValidatedBody } from "@/lib/public-booking/booking-draft-schema";
import type { BookingDraft } from "@/types/beautonomi";
import type { ValidatedBookingData } from "./validate-booking";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PostBookingInput {
  supabase: SupabaseClient;
  draft: BookingDraft;
  validatedDraft: PublicBookingValidatedBody;
  v: ValidatedBookingData;
  booking: any;
  paymentUrl: string | null;
  savedPaymentMethodId?: string | null;
}

// ─── Main function ────────────────────────────────────────────────────────────

const POST_EFFECT_METRIC = "booking_post_effects_failure_total";

/**
 * Execute post-booking side effects that should not block the booking response.
 * Every side effect is wrapped in `safely(...)` so failures are visible in metrics
 * + Sentry without breaking the booking.
 */
export async function postBookingEffects(input: PostBookingInput): Promise<void> {
  const { supabase, draft, validatedDraft, v, booking, savedPaymentMethodId } = input;
  const tagsBase = { provider_id: draft.provider_id, booking_id: booking?.id ?? null };

  await safely(
    async () => {
      const { invalidateProviderBookingsReadCache } = await import(
        "@/lib/bookings/provider-bookings-read-cache"
      );
      invalidateProviderBookingsReadCache(draft.provider_id);
    },
    { metric: POST_EFFECT_METRIC, tags: { ...tagsBase, op: "invalidateProviderBookingsReadCache" } },
  );

  await safely(
    async () => {
      const { invalidateAvailabilityCache } = await import(
        "@/lib/availability/cache-invalidation"
      );
      const bookedDate = new Date(draft.selected_datetime).toISOString().split("T")[0];
      const firstStaffId = draft.services[0]?.staff_id;
      if (firstStaffId) {
        await invalidateAvailabilityCache(supabase, firstStaffId, bookedDate);
      }
    },
    { metric: POST_EFFECT_METRIC, tags: { ...tagsBase, op: "invalidateAvailabilityCache" } },
  );

  // Waitlist matching runs detached from the await chain so it cannot extend TTFB,
  // but is still wrapped in safely() so failures are still observable.
  Promise.resolve().then(() =>
    safely(
      async () => {
        const { findWaitlistMatches } = await import("@/lib/waitlist/matching");
        const { processWaitlistMatches } = await import("@/lib/waitlist/auto-booking");
        const matches = await findWaitlistMatches(supabase, draft.provider_id);
        await processWaitlistMatches(supabase, matches.slice(0, 5), draft.provider_id);
      },
      { metric: POST_EFFECT_METRIC, tags: { ...tagsBase, op: "waitlistMatch" } },
    ),
  );

  // §Payment-truth 2026-06: when the customer is being redirected to an external
  // card gateway (Paystack), the booking is NOT yet paid (`status:
  // pending_payment`). Notifying the provider here causes "new booking / awaiting
  // payment" rows the instant checkout STARTS — even if the card later declines
  // or the customer abandons. Defer provider + customer confirmation
  // notifications to the payment-success path (`syncBookingAfterPaystackSuccess`),
  // which fires them once the charge is confirmed. Cash / wallet / gift-card /
  // saved-card-charged bookings have `paymentUrl == null` and notify immediately.
  const awaitingCardPayment = input.paymentUrl != null;

  if (!awaitingCardPayment) {
    await safely(
      async () => {
        const { notifyProviderNewBooking } = await import(
          "@/lib/notifications/notification-service"
        );
        await notifyProviderNewBooking(booking.id, ["push"]);
      },
      { metric: POST_EFFECT_METRIC, tags: { ...tagsBase, op: "notifyProviderNewBooking" } },
    );

    await safely(
      async () => {
        const { notifyBookingConfirmed } = await import(
          "@/lib/notifications/notification-service"
        );
        await notifyBookingConfirmed(booking.id, ["push", "email"]);
      },
      { metric: POST_EFFECT_METRIC, tags: { ...tagsBase, op: "notifyBookingConfirmed" } },
    );
  }

  void safely(
    async () => {
      const m = await import(
        "@/lib/subscriptions/subscription-limit-notifications"
      );
      await m.maybeNotifyProviderSubscriptionLimits(draft.provider_id);
    },
    { metric: POST_EFFECT_METRIC, tags: { ...tagsBase, op: "subscriptionLimitNotification" } },
  );

  await safely(
    async () => {
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
          userId,
        );
      }

      const pm = validatedDraft.payment_method || "card";
      const paymentMethodLabel =
        pm === "cash"
          ? "cash"
          : pm === "giftcard"
            ? "gift_card"
            : savedPaymentMethodId
              ? "saved_card"
              : "new_card";

      const total = Number(v.totalAmount);
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
          payment_method: paymentMethodLabel,
          payment_pending_redirect: input.paymentUrl != null,
          revenue: Number.isFinite(total) ? total : undefined,
          price: Number.isFinite(total) ? total : undefined,
        },
        userId,
      );
    },
    { metric: POST_EFFECT_METRIC, tags: { ...tagsBase, op: "amplitudeTrack" } },
  );
}

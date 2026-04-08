import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSubscribeFrequencyFromPaystack } from "@/lib/recurring/customer-recurring-helpers";
import { insertCustomerRecurringSeriesFromPaidBooking } from "@/lib/recurring/insert-customer-recurring-from-paid-booking";

function resolveBookingIdFromPaystackMetadata(metadata: Record<string, unknown>): string {
  const raw = metadata.booking_id ?? metadata.bookingId;
  return raw != null && String(raw).trim() !== "" ? String(raw) : "";
}

function resolveCustomerIdFromPaystackMetadata(metadata: Record<string, unknown>): string {
  const raw = metadata.customer_id ?? metadata.customerId;
  return raw != null && String(raw).trim() !== "" ? String(raw) : "";
}

/**
 * If Paystack metadata includes `subscribe_recurring_frequency`, create the customer recurring row
 * after payment succeeds (idempotent on `metadata.source_booking_id` on the inserted row).
 *
 * Used by `charge.success` webhooks and by `/api/paystack/verify` (checkout return / dev without webhook).
 */
export async function tryCreateCustomerRecurringFromPaystackChargeMetadata(
  admin: SupabaseClient,
  metadata: Record<string, unknown> | undefined,
): Promise<void> {
  if (!metadata) return;

  const bookingId = resolveBookingIdFromPaystackMetadata(metadata);
  const customerId = resolveCustomerIdFromPaystackMetadata(metadata);
  if (!bookingId || !customerId) return;

  const frequency = parseSubscribeFrequencyFromPaystack(metadata.subscribe_recurring_frequency);
  if (!frequency) return;

  const result = await insertCustomerRecurringSeriesFromPaidBooking({
    admin,
    bookingId,
    customerId,
    frequency,
    paymentMethod: "card",
  });

  if (result.ok === false) {
    console.error("[recurring] post-Paystack recurring insert failed:", result.message, {
      bookingId,
      customerId,
    });
  }
}

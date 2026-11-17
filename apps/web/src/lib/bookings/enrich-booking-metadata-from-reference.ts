import type { SupabaseClient } from "@supabase/supabase-js";

function hasOtherPaymentTarget(metadata: Record<string, unknown>): boolean {
  return Boolean(
    metadata.product_order_id ||
      metadata.wallet_topup_id ||
      metadata.gift_card_order_id ||
      metadata.membership_order_id ||
      metadata.provider_subscription_order_id ||
      metadata.custom_offer_id ||
      metadata.ads_budget_order_id ||
      metadata.kind === "card_verification" ||
      metadata.marketing_credit_topup === true ||
      metadata.marketing_credit_topup === "true",
  );
}

/**
 * Hosted checkout stores the Paystack reference on `bookings.payment_reference`
 * before the customer is redirected. Verify and the webhook can then still
 * route the charge when Paystack omits `metadata.booking_id`.
 */
export async function enrichBookingMetadataFromReference(
  supabase: SupabaseClient,
  reference: string | undefined | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (typeof metadata.booking_id === "string" && metadata.booking_id.trim()) return;
  if (typeof metadata.bookingId === "string" && metadata.bookingId.trim()) {
    metadata.booking_id = metadata.bookingId.trim();
    return;
  }
  if (hasOtherPaymentTarget(metadata)) return;
  const ref = String(reference ?? "").trim();
  if (!ref) return;

  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("payment_reference", ref)
    .maybeSingle();
  if (error || !data) return;
  const id = (data as { id?: unknown }).id;
  if (id != null && String(id).trim() !== "") {
    metadata.booking_id = String(id);
  }
}

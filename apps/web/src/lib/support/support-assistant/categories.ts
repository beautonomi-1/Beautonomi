/** Categories that must never enter assistant mode (human queue immediately). */
export function isSafetySupportCategory(category: string | null | undefined): boolean {
  const c = String(category ?? "").trim();
  return c.startsWith("safety_");
}

/** Categories where we may ask which booking/order without handoff. */
export function categoryExpectsLinkableRecord(category: string | null | undefined): boolean {
  const c = String(category ?? "").trim();
  if (!c) return false;
  if (isSafetySupportCategory(c)) return false;
  const linkable = new Set([
    "booking_issue",
    "booking_reschedule_cancel",
    "booking_provider_no_show",
    "marked_no_show_incorrectly",
    "booking_quality",
    "booking_group",
    "booking_waitlist",
    "booking_recurring",
    "client_conduct",
    "payment_failed_charge",
    "payment_refund",
    "payment_duplicate",
    "payment_invoice_receipt",
    "payment_subscription",
    "payment_gift_card",
    "payment_tips_wallet",
    "membership_billing",
    "order_status_shipping",
    "order_return_product",
  ]);
  return linkable.has(c);
}

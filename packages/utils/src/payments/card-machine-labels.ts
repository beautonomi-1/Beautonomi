/**
 * Provider-facing card payment vocabulary.
 * Internal values (payment_method, API codes, table names) stay unchanged.
 */

/** Manual mark-paid: records a card payment already taken elsewhere. */
export const MANUAL_CARD_METHOD_LABEL = "Card — already taken";
export const MANUAL_CARD_METHOD_HELPER =
  "Record a card payment you took on your own machine.";

export const CARD_MACHINE_NOUN = "card machine";

export function beautonomiCardMachineLabel(): string {
  return "Beautonomi card machine";
}

export function yocoCardMachineLabel(): string {
  return "Yoco card machine";
}

/** Payment history / receipt label for a stored payment row. */
export function formatCardPaymentHistoryLabel(params: {
  payment_method?: string | null;
  payment_provider?: string | null;
}): string {
  const method = String(params.payment_method ?? "").toLowerCase();
  const provider = String(params.payment_provider ?? "").toLowerCase();

  if (provider === "paycloud") return beautonomiCardMachineLabel();
  if (provider === "yoco") return yocoCardMachineLabel();
  if (
    provider === "paystack" ||
    provider === "stripe" ||
    provider === "flutterwave"
  ) {
    return "Card (online)";
  }
  if (method === "card") return "Card (recorded)";
  return "Card";
}

/** Collect-payment method option label (no money — list context). */
export function manualCardCollectOptionLabel(): string {
  return MANUAL_CARD_METHOD_LABEL;
}

/** Reports bucket for manual card entries (not gateway-captured). */
export function manualCardReportLabel(): string {
  return "Card (recorded)";
}

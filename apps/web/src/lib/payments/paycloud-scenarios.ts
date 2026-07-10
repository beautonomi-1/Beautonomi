/** Human-friendly messages for PayCloud response codes. */
export const PAYCLOUD_RESPONSE_MESSAGES: Record<string, string> = {
  "000": "Payment successful",
  "101": "Payment in progress — please wait",
  "102": "Payment was cancelled",
  "103": "Payment successful",
  "104": "Payment not found",
  "105": "Payment was refunded",
  "106": "Payment failed",
  "107": "Payment timed out — try again",
  "108": "Payment result unknown — check status",
  "110": "Payment cancelled on terminal",
  "111": "Card not read in time — try again",
  "112": "QR code expired — try again",
  "113": "A payment is already in progress — continuing that one",
  "114": "This payment type isn't supported on the card machine",
  "117": "This payment method isn't supported on this card machine",
  "119": "This payment can't be voided",
  "120": "Amount is over the allowed limit",
  "121": "Amount format is invalid",
  "201": "Payment details look invalid — try again",
  "999": "Something went wrong — try again or contact support",
};

export function humanizePaycloudResponse(code: string | null | undefined): string {
  if (!code) return "Payment didn't go through — try again";
  return PAYCLOUD_RESPONSE_MESSAGES[code] ?? `Payment error (${code})`;
}

export type PaycloudPayMethod = "card" | "qr";

export function resolvePayScenario(method: PaycloudPayMethod): {
  pay_scenario: string;
  pay_method_id?: string;
} {
  if (method === "qr") {
    return { pay_scenario: "BSCANQR_PAY", pay_method_id: "UnionPay" };
  }
  return { pay_scenario: "SWIPE_CARD" };
}

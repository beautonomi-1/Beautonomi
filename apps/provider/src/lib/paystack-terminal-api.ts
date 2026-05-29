/**
 * Paystack Terminal API paths for provider mobile.
 *
 * Uses live production routes until dedicated `/api/provider/paystack/*` handlers
 * are served by the deployed web app (Turbopack builds may omit new route trees).
 */
export const PAYSTACK_TERMINALS_DETAIL_PATH =
  "/api/provider/settings/payments?paystack_terminal_detail=1";

export const PAYSTACK_TERMINALS_ACTION_PATH = "/api/provider/settings/payments";

export const PAYSTACK_TERMINAL_PAYMENTS_LIST_PATH =
  "/api/provider/payments?paystack_terminal=1";

export const PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH = "/api/provider/payments";

/** @deprecated Prefer PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH with collection_intent action */
export const PAYSTACK_TERMINAL_PAYMENTS_LEGACY_PATH =
  "/api/provider/paystack/terminal-payments";

export type PaystackTerminalCollectionIntentBody = {
  terminal_id?: string;
  entity_type?: string;
  entity_id?: string;
  expected_amount?: number;
  customer_reference?: string;
};

export function paystackTerminalCollectionIntentPayload(
  body: PaystackTerminalCollectionIntentBody,
): Record<string, unknown> {
  return {
    paystackTerminalAction: "collection_intent",
    ...body,
  };
}

export function paystackTerminalAllocatePayload(
  paymentId: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  return {
    paystackTerminalAction: "allocate",
    paymentId,
    ...input,
  };
}

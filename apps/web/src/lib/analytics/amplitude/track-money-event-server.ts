import { trackServer } from "./server";

export type MoneyEventPortal = "client" | "provider" | "admin";

export type TrackMoneyEventParams = {
  /** Gateway / ledger reference. Drives `insert_id` so webhook + in-process paths dedupe. */
  reference: string;
  amount: number;
  currency?: string | null;
  userId?: string | null;
  paymentMethod?: string | null;
  paymentProvider?: string | null;
  portal?: MoneyEventPortal;
  /** Amplitude `$revenueType`, e.g. "booking", "additional_charge", "gift_card". */
  revenueType: string;
  /** Amplitude `$productId`, e.g. booking id, charge id, plan id. */
  productId?: string | null;
  quantity?: number;
  /** Event-specific ids (booking_id, charge_id, order_id, ...). Ids only — never names. */
  properties?: Record<string, unknown>;
};

/**
 * Derive the Amplitude dedup key for a money event.
 * Exported so tests (and callers that persist it) can assert the exact shape.
 */
export function buildMoneyEventInsertId(reference: string, eventName: string): string {
  return `${reference}:${eventName}`;
}

/**
 * Server-authoritative money event: one call shared by webhook and in-process settlement paths.
 * Amplitude dedupes on `insert_id` for 7 days, so double-emission is harmless.
 * Never throws — analytics must not break settlement.
 */
export async function trackMoneyEventServer(eventName: string, params: TrackMoneyEventParams): Promise<void> {
  const {
    reference,
    amount,
    currency,
    userId,
    paymentMethod,
    paymentProvider,
    portal = "client",
    revenueType,
    productId,
    quantity = 1,
    properties,
  } = params;

  if (!reference || !Number.isFinite(amount)) return;

  try {
    await trackServer(
      eventName,
      {
        portal,
        amount,
        currency: currency ?? undefined,
        payment_method: paymentMethod ?? undefined,
        payment_provider: paymentProvider ?? undefined,
        transaction_id: reference,
        ...(properties ?? {}),
      },
      userId ?? undefined,
      {
        insertId: buildMoneyEventInsertId(reference, eventName),
        revenue: amount,
        revenueType,
        productId: productId ?? undefined,
        quantity,
      },
    );
  } catch {
    // trackServer already swallows; belt-and-braces so callers never need try/catch.
  }
}

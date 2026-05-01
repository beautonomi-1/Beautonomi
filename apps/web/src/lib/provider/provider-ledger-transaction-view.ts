/**
 * Maps `finance_transactions` rows to a stable provider-facing shape for
 * mobile / portal lists. Must stay aligned with GET /api/provider/finance
 * and GET /api/provider/transactions (visible types, gross `payment` rows excluded).
 * Finance JSON lists respect `transaction_feed=all` when `location_id` is set (see finance route).
 */

/** Gross customer-charge rows — not provider take-home; hide from provider activity feed. */
export const PROVIDER_LEDGER_EXCLUDED_TYPES = new Set<string>(["payment"]);

/** Same allow-list as `finance/route.ts` `visibleTransactionTypes`. */
export const PROVIDER_LEDGER_VISIBLE_TYPES = new Set<string>([
  "provider_earnings",
  "refund",
  "payout",
  "tip",
  "travel_fee",
  "platform_fee",
  "service_fee",
  "tax",
  "membership_sale",
  "gift_card_sale",
  "walk_in_additional_charge",
  "additional_charge",
  "additional_charge_payment",
  "cancellation_fee",
  "provider_subscription_payment",
  "provider_ads_payment",
]);

export type ProviderTxnUiType =
  | "earning"
  | "fee"
  | "payout"
  | "tip"
  | "refund"
  | "adjustment";

export interface ProviderLedgerUiRow {
  id: string;
  type: ProviderTxnUiType;
  /** Absolute value for display formatting. */
  amount: number;
  /** +1 credit-style, -1 debit-style (used for adjustments). */
  sign: 1 | -1;
  description: string;
  status: string;
  created_at: string;
  client_name: string | null;
  payment_method: string | null;
  reference: string | null;
  booking_id: string | null;
  notes: string | null;
  transaction_type: string;
}

export function mapFinanceLedgerRowToProviderUi(row: {
  id: string;
  transaction_type: string;
  amount?: number | null;
  net?: number | null;
  created_at: string;
  description?: string | null;
  booking_id?: string | null;
  metadata?: unknown;
}): ProviderLedgerUiRow | null {
  const tt = row.transaction_type;
  if (PROVIDER_LEDGER_EXCLUDED_TYPES.has(tt)) return null;
  if (!PROVIDER_LEDGER_VISIBLE_TYPES.has(tt)) return null;

  const net = Number(row.net ?? row.amount ?? 0);
  const gross = Number(row.amount ?? 0);

  const base = {
    id: row.id,
    status: "completed",
    created_at: row.created_at,
    client_name: null as string | null,
    payment_method: null as string | null,
    reference: null as string | null,
    booking_id: row.booking_id ?? null,
    notes: typeof row.description === "string" ? row.description : null,
    transaction_type: tt,
  };

  if (tt === "provider_earnings") {
    if (net < 0) {
      return {
        ...base,
        type: "refund",
        amount: Math.abs(net),
        sign: -1,
        description: "Earnings reversal or adjustment",
      };
    }
    return {
      ...base,
      type: "earning",
      amount: Math.abs(net),
      sign: 1,
      description: "Service earnings (your net)",
    };
  }

  if (tt === "refund") {
    return {
      ...base,
      type: "refund",
      amount: Math.abs(net),
      sign: -1,
      description: typeof row.description === "string" ? row.description : "Refund",
    };
  }

  if (tt === "payout") {
    return {
      ...base,
      type: "payout",
      amount: Math.abs(net),
      sign: -1,
      description: "Payout to bank",
    };
  }

  if (tt === "tip") {
    return {
      ...base,
      type: "tip",
      amount: Math.abs(net),
      sign: 1,
      description: typeof row.description === "string" ? row.description : "Tip",
    };
  }

  if (tt === "service_fee" || tt === "platform_fee") {
    return {
      ...base,
      type: "fee",
      amount: Math.abs(net),
      sign: -1,
      description:
        tt === "service_fee"
          ? typeof row.description === "string"
            ? row.description.replace(/^Service fee/i, "Platform fee")
            : "Booking platform fee (retained by platform)"
          : typeof row.description === "string"
            ? row.description
            : "Platform fee (retained by platform)",
    };
  }

  if (tt === "travel_fee") {
    const amt = Math.abs(net) > 0 ? Math.abs(net) : Math.abs(gross);
    return {
      ...base,
      type: "earning",
      amount: amt,
      sign: 1,
      description: typeof row.description === "string" ? row.description : "Travel fee (provider payoutable)",
    };
  }

  if (tt === "tax") {
    const amt = Math.abs(net) > 0 ? Math.abs(net) : Math.abs(gross);
    return {
      ...base,
      type: "fee",
      amount: amt,
      sign: -1,
      description: typeof row.description === "string" ? row.description : "Tax",
    };
  }

  if (tt === "membership_sale") {
    return {
      ...base,
      type: "adjustment",
      amount: Math.abs(net),
      sign: net >= 0 ? 1 : -1,
      description: "Membership (ledger movement)",
    };
  }

  if (tt === "gift_card_sale") {
    return {
      ...base,
      type: "adjustment",
      amount: Math.abs(net),
      sign: net >= 0 ? 1 : -1,
      description: "Gift card (ledger movement)",
    };
  }

  if (tt === "walk_in_additional_charge") {
    return {
      ...base,
      type: "adjustment",
      amount: Math.abs(net),
      sign: net >= 0 ? 1 : -1,
      description: typeof row.description === "string" ? row.description : "Walk-in add-on",
    };
  }

  if (tt === "additional_charge" || tt === "additional_charge_payment") {
    return {
      ...base,
      type: "adjustment",
      amount: Math.abs(net),
      sign: net >= 0 ? 1 : -1,
      description: typeof row.description === "string" ? row.description : "Additional charge",
    };
  }

  if (tt === "provider_subscription_payment" || tt === "provider_ads_payment") {
    return {
      ...base,
      type: "fee",
      amount: Math.abs(net || gross),
      sign: -1,
      description:
        tt === "provider_subscription_payment"
          ? "Provider subscription charge"
          : "Ads or boost spend",
    };
  }

  if (tt === "cancellation_fee") {
    if (net < 0) {
      return {
        ...base,
        type: "refund",
        amount: Math.abs(net),
        sign: -1,
        description: typeof row.description === "string" ? row.description : "Cancellation adjustment",
      };
    }
    return {
      ...base,
      type: "earning",
      amount: Math.abs(net),
      sign: 1,
      description: typeof row.description === "string" ? row.description : "Cancellation fee",
    };
  }

  return null;
}

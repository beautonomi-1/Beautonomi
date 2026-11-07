/**
 * Read-only till label for provider day lists — matches provider before method.
 */

export type TillPaymentRow = {
  payment_method?: string | null;
  payment_provider?: string | null;
  status?: string | null;
  payment_provider_data?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type TillPaymentKind =
  | "online"
  | "yoco"
  | "cardMachine"
  | "paystackTerminal"
  | "wallet"
  | "giftCard"
  | "cash"
  | "manualCard";

/** English fallback; UIs translate the kind via `<prefix>.tillPayment.<kind>`. */
export const TILL_PAYMENT_LABEL_EN: Record<TillPaymentKind, string> = {
  online: "Online",
  yoco: "Yoco",
  cardMachine: "Card machine",
  paystackTerminal: "Paystack terminal",
  wallet: "Wallet",
  giftCard: "Gift card",
  cash: "Cash",
  manualCard: "Manual card",
};

function isTipOrCashbackRow(row: TillPaymentRow): boolean {
  const data = row.payment_provider_data;
  if (!data || typeof data !== "object") return false;
  if (data.tip === true || data.cashback === true) return true;
  return false;
}

export function tillPaymentKindFromRow(row: TillPaymentRow): TillPaymentKind | null {
  if ((row.status ?? "").toLowerCase() !== "completed") return null;

  const method = (row.payment_method ?? "").toLowerCase();
  const provider = (row.payment_provider ?? "").toLowerCase();

  if (provider === "paystack" || method === "paystack") return "online";
  if (provider === "stripe" || method === "stripe") return "online";
  if (provider === "yoco" || method === "yoco") return "yoco";
  if (provider === "paycloud") return "cardMachine";
  if (provider === "paystack_terminal" || method === "paystack_terminal") return "paystackTerminal";
  if (provider === "wallet" || method === "wallet") return "wallet";
  if (provider === "gift_card" || method === "gift_card") return "giftCard";
  if (method === "cash" || provider === "cash") return "cash";
  if (method === "card" && (provider === "other" || !provider)) return "manualCard";

  return null;
}

export function tillPaymentKindForBooking(rows: TillPaymentRow[]): TillPaymentKind | null {
  const sorted = [...rows].sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bt - at;
  });

  for (const row of sorted) {
    if (isTipOrCashbackRow(row)) continue;
    const kind = tillPaymentKindFromRow(row);
    if (kind) return kind;
  }
  return null;
}

export function tillPaymentLabelFromRow(row: TillPaymentRow): string | null {
  const kind = tillPaymentKindFromRow(row);
  return kind ? TILL_PAYMENT_LABEL_EN[kind] : null;
}

export function tillPaymentLabelForBooking(rows: TillPaymentRow[]): string | null {
  const kind = tillPaymentKindForBooking(rows);
  return kind ? TILL_PAYMENT_LABEL_EN[kind] : null;
}

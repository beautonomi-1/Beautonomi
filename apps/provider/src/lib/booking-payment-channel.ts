import { formatCardPaymentHistoryLabel } from "@beautonomi/utils";

export type BookingPaymentRow = {
  amount?: number | string | null;
  payment_method?: string | null;
  payment_provider?: string | null;
  status?: string | null;
  created_at?: string | null;
  notes?: string | null;
  created_by_user?: { full_name?: string | null } | null;
};

export type BookingRefundRow = {
  amount?: number | string | null;
  refund_method?: string | null;
  status?: string | null;
  reason?: string | null;
  created_at?: string | null;
  created_by_user?: { full_name?: string | null } | null;
};

export function getBookingPaymentChannelLabel(
  payment: Pick<BookingPaymentRow, "payment_method" | "payment_provider">,
): { label: string; tone: "online" | "terminal" | "cash" | "wallet" | "gift" | "other" } {
  const method = (payment.payment_method ?? "").toLowerCase();
  const provider = (payment.payment_provider ?? "").toLowerCase();

  if (method === "wallet" || provider === "wallet") {
    return { label: "Wallet", tone: "wallet" };
  }
  if (method === "gift_card" || provider === "gift_card") {
    return { label: "Gift card", tone: "gift" };
  }
  if (provider === "paystack") {
    return { label: "Paid online", tone: "online" };
  }
  if (provider === "paycloud" || provider === "yoco" || method === "card") {
    return {
      label: formatCardPaymentHistoryLabel({
        payment_method: method,
        payment_provider: provider,
      }),
      tone: "terminal",
    };
  }
  if (method === "cash" || provider === "cash") {
    return { label: "Cash (recorded)", tone: "cash" };
  }
  if (method === "bank_transfer") {
    return { label: "Bank transfer", tone: "other" };
  }
  return { label: "Other", tone: "other" };
}

export function isInPersonCollectedPayment(
  payment: Pick<BookingPaymentRow, "payment_method" | "payment_provider">,
): boolean {
  const method = (payment.payment_method ?? "").toLowerCase();
  const provider = (payment.payment_provider ?? "").toLowerCase();
  if (method === "cash" || provider === "cash") return true;
  if (provider === "paycloud" || provider === "yoco") return true;
  if (method === "card" && provider !== "paystack") return true;
  return false;
}

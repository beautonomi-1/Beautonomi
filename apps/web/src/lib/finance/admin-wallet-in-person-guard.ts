import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBookingPaymentsForRefundCap } from "@/lib/bookings/booking-refund-limits";
import {
  CASH_CLOSED_BY_STORE_CREDIT_NOTE,
  computeNonTerminalCashObligationAmount,
  sumCashRefundRows,
  sumNonTerminalInPersonCollected,
} from "@/lib/bookings/cancellation-cash-refund-obligation";
import { roundCurrency2 } from "@/lib/bookings/refund-processing";

export const WALLET_SUBSTITUTE_REASONS = new Set([
  "provider_cannot_return_cash",
  "customer_cannot_collect_cash",
  "goodwill",
]);

export type AdminWalletInPersonGuardResult =
  | { ok: true; pendingCashRefundIds: string[] }
  | { ok: false; error: string; code: string };

export async function assertAdminWalletInPersonSubstituteAllowed(
  supabase: SupabaseClient,
  params: {
    bookingId: string;
    tenantId?: string | null;
    amount: number;
    substituteReason?: string | null;
  },
): Promise<AdminWalletInPersonGuardResult> {
  const payments = await fetchBookingPaymentsForRefundCap(
    supabase,
    params.bookingId,
    params.tenantId,
  );
  const { data: refundRows } = await supabase
    .from("booking_refunds")
    .select("id, amount, refund_method, status, customer_disputed_at, notes")
    .eq("booking_id", params.bookingId);

  const rows = refundRows ?? [];
  const completedCash = sumCashRefundRows(rows, ["completed"]);
  const pendingCashRows = rows.filter(
    (r) =>
      String(r.status ?? "") === "pending" &&
      String(r.refund_method ?? "").toLowerCase() === "cash",
  );
  const pendingCashTotal = sumCashRefundRows(rows, ["pending"]);
  const inPersonUncovered = computeNonTerminalCashObligationAmount(payments, rows);
  const stillOwedInPerson = roundCurrency2(inPersonUncovered + pendingCashTotal);

  if (completedCash > 0.01 && stillOwedInPerson <= 0.01 && params.amount > 0.01) {
    return {
      ok: false,
      error:
        "In-person refund already recorded for this booking; wallet credit cannot be added on top.",
      code: "IN_PERSON_ALREADY_REFUNDED",
    };
  }

  if (stillOwedInPerson > 0.01 && params.amount > stillOwedInPerson + 0.01) {
    return {
      ok: false,
      error: "Refund amount exceeds the in-person refundable balance for this booking",
      code: "IN_PERSON_CAP_EXCEEDED",
    };
  }

  const inPersonCollected = sumNonTerminalInPersonCollected(payments);
  const requiresSubstitute =
    stillOwedInPerson > 0.01 ||
    (inPersonCollected > 0.01 && completedCash <= 0.01 && pendingCashTotal <= 0.01);

  if (!requiresSubstitute) {
    return { ok: true, pendingCashRefundIds: [] };
  }

  const reason = String(params.substituteReason ?? "").trim();
  if (!reason || !WALLET_SUBSTITUTE_REASONS.has(reason)) {
    const msg =
      pendingCashTotal > 0.01
        ? "This booking has a pending in-person cash refund awaiting customer confirmation. Pass substitute_reason (provider_cannot_return_cash, customer_cannot_collect_cash, or goodwill) to issue store credit instead."
        : "In-person payment on this booking requires substitute_reason (provider_cannot_return_cash, customer_cannot_collect_cash, or goodwill) to credit the wallet.";
    return { ok: false, error: msg, code: "SUBSTITUTE_REASON_REQUIRED" };
  }

  return {
    ok: true,
    pendingCashRefundIds: pendingCashRows.map((r) => String((r as { id: string }).id)),
  };
}

export async function closePendingCashReplacedByStoreCredit(
  supabase: SupabaseClient,
  refundIds: string[],
): Promise<void> {
  if (refundIds.length === 0) return;
  await supabase
    .from("booking_refunds")
    .update({
      status: "failed",
      notes: CASH_CLOSED_BY_STORE_CREDIT_NOTE,
    })
    .in("id", refundIds);
}

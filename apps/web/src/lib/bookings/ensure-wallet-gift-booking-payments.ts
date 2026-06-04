import type { SupabaseClient } from "@supabase/supabase-js";

/** Synthetic provider id; optional leg suffix enables multiple wallet/gift legs per booking (pay-remaining, additional charge). */
export function buildSyntheticWalletGiftProviderId(
  kind: "wallet" | "gift_card",
  bookingId: string,
  legSuffix = "",
): string {
  return `${kind}_booking:${bookingId}${legSuffix}`;
}

/**
 * Idempotent `booking_payments` rows for wallet / gift portions so
 * `update_booking_payment_status` sums match economic reality (wallet+card → paid).
 *
 * When `initialStatus` is `pending`, the finance ledger trigger does not run until
 * `completeWalletGiftSyntheticPayments` marks the row `completed` (after Paystack /
 * no-gateway ledger rows exist) — prevents double commission on split tender (F1).
 */
export async function ensureWalletGiftBookingPayments(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    tenantId: string | null | undefined;
    walletAmount: number;
    giftCardAmount: number;
    /** Default `completed` for pure wallet/gift settlements; use `pending` when a Paystack card leg will follow. */
    initialStatus?: "pending" | "completed";
    /** e.g. `:remaining:ref` or `:additional:chargeId` — unique booking_payments row per follow-up leg. */
    paymentLegSuffix?: string;
  },
): Promise<void> {
  const { bookingId, tenantId, paymentLegSuffix = "" } = input;
  const walletAmount = Math.round(Math.max(0, Number(input.walletAmount) || 0) * 100) / 100;
  const giftCardAmount = Math.round(Math.max(0, Number(input.giftCardAmount) || 0) * 100) / 100;
  const initialStatus = input.initialStatus ?? "completed";

  const insertOne = async (kind: "wallet" | "gift_card", amount: number) => {
    if (amount <= 0) return;
    const paymentProviderId = buildSyntheticWalletGiftProviderId(kind, bookingId, paymentLegSuffix);
    const { data: existing } = await admin
      .from("booking_payments")
      .select("id, status")
      .eq("booking_id", bookingId)
      .eq("payment_provider_id", paymentProviderId)
      .maybeSingle();
    if (existing && (existing as { status?: string }).status === "completed") return;
    if (existing) return;

    const row: Record<string, unknown> = {
      booking_id: bookingId,
      amount,
      payment_method: kind,
      payment_provider: kind,
      payment_provider_id: paymentProviderId,
      status: initialStatus,
      notes: `${kind} applied at checkout`,
      payment_provider_data: { source: "ensure_wallet_gift_booking_payments" },
    };
    if (tenantId) row.tenant_id = tenantId;

    const { error } = await admin.from("booking_payments").insert(row);
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("[ensureWalletGiftBookingPayments] insert failed:", error);
    }
  };

  await insertOne("wallet", walletAmount);
  await insertOne("gift_card", giftCardAmount);
}

/** Mark synthetic wallet/gift booking_payments `completed` after Paystack / no-gateway ledger exists (F1). */
export async function completeWalletGiftSyntheticPayments(
  admin: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const { error } = await admin
    .from("booking_payments")
    .update({ status: "completed", notes: "Synthetic wallet/gift leg — completed after gateway ledger" })
    .eq("booking_id", bookingId)
    .in("payment_provider", ["wallet", "gift_card"])
    .eq("status", "pending");
  if (error) {
    console.error("[completeWalletGiftSyntheticPayments] update failed:", error);
  }
}

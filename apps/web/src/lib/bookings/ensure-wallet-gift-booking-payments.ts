import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Idempotent `booking_payments` rows for wallet / gift portions so
 * `update_booking_payment_status` sums match economic reality (wallet+card → paid).
 */
export async function ensureWalletGiftBookingPayments(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    tenantId: string | null | undefined;
    walletAmount: number;
    giftCardAmount: number;
  },
): Promise<void> {
  const { bookingId, tenantId } = input;
  const walletAmount = Math.round(Math.max(0, Number(input.walletAmount) || 0) * 100) / 100;
  const giftCardAmount = Math.round(Math.max(0, Number(input.giftCardAmount) || 0) * 100) / 100;

  const insertOne = async (kind: "wallet" | "gift_card", amount: number) => {
    if (amount <= 0) return;
    const paymentProviderId = `${kind}_booking:${bookingId}`;
    const { data: existing } = await admin
      .from("booking_payments")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("payment_provider_id", paymentProviderId)
      .maybeSingle();
    if (existing) return;

    const row: Record<string, unknown> = {
      booking_id: bookingId,
      amount,
      payment_method: kind,
      payment_provider: kind,
      payment_provider_id: paymentProviderId,
      status: "completed",
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

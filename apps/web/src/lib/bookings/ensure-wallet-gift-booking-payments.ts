import type { SupabaseClient } from "@supabase/supabase-js";
import { addMoney, roundCurrency } from "@beautonomi/utils";

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
  const walletAmount = roundCurrency(Math.max(0, Number(input.walletAmount) || 0));
  const giftCardAmount = roundCurrency(Math.max(0, Number(input.giftCardAmount) || 0));
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

/** Wallet and gift already stored for one additional charge. A retry must not take them again. */
export async function sumAdditionalChargeTenderLegs(
  supabase: SupabaseClient,
  bookingId: string,
  chargeId: string,
): Promise<{ wallet: number; gift: number }> {
  const suffix = `:additional:${chargeId}`;
  const { data, error } = await supabase
    .from("booking_payments")
    .select("amount, payment_provider, payment_provider_id")
    .eq("booking_id", bookingId)
    .in("payment_provider", ["wallet", "gift_card"])
    .in("status", ["pending", "completed", "partially_refunded"]);
  if (error) {
    throw new Error(
      `Failed to read additional-charge tender for ${chargeId}: ${error.message}`,
    );
  }
  let wallet = 0;
  let gift = 0;
  for (const row of data ?? []) {
    const providerId = String((row as { payment_provider_id?: string | null }).payment_provider_id ?? "");
    if (!providerId.endsWith(suffix)) continue;
    const amount = Math.max(0, Number((row as { amount?: number | null }).amount ?? 0));
    const provider = String((row as { payment_provider?: string | null }).payment_provider ?? "");
    if (provider === "gift_card") gift = addMoney(gift, amount);
    else wallet = addMoney(wallet, amount);
  }
  return {
    wallet: roundCurrency(wallet),
    gift: roundCurrency(gift),
  };
}

/** Sum wallet and gift-card booking payments that are reserved but not yet in `total_paid`. */
export async function sumPendingWalletGiftBookingPayments(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("booking_payments")
    .select("amount")
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .in("payment_provider", ["wallet", "gift_card"]);
  if (error) {
    throw new Error(
      `Failed to read pending wallet or gift payments for booking ${bookingId}: ${error.message}`,
    );
  }
  const sum = (data ?? []).reduce(
    (total, row) => addMoney(total, Number((row as { amount?: number | null }).amount ?? 0)),
    0,
  );
  return roundCurrency(Math.max(0, sum));
}

/** Pending wallet and gift totals for many bookings. A read error throws so a charge is not sent without this hold. */
export async function sumPendingWalletGiftByBookingIds(
  supabase: SupabaseClient,
  bookingIds: string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  const ids = [...new Set(bookingIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabase
      .from("booking_payments")
      .select("booking_id, amount")
      .in("booking_id", chunk)
      .eq("status", "pending")
      .in("payment_provider", ["wallet", "gift_card"]);
    if (error) {
      throw new Error(`Failed to read pending wallet or gift payments: ${error.message}`);
    }
    for (const row of data ?? []) {
      const bookingId = String((row as { booking_id?: string }).booking_id ?? "");
      if (!bookingId) continue;
      const amount = Math.max(0, Number((row as { amount?: number | null }).amount ?? 0));
      totals.set(bookingId, addMoney(totals.get(bookingId) ?? 0, amount));
    }
  }
  for (const [bookingId, sum] of totals) {
    totals.set(bookingId, roundCurrency(sum));
  }
  return totals;
}

/**
 * Mark synthetic wallet/gift booking_payments `completed` after the ledger for that leg exists.
 * Pass `paymentLegSuffix` so a balance payment does not complete an extra-charge hold, and the reverse.
 * An empty suffix completes only the original checkout rows (`wallet_booking:{id}`).
 */
export async function completeWalletGiftSyntheticPayments(
  admin: SupabaseClient,
  bookingId: string,
  options?: { paymentLegSuffix?: string },
): Promise<void> {
  let query = admin
    .from("booking_payments")
    .update({ status: "completed", notes: "Synthetic wallet/gift leg — completed after gateway ledger" })
    .eq("booking_id", bookingId)
    .in("payment_provider", ["wallet", "gift_card"])
    .eq("status", "pending");
  if (options && Object.prototype.hasOwnProperty.call(options, "paymentLegSuffix")) {
    const suffix = options.paymentLegSuffix ?? "";
    query = query.in("payment_provider_id", [
      buildSyntheticWalletGiftProviderId("wallet", bookingId, suffix),
      buildSyntheticWalletGiftProviderId("gift_card", bookingId, suffix),
    ]);
  }
  const { error } = await query;
  if (error) {
    console.error("[completeWalletGiftSyntheticPayments] update failed:", error);
  }
}

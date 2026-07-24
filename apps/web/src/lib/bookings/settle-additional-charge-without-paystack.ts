/**
 * Mark an additional charge paid when wallet/gift fully covers the amount (no Paystack leg).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveCommissionPercentageForProvider } from "@/lib/finance/resolve-commission-percentage";
import { percentOf, subtractMoney } from "@beautonomi/utils";
import {
  completeWalletGiftSyntheticPayments,
} from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";

export async function settleAdditionalChargeWithoutPaystack(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    chargeId: string;
    customerId: string;
    providerId: string;
    tenantId: string | null;
    bookingNumber: string;
    chargeAmount: number;
    walletAmountApplied: number;
    giftCardAmountApplied: number;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    bookingId,
    chargeId,
    customerId,
    providerId,
    tenantId,
    bookingNumber,
    chargeAmount,
    walletAmountApplied,
    giftCardAmountApplied,
  } = input;

  const { data: charge } = await admin
    .from("additional_charges")
    .select("id, status, amount, description")
    .eq("id", chargeId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!charge || (charge as { status?: string }).status === "paid") {
    return { ok: true };
  }

  const collectible = Math.max(0, Number(chargeAmount) || 0);
  const tenderTotal =
    Math.round((walletAmountApplied + giftCardAmountApplied) * 100) / 100;
  if (tenderTotal + 0.005 < collectible) {
    return { ok: false, error: "Tender amounts do not cover the charge." };
  }

  const reference = `addl_nogw_${chargeId}`;

  const { data: existingFinance } = await admin
    .from("finance_transactions")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("transaction_type", "provider_earnings")
    .ilike("description", `%${chargeId}%`)
    .limit(1);
  if (Array.isArray(existingFinance) && existingFinance.length > 0) {
    if ((charge as { status?: string }).status !== "paid") {
      await admin.from("additional_charges").update({
        status: "paid",
        paid_at: new Date().toISOString(),
      }).eq("id", chargeId).eq("booking_id", bookingId);
    }
    return { ok: true };
  }

  if (giftCardAmountApplied > 0) {
    await (admin.rpc as any)("capture_gift_card_redemption", { p_booking_id: bookingId });
  }
  await completeWalletGiftSyntheticPayments(admin, bookingId);
  await syncBookingAfterPaystackSuccess(admin, bookingId, {
    paymentProvider: walletAmountApplied > 0 ? "wallet" : "gift_card",
  });

  const financeTenantId = await resolveTenantIdForFinanceLedger(admin, {
    tenant_id: tenantId,
    provider_id: providerId,
  });
  const commissionRate = await resolveCommissionPercentageForProvider(admin, {
    tenantId: financeTenantId,
    providerId,
  });
  const platformCommission =
    commissionRate > 0 ? percentOf(collectible, commissionRate) : 0;
  const providerEarnings = subtractMoney(collectible, platformCommission);

  await admin.from("finance_transactions").insert({
    booking_id: bookingId,
    provider_id: providerId,
    tenant_id: financeTenantId,
    transaction_type: "additional_charge_payment",
    amount: collectible,
    fees: 0,
    commission: platformCommission,
    net: platformCommission,
    description: `Additional charge (wallet/gift) for booking ${bookingNumber} (${chargeId})`,
    created_at: new Date().toISOString(),
  });

  await admin.from("finance_transactions").insert({
    booking_id: bookingId,
    provider_id: providerId,
    tenant_id: financeTenantId,
    transaction_type: "provider_earnings",
    amount: providerEarnings,
    fees: 0,
    commission: 0,
    net: providerEarnings,
    description: `Provider earnings (additional charge, wallet/gift) for booking ${bookingNumber} (${chargeId})`,
    created_at: new Date().toISOString(),
  });

  await admin.from("additional_charges").update({
    status: "paid",
    paid_at: new Date().toISOString(),
  }).eq("id", chargeId).eq("booking_id", bookingId);

  const { data: bookingRow } = await admin
    .from("bookings")
    .select("total_amount")
    .eq("id", bookingId)
    .maybeSingle();
  await admin
    .from("bookings")
    .update({
      total_amount:
        Number((bookingRow as { total_amount?: number } | null)?.total_amount ?? 0) + collectible,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "additional_payment_paid",
    event_data: {
      charge_id: chargeId,
      reference,
      amount: collectible,
      wallet_amount: walletAmountApplied,
      gift_card_amount: giftCardAmountApplied,
    },
    created_by: customerId,
  });

  return { ok: true };
}

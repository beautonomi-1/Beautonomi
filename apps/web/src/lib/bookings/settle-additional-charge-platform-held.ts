/**
 * Settle an additional charge that was collected by the platform (Paystack
 * online, saved-card charge-authorization, Paystack Terminal).
 *
 * Identical accounting path to the `handleAdditionalChargeSuccess` webhook
 * handler: `additional_charge_payment` (commission) + `provider_earnings`
 * (payout-eligible). Idempotency is enforced by the unique
 * `payment_transactions(provider, reference)` constraint.
 *
 * Call this from:
 *  - The Paystack charge.success webhook (for in-app Paystack redirect payments)
 *  - The charge-saved-card route (for card-on-file charges)
 *  - The Paystack Terminal allocation route (for terminal payments)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { percentOf, subtractMoney } from "@beautonomi/utils";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveCommissionPercentageForProvider } from "@/lib/finance/resolve-commission-percentage";

interface SettleAdditionalChargePlatformHeldInput {
  /** Paystack reference or stable idempotency reference for the charge. */
  reference: string;
  /** Amount in Paystack smallest unit (kobo / cents). */
  amountSmallestUnit: number;
  /** Gateway fees in smallest unit. */
  feesSmallestUnit?: number;
  /** The booking this charge belongs to. */
  bookingId: string;
  /** The `additional_charges.id` being settled. */
  chargeId: string;
  /** Paystack transaction ID (optional, for audit). */
  paystackTransactionId?: number | string | null;
  /** Customer (created_by for events and notifications). */
  customerId: string;
}

interface SettleResult {
  ok: true;
  alreadySettled?: boolean;
}

/**
 * @throws when booking or charge is not found and cannot be recovered.
 */
export async function settleAdditionalChargePlatformHeld(
  admin: SupabaseClient,
  input: SettleAdditionalChargePlatformHeldInput,
): Promise<SettleResult> {
  const {
    reference,
    amountSmallestUnit,
    feesSmallestUnit = 0,
    bookingId,
    chargeId,
    paystackTransactionId = null,
    customerId,
  } = input;

  const amountInCurrency = convertFromSmallestUnit(amountSmallestUnit);
  const feesInCurrency = convertFromSmallestUnit(feesSmallestUnit);

  // Fetch booking
  const { data: booking } = await admin
    .from("bookings")
    .select("id, provider_id, tenant_id, booking_number, ref_number, total_amount, currency")
    .eq("id", bookingId)
    .single();

  if (!booking) {
    throw new Error(
      `settle-additional-charge-platform-held: booking ${bookingId} not found (ref=${reference}, charge=${chargeId})`
    );
  }

  const bookingData = booking as {
    id: string;
    provider_id: string | null;
    tenant_id: string | null;
    booking_number?: string | null;
    ref_number?: string | null;
    total_amount?: number | null;
    currency?: string | null;
  };

  // Fetch charge
  const { data: charge } = await admin
    .from("additional_charges")
    .select("id, status, amount, description, currency")
    .eq("id", chargeId)
    .eq("booking_id", bookingId)
    .single();

  if (!charge) {
    throw new Error(
      `settle-additional-charge-platform-held: charge ${chargeId} not found for booking ${bookingId} (ref=${reference})`
    );
  }

  const chargeData = charge as {
    id: string;
    status: string;
    amount: number | null;
    description?: string | null;
    currency?: string | null;
  };

  if (chargeData.status === "paid") {
    return { ok: true, alreadySettled: true };
  }

  const chargeAmountMajor = Number(chargeData.amount ?? 0);
  const totalEconomicAmount = chargeAmountMajor > 0 ? chargeAmountMajor : amountInCurrency;
  const netAmount = amountInCurrency - feesInCurrency;

  // Commission + provider earnings
  const financeTenantId = await resolveTenantIdForFinanceLedger(admin as any, {
    tenant_id: bookingData.tenant_id as string | null | undefined,
    provider_id: bookingData.provider_id as string | null | undefined,
  });
  const commissionRate = await resolveCommissionPercentageForProvider(admin as any, {
    tenantId: bookingData.tenant_id ?? financeTenantId ?? null,
    providerId: bookingData.provider_id ?? null,
  });
  const platformCommission =
    commissionRate > 0 ? percentOf(totalEconomicAmount, commissionRate) : 0;
  const providerEarnings = subtractMoney(totalEconomicAmount, platformCommission);

  // Idempotency guard — unique on (provider, reference)
  const { error: ptInsertError } = await admin.from("payment_transactions").insert({
    booking_id: bookingId,
    reference,
    amount: amountInCurrency,
    fees: feesInCurrency,
    net_amount: netAmount,
    status: "success",
    provider: "paystack",
    transaction_type: "additional_charge",
    metadata: {
      additional_charge_id: chargeId,
      paystack_transaction_id: paystackTransactionId,
    },
    created_at: new Date().toISOString(),
  });

  if (ptInsertError) {
    if ((ptInsertError as { code?: string }).code === "23505") {
      // Already settled by webhook or parallel path.
      return { ok: true, alreadySettled: true };
    }
    throw ptInsertError;
  }

  const now = new Date().toISOString();

  // Mark charge paid
  await admin
    .from("additional_charges")
    .update({ status: "paid", paid_at: now })
    .eq("id", chargeId)
    .eq("booking_id", bookingId);

  // Increment booking total_amount
  await admin
    .from("bookings")
    .update({
      total_amount: Number(bookingData.total_amount ?? 0) + chargeAmountMajor,
      updated_at: now,
    })
    .eq("id", bookingId);

  // Finance ledger
  await admin.from("finance_transactions").insert({
    booking_id: bookingId,
    provider_id: bookingData.provider_id,
    tenant_id: financeTenantId,
    transaction_type: "additional_charge_payment",
    amount: totalEconomicAmount,
    fees: feesInCurrency,
    commission: platformCommission,
    net: platformCommission,
    description: `Additional charge payment for booking ${bookingData.booking_number ?? bookingData.ref_number ?? bookingId}`,
    created_at: now,
  });

  await admin.from("finance_transactions").insert({
    booking_id: bookingId,
    provider_id: bookingData.provider_id,
    tenant_id: financeTenantId,
    transaction_type: "provider_earnings",
    amount: providerEarnings,
    fees: 0,
    commission: 0,
    net: providerEarnings,
    description: `Provider earnings (additional charge) for booking ${bookingData.booking_number ?? bookingData.ref_number ?? bookingId}`,
    created_at: now,
  });

  // Booking payments ledger row (parity with walk-in mark-paid flow)
  try {
    await admin.from("booking_payments").insert({
      booking_id: bookingId,
      amount: amountInCurrency,
      payment_method: "card",
      payment_provider: "paystack",
      payment_provider_id: reference,
      payment_provider_data: {
        additional_charge_id: chargeId,
        paystack_reference: reference,
        paystack_fees: feesInCurrency,
        paystack_transaction_id: paystackTransactionId,
      },
      status: "completed",
      notes: `Additional charge payment via saved card (${chargeData.description ?? "add-on"})`,
      created_by: customerId,
      ...(bookingData.tenant_id ? { tenant_id: bookingData.tenant_id } : {}),
    });
  } catch (bpErr) {
    console.warn("[settle-additional-charge] booking_payments insert failed:", bpErr);
  }

  // Booking event
  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "additional_payment_paid",
    event_data: {
      charge_id: chargeId,
      reference,
      amount: amountInCurrency,
      method: "card_on_file",
    },
    created_by: customerId,
  });

  // Notifications (best-effort, deduped via paid_notified_at)
  try {
    const { notifyAdditionalChargePaid } = await import(
      "@/lib/notifications/notify-additional-charge-paid"
    );
    await notifyAdditionalChargePaid(admin, chargeId);
  } catch (notifErr) {
    console.warn("[settle-additional-charge] notification failed:", notifErr);
  }

  try {
    const { trackAdditionalChargePaidServer } = await import(
      "@/lib/analytics/amplitude/track-additional-charge-paid-server"
    );
    await trackAdditionalChargePaidServer({
      reference,
      bookingId,
      chargeId,
      amount: amountInCurrency,
      customerId,
      paymentMethod: "saved_card",
      paymentProvider: "paystack",
    });
  } catch (analyticsErr) {
    console.warn("[settle-additional-charge] analytics failed:", analyticsErr);
  }

  return { ok: true };
}

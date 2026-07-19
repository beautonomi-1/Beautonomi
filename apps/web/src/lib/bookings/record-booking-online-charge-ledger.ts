/**
 * Finance ledger writer for platform-held online gateway charges (Paystack, Stripe, Flutterwave).
 * Trigger `create_finance_ledger_from_payment` skips these providers; the webhook must post rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveCommissionPercentageForProvider } from "@/lib/finance/resolve-commission-percentage";
import { percentOf, subtractMoney } from "@beautonomi/utils";

export type OnlineGatewayLedgerProvider = "paystack" | "stripe" | "flutterwave";

export type RecordBookingOnlineChargeLedgerInput = {
  bookingId: string;
  reference: string;
  provider: OnlineGatewayLedgerProvider;
  amountMajor: number;
  feesMajor?: number;
  walletAmountApplied?: number;
  giftCardAmountApplied?: number;
  customerEmail?: string | null;
  feeSource?: string;
  metadata?: Record<string, unknown>;
};

export type RecordBookingOnlineChargeLedgerResult =
  | { ok: true; skipped: boolean; isSecondCharge: boolean }
  | { ok: false; reason: "booking_not_found" | "insert_failed"; error?: unknown };

type BookingRow = {
  id: string;
  booking_number?: string | null;
  provider_id?: string | null;
  tenant_id?: string | null;
  total_amount?: number | null;
  tip_amount?: number | null;
  tax_amount?: number | null;
  travel_fee?: number | null;
  platform_fee_amount?: number | null;
  service_fee_amount?: number | null;
  platform_service_fee?: number | null;
};

export async function recordBookingOnlineChargeLedger(
  supabase: SupabaseClient,
  input: RecordBookingOnlineChargeLedgerInput,
): Promise<RecordBookingOnlineChargeLedgerResult> {
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, provider_id, tenant_id, total_amount, tip_amount, tax_amount, travel_fee, platform_fee_amount, service_fee_amount, platform_service_fee",
    )
    .eq("id", input.bookingId)
    .maybeSingle();

  if (bookingError || !booking) {
    return { ok: false, reason: "booking_not_found", error: bookingError };
  }

  const bookingData = booking as BookingRow;
  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: bookingData.tenant_id,
    provider_id: bookingData.provider_id,
  });

  const { data: existingPaymentTxForRef } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("provider", input.provider)
    .eq("reference", input.reference)
    .maybeSingle();

  if (existingPaymentTxForRef) {
    return { ok: true, skipped: true, isSecondCharge: false };
  }

  const { data: existingFinancePaymentRow } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("booking_id", input.bookingId)
    .eq("transaction_type", "payment")
    .maybeSingle();
  const isSecondCharge = Boolean(existingFinancePaymentRow);

  const amountInCurrency = Math.max(0, Number(input.amountMajor || 0));
  const feesInCurrency = Math.max(0, Number(input.feesMajor ?? 0));
  const netAmount = Math.max(0, amountInCurrency - feesInCurrency);
  const walletAmountFromMeta = Math.max(0, Number(input.walletAmountApplied ?? 0));
  const giftCardAmountFromMeta = Math.max(0, Number(input.giftCardAmountApplied ?? 0));
  const totalCollectedForCommission =
    amountInCurrency + walletAmountFromMeta + giftCardAmountFromMeta;

  const tipAmount = Number(bookingData.tip_amount ?? 0);
  const taxAmount = Number(bookingData.tax_amount ?? 0);
  const travelFee = Number(bookingData.travel_fee ?? 0);
  const serviceFeeAmount = Number(
    bookingData.platform_fee_amount || bookingData.service_fee_amount || bookingData.platform_service_fee || 0,
  );

  const bookingTotal = Number(bookingData.total_amount || 0);
  const fullCommissionBase =
    bookingTotal > 0 ? bookingTotal - tipAmount - taxAmount - travelFee - serviceFeeAmount : 0;
  const netRevenueRatio = bookingTotal > 0 ? Math.max(0, fullCommissionBase / bookingTotal) : 1;
  const commissionBase = Math.max(
    0,
    Math.round(totalCollectedForCommission * netRevenueRatio * 100) / 100,
  );

  const commissionRate = await resolveCommissionPercentageForProvider(supabase, {
    tenantId: financeTenantId,
    providerId: bookingData.provider_id ?? null,
  });
  const platformCommission = commissionRate > 0 ? percentOf(commissionBase, commissionRate) : 0;
  const providerEarnings = subtractMoney(commissionBase, platformCommission);

  const webhookNow = new Date().toISOString();
  const bookingNumber = bookingData.booking_number ?? input.bookingId;

  const { error: paymentTxInsertError } = await supabase.from("payment_transactions").insert({
    booking_id: input.bookingId,
    reference: input.reference,
    amount: amountInCurrency,
    fees: feesInCurrency,
    net_amount: netAmount,
    status: "success",
    provider: input.provider,
    metadata: {
      ...(input.metadata ?? {}),
      fee_source: input.feeSource ?? `${input.provider}_webhook`,
      customer_email: input.customerEmail ?? null,
    },
    created_at: webhookNow,
  });

  if (paymentTxInsertError) {
    if (paymentTxInsertError.code === "23505") {
      return { ok: true, skipped: true, isSecondCharge };
    }
    return { ok: false, reason: "insert_failed", error: paymentTxInsertError };
  }

  if (!isSecondCharge) {
    await supabase.from("finance_transactions").insert({
      booking_id: input.bookingId,
      provider_id: bookingData.provider_id ?? null,
      tenant_id: financeTenantId,
      transaction_type: "payment",
      amount: commissionBase,
      fees: feesInCurrency,
      commission: platformCommission,
      net: platformCommission,
      description: `Payment for booking ${bookingNumber}`,
      created_at: webhookNow,
    });

    await supabase.from("finance_transactions").insert({
      booking_id: input.bookingId,
      provider_id: bookingData.provider_id ?? null,
      tenant_id: financeTenantId,
      transaction_type: "provider_earnings",
      amount: providerEarnings,
      fees: 0,
      commission: 0,
      net: providerEarnings,
      description: `Provider earnings for booking ${bookingNumber}`,
      created_at: webhookNow,
    });

    if (serviceFeeAmount > 0) {
      await supabase.from("finance_transactions").insert({
        booking_id: input.bookingId,
        provider_id: bookingData.provider_id ?? null,
        tenant_id: financeTenantId,
        transaction_type: "platform_fee",
        amount: serviceFeeAmount,
        fees: 0,
        commission: 0,
        net: serviceFeeAmount,
        description: `Platform fee for booking ${bookingNumber}`,
        created_at: webhookNow,
      });
    }

    await supabase.from("finance_transactions").insert([
      ...(tipAmount > 0
        ? [
            {
              booking_id: input.bookingId,
              provider_id: bookingData.provider_id ?? null,
              tenant_id: financeTenantId,
              transaction_type: "tip",
              amount: tipAmount,
              fees: 0,
              commission: 0,
              net: tipAmount,
              description: `Tip for booking ${bookingNumber}`,
              created_at: webhookNow,
            },
          ]
        : []),
      ...(taxAmount > 0
        ? [
            {
              booking_id: input.bookingId,
              provider_id: bookingData.provider_id ?? null,
              tenant_id: financeTenantId,
              transaction_type: "tax",
              amount: taxAmount,
              fees: 0,
              commission: 0,
              net: 0,
              description: `Tax for booking ${bookingNumber}`,
              created_at: webhookNow,
            },
          ]
        : []),
      ...(travelFee > 0
        ? [
            {
              booking_id: input.bookingId,
              provider_id: bookingData.provider_id ?? null,
              tenant_id: financeTenantId,
              transaction_type: "travel_fee",
              amount: travelFee,
              fees: 0,
              commission: 0,
              net: travelFee,
              description: `Travel fee for booking ${bookingNumber}`,
              created_at: webhookNow,
            },
          ]
        : []),
    ]);
  } else {
    await supabase.from("finance_transactions").insert([
      {
        booking_id: input.bookingId,
        provider_id: bookingData.provider_id ?? null,
        tenant_id: financeTenantId,
        transaction_type: "payment",
        amount: commissionBase,
        fees: feesInCurrency,
        commission: platformCommission,
        net: platformCommission,
        description: `Payment (charge 2) for booking ${bookingNumber}`,
        created_at: webhookNow,
      },
      {
        booking_id: input.bookingId,
        provider_id: bookingData.provider_id ?? null,
        tenant_id: financeTenantId,
        transaction_type: "provider_earnings",
        amount: providerEarnings,
        fees: 0,
        commission: 0,
        net: providerEarnings,
        description: `Provider earnings (charge 2) for booking ${bookingNumber}`,
        created_at: webhookNow,
      },
    ]);
  }

  return { ok: true, skipped: false, isSecondCharge };
}

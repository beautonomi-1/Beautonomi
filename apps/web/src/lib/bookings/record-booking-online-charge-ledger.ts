/**
 * Finance ledger writer for platform-held online gateway charges (Paystack, Stripe, Flutterwave).
 * Trigger `create_finance_ledger_from_payment` skips these providers; the webhook must post rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveCommissionPercentageForProvider } from "@/lib/finance/resolve-commission-percentage";
import { percentOf, subtractMoney } from "@beautonomi/utils";
import { fetchBookingCommissionContext } from "./fetch-booking-commission-context";
import {
  resolveCommissionBaseForBookingPayment,
  sumPendingBookingLevelCatchUpNet,
} from "./resolve-commission-base-for-booking-payment";
import {
  postBookingAuditLedgerLegsIfMissing,
  type AuditLegDescriptionStyle,
} from "./post-booking-audit-ledger-legs";

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
  /** When true, defer tip/tax/travel/platform_fee until a later non-deposit charge. */
  isDeposit?: boolean;
  /** booking_payments.id for this charge — written to finance_transactions.source_payment_id. */
  sourcePaymentId?: string | null;
  bookingLevelAmountOverrides?: {
    tip?: number;
    tax?: number;
    travel?: number;
    platformFee?: number;
  };
  descriptions?: { payment?: string; providerEarnings?: string };
  paymentTransactionType?: string;
  auditLegStyle?: AuditLegDescriptionStyle;
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
  promotion_discount_amount?: number | null;
  membership_discount_amount?: number | null;
  loyalty_discount_amount?: number | null;
};

function withSourcePaymentId(
  row: Record<string, unknown>,
  sourcePaymentId?: string | null,
): Record<string, unknown> {
  return sourcePaymentId ? { ...row, source_payment_id: sourcePaymentId } : row;
}

function resolveBookingLevelAmounts(
  bookingData: BookingRow,
  overrides?: RecordBookingOnlineChargeLedgerInput["bookingLevelAmountOverrides"],
): { tip: number; tax: number; travel: number; platformFee: number } {
  return {
    tip: Number(overrides?.tip ?? bookingData.tip_amount ?? 0),
    tax: Number(overrides?.tax ?? bookingData.tax_amount ?? 0),
    travel: Number(overrides?.travel ?? bookingData.travel_fee ?? 0),
    platformFee: Number(
      overrides?.platformFee ??
        (bookingData.platform_fee_amount ||
          bookingData.service_fee_amount ||
          bookingData.platform_service_fee ||
          0),
    ),
  };
}

function platformFeeAlreadyPosted(existingTypes: Set<string>): boolean {
  return existingTypes.has("platform_fee") || existingTypes.has("service_fee");
}

/**
 * Whether the `payment` leg for this specific charge is already in the ledger.
 * Without a sourcePaymentId, or when any existing `payment` row predates
 * source_payment_id attribution, assume posted — re-posting money rows is worse
 * than skipping a rare backfill.
 */
async function isChargeLedgerAlreadyPosted(
  supabase: SupabaseClient,
  bookingId: string,
  sourcePaymentId: string | null | undefined,
): Promise<boolean> {
  if (!sourcePaymentId) return true;
  const { data, error } = await supabase
    .from("finance_transactions")
    .select("source_payment_id")
    .eq("booking_id", bookingId)
    .eq("transaction_type", "payment");
  if (error || !data) return true;
  const rows = data as Array<{ source_payment_id?: string | null }>;
  if (rows.length === 0) return false;
  if (rows.some((row) => !row.source_payment_id)) return true;
  return rows.some((row) => String(row.source_payment_id) === sourcePaymentId);
}

export async function recordBookingOnlineChargeLedger(
  supabase: SupabaseClient,
  input: RecordBookingOnlineChargeLedgerInput,
): Promise<RecordBookingOnlineChargeLedgerResult> {
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, provider_id, tenant_id, total_amount, tip_amount, tax_amount, travel_fee, platform_fee_amount, service_fee_amount, platform_service_fee, promotion_discount_amount, membership_discount_amount, loyalty_discount_amount",
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

  const { data: existingFinancePaymentRow } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("booking_id", input.bookingId)
    .eq("transaction_type", "payment")
    .maybeSingle();
  const isSecondCharge = Boolean(existingFinancePaymentRow);

  if (existingPaymentTxForRef && existingFinancePaymentRow) {
    // A `payment` row on the booking does not prove *this* charge was posted: a second
    // charge (pay-remaining, top-up) always finds the first charge's row. Attribute via
    // source_payment_id so a crash between the payment_transactions and finance inserts
    // is backfilled on retry instead of being silently skipped.
    const posted = await isChargeLedgerAlreadyPosted(supabase, input.bookingId, input.sourcePaymentId);
    if (posted) {
      return { ok: true, skipped: true, isSecondCharge: false };
    }
  }

  const amountInCurrency = Math.max(0, Number(input.amountMajor || 0));
  const feesInCurrency = Math.max(0, Number(input.feesMajor ?? 0));
  const netAmount = amountInCurrency - feesInCurrency;
  const walletAmountFromMeta = Math.max(0, Number(input.walletAmountApplied ?? 0));
  const giftCardAmountFromMeta = Math.max(0, Number(input.giftCardAmountApplied ?? 0));
  const totalCollectedForCommission =
    amountInCurrency + walletAmountFromMeta + giftCardAmountFromMeta;

  const { tip: tipAmount, tax: taxAmount, travel: travelFee, platformFee: serviceFeeAmount } =
    resolveBookingLevelAmounts(bookingData, input.bookingLevelAmountOverrides);

  const bookingTotal = Number(bookingData.total_amount || 0);
  const commissionContext = await fetchBookingCommissionContext(supabase, input.bookingId, {
    chargeAmount: totalCollectedForCommission,
    excludeReference: input.reference,
    excludePaymentId: input.sourcePaymentId ?? null,
  });
  const postBookingLevelFees =
    !input.isDeposit && !commissionContext.bookingLevelItemsAlreadyPosted;
  // Booking-level legs this run will still post (second-charge catch-up). Must be
  // netted off the residual before allocation, otherwise that cash is allocated to
  // provider_earnings and the catch-up insert counts it a second time.
  const pendingCatchUpNet = sumPendingBookingLevelCatchUpNet({
    tipAmount,
    travelFee,
    platformFee: serviceFeeAmount,
    existingTypes: commissionContext.existingBookingLevelTypes,
  });
  const postedLegsForResidual =
    commissionContext.postedLegsSum +
    (commissionContext.bookingLevelItemsAlreadyPosted ? pendingCatchUpNet : 0);
  const commissionBase = resolveCommissionBaseForBookingPayment({
    paymentAmount: totalCollectedForCommission,
    bookingTotal,
    platformFee: serviceFeeAmount,
    tip: tipAmount,
    tax: taxAmount,
    travel: travelFee,
    postedLegsSum: postedLegsForResidual,
    cumulativePaid: commissionContext.cumulativePaid,
    bookingLevelItemsAlreadyPosted: commissionContext.bookingLevelItemsAlreadyPosted,
  });

  const commissionRate = await resolveCommissionPercentageForProvider(supabase, {
    tenantId: financeTenantId,
    providerId: bookingData.provider_id ?? null,
  });
  const platformCommission = commissionRate > 0 ? percentOf(commissionBase, commissionRate) : 0;
  const providerEarnings = subtractMoney(commissionBase, platformCommission);

  const webhookNow = new Date().toISOString();
  const bookingNumber = bookingData.booking_number ?? input.bookingId;
  const sourcePaymentId = input.sourcePaymentId ?? null;
  const auditLegStyle = input.auditLegStyle ?? "shared";
  const paymentDescription =
    input.descriptions?.payment ?? `Payment for booking ${bookingNumber}`;
  const earningsDescription =
    input.descriptions?.providerEarnings ?? `Provider earnings for booking ${bookingNumber}`;
  const secondPaymentDescription =
    input.descriptions?.payment ?? `Payment (charge 2) for booking ${bookingNumber}`;
  const secondEarningsDescription =
    input.descriptions?.providerEarnings ??
    `Provider earnings (charge 2) for booking ${bookingNumber}`;

  if (!existingPaymentTxForRef) {
    const paymentTxRow: Record<string, unknown> = {
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
    };
    if (input.paymentTransactionType) {
      paymentTxRow.transaction_type = input.paymentTransactionType;
    }
    const { error: paymentTxInsertError } = await supabase
      .from("payment_transactions")
      .insert(paymentTxRow);

    if (paymentTxInsertError) {
      if (paymentTxInsertError.code === "23505") {
        return { ok: true, skipped: true, isSecondCharge };
      }
      return { ok: false, reason: "insert_failed", error: paymentTxInsertError };
    }
  }

  if (!isSecondCharge) {
    await supabase.from("finance_transactions").insert(
      withSourcePaymentId(
        {
          booking_id: input.bookingId,
          provider_id: bookingData.provider_id ?? null,
          tenant_id: financeTenantId,
          transaction_type: "payment",
          amount: commissionBase,
          fees: feesInCurrency,
          commission: platformCommission,
          net: platformCommission,
          description: paymentDescription,
          created_at: webhookNow,
        },
        sourcePaymentId,
      ),
    );

    await supabase.from("finance_transactions").insert(
      withSourcePaymentId(
        {
          booking_id: input.bookingId,
          provider_id: bookingData.provider_id ?? null,
          tenant_id: financeTenantId,
          transaction_type: "provider_earnings",
          amount: providerEarnings,
          fees: 0,
          commission: 0,
          net: providerEarnings,
          description: earningsDescription,
          created_at: webhookNow,
        },
        sourcePaymentId,
      ),
    );

    if (postBookingLevelFees && serviceFeeAmount > 0) {
      await supabase.from("finance_transactions").insert(
        withSourcePaymentId(
          {
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
          },
          sourcePaymentId,
        ),
      );
    }

    if (postBookingLevelFees) {
      await supabase.from("finance_transactions").insert(
        [
          ...(tipAmount > 0
            ? [
                withSourcePaymentId(
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
                  sourcePaymentId,
                ),
              ]
            : []),
          ...(taxAmount > 0
            ? [
                withSourcePaymentId(
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
                  sourcePaymentId,
                ),
              ]
            : []),
          ...(travelFee > 0
            ? [
                withSourcePaymentId(
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
                  sourcePaymentId,
                ),
              ]
            : []),
        ],
      );
    }
  } else {
    await supabase.from("finance_transactions").insert([
      withSourcePaymentId(
        {
          booking_id: input.bookingId,
          provider_id: bookingData.provider_id ?? null,
          tenant_id: financeTenantId,
          transaction_type: "payment",
          amount: commissionBase,
          fees: feesInCurrency,
          commission: platformCommission,
          net: platformCommission,
          description: secondPaymentDescription,
          created_at: webhookNow,
        },
        sourcePaymentId,
      ),
      withSourcePaymentId(
        {
          booking_id: input.bookingId,
          provider_id: bookingData.provider_id ?? null,
          tenant_id: financeTenantId,
          transaction_type: "provider_earnings",
          amount: providerEarnings,
          fees: 0,
          commission: 0,
          net: providerEarnings,
          description: secondEarningsDescription,
          created_at: webhookNow,
        },
        sourcePaymentId,
      ),
    ]);

    const { data: existingBookingLevelRows } = await supabase
      .from("finance_transactions")
      .select("transaction_type")
      .eq("booking_id", input.bookingId)
      .in("transaction_type", ["tip", "tax", "travel_fee", "platform_fee", "service_fee"]);
    const existingTypes = new Set(
      ((existingBookingLevelRows ?? []) as Array<{ transaction_type?: string }>).map((r) =>
        String(r.transaction_type ?? ""),
      ),
    );
    const deferred: Array<Record<string, unknown>> = [];
    if (serviceFeeAmount > 0 && !platformFeeAlreadyPosted(existingTypes)) {
      deferred.push(
        withSourcePaymentId(
          {
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
          },
          sourcePaymentId,
        ),
      );
    }
    if (tipAmount > 0 && !existingTypes.has("tip")) {
      deferred.push(
        withSourcePaymentId(
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
          sourcePaymentId,
        ),
      );
    }
    if (taxAmount > 0 && !existingTypes.has("tax")) {
      deferred.push(
        withSourcePaymentId(
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
          sourcePaymentId,
        ),
      );
    }
    if (travelFee > 0 && !existingTypes.has("travel_fee")) {
      deferred.push(
        withSourcePaymentId(
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
          sourcePaymentId,
        ),
      );
    }
    if (deferred.length > 0) {
      await supabase.from("finance_transactions").insert(deferred);
    }
  }

  const attachSourceForAudit = auditLegStyle === "shared";
  const dedupeScope =
    auditLegStyle === "paystack_pay_remaining" ? "booking_and_reference" : "booking";

  await postBookingAuditLedgerLegsIfMissing(supabase, {
    bookingId: input.bookingId,
    providerId: bookingData.provider_id ?? null,
    tenantId: financeTenantId,
    bookingNumber,
    sourcePaymentId,
    walletAmount: walletAmountFromMeta,
    giftCardAmount: giftCardAmountFromMeta,
    promotionDiscount: Number(bookingData.promotion_discount_amount ?? 0),
    membershipDiscount: Number(bookingData.membership_discount_amount ?? 0),
    loyaltyDiscount: Number(bookingData.loyalty_discount_amount ?? 0),
    createdAt: webhookNow,
    descriptionStyle: auditLegStyle,
    attachSourcePaymentId: attachSourceForAudit,
    dedupeScope,
    reference: input.reference,
  });

  return { ok: true, skipped: false, isSecondCharge };
}
